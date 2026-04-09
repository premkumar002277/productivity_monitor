import { EventType, Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma";
import { AppError } from "../lib/http";
import { emitToAdmins } from "../lib/socket";
import { clearAlertBreach, evaluateAlert, resolveOpenAlerts } from "./alerts";
import { deleteLiveScore, writeLiveScore } from "./liveScore";
import { computeSessionMetrics } from "./scorer";

type AuthenticatedUser = NonNullable<Express.Request["user"]>;

type IncomingEvent = {
  type: EventType;
  timestamp: Date;
  value?: Prisma.JsonValue;
};

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
    isMonitoring: true,
    updatedAt: new Date().toISOString(),
  };
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

  if (user.role !== "ADMIN" && session.userId !== user.id) {
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

  if (events.length > 0) {
    await prisma.event.createMany({
      data: events.map((event) => ({
        sessionId,
        type: event.type,
        timestamp: event.timestamp,
        value: event.value === undefined ? null : (event.value as Prisma.InputJsonValue),
      })),
    });
  }

  const allEvents = await prisma.event.findMany({
    where: { sessionId },
    orderBy: {
      timestamp: "asc",
    },
  });

  const metrics = computeSessionMetrics(session, allEvents, new Date());

  await prisma.session.update({
    where: { id: sessionId },
    data: {
      faceSeconds: metrics.faceSeconds,
      idleSeconds: metrics.idleSeconds,
      activeSeconds: metrics.activeSeconds,
      finalScore: metrics.score,
    },
  });

  const livePayload = toLivePayload(user, sessionId, metrics);
  await writeLiveScore(livePayload);

  await evaluateAlert({
    userId: user.id,
    name: user.name,
    department: user.department,
    sessionId,
    metrics,
  });

  emitToAdmins("score:update", livePayload);

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
          name: true,
          email: true,
          department: true,
        },
      },
    },
  });

  if (!session) {
    throw new AppError(404, "Session not found");
  }

  if (session.userId !== user.id && user.role !== "ADMIN") {
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
  await resolveOpenAlerts(updatedSession.userId);

  emitToAdmins("score:update", {
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
