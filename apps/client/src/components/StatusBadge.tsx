import type { ProductivityStatus } from "../types/api";

type StatusBadgeProps = {
  status: ProductivityStatus;
};

const labels: Record<ProductivityStatus, string> = {
  active: "High",
  idle: "Moderate",
  away: "Low",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return <span className={`status-badge status-badge--${status}`}>{labels[status]}</span>;
}
