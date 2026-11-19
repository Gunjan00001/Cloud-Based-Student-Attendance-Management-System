"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { Alert, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/client";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword !== confirm) {
      setError("The new passwords do not match.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api("/api/me/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setDone(true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-10">
      <div className="card">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Rollcall</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Change your password</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Your account uses a temporary password. Choose a new password with at least 12 characters.
        </p>

        {done ? (
          <div className="mt-6 space-y-4">
            <Alert variant="success">Password changed. Sign in again with the new password.</Alert>
            <button type="button" className="btn btn-primary w-full" onClick={() => signOut({ callbackUrl: "/login" })}>
              Sign out and sign in
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            {error ? <Alert>{error}</Alert> : null}
            <div>
              <label className="label" htmlFor="current-password">
                Current password
              </label>
              <input
                id="current-password"
                className="input"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="new-password">
                New password
              </label>
              <input
                id="new-password"
                className="input"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                aria-describedby="password-help"
              />
              <p id="password-help" className="mt-1 text-xs text-ink-muted">
                Use 12 to 128 characters.
              </p>
            </div>
            <div>
              <label className="label" htmlFor="confirm-password">
                Confirm new password
              </label>
              <input
                id="confirm-password"
                className="input"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
              Show passwords
            </label>
            <button type="submit" className="btn btn-primary w-full" disabled={saving}>
              {saving ? <Spinner label="Saving…" /> : "Change password"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
