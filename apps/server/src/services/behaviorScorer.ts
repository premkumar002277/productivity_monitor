import { summarizeLookingAway } from "./headPoseAnalyzer";

export type HeadPoseSampleValue = {
  yaw: number;
  pitch: number;
  roll: number;
  lookingAway: boolean;
};

export type MouseBehaviorValue = {
  avgVelocityPx: number;
  clicksPerMin: number;
  erraticScore: number;
  idleSeconds: number;
};

export type KeyboardBehaviorValue = {
  kpm: number;
  rhythmScore: number;
  backspaceRate: number;
  burstDetected: boolean;
};

export type HeadPoseRecord = HeadPoseSampleValue & { timestamp: Date };
export type MouseBehaviorRecord = MouseBehaviorValue & { timestamp: Date };
export type KeyboardBehaviorRecord = KeyboardBehaviorValue & { timestamp: Date };

export type BehaviorSummary = {
  yaw: number;
  pitch: number;
  roll: number;
  lookingAway: boolean;
  lookingAwaySeconds: number;
  headAwayRatio: number;
  avgVelocityPx: number;
  clicksPerMin: number;
  erraticScore: number;
  idleSeconds: number;
  kpm: number;
  rhythmScore: number;
  backspaceRate: number;
  burstDetected: boolean;
  updatedAt: string | null;
};

export type BehaviorContribution = {
  bonus: number;
  penalty: number;
  headAwayRatio: number;
  averageErraticScore: number;
  averageRhythmScore: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function coerceNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function mean(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function createEmptyBehaviorSummary(): BehaviorSummary {
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
    updatedAt: null,
  };
}

export function normalizeHeadPoseValue(input: unknown): HeadPoseSampleValue | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const record = input as Record<string, unknown>;
  const yaw = coerceNumber(record.yaw);
  const pitch = coerceNumber(record.pitch);
  const roll = coerceNumber(record.roll);

  if (yaw === null || pitch === null || roll === null || typeof record.lookingAway !== "boolean") {
    return null;
  }

  return {
    yaw: Number(clamp(yaw, -1, 1).toFixed(3)),
    pitch: Number(clamp(pitch, -1, 1).toFixed(3)),
    roll: Number(clamp(roll, -1, 1).toFixed(3)),
    lookingAway: record.lookingAway,
  };
}

export function normalizeMouseBehaviorValue(input: unknown): MouseBehaviorValue | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const record = input as Record<string, unknown>;
  const avgVelocityPx = coerceNumber(record.avgVelocityPx);
  const clicksPerMin = coerceNumber(record.clicksPerMin);
  const erraticScore = coerceNumber(record.erraticScore);
  const idleSeconds = coerceNumber(record.idleSeconds);

  if (avgVelocityPx === null || clicksPerMin === null || erraticScore === null || idleSeconds === null) {
    return null;
  }

  return {
    avgVelocityPx: Math.round(clamp(avgVelocityPx, 0, 10_000)),
    clicksPerMin: Math.round(clamp(clicksPerMin, 0, 500)),
    erraticScore: Number(clamp(erraticScore, 0, 10).toFixed(3)),
    idleSeconds: Math.round(clamp(idleSeconds, 0, 600)),
  };
}

export function normalizeKeyboardBehaviorValue(input: unknown): KeyboardBehaviorValue | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const record = input as Record<string, unknown>;
  const kpm = coerceNumber(record.kpm);
  const rhythmScore = coerceNumber(record.rhythmScore);
  const backspaceRate = coerceNumber(record.backspaceRate);

  if (kpm === null || rhythmScore === null || backspaceRate === null || typeof record.burstDetected !== "boolean") {
    return null;
  }

  return {
    kpm: Math.round(clamp(kpm, 0, 500)),
    rhythmScore: Number(clamp(rhythmScore, 0, 1).toFixed(3)),
    backspaceRate: Number(clamp(backspaceRate, 0, 1).toFixed(3)),
    burstDetected: record.burstDetected,
  };
}

export function summarizeBehaviorSignals(input: {
  headPoseSamples: HeadPoseRecord[];
  mouseSamples: MouseBehaviorRecord[];
  keyboardSamples: KeyboardBehaviorRecord[];
}): BehaviorSummary {
  const base = createEmptyBehaviorSummary();
  const latestHeadPose = input.headPoseSamples.sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime()).at(-1) ?? null;
  const latestMouse = input.mouseSamples.sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime()).at(-1) ?? null;
  const latestKeyboard = input.keyboardSamples.sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime()).at(-1) ?? null;
  const lookingAway = summarizeLookingAway(input.headPoseSamples);
  const updatedAt = [latestHeadPose?.timestamp, latestMouse?.timestamp, latestKeyboard?.timestamp]
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => left.getTime() - right.getTime())
    .at(-1);

  return {
    ...base,
    ...(latestHeadPose
      ? {
          yaw: latestHeadPose.yaw,
          pitch: latestHeadPose.pitch,
          roll: latestHeadPose.roll,
          lookingAway: latestHeadPose.lookingAway,
        }
      : {}),
    ...(latestMouse
      ? {
          avgVelocityPx: latestMouse.avgVelocityPx,
          clicksPerMin: latestMouse.clicksPerMin,
          erraticScore: latestMouse.erraticScore,
          idleSeconds: latestMouse.idleSeconds,
        }
      : {}),
    ...(latestKeyboard
      ? {
          kpm: latestKeyboard.kpm,
          rhythmScore: latestKeyboard.rhythmScore,
          backspaceRate: latestKeyboard.backspaceRate,
          burstDetected: latestKeyboard.burstDetected,
        }
      : {}),
    lookingAwaySeconds: lookingAway.lookingAwaySeconds,
    headAwayRatio: Number(lookingAway.headAwayRatio.toFixed(3)),
    updatedAt: updatedAt?.toISOString() ?? null,
  };
}

export function computeBehaviorContribution(input: {
  headPoseSamples: HeadPoseRecord[];
  mouseSamples: MouseBehaviorRecord[];
  keyboardSamples: KeyboardBehaviorRecord[];
}): BehaviorContribution {
  const { headAwayRatio } = summarizeLookingAway(input.headPoseSamples);
  const averageErraticScore = mean(input.mouseSamples.map((sample) => sample.erraticScore));
  const averageRhythmScore = mean(input.keyboardSamples.map((sample) => sample.rhythmScore));

  return {
    bonus: averageRhythmScore * 10,
    penalty: (averageErraticScore > 2 ? 5 : 0) + headAwayRatio * 10,
    headAwayRatio,
    averageErraticScore,
    averageRhythmScore,
  };
}
