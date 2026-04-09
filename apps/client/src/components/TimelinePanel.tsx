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
    <div className="timeline-list">
      {session.events.length === 0 ? <div className="empty-state">No recorded events for this session yet.</div> : null}

      {session.events.map((event) => (
        <article key={event.id} className="timeline-item">
          <div>
            <strong>{event.type.replaceAll("_", " ")}</strong>
            <p>{new Date(event.timestamp).toLocaleString()}</p>
          </div>

          {event.value ? <pre>{JSON.stringify(event.value, null, 2)}</pre> : <span className="timeline-item__quiet">No payload</span>}
        </article>
      ))}
    </div>
  );
}
