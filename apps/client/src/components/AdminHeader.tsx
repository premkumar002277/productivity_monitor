import { useEffect, useRef, useState } from "react";

import type { AuthUser } from "../types/api";

type AdminHeaderProps = {
  user: AuthUser | null;
  onAddEmployee: () => void;
  onExportSessions: () => void | Promise<void>;
  onExportEmotions: () => void | Promise<void>;
  onLogout: () => void | Promise<void>;
};

export function AdminHeader({ user, onAddEmployee, onExportSessions, onExportEmotions, onLogout }: AdminHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
    };
  }, [menuOpen]);

  const userInitial = user?.name?.charAt(0).toUpperCase() ?? user?.email?.charAt(0).toUpperCase() ?? "A";

  return (
    <header className="admin-header">
      <div className="admin-header__left">
        <div className="admin-header__logo">WorkWatch</div>
        <div>
          <span className="eyebrow">Admin Dashboard</span>
          <h1>Live productivity and wellbeing command center</h1>
          <p className="admin-header__subtitle">Track live signals, review trends, and manage your team from one view.</p>
        </div>
      </div>

      <div className="admin-header__right">
        <div className="admin-header__export-group">
          <button type="button" className="ghost-button ghost-button--small" onClick={() => void onExportSessions()}>
            Export sessions
          </button>
          <button type="button" className="ghost-button ghost-button--small" onClick={() => void onExportEmotions()}>
            Export emotions
          </button>
        </div>

        <button type="button" className="primary-button" onClick={onAddEmployee}>
          Add employee
        </button>

        <div className="user-menu" ref={menuRef}>
          <button
            type="button"
            className={`user-menu__trigger ${menuOpen ? "user-menu__trigger--open" : ""}`}
            onClick={() => setMenuOpen((current) => !current)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <span className="user-avatar">{userInitial}</span>
            <span className="user-menu__email">{user?.email ?? "Admin account"}</span>
          </button>

          {menuOpen ? (
            <div className="user-dropdown" role="menu">
              <div className="user-dropdown__info">
                <strong>{user?.name ?? "Admin"}</strong>
                <span>{user?.email ?? "No email available"}</span>
              </div>

              <button
                type="button"
                className="user-dropdown__item user-dropdown__item--danger"
                onClick={() => {
                  setMenuOpen(false);
                  void onLogout();
                }}
                role="menuitem"
              >
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
