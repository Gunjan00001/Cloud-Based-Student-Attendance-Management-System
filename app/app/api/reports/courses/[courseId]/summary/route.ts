import { sql } from "drizzle-orm";
import { readJson, withApi } from "@/lib/api";
import { assertCourseStaff } from "@/lib/authz";
import { read, rowsOf } from "@/lib/db";
import { attendancePercent } from "@/lib/metrics";
import type { SessionUser } from "@/lib/types";
import { uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";

type ReportRow = {
  id: string;
  full_name: string;
  roll_number: string | null;
  counted_sessions: number;
  present_sessions: number;
};

export const GET = withApi({ policy: "report.read.user", roles: ["admin", "teacher"] }, async (_req, { user, params }) => {
  const courseId = uuidSchema.parse(params.courseId);
  await assertCourseStaff(courseId, user as SessionUser);

  const { data, meta } = await read(async (db) => {
    const [countRow] = rowsOf<{ saved_sessions: number }>(await db.execute(sql`
      SELECT count(*)::int AS saved_sessions
      FROM attendance_sessions
      WHERE course_id = ${courseId} AND saved_at IS NOT NULL
    `));

    const rows = rowsOf<ReportRow>(await db.execute(sql`
      WITH saved_sessions AS (
        SELECT id, starts_at
        FROM attendance_sessions
        WHERE course_id = ${courseId} AND saved_at IS NOT NULL
      ),
      roster AS (
        SELECT student_id, enrolled_at, dropped_at
        FROM enrollments
        WHERE course_id = ${courseId}
      )
      SELECT
        u.id,
        u.full_name,
        u.roll_number,
        count(ss.id)::int AS counted_sessions,
        count(ar.id) FILTER (WHERE ar.status = 'present')::int AS present_sessions
      FROM roster r
      JOIN users u ON u.id = r.student_id
      LEFT JOIN saved_sessions ss
        ON ss.starts_at >= r.enrolled_at
       AND (r.dropped_at IS NULL OR ss.starts_at < r.dropped_at)
      LEFT JOIN attendance_records ar
        ON ar.session_id = ss.id AND ar.student_id = r.student_id
      GROUP BY u.id
      ORDER BY u.full_name
    `));

    return { savedSessions: Number(countRow?.saved_sessions ?? 0), rows };
  });

  return readJson(
    {
      courseId,
      savedSessions: data.savedSessions,
      students: data.rows.map((row) => {
        const countedSessions = Number(row.counted_sessions);
        const presentSessions = Number(row.present_sessions);
        return {
          studentId: row.id,
          fullName: row.full_name,
          rollNumber: row.roll_number,
          presentSessions,
          countedSessions,
          attendancePercent: attendancePercent(presentSessions, countedSessions),
        };
      }),
      dataAsOf: meta.dataAsOf,
      replicaLagMs: meta.replicaLagMs,
    },
    meta,
  );
});
