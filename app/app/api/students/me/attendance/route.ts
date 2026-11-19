import { readJson, withApi } from "@/lib/api";
import { getStudentAttendance } from "@/lib/student-attendance";
import type { SessionUser } from "@/lib/types";

export const runtime = "nodejs";

export const GET = withApi({ policy: "read.user", roles: ["student"] }, async (_req, { user }) => {
  const result = await getStudentAttendance((user as SessionUser).id, null);
  return readJson(
    {
      courses: result.courses,
      dataAsOf: result.meta.dataAsOf,
      replicaLagMs: result.meta.replicaLagMs,
    },
    result.meta,
  );
});
