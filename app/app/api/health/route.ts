import { json, withApi } from "@/lib/api";

export const runtime = "nodejs";

export const GET = withApi({ anonymous: true }, async () => json({ status: "ok" }));
