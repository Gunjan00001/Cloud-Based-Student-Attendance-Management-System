import { and, asc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { attendanceRecords, attendanceSessions, auditEvents, enrollments, users } from "@/db/schema";
import { json, withApi } from "@/lib/api";
import { rosterComplete } from "@/lib/attendance";
import { loadSessionForStaff } from "@/lib/authz";
import { writeDb } from "@/lib/db";
import { ApiError, apiErrors } from "@/lib/errors";
import type { SessionUser } from "@/lib/types";
import { attendanceSchema, parseBody, uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";

export const PUT = withApi(
  { policy: "attendance.write.user", roles: ["admin", "teacher"] },
  async (req, { user, params }) => {
    const sessionId = uuidSchema.parse(params.sessionId);
    const { session, course } = await loadSessionForStaff(sessionId, user as SessionUser);

    if (user!.role !== "teacher" || course.teacherId !== user!.id) {
      throw apiErrors.forbidden("Only the assigned teacher can mark attendance.");
    }

    const body = await parseBody(req, attendanceSchema);

    const roster = await writeDb
      .select({ id: users.id, fullName: users.fullName, rollNumber: users.rollNumber })
      .from(enrollments)
      .innerJoin(users, eq(users.id, enrollments.studentId))
      .where(
        and(
          eq(enrollments.courseId, course.id),
          lte(enrollments.enrolledAt, session.startsAt),
          or(isNull(enrollments.droppedAt), gt(enrollments.droppedAt, session.startsAt)),
        ),
      )
      .orderBy(asc(users.fullName));

    if (roster.length === 0) throw apiErrors.validation("This session has no enrolled students.");

    const rosterIds = new Set(roster.map((student) => student.id));
    const submittedIds = new Set(body.records.map((record) => record.studentId));
    if (!rosterComplete([...rosterIds], [...submittedIds])) {
      throw apiErrors.validation("Every enrolled student must be marked exactly once.");
    }

    const before = await writeDb
      .select({ studentId: attendanceRecords.studentId, status: attendanceRecords.status })
      .from(attendanceRecords)
      .where(eq(attendanceRecords.sessionId, sessionId));

    const saved = await writeDb.transaction(async (tx) => {
      const [updated] = await tx
        .update(attendanceSessions)
        .set({
          version: sql`${attendanceSessions.version} + 1`,
          savedAt: sql`coalesce(${attendanceSessions.savedAt}, now())`,
          updatedAt: new Date(),
        })
        .where(and(eq(attendanceSessions.id, sessionId), eq(attendanceSessions.version, body.version)))
        .returning({ version: attendanceSessions.version, savedAt: attendanceSessions.savedAt });

      if (!updated) {
        const [current] = await tx
          .select({ version: attendanceSessions.version })
          .from(attendanceSessions)
          .where(eq(attendanceSessions.id, sessionId));
        throw new ApiError(
          409,
          "CONFLICT",
          "This session changed on another device. Reload before saving.",
          { currentVersion: current?.version ?? null },
        );
      }

      await tx
        .insert(attendanceRecords)
        .values(
          body.records.map((record) => ({
            sessionId,
            studentId: record.studentId,
            status: record.status,
            markedBy: user!.id,
            markedAt: new Date(),
          })),
        )
        .onConflictDoUpdate({
          target: [attendanceRecords.sessionId, attendanceRecords.studentId],
          set: {
            status: sql`excluded.status`,
            markedBy: sql`excluded.marked_by`,
            markedAt: sql`now()`,
          },
        });

      await tx.insert(auditEvents).values({
        actorId: user!.id,
        action: "attendance.saved",
        entityType: "attendance_session",
        entityId: sessionId,
        before: { records: before },
        after: { records: body.records },
      });

      return updated;
    });

    return json({
      session: {
        id: session.id,
        courseId: session.courseId,
        courseCode: course.code,
        courseTitle: course.title,
        term: course.term,
        startsAt: session.startsAt,
        topic: session.topic,
        version: saved.version,
        savedAt: saved.savedAt,
        roster,
        records: body.records,
      },
    });
  },
);
