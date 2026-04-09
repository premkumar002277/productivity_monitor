export const EMOTION_NAMES = [
  "happy",
  "sad",
  "angry",
  "fearful",
  "disgusted",
  "surprised",
  "neutral",
] as const;

export type EmotionName = (typeof EMOTION_NAMES)[number];

export type EmotionScores = Record<EmotionName, number>;

export type EmotionSampleValue = {
  dominant: EmotionName;
  scores: EmotionScores;
};

export type EmotionSampleRecord = EmotionSampleValue & {
  timestamp: Date;
  stressScore: number;
  engagementScore: number;
  boredomScore: number;
};

export type EmotionSummary = {
  dominant: EmotionName | null;
  scores: EmotionScores;
  stressScore: number;
  engagementScore: number;
  boredomScore: number;
  updatedAt: string | null;
  sampleCount: number;
};

const EMPTY_EMOTION_SCORES: EmotionScores = {
  happy: 0,
  sad: 0,
  angry: 0,
  fearful: 0,
  disgusted: 0,
  surprised: 0,
  neutral: 0,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function coerceNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function createEmptyEmotionSummary(): EmotionSummary {
  return {
    dominant: null,
    scores: { ...EMPTY_EMOTION_SCORES },
    stressScore: 0,
    engagementScore: 0,
    boredomScore: 0,
    updatedAt: null,
    sampleCount: 0,
  };
}

export function normalizeEmotionSampleValue(input: unknown): EmotionSampleValue | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const record = input as Record<string, unknown>;
  const scoresValue = record.scores;

  if (!scoresValue || typeof scoresValue !== "object") {
    return null;
  }

  const scoresRecord = scoresValue as Record<string, unknown>;
  const scores = {} as EmotionScores;

  for (const emotion of EMOTION_NAMES) {
    const numericValue = coerceNumber(scoresRecord[emotion]);

    if (numericValue === null) {
      return null;
    }

    scores[emotion] = Number(clamp(numericValue, 0, 1).toFixed(3));
  }

  const sorted = EMOTION_NAMES.slice().sort((left, right) => scores[right] - scores[left]);
  const dominantValue = record.dominant;
  const dominant = typeof dominantValue === "string" && EMOTION_NAMES.includes(dominantValue as EmotionName)
    ? (dominantValue as EmotionName)
    : sorted[0];

  return {
    dominant,
    scores,
  };
}

export function deriveEmotionInsights(scores: EmotionScores) {
  return {
    stressScore: Math.round(clamp((scores.angry + scores.fearful + scores.disgusted) * 100, 0, 100)),
    engagementScore: Math.round(clamp((scores.happy + scores.neutral + scores.surprised) * 100, 0, 100)),
    boredomScore: Math.round(clamp((scores.sad + scores.neutral * 0.3) * 100, 0, 100)),
  };
}

export function toEmotionSampleRecord(timestamp: Date, input: unknown): EmotionSampleRecord | null {
  const normalized = normalizeEmotionSampleValue(input);

  if (!normalized) {
    return null;
  }

  const derived = deriveEmotionInsights(normalized.scores);

  return {
    timestamp,
    dominant: normalized.dominant,
    scores: normalized.scores,
    ...derived,
  };
}

export function summarizeEmotionSamples(samples: EmotionSampleRecord[]): EmotionSummary {
  if (samples.length === 0) {
    return createEmptyEmotionSummary();
  }

  const sorted = [...samples].sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());
  const latest = sorted[sorted.length - 1];
  const totals = { ...EMPTY_EMOTION_SCORES };
  let totalStress = 0;
  let totalEngagement = 0;
  let totalBoredom = 0;

  for (const sample of sorted) {
    totalStress += sample.stressScore;
    totalEngagement += sample.engagementScore;
    totalBoredom += sample.boredomScore;

    for (const emotion of EMOTION_NAMES) {
      totals[emotion] += sample.scores[emotion];
    }
  }

  return {
    dominant: latest.dominant,
    scores: latest.scores,
    stressScore: Math.round(totalStress / sorted.length),
    engagementScore: Math.round(totalEngagement / sorted.length),
    boredomScore: Math.round(totalBoredom / sorted.length),
    updatedAt: latest.timestamp.toISOString(),
    sampleCount: sorted.length,
  };
}

export function getDominantEmotion(scores: EmotionScores): EmotionName {
  return EMOTION_NAMES.slice().sort((left, right) => scores[right] - scores[left])[0];
}
