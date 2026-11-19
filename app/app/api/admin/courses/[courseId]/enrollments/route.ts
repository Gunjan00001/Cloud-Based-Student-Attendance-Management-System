import { and, eq, inArray } from "drizzle-orm";
import { auditEvents, courses, enrollments, users } from "@/db/schema";
import { json, withApi } from "@/lib/api";
import { writeDb } from "@/lib/db";
import { apiErrors } from "@/lib/errors";
import type { SessionUser } from "@/lib/types";
import { enrollmentSchema, parseBody, uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";

export const POST = withApi({ policy: "admin.write.user", roles: ["admin"] }, async (req, { user, params }) => {
  const courseId = uuidSchema.parse(params.courseId);
  const body = await parseBody(req, enrollmentSchema);

  const [course] = await writeDb.select({ id: courses.id }).from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!course) throw apiErrors.notFound("Course not found.");

  const students = await writeDb
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, body.studentIds), eq(users.role, "student"), eq(users.isActive, true)));
  if (students.length !== body.studentIds.length) {
    throw apiErrors.validation("Every ID must belong to an active student.");
  }

  const now = new Date();
  await writeDb
    .insert(enrollments)
    .values(body.studentIds.map((studentId) => ({ courseId, studentId, enrolledAt: now })))
    .onConflictDoUpdate({
      target: [enrollments.courseId, enrollments.studentId],
      set:
        body.action === "enroll"
          ? { enrolledAt: now, droppedAt: null }
          : { droppedAt: now },
    });

  await writeDb.insert(auditEvents).values({
    actorId: (user as SessionUser).id,
    action: `admin.enrollments_${body.action}`,
    entityType: "course",
    entityId: courseId,
    after: { studentIds: body.studentIds, action: body.action },
  });

  const affected = await writeDb
    .select({
      studentId: enrollments.studentId,
      fullName: users.fullName,
      enrolledAt: enrollments.enrolledAt,
      droppedAt: enrollments.droppedAt,
    })
    .from(enrollments)
    .innerJoin(users, eq(users.id, enrollments.studentId))
    .where(and(eq(enrollments.courseId, courseId), inArray(enrollments.studentId, body.studentIds)));

  return json({ enrollments: affected });
});
