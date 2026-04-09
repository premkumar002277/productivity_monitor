import { EventType } from "@prisma/client";

import {
  computeBehaviorContribution,
  normalizeHeadPoseValue,
  normalizeKeyboardBehaviorValue,
  normalizeMouseBehaviorValue,
  summarizeBehaviorSignals,
  type HeadPoseRecord,
  type KeyboardBehaviorRecord,
  type MouseBehaviorRecord,
} from "./behaviorScorer";
import { summarizeEmotionSamples, toEmotionSampleRecord } from "./emotionScorer";

export type ProductivityStatus = "active" | "idle" | "low" | "away";

export type SessionMetrics = {
  totalSeconds: number;
  faceSeconds: number;
  idleSeconds: number;
  activeSeconds: number;
  nonIdleSeconds: number;
  score: number;
  status: ProductivityStatus;
  emotion: {
    dominant: ReturnType<typeof summarizeEmotionSamples>["dominant"];
    scores: ReturnType<typeof summarizeEmotionSamples>["scores"];
    stressScore: number;
    engagementScore: number;
    boredomScore: number;
    updatedAt: string | null;
  };
  behavior: ReturnType<typeof summarizeBehaviorSignals>;
};

type SessionLike = {
  startedAt: Date;
  endedAt: Date | null;
};

type EventLike = {
  type: EventType;
  timestamp: Date;
  value?: unknown;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function scoreToStatus(score: number): ProductivityStatus {
  if (score >= 75) {
    return "active";
  }

  if (score >= 50) {
    return "idle";
  }

  if (score >= 25) {
    return "low";
  }

  return "away";
}

function applyEventState(
  eventType: EventType,
  currentState: { faceDetected: boolean; tabFocused: boolean; idle: boolean },
) {
  switch (eventType) {
    case EventType.FACE_DETECTED:
      currentState.faceDetected = true;
      return;
    case EventType.FACE_LOST:
      currentState.faceDetected = false;
      return;
    case EventType.TAB_FOCUS:
      currentState.tabFocused = true;
      return;
    case EventType.TAB_BLUR:
      currentState.tabFocused = false;
      return;
    case EventType.IDLE_START:
      currentState.idle = true;
      return;
    case EventType.IDLE_END:
      currentState.idle = false;
      return;
    case EventType.EMOTION_SAMPLE:
    case EventType.HEAD_POSE_SAMPLE:
    case EventType.MOUSE_BEHAVIOR:
    case EventType.KEYBOARD_BEHAVIOR:
      return;
  }
}

function collectSignalSamples(events: EventLike[]) {
  const emotionSamples = [];
  const headPoseSamples: HeadPoseRecord[] = [];
  const mouseSamples: MouseBehaviorRecord[] = [];
  const keyboardSamples: KeyboardBehaviorRecord[] = [];

  for (const event of events) {
    if (event.type === EventType.EMOTION_SAMPLE) {
      const sample = toEmotionSampleRecord(event.timestamp, event.value);

      if (sample) {
        emotionSamples.push(sample);
      }

      continue;
    }

    if (event.type === EventType.HEAD_POSE_SAMPLE) {
      const sample = normalizeHeadPoseValue(event.value);

      if (sample) {
        headPoseSamples.push({
          timestamp: event.timestamp,
          ...sample,
        });
      }

      continue;
    }

    if (event.type === EventType.MOUSE_BEHAVIOR) {
      const sample = normalizeMouseBehaviorValue(event.value);

      if (sample) {
        mouseSamples.push({
          timestamp: event.timestamp,
          ...sample,
        });
      }

      continue;
    }

    if (event.type === EventType.KEYBOARD_BEHAVIOR) {
      const sample = normalizeKeyboardBehaviorValue(event.value);

      if (sample) {
        keyboardSamples.push({
          timestamp: event.timestamp,
          ...sample,
        });
      }
    }
  }

  return {
    emotionSamples,
    headPoseSamples,
    mouseSamples,
    keyboardSamples,
  };
}

export function computeSessionMetrics(
  session: SessionLike,
  events: EventLike[],
  fallbackEnd = new Date(),
): SessionMetrics {
  const endTime = session.endedAt ?? fallbackEnd;
  const orderedEvents = [...events].sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());

  const state = {
    faceDetected: false,
    tabFocused: true,
    idle: false,
  };

  let cursor = session.startedAt.getTime();
  let faceMs = 0;
  let activeMs = 0;
  let idleMs = 0;

  const accumulate = (nextTimestamp: number) => {
    const delta = Math.max(0, nextTimestamp - cursor);

    if (state.faceDetected) {
      faceMs += delta;
    }

    if (state.tabFocused) {
      activeMs += delta;
    }

    if (state.idle) {
      idleMs += delta;
    }

    cursor = nextTimestamp;
  };

  for (const event of orderedEvents) {
    const eventTimestamp = Math.min(Math.max(event.timestamp.getTime(), cursor), endTime.getTime());
    accumulate(eventTimestamp);
    applyEventState(event.type, state);
  }

  accumulate(endTime.getTime());

  const totalMs = Math.max(0, endTime.getTime() - session.startedAt.getTime());
  const totalSeconds = Math.max(1, Math.round(totalMs / 1000));
  const faceSeconds = Math.round(faceMs / 1000);
  const activeSeconds = Math.round(activeMs / 1000);
  const idleSeconds = Math.round(idleMs / 1000);
  const nonIdleSeconds = Math.max(0, totalSeconds - idleSeconds);

  const { emotionSamples, headPoseSamples, mouseSamples, keyboardSamples } = collectSignalSamples(orderedEvents);
  const emotionSummary = summarizeEmotionSamples(emotionSamples);
  const behaviorSummary = summarizeBehaviorSignals({
    headPoseSamples,
    mouseSamples,
    keyboardSamples,
  });
  const behaviorContribution = computeBehaviorContribution({
    headPoseSamples,
    mouseSamples,
    keyboardSamples,
  });

  const baseScore =
    (faceSeconds / totalSeconds) * 35 +
    (activeSeconds / totalSeconds) * 20 +
    (nonIdleSeconds / totalSeconds) * 15;

  const score = Math.round(
    clamp(
      baseScore +
        emotionSummary.engagementScore * 0.15 -
        emotionSummary.stressScore * 0.1 +
        behaviorContribution.bonus -
        behaviorContribution.penalty,
      0,
      100,
    ),
  );

  return {
    totalSeconds,
    faceSeconds,
    idleSeconds,
    activeSeconds,
    nonIdleSeconds,
    score,
    status: scoreToStatus(score),
    emotion: {
      dominant: emotionSummary.dominant,
      scores: emotionSummary.scores,
      stressScore: emotionSummary.stressScore,
      engagementScore: emotionSummary.engagementScore,
      boredomScore: emotionSummary.boredomScore,
      updatedAt: emotionSummary.updatedAt,
    },
    behavior: behaviorSummary,
  };
}

export function scoreToProductivityStatus(score: number): SessionMetrics["status"] {
  return scoreToStatus(score);
}
