import { eq, sql } from "drizzle-orm";
import { courses, enrollments, users } from "@/db/schema";
import { readJson, withApi } from "@/lib/api";
import { assertCourseAccess } from "@/lib/authz";
import { read } from "@/lib/db";
import type { SessionUser } from "@/lib/types";
import { uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";

export const GET = withApi({ policy: "read.user" }, async (_req, { user, params }) => {
  const courseId = uuidSchema.parse(params.courseId);
  const course = await assertCourseAccess(courseId, user as SessionUser);

  const { data, meta } = await read((db) =>
    db
      .select({
        id: courses.id,
        code: courses.code,
        title: courses.title,
        term: courses.term,
        isArchived: courses.isArchived,
        teacherId: users.id,
        teacherName: users.fullName,
        enrollmentCount: sql<number>`(
          SELECT count(*)::int FROM ${enrollments}
          WHERE ${enrollments.courseId} = ${courses.id} AND ${enrollments.droppedAt} IS NULL
        )`,
      })
      .from(courses)
      .innerJoin(users, eq(users.id, courses.teacherId))
      .where(eq(courses.id, courseId))
      .limit(1),
  );

  const row = data[0];
  if (!row) throw new Error("course_missing_after_auth");

  return readJson(
    {
      course: {
        id: row.id,
        code: row.code,
        title: row.title,
        term: row.term,
        teacher: { id: row.teacherId, fullName: row.teacherName },
        isArchived: row.isArchived,
        enrollmentCount: row.enrollmentCount,
        canMarkAttendance: user?.role === "teacher" && course.teacherId === user.id,
      },
    },
    meta,
  );
});
