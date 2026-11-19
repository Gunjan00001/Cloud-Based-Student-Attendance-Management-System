import assert from "node:assert/strict";
import test from "node:test";
import { attendancePercent } from "../lib/metrics.ts";

test("zero saved sessions returns null, not 0%", () => {
  assert.equal(attendancePercent(0, 0), null);
});

test("rounds to one decimal", () => {
  assert.equal(attendancePercent(5, 6), 83.3);
  assert.equal(attendancePercent(2, 3), 66.7);
  assert.equal(attendancePercent(6, 6), 100);
});
