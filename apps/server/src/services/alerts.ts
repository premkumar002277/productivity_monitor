import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { ensureRedisConnection, redis } from "../lib/redis";
import { emitToAdmin } from "../lib/socket";
import type { SessionMetrics } from "./scorer";

export type AlertType = "low_score" | "high_stress" | "head_away" | "erratic_behavior" | "low_engagement";

type AlertSettings = {
  scoreThreshold: number;
  durationMinutes: number;
};

type AlertContext = {
  userId: string;
  adminId: string | null;
  name: string;
  department: string | null;
  sessionId: string;
  metrics: SessionMetrics;
};

type RuleEvaluation = {
  alertType: AlertType;
  reason: string;
  breachActive: boolean;
  breachAfterSeconds: number;
  recoveryActive?: boolean;
  recoveryAfterSeconds?: number;
};

const ALERT_SETTINGS_KEY = "settings:alerts";
const ALERT_TYPES: AlertType[] = ["low_score", "high_stress", "head_away", "erratic_behavior", "low_engagement"];

function alertBreachKey(userId: string, alertType: AlertType) {
  return `alert-breach:${alertType}:${userId}`;
}

function alertRecoveryKey(userId: string, alertType: AlertType) {
  return `alert-recovery:${alertType}:${userId}`;
}

function emitAlertResolved(alertId: string, userId: string, alertType: AlertType, adminId: string | null) {
  emitToAdmin(adminId, "alert:resolved", {
    id: alertId,
    userId,
    alertType,
  });
}

async function getOpenAlert(userId: string, alertType: AlertType) {
  return prisma.alert.findFirst({
    where: {
      userId,
      alertType,
      resolved: false,
    },
    orderBy: {
      triggeredAt: "desc",
    },
  });
}

async function clearRuleState(userId: string, alertType: AlertType) {
  await ensureRedisConnection();
  await redis.del([alertBreachKey(userId, alertType), alertRecoveryKey(userId, alertType)]);
}

async function resolveOpenAlert(userId: string, alertType: AlertType, adminId: string | null) {
  const openAlerts = await prisma.alert.findMany({
    where: {
      userId,
      alertType,
      resolved: false,
    },
  });

  if (openAlerts.length === 0) {
    await clearRuleState(userId, alertType);
    return;
  }

  await prisma.alert.updateMany({
    where: {
      userId,
      alertType,
      resolved: false,
    },
    data: {
      resolved: true,
    },
  });

  await clearRuleState(userId, alertType);

  for (const alert of openAlerts) {
    emitAlertResolved(alert.id, userId, alertType, adminId);
  }
}

async function createAlert(context: AlertContext, alertType: AlertType, reason: string) {
  const existingAlert = await getOpenAlert(context.userId, alertType);

  if (existingAlert) {
    return existingAlert;
  }

  const alert = await prisma.alert.create({
    data: {
      userId: context.userId,
      reason,
      alertType,
    },
  });

  emitToAdmin(context.adminId, "alert:triggered", {
    id: alert.id,
    userId: context.userId,
    sessionId: context.sessionId,
    name: context.name,
    department: context.department,
    score: context.metrics.score,
    alertType,
    reason,
    triggeredAt: alert.triggeredAt.toISOString(),
  });

  return alert;
}

async function evaluateRule(context: AlertContext, evaluation: RuleEvaluation) {
  await ensureRedisConnection();

  const breachKey = alertBreachKey(context.userId, evaluation.alertType);
  const recoveryKey = alertRecoveryKey(context.userId, evaluation.alertType);
  const openAlert = await getOpenAlert(context.userId, evaluation.alertType);

  if (evaluation.breachActive) {
    await redis.del(recoveryKey);
    const breachStartedAt = await redis.get(breachKey);

    if (!breachStartedAt) {
      await redis.set(breachKey, String(Date.now()), {
        EX: Math.max(evaluation.breachAfterSeconds * 2, 60),
      });
      return;
    }

    const elapsedMs = Date.now() - Number(breachStartedAt);

    if (elapsedMs >= evaluation.breachAfterSeconds * 1000 && !openAlert) {
      await createAlert(context, evaluation.alertType, evaluation.reason);
    }

    return;
  }

  await redis.del(breachKey);

  if (!openAlert) {
    await redis.del(recoveryKey);
    return;
  }

  if (!evaluation.recoveryActive) {
    await redis.del(recoveryKey);
    return;
  }

  const recoveryAfterSeconds = evaluation.recoveryAfterSeconds ?? 0;

  if (recoveryAfterSeconds === 0) {
    await resolveOpenAlert(context.userId, evaluation.alertType, context.adminId);
    return;
  }

  const recoveryStartedAt = await redis.get(recoveryKey);

  if (!recoveryStartedAt) {
    await redis.set(recoveryKey, String(Date.now()), {
      EX: Math.max(recoveryAfterSeconds * 2, 60),
    });
    return;
  }

  const elapsedMs = Date.now() - Number(recoveryStartedAt);

  if (elapsedMs >= recoveryAfterSeconds * 1000) {
    await resolveOpenAlert(context.userId, evaluation.alertType, context.adminId);
  }
}

function buildRuleEvaluations(context: AlertContext, settings: AlertSettings): RuleEvaluation[] {
  const erraticPattern = context.metrics.behavior.erraticScore > 2.5 && context.metrics.behavior.rhythmScore < 0.35;

  return [
    {
      alertType: "low_score",
      reason: `Score ${context.metrics.score} is below ${settings.scoreThreshold} for ${settings.durationMinutes} minutes`,
      breachActive: context.metrics.score < settings.scoreThreshold,
      breachAfterSeconds: settings.durationMinutes * 60,
      recoveryActive: context.metrics.score >= settings.scoreThreshold,
      recoveryAfterSeconds: 0,
    },
    {
      alertType: "high_stress",
      reason: `Stress score ${context.metrics.emotion.stressScore} stayed above 70 for 10 minutes`,
      breachActive: context.metrics.emotion.stressScore > 70,
      breachAfterSeconds: 10 * 60,
      recoveryActive: context.metrics.emotion.stressScore < 50,
      recoveryAfterSeconds: 5 * 60,
    },
    {
      alertType: "head_away",
      reason: `Looking away for ${context.metrics.behavior.lookingAwaySeconds} seconds`,
      breachActive: context.metrics.behavior.lookingAway,
      breachAfterSeconds: 5 * 60,
      recoveryActive: !context.metrics.behavior.lookingAway,
      recoveryAfterSeconds: 60,
    },
    {
      alertType: "erratic_behavior",
      reason: "Erratic behavior pattern detected from mouse and typing rhythm",
      breachActive: erraticPattern,
      breachAfterSeconds: 5 * 60,
      recoveryActive: !erraticPattern,
      recoveryAfterSeconds: 0,
    },
    {
      alertType: "low_engagement",
      reason: `Engagement score ${context.metrics.emotion.engagementScore} stayed below 25 for 20 minutes`,
      breachActive: context.metrics.emotion.engagementScore < 25,
      breachAfterSeconds: 20 * 60,
      recoveryActive: context.metrics.emotion.engagementScore >= 35,
      recoveryAfterSeconds: 5 * 60,
    },
  ];
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
  await Promise.all(ALERT_TYPES.map((alertType) => clearRuleState(userId, alertType)));
}

export async function resolveOpenAlerts(userId: string, adminId: string | null = null) {
  const openAlerts = await prisma.alert.findMany({
    where: {
      userId,
      resolved: false,
    },
  });

  if (openAlerts.length === 0) {
    await clearAlertBreach(userId);
    return;
  }

  await prisma.alert.updateMany({
    where: {
      userId,
      resolved: false,
    },
    data: {
      resolved: true,
    },
  });

  await clearAlertBreach(userId);

  for (const alert of openAlerts) {
    emitAlertResolved(alert.id, userId, alert.alertType as AlertType, adminId);
  }
}

export async function evaluateAlert(context: AlertContext) {
  const settings = await getAlertSettings();
  const evaluations = buildRuleEvaluations(context, settings);

  for (const evaluation of evaluations) {
    await evaluateRule(context, evaluation);
  }
}
