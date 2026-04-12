import type { TeamSummary } from "../types/api";

type AdminSummaryCardsProps = {
  summary: TeamSummary;
};

const summaryItems = (summary: TeamSummary) => [
  {
    label: "Active employees",
    value: String(summary.activeEmployees),
  },
  {
    label: "Team avg stress",
    value: `${summary.avgStress}%`,
  },
  {
    label: "Team avg engagement",
    value: `${summary.avgEngagement}%`,
  },
  {
    label: "Open alerts",
    value: String(summary.openAlerts),
  },
];

export function AdminSummaryCards({ summary }: AdminSummaryCardsProps) {
  return (
    <div className="team-summary-grid">
      {summaryItems(summary).map((item) => (
        <article key={item.label} className="summary-card">
          <span className="summary-card__label">{item.label}</span>
          <strong className="summary-card__value">{item.value}</strong>
        </article>
      ))}
    </div>
  );
}
