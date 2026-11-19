import { asc, eq } from "drizzle-orm";
import { enrollments, users } from "@/db/schema";
import { readJson, withApi } from "@/lib/api";
import { assertCourseStaff } from "@/lib/authz";
import { read } from "@/lib/db";
import type { SessionUser } from "@/lib/types";
import { uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";

export const GET = withApi({ policy: "read.user", roles: ["admin", "teacher"] }, async (_req, { user, params }) => {
  const courseId = uuidSchema.parse(params.courseId);
  await assertCourseStaff(courseId, user as SessionUser);

  const { data, meta } = await read((db) =>
    db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        rollNumber: users.rollNumber,
        enrolledAt: enrollments.enrolledAt,
        droppedAt: enrollments.droppedAt,
      })
      .from(enrollments)
      .innerJoin(users, eq(users.id, enrollments.studentId))
      .where(eq(enrollments.courseId, courseId))
      .orderBy(asc(users.fullName)),
  );

  return readJson({ courseId, students: data }, meta);
});
