import { Role } from "@prisma/client";

import { prisma } from "../lib/prisma";
import { getAlertSettings } from "./alerts";
import { readLiveScores } from "./liveScore";
import { scoreToProductivityStatus } from "./scorer";

export async function getEmployeeDashboard(filters: { department?: string; search?: string }) {
  const where = {
    role: Role.EMPLOYEE,
    ...(filters.department ? { department: filters.department } : {}),
    ...(filters.search
      ? {
          OR: [{ name: { contains: filters.search } }, { email: { contains: filters.search } }],
        }
      : {}),
  };

  const users = await prisma.user.findMany({
    where,
    orderBy: [{ department: "asc" }, { name: "asc" }],
  });

  const userIds = users.map((user) => user.id);
  const [liveScores, activeSessions, latestSessions, alerts, settings] = await Promise.all([
    readLiveScores(userIds),
    prisma.session.findMany({
      where: {
        userId: { in: userIds },
        endedAt: null,
      },
      orderBy: {
        startedAt: "desc",
      },
    }),
    prisma.session.findMany({
      where: {
        userId: { in: userIds },
      },
      orderBy: {
        startedAt: "desc",
      },
    }),
    prisma.alert.findMany({
      where: {
        userId: { in: userIds },
        resolved: false,
      },
      orderBy: {
        triggeredAt: "desc",
      },
    }),
    getAlertSettings(),
  ]);

  const activeSessionByUser = new Map<string, (typeof activeSessions)[number]>();
  const latestSessionByUser = new Map<string, (typeof latestSessions)[number]>();
  const alertByUser = new Map<string, (typeof alerts)[number]>();

  for (const session of activeSessions) {
    if (!activeSessionByUser.has(session.userId)) {
      activeSessionByUser.set(session.userId, session);
    }
  }

  for (const session of latestSessions) {
    if (!latestSessionByUser.has(session.userId)) {
      latestSessionByUser.set(session.userId, session);
    }
  }

  for (const alert of alerts) {
    if (!alertByUser.has(alert.userId)) {
      alertByUser.set(alert.userId, alert);
    }
  }

  const employees = users.map((user) => {
    const liveScore = liveScores.get(user.id);
    const activeSession = activeSessionByUser.get(user.id);
    const latestSession = latestSessionByUser.get(user.id);
    const currentSession = activeSession ?? latestSession;
    const currentScore = liveScore?.score ?? currentSession?.finalScore ?? 0;
    const alert = alertByUser.get(user.id);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      department: user.department,
      isMonitoring: Boolean(activeSession),
      sessionId: currentSession?.id ?? null,
      startedAt: currentSession?.startedAt.toISOString() ?? null,
      updatedAt: liveScore?.updatedAt ?? currentSession?.startedAt.toISOString() ?? null,
      score: currentScore,
      status: liveScore?.status ?? scoreToProductivityStatus(currentScore),
      faceSeconds: liveScore?.faceSeconds ?? currentSession?.faceSeconds ?? 0,
      activeSeconds: liveScore?.activeSeconds ?? currentSession?.activeSeconds ?? 0,
      idleSeconds: liveScore?.idleSeconds ?? currentSession?.idleSeconds ?? 0,
      alert: alert
        ? {
            id: alert.id,
            reason: alert.reason,
            triggeredAt: alert.triggeredAt.toISOString(),
          }
        : null,
    };
  });

  const departmentMap = new Map<
    string,
    {
      totalScore: number;
      count: number;
      activeEmployees: number;
    }
  >();

  for (const employee of employees) {
    const department = employee.department ?? "Unassigned";
    const entry = departmentMap.get(department) ?? {
      totalScore: 0,
      count: 0,
      activeEmployees: 0,
    };

    entry.totalScore += employee.score;
    entry.count += 1;
    entry.activeEmployees += employee.isMonitoring ? 1 : 0;
    departmentMap.set(department, entry);
  }

  const departmentAverages = Array.from(departmentMap.entries()).map(([department, summary]) => ({
    department,
    averageScore: Math.round(summary.totalScore / Math.max(1, summary.count)),
    employeeCount: summary.count,
    activeEmployees: summary.activeEmployees,
  }));

  return {
    employees,
    departmentAverages,
    settings,
  };
}

export async function getSessionTimeline(sessionId: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          department: true,
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
    return null;
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
    user: session.user,
    events: session.events.map((event) => ({
      id: event.id.toString(),
      type: event.type,
      timestamp: event.timestamp.toISOString(),
      value: event.value,
    })),
  };
}
