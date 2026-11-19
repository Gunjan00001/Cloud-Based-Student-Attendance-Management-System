"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Badge, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/client";
import { formatDate } from "@/lib/format";
import type { AdminUser, CourseDetail, RosterStudent } from "@/lib/api-types";

type EnrollmentRow = RosterStudent & { enrolledAt: string; droppedAt: string | null };

export default function EnrollmentsPage() {
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [students, setStudents] = useState<AdminUser[]>([]);
  const [roster, setRoster] = useState<EnrollmentRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadRoster = useCallback(async () => {
    const result = await api<{ students: EnrollmentRow[] }>(`/api/courses/${courseId}/roster`);
    setRoster(result.students);
  }, [courseId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const detail = await api<{ course: CourseDetail }>(`/api/courses/${courseId}`);
        const all: AdminUser[] = [];
        let cursor: string | null = null;
        do {
          const pageResult: { users: AdminUser[]; nextCursor: string | null } = await api(
            `/api/admin/users?role=student&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
          );
          all.push(...pageResult.users);
          cursor = pageResult.nextCursor;
        } while (cursor);

        const rosterResult = await api<{ students: EnrollmentRow[] }>(`/api/courses/${courseId}/roster`);
        if (cancelled) return;
        setCourse(detail.course);
        setStudents(all);
        setRoster(rosterResult.students);
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

  const enrollmentByStudent = useMemo(() => {
    const map = new Map<string, EnrollmentRow>();
    for (const row of roster) map.set(row.id, row);
    return map;
  }, [roster]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return students.filter((student) => {
      if (!needle) return true;
      return (
        student.fullName.toLowerCase().includes(needle) ||
        student.email.toLowerCase().includes(needle) ||
        (student.rollNumber ?? "").toLowerCase().includes(needle)
      );
    });
  }, [students, search]);

  function toggle(studentId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  async function apply(action: "enroll" | "drop") {
    if (selected.size === 0) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api(`/api/admin/courses/${courseId}/enrollments`, {
        method: "POST",
        body: JSON.stringify({ action, studentIds: [...selected] }),
      });
      setNotice(`${selected.size} ${selected.size === 1 ? "student" : "students"} ${action === "enroll" ? "enrolled" : "dropped"}.`);
      setSelected(new Set());
      await loadRoster();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner label="Loading enrollments…" />;
  if (!course) return <EmptyState title="Course not found" />;

  return (
    <div>
      <Link href={`/courses/${course.id}`} className="text-sm font-medium text-primary">
        ← {course.code}
      </Link>
      <PageHeader
        title="Enrollments"
        lead={`${course.code} · ${course.title} · ${course.term}`}
        actions={
          <Link href="/admin/courses" className="btn btn-secondary">
            All courses
          </Link>
        }
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

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <label className="label" htmlFor="enrollment-search">
            Search students
          </label>
          <input
            id="enrollment-search"
            className="input"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name, email, or roll number"
          />
        </div>
        <div className="flex items-end gap-2">
          <button type="button" className="btn btn-primary" onClick={() => apply("enroll")} disabled={saving || selected.size === 0}>
            Enroll selected
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => apply("drop")} disabled={saving || selected.size === 0}>
            Drop selected
          </button>
        </div>
      </div>

      <p className="mb-3 text-sm text-ink-muted">
        Enrollment windows decide which sessions count. Re-enrolling resets the window start; dropping ends it now.
      </p>

      {visible.length === 0 ? (
        <EmptyState title="No students found" body="Create student accounts first." />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <caption>
              {selected.size} selected · {roster.filter((row) => !row.droppedAt).length} currently enrolled
            </caption>
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">Select</span>
                </th>
                <th scope="col">Student</th>
                <th scope="col">Roll number</th>
                <th scope="col">Status</th>
                <th scope="col">Window</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((student) => {
                const enrollment = enrollmentByStudent.get(student.id);
                const active = enrollment ? !enrollment.droppedAt || new Date(enrollment.droppedAt) > new Date() : false;
                return (
                  <tr key={student.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${student.fullName}`}
                        checked={selected.has(student.id)}
                        onChange={() => toggle(student.id)}
                      />
                    </td>
                    <th scope="row" className="px-3 py-3 text-left">
                      <span className="font-medium">{student.fullName}</span>
                      <span className="block text-xs font-normal text-ink-muted">{student.email}</span>
                    </th>
                    <td className="tabular-nums text-ink-muted">{student.rollNumber || "—"}</td>
                    <td>{active ? <Badge tone="present">Enrolled</Badge> : <Badge>Not enrolled</Badge>}</td>
                    <td className="text-xs text-ink-muted">
                      {enrollment
                        ? `${formatDate(enrollment.enrolledAt)} → ${enrollment.droppedAt ? formatDate(enrollment.droppedAt) : "present"}`
                        : "—"}
                    </td>
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
