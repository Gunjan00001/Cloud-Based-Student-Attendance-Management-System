"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, Badge, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/client";
import { formatDateTime, formatPercent } from "@/lib/format";
import type { CourseDetail, SessionRow, StudentAttendanceCourse } from "@/lib/api-types";
import type { SessionUser } from "@/lib/types";

export default function CoursePage() {
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;
  const [user, setUser] = useState<SessionUser | null>(null);
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [attendance, setAttendance] = useState<StudentAttendanceCourse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const me = await api<{ user: SessionUser }>("/api/me");
        const detail = await api<{ course: CourseDetail }>(`/api/courses/${courseId}`);
        let rows: SessionRow[] = [];
        let summary: StudentAttendanceCourse | null = null;

        if (me.user.role === "student") {
          const result = await api<{ courses: StudentAttendanceCourse[] }>("/api/students/me/attendance");
          summary = result.courses.find((row) => row.course.id === courseId) ?? null;
        } else {
          const result = await api<{ sessions: SessionRow[] }>(`/api/courses/${courseId}/sessions?limit=20`);
          rows = result.sessions;
        }

        if (cancelled) return;
        setUser(me.user);
        setCourse(detail.course);
        setSessions(rows);
        setAttendance(summary);
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
  }, [courseId]);

  if (loading) return <Spinner label="Loading course…" />;
  if (error) return <Alert>{error}</Alert>;
  if (!course) return <EmptyState title="Course not found" />;

  const staff = user?.role === "admin" || user?.role === "teacher";

  return (
    <div>
      <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">{course.code}</p>
      <PageHeader
        title={course.title}
        lead={`${course.term} · ${course.teacher.fullName} · ${course.enrollmentCount} students`}
        actions={
          <>
            {course.isArchived ? <Badge>Archived</Badge> : null}
            {staff ? (
              <Link
                href={course.isArchived ? `/admin/courses/${course.id}/enrollments` : `/courses/${course.id}/attendance`}
                className="btn btn-primary"
              >
                {course.isArchived ? "Manage enrollments" : user?.role === "admin" ? "Open roll call" : "Take attendance"}
              </Link>
            ) : null}
            {user?.role === "admin" ? (
              <Link href={`/admin/courses/${course.id}/enrollments`} className="btn btn-secondary">
                Enrollments
              </Link>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section>
          <h2 className="mb-3 text-xl font-semibold">{staff ? "Recent sessions" : "Your attendance"}</h2>
          {staff ? (
            sessions.length === 0 ? (
              <EmptyState
                title="No sessions yet"
                body="Start a session and take roll call. A session is saved once every student is marked."
              />
            ) : (
              <div className="card overflow-x-auto p-0">
                <table className="table">
                  <caption>Newest sessions first. Drafts have not been saved.</caption>
                  <thead>
                    <tr>
                      <th scope="col">Date and time</th>
                      <th scope="col">Topic</th>
                      <th scope="col">Status</th>
                      <th scope="col" className="text-right">
                        Present / absent
                      </th>
                      <th scope="col" />
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((session) => (
                      <tr key={session.id}>
                        <th scope="row" className="px-3 py-3 text-left font-medium">
                          <Link href={`/courses/${course.id}/attendance?session=${session.id}`} className="text-primary">
                            {formatDateTime(session.startsAt)}
                          </Link>
                        </th>
                        <td>{session.topic || <span className="text-ink-muted">No topic</span>}</td>
                        <td>{session.savedAt ? <Badge tone="present">Saved</Badge> : <Badge>Draft</Badge>}</td>
                        <td className="text-right tabular-nums">
                          {session.present} / {session.absent}
                        </td>
                        <td className="text-right">
                          <Link href={`/courses/${course.id}/attendance?session=${session.id}`} className="text-sm font-medium text-primary">
                            {session.savedAt ? "View" : "Open"}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : attendance ? (
            <div className="card">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Attendance</p>
              <p className="mt-2 text-5xl font-semibold tabular-nums">{formatPercent(attendance.attendancePercent)}</p>
              <p className="mt-2 text-sm text-ink-muted">
                {attendance.presentSessions} present of {attendance.savedSessions} saved classes.
              </p>
              <Link href="/students/me" className="btn btn-secondary mt-4">
                See all courses
              </Link>
            </div>
          ) : (
            <EmptyState title="No saved sessions yet" body="Your attendance will appear after a teacher saves a class." />
          )}
        </section>

        <aside className="card h-fit">
          <h2 className="text-lg font-semibold">Course details</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-ink-muted">Code</dt>
              <dd className="font-medium">{course.code}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Term</dt>
              <dd className="font-medium">{course.term}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Teacher</dt>
              <dd className="font-medium">{course.teacher.fullName}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Enrolled students</dt>
              <dd className="font-medium tabular-nums">{course.enrollmentCount}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
