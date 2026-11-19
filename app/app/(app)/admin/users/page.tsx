"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/client";
import { formatDateTime } from "@/lib/format";
import type { AdminUser } from "@/lib/api-types";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [role, setRole] = useState("all");
  const [active, setActive] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const createRef = useRef<HTMLDetailsElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (role !== "all") params.set("role", role);
      if (active !== "all") params.set("active", active);
      const result = await api<{ users: AdminUser[] }>(`/api/admin/users?${params}`);
      setUsers(result.users);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [role, active]);

  useEffect(() => {
    load();
  }, [load]);

  async function createUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    const data = new FormData(event.currentTarget);
    try {
      await api("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email: data.get("email"),
          fullName: data.get("fullName"),
          role: data.get("role"),
          rollNumber: data.get("rollNumber") || null,
          temporaryPassword: data.get("temporaryPassword"),
        }),
      });
      event.currentTarget.reset();
      if (createRef.current) createRef.current.open = false;
      setNotice("User created. They must change the temporary password at first sign-in.");
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function patchUser(user: AdminUser, body: Record<string, unknown>, success: string) {
    setError("");
    setNotice("");
    try {
      await api(`/api/admin/users/${user.id}`, { method: "PATCH", body: JSON.stringify(body) });
      setNotice(success);
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function resetPassword(event: React.FormEvent<HTMLFormElement>, user: AdminUser) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await patchUser(user, { temporaryPassword: data.get("temporaryPassword") }, `Password reset for ${user.fullName}.`);
  }

  const needle = search.trim().toLowerCase();
  const visible = users.filter((user) => {
    if (!needle) return true;
    return (
      user.fullName.toLowerCase().includes(needle) ||
      user.email.toLowerCase().includes(needle) ||
      (user.rollNumber ?? "").toLowerCase().includes(needle)
    );
  });

  return (
    <div>
      <PageHeader
        title="Users"
        lead="Create accounts, reset temporary passwords, and deactivate access. The last active admin cannot be removed."
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {notice ? (
        <div className="mb-4">
          <Alert variant="success">{notice}</Alert>
        </div>
      ) : null}

      <details ref={createRef} className="card mb-6">
        <summary className="cursor-pointer text-lg font-semibold">Create a user</summary>
        <form onSubmit={createUser} className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="new-full-name">
              Full name
            </label>
            <input id="new-full-name" name="fullName" className="input" required maxLength={200} />
          </div>
          <div>
            <label className="label" htmlFor="new-email">
              Email
            </label>
            <input id="new-email" name="email" type="email" className="input" required />
          </div>
          <div>
            <label className="label" htmlFor="new-role">
              Role
            </label>
            <select id="new-role" name="role" className="input" defaultValue="student">
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="new-roll">
              Roll number <span className="font-normal text-ink-muted">(students)</span>
            </label>
            <input id="new-roll" name="rollNumber" className="input" maxLength={40} placeholder="CE07" />
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="new-password">
              Temporary password
            </label>
            <input
              id="new-password"
              name="temporaryPassword"
              type="password"
              className="input"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
              aria-describedby="new-password-help"
            />
            <p id="new-password-help" className="mt-1 text-xs text-ink-muted">
              12 to 128 characters. The user must change it at first sign-in.
            </p>
          </div>
          <div className="md:col-span-2">
            <button type="submit" className="btn btn-primary">
              Create user
            </button>
          </div>
        </form>
      </details>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="user-search">
            Search
          </label>
          <input
            id="user-search"
            className="input"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name, email, or roll number"
          />
        </div>
        <div>
          <label className="label" htmlFor="user-role">
            Role
          </label>
          <select id="user-role" className="input" value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="all">All roles</option>
            <option value="admin">Admin</option>
            <option value="teacher">Teacher</option>
            <option value="student">Student</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="user-active">
            Status
          </label>
          <select id="user-active" className="input" value={active} onChange={(event) => setActive(event.target.value)}>
            <option value="all">All</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
      </div>

      {loading ? (
        <Spinner label="Loading users…" />
      ) : visible.length === 0 ? (
        <EmptyState title="No users found" body="Adjust the filters or create a user." />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <caption>Accounts in this institution.</caption>
            <thead>
              <tr>
                <th scope="col">User</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
                <th scope="col">Last change</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((user) => (
                <tr key={user.id}>
                  <th scope="row" className="px-3 py-3 text-left">
                    <span className="font-medium">{user.fullName}</span>
                    <span className="block text-xs font-normal text-ink-muted">{user.email}</span>
                    {user.rollNumber ? (
                      <span className="block text-xs font-normal text-ink-muted tabular-nums">{user.rollNumber}</span>
                    ) : null}
                  </th>
                  <td>
                    <select
                      aria-label={`Role for ${user.fullName}`}
                      className="input min-h-9 py-1"
                      value={user.role}
                      onChange={(event) => {
                        if (window.confirm(`Change ${user.fullName}'s role to ${event.target.value}?`)) {
                          patchUser(user, { role: event.target.value }, "Role updated.");
                        }
                      }}
                    >
                      <option value="admin">Admin</option>
                      <option value="teacher">Teacher</option>
                      <option value="student">Student</option>
                    </select>
                  </td>
                  <td>
                    <Badge tone={user.isActive ? "present" : "neutral"}>{user.isActive ? "Active" : "Inactive"}</Badge>
                    {user.mustChangePassword ? <span className="ml-2 text-xs text-ink-muted">Must change password</span> : null}
                  </td>
                  <td className="whitespace-nowrap text-xs text-ink-muted">{formatDateTime(user.updatedAt)}</td>
                  <td>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="btn btn-secondary min-h-9 px-2 text-xs"
                        onClick={() => {
                          if (window.confirm(`${user.isActive ? "Deactivate" : "Reactivate"} ${user.fullName}?`)) {
                            patchUser(user, { isActive: !user.isActive }, user.isActive ? "User deactivated." : "User reactivated.");
                          }
                        }}
                      >
                        {user.isActive ? "Deactivate" : "Reactivate"}
                      </button>
                      <details>
                        <summary className="cursor-pointer text-xs font-semibold text-primary">Reset password</summary>
                        <form onSubmit={(event) => resetPassword(event, user)} className="mt-2 flex gap-2">
                          <label className="sr-only" htmlFor={`reset-${user.id}`}>
                            New temporary password for {user.fullName}
                          </label>
                          <input
                            id={`reset-${user.id}`}
                            name="temporaryPassword"
                            type="password"
                            className="input min-h-9 w-44 py-1"
                            minLength={12}
                            maxLength={128}
                            placeholder="Temporary password"
                            required
                          />
                          <button type="submit" className="btn btn-secondary min-h-9 px-2 text-xs">
                            Set
                          </button>
                        </form>
                      </details>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
