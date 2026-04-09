import { useCallback, useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";

import { FACE_MODEL_URL } from "../env";
import type { EventBatchResult, MonitoringEventType } from "../types/api";

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

function createEvent(type: MonitoringEventType, value?: unknown): EventDraft {
  return {
    type,
    timestamp: new Date().toISOString(),
    ...(value !== undefined ? { value } : {}),
  };
}

export function useEmployeeMonitor({ enabled, sessionId, apiFetch }: UseEmployeeMonitorParams) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const queueRef = useRef<EventDraft[]>([]);
  const syncInFlightRef = useRef(false);
  const [queueSize, setQueueSize] = useState(0);
  const [cameraStatus, setCameraStatus] = useState<"idle" | "requesting" | "ready" | "error">("idle");
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

  const pushEvent = useCallback((type: MonitoringEventType, value?: unknown) => {
    queueRef.current.push(createEvent(type, value));
    setQueueSize(queueRef.current.length);
  }, []);

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

  useEffect(() => {
    if (!enabled || !sessionId) {
      queueRef.current = [];
      setQueueSize(0);
      setCameraStatus("idle");
      setFaceModelStatus("idle");
      return;
    }

    queueRef.current = [];
    setQueueSize(0);
    let disposed = false;
    let stream: MediaStream | null = null;
    let faceInterval: number | undefined;
    let idleInterval: number | undefined;
    let syncInterval: number | undefined;
    let lastActivityAt = Date.now();
    let isIdle = false;
    let facePresent = false;
    let lastFaceSeenAt = 0;

    const stopStream = () => {
      if (!stream) {
        return;
      }

      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    };

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

        if (!video || video.readyState < 2) {
          return;
        }

        try {
          const detection = await faceapi.detectSingleFace(
            video,
            new faceapi.TinyFaceDetectorOptions({
              inputSize: 224,
              scoreThreshold: 0.6,
            }),
          );

          if (disposed) {
            return;
          }

          if (detection && detection.score >= 0.6) {
            lastFaceSeenAt = Date.now();
            setSignalState((current) => ({
              ...current,
              faceDetected: true,
              confidence: Number(detection.score.toFixed(2)),
            }));

            if (!facePresent) {
              facePresent = true;
              pushEvent("FACE_DETECTED", {
                confidence: Number(detection.score.toFixed(2)),
              });
            }

            return;
          }

          setSignalState((current) => ({
            ...current,
            confidence: detection ? Number(detection.score.toFixed(2)) : null,
          }));

          if (facePresent && Date.now() - lastFaceSeenAt >= 60_000) {
            facePresent = false;
            setSignalState((current) => ({ ...current, faceDetected: false }));
            pushEvent("FACE_LOST", { reason: "timeout" });
          }
        } catch {
          setFaceModelStatus("unavailable");
          setError("Face detection models are missing. Add TinyFaceDetector files to public/models.");

          if (faceInterval) {
            window.clearInterval(faceInterval);
          }
        }
      }, 2_000);
    };

    const startMonitoring = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraStatus("error");
        setError("This browser does not support camera capture.");
        return;
      }

      setError(null);
      setCameraStatus("requesting");

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 960 },
            height: { ideal: 540 },
          },
          audio: false,
        });

        if (disposed) {
          stopStream();
          return;
        }

        const video = videoRef.current;

        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }

        setCameraStatus("ready");
      } catch {
        setCameraStatus("error");
        setError("Camera access was denied. Monitoring cannot start without consent.");
        return;
      }

      try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL);
        if (!disposed) {
          setFaceModelStatus("ready");
          startFaceDetection();
        }
      } catch {
        setFaceModelStatus("unavailable");
        setError("Face detection models were not found. Tab and idle tracking will keep working.");
      }

      document.addEventListener("visibilitychange", handleVisibilityChange);
      window.addEventListener("mousemove", handleActivity);
      window.addEventListener("keydown", handleActivity);

      idleInterval = window.setInterval(() => {
        if (!isIdle && Date.now() - lastActivityAt >= 120_000) {
          isIdle = true;
          setSignalState((current) => ({ ...current, idle: true }));
          pushEvent("IDLE_START");
        }
      }, 1_000);

      syncInterval = window.setInterval(() => {
        void flushQueue();
      }, 5_000);
    };

    void startMonitoring();

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

      stopStream();
    };
  }, [apiFetch, enabled, flushQueue, pushEvent, sessionId]);

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
    flushNow: flushQueue,
  };
}
