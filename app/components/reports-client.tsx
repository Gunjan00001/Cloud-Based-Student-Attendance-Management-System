"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Alert, EmptyState, PageHeader, Spinner, Stat } from "@/components/ui";
import { api, errorMessage } from "@/lib/client";
import { formatDateTime, formatPercent } from "@/lib/format";
import { attendancePercent } from "@/lib/metrics";
import type { CourseSummary, ReportResponse } from "@/lib/api-types";
import type { SessionUser } from "@/lib/types";

export function ReportsClient() {
  const searchParams = useSearchParams();
  const initialCourse = searchParams.get("course") ?? "";
  const [user, setUser] = useState<SessionUser | null>(null);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [courseId, setCourseId] = useState(initialCourse);
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [sort, setSort] = useState<"name" | "percent">("name");
  const [loading, setLoading] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const me = await api<{ user: SessionUser }>("/api/me");
        const archived = me.user.role === "admin" ? "&includeArchived=true" : "";
        const list = await api<{ courses: CourseSummary[] }>(`/api/courses?limit=100${archived}`);
        if (cancelled) return;
        setUser(me.user);
        setCourses(list.courses);
        if (!initialCourse && list.courses[0]) setCourseId(list.courses[0].id);
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
  }, [initialCourse]);

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    async function loadReport() {
      setLoadingReport(true);
      setError("");
      try {
        const result = await api<ReportResponse>(`/api/reports/courses/${courseId}/summary`);
        if (!cancelled) setReport(result);
      } catch (caught) {
        if (!cancelled) setError(errorMessage(caught));
      } finally {
        if (!cancelled) setLoadingReport(false);
      }
    }
    loadReport();
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  const students = useMemo(() => {
    if (!report) return [];
    return [...report.students].sort((a, b) => {
      if (sort === "name") return a.fullName.localeCompare(b.fullName);
      return (b.attendancePercent ?? -1) - (a.attendancePercent ?? -1);
    });
  }, [report, sort]);

  const totalPresent = report?.students.reduce((sum, row) => sum + row.presentSessions, 0) ?? 0;
  const totalCounted = report?.students.reduce((sum, row) => sum + row.countedSessions, 0) ?? 0;

  if (loading) return <Spinner label="Loading reports…" />;

  return (
    <div>
      <PageHeader title="Reports" lead="Read from the read replica. Saved classes only; drafts do not count." />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {courses.length === 0 ? (
        <EmptyState title="No courses available" body="Reports appear after an admin creates courses." />
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-[1fr_220px]">
            <div>
              <label className="label" htmlFor="report-course">
                Course
              </label>
              <select
                id="report-course"
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
            <div>
              <label className="label" htmlFor="report-sort">
                Sort
              </label>
              <select
                id="report-sort"
                className="input"
                value={sort}
                onChange={(event) => setSort(event.target.value as "name" | "percent")}
              >
                <option value="name">Name</option>
                <option value="percent">Attendance</option>
              </select>
            </div>
          </div>

          {loadingReport ? (
            <Spinner label="Building report…" />
          ) : report ? (
            <div className="space-y-6">
              <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Report summary">
                <Stat label="Saved classes" value={report.savedSessions} />
                <Stat label="Students" value={report.students.length} />
                <Stat label="Overall attendance" value={formatPercent(attendancePercent(totalPresent, totalCounted))} />
                <Stat
                  label="Data as of"
                  value={new Date(report.dataAsOf).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  note={report.replicaLagMs != null ? `Replica lag ${report.replicaLagMs} ms` : "Replica timestamp unavailable"}
                />
              </section>

              <p className="text-sm text-ink-muted">
                Updated from read replica at {formatDateTime(report.dataAsOf)}. This report may be seconds behind the
                register. Zero saved classes show an em dash, not 0%.
              </p>

              {report.students.length === 0 ? (
                <EmptyState title="No students enrolled" body="Enroll students to see a course report." />
              ) : (
                <div className="card overflow-x-auto p-0">
                  <table className="table">
                    <caption>{user?.role === "admin" ? "All enrolled students." : "Students in your course."}</caption>
                    <thead>
                      <tr>
                        <th scope="col">Student</th>
                        <th scope="col">Roll number</th>
                        <th scope="col" className="text-right">
                          Present
                        </th>
                        <th scope="col" className="text-right">
                          Counted classes
                        </th>
                        <th scope="col" className="text-right">
                          Attendance
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((row) => (
                        <tr key={row.studentId}>
                          <th scope="row" className="px-3 py-3 text-left font-medium">
                            {row.fullName}
                          </th>
                          <td className="tabular-nums text-ink-muted">{row.rollNumber || "—"}</td>
                          <td className="text-right tabular-nums">{row.presentSessions}</td>
                          <td className="text-right tabular-nums">{row.countedSessions}</td>
                          <td className="text-right font-semibold tabular-nums">{formatPercent(row.attendancePercent)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              title="No saved sessions yet"
              body="A report appears after the first attendance save."
            />
          )}
        </>
      )}
    </div>
  );
}
