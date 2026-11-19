"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/client";
import { formatPercent } from "@/lib/format";
import type { CourseSummary, StudentAttendanceCourse } from "@/lib/api-types";
import type { SessionUser } from "@/lib/types";

export default function CoursesPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [attendance, setAttendance] = useState<StudentAttendanceCourse[]>([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const me = await api<{ user: SessionUser }>("/api/me");
        const archived = me.user.role === "admin" && includeArchived ? "&includeArchived=true" : "";
        const list = await api<{ courses: CourseSummary[] }>(`/api/courses?limit=100${archived}`);
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
  }, [includeArchived]);

  const terms = useMemo(() => Array.from(new Set(courses.map((course) => course.term))).sort(), [courses]);
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return courses.filter((course) => {
      if (term !== "all" && course.term !== term) return false;
      if (!needle) return true;
      return (
        course.code.toLowerCase().includes(needle) ||
        course.title.toLowerCase().includes(needle) ||
        course.teacher.fullName.toLowerCase().includes(needle)
      );
    });
  }, [courses, search, term]);

  return (
    <div>
      <PageHeader
        title="Courses"
        lead={user?.role === "student" ? "Courses you are enrolled in." : "Courses you can manage or mark."}
        actions={
          user?.role === "admin" ? (
            <Link href="/admin/courses" className="btn btn-primary">
              Manage courses
            </Link>
          ) : undefined
        }
      />

      {error ? <Alert>{error}</Alert> : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_220px_auto]">
        <div>
          <label className="label" htmlFor="course-search">
            Search
          </label>
          <input
            id="course-search"
            className="input"
            type="search"
            placeholder="Code, title, or teacher"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="term-filter">
            Term
          </label>
          <select id="term-filter" className="input" value={term} onChange={(event) => setTerm(event.target.value)}>
            <option value="all">All terms</option>
            {terms.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        {user?.role === "admin" ? (
          <label className="flex min-h-11 items-end gap-2 pb-3 text-sm">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(event) => setIncludeArchived(event.target.checked)}
            />
            Show archived
          </label>
        ) : null}
      </div>

      {loading ? (
        <Spinner label="Loading courses…" />
      ) : visible.length === 0 ? (
        <EmptyState
          title="No courses found"
          body={courses.length === 0 ? "An admin creates courses and enrollments." : "Try a different search or term."}
        />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <caption className="sr-only">Courses available to you</caption>
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Course</th>
                <th scope="col">Term</th>
                <th scope="col">Teacher</th>
                <th scope="col">Students</th>
                {user?.role === "student" ? (
                  <th scope="col" className="text-right">
                    Attendance
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {visible.map((course) => {
                const summary = attendance.find((row) => row.course.id === course.id);
                return (
                  <tr key={course.id}>
                    <th scope="row" className="px-3 py-3 text-left">
                      <Link href={`/courses/${course.id}`} className="font-semibold text-primary">
                        {course.code}
                      </Link>
                    </th>
                    <td>
                      <Link href={`/courses/${course.id}`} className="font-medium">
                        {course.title}
                      </Link>
                      {course.isArchived ? (
                        <span className="ml-2">
                          <Badge>Archived</Badge>
                        </span>
                      ) : null}
                    </td>
                    <td className="text-ink-muted">{course.term}</td>
                    <td>{course.teacher.fullName}</td>
                    <td className="tabular-nums">{course.enrollmentCount}</td>
                    {user?.role === "student" ? (
                      <td className="text-right tabular-nums">{formatPercent(summary?.attendancePercent)}</td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
