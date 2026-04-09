import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DailyStat } from "../types/api";

type ScoreChartProps = {
  stats: DailyStat[];
};

export function ScoreChart({ stats }: ScoreChartProps) {
  if (stats.length === 0) {
    return <div className="empty-state">No daily rollups yet. Once sessions are closed and the job runs, trends appear here.</div>;
  }

  return (
    <div className="chart-shell">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={stats}>
          <CartesianGrid strokeDasharray="4 8" stroke="rgba(17, 50, 48, 0.15)" />
          <XAxis dataKey="date" stroke="#3e615d" />
          <YAxis domain={[0, 100]} stroke="#3e615d" />
          <Tooltip />
          <Line type="monotone" dataKey="avgScore" stroke="#166a5c" strokeWidth={3} dot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
