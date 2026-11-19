"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/client";
import type { AdminUser, CourseSummary } from "@/lib/api-types";

export default function AdminCoursesPage() {
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [teachers, setTeachers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const createRef = useRef<HTMLDetailsElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await api<{ courses: CourseSummary[] }>("/api/courses?limit=100&includeArchived=true");
      const staff = await api<{ users: AdminUser[] }>("/api/admin/users?role=teacher&active=true&limit=100");
      setCourses(list.courses);
      setTeachers(staff.users);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createCourse(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    const data = new FormData(event.currentTarget);
    try {
      await api("/api/admin/courses", {
        method: "POST",
        body: JSON.stringify({
          code: data.get("code"),
          title: data.get("title"),
          term: data.get("term"),
          teacherId: data.get("teacherId"),
        }),
      });
      event.currentTarget.reset();
      if (createRef.current) createRef.current.open = false;
      setNotice("Course created.");
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function setArchived(course: CourseSummary, isArchived: boolean) {
    if (!window.confirm(`${isArchived ? "Archive" : "Restore"} ${course.code} · ${course.title}?`)) return;
    setError("");
    setNotice("");
    try {
      await api(`/api/admin/courses/${course.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isArchived }),
      });
      setNotice(isArchived ? "Course archived. Reports remain available." : "Course restored.");
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <div>
      <PageHeader
        title="Courses"
        lead="Create courses, assign teachers, and archive old terms. Attendance history is never deleted."
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
        <summary className="cursor-pointer text-lg font-semibold">Create a course</summary>
        {teachers.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Create an active teacher account first.</p>
        ) : (
          <form onSubmit={createCourse} className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="label" htmlFor="course-code">
                Code
              </label>
              <input id="course-code" name="code" className="input" required maxLength={40} placeholder="CS301" />
            </div>
            <div>
              <label className="label" htmlFor="course-title">
                Title
              </label>
              <input id="course-title" name="title" className="input" required maxLength={200} />
            </div>
            <div>
              <label className="label" htmlFor="course-term">
                Term
              </label>
              <input id="course-term" name="term" className="input" required maxLength={100} placeholder="2026-27 Semester 1" />
            </div>
            <div>
              <label className="label" htmlFor="course-teacher">
                Teacher
              </label>
              <select id="course-teacher" name="teacherId" className="input" required>
                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <button type="submit" className="btn btn-primary">
                Create course
              </button>
            </div>
          </form>
        )}
      </details>

      {loading ? (
        <Spinner label="Loading courses…" />
      ) : courses.length === 0 ? (
        <EmptyState title="No courses yet" body="Create the first course for this term." />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <caption>Active and archived courses.</caption>
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Course</th>
                <th scope="col">Term</th>
                <th scope="col">Teacher</th>
                <th scope="col">Students</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((course) => (
                <tr key={course.id}>
                  <th scope="row" className="px-3 py-3 text-left font-semibold">
                    {course.code}
                  </th>
                  <td>{course.title}</td>
                  <td className="text-ink-muted">{course.term}</td>
                  <td>{course.teacher.fullName}</td>
                  <td className="tabular-nums">{course.enrollmentCount}</td>
                  <td>{course.isArchived ? <Badge>Archived</Badge> : <Badge tone="present">Active</Badge>}</td>
                  <td>
                    <div className="flex flex-wrap items-center gap-3">
                      <Link href={`/admin/courses/${course.id}/enrollments`} className="text-xs font-semibold text-primary">
                        Enrollments
                      </Link>
                      <button
                        type="button"
                        className="text-xs font-semibold text-primary"
                        onClick={() => setArchived(course, !course.isArchived)}
                      >
                        {course.isArchived ? "Restore" : "Archive"}
                      </button>
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
