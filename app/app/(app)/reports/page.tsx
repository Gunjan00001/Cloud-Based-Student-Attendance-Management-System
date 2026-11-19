import { Suspense } from "react";
import { ReportsClient } from "@/components/reports-client";
import { Spinner } from "@/components/ui";

export default function ReportsPage() {
  return (
    <Suspense fallback={<Spinner label="Loading reports…" />}>
      <ReportsClient />
    </Suspense>
  );
}
