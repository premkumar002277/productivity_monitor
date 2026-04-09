import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { BehaviorTimelinePoint } from "../types/api";

type BehaviorChartProps = {
  timeline: BehaviorTimelinePoint[];
};

export function BehaviorChart({ timeline }: BehaviorChartProps) {
  if (timeline.length === 0) {
    return <div className="empty-state">No behavior samples yet for the selected date range.</div>;
  }

  const chartData = timeline.map((point) => ({
    ...point,
    timestampLabel: new Date(point.timestamp).toLocaleTimeString(),
    rhythmPct: Math.round(point.rhythmScore * 100),
    backspacePct: Math.round(point.backspaceRate * 100),
    lookAwayPct: point.lookingAway ? 100 : 0,
  }));

  return (
    <div className="behavior-chart-grid">
      <div className="chart-shell">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="4 8" stroke="rgba(17, 50, 48, 0.15)" />
            <XAxis dataKey="timestampLabel" stroke="#3e615d" />
            <YAxis domain={[0, 100]} stroke="#3e615d" />
            <Tooltip />
            <Line type="monotone" dataKey="lookAwayPct" stroke="#bf4932" strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="erraticScore" stroke="#d57916" strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="rhythmPct" stroke="#166a5c" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-shell">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="4 8" stroke="rgba(17, 50, 48, 0.15)" />
            <XAxis dataKey="timestampLabel" stroke="#3e615d" />
            <YAxis stroke="#3e615d" />
            <Tooltip />
            <Line type="monotone" dataKey="kpm" stroke="#0f6e91" strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="avgVelocityPx" stroke="#6a4a16" strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="backspacePct" stroke="#7a2f6b" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
