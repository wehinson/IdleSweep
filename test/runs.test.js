import test from "node:test";
import assert from "node:assert/strict";
import { createProfile, createRun, evaluateHighScore, restructureState } from "../src/engine/runs.js";

test("High Score uses initial mines, logs ties, and excludes developer Boards", () => {
  let profile = createProfile();
  let run = createRun({ ordinal: 1, startedAt: "2026-01-01T00:00:00.000Z" });
  let result = evaluateHighScore(profile, run, { id: "a", category: "STANDARD", outcome: "WON", initialMineCount: 30 });
  ({ profile, run } = result);
  assert.equal(result.result, "improvement");
  result = evaluateHighScore(profile, run, { id: "b", category: "DISTRICT_PARCEL", outcome: "WON", initialMineCount: 30 });
  assert.equal(result.result, "tie");
  assert.equal(result.profile.allTimeHighScore.id, "a");
  assert.equal(result.profile.highScoreHistory.length, 2);
  result = evaluateHighScore(result.profile, result.run, { id: "dev", category: "DEV_TEST", outcome: "WON", initialMineCount: 999 });
  assert.equal(result.result, "ineligible");
});

test("restructuring archives materialized Boards and creates a new Run", () => {
  const profile = createProfile({ hints: 8, restructuringCount: 2 });
  profile.blueprintLibrary.reservedByBoardId.active = "pattern121";
  const run = createRun({ ordinal: 3, startedAt: "2026-01-01T00:00:00.000Z" });
  const result = restructureState({
    profile, run,
    boardSessions: {
      preview: { id: "preview", category: "STANDARD", status: "PREVIEW", settings: { rows: 3, cols: 3, mines: 1 }, initialMineCount: null },
      active: { id: "active", category: "STANDARD", status: "COMMITTED", settings: { rows: 8, cols: 8, mines: 10 }, initialMineCount: 10 },
    },
    createRunState: createRun,
    now: () => new Date("2026-02-01T00:00:00.000Z"),
  });
  assert.equal(result.profile.hints, 8);
  assert.equal(result.profile.restructuringCount, 3);
  assert.equal(result.profile.boardArchive[0].outcome, "ABANDONED");
  assert.deepEqual(result.profile.blueprintLibrary.reservedByBoardId, {});
  assert.equal(result.run.ordinal, 4);
});
