export function attendancePercent(present: number, counted: number): number | null {
  if (!Number.isFinite(counted) || counted <= 0) return null;
  return Math.round((present / counted) * 1000) / 10;
}
