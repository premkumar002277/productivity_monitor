import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { EmotionTimelinePoint } from "../types/api";

type EmotionTimelineChartProps = {
  timeline: EmotionTimelinePoint[];
};

export function EmotionTimelineChart({ timeline }: EmotionTimelineChartProps) {
  if (timeline.length === 0) {
    return <div className="empty-state">No emotion samples yet for the selected date range.</div>;
  }

  return (
    <div className="chart-shell chart-shell--tall">
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={timeline}>
          <CartesianGrid strokeDasharray="4 8" stroke="rgba(17, 50, 48, 0.15)" />
          <XAxis dataKey="timestamp" tickFormatter={(value) => new Date(value).toLocaleTimeString()} stroke="#3e615d" />
          <YAxis domain={[0, 100]} stroke="#3e615d" />
          <Tooltip labelFormatter={(value) => new Date(String(value)).toLocaleString()} />
          <Line type="monotone" dataKey="stressScore" stroke="#bf4932" strokeWidth={3} dot={false} />
          <Line type="monotone" dataKey="engagementScore" stroke="#166a5c" strokeWidth={3} dot={false} />
          <Line type="monotone" dataKey="boredomScore" stroke="#d57916" strokeWidth={3} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
