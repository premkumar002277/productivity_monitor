import type { BehaviorSnapshot } from "../types/api";

type BehaviorIndicatorProps = {
  behavior: BehaviorSnapshot;
  label?: string;
};

function getMouseLabel(erraticScore: number) {
  if (erraticScore > 2) {
    return "Mouse erratic";
  }

  if (erraticScore > 1) {
    return "Mouse active";
  }

  return "Mouse calm";
}

function getTypingLabel(rhythmScore: number) {
  if (rhythmScore >= 0.7) {
    return "Typing focused";
  }

  if (rhythmScore >= 0.4) {
    return "Typing variable";
  }

  return "Typing erratic";
}

export function BehaviorIndicator({ behavior, label = "Behavior signals" }: BehaviorIndicatorProps) {
  const mouseTone = behavior.erraticScore > 2 ? "behavior-pill--danger" : behavior.erraticScore > 1 ? "behavior-pill--warn" : "behavior-pill--ok";
  const typingTone = behavior.rhythmScore < 0.4 ? "behavior-pill--danger" : behavior.rhythmScore < 0.7 ? "behavior-pill--warn" : "behavior-pill--ok";

  return (
    <div className="behavior-indicator">
      <span className="behavior-indicator__label">{label}</span>

      <div className="behavior-indicator-row">
        <span className={`behavior-pill ${behavior.lookingAway ? "behavior-pill--warn" : "behavior-pill--ok"}`}>
          {behavior.lookingAway ? `Looking away ${behavior.lookingAwaySeconds}s` : "Looking at screen"}
        </span>
        <span className={`behavior-pill ${mouseTone}`}>{getMouseLabel(behavior.erraticScore)}</span>
        <span className={`behavior-pill ${typingTone}`}>{getTypingLabel(behavior.rhythmScore)}</span>
      </div>
    </div>
  );
}
