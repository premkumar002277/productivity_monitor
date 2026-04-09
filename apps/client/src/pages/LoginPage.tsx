import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../hooks/useAuth";
import type { UserRole } from "../types/api";

type Mode = "login" | "register";

export function LoginPage() {
  const navigate = useNavigate();
  const { user, login, register } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    department: "",
    role: "EMPLOYEE" as UserRole,
  });

  useEffect(() => {
    if (user) {
      navigate(user.role === "ADMIN" ? "/admin" : "/employee", { replace: true });
    }
  }, [navigate, user]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const authenticatedUser =
        mode === "login"
          ? await login({
              email: form.email,
              password: form.password,
            })
          : await register({
              name: form.name,
              email: form.email,
              password: form.password,
              department: form.department || null,
              role: form.role,
            });

      navigate(authenticatedUser.role === "ADMIN" ? "/admin" : "/employee", { replace: true });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Authentication failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-shell">
      <section className="hero-panel">
        <div className="hero-panel__copy">
          <span className="eyebrow">WorkWatch Blueprint</span>
          <h1>Monitor focus responsibly, see productivity live, and keep the stack ready for MySQL + Redis.</h1>
          <p>
            This starter includes employee monitoring, server-side scoring, real-time admin updates, rollup jobs, and
            a role-aware React interface built from the provided blueprint.
          </p>
        </div>

        <div className="hero-panel__grid">
          <article className="mini-panel">
            <strong>Employee client</strong>
            <p>Consent banner, webcam preview, face/tab/idle capture, and event batching every five seconds.</p>
          </article>
          <article className="mini-panel">
            <strong>API + jobs</strong>
            <p>JWT auth, scoring, alerts, Redis-backed live state, daily rollups, and retention cleanup hooks.</p>
          </article>
          <article className="mini-panel">
            <strong>Admin command center</strong>
            <p>Live score cards, threshold controls, trend charts, timeline drill-down, and CSV export.</p>
          </article>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-panel__switcher">
          <button type="button" className={mode === "login" ? "is-active" : ""} onClick={() => setMode("login")}>
            Sign in
          </button>
          <button type="button" className={mode === "register" ? "is-active" : ""} onClick={() => setMode("register")}>
            Create account
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === "register" ? (
            <>
              <label>
                Full name
                <input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Aarav Sharma"
                  required
                />
              </label>

              <label>
                Department
                <input
                  value={form.department}
                  onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))}
                  placeholder="Product, Sales, Design"
                />
              </label>

              <label>
                Role
                <select
                  value={form.role}
                  onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as UserRole }))}
                >
                  <option value="EMPLOYEE">Employee</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </label>
            </>
          ) : null}

          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              placeholder="you@workwatch.local"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              placeholder="Minimum 8 characters"
              required
            />
          </label>

          {error ? <p className="form-error">{error}</p> : null}

          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? "Working..." : mode === "login" ? "Enter workspace" : "Create workspace account"}
          </button>
        </form>

        <p className="auth-note">
          Admin self-registration is enabled in this starter to make local demo/testing easy. Lock that down before a
          real deployment.
        </p>
      </section>
    </div>
  );
}
