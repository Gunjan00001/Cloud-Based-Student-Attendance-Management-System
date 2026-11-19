import { readJson, withApi } from "@/lib/api";
import { assertStudentVisible } from "@/lib/authz";
import { getStudentAttendance } from "@/lib/student-attendance";
import type { SessionUser } from "@/lib/types";
import { uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";

export const GET = withApi({ policy: "read.user", roles: ["admin", "teacher"] }, async (_req, { user, params }) => {
  const studentId = uuidSchema.parse(params.studentId);
  const scope = await assertStudentVisible(studentId, user as SessionUser);
  const result = await getStudentAttendance(studentId, scope.teacherId);

  return readJson(
    {
      studentId,
      courses: result.courses,
      dataAsOf: result.meta.dataAsOf,
      replicaLagMs: result.meta.replicaLagMs,
    },
    result.meta,
  );
});
