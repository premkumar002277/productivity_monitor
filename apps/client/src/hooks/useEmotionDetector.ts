import type { EmotionName, EmotionSampleValue, EmotionScores } from "../types/api";

const EMOTION_NAMES: EmotionName[] = ["happy", "sad", "angry", "fearful", "disgusted", "surprised", "neutral"];

export function createEmptyEmotionScores(): EmotionScores {
  return {
    neutral: 0,
    happy: 0,
    sad: 0,
    angry: 0,
    fearful: 0,
    disgusted: 0,
    surprised: 0,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function deriveEmotionMetrics(scores: EmotionScores) {
  return {
    stressScore: Math.round(clamp((scores.angry + scores.fearful + scores.disgusted) * 100, 0, 100)),
    engagementScore: Math.round(clamp((scores.happy + scores.neutral + scores.surprised) * 100, 0, 100)),
    boredomScore: Math.round(clamp((scores.sad + scores.neutral * 0.3) * 100, 0, 100)),
  };
}

export function buildEmotionSample(expressions: Record<string, number>): EmotionSampleValue {
  const scores = createEmptyEmotionScores();

  for (const emotion of EMOTION_NAMES) {
    scores[emotion] = Number(clamp(expressions[emotion] ?? 0, 0, 1).toFixed(3));
  }

  const dominant = EMOTION_NAMES.slice().sort((left, right) => scores[right] - scores[left])[0] ?? "neutral";

  return {
    dominant,
    scores,
  };
}
