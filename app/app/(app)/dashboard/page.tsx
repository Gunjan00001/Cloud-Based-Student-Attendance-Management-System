"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, EmptyState, PageHeader, Spinner, Stat } from "@/components/ui";
import { api, errorMessage } from "@/lib/client";
import type { CourseSummary, StudentAttendanceCourse } from "@/lib/api-types";
import type { SessionUser } from "@/lib/types";
import { attendancePercent } from "@/lib/metrics";
import { formatPercent } from "@/lib/format";

export default function DashboardPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [attendance, setAttendance] = useState<StudentAttendanceCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const me = await api<{ user: SessionUser }>("/api/me");
        const list = await api<{ courses: CourseSummary[] }>("/api/courses?limit=100");
        let summary: StudentAttendanceCourse[] = [];
        if (me.user.role === "student") {
          const result = await api<{ courses: StudentAttendanceCourse[] }>("/api/students/me/attendance");
          summary = result.courses;
        }
        if (cancelled) return;
        setUser(me.user);
        setCourses(list.courses);
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
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = user?.fullName.split(" ")[0] ?? "";
  const totalPresent = attendance.reduce((sum, row) => sum + row.presentSessions, 0);
  const totalSaved = attendance.reduce((sum, row) => sum + row.savedSessions, 0);

  return (
    <div>
      <PageHeader
        title={loading ? "Dashboard" : `${greeting}, ${firstName}`}
        lead="Pick up where you left off. Everything here is scoped to your role."
      />

      {error ? <Alert>{error}</Alert> : null}
      {loading ? (
        <Spinner label="Loading dashboard…" />
      ) : (
        <div className="space-y-8">
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Summary">
            <Stat label="Courses" value={courses.length} note="Active courses you can see" />
            <Stat label="Role" value={user?.role ?? "—"} note="Your access level" />
            {user?.role === "student" ? (
              <>
                <Stat
                  label="Attendance"
                  value={formatPercent(attendancePercent(totalPresent, totalSaved))}
                  note={`${totalPresent} present of ${totalSaved} saved classes`}
                />
                <Stat label="Courses tracked" value={attendance.length} note="Courses with an enrollment" />
              </>
            ) : user?.role === "teacher" ? (
              <>
                <Stat label="Next action" value="Roll call" note="Open a course and start a session" />
                <Link href="/courses" className="card flex flex-col justify-center hover:bg-surface">
                  <span className="text-sm font-semibold text-primary">Take attendance →</span>
                  <span className="mt-1 text-xs text-ink-muted">Choose one of your courses.</span>
                </Link>
              </>
            ) : (
              <>
                <Link href="/admin/users" className="card flex flex-col justify-center hover:bg-surface">
                  <span className="text-sm font-semibold text-primary">Manage users →</span>
                  <span className="mt-1 text-xs text-ink-muted">Create, reset, or deactivate accounts.</span>
                </Link>
                <Link href="/admin/courses" className="card flex flex-col justify-center hover:bg-surface">
                  <span className="text-sm font-semibold text-primary">Manage courses →</span>
                  <span className="mt-1 text-xs text-ink-muted">Courses, teachers, and enrollments.</span>
                </Link>
              </>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-end justify-between gap-3">
              <h2 className="text-xl font-semibold">Your courses</h2>
              <Link href="/courses" className="text-sm font-medium text-primary">
                View all
              </Link>
            </div>
            {courses.length === 0 ? (
              <EmptyState title="No courses yet" body="An admin will create courses and enrollments for this term." />
            ) : (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {courses.slice(0, 6).map((course) => {
                  const summary = attendance.find((row) => row.course.id === course.id);
                  return (
                    <Link key={course.id} href={`/courses/${course.id}`} className="card hover:bg-surface">
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary">{course.code}</p>
                      <p className="mt-1 text-lg font-semibold">{course.title}</p>
                      <p className="mt-1 text-sm text-ink-muted">
                        {course.term} · {course.teacher.fullName}
                      </p>
                      <p className="mt-3 text-sm">
                        {summary
                          ? `${formatPercent(summary.attendancePercent)} attendance`
                          : `${course.enrollmentCount} students`}
                      </p>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          {user?.role === "student" && attendance.length > 0 ? (
            <section>
              <h2 className="mb-3 text-xl font-semibold">Attendance by course</h2>
              <div className="card overflow-x-auto p-0">
                <table className="table">
                  <caption>Only saved classes count toward these percentages.</caption>
                  <thead>
                    <tr>
                      <th scope="col">Course</th>
                      <th scope="col">Present</th>
                      <th scope="col">Saved classes</th>
                      <th scope="col" className="text-right">
                        Attendance
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendance.map((row) => (
                      <tr key={row.course.id}>
                        <th scope="row" className="px-3 py-3 text-left font-medium">
                          {row.course.code} · {row.course.title}
                        </th>
                        <td className="tabular-nums">{row.presentSessions}</td>
                        <td className="tabular-nums">{row.savedSessions}</td>
                        <td className="text-right tabular-nums">{formatPercent(row.attendancePercent)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
