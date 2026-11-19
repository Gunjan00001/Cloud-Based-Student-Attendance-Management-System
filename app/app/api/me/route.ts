import { json, withApi } from "@/lib/api";

export const runtime = "nodejs";

export const GET = withApi({ policy: "read.user", allowPasswordChange: true }, async (_req, { user }) =>
  json({ user }),
);
