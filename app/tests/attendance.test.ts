import assert from "node:assert/strict";
import test from "node:test";
import { rosterComplete } from "../lib/attendance.ts";

const roster = ["a", "b", "c"];

test("accepts exactly one mark per roster student", () => {
  assert.equal(rosterComplete(roster, ["c", "a", "b"]), true);
});

test("rejects missing students", () => {
  assert.equal(rosterComplete(roster, ["a", "b"]), false);
});

test("rejects unknown students", () => {
  assert.equal(rosterComplete(roster, ["a", "b", "d"]), false);
});

test("rejects duplicates that keep the same length", () => {
  assert.equal(rosterComplete(roster, ["a", "a", "b"]), false);
});
