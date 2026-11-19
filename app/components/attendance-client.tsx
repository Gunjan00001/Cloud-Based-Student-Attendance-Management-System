"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Badge, CheckIcon, EmptyState, MinusIcon, PageHeader, Spinner } from "@/components/ui";
import { api, ClientApiError, errorMessage } from "@/lib/client";
import { formatDateTime, formatPercent, toDateTimeLocal } from "@/lib/format";
import { attendancePercent } from "@/lib/metrics";
import type { CourseDetail, SessionDetail, SessionRow } from "@/lib/api-types";
import type { SessionUser } from "@/lib/types";

type Mark = "present" | "absent";
type Status = "ready" | "dirty" | "saving" | "saved" | "conflict" | "error";

export function AttendanceClient({ courseId }: { courseId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");

  const [user, setUser] = useState<SessionUser | null>(null);
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [recent, setRecent] = useState<SessionRow[]>([]);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [savedMarks, setSavedMarks] = useState<Record<string, Mark>>({});
  const [status, setStatus] = useState<Status>("ready");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [startsAt, setStartsAt] = useState(toDateTimeLocal());
  const [topic, setTopic] = useState("");

  const loadSession = useCallback(async (id: string) => {
    const result = await api<{ session: SessionDetail }>(`/api/sessions/${id}`);
    const nextMarks: Record<string, Mark> = {};
    for (const record of result.session.records) nextMarks[record.studentId] = record.status;
    setSession(result.session);
    setMarks(nextMarks);
    setSavedMarks(nextMarks);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const me = await api<{ user: SessionUser }>("/api/me");
        if (me.user.role === "student") {
          router.replace(`/courses/${courseId}`);
          return;
        }
        const detail = await api<{ course: CourseDetail }>(`/api/courses/${courseId}`);
        const sessions = await api<{ sessions: SessionRow[] }>(`/api/courses/${courseId}/sessions?limit=5`);
        if (cancelled) return;
        setUser(me.user);
        setCourse(detail.course);
        setRecent(sessions.sessions);
        if (sessionId) {
          await loadSession(sessionId);
        } else {
          setSession(null);
          setMarks({});
          setSavedMarks({});
        }
      } catch (caught) {
        if (!cancelled) setError(errorMessage(caught));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [courseId, sessionId, loadSession, router]);

  const unmarked = useMemo(
    () => (session ? session.roster.filter((student) => !marks[student.id]).length : 0),
    [session, marks],
  );
  const present = session ? session.roster.filter((student) => marks[student.id] === "present").length : 0;
  const absent = session ? session.roster.filter((student) => marks[student.id] === "absent").length : 0;
  const dirty = session ? session.roster.some((student) => marks[student.id] !== savedMarks[student.id]) : false;
  const readOnly = user?.role === "admin";

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  useEffect(() => {
    if (status === "saved") {
      const timer = setTimeout(() => setStatus(dirty ? "dirty" : "ready"), 2500);
      return () => clearTimeout(timer);
    }
  }, [status, dirty]);

  function markStudent(studentId: string, mark: Mark) {
    setMarks((current) => ({ ...current, [studentId]: mark }));
    if (status !== "conflict") {
      setStatus("dirty");
      setMessage("");
    }
  }

  function markAllPresent() {
    if (!session) return;
    const next: Record<string, Mark> = {};
    for (const student of session.roster) next[student.id] = "present";
    setMarks(next);
    setStatus("dirty");
    setMessage("");
  }

  async function createSession(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError("");
    try {
      const result = await api<{ session: { id: string } }>(`/api/courses/${courseId}/sessions`, {
        method: "POST",
        body: JSON.stringify({ startsAt: new Date(startsAt).toISOString(), topic: topic || undefined }),
      });
      router.replace(`/courses/${courseId}/attendance?session=${result.session.id}`);
    } catch (caught) {
      if (caught instanceof ClientApiError && caught.status === 409) {
        setError("A session already exists at that time. Open it from the recent sessions list.");
        const sessions = await api<{ sessions: SessionRow[] }>(`/api/courses/${courseId}/sessions?limit=5`);
        setRecent(sessions.sessions);
      } else {
        setError(errorMessage(caught));
      }
    } finally {
      setCreating(false);
    }
  }

  async function save() {
    if (!session || unmarked > 0) return;
    setStatus("saving");
    setMessage("");
    try {
      const records = session.roster.map((student) => ({
        studentId: student.id,
        status: marks[student.id] as Mark,
      }));
      const result = await api<{ session: SessionDetail }>(`/api/sessions/${session.id}/attendance`, {
        method: "PUT",
        body: JSON.stringify({ version: session.version, records }),
      });
      setSession((current) =>
        current ? { ...current, version: result.session.version, savedAt: result.session.savedAt } : current,
      );
      setSavedMarks({ ...marks });
      setStatus("saved");
      setMessage("Saved");
    } catch (caught) {
      if (caught instanceof ClientApiError && caught.status === 409) {
        setStatus("conflict");
        setMessage("This session changed on another device. Your marks are still here.");
      } else {
        setStatus("error");
        setMessage(errorMessage(caught));
      }
    }
  }

  async function reloadSaved() {
    if (!session) return;
    setError("");
    try {
      await loadSession(session.id);
      setStatus("ready");
      setMessage("Reloaded the saved register.");
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  if (loading) return <Spinner label="Loading roll call…" />;
  if (error && !course) return <Alert>{error}</Alert>;
  if (!course) return <EmptyState title="Course not found" />;

  if (!session) {
    return (
      <div>
        <Link href={`/courses/${courseId}`} className="text-sm font-medium text-primary">
          ← {course.code}
        </Link>
        <PageHeader title="Take attendance" lead={`${course.title} · ${course.term}`} />
        {error ? (
          <div className="mb-4">
            <Alert>{error}</Alert>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <section className="card">
            <h2 className="text-xl font-semibold">Start a session</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Each session is one class. Starting a session with the same date and time opens the existing one.
            </p>
            <form onSubmit={createSession} className="mt-5 space-y-4">
              <div>
                <label className="label" htmlFor="starts-at">
                  Date and time
                </label>
                <input
                  id="starts-at"
                  className="input"
                  type="datetime-local"
                  value={startsAt}
                  onChange={(event) => setStartsAt(event.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="topic">
                  Topic <span className="font-normal text-ink-muted">(optional)</span>
                </label>
                <input
                  id="topic"
                  className="input"
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  maxLength={200}
                  placeholder="Query planning"
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={creating || course.isArchived}>
                {creating ? <Spinner label="Starting…" /> : "Start roll call"}
              </button>
              {course.isArchived ? <p className="text-sm text-ink-muted">This course is archived.</p> : null}
            </form>
          </section>

          <aside className="card h-fit">
            <h2 className="text-lg font-semibold">Recent sessions</h2>
            {recent.length === 0 ? (
              <p className="mt-3 text-sm text-ink-muted">No sessions yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {recent.map((row) => (
                  <li key={row.id} className="py-3">
                    <Link
                      href={`/courses/${courseId}/attendance?session=${row.id}`}
                      className="font-medium text-primary"
                    >
                      {formatDateTime(row.startsAt)}
                    </Link>
                    <p className="text-sm text-ink-muted">
                      {row.savedAt ? "Saved" : "Draft"} · {row.present} present, {row.absent} absent
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      </div>
    );
  }

  const allMarked = unmarked === 0 && session.roster.length > 0;
  const dailyPercent = allMarked ? attendancePercent(present, session.roster.length) : null;
  const saveDisabled = readOnly || !dirty || !allMarked || status === "saving";

  return (
    <div className="pb-24">
      <Link href={`/courses/${courseId}`} className="text-sm font-medium text-primary">
        ← {course.code}
      </Link>
      <PageHeader
        title={session.topic || "Roll call"}
        lead={`${course.code} · ${course.title} · ${formatDateTime(session.startsAt)}`}
        actions={
          <>
            {session.savedAt ? <Badge tone="present">Saved</Badge> : <Badge>Draft</Badge>}
            <Badge>Version {session.version}</Badge>
          </>
        }
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {status === "conflict" ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-ink bg-surface p-3">
          <p className="text-sm">
            <strong>Newer version available.</strong> This session changed on another device. Your marks are preserved
            below.
          </p>
          <button type="button" className="btn btn-secondary" onClick={reloadSaved}>
            Reload saved register
          </button>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-semibold">Roster</h2>
            {!readOnly ? (
              <button type="button" className="btn btn-secondary" onClick={markAllPresent} disabled={status === "saving"}>
                Mark all present
              </button>
            ) : (
              <Badge>Read-only</Badge>
            )}
          </div>

          {session.roster.length === 0 ? (
            <EmptyState
              title="No students enrolled"
              body="Enroll students in this course before taking attendance for this session."
            />
          ) : (
            <ul className="space-y-2">
              {session.roster.map((student) => {
                const mark = marks[student.id];
                return (
                  <li
                    key={student.id}
                    className="flex flex-col gap-3 rounded-md border border-border bg-bg p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium">{student.fullName}</p>
                      <p className="text-xs text-ink-muted tabular-nums">{student.rollNumber || "No roll number"}</p>
                    </div>
                    {readOnly ? (
                      mark ? (
                        <span className={mark === "present" ? "badge badge-present" : "badge badge-absent"}>
                          {mark === "present" ? <CheckIcon /> : <MinusIcon />}
                          {mark === "present" ? "Present" : "Absent"}
                        </span>
                      ) : (
                        <Badge>Unmarked</Badge>
                      )
                    ) : (
                      <div
                        role="group"
                        aria-label={`${student.fullName} attendance`}
                        className="flex gap-2"
                      >
                        <button
                          type="button"
                          aria-pressed={mark === "present"}
                          aria-label={`${student.fullName}: present`}
                          onClick={() => markStudent(student.id, "present")}
                          className={[
                            "btn min-w-28 border",
                            mark === "present"
                              ? "border-primary bg-primary text-on-primary hover:bg-primary-hover"
                              : "border-border bg-bg text-ink hover:bg-surface",
                          ].join(" ")}
                        >
                          <CheckIcon />
                          Present
                        </button>
                        <button
                          type="button"
                          aria-pressed={mark === "absent"}
                          aria-label={`${student.fullName}: absent`}
                          onClick={() => markStudent(student.id, "absent")}
                          className={[
                            "btn min-w-28 border",
                            mark === "absent"
                              ? "border-absent bg-absent text-on-primary hover:bg-ink"
                              : "border-border bg-bg text-ink hover:bg-surface",
                          ].join(" ")}
                        >
                          <MinusIcon />
                          Absent
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="card h-fit">
          <h2 className="text-lg font-semibold">Session totals</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <dt>Present</dt>
              <dd className="font-semibold tabular-nums">{present}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt>Absent</dt>
              <dd className="font-semibold tabular-nums">{absent}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt>Unmarked</dt>
              <dd className="font-semibold tabular-nums">{unmarked}</dd>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-3">
              <dt>Attendance</dt>
              <dd className="font-semibold tabular-nums">{formatPercent(dailyPercent)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-ink-muted">
            Version {session.version}
            {session.savedAt ? ` · saved ${formatDateTime(session.savedAt)}` : " · not saved yet"}
          </p>
          <Link href={`/reports?course=${courseId}`} className="btn btn-ghost mt-3 w-full justify-start px-0">
            Open course report →
          </Link>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg px-4 pb-[env(safe-area-inset-bottom)] pt-3 lg:left-60">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3">
          <p className="text-sm" aria-live="polite">
            {status === "saving"
              ? "Saving…"
              : status === "saved"
                ? "Saved"
                : status === "conflict"
                  ? "Newer version available"
                  : status === "error"
                    ? message || "Save failed. Your marks are still here."
                    : allMarked
                      ? dirty
                        ? "Unsaved changes"
                        : "All students marked"
                      : `${session.roster.length - unmarked} of ${session.roster.length} marked`}
          </p>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saveDisabled}>
            {status === "saving" ? <Spinner label="Saving…" /> : "Save attendance"}
          </button>
        </div>
      </div>
    </div>
  );
}
