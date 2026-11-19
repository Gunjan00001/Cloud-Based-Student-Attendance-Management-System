import { and, desc, eq, gte, lt, lte, or, sql } from "drizzle-orm";
import { attendanceRecords, attendanceSessions, auditEvents } from "@/db/schema";
import { json, readJson, withApi } from "@/lib/api";
import { assertCourseStaff } from "@/lib/authz";
import { decodeCursor, encodeCursor } from "@/lib/cursor";
import { read, writeDb } from "@/lib/db";
import { apiErrors } from "@/lib/errors";
import type { SessionUser } from "@/lib/types";
import { createSessionSchema, parseBody, parseQuery, sessionListQuery, uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";

export const GET = withApi({ policy: "read.user", roles: ["admin", "teacher"] }, async (req, { user, params }) => {
  const courseId = uuidSchema.parse(params.courseId);
  await assertCourseStaff(courseId, user as SessionUser);

  const query = parseQuery(req, sessionListQuery);
  const from = query.from ? new Date(query.from) : null;
  const to = query.to ? new Date(query.to) : null;
  if (from && to && from > to) throw apiErrors.validation("The start of the range must be before the end.");

  const cursor = decodeCursor<{ startsAt: string; id: string }>(query.cursor);
  const cursorDate = cursor ? new Date(cursor.startsAt) : null;

  const { data, meta } = await read((db) =>
    db
      .select({
        id: attendanceSessions.id,
        startsAt: attendanceSessions.startsAt,
        topic: attendanceSessions.topic,
        version: attendanceSessions.version,
        savedAt: attendanceSessions.savedAt,
        present: sql<number>`count(${attendanceRecords.id}) filter (where ${attendanceRecords.status} = 'present')::int`,
        absent: sql<number>`count(${attendanceRecords.id}) filter (where ${attendanceRecords.status} = 'absent')::int`,
      })
      .from(attendanceSessions)
      .leftJoin(attendanceRecords, eq(attendanceRecords.sessionId, attendanceSessions.id))
      .where(
        and(
          eq(attendanceSessions.courseId, courseId),
          from ? gte(attendanceSessions.startsAt, from) : undefined,
          to ? lte(attendanceSessions.startsAt, to) : undefined,
          cursor && cursorDate
            ? or(
                lt(attendanceSessions.startsAt, cursorDate),
                and(eq(attendanceSessions.startsAt, cursorDate), lt(attendanceSessions.id, cursor.id)),
              )
            : undefined,
        ),
      )
      .groupBy(attendanceSessions.id)
      .orderBy(desc(attendanceSessions.startsAt), desc(attendanceSessions.id))
      .limit(query.limit + 1),
  );

  const rows = data.slice(0, query.limit);
  const last = rows[rows.length - 1];
  const nextCursor =
    data.length > query.limit && last
      ? encodeCursor({ startsAt: last.startsAt.toISOString(), id: last.id })
      : null;

  return readJson({ sessions: rows, nextCursor }, meta);
});

export const POST = withApi({ policy: "attendance.write.user", roles: ["admin", "teacher"] }, async (req, { user, params }) => {
  const courseId = uuidSchema.parse(params.courseId);
  const course = await assertCourseStaff(courseId, user as SessionUser);
  if (course.isArchived) throw apiErrors.validation("This course is archived.");

  const body = await parseBody(req, createSessionSchema);
  const startsAt = new Date(body.startsAt);
  if (startsAt.getTime() > Date.now() + 30 * 24 * 60 * 60 * 1000) {
    throw apiErrors.validation("A session cannot start more than 30 days in the future.");
  }

  const [session] = await writeDb
    .insert(attendanceSessions)
    .values({
      courseId,
      startsAt,
      topic: body.topic || null,
      createdBy: user!.id,
    })
    .returning();

  await writeDb.insert(auditEvents).values({
    actorId: user!.id,
    action: "attendance.session_created",
    entityType: "attendance_session",
    entityId: session.id,
    after: { courseId, startsAt: startsAt.toISOString(), topic: session.topic },
  });

  return json(
    {
      session: {
        id: session.id,
        courseId: session.courseId,
        startsAt: session.startsAt,
        topic: session.topic,
        version: session.version,
        savedAt: session.savedAt,
        present: 0,
        absent: 0,
      },
    },
    { status: 201 },
  );
});
