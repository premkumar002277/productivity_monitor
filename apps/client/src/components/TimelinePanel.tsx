import { ActivityTimeline } from "./ActivityTimeline";
import { EventCard } from "./EventCard";
import type { TimelineSession } from "../types/api";

type TimelinePanelProps = {
  session: TimelineSession | null;
  loading?: boolean;
};

export function TimelinePanel({ session, loading = false }: TimelinePanelProps) {
  if (loading) {
    return <div className="empty-state">Loading session timeline...</div>;
  }

  if (!session) {
    return <div className="empty-state">Pick an employee card to inspect the latest session timeline.</div>;
  }

  return (
    <div className="timeline-stack">
      <ActivityTimeline events={session.events} sessionStart={session.startedAt} sessionEnd={session.endedAt} />

      <div className="timeline-list">
      {session.events.length === 0 ? <div className="empty-state">No recorded events for this session yet.</div> : null}

        {session.events
          .slice()
          .reverse()
          .map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
      </div>
    </div>
  );
}
