"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BarList, Donut, TrendLine } from "@/components/charts";
import { Alert, EmptyState, PageHeader, Spinner, Stat } from "@/components/ui";
import { api, errorMessage } from "@/lib/client";
import { formatDate, formatPercent } from "@/lib/format";
import { attendancePercent } from "@/lib/metrics";
import type { CourseSummary, InstitutionAnalytics, ReportResponse, StudentAttendanceCourse } from "@/lib/api-types";
import type { SessionUser } from "@/lib/types";

export function AnalyticsClient() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Student
  const [attendance, setAttendance] = useState<StudentAttendanceCourse[]>([]);
  const [dataAsOf, setDataAsOf] = useState<string | null>(null);

  // Teacher (and admin inspecting a course)
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [courseId, setCourseId] = useState("");
  const [report, setReport] = useState<ReportResponse | null>(null);

  // Admin
  const [institution, setInstitution] = useState<InstitutionAnalytics | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const me = await api<{ user: SessionUser }>("/api/me");
        if (cancelled) return;
        setUser(me.user);

        if (me.user.role === "student") {
          const result = await api<{ courses: StudentAttendanceCourse[]; dataAsOf: string }>(
            "/api/students/me/attendance",
          );
          if (cancelled) return;
          setAttendance(result.courses);
          setDataAsOf(result.dataAsOf);
        } else {
          const list = await api<{ courses: CourseSummary[] }>(
            `/api/courses?limit=100${me.user.role === "admin" ? "&includeArchived=true" : ""}`,
          );
          if (cancelled) return;
          setCourses(list.courses);
          if (list.courses[0]) setCourseId(list.courses[0].id);
          if (me.user.role === "admin") {
            const analytics = await api<InstitutionAnalytics>("/api/reports/institution");
            if (cancelled) return;
            setInstitution(analytics);
          }
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
  }, []);

  useEffect(() => {
    if (!courseId || user?.role === "admin") return;
    let cancelled = false;
    async function loadReport() {
      setError("");
      try {
        const result = await api<ReportResponse>(`/api/reports/courses/${courseId}/summary`);
        if (!cancelled) setReport(result);
      } catch (caught) {
        if (!cancelled) setError(errorMessage(caught));
      }
    }
    loadReport();
    return () => {
      cancelled = true;
    };
  }, [courseId, user?.role]);

  if (loading) return <Spinner label="Loading analytics…" />;

  const header = (
    <>
      <PageHeader
        title="Analytics"
        lead="Charts read from the read replica and cover saved classes only. Blue is present, black is absent."
      />
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
    </>
  );

  if (user?.role === "student") {
    const totalPresent = attendance.reduce((sum, row) => sum + row.presentSessions, 0);
    const totalSaved = attendance.reduce((sum, row) => sum + row.savedSessions, 0);
    const overall = attendancePercent(totalPresent, totalSaved);
    const best = [...attendance].sort((a, b) => (b.attendancePercent ?? -1) - (a.attendancePercent ?? -1))[0];

    return (
      <div>
        {header}
        {attendance.length === 0 ? (
          <EmptyState title="No saved sessions yet" body="Your analytics appear after a teacher saves the first class." />
        ) : (
          <div className="space-y-6">
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="card">
                <Donut
                  segments={[
                    { value: totalPresent, tone: "primary" },
                    { value: Math.max(0, totalSaved - totalPresent), tone: "absent" },
                  ]}
                  center={formatPercent(overall)}
                  label="overall attendance"
                />
                <p className="mt-3 text-center text-xs text-ink-muted">
                  {totalPresent} present of {totalSaved} saved classes
                </p>
              </div>
              <Stat label="Courses" value={attendance.length} />
              <Stat
                label="Best course"
                value={best?.course.code ?? "—"}
                note={best ? formatPercent(best.attendancePercent) : undefined}
              />
              <Stat
                label="Data as of"
                value={dataAsOf ? formatDate(dataAsOf) : "—"}
                note="From the read replica"
              />
            </section>

            <section className="card">
              <h2 className="mb-4 text-xl font-semibold">Attendance by course</h2>
              <BarList
                label="Attendance percentage per course"
                items={attendance.map((row) => ({
                  label: `${row.course.code} · ${row.course.title}`,
                  value: row.attendancePercent ?? 0,
                  display: `${row.presentSessions}/${row.savedSessions} · ${formatPercent(row.attendancePercent)}`,
                }))}
              />
            </section>
          </div>
        )}
      </div>
    );
  }

  if (user?.role === "admin" && institution) {
    const { users, courses: courseCounts, attendance, perCourse } = institution;
    const totalMarks = attendance.present + attendance.absent;
    const overall = attendancePercent(attendance.present, totalMarks);

    return (
      <div>
        {header}
        <div className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="card">
              <Donut
                segments={[
                  { value: attendance.present, tone: "primary" },
                  { value: attendance.absent, tone: "absent" },
                ]}
                center={formatPercent(overall)}
                label="institution attendance"
              />
              <p className="mt-3 text-center text-xs text-ink-muted">
                {attendance.present} present · {attendance.absent} absent
              </p>
            </div>
            <Stat label="Saved classes" value={attendance.savedSessions} note="Across all courses" />
            <Stat label="Active users" value={`${users.activeUsers}/${users.admins + users.teachers + users.students}`} note="Deactivated accounts excluded" />
            <Stat
              label="Courses"
              value={courseCounts.total}
              note={courseCounts.archived > 0 ? `${courseCounts.archived} archived` : "None archived"}
            />
          </section>

          <section className="card">
            <h2 className="mb-4 text-xl font-semibold">People</h2>
            <BarList
              label="User counts by role"
              items={[
                { label: "Students", value: users.students, display: String(users.students) },
                { label: "Teachers", value: users.teachers, display: String(users.teachers) },
                { label: "Admins", value: users.admins, display: String(users.admins) },
              ]}
            />
            <p className="mt-3 text-xs text-ink-muted">
              Manage people in <Link href="/admin/users" className="text-primary">Admin · Users</Link>.
            </p>
          </section>

          <section className="card">
            <h2 className="mb-4 text-xl font-semibold">Attendance by course</h2>
            <BarList
              label="Attendance percentage per course"
              items={perCourse.map((course) => ({
                label: course.code,
                value: attendancePercent(course.present, course.present + course.absent) ?? 0,
                display: `${course.savedSessions} classes · ${formatPercent(attendancePercent(course.present, course.present + course.absent))}`,
              }))}
            />
            <p className="mt-3 text-xs text-ink-muted">
              Updated from the read replica at {formatDate(institution.dataAsOf)}
              {institution.replicaLagMs != null ? ` (lag ${institution.replicaLagMs} ms)` : ""}.
            </p>
          </section>
        </div>
      </div>
    );
  }

  // Teacher (admin also lands here via the course picker below the institution view).
  const trendPoints = (report?.trend ?? []).map((point) => ({
    label: formatDate(point.startsAt),
    value: attendancePercent(point.present, point.present + point.absent) ?? 0,
  }));
  const reportPresent = report?.trend.reduce((sum, point) => sum + point.present, 0) ?? 0;
  const reportAbsent = report?.trend.reduce((sum, point) => sum + point.absent, 0) ?? 0;
  const reportOverall = attendancePercent(reportPresent, reportPresent + reportAbsent);

  return (
    <div>
      {header}
      {courses.length === 0 ? (
        <EmptyState title="No courses available" body="Analytics appear once an admin creates a course." />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="analytics-course">
                Course
              </label>
              <select
                id="analytics-course"
                className="input"
                value={courseId}
                onChange={(event) => {
                  setCourseId(event.target.value);
                  setReport(null);
                }}
              >
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.code} · {course.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {report ? (
            <>
              <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="card">
                  <Donut
                    segments={[
                      { value: reportPresent, tone: "primary" },
                      { value: reportAbsent, tone: "absent" },
                    ]}
                    center={formatPercent(reportOverall)}
                    label="course attendance"
                  />
                  <p className="mt-3 text-center text-xs text-ink-muted">
                    {reportPresent} present · {reportAbsent} absent
                  </p>
                </div>
                <Stat label="Saved classes" value={report.savedSessions} />
                <Stat
                  label="Students"
                  value={report.students.length}
                  note="Counted in the enrollment window"
                />
                <Stat
                  label="Data as of"
                  value={formatDate(report.dataAsOf)}
                  note={report.replicaLagMs != null ? `Replica lag ${report.replicaLagMs} ms` : "From the read replica"}
                />
              </section>

              <section className="card">
                <h2 className="mb-4 text-xl font-semibold">Class-by-class trend</h2>
                <TrendLine points={trendPoints} label="Attendance percentage per saved class" />
              </section>

              <section className="card">
                <h2 className="mb-4 text-xl font-semibold">Attendance by student</h2>
                <BarList
                  label="Attendance percentage per student"
                  items={report.students.map((student) => ({
                    label: `${student.fullName}${student.rollNumber ? ` (${student.rollNumber})` : ""}`,
                    value: student.attendancePercent ?? 0,
                    display: `${student.presentSessions}/${student.countedSessions} · ${formatPercent(student.attendancePercent)}`,
                  }))}
                />
                <p className="mt-3 text-xs text-ink-muted">
                  Full table in <Link href={`/reports?course=${courseId}`} className="text-primary">Reports</Link>.
                </p>
              </section>
            </>
          ) : (
            <Spinner label="Building course analytics…" />
          )}
        </div>
      )}
    </div>
  );
}
