import { Suspense } from "react";
import { AttendanceClient } from "@/components/attendance-client";
import { Spinner } from "@/components/ui";

export default async function AttendancePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  return (
    <Suspense fallback={<Spinner label="Loading roll call…" />}>
      <AttendanceClient courseId={courseId} />
    </Suspense>
  );
}
