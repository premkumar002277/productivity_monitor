import { deriveEmotionMetrics } from "../hooks/useEmotionDetector";
import type { EmotionScores, MonitoringEvent } from "../types/api";

type EventCardProps = {
  event: MonitoringEvent;
};

type Tone = "ok" | "warn" | "danger";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getNumber(value: Record<string, unknown>, key: string) {
  return typeof value[key] === "number" ? value[key] : 0;
}

function getBoolean(value: Record<string, unknown>, key: string) {
  return value[key] === true;
}

function getString(value: Record<string, unknown>, key: string) {
  return typeof value[key] === "string" ? value[key] : "";
}

function formatTime(timestamp: string) {
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toLabel(type: string) {
  const lower = type.toLowerCase().replace(/_/g, " ");
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function getMousePattern(erraticScore: number) {
  if (erraticScore > 2) {
    return { tone: "danger" as Tone, label: "High" };
  }

  if (erraticScore > 1) {
    return { tone: "warn" as Tone, label: "Moderate" };
  }

  return { tone: "ok" as Tone, label: "Low" };
}

function getTypingPattern(rhythmScore: number) {
  if (rhythmScore > 0.7) {
    return { tone: "ok" as Tone, label: "Steady" };
  }

  if (rhythmScore > 0.4) {
    return { tone: "warn" as Tone, label: "Variable" };
  }

  return { tone: "danger" as Tone, label: "Erratic" };
}

function renderMetric(label: string, value: string, tone?: Tone) {
  return (
    <div className="event-card__metric">
      <span className="event-card__metric-label">{label}</span>
      {tone ? (
        <span className={`event-card__metric-badge event-card__metric-badge--${tone}`}>{value}</span>
      ) : (
        <span className="event-card__metric-value">{value}</span>
      )}
    </div>
  );
}

export function EventCard({ event }: EventCardProps) {
  const time = formatTime(event.timestamp);
  const value = isRecord(event.value) ? event.value : null;

  if (event.type === "MOUSE_BEHAVIOR" && value) {
    const pattern = getMousePattern(getNumber(value, "erraticScore"));

    return (
      <article className="event-card">
        <div className="event-card__header">
          <span className="event-card__type event-card__type--mouse">Mouse activity</span>
          <span className="event-card__time">{time}</span>
        </div>
        <div className="event-card__metrics">
          {renderMetric("Avg velocity", `${Math.round(getNumber(value, "avgVelocityPx"))} px/s`)}
          {renderMetric("Clicks/min", String(Math.round(getNumber(value, "clicksPerMin"))))}
          {renderMetric("Movement pattern", pattern.label, pattern.tone)}
          {renderMetric("Idle", `${Math.round(getNumber(value, "idleSeconds"))}s`)}
        </div>
      </article>
    );
  }

  if (event.type === "KEYBOARD_BEHAVIOR" && value) {
    const pattern = getTypingPattern(getNumber(value, "rhythmScore"));

    return (
      <article className="event-card">
        <div className="event-card__header">
          <span className="event-card__type event-card__type--keyboard">Keyboard activity</span>
          <span className="event-card__time">{time}</span>
        </div>
        <div className="event-card__metrics">
          {renderMetric("Typing speed", `${Math.round(getNumber(value, "kpm"))} KPM`)}
          {renderMetric("Rhythm", pattern.label, pattern.tone)}
          {renderMetric("Backspace rate", `${Math.round(getNumber(value, "backspaceRate") * 100)}%`)}
          {renderMetric("Burst pattern", getBoolean(value, "burstDetected") ? "Yes" : "No")}
        </div>
      </article>
    );
  }

  if (event.type === "EMOTION_SAMPLE" && value) {
    const rawScores = isRecord(value.scores) ? value.scores : {};
    const scores: EmotionScores = {
      neutral: typeof rawScores.neutral === "number" ? rawScores.neutral : 0,
      happy: typeof rawScores.happy === "number" ? rawScores.happy : 0,
      sad: typeof rawScores.sad === "number" ? rawScores.sad : 0,
      angry: typeof rawScores.angry === "number" ? rawScores.angry : 0,
      fearful: typeof rawScores.fearful === "number" ? rawScores.fearful : 0,
      disgusted: typeof rawScores.disgusted === "number" ? rawScores.disgusted : 0,
      surprised: typeof rawScores.surprised === "number" ? rawScores.surprised : 0,
    };
    const metrics = deriveEmotionMetrics({
      neutral: scores.neutral,
      happy: scores.happy,
      sad: scores.sad,
      angry: scores.angry,
      fearful: scores.fearful,
      disgusted: scores.disgusted,
      surprised: scores.surprised,
    });

    return (
      <article className="event-card">
        <div className="event-card__header">
          <span className="event-card__type event-card__type--emotion">Emotion sample</span>
          <span className="event-card__time">{time}</span>
        </div>
        <div className="event-card__metrics">
          {renderMetric("Dominant", getString(value, "dominant") || "Neutral")}
          {renderMetric("Stress", `${metrics.stressScore}%`)}
          {renderMetric("Engagement", `${metrics.engagementScore}%`)}
          {renderMetric("Boredom", `${metrics.boredomScore}%`)}
        </div>
      </article>
    );
  }

  if (event.type === "HEAD_POSE_SAMPLE" && value) {
    return (
      <article className="event-card event-card--compact">
        <div className="event-card__compact-row">
          <span className="event-card__type event-card__type--headpose">Head pose</span>
          <span className="event-card__time">{time}</span>
        </div>
        <div className="event-card__compact-row">
          <span className={`event-card__metric-badge event-card__metric-badge--${getBoolean(value, "lookingAway") ? "warn" : "ok"}`}>
            {getBoolean(value, "lookingAway") ? "Looking away" : "Facing screen"}
          </span>
          <span className="event-card__metric-value">Yaw {getNumber(value, "yaw").toFixed(2)}</span>
        </div>
      </article>
    );
  }

  if (event.type === "FACE_DETECTED") {
    return (
      <article className="event-card event-card--compact">
        <div className="event-card__compact-row">
          <span className="event-card__type event-card__type--face">Face detected</span>
          <span className="event-card__time">{time}</span>
        </div>
        <span className="event-card__metric-badge event-card__metric-badge--ok">Present</span>
      </article>
    );
  }

  if (event.type === "FACE_LOST") {
    return (
      <article className="event-card event-card--compact">
        <div className="event-card__compact-row">
          <span className="event-card__type event-card__type--away">Face lost</span>
          <span className="event-card__time">{time}</span>
        </div>
        <span className="event-card__metric-badge event-card__metric-badge--danger">Away</span>
      </article>
    );
  }

  if (event.type === "TAB_BLUR" || event.type === "TAB_FOCUS" || event.type === "IDLE_START" || event.type === "IDLE_END") {
    const stateLabel =
      event.type === "TAB_BLUR"
        ? "Browser tab blurred"
        : event.type === "TAB_FOCUS"
          ? "Browser tab focused"
          : event.type === "IDLE_START"
            ? "Employee became idle"
            : "Employee became active";
    const tone = event.type === "TAB_BLUR" || event.type === "IDLE_START" ? "warn" : "ok";

    return (
      <article className="event-card event-card--compact">
        <div className="event-card__compact-row">
          <span className="event-card__type event-card__type--default">{toLabel(event.type)}</span>
          <span className="event-card__time">{time}</span>
        </div>
        <span className={`event-card__metric-badge event-card__metric-badge--${tone}`}>{stateLabel}</span>
      </article>
    );
  }

  return (
    <article className="event-card event-card--compact">
      <div className="event-card__compact-row">
        <span className="event-card__type event-card__type--default">{toLabel(event.type)}</span>
        <span className="event-card__time">{time}</span>
      </div>
      <span className="timeline-item__quiet">No extra details</span>
    </article>
  );
}
