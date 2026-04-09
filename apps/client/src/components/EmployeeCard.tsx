import { BehaviorIndicator } from "./BehaviorIndicator";
import { EmotionBadge } from "./EmotionBadge";
import { EmotionMeters } from "./EmotionMeters";
import { StatusBadge } from "./StatusBadge";
import type { DashboardEmployee } from "../types/api";

type EmployeeCardProps = {
  employee: DashboardEmployee;
  selected: boolean;
  onSelect: (employee: DashboardEmployee) => void;
};

export function EmployeeCard({ employee, selected, onSelect }: EmployeeCardProps) {
  return (
    <button
      type="button"
      className={`employee-card ${selected ? "employee-card--selected" : ""}`}
      onClick={() => onSelect(employee)}
    >
      <div className="employee-card__header">
        <div>
          <h3>{employee.name}</h3>
          <p>{employee.department ?? "Unassigned"}</p>
        </div>
        <StatusBadge status={employee.status} />
      </div>

      <div className="employee-card__badge-row">
        <EmotionBadge emotion={employee.emotion} />
      </div>

      <div className="employee-card__score">
        <strong>{employee.score}</strong>
        <span>/ 100</span>
      </div>

      <div className="employee-card__meter">
        <div className={`employee-card__meter-fill employee-card__meter-fill--${employee.status}`} style={{ width: `${employee.score}%` }} />
      </div>

      <EmotionMeters emotion={employee.emotion} />
      <BehaviorIndicator behavior={employee.behavior} />

      <div className="employee-card__stats">
        <span>Face {employee.faceSeconds}s</span>
        <span>Focus {employee.activeSeconds}s</span>
        <span>Idle {employee.idleSeconds}s</span>
      </div>

      <div className="employee-card__footer">
        <span>{employee.isMonitoring ? "Monitoring live" : "Session closed"}</span>
        <span>{employee.updatedAt ? new Date(employee.updatedAt).toLocaleTimeString() : "No updates"}</span>
      </div>

      {employee.alerts.length > 0 ? (
        <div className="alert-chip-row">
          {employee.alerts.map((alert) => (
            <span key={alert.id} className={`alert-chip alert-chip--${alert.alertType}`}>
              {alert.alertType.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      ) : null}
    </button>
  );
}
