import { useCallback, useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";

import { FACE_MODEL_URL } from "../env";
import type {
  BehaviorSnapshot,
  EmotionSnapshot,
  EventBatchResult,
  HeadPoseSampleValue,
  KeyboardBehaviorValue,
  MonitoringEventType,
  MouseBehaviorValue,
} from "../types/api";
import { buildEmotionSample, createEmptyEmotionScores, deriveEmotionMetrics } from "./useEmotionDetector";
import { estimateHeadPose } from "./useHeadPoseEstimator";
import { useKeyboardBehavior } from "./useKeyboardBehavior";
import { useMouseBehavior } from "./useMouseBehavior";

type ApiFetch = <T>(path: string, options?: RequestInit & { auth?: boolean }) => Promise<T>;

type EventDraft = {
  type: MonitoringEventType;
  timestamp: string;
  value?: unknown;
};

type UseEmployeeMonitorParams = {
  enabled: boolean;
  sessionId: string | null;
  apiFetch: ApiFetch;
};

type CameraStatus = "idle" | "requesting" | "ready" | "error";

const EMPTY_EMOTION_STATE: EmotionSnapshot = {
  dominant: null,
  scores: createEmptyEmotionScores(),
  stressScore: 0,
  engagementScore: 0,
  boredomScore: 0,
  updatedAt: null,
};

const EMPTY_BEHAVIOR_STATE: BehaviorSnapshot = {
  yaw: 0,
  pitch: 0,
  roll: 0,
  lookingAway: false,
  lookingAwaySeconds: 0,
  headAwayRatio: 0,
  avgVelocityPx: 0,
  clicksPerMin: 0,
  erraticScore: 0,
  idleSeconds: 0,
  kpm: 0,
  rhythmScore: 0,
  backspaceRate: 0,
  burstDetected: false,
  updatedAt: null,
};

function areFaceModelsLoaded() {
  return (
    faceapi.nets.tinyFaceDetector.isLoaded &&
    faceapi.nets.faceLandmark68Net.isLoaded &&
    faceapi.nets.faceExpressionNet.isLoaded
  );
}

function createEvent(type: MonitoringEventType, value?: unknown): EventDraft {
  return {
    type,
    timestamp: new Date().toISOString(),
    ...(value !== undefined ? { value } : {}),
  };
}

function getCameraErrorDetails(cameraError: unknown) {
  if (cameraError instanceof DOMException) {
    return {
      name: cameraError.name,
      message: cameraError.message,
    };
  }

  if (cameraError instanceof Error) {
    return {
      name: cameraError.name,
      message: cameraError.message,
    };
  }

  return {
    name: "UnknownError",
    message: "An unknown camera error occurred.",
  };
}

function getCameraErrorMessage(cameraError: unknown) {
  const { name, message } = getCameraErrorDetails(cameraError);

  switch (name) {
    case "NotAllowedError":
      return "Camera access was denied. Monitoring cannot start without consent.";
    case "NotFoundError":
      return "No camera device was found on this machine.";
    case "NotReadableError":
      return "The camera is already in use by another application.";
    default:
      return `Camera error (${name}): ${message}`;
  }
}

export function useEmployeeMonitor({ enabled, sessionId, apiFetch }: UseEmployeeMonitorParams) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraRequestRef = useRef<Promise<MediaStream | null> | null>(null);
  const queueRef = useRef<EventDraft[]>([]);
  const syncInFlightRef = useRef(false);
  const [queueSize, setQueueSize] = useState(0);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");
  const [faceModelStatus, setFaceModelStatus] = useState<"idle" | "ready" | "unavailable">("idle");
  const [error, setError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [serverMetrics, setServerMetrics] = useState<EventBatchResult["metrics"] | null>(null);
  const [signalState, setSignalState] = useState({
    faceDetected: false,
    tabFocused: typeof document === "undefined" ? true : !document.hidden,
    idle: false,
    confidence: null as number | null,
  });
  const [emotionState, setEmotionState] = useState<EmotionSnapshot>(EMPTY_EMOTION_STATE);
  const [headPoseState, setHeadPoseState] = useState<(HeadPoseSampleValue & { updatedAt: string | null })>({
    yaw: 0,
    pitch: 0,
    roll: 0,
    lookingAway: false,
    updatedAt: null,
  });

  const { summary: mouseState, flushSummary: flushMouseBehavior } = useMouseBehavior(Boolean(enabled && sessionId));
  const { summary: keyboardState, flushSummary: flushKeyboardBehavior } = useKeyboardBehavior(Boolean(enabled && sessionId));

  const pushEvent = useCallback((type: MonitoringEventType, value?: unknown) => {
    queueRef.current.push(createEvent(type, value));
    setQueueSize(queueRef.current.length);
  }, []);

  const queueBehaviorWindow = useCallback(() => {
    const mouseSummary: MouseBehaviorValue = flushMouseBehavior();
    const keyboardSummary: KeyboardBehaviorValue = flushKeyboardBehavior();
    pushEvent("MOUSE_BEHAVIOR", mouseSummary);
    pushEvent("KEYBOARD_BEHAVIOR", keyboardSummary);
  }, [flushKeyboardBehavior, flushMouseBehavior, pushEvent]);

  const flushQueue = useCallback(async () => {
    if (!sessionId || syncInFlightRef.current) {
      return;
    }

    syncInFlightRef.current = true;
    setIsSyncing(true);
    const pendingEvents = [...queueRef.current];
    queueRef.current = [];
    setQueueSize(0);

    try {
      const result = await apiFetch<EventBatchResult>("/api/events", {
        method: "POST",
        body: JSON.stringify({
          sessionId,
          events: pendingEvents,
        }),
      });

      setServerMetrics(result.metrics);
      setLastSyncAt(new Date().toISOString());
      setError(null);
    } catch (syncError) {
      queueRef.current = [...pendingEvents, ...queueRef.current];
      setQueueSize(queueRef.current.length);
      setError(syncError instanceof Error ? syncError.message : "Failed to sync monitor events.");
    } finally {
      syncInFlightRef.current = false;
      setIsSyncing(false);
    }
  }, [apiFetch, sessionId]);

  const flushNow = useCallback(async () => {
    if (!enabled || !sessionId) {
      return;
    }

    queueBehaviorWindow();
    await flushQueue();
  }, [enabled, flushQueue, queueBehaviorWindow, sessionId]);

  const stopCamera = useCallback((nextStatus: CameraStatus = "idle") => {
    const currentStream = streamRef.current;

    if (currentStream) {
      currentStream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    cameraRequestRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraStatus(nextStatus);
  }, []);

  const attachStreamToVideo = useCallback(async (stream: MediaStream) => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.srcObject = stream;

    try {
      await video.play();
    } catch (playError) {
      console.error("Camera preview error:", playError);
    }
  }, []);

  const requestCameraAccess = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus("error");
      setError("This browser does not support camera capture.");
      return null;
    }

    if (streamRef.current) {
      setError(null);
      await attachStreamToVideo(streamRef.current);
      setCameraStatus("ready");
      return streamRef.current;
    }

    if (cameraRequestRef.current) {
      return cameraRequestRef.current;
    }

    setError(null);
    setCameraStatus("requesting");

    const cameraRequest = navigator.mediaDevices
      .getUserMedia({
        video: {
          width: { ideal: 960 },
          height: { ideal: 540 },
        },
        audio: false,
      })
      .then(async (stream) => {
        streamRef.current = stream;
        cameraRequestRef.current = null;
        await attachStreamToVideo(stream);
        setCameraStatus("ready");
        return stream;
      })
      .catch((cameraError: unknown) => {
        const { name, message } = getCameraErrorDetails(cameraError);

        cameraRequestRef.current = null;
        console.error("Camera error:", name, message);
        setCameraStatus("error");
        setError(getCameraErrorMessage(cameraError));
        return null;
      });

    cameraRequestRef.current = cameraRequest;
    return cameraRequest;
  }, [attachStreamToVideo]);

  const loadFaceModels = useCallback(async () => {
    if (areFaceModelsLoaded()) {
      return;
    }

    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(FACE_MODEL_URL),
      faceapi.nets.faceExpressionNet.loadFromUri(FACE_MODEL_URL),
    ]);
  }, []);

  useEffect(() => {
    if (!enabled || !sessionId) {
      queueRef.current = [];
      setQueueSize(0);
      setCameraStatus("idle");
      setFaceModelStatus("idle");
      setEmotionState(EMPTY_EMOTION_STATE);
      setHeadPoseState({
        yaw: 0,
        pitch: 0,
        roll: 0,
        lookingAway: false,
        updatedAt: null,
      });
      return;
    }

    queueRef.current = [];
    setQueueSize(0);
    let disposed = false;
    let faceInterval: number | undefined;
    let idleInterval: number | undefined;
    let syncInterval: number | undefined;
    let lastActivityAt = Date.now();
    let isIdle = false;
    let facePresent = false;
    let lastFaceSeenAt = 0;

    const handleActivity = () => {
      lastActivityAt = Date.now();

      if (isIdle) {
        isIdle = false;
        setSignalState((current) => ({ ...current, idle: false }));
        pushEvent("IDLE_END");
      }
    };

    const handleVisibilityChange = () => {
      const tabFocused = !document.hidden;
      setSignalState((current) => ({ ...current, tabFocused }));
      pushEvent(tabFocused ? "TAB_FOCUS" : "TAB_BLUR");
    };

    const startFaceDetection = () => {
      faceInterval = window.setInterval(async () => {
        const video = videoRef.current;

        if (!video || video.readyState < 2 || video.paused || video.ended) {
          return;
        }

        if (!areFaceModelsLoaded()) {
          return;
        }

        try {
          const detection = await faceapi
            .detectSingleFace(
              video,
              new faceapi.TinyFaceDetectorOptions({
                inputSize: 224,
                scoreThreshold: 0.6,
              }),
            )
            .withFaceLandmarks()
            .withFaceExpressions();

          if (disposed) {
            return;
          }

          if (detection && detection.detection.score >= 0.6) {
            const detectionTimestamp = new Date().toISOString();
            const confidence = Number(detection.detection.score.toFixed(2));
            const emotionSample = buildEmotionSample(detection.expressions as unknown as Record<string, number>);
            const emotionMetrics = deriveEmotionMetrics(emotionSample.scores);
            const headPoseSample = estimateHeadPose(detection.landmarks.positions, {
              width: detection.detection.box.width,
              height: detection.detection.box.height,
            });

            lastFaceSeenAt = Date.now();
            setSignalState((current) => ({
              ...current,
              faceDetected: true,
              confidence,
            }));
            setEmotionState({
              dominant: emotionSample.dominant,
              scores: emotionSample.scores,
              stressScore: emotionMetrics.stressScore,
              engagementScore: emotionMetrics.engagementScore,
              boredomScore: emotionMetrics.boredomScore,
              updatedAt: detectionTimestamp,
            });
            setHeadPoseState({
              ...headPoseSample,
              updatedAt: detectionTimestamp,
            });

            if (!facePresent) {
              facePresent = true;
              pushEvent("FACE_DETECTED", { confidence });
            }

            pushEvent("EMOTION_SAMPLE", emotionSample);
            pushEvent("HEAD_POSE_SAMPLE", headPoseSample);
            return;
          }

          setSignalState((current) => ({
            ...current,
            confidence: detection ? Number(detection.detection.score.toFixed(2)) : null,
          }));

          if (facePresent && Date.now() - lastFaceSeenAt >= 60_000) {
            facePresent = false;
            setSignalState((current) => ({ ...current, faceDetected: false }));
            pushEvent("FACE_LOST", { reason: "timeout" });
          }
        } catch (detectionError) {
          console.error("Face detection error:", detectionError);
          setFaceModelStatus("unavailable");
          setError("Face models are missing. Add TinyFaceDetector, landmark, and expression files to public/models.");

          if (faceInterval) {
            window.clearInterval(faceInterval);
          }
        }
      }, 2_000);
    };

    const initializeMonitoring = async () => {
      const stream = await requestCameraAccess();

      if (!stream || disposed) {
        if (disposed) {
          stopCamera();
        }

        return;
      }

      try {
        await loadFaceModels();

        if (!disposed) {
          setFaceModelStatus("ready");
          startFaceDetection();
        }
      } catch (modelError) {
        console.error("Face model loading error:", modelError);
        setFaceModelStatus("unavailable");
        setError("Face detection models were not found. Tab, idle, mouse, and keyboard tracking will keep working.");
      }

      document.addEventListener("visibilitychange", handleVisibilityChange);
      window.addEventListener("mousemove", handleActivity, { passive: true });
      window.addEventListener("keydown", handleActivity);

      idleInterval = window.setInterval(() => {
        if (!isIdle && Date.now() - lastActivityAt >= 120_000) {
          isIdle = true;
          setSignalState((current) => ({ ...current, idle: true }));
          pushEvent("IDLE_START");
        }
      }, 1_000);

      syncInterval = window.setInterval(() => {
        queueBehaviorWindow();
        void flushQueue();
      }, 5_000);
    };

    void initializeMonitoring();

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("keydown", handleActivity);

      if (faceInterval) {
        window.clearInterval(faceInterval);
      }

      if (idleInterval) {
        window.clearInterval(idleInterval);
      }

      if (syncInterval) {
        window.clearInterval(syncInterval);
      }

      stopCamera();
    };
  }, [apiFetch, enabled, flushQueue, loadFaceModels, pushEvent, queueBehaviorWindow, requestCameraAccess, sessionId, stopCamera]);

  return {
    videoRef,
    queueSize,
    cameraStatus,
    faceModelStatus,
    error,
    isSyncing,
    lastSyncAt,
    serverMetrics,
    signalState,
    emotionState,
    headPoseState,
    mouseState,
    keyboardState,
    requestCameraAccess,
    stopCamera,
    flushNow,
  };
}
