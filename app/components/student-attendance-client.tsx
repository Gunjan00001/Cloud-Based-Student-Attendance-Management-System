"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/client";
import { formatDateTime, formatPercent } from "@/lib/format";
import type { StudentAttendanceCourse } from "@/lib/api-types";
import type { SessionUser } from "@/lib/types";

export function StudentAttendanceClient({ studentId }: { studentId: string }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [courses, setCourses] = useState<StudentAttendanceCourse[]>([]);
  const [dataAsOf, setDataAsOf] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const me = await api<{ user: SessionUser }>("/api/me");
        let path: string | null = null;
        if (studentId === "me" && me.user.role === "student") path = "/api/students/me/attendance";
        else if (studentId !== "me") path = `/api/students/${studentId}/attendance`;

        if (!path) {
          if (!cancelled) {
            setUser(me.user);
            setError("Choose a student from a course report to view their attendance.");
          }
          return;
        }

        const result = await api<{ courses: StudentAttendanceCourse[]; dataAsOf: string }>(path);
        if (cancelled) return;
        setUser(me.user);
        setCourses(result.courses);
        setDataAsOf(result.dataAsOf);
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
  }, [studentId]);

  if (loading) return <Spinner label="Loading attendance…" />;

  return (
    <div>
      <PageHeader
        title={studentId === "me" ? "My attendance" : "Student attendance"}
        lead={
          dataAsOf
            ? `From the read replica at ${formatDateTime(dataAsOf)}. Only saved classes count.`
            : "Only saved classes count."
        }
        actions={
          user?.role === "student" ? (
            <Link href="/courses" className="btn btn-secondary">
              My courses
            </Link>
          ) : (
            <Link href="/reports" className="btn btn-secondary">
              Reports
            </Link>
          )
        }
      />

      {error ? <Alert>{error}</Alert> : null}

      {!error && courses.length === 0 ? (
        <EmptyState
          title="No saved sessions yet"
          body="Attendance appears after a teacher saves the first class."
          action={
            <Link href="/courses" className="btn btn-secondary">
              Back to courses
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {courses.map((row) => (
            <article key={row.course.id} className="card">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">{row.course.code}</p>
              <h2 className="mt-1 text-lg font-semibold">{row.course.title}</h2>
              <p className="text-sm text-ink-muted">{row.course.term}</p>
              <p className="mt-4 text-4xl font-semibold tabular-nums">{formatPercent(row.attendancePercent)}</p>
              <p className="mt-1 text-sm text-ink-muted">
                {row.presentSessions} present of {row.savedSessions} saved classes
              </p>
              {user?.role !== "student" ? (
                <Link href={`/courses/${row.course.id}`} className="mt-4 inline-block text-sm font-medium text-primary">
                  Open course →
                </Link>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
