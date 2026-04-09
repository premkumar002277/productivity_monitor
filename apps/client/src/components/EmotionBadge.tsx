import type { EmotionSnapshot } from "../types/api";

type EmotionBadgeProps = {
  emotion: EmotionSnapshot;
};

const emotionLabels: Record<string, string> = {
  happy: "Engaged",
  neutral: "Steady",
  sad: "Low mood",
  fearful: "Low mood",
  angry: "Stressed",
  disgusted: "Frustrated",
  surprised: "Alert",
};

export function EmotionBadge({ emotion }: EmotionBadgeProps) {
  if (!emotion.dominant) {
    return <span className="emotion-badge emotion-badge--neutral">No signal</span>;
  }

  return (
    <span className={`emotion-badge emotion-badge--${emotion.dominant}`}>
      {emotionLabels[emotion.dominant]} ({emotion.dominant})
    </span>
  );
}
