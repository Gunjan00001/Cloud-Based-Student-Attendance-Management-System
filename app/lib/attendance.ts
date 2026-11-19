export function rosterComplete(rosterIds: string[], submittedIds: string[]): boolean {
  const roster = new Set(rosterIds);
  const submitted = new Set(submittedIds);
  if (roster.size !== submitted.size) return false;
  for (const id of roster) if (!submitted.has(id)) return false;
  return true;
}
