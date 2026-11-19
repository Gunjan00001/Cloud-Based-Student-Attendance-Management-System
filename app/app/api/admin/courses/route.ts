import { eq } from "drizzle-orm";
import { auditEvents, courses, users } from "@/db/schema";
import { json, withApi } from "@/lib/api";
import { writeDb } from "@/lib/db";
import { apiErrors } from "@/lib/errors";
import type { SessionUser } from "@/lib/types";
import { createCourseSchema, parseBody } from "@/lib/validation";

export const runtime = "nodejs";

export const POST = withApi({ policy: "admin.write.user", roles: ["admin"] }, async (req, { user }) => {
  const body = await parseBody(req, createCourseSchema);

  const [teacher] = await writeDb
    .select({ id: users.id, role: users.role, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, body.teacherId))
    .limit(1);
  if (!teacher || teacher.role !== "teacher" || !teacher.isActive) {
    throw apiErrors.validation("Choose an active teacher.");
  }

  const [created] = await writeDb
    .insert(courses)
    .values({ code: body.code, title: body.title, term: body.term, teacherId: body.teacherId })
    .returning();

  await writeDb.insert(auditEvents).values({
    actorId: (user as SessionUser).id,
    action: "admin.course_created",
    entityType: "course",
    entityId: created.id,
    after: { code: created.code, title: created.title, term: created.term, teacherId: created.teacherId },
  });

  return json(
    {
      course: {
        id: created.id,
        code: created.code,
        title: created.title,
        term: created.term,
        teacherId: created.teacherId,
        isArchived: created.isArchived,
      },
    },
    { status: 201 },
  );
});
