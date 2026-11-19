import { sql } from "drizzle-orm";
import { read, rowsOf } from "@/lib/db";
import type { InstitutionAnalytics } from "@/lib/api-types";

export async function getInstitutionAnalytics() {
  const { data, meta } = await read(async (db) => {
    const [totals] = rowsOf<{
      admins: number;
      teachers: number;
      students: number;
      active_users: number;
      courses: number;
      archived_courses: number;
      saved_sessions: number;
      present: number;
      absent: number;
    }>(
      await db.execute(sql`
        SELECT
          (SELECT count(*) FROM users WHERE role = 'admin')::int AS admins,
          (SELECT count(*) FROM users WHERE role = 'teacher')::int AS teachers,
          (SELECT count(*) FROM users WHERE role = 'student')::int AS students,
          (SELECT count(*) FROM users WHERE is_active)::int AS active_users,
          (SELECT count(*) FROM courses)::int AS courses,
          (SELECT count(*) FROM courses WHERE is_archived)::int AS archived_courses,
          (SELECT count(*) FROM attendance_sessions WHERE saved_at IS NOT NULL)::int AS saved_sessions,
          (SELECT count(*) FROM attendance_records ar
            JOIN attendance_sessions s ON s.id = ar.session_id
            WHERE s.saved_at IS NOT NULL AND ar.status = 'present')::int AS present,
          (SELECT count(*) FROM attendance_records ar
            JOIN attendance_sessions s ON s.id = ar.session_id
            WHERE s.saved_at IS NOT NULL AND ar.status = 'absent')::int AS absent
      `),
    );

    const perCourse = rowsOf<{ id: string; code: string; saved_sessions: number; present: number; absent: number }>(
      await db.execute(sql`
        SELECT
          c.id,
          c.code,
          count(s.id)::int AS saved_sessions,
          count(ar.id) FILTER (WHERE ar.status = 'present')::int AS present,
          count(ar.id) FILTER (WHERE ar.status = 'absent')::int AS absent
        FROM courses c
        LEFT JOIN attendance_sessions s
          ON s.course_id = c.id AND s.saved_at IS NOT NULL
        LEFT JOIN attendance_records ar
          ON ar.session_id = s.id
        GROUP BY c.id
        ORDER BY c.code
      `),
    );

    return { totals, perCourse };
  });

  const t = data.totals;
  return {
    users: { admins: t.admins, teachers: t.teachers, students: t.students, activeUsers: t.active_users },
    courses: { total: t.courses, archived: t.archived_courses },
    attendance: { savedSessions: t.saved_sessions, present: t.present, absent: t.absent },
    perCourse: data.perCourse.map((row) => ({
      id: row.id,
      code: row.code,
      savedSessions: Number(row.saved_sessions),
      present: Number(row.present),
      absent: Number(row.absent),
    })),
    meta,
  } satisfies Omit<InstitutionAnalytics, "dataAsOf" | "replicaLagMs"> & { meta: typeof meta };
}
