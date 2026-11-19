import { sql } from "drizzle-orm";
import { read, rowsOf } from "@/lib/db";
import { attendancePercent } from "@/lib/metrics";

type Row = {
  id: string;
  code: string;
  title: string;
  term: string;
  saved_sessions: number;
  present_sessions: number;
};

export async function getStudentAttendance(studentId: string, teacherId: string | null) {
  const { data, meta } = await read(async (db) => {
    const teacherFilter = teacherId ? sql`AND c.teacher_id = ${teacherId}` : sql``;
    const rows = rowsOf<Row>(await db.execute(sql`
      SELECT
        c.id,
        c.code,
        c.title,
        c.term,
        count(ss.id)::int AS saved_sessions,
        count(ar.id) FILTER (WHERE ar.status = 'present')::int AS present_sessions
      FROM enrollments e
      JOIN courses c ON c.id = e.course_id
      LEFT JOIN attendance_sessions ss
        ON ss.course_id = e.course_id
       AND ss.saved_at IS NOT NULL
       AND ss.starts_at >= e.enrolled_at
       AND (e.dropped_at IS NULL OR ss.starts_at < e.dropped_at)
      LEFT JOIN attendance_records ar
        ON ar.session_id = ss.id AND ar.student_id = e.student_id
      WHERE e.student_id = ${studentId}
      ${teacherFilter}
      GROUP BY c.id
      ORDER BY c.code
    `));
    return rows;
  });

  return {
    courses: data.map((row) => {
      const savedSessions = Number(row.saved_sessions);
      const presentSessions = Number(row.present_sessions);
      return {
        course: { id: row.id, code: row.code, title: row.title, term: row.term },
        presentSessions,
        savedSessions,
        attendancePercent: attendancePercent(presentSessions, savedSessions),
      };
    }),
    meta,
  };
}
