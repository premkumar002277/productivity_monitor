import { Prisma, Role } from "@prisma/client";

import { env } from "../config/env";
import { prisma } from "../lib/prisma";

function startOfUtcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function previousUtcDayRange(reference = new Date()) {
  const end = startOfUtcDay(reference);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 1);
  return { start, end };
}

function endOfUtcDay(date: Date) {
  const end = startOfUtcDay(date);
  end.setUTCDate(end.getUTCDate() + 1);
  return end;
}

function toDateRange(startDate?: Date, endDate?: Date) {
  const start = startDate ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
  const end = endDate ?? new Date();
  return { start, end };
}

function mean(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function mode(values: string[], fallback = "neutral") {
  if (values.length === 0) {
    return fallback;
  }

  const counts = new Map<string, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Array.from(counts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ?? fallback;
}

export async function runDailyRollup(referenceDate = new Date()) {
  const { start, end } = previousUtcDayRange(referenceDate);

  const sessions = await prisma.session.findMany({
    where: {
      endedAt: {
        gte: start,
        lt: end,
      },
      finalScore: {
        not: null,
      },
    },
  });

  const grouped = new Map<
    string,
    {
      totalScore: number;
      totalFaceSeconds: number;
      totalIdleSeconds: number;
      sessionCount: number;
    }
  >();

  for (const session of sessions) {
    const entry = grouped.get(session.userId) ?? {
      totalScore: 0,
      totalFaceSeconds: 0,
      totalIdleSeconds: 0,
      sessionCount: 0,
    };

    entry.totalScore += session.finalScore ?? 0;
    entry.totalFaceSeconds += session.faceSeconds;
    entry.totalIdleSeconds += session.idleSeconds;
    entry.sessionCount += 1;

    grouped.set(session.userId, entry);
  }

  for (const [userId, summary] of grouped.entries()) {
    const avgScore = summary.totalScore / summary.sessionCount;

    await prisma.dailyStat.upsert({
      where: {
        userId_date: {
          userId,
          date: start,
        },
      },
      create: {
        userId,
        date: start,
        avgScore: new Prisma.Decimal(avgScore.toFixed(2)),
        totalFaceS: summary.totalFaceSeconds,
        totalIdleS: summary.totalIdleSeconds,
        sessionCount: summary.sessionCount,
      },
      update: {
        avgScore: new Prisma.Decimal(avgScore.toFixed(2)),
        totalFaceS: summary.totalFaceSeconds,
        totalIdleS: summary.totalIdleSeconds,
        sessionCount: summary.sessionCount,
      },
    });
  }

  return {
    date: start.toISOString().slice(0, 10),
    sessionsProcessed: sessions.length,
    usersProcessed: grouped.size,
  };
}

export async function runDailyEmotionRollup(referenceDate = new Date()) {
  const { start, end } = previousUtcDayRange(referenceDate);

  const [emotionSamples, headPoseSamples, behaviorSamples] = await Promise.all([
    prisma.emotionSample.findMany({
      where: {
        timestamp: {
          gte: start,
          lt: end,
        },
      },
      include: {
        session: {
          select: {
            userId: true,
          },
        },
      },
    }),
    prisma.headPoseSample.findMany({
      where: {
        timestamp: {
          gte: start,
          lt: end,
        },
      },
      include: {
        session: {
          select: {
            userId: true,
          },
        },
      },
    }),
    prisma.behaviorSample.findMany({
      where: {
        timestamp: {
          gte: start,
          lt: end,
        },
      },
      include: {
        session: {
          select: {
            userId: true,
          },
        },
      },
    }),
  ]);

  const grouped = new Map<
    string,
    {
      stressScores: number[];
      engagementScores: number[];
      boredomScores: number[];
      dominantEmotions: string[];
      headAwayFlags: number[];
      rhythmScores: number[];
      erraticScores: number[];
    }
  >();

  const ensureEntry = (userId: string) => {
    const existing = grouped.get(userId);

    if (existing) {
      return existing;
    }

    const created = {
      stressScores: [],
      engagementScores: [],
      boredomScores: [],
      dominantEmotions: [],
      headAwayFlags: [],
      rhythmScores: [],
      erraticScores: [],
    };

    grouped.set(userId, created);
    return created;
  };

  for (const sample of emotionSamples) {
    const entry = ensureEntry(sample.session.userId);
    entry.stressScores.push(sample.stressScore);
    entry.engagementScores.push(sample.engagementScore);
    entry.boredomScores.push(sample.boredomScore);
    entry.dominantEmotions.push(sample.dominant);
  }

  for (const sample of headPoseSamples) {
    const entry = ensureEntry(sample.session.userId);
    entry.headAwayFlags.push(sample.lookingAway ? 100 : 0);
  }

  for (const sample of behaviorSamples) {
    const entry = ensureEntry(sample.session.userId);
    entry.rhythmScores.push(Number(sample.rhythmScore));
    entry.erraticScores.push(Number(sample.erraticScore));
  }

  for (const [userId, summary] of grouped.entries()) {
    await prisma.dailyEmotionStat.upsert({
      where: {
        userId_date: {
          userId,
          date: start,
        },
      },
      create: {
        userId,
        date: start,
        avgStress: new Prisma.Decimal(mean(summary.stressScores).toFixed(2)),
        avgEngagement: new Prisma.Decimal(mean(summary.engagementScores).toFixed(2)),
        avgBoredom: new Prisma.Decimal(mean(summary.boredomScores).toFixed(2)),
        dominantEmotion: mode(summary.dominantEmotions),
        avgHeadAwayPct: new Prisma.Decimal(mean(summary.headAwayFlags).toFixed(2)),
        avgTypingRhythm: new Prisma.Decimal(mean(summary.rhythmScores).toFixed(3)),
        avgErratic: new Prisma.Decimal(mean(summary.erraticScores).toFixed(3)),
      },
      update: {
        avgStress: new Prisma.Decimal(mean(summary.stressScores).toFixed(2)),
        avgEngagement: new Prisma.Decimal(mean(summary.engagementScores).toFixed(2)),
        avgBoredom: new Prisma.Decimal(mean(summary.boredomScores).toFixed(2)),
        dominantEmotion: mode(summary.dominantEmotions),
        avgHeadAwayPct: new Prisma.Decimal(mean(summary.headAwayFlags).toFixed(2)),
        avgTypingRhythm: new Prisma.Decimal(mean(summary.rhythmScores).toFixed(3)),
        avgErratic: new Prisma.Decimal(mean(summary.erraticScores).toFixed(3)),
      },
    });
  }

  return {
    date: start.toISOString().slice(0, 10),
    emotionSamplesProcessed: emotionSamples.length,
    usersProcessed: grouped.size,
  };
}

export async function cleanupExpiredEvents(referenceDate = new Date()) {
  const cutoff = new Date(referenceDate.getTime() - env.RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const [events, emotionSamples, headPoseSamples, behaviorSamples] = await Promise.all([
    prisma.event.deleteMany({
      where: {
        timestamp: {
          lt: cutoff,
        },
      },
    }),
    prisma.emotionSample.deleteMany({
      where: {
        timestamp: {
          lt: cutoff,
        },
      },
    }),
    prisma.headPoseSample.deleteMany({
      where: {
        timestamp: {
          lt: cutoff,
        },
      },
    }),
    prisma.behaviorSample.deleteMany({
      where: {
        timestamp: {
          lt: cutoff,
        },
      },
    }),
  ]);

  return {
    deletedCount: events.count + emotionSamples.count + headPoseSamples.count + behaviorSamples.count,
    eventCount: events.count,
    emotionSampleCount: emotionSamples.count,
    headPoseSampleCount: headPoseSamples.count,
    behaviorSampleCount: behaviorSamples.count,
    cutoff: cutoff.toISOString(),
  };
}

export async function getDailyStats(adminId: string, userId?: string, days = 7) {
  const start = startOfUtcDay(new Date());
  start.setUTCDate(start.getUTCDate() - Math.max(0, days - 1));

  const stats = await prisma.dailyStat.findMany({
    where: {
      date: {
        gte: start,
      },
      user: {
        createdByAdminId: adminId,
        role: Role.EMPLOYEE,
        ...(userId ? { id: userId } : {}),
      },
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          department: true,
        },
      },
    },
    orderBy: [{ date: "asc" }, { userId: "asc" }],
  });

  return stats.map((stat) => ({
    id: stat.id,
    userId: stat.userId,
    date: stat.date.toISOString().slice(0, 10),
    avgScore: Number(stat.avgScore),
    totalFaceSeconds: stat.totalFaceS,
    totalIdleSeconds: stat.totalIdleS,
    sessionCount: stat.sessionCount,
    user: stat.user,
  }));
}

export async function getEmotionTimeline(adminId: string, userId: string, startDate?: Date, endDate?: Date) {
  const { start, end } = toDateRange(startDate, endDate);

  const samples = await prisma.emotionSample.findMany({
    where: {
      session: {
        userId,
        user: {
          createdByAdminId: adminId,
          role: Role.EMPLOYEE,
        },
      },
      timestamp: {
        gte: start,
        lte: end,
      },
    },
    orderBy: {
      timestamp: "asc",
    },
  });

  return samples.map((sample) => ({
    timestamp: sample.timestamp.toISOString(),
    dominant: sample.dominant,
    stressScore: sample.stressScore,
    engagementScore: sample.engagementScore,
    boredomScore: sample.boredomScore,
  }));
}

export async function getBehaviorTimeline(adminId: string, userId: string, startDate?: Date, endDate?: Date) {
  const { start, end } = toDateRange(startDate, endDate);
  const [headPoseSamples, behaviorSamples] = await Promise.all([
    prisma.headPoseSample.findMany({
      where: {
        session: {
          userId,
          user: {
            createdByAdminId: adminId,
            role: Role.EMPLOYEE,
          },
        },
        timestamp: {
          gte: start,
          lte: end,
        },
      },
      orderBy: {
        timestamp: "asc",
      },
    }),
    prisma.behaviorSample.findMany({
      where: {
        session: {
          userId,
          user: {
            createdByAdminId: adminId,
            role: Role.EMPLOYEE,
          },
        },
        timestamp: {
          gte: start,
          lte: end,
        },
      },
      orderBy: {
        timestamp: "asc",
      },
    }),
  ]);

  const points = new Map<
    number,
    {
      timestamp: string;
      yaw: number;
      pitch: number;
      roll: number;
      lookingAway: boolean;
      avgVelocityPx: number;
      clicksPerMin: number;
      erraticScore: number;
      idleSeconds: number;
      kpm: number;
      rhythmScore: number;
      backspaceRate: number;
      burstDetected: boolean;
    }
  >();

  const ensurePoint = (timestamp: Date) => {
    const key = Math.floor(timestamp.getTime() / 5_000);
    const existing = points.get(key);

    if (existing) {
      return existing;
    }

    const created = {
      timestamp: timestamp.toISOString(),
      yaw: 0,
      pitch: 0,
      roll: 0,
      lookingAway: false,
      avgVelocityPx: 0,
      clicksPerMin: 0,
      erraticScore: 0,
      idleSeconds: 0,
      kpm: 0,
      rhythmScore: 0,
      backspaceRate: 0,
      burstDetected: false,
    };

    points.set(key, created);
    return created;
  };

  for (const sample of headPoseSamples) {
    const point = ensurePoint(sample.timestamp);
    point.timestamp = sample.timestamp.toISOString();
    point.yaw = Number(sample.yaw);
    point.pitch = Number(sample.pitch);
    point.roll = Number(sample.roll);
    point.lookingAway = sample.lookingAway;
  }

  for (const sample of behaviorSamples) {
    const point = ensurePoint(sample.timestamp);
    point.timestamp = sample.timestamp.toISOString();
    point.avgVelocityPx = sample.avgVelocityPx;
    point.clicksPerMin = sample.clicksPerMin;
    point.erraticScore = Number(sample.erraticScore);
    point.idleSeconds = sample.idleSeconds;
    point.kpm = sample.kpm;
    point.rhythmScore = Number(sample.rhythmScore);
    point.backspaceRate = Number(sample.backspaceRate);
    point.burstDetected = sample.burstDetected;
  }

  return Array.from(points.values()).sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
}

export async function getDailyEmotionStats(adminId: string, filters: { date?: Date; department?: string }) {
  const targetDate = filters.date ? startOfUtcDay(filters.date) : undefined;

  const stats = await prisma.dailyEmotionStat.findMany({
    where: {
      ...(targetDate ? { date: targetDate } : {}),
      user: {
        createdByAdminId: adminId,
        role: Role.EMPLOYEE,
        ...(filters.department ? { department: filters.department } : {}),
      },
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          department: true,
        },
      },
    },
    orderBy: [{ date: "desc" }, { userId: "asc" }],
  });

  return stats.map((stat) => ({
    id: stat.id,
    userId: stat.userId,
    date: stat.date.toISOString().slice(0, 10),
    avgStress: Number(stat.avgStress),
    avgEngagement: Number(stat.avgEngagement),
    avgBoredom: Number(stat.avgBoredom),
    dominantEmotion: stat.dominantEmotion,
    avgHeadAwayPct: Number(stat.avgHeadAwayPct),
    avgTypingRhythm: Number(stat.avgTypingRhythm),
    avgErratic: Number(stat.avgErratic),
    user: stat.user,
  }));
}

function escapeCsvValue(value: string | number | null) {
  if (value === null) {
    return "";
  }

  const stringValue = String(value);

  if (stringValue.includes(",") || stringValue.includes("\"") || stringValue.includes("\n")) {
    return `"${stringValue.replace(/"/g, "\"\"")}"`;
  }

  return stringValue;
}

export async function exportSessionsCsv(adminId: string, filters: {
  userId?: string;
  from?: Date;
  to?: Date;
}) {
  const sessions = await prisma.session.findMany({
    where: {
      user: {
        createdByAdminId: adminId,
        role: Role.EMPLOYEE,
        ...(filters.userId ? { id: filters.userId } : {}),
      },
      ...(filters.from || filters.to
        ? {
            startedAt: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
    },
    include: {
      user: {
        select: {
          name: true,
          email: true,
          department: true,
        },
      },
    },
    orderBy: {
      startedAt: "desc",
    },
  });

  const rows = [
    [
      "session_id",
      "employee_name",
      "employee_email",
      "department",
      "started_at",
      "ended_at",
      "score",
      "face_seconds",
      "active_seconds",
      "idle_seconds",
    ].join(","),
  ];

  for (const session of sessions) {
    rows.push(
      [
        session.id,
        session.user.name,
        session.user.email,
        session.user.department,
        session.startedAt.toISOString(),
        session.endedAt?.toISOString() ?? "",
        session.finalScore ?? "",
        session.faceSeconds,
        session.activeSeconds,
        session.idleSeconds,
      ]
        .map(escapeCsvValue)
        .join(","),
    );
  }

  return rows.join("\n");
}

export async function exportEmotionReportCsv(adminId: string, filters: { date?: Date; department?: string }) {
  const stats = await getDailyEmotionStats(adminId, filters);
  const rows = [
    [
      "date",
      "employee_name",
      "employee_email",
      "department",
      "avg_stress",
      "avg_engagement",
      "avg_boredom",
      "dominant_emotion",
      "avg_head_away_pct",
      "avg_typing_rhythm",
      "avg_erratic",
    ].join(","),
  ];

  for (const stat of stats) {
    rows.push(
      [
        stat.date,
        stat.user.name,
        stat.user.email,
        stat.user.department,
        stat.avgStress,
        stat.avgEngagement,
        stat.avgBoredom,
        stat.dominantEmotion,
        stat.avgHeadAwayPct,
        stat.avgTypingRhythm,
        stat.avgErratic,
      ]
        .map(escapeCsvValue)
        .join(","),
    );
  }

  return rows.join("\n");
}
