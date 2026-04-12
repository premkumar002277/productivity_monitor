import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../hooks/useAuth";

type Mode = "login" | "register";

type LoginPageProps = {
  initialMode?: Mode;
};

export function LoginPage({ initialMode = "login" }: LoginPageProps) {
  const navigate = useNavigate();
  const { user, login, register } = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (user) {
      navigate(user.role === "ADMIN" ? "/admin" : "/employee", { replace: true });
    }
  }, [navigate, user]);

  const handleModeChange = (nextMode: Mode) => {
    setMode(nextMode);
    setError(null);
    navigate(nextMode === "login" ? "/login" : "/register", { replace: true });
  };

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
          <span className="eyebrow">WorkWatch</span>
          <h1>Monitor focus responsibly, see productivity live</h1>
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
          <button type="button" className={mode === "login" ? "is-active" : ""} onClick={() => handleModeChange("login")}>
            Sign in
          </button>
          <button
            type="button"
            className={mode === "register" ? "is-active" : ""}
            onClick={() => handleModeChange("register")}
          >
            Create admin account
          </button>
        </div>

        <div className="auth-panel__intro">
          <span className="eyebrow">{mode === "login" ? "Welcome back" : "Admin setup"}</span>
          <h2>{mode === "login" ? "Sign in to your workspace" : "Create admin account"}</h2>
          <p>
            {mode === "login"
              ? "Use your admin or employee credentials to continue."
              : "Public registration is limited to admin accounts. Add employees after signing in from the admin dashboard."}
          </p>
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
            {submitting ? "Working..." : mode === "login" ? "Enter workspace" : "Create admin account"}
          </button>
        </form>

        <p className="auth-note">
          Employees no longer self-register here. Team members are created and managed by an admin after sign-in.
        </p>
      </section>
    </div>
  );
}
