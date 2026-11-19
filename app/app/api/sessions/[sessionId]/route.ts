import { and, asc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { attendanceRecords, enrollments, users } from "@/db/schema";
import { readJson, withApi } from "@/lib/api";
import { loadSessionForStaff } from "@/lib/authz";
import { writeDb } from "@/lib/db";
import type { SessionUser } from "@/lib/types";
import { uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";

export const GET = withApi({ policy: "read.user", roles: ["admin", "teacher"] }, async (_req, { user, params }) => {
  const sessionId = uuidSchema.parse(params.sessionId);
  const { session, course } = await loadSessionForStaff(sessionId, user as SessionUser);

  // Edit views always read the primary so the version is current.
  const roster = await writeDb
    .select({
      id: users.id,
      fullName: users.fullName,
      rollNumber: users.rollNumber,
    })
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

  const records = await writeDb
    .select({ studentId: attendanceRecords.studentId, status: attendanceRecords.status })
    .from(attendanceRecords)
    .where(eq(attendanceRecords.sessionId, sessionId));

  return readJson(
    {
      session: {
        id: session.id,
        courseId: session.courseId,
        courseCode: course.code,
        courseTitle: course.title,
        term: course.term,
        startsAt: session.startsAt,
        topic: session.topic,
        version: session.version,
        savedAt: session.savedAt,
        roster,
        records,
      },
    },
    { source: "primary", dataAsOf: new Date().toISOString(), replicaLagMs: null },
  );
});
