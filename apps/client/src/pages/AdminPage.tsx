import { useDeferredValue, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { buildQuery } from "../api/http";
import { BehaviorChart } from "../components/BehaviorChart";
import { BehaviorIndicator } from "../components/BehaviorIndicator";
import { EmployeeCard } from "../components/EmployeeCard";
import { EmotionBadge } from "../components/EmotionBadge";
import { EmotionMeters } from "../components/EmotionMeters";
import { EmotionTimelineChart } from "../components/EmotionTimelineChart";
import { ScoreChart } from "../components/ScoreChart";
import { TimelinePanel } from "../components/TimelinePanel";
import { useAdminSocket } from "../hooks/useAdminSocket";
import { useAuth } from "../hooks/useAuth";
import type {
  AlertFeedResponse,
  AlertSettings,
  BehaviorTimelinePoint,
  DailyStat,
  DashboardData,
  DashboardEmployee,
  EmotionTimelinePoint,
  TimelineSession,
} from "../types/api";

type DetailTab = "overview" | "emotion" | "behavior";

export function AdminPage() {
  const queryClient = useQueryClient();
  const { user, logout, apiFetch } = useAuth();
  const [department, setDepartment] = useState("");
  const [search, setSearch] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [settingsDraft, setSettingsDraft] = useState<AlertSettings>({
    scoreThreshold: 40,
    durationMinutes: 15,
  });

  const deferredSearch = useDeferredValue(search);
  const detailRange = {
    startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    endDate: new Date().toISOString(),
  };

  const dashboardQuery = useQuery({
    queryKey: ["admin-dashboard", department, deferredSearch],
    queryFn: () =>
      apiFetch<DashboardData>(`/api/admin/employees${buildQuery({ department: department || undefined, search: deferredSearch || undefined })}`),
    refetchInterval: 15_000,
  });

  const alertsQuery = useQuery({
    queryKey: ["admin-alerts"],
    queryFn: () => apiFetch<AlertFeedResponse>("/api/admin/alerts"),
    refetchInterval: 20_000,
  });

  useAdminSocket(Boolean(user));

  useEffect(() => {
    const nextSettings = dashboardQuery.data?.settings ?? alertsQuery.data?.settings;

    if (nextSettings) {
      setSettingsDraft(nextSettings);
    }
  }, [alertsQuery.data?.settings, dashboardQuery.data?.settings]);

  useEffect(() => {
    if (!selectedEmployeeId && dashboardQuery.data?.employees[0]) {
      setSelectedEmployeeId(dashboardQuery.data.employees[0].id);
      setSelectedSessionId(dashboardQuery.data.employees[0].sessionId);
    }
  }, [dashboardQuery.data?.employees, selectedEmployeeId]);

  const selectedEmployee =
    dashboardQuery.data?.employees.find((employee) => employee.id === selectedEmployeeId) ?? dashboardQuery.data?.employees[0] ?? null;

  useEffect(() => {
    if (selectedEmployee?.sessionId) {
      setSelectedSessionId(selectedEmployee.sessionId);
    }
  }, [selectedEmployee?.sessionId]);

  const dailyStatsQuery = useQuery({
    queryKey: ["admin-daily-stats", selectedEmployee?.id],
    queryFn: () => apiFetch<{ stats: DailyStat[] }>(`/api/admin/reports/daily${buildQuery({ userId: selectedEmployee?.id, days: 7 })}`),
    enabled: Boolean(selectedEmployee?.id),
  });

  const timelineQuery = useQuery({
    queryKey: ["admin-timeline", selectedSessionId],
    queryFn: () => apiFetch<{ session: TimelineSession }>(`/api/admin/sessions/${selectedSessionId}/timeline`),
    enabled: Boolean(selectedSessionId),
  });

  const emotionTimelineQuery = useQuery({
    queryKey: ["admin-emotion-timeline", selectedEmployee?.id],
    queryFn: () =>
      apiFetch<{ timeline: EmotionTimelinePoint[] }>(
        `/api/admin/employees/${selectedEmployee?.id}/emotions${buildQuery(detailRange)}`,
      ),
    enabled: Boolean(selectedEmployee?.id),
  });

  const behaviorTimelineQuery = useQuery({
    queryKey: ["admin-behavior-timeline", selectedEmployee?.id],
    queryFn: () =>
      apiFetch<{ timeline: BehaviorTimelinePoint[] }>(
        `/api/admin/employees/${selectedEmployee?.id}/behavior${buildQuery(detailRange)}`,
      ),
    enabled: Boolean(selectedEmployee?.id),
  });

  const saveSettingsMutation = useMutation({
    mutationFn: (payload: AlertSettings) =>
      apiFetch<{ settings: AlertSettings }>("/api/admin/alerts/settings", {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-alerts"] }),
      ]);
    },
  });

  const resolveAlertMutation = useMutation({
    mutationFn: (alertId: string) =>
      apiFetch<{ alert: { id: string; resolved: boolean } }>(`/api/admin/alerts/${alertId}/resolve`, {
        method: "POST",
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-alerts"] }),
      ]);
    },
  });

  const downloadCsv = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleExportSessions = async () => {
    const csv = await apiFetch<string>(`/api/admin/reports/export.csv${buildQuery({ userId: selectedEmployee?.id })}`);
    downloadCsv(csv, "workwatch-report.csv");
  };

  const handleExportEmotions = async () => {
    const csv = await apiFetch<string>(`/api/admin/reports/emotions/csv${buildQuery({ department: department || undefined })}`);
    downloadCsv(csv, "workwatch-emotion-report.csv");
  };

  const departmentOptions = dashboardQuery.data?.departmentAverages.map((item) => item.department) ?? [];

  return (
    <div className="page-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">Admin Dashboard</span>
          <h1>Live productivity and wellbeing command center</h1>
          <p>{user?.email}</p>
        </div>

        <div className="topbar__actions">
          <button type="button" className="ghost-button" onClick={() => void handleExportSessions()}>
            Export sessions CSV
          </button>
          <button type="button" className="ghost-button" onClick={() => void handleExportEmotions()}>
            Export emotions CSV
          </button>
          <button type="button" className="ghost-button" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </header>

      <section className="panel panel--hero">
        <div className="panel__header">
          <div>
            <span className="eyebrow">Filters</span>
            <h2>Scan the team, then drill into emotion and behavior patterns in the same view.</h2>
          </div>
        </div>

        <div className="team-summary-grid">
          <article className="metric-card">
            <span>Active employees</span>
            <strong>{dashboardQuery.data?.teamSummary.activeEmployees ?? 0}</strong>
          </article>
          <article className="metric-card">
            <span>Team avg stress</span>
            <strong>{dashboardQuery.data?.teamSummary.avgStress ?? 0}%</strong>
          </article>
          <article className="metric-card">
            <span>Team avg engagement</span>
            <strong>{dashboardQuery.data?.teamSummary.avgEngagement ?? 0}%</strong>
          </article>
          <article className="metric-card">
            <span>Open alerts</span>
            <strong>{dashboardQuery.data?.teamSummary.openAlerts ?? 0}</strong>
          </article>
        </div>

        <div className="filter-row">
          <label>
            Department
            <select value={department} onChange={(event) => setDepartment(event.target.value)}>
              <option value="">All departments</option>
              {departmentOptions.map((option) => (
                <option key={option} value={option === "Unassigned" ? "" : option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label>
            Search
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or email"
            />
          </label>
        </div>

        <div className="department-grid">
          {dashboardQuery.data?.departmentAverages.map((item) => (
            <article key={item.department} className="metric-card metric-card--department">
              <span>{item.department}</span>
              <strong>{item.averageScore}</strong>
              <small>
                {item.activeEmployees}/{item.employeeCount} active now
              </small>
            </article>
          ))}
        </div>
      </section>

      <div className="page-grid page-grid--admin">
        <section className="panel">
          <div className="panel__header">
            <div>
              <span className="eyebrow">Employees</span>
              <h2>Live workforce map</h2>
            </div>
          </div>

          <div className="employee-list">
            {dashboardQuery.data?.employees.length ? null : <div className="empty-state">No employee records match the current filters.</div>}
            {dashboardQuery.data?.employees.map((employee) => (
              <EmployeeCard
                key={employee.id}
                employee={employee}
                selected={employee.id === selectedEmployee?.id}
                onSelect={(nextEmployee: DashboardEmployee) => {
                  setSelectedEmployeeId(nextEmployee.id);
                  setSelectedSessionId(nextEmployee.sessionId);
                }}
              />
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel__header">
            <div>
              <span className="eyebrow">Selected employee</span>
              <h2>{selectedEmployee?.name ?? "No one selected"}</h2>
            </div>
          </div>

          {selectedEmployee ? (
            <div className="detail-stack">
              <div className="detail-summary-panel">
                <EmotionBadge emotion={selectedEmployee.emotion} />
                <EmotionMeters emotion={selectedEmployee.emotion} />
                <BehaviorIndicator behavior={selectedEmployee.behavior} />
              </div>

              <div className="tab-row">
                <button
                  type="button"
                  className={`tab-button ${detailTab === "overview" ? "tab-button--active" : ""}`}
                  onClick={() => setDetailTab("overview")}
                >
                  Overview
                </button>
                <button
                  type="button"
                  className={`tab-button ${detailTab === "emotion" ? "tab-button--active" : ""}`}
                  onClick={() => setDetailTab("emotion")}
                >
                  Emotion
                </button>
                <button
                  type="button"
                  className={`tab-button ${detailTab === "behavior" ? "tab-button--active" : ""}`}
                  onClick={() => setDetailTab("behavior")}
                >
                  Behavior
                </button>
              </div>

              {detailTab === "overview" ? (
                <>
                  <div className="metric-grid">
                    <article className="metric-card">
                      <span>Current score</span>
                      <strong>{selectedEmployee.score}</strong>
                    </article>
                    <article className="metric-card">
                      <span>Face time</span>
                      <strong>{selectedEmployee.faceSeconds}s</strong>
                    </article>
                    <article className="metric-card">
                      <span>Focused</span>
                      <strong>{selectedEmployee.activeSeconds}s</strong>
                    </article>
                    <article className="metric-card">
                      <span>Idle</span>
                      <strong>{selectedEmployee.idleSeconds}s</strong>
                    </article>
                  </div>

                  <ScoreChart stats={dailyStatsQuery.data?.stats ?? []} />
                  <TimelinePanel session={timelineQuery.data?.session ?? null} loading={timelineQuery.isLoading} />
                </>
              ) : null}

              {detailTab === "emotion" ? (
                <>
                  <div className="metric-grid">
                    <article className="metric-card">
                      <span>Stress</span>
                      <strong>{selectedEmployee.emotion.stressScore}%</strong>
                    </article>
                    <article className="metric-card">
                      <span>Engagement</span>
                      <strong>{selectedEmployee.emotion.engagementScore}%</strong>
                    </article>
                    <article className="metric-card">
                      <span>Boredom</span>
                      <strong>{selectedEmployee.emotion.boredomScore}%</strong>
                    </article>
                    <article className="metric-card">
                      <span>Dominant</span>
                      <strong>{selectedEmployee.emotion.dominant ?? "n/a"}</strong>
                    </article>
                  </div>

                  <EmotionTimelineChart timeline={emotionTimelineQuery.data?.timeline ?? []} />
                </>
              ) : null}

              {detailTab === "behavior" ? (
                <>
                  <div className="metric-grid">
                    <article className="metric-card">
                      <span>Look-away streak</span>
                      <strong>{selectedEmployee.behavior.lookingAwaySeconds}s</strong>
                    </article>
                    <article className="metric-card">
                      <span>Head-away ratio</span>
                      <strong>{Math.round(selectedEmployee.behavior.headAwayRatio * 100)}%</strong>
                    </article>
                    <article className="metric-card">
                      <span>Erratic score</span>
                      <strong>{selectedEmployee.behavior.erraticScore.toFixed(2)}</strong>
                    </article>
                    <article className="metric-card">
                      <span>Typing rhythm</span>
                      <strong>{Math.round(selectedEmployee.behavior.rhythmScore * 100)}%</strong>
                    </article>
                  </div>

                  <BehaviorChart timeline={behaviorTimelineQuery.data?.timeline ?? []} />
                </>
              ) : null}
            </div>
          ) : (
            <div className="empty-state">Choose an employee from the left to inspect trends and session activity.</div>
          )}
        </section>

        <section className="panel">
          <div className="panel__header">
            <div>
              <span className="eyebrow">Alert controls</span>
              <h2>Threshold and response tuning</h2>
            </div>
          </div>

          <form
            className="settings-form"
            onSubmit={(event) => {
              event.preventDefault();
              saveSettingsMutation.mutate(settingsDraft);
            }}
          >
            <label>
              Score threshold
              <input
                type="number"
                min={0}
                max={100}
                value={settingsDraft.scoreThreshold}
                onChange={(event) =>
                  setSettingsDraft((current) => ({
                    ...current,
                    scoreThreshold: Number(event.target.value),
                  }))
                }
              />
            </label>

            <label>
              Breach window (minutes)
              <input
                type="number"
                min={1}
                max={120}
                value={settingsDraft.durationMinutes}
                onChange={(event) =>
                  setSettingsDraft((current) => ({
                    ...current,
                    durationMinutes: Number(event.target.value),
                  }))
                }
              />
            </label>

            <button type="submit" className="primary-button" disabled={saveSettingsMutation.isPending}>
              {saveSettingsMutation.isPending ? "Saving..." : "Save alert settings"}
            </button>
          </form>

          <div className="alert-feed">
            {alertsQuery.data?.alerts.length ? null : <div className="empty-state">No alerts yet. Breaches will appear here.</div>}
            {alertsQuery.data?.alerts.map((alert) => (
              <article className="alert-card" key={alert.id}>
                <div>
                  <strong>{alert.user.name}</strong>
                  <div className="alert-chip-row">
                    <span className={`alert-chip alert-chip--${alert.alertType}`}>{alert.alertType.replace(/_/g, " ")}</span>
                  </div>
                  <p>{alert.reason}</p>
                  <span>{new Date(alert.triggeredAt).toLocaleString()}</span>
                </div>

                {!alert.resolved ? (
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => resolveAlertMutation.mutate(alert.id)}
                    disabled={resolveAlertMutation.isPending}
                  >
                    Resolve
                  </button>
                ) : (
                  <span className="chip chip--resolved">Resolved</span>
                )}
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
