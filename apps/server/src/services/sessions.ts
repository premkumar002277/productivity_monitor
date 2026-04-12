import { EventType, Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma";
import { AppError } from "../lib/http";
import { emitToAdmin } from "../lib/socket";
import { clearAlertBreach, evaluateAlert, resolveOpenAlerts } from "./alerts";
import {
  normalizeHeadPoseValue,
  normalizeKeyboardBehaviorValue,
  normalizeMouseBehaviorValue,
  type KeyboardBehaviorValue,
  type MouseBehaviorValue,
} from "./behaviorScorer";
import { toEmotionSampleRecord } from "./emotionScorer";
import { deleteLiveScore, writeLiveScore } from "./liveScore";
import { computeSessionMetrics } from "./scorer";

type AuthenticatedUser = NonNullable<Express.Request["user"]>;

type IncomingEvent = {
  type: EventType;
  timestamp: Date;
  value?: unknown;
};

type BehaviorBucket = {
  timestamp: Date;
  mouse: MouseBehaviorValue | null;
  keyboard: KeyboardBehaviorValue | null;
};

function toDecimal(value: number, fractionDigits = 3) {
  return new Prisma.Decimal(value.toFixed(fractionDigits));
}

function getAdminOwnerId(user: AuthenticatedUser) {
  return user.role === "ADMIN" ? user.id : user.createdByAdminId;
}

function toLivePayload(user: AuthenticatedUser, sessionId: string, metrics: ReturnType<typeof computeSessionMetrics>) {
  return {
    userId: user.id,
    sessionId,
    name: user.name,
    email: user.email,
    department: user.department,
    score: metrics.score,
    status: metrics.status,
    faceSeconds: metrics.faceSeconds,
    idleSeconds: metrics.idleSeconds,
    activeSeconds: metrics.activeSeconds,
    totalSeconds: metrics.totalSeconds,
    emotion: metrics.emotion,
    behavior: metrics.behavior,
    isMonitoring: true,
    updatedAt: new Date().toISOString(),
  };
}

function buildEmotionRows(sessionId: string, events: IncomingEvent[]) {
  return events
    .filter((event) => event.type === EventType.EMOTION_SAMPLE)
    .map((event) => toEmotionSampleRecord(event.timestamp, event.value))
    .filter((sample): sample is NonNullable<ReturnType<typeof toEmotionSampleRecord>> => sample !== null)
    .map((sample) => ({
      sessionId,
      timestamp: sample.timestamp,
      dominant: sample.dominant,
      happyScore: toDecimal(sample.scores.happy),
      sadScore: toDecimal(sample.scores.sad),
      angryScore: toDecimal(sample.scores.angry),
      fearfulScore: toDecimal(sample.scores.fearful),
      disgustedScore: toDecimal(sample.scores.disgusted),
      surprisedScore: toDecimal(sample.scores.surprised),
      neutralScore: toDecimal(sample.scores.neutral),
      stressScore: sample.stressScore,
      engagementScore: sample.engagementScore,
      boredomScore: sample.boredomScore,
    }));
}

function buildHeadPoseRows(sessionId: string, events: IncomingEvent[]) {
  type HeadPoseRow = {
    sessionId: string;
    timestamp: Date;
    yaw: Prisma.Decimal;
    pitch: Prisma.Decimal;
    roll: Prisma.Decimal;
    lookingAway: boolean;
  };

  return events
    .filter((event) => event.type === EventType.HEAD_POSE_SAMPLE)
    .map((event) => {
      const sample = normalizeHeadPoseValue(event.value);

      if (!sample) {
        return null;
      }

      return {
        sessionId,
        timestamp: event.timestamp,
        yaw: toDecimal(sample.yaw),
        pitch: toDecimal(sample.pitch),
        roll: toDecimal(sample.roll),
        lookingAway: sample.lookingAway,
      };
    })
    .filter((sample): sample is HeadPoseRow => sample !== null);
}

function buildBehaviorBuckets(events: IncomingEvent[]) {
  const buckets = new Map<number, BehaviorBucket>();

  for (const event of events) {
    if (event.type !== EventType.MOUSE_BEHAVIOR && event.type !== EventType.KEYBOARD_BEHAVIOR) {
      continue;
    }

    const bucketKey = Math.floor(event.timestamp.getTime() / 5_000);
    const existing = buckets.get(bucketKey) ?? {
      timestamp: event.timestamp,
      mouse: null,
      keyboard: null,
    };

    if (event.timestamp.getTime() > existing.timestamp.getTime()) {
      existing.timestamp = event.timestamp;
    }

    if (event.type === EventType.MOUSE_BEHAVIOR) {
      existing.mouse = normalizeMouseBehaviorValue(event.value);
    }

    if (event.type === EventType.KEYBOARD_BEHAVIOR) {
      existing.keyboard = normalizeKeyboardBehaviorValue(event.value);
    }

    buckets.set(bucketKey, existing);
  }

  return Array.from(buckets.values()).sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());
}

function buildBehaviorRows(sessionId: string, events: IncomingEvent[]) {
  return buildBehaviorBuckets(events).map((bucket) => ({
    sessionId,
    timestamp: bucket.timestamp,
    avgVelocityPx: bucket.mouse?.avgVelocityPx ?? 0,
    clicksPerMin: bucket.mouse?.clicksPerMin ?? 0,
    erraticScore: toDecimal(bucket.mouse?.erraticScore ?? 0),
    kpm: bucket.keyboard?.kpm ?? 0,
    rhythmScore: toDecimal(bucket.keyboard?.rhythmScore ?? 0),
    backspaceRate: toDecimal(bucket.keyboard?.backspaceRate ?? 0),
    burstDetected: bucket.keyboard?.burstDetected ?? false,
    idleSeconds: bucket.mouse?.idleSeconds ?? 0,
  }));
}

export async function startSession(user: AuthenticatedUser) {
  const existingSession = await prisma.session.findFirst({
    where: {
      userId: user.id,
      endedAt: null,
    },
    orderBy: {
      startedAt: "desc",
    },
  });

  if (existingSession) {
    return existingSession;
  }

  return prisma.session.create({
    data: {
      userId: user.id,
    },
  });
}

export async function getActiveSession(userId: string) {
  return prisma.session.findFirst({
    where: {
      userId,
      endedAt: null,
    },
    orderBy: {
      startedAt: "desc",
    },
  });
}

export async function getSessionForUser(sessionId: string, user: AuthenticatedUser) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      user: {
        select: {
          createdByAdminId: true,
        },
      },
      events: {
        orderBy: {
          timestamp: "asc",
        },
      },
    },
  });

  if (!session) {
    throw new AppError(404, "Session not found");
  }

  if (user.role === "ADMIN") {
    if (session.userId !== user.id && session.user.createdByAdminId !== user.id) {
      throw new AppError(403, "You cannot access this session");
    }
  } else if (session.userId !== user.id) {
    throw new AppError(403, "You cannot access this session");
  }

  return {
    id: session.id,
    userId: session.userId,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    finalScore: session.finalScore,
    faceSeconds: session.faceSeconds,
    activeSeconds: session.activeSeconds,
    idleSeconds: session.idleSeconds,
    events: session.events.map((event) => ({
      id: event.id.toString(),
      type: event.type,
      timestamp: event.timestamp.toISOString(),
      value: event.value,
    })),
  };
}

export async function persistEventBatch(user: AuthenticatedUser, sessionId: string, events: IncomingEvent[]) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    throw new AppError(404, "Session not found");
  }

  if (session.userId !== user.id) {
    throw new AppError(403, "This session does not belong to you");
  }

  if (session.endedAt) {
    throw new AppError(400, "Cannot append events to a closed session");
  }

  const emotionRows = buildEmotionRows(sessionId, events);
  const headPoseRows = buildHeadPoseRows(sessionId, events);
  const behaviorRows = buildBehaviorRows(sessionId, events);

  const metrics = await prisma.$transaction(async (tx) => {
    if (events.length > 0) {
      await tx.event.createMany({
        data: events.map((event) => ({
          sessionId,
          type: event.type,
          timestamp: event.timestamp,
          ...(event.value === undefined ? {} : { value: event.value as Prisma.InputJsonValue }),
        })),
      });
    }

    if (emotionRows.length > 0) {
      await tx.emotionSample.createMany({ data: emotionRows });
    }

    if (headPoseRows.length > 0) {
      await tx.headPoseSample.createMany({ data: headPoseRows });
    }

    if (behaviorRows.length > 0) {
      await tx.behaviorSample.createMany({ data: behaviorRows });
    }

    const allEvents = await tx.event.findMany({
      where: { sessionId },
      orderBy: {
        timestamp: "asc",
      },
    });

    const nextMetrics = computeSessionMetrics(session, allEvents, new Date());

    await tx.session.update({
      where: { id: sessionId },
      data: {
        faceSeconds: nextMetrics.faceSeconds,
        idleSeconds: nextMetrics.idleSeconds,
        activeSeconds: nextMetrics.activeSeconds,
        finalScore: nextMetrics.score,
      },
    });

    return nextMetrics;
  });

  const livePayload = toLivePayload(user, sessionId, metrics);
  await writeLiveScore(livePayload);
  const adminId = getAdminOwnerId(user);

  await evaluateAlert({
    userId: user.id,
    adminId,
    name: user.name,
    department: user.department,
    sessionId,
    metrics,
  });

  emitToAdmin(adminId, "score:update", livePayload);

  if (metrics.emotion.updatedAt) {
    emitToAdmin(adminId, "emotion:update", {
      userId: user.id,
      sessionId,
      dominant: metrics.emotion.dominant,
      stressScore: metrics.emotion.stressScore,
      engagementScore: metrics.emotion.engagementScore,
      boredomScore: metrics.emotion.boredomScore,
      scores: metrics.emotion.scores,
      updatedAt: metrics.emotion.updatedAt,
    });
  }

  if (headPoseRows.length > 0) {
    emitToAdmin(adminId, "headpose:update", {
      userId: user.id,
      sessionId,
      lookingAway: metrics.behavior.lookingAway,
      lookingAwaySeconds: metrics.behavior.lookingAwaySeconds,
      yaw: metrics.behavior.yaw,
      pitch: metrics.behavior.pitch,
      roll: metrics.behavior.roll,
      updatedAt: metrics.behavior.updatedAt,
    });
  }

  if (behaviorRows.length > 0) {
    emitToAdmin(adminId, "behavior:update", {
      userId: user.id,
      sessionId,
      erraticScore: metrics.behavior.erraticScore,
      rhythmScore: metrics.behavior.rhythmScore,
      avgVelocityPx: metrics.behavior.avgVelocityPx,
      clicksPerMin: metrics.behavior.clicksPerMin,
      idleSeconds: metrics.behavior.idleSeconds,
      kpm: metrics.behavior.kpm,
      backspaceRate: metrics.behavior.backspaceRate,
      burstDetected: metrics.behavior.burstDetected,
      updatedAt: metrics.behavior.updatedAt,
    });
  }

  return {
    sessionId,
    metrics,
  };
}

export async function stopSession(user: AuthenticatedUser, sessionId: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          department: true,
          createdByAdminId: true,
        },
      },
    },
  });

  if (!session) {
    throw new AppError(404, "Session not found");
  }

  if (user.role === "ADMIN") {
    if (session.userId !== user.id && session.user.createdByAdminId !== user.id) {
      throw new AppError(403, "You cannot stop this session");
    }
  } else if (session.userId !== user.id) {
    throw new AppError(403, "You cannot stop this session");
  }

  const endedAt = session.endedAt ?? new Date();

  await prisma.session.update({
    where: { id: sessionId },
    data: {
      endedAt,
    },
  });

  const allEvents = await prisma.event.findMany({
    where: { sessionId },
    orderBy: {
      timestamp: "asc",
    },
  });

  const metrics = computeSessionMetrics(
    {
      startedAt: session.startedAt,
      endedAt,
    },
    allEvents,
    endedAt,
  );

  const updatedSession = await prisma.session.update({
    where: { id: sessionId },
    data: {
      faceSeconds: metrics.faceSeconds,
      idleSeconds: metrics.idleSeconds,
      activeSeconds: metrics.activeSeconds,
      finalScore: metrics.score,
    },
  });

  await deleteLiveScore(updatedSession.userId);
  await clearAlertBreach(updatedSession.userId);
  const adminId = session.user.createdByAdminId ?? (user.role === "ADMIN" && session.userId === user.id ? user.id : null);
  await resolveOpenAlerts(updatedSession.userId, adminId);

  emitToAdmin(adminId, "score:update", {
    userId: updatedSession.userId,
    sessionId: updatedSession.id,
    name: session.user.name,
    email: session.user.email,
    department: session.user.department,
    score: metrics.score,
    status: metrics.status,
    faceSeconds: metrics.faceSeconds,
    idleSeconds: metrics.idleSeconds,
    activeSeconds: metrics.activeSeconds,
    totalSeconds: metrics.totalSeconds,
    emotion: metrics.emotion,
    behavior: metrics.behavior,
    isMonitoring: false,
    updatedAt: endedAt.toISOString(),
  });

  return {
    id: updatedSession.id,
    endedAt: updatedSession.endedAt?.toISOString() ?? null,
    finalScore: updatedSession.finalScore,
    faceSeconds: updatedSession.faceSeconds,
    activeSeconds: updatedSession.activeSeconds,
    idleSeconds: updatedSession.idleSeconds,
  };
}
