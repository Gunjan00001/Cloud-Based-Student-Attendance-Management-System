import { eq } from "drizzle-orm";
import { auditEvents, courses, users } from "@/db/schema";
import { json, withApi } from "@/lib/api";
import { writeDb } from "@/lib/db";
import { apiErrors } from "@/lib/errors";
import type { SessionUser } from "@/lib/types";
import { parseBody, patchCourseSchema, uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";

export const PATCH = withApi({ policy: "admin.write.user", roles: ["admin"] }, async (req, { user, params }) => {
  const courseId = uuidSchema.parse(params.courseId);
  const body = await parseBody(req, patchCourseSchema);

  const [current] = await writeDb.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!current) throw apiErrors.notFound("Course not found.");

  if (body.teacherId !== undefined) {
    const [teacher] = await writeDb
      .select({ id: users.id, role: users.role, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, body.teacherId))
      .limit(1);
    if (!teacher || teacher.role !== "teacher" || !teacher.isActive) {
      throw apiErrors.validation("Choose an active teacher.");
    }
  }

  const [updated] = await writeDb
    .update(courses)
    .set({
      title: body.title,
      term: body.term,
      teacherId: body.teacherId,
      isArchived: body.isArchived,
    })
    .where(eq(courses.id, courseId))
    .returning();

  await writeDb.insert(auditEvents).values({
    actorId: (user as SessionUser).id,
    action: body.isArchived === true ? "admin.course_archived" : "admin.course_updated",
    entityType: "course",
    entityId: courseId,
    before: { title: current.title, term: current.term, teacherId: current.teacherId, isArchived: current.isArchived },
    after: { title: updated.title, term: updated.term, teacherId: updated.teacherId, isArchived: updated.isArchived },
  });

  return json({
    course: {
      id: updated.id,
      code: updated.code,
      title: updated.title,
      term: updated.term,
      teacherId: updated.teacherId,
      isArchived: updated.isArchived,
    },
  });
});
