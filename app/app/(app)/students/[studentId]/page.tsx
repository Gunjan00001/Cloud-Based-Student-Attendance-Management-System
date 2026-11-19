import { StudentAttendanceClient } from "@/components/student-attendance-client";

export default async function StudentPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  return <StudentAttendanceClient studentId={studentId} />;
}
