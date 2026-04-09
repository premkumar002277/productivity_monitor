import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { ensureRedisConnection, redis } from "../lib/redis";
import { emitToAdmins } from "../lib/socket";
import type { SessionMetrics } from "./scorer";

type AlertSettings = {
  scoreThreshold: number;
  durationMinutes: number;
};

const ALERT_SETTINGS_KEY = "settings:alerts";

function alertBreachKey(userId: string) {
  return `alert-breach:${userId}`;
}

export async function getAlertSettings(): Promise<AlertSettings> {
  await ensureRedisConnection();
  const stored = await redis.hGetAll(ALERT_SETTINGS_KEY);

  return {
    scoreThreshold: stored.scoreThreshold ? Number(stored.scoreThreshold) : env.DEFAULT_ALERT_SCORE_THRESHOLD,
    durationMinutes: stored.durationMinutes ? Number(stored.durationMinutes) : env.DEFAULT_ALERT_DURATION_MINUTES,
  };
}

export async function updateAlertSettings(settings: AlertSettings) {
  await ensureRedisConnection();
  await redis.hSet(ALERT_SETTINGS_KEY, {
    scoreThreshold: String(settings.scoreThreshold),
    durationMinutes: String(settings.durationMinutes),
  });

  return settings;
}

export async function clearAlertBreach(userId: string) {
  await ensureRedisConnection();
  await redis.del(alertBreachKey(userId));
}

export async function resolveOpenAlerts(userId: string) {
  await prisma.alert.updateMany({
    where: {
      userId,
      resolved: false,
    },
    data: {
      resolved: true,
    },
  });
}

type AlertContext = {
  userId: string;
  name: string;
  department: string | null;
  sessionId: string;
  metrics: SessionMetrics;
};

export async function evaluateAlert(context: AlertContext) {
  const settings = await getAlertSettings();
  const breachKey = alertBreachKey(context.userId);

  if (context.metrics.score >= settings.scoreThreshold) {
    await clearAlertBreach(context.userId);
    await resolveOpenAlerts(context.userId);
    return null;
  }

  await ensureRedisConnection();
  const existingBreachTimestamp = await redis.get(breachKey);

  if (!existingBreachTimestamp) {
    await redis.set(breachKey, String(Date.now()), {
      EX: settings.durationMinutes * 60 * 2,
    });
    return null;
  }

  const elapsedMs = Date.now() - Number(existingBreachTimestamp);

  if (elapsedMs < settings.durationMinutes * 60 * 1000) {
    return null;
  }

  const unresolvedAlert = await prisma.alert.findFirst({
    where: {
      userId: context.userId,
      resolved: false,
    },
  });

  if (unresolvedAlert) {
    return unresolvedAlert;
  }

  const reason = `Score ${context.metrics.score} is below ${settings.scoreThreshold} for ${settings.durationMinutes} minutes`;

  const alert = await prisma.alert.create({
    data: {
      userId: context.userId,
      reason,
    },
  });

  emitToAdmins("alert:triggered", {
    id: alert.id,
    userId: context.userId,
    sessionId: context.sessionId,
    name: context.name,
    department: context.department,
    score: context.metrics.score,
    reason,
    triggeredAt: alert.triggeredAt.toISOString(),
  });

  return alert;
}
