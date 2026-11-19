import { readJson, withApi } from "@/lib/api";
import { getInstitutionAnalytics } from "@/lib/analytics";

export const runtime = "nodejs";

export const GET = withApi({ policy: "report.read.user", roles: ["admin"] }, async () => {
  const analytics = await getInstitutionAnalytics();
  return readJson(
    {
      users: analytics.users,
      courses: analytics.courses,
      attendance: analytics.attendance,
      perCourse: analytics.perCourse,
      dataAsOf: analytics.meta.dataAsOf,
      replicaLagMs: analytics.meta.replicaLagMs,
    },
    analytics.meta,
  );
});
