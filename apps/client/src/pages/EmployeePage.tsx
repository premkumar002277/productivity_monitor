import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { BehaviorIndicator } from "../components/BehaviorIndicator";
import { EmotionBadge } from "../components/EmotionBadge";
import { EmotionMeters } from "../components/EmotionMeters";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../hooks/useAuth";
import { useEmployeeMonitor } from "../hooks/useEmployeeMonitor";
import type { SessionDetails, SessionMetrics, SessionSummary } from "../types/api";

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
}

export function EmployeePage() {
  const queryClient = useQueryClient();
  const { user, logout, apiFetch } = useAuth();
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [monitoringEnabled, setMonitoringEnabled] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const activeSessionQuery = useQuery({
    queryKey: ["employee-active-session"],
    queryFn: () => apiFetch<{ session: SessionSummary | null }>("/api/sessions/active"),
    refetchInterval: monitoringEnabled ? 5_000 : 15_000,
  });

  useEffect(() => {
    if (!sessionId && activeSessionQuery.data?.session?.id) {
      setSessionId(activeSessionQuery.data.session.id);
    }
  }, [activeSessionQuery.data?.session?.id, sessionId]);

  const sessionDetailsQuery = useQuery({
    queryKey: ["employee-session", sessionId],
    queryFn: () => apiFetch<{ session: SessionDetails }>(`/api/sessions/${sessionId}`),
    enabled: Boolean(sessionId),
    refetchInterval: monitoringEnabled ? 5_000 : false,
  });

  const monitor = useEmployeeMonitor({
    enabled: monitoringEnabled,
    sessionId,
    apiFetch,
  });

  const latestMetrics = useMemo<SessionMetrics | null>(() => {
    if (monitor.serverMetrics) {
      return monitor.serverMetrics;
    }

    const session = sessionDetailsQuery.data?.session;

    if (!session) {
      return null;
    }

    const score = session.finalScore ?? 0;
    const totalSeconds = Math.max(1, session.faceSeconds + session.activeSeconds + session.idleSeconds);

    return {
      totalSeconds,
      faceSeconds: session.faceSeconds,
      idleSeconds: session.idleSeconds,
      activeSeconds: session.activeSeconds,
      nonIdleSeconds: Math.max(0, totalSeconds - session.idleSeconds),
      score,
      status: score >= 75 ? "active" : score >= 50 ? "idle" : score >= 25 ? "low" : "away",
      emotion: {
        dominant: null,
        scores: {
          neutral: 0,
          happy: 0,
          sad: 0,
          angry: 0,
          fearful: 0,
          disgusted: 0,
          surprised: 0,
        },
        stressScore: 0,
        engagementScore: 0,
        boredomScore: 0,
        updatedAt: null,
      },
      behavior: {
        yaw: 0,
        pitch: 0,
        roll: 0,
        lookingAway: false,
        lookingAwaySeconds: 0,
        headAwayRatio: 0,
        avgVelocityPx: 0,
        clicksPerMin: 0,
        erraticScore: 0,
        idleSeconds: 0,
        kpm: 0,
        rhythmScore: 0,
        backspaceRate: 0,
        burstDetected: false,
        updatedAt: null,
      },
    };
  }, [monitor.serverMetrics, sessionDetailsQuery.data?.session]);

  const handleStart = async () => {
    setActionError(null);

    try {
      const stream = await monitor.requestCameraAccess();

      if (!stream) {
        return;
      }

      const existingSessionId = activeSessionQuery.data?.session?.id;

      if (existingSessionId) {
        setSessionId(existingSessionId);
        setMonitoringEnabled(true);
        return;
      }

      const session = await apiFetch<{
        id: string;
        startedAt: string;
        endedAt: string | null;
        finalScore: number | null;
      }>("/api/sessions/start", {
        method: "POST",
        body: JSON.stringify({ consentAccepted: true }),
      });

      setSessionId(session.id);
      setMonitoringEnabled(true);
      await queryClient.invalidateQueries({ queryKey: ["employee-active-session"] });
    } catch (startError) {
      monitor.stopCamera();
      setActionError(startError instanceof Error ? startError.message : "Unable to start monitoring.");
    }
  };

  const handleStop = async () => {
    if (!sessionId) {
      return;
    }

    setActionError(null);

    try {
      await monitor.flushNow();
      setMonitoringEnabled(false);
      await apiFetch<{ session: { id: string } }>(`/api/sessions/${sessionId}/stop`, {
        method: "POST",
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["employee-active-session"] }),
        queryClient.invalidateQueries({ queryKey: ["employee-session", sessionId] }),
      ]);
    } catch (stopError) {
      setMonitoringEnabled(false);
      setActionError(stopError instanceof Error ? stopError.message : "Unable to stop monitoring.");
    }
  };

  return (
    <div className="page-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">Employee Monitor</span>
          <h1>{user?.name}</h1>
          <p>{user?.department ?? "No department assigned"}</p>
        </div>

        <div className="topbar__actions">
          <span className="topbar__identity">{user?.email}</span>
          <button type="button" className="ghost-button" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </header>

      <div className="page-grid page-grid--employee">
        <section className="panel panel--hero">
          <div className="panel__header">
            <div>
              <span className="eyebrow">Consent</span>
              <h2>Monitoring only runs while you opt in and keep this workspace open.</h2>
            </div>
            {latestMetrics ? <StatusBadge status={latestMetrics.status} /> : null}
          </div>

          <p className="panel__copy">
            This build captures facial presence, facial expression probabilities, head direction, mouse behavior, and keyboard timing
            metadata. It does not store video frames or the actual keys you type.
          </p>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={consentAccepted}
              onChange={(event) => setConsentAccepted(event.target.checked)}
            />
            <span>I consent to emotion and behavior-aware monitoring while this session is active.</span>
          </label>

          <div className="button-row">
            <button type="button" className="primary-button" disabled={!consentAccepted || monitoringEnabled} onClick={() => void handleStart()}>
              {activeSessionQuery.data?.session?.id && !monitoringEnabled ? "Resume monitoring" : "Start monitoring"}
            </button>
            <button type="button" className="ghost-button" disabled={!sessionId} onClick={() => void handleStop()}>
              Stop session
            </button>
          </div>

          {actionError ? <p className="form-error">{actionError}</p> : null}
          {monitor.error ? <p className="form-error">{monitor.error}</p> : null}
        </section>

        <section className="panel">
          <div className="panel__header">
            <div>
              <span className="eyebrow">Live Capture</span>
              <h2>Browser-side sensor feed</h2>
            </div>
            <span className={`chip chip--${monitor.cameraStatus}`}>Camera {monitor.cameraStatus}</span>
          </div>

          <div className="video-shell">
            <video ref={monitor.videoRef} autoPlay muted playsInline />
          </div>

          <div className="signal-grid signal-grid--wide">
            <article className="signal-card">
              <strong>Face</strong>
              <p>{monitor.signalState.faceDetected ? "Detected" : "Not detected"}</p>
              <span>{monitor.signalState.confidence ? `${Math.round(monitor.signalState.confidence * 100)}% confidence` : "No face score yet"}</span>
            </article>
            <article className="signal-card">
              <strong>Emotion</strong>
              <p>{monitor.emotionState.dominant ?? "No signal"}</p>
              <span>Stress {monitor.emotionState.stressScore}%</span>
            </article>
            <article className="signal-card">
              <strong>Head pose</strong>
              <p>{monitor.headPoseState.lookingAway ? "Looking away" : "Facing screen"}</p>
              <span>Yaw {monitor.headPoseState.yaw.toFixed(2)}</span>
            </article>
            <article className="signal-card">
              <strong>Mouse</strong>
              <p>{monitor.mouseState.avgVelocityPx}px avg velocity</p>
              <span>Erratic {monitor.mouseState.erraticScore.toFixed(2)}</span>
            </article>
            <article className="signal-card">
              <strong>Keyboard</strong>
              <p>{monitor.keyboardState.kpm} KPM</p>
              <span>Rhythm {Math.round(monitor.keyboardState.rhythmScore * 100)}%</span>
            </article>
            <article className="signal-card">
              <strong>Sync</strong>
              <p>{monitor.isSyncing ? "Syncing..." : "Ready"}</p>
              <span>{monitor.lastSyncAt ? `Last batch ${new Date(monitor.lastSyncAt).toLocaleTimeString()}` : `${monitor.queueSize} events queued`}</span>
            </article>
          </div>
        </section>

        <section className="panel">
          <div className="panel__header">
            <div>
              <span className="eyebrow">Current State</span>
              <h2>Emotion and behavior snapshot</h2>
            </div>
          </div>

          <div className="detail-summary-panel">
            <EmotionBadge emotion={latestMetrics?.emotion ?? monitor.emotionState} />
            <EmotionMeters emotion={latestMetrics?.emotion ?? monitor.emotionState} />
            <BehaviorIndicator behavior={latestMetrics?.behavior ?? monitor.serverMetrics?.behavior ?? {
              ...monitor.mouseState,
              ...monitor.keyboardState,
              ...monitor.headPoseState,
              lookingAwaySeconds: 0,
              headAwayRatio: 0,
              updatedAt: monitor.headPoseState.updatedAt,
            }} />
          </div>
        </section>

        <section className="panel">
          <div className="panel__header">
            <div>
              <span className="eyebrow">Server Score</span>
              <h2>Current session snapshot</h2>
            </div>
          </div>

          <div className="metric-grid metric-grid--triple">
            <article className="metric-card">
              <span>Score</span>
              <strong>{latestMetrics?.score ?? 0}</strong>
            </article>
            <article className="metric-card">
              <span>Face seconds</span>
              <strong>{formatDuration(latestMetrics?.faceSeconds ?? 0)}</strong>
            </article>
            <article className="metric-card">
              <span>Focused time</span>
              <strong>{formatDuration(latestMetrics?.activeSeconds ?? 0)}</strong>
            </article>
            <article className="metric-card">
              <span>Stress</span>
              <strong>{latestMetrics?.emotion.stressScore ?? 0}%</strong>
            </article>
            <article className="metric-card">
              <span>Engagement</span>
              <strong>{latestMetrics?.emotion.engagementScore ?? 0}%</strong>
            </article>
            <article className="metric-card">
              <span>Typing rhythm</span>
              <strong>{Math.round((latestMetrics?.behavior.rhythmScore ?? 0) * 100)}%</strong>
            </article>
          </div>
        </section>

        <section className="panel">
          <div className="panel__header">
            <div>
              <span className="eyebrow">Session Events</span>
              <h2>Latest server timeline</h2>
            </div>
          </div>

          <div className="timeline-list">
            {sessionDetailsQuery.data?.session.events.length ? null : <div className="empty-state">Events will appear here after the first batch reaches the API.</div>}
            {sessionDetailsQuery.data?.session.events.slice(-10).reverse().map((event) => (
              <article className="timeline-item" key={event.id}>
                <div>
                  <strong>{event.type.replace(/_/g, " ")}</strong>
                  <p>{new Date(event.timestamp).toLocaleString()}</p>
                </div>
                {event.value ? <pre>{JSON.stringify(event.value, null, 2)}</pre> : <span className="timeline-item__quiet">No payload</span>}
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
