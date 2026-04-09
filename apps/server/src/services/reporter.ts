import { Prisma } from "@prisma/client";

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

export async function cleanupExpiredEvents(referenceDate = new Date()) {
  const cutoff = new Date(referenceDate.getTime() - env.RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const result = await prisma.event.deleteMany({
    where: {
      timestamp: {
        lt: cutoff,
      },
    },
  });

  return {
    deletedCount: result.count,
    cutoff: cutoff.toISOString(),
  };
}

export async function getDailyStats(userId?: string, days = 7) {
  const start = startOfUtcDay(new Date());
  start.setUTCDate(start.getUTCDate() - Math.max(0, days - 1));

  const stats = await prisma.dailyStat.findMany({
    where: {
      ...(userId ? { userId } : {}),
      date: {
        gte: start,
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

export async function exportSessionsCsv(filters: {
  userId?: string;
  from?: Date;
  to?: Date;
}) {
  const sessions = await prisma.session.findMany({
    where: {
      ...(filters.userId ? { userId: filters.userId } : {}),
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
