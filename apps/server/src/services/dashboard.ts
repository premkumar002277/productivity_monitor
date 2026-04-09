import { Role } from "@prisma/client";

import { prisma } from "../lib/prisma";
import { getAlertSettings } from "./alerts";
import { readLiveScores } from "./liveScore";
import { scoreToProductivityStatus } from "./scorer";

function createEmptyEmotionSnapshot() {
  return {
    dominant: null,
    scores: {
      neutral: 0,
      happy: 0,
      sad: 0,
      angry: 0,
      fearful: 0,
      disgusted: 0,
      surprised: 0,
    },
    stressScore: 0,
    engagementScore: 0,
    boredomScore: 0,
    updatedAt: null as string | null,
  };
}

function createEmptyBehaviorSnapshot() {
  return {
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
    updatedAt: null as string | null,
  };
}

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
  const alertsByUser = new Map<string, (typeof alerts)>();

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
    const existing = alertsByUser.get(alert.userId) ?? [];
    existing.push(alert);
    alertsByUser.set(alert.userId, existing);
  }

  const currentSessionIds = Array.from(
    new Set(
      users
        .map((user) => activeSessionByUser.get(user.id)?.id ?? latestSessionByUser.get(user.id)?.id ?? null)
        .filter((sessionId): sessionId is string => Boolean(sessionId)),
    ),
  );

  const [latestEmotionSamples, latestHeadPoseSamples, latestBehaviorSamples] = await Promise.all([
    prisma.emotionSample.findMany({
      where: {
        sessionId: { in: currentSessionIds },
      },
      orderBy: {
        timestamp: "desc",
      },
    }),
    prisma.headPoseSample.findMany({
      where: {
        sessionId: { in: currentSessionIds },
      },
      orderBy: {
        timestamp: "desc",
      },
    }),
    prisma.behaviorSample.findMany({
      where: {
        sessionId: { in: currentSessionIds },
      },
      orderBy: {
        timestamp: "desc",
      },
    }),
  ]);

  const latestEmotionBySession = new Map<string, (typeof latestEmotionSamples)[number]>();
  const latestHeadPoseBySession = new Map<string, (typeof latestHeadPoseSamples)[number]>();
  const latestBehaviorBySession = new Map<string, (typeof latestBehaviorSamples)[number]>();

  for (const sample of latestEmotionSamples) {
    if (!latestEmotionBySession.has(sample.sessionId)) {
      latestEmotionBySession.set(sample.sessionId, sample);
    }
  }

  for (const sample of latestHeadPoseSamples) {
    if (!latestHeadPoseBySession.has(sample.sessionId)) {
      latestHeadPoseBySession.set(sample.sessionId, sample);
    }
  }

  for (const sample of latestBehaviorSamples) {
    if (!latestBehaviorBySession.has(sample.sessionId)) {
      latestBehaviorBySession.set(sample.sessionId, sample);
    }
  }

  const employees = users.map((user) => {
    const liveScore = liveScores.get(user.id);
    const activeSession = activeSessionByUser.get(user.id);
    const latestSession = latestSessionByUser.get(user.id);
    const currentSession = activeSession ?? latestSession;
    const currentScore = liveScore?.score ?? currentSession?.finalScore ?? 0;
    const sessionId = currentSession?.id ?? null;
    const latestEmotion = sessionId ? latestEmotionBySession.get(sessionId) : null;
    const latestHeadPose = sessionId ? latestHeadPoseBySession.get(sessionId) : null;
    const latestBehavior = sessionId ? latestBehaviorBySession.get(sessionId) : null;
    const openAlerts = alertsByUser.get(user.id) ?? [];

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      department: user.department,
      isMonitoring: Boolean(activeSession),
      sessionId,
      startedAt: currentSession?.startedAt.toISOString() ?? null,
      updatedAt: liveScore?.updatedAt ?? currentSession?.startedAt.toISOString() ?? null,
      score: currentScore,
      status: liveScore?.status ?? scoreToProductivityStatus(currentScore),
      faceSeconds: liveScore?.faceSeconds ?? currentSession?.faceSeconds ?? 0,
      activeSeconds: liveScore?.activeSeconds ?? currentSession?.activeSeconds ?? 0,
      idleSeconds: liveScore?.idleSeconds ?? currentSession?.idleSeconds ?? 0,
      emotion:
        liveScore?.emotion ??
        (latestEmotion
          ? {
              dominant: latestEmotion.dominant,
              scores: {
                neutral: Number(latestEmotion.neutralScore),
                happy: Number(latestEmotion.happyScore),
                sad: Number(latestEmotion.sadScore),
                angry: Number(latestEmotion.angryScore),
                fearful: Number(latestEmotion.fearfulScore),
                disgusted: Number(latestEmotion.disgustedScore),
                surprised: Number(latestEmotion.surprisedScore),
              },
              stressScore: latestEmotion.stressScore,
              engagementScore: latestEmotion.engagementScore,
              boredomScore: latestEmotion.boredomScore,
              updatedAt: latestEmotion.timestamp.toISOString(),
            }
          : createEmptyEmotionSnapshot()),
      behavior:
        liveScore?.behavior ??
        {
          ...createEmptyBehaviorSnapshot(),
          ...(latestHeadPose
            ? {
                yaw: Number(latestHeadPose.yaw),
                pitch: Number(latestHeadPose.pitch),
                roll: Number(latestHeadPose.roll),
                lookingAway: latestHeadPose.lookingAway,
                updatedAt: latestHeadPose.timestamp.toISOString(),
              }
            : {}),
          ...(latestBehavior
            ? {
                avgVelocityPx: latestBehavior.avgVelocityPx,
                clicksPerMin: latestBehavior.clicksPerMin,
                erraticScore: Number(latestBehavior.erraticScore),
                idleSeconds: latestBehavior.idleSeconds,
                kpm: latestBehavior.kpm,
                rhythmScore: Number(latestBehavior.rhythmScore),
                backspaceRate: Number(latestBehavior.backspaceRate),
                burstDetected: latestBehavior.burstDetected,
                updatedAt: latestBehavior.timestamp.toISOString(),
              }
            : {}),
        },
      alerts: openAlerts.map((alert) => ({
        id: alert.id,
        reason: alert.reason,
        alertType: alert.alertType,
        triggeredAt: alert.triggeredAt.toISOString(),
      })),
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

  let totalStress = 0;
  let totalEngagement = 0;
  let activeEmployees = 0;

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

    if (employee.isMonitoring) {
      totalStress += employee.emotion.stressScore;
      totalEngagement += employee.emotion.engagementScore;
      activeEmployees += 1;
    }
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
    teamSummary: {
      activeEmployees,
      avgStress: Math.round(totalStress / Math.max(1, activeEmployees)),
      avgEngagement: Math.round(totalEngagement / Math.max(1, activeEmployees)),
      openAlerts: alerts.length,
    },
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
