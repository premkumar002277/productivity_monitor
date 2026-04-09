import type { BehaviorSnapshot } from "../types/api";

type BehaviorIndicatorProps = {
  behavior: BehaviorSnapshot;
};

function getMouseLabel(erraticScore: number) {
  if (erraticScore > 2.5) {
    return "Mouse erratic";
  }

  if (erraticScore > 1.2) {
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

export function BehaviorIndicator({ behavior }: BehaviorIndicatorProps) {
  return (
    <div className="behavior-indicator-row">
      <span className={`behavior-pill ${behavior.lookingAway ? "behavior-pill--warn" : "behavior-pill--ok"}`}>
        {behavior.lookingAway ? `Looking away ${behavior.lookingAwaySeconds}s` : "Looking at screen"}
      </span>
      <span className={`behavior-pill ${behavior.erraticScore > 2.5 ? "behavior-pill--warn" : "behavior-pill--ok"}`}>
        {getMouseLabel(behavior.erraticScore)}
      </span>
      <span className={`behavior-pill ${behavior.rhythmScore < 0.4 ? "behavior-pill--warn" : "behavior-pill--ok"}`}>
        {getTypingLabel(behavior.rhythmScore)}
      </span>
    </div>
  );
}
