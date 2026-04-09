import type { EmotionSnapshot } from "../types/api";

type EmotionMetersProps = {
  emotion: EmotionSnapshot;
};

type MeterRowProps = {
  label: string;
  value: number;
  tone: "stress" | "engagement" | "boredom";
};

function MeterRow({ label, value, tone }: MeterRowProps) {
  return (
    <div className="emotion-meter">
      <div className="emotion-meter__label">
        <span>{label}</span>
        <strong>{value}%</strong>
      </div>
      <div className="emotion-meter__track">
        <div className={`emotion-meter__fill emotion-meter__fill--${tone}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function EmotionMeters({ emotion }: EmotionMetersProps) {
  return (
    <div className="emotion-meter-stack">
      <MeterRow label="Stress" value={emotion.stressScore} tone="stress" />
      <MeterRow label="Engagement" value={emotion.engagementScore} tone="engagement" />
      <MeterRow label="Boredom" value={emotion.boredomScore} tone="boredom" />
    </div>
  );
}
