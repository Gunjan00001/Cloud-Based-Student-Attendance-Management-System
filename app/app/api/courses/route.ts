import { and, eq, exists, gt, isNull, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { courses, enrollments, users } from "@/db/schema";
import { readJson, withApi } from "@/lib/api";
import { assertCourseAccess } from "@/lib/authz";
import { decodeCursor, encodeCursor } from "@/lib/cursor";
import { read } from "@/lib/db";
import { apiErrors } from "@/lib/errors";
import type { SessionUser } from "@/lib/types";
import { courseListQuery, parseQuery } from "@/lib/validation";

export const runtime = "nodejs";

export const GET = withApi({ policy: "read.user", roles: ["admin", "teacher", "student"] }, async (req, { user }) => {
  const query = parseQuery(req, courseListQuery);
  const currentUser = user as SessionUser;
  if (query.includeArchived === "true" && currentUser.role !== "admin") {
    throw apiErrors.forbidden("Only admins can include archived courses.");
  }

  const cursor = decodeCursor<{ code: string }>(query.cursor);
  const teacher = alias(users, "teacher");
  const now = new Date();

  const { data, meta } = await read((db) => {
    const conditions = [
      query.includeArchived === "true" ? undefined : eq(courses.isArchived, false),
      cursor ? gt(courses.code, cursor.code) : undefined,
      currentUser.role === "teacher" ? eq(courses.teacherId, currentUser.id) : undefined,
      currentUser.role === "student"
        ? exists(
            db
              .select({ one: sql`1` })
              .from(enrollments)
              .where(
                and(
                  eq(enrollments.courseId, courses.id),
                  eq(enrollments.studentId, currentUser.id),
                  lte(enrollments.enrolledAt, now),
                  or(isNull(enrollments.droppedAt), gt(enrollments.droppedAt, now)),
                ),
              ),
          )
        : undefined,
    ].filter(Boolean);

    return db
      .select({
        id: courses.id,
        code: courses.code,
        title: courses.title,
        term: courses.term,
        isArchived: courses.isArchived,
        teacherId: teacher.id,
        teacherName: teacher.fullName,
        enrollmentCount: sql<number>`(
          SELECT count(*)::int FROM ${enrollments}
          WHERE ${enrollments.courseId} = ${courses.id} AND ${enrollments.droppedAt} IS NULL
        )`,
      })
      .from(courses)
      .innerJoin(teacher, eq(teacher.id, courses.teacherId))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(courses.code)
      .limit(query.limit + 1);
  });

  const rows = data.slice(0, query.limit);
  const nextCursor = data.length > query.limit ? encodeCursor({ code: rows[rows.length - 1]?.code }) : null;

  return readJson(
    {
      courses: rows.map((row) => ({
        id: row.id,
        code: row.code,
        title: row.title,
        term: row.term,
        teacher: { id: row.teacherId, fullName: row.teacherName },
        isArchived: row.isArchived,
        enrollmentCount: row.enrollmentCount,
      })),
      nextCursor,
    },
    meta,
  );
});
