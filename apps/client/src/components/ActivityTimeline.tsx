import type { MonitoringEvent } from "../types/api";

type ActivityTimelineProps = {
  events: MonitoringEvent[];
  sessionStart: string;
  sessionEnd: string | null;
};

type TimelineSegment = {
  color: string;
  label: string;
  left: number;
  width: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatEventLabel(type: string) {
  const lower = type.toLowerCase().replace(/_/g, " ");
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function getSegmentColor(event: MonitoringEvent) {
  if (event.type === "FACE_LOST") {
    return "#df6a48";
  }

  if (event.type === "IDLE_START") {
    return "#b5aea0";
  }

  if (event.type === "TAB_BLUR") {
    return "#df8b2d";
  }

  if (event.type === "HEAD_POSE_SAMPLE") {
    const lookingAway = isRecord(event.value) && event.value.lookingAway === true;
    return lookingAway ? "#df8b2d" : "#1b8f6d";
  }

  return "#1b8f6d";
}

export function ActivityTimeline({ events, sessionStart, sessionEnd }: ActivityTimelineProps) {
  if (events.length === 0) {
    return null;
  }

  const sortedEvents = [...events].sort(
    (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
  );
  const startMs = new Date(sessionStart).getTime();
  const fallbackEnd = sortedEvents[sortedEvents.length - 1]?.timestamp ?? sessionStart;
  const endMs = new Date(sessionEnd ?? fallbackEnd).getTime();
  const durationMs = Math.max(1, endMs - startMs);

  const segments: TimelineSegment[] = sortedEvents.map((event, index) => {
    const currentStartMs = new Date(event.timestamp).getTime();
    const nextStartMs =
      index < sortedEvents.length - 1 ? new Date(sortedEvents[index + 1].timestamp).getTime() : Math.max(currentStartMs + 1, endMs);
    const left = ((currentStartMs - startMs) / durationMs) * 100;
    const width = Math.max(1.2, ((nextStartMs - currentStartMs) / durationMs) * 100);

    return {
      color: getSegmentColor(event),
      label: `${formatEventLabel(event.type)} at ${new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
      left,
      width,
    };
  });

  return (
    <section className="activity-timeline">
      <div className="activity-timeline__header">
        <span className="eyebrow">Session map</span>
        <h3>Activity timeline</h3>
      </div>

      <div className="activity-timeline__times">
        <span>{new Date(startMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        <span>{new Date(endMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      </div>

      <div className="activity-timeline__bar">
        {segments.map((segment) => (
          <div
            key={`${segment.label}-${segment.left}`}
            className="activity-timeline__segment"
            title={segment.label}
            style={{
              left: `${segment.left}%`,
              width: `${segment.width}%`,
              background: segment.color,
            }}
          />
        ))}
      </div>

      <div className="activity-timeline__legend">
        <span><i className="activity-timeline__dot activity-timeline__dot--focus" /> Focused</span>
        <span><i className="activity-timeline__dot activity-timeline__dot--away" /> Away</span>
        <span><i className="activity-timeline__dot activity-timeline__dot--warn" /> Distracted</span>
        <span><i className="activity-timeline__dot activity-timeline__dot--idle" /> Idle</span>
      </div>
    </section>
  );
}
