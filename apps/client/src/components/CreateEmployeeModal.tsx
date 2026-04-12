import { useState, type FormEvent } from "react";

import { useAuth } from "../hooks/useAuth";
import type { ManagedEmployeeAccount } from "../types/api";

type CreateEmployeeModalProps = {
  onClose: () => void;
  onCreated: (employee: ManagedEmployeeAccount) => void | Promise<void>;
};

export function CreateEmployeeModal({ onClose, onCreated }: CreateEmployeeModalProps) {
  const { apiFetch } = useAuth();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    department: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await apiFetch<{ employee: ManagedEmployeeAccount }>("/api/admin/employees/create", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          department: form.department || null,
        }),
      });

      await onCreated(response.employee);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not create employee account.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-employee-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel__header">
          <div>
            <span className="eyebrow">Add employee</span>
            <h2 id="create-employee-title">Create a managed employee account</h2>
          </div>

          <button type="button" className="ghost-button" onClick={onClose}>
            Close
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
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
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              placeholder="aarav@workwatch.local"
              required
            />
          </label>

          <label>
            Temporary password
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              placeholder="Minimum 8 characters"
              minLength={8}
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

          {error ? <p className="form-error">{error}</p> : null}

          <div className="button-row">
            <button type="submit" className="primary-button" disabled={submitting}>
              {submitting ? "Creating..." : "Create employee"}
            </button>
            <button type="button" className="ghost-button" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default CreateEmployeeModal;
