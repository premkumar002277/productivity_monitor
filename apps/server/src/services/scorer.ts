import { EventType } from "@prisma/client";

export type SessionMetrics = {
  totalSeconds: number;
  faceSeconds: number;
  idleSeconds: number;
  activeSeconds: number;
  nonIdleSeconds: number;
  score: number;
  status: "active" | "idle" | "away";
};

type SessionLike = {
  startedAt: Date;
  endedAt: Date | null;
};

type EventLike = {
  type: EventType;
  timestamp: Date;
};

function scoreToStatus(score: number): SessionMetrics["status"] {
  if (score >= 70) {
    return "active";
  }

  if (score >= 45) {
    return "idle";
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
  }
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

  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round((faceSeconds / totalSeconds) * 50 + (activeSeconds / totalSeconds) * 30 + (nonIdleSeconds / totalSeconds) * 20),
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
  };
}

export function scoreToProductivityStatus(score: number): SessionMetrics["status"] {
  return scoreToStatus(score);
}
