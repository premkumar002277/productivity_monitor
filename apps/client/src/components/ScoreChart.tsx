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

function DailyTrendsEmptyState() {
  const placeholderBars = [30, 48, 40, 58, 72, 18];

  return (
    <div className="empty-state empty-state--chart">
      <div className="empty-state__chart-bars" aria-hidden="true">
        {placeholderBars.map((height, index) => (
          <div key={height} className={`empty-state__chart-bar ${index === placeholderBars.length - 1 ? "empty-state__chart-bar--ghost" : ""}`}>
            <span style={{ height: `${height}%` }} />
          </div>
        ))}
      </div>

      <div className="empty-state__content">
        <strong>Daily trends will appear here</strong>
        <p>Once this employee has closed sessions and the daily rollup runs, score history will fill this chart automatically.</p>
        <code className="empty-state__hint">npm run rollup:daily</code>
      </div>
    </div>
  );
}

export function ScoreChart({ stats }: ScoreChartProps) {
  if (stats.length === 0) {
    return <DailyTrendsEmptyState />;
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
