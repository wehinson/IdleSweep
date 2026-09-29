import test from "node:test";
import assert from "node:assert/strict";
import config from "../config.js";
import { createBoardCells, updateBoardAdjacency } from "../src/engine/board.js";
import { createAutomationState, deriveInterventionQueue, estimateSpeculativeTargets, reserveTarget, snoozeIntervention, speculationCost } from "../src/engine/automation.js";

test("reservations are unique for one mutation revision", () => {
  const first = reserveTarget(createAutomationState("assist"), 4, "worker-1", "finding-1");
  assert.equal(first.ok, true);
  assert.equal(reserveTarget(first.state, 4, "worker-2", "finding-2").ok, false);
});

test("speculation cost scales with Board size and repeated guesses", () => {
  const small = speculationCost({ rows: 10, cols: 10, mines: 15 }, 0, config.automation.speculation);
  const large = speculationCost({ rows: 30, cols: 40, mines: 220 }, 2, config.automation.speculation);
  assert.ok(large > small);
});

test("local risk targets use deterministic index tie-breaking", () => {
  const settings = { rows: 3, cols: 3, mines: 1 };
  const board = createBoardCells(settings);
  board[0].mine = true;
  board[4].open = true;
  updateBoardAdjacency(board, settings);
  const targets = estimateSpeculativeTargets(board, settings);
  assert.equal(targets[0].risk, 1 / 8);
  assert.equal(targets[0].index, 0);
});

test("intervention snoozes hide stalled background Assist Boards until expiry", () => {
  const automation = { ...createAutomationState("assist"), stalled: true, stallStartedAt: 500 };
  const sessions = { parcel: { id: "parcel", category: "DISTRICT_PARCEL", parcelId: "p1", settings: { rows: 8, cols: 9, mines: 10 }, initialMineCount: 10, automation } };
  assert.equal(deriveInterventionQueue(sessions, "main", 1000).length, 1);
  const snoozes = snoozeIntervention({}, "parcel", 2000);
  assert.equal(deriveInterventionQueue(sessions, "main", 1500, snoozes).length, 0);
  assert.equal(deriveInterventionQueue(sessions, "main", 2000, snoozes).length, 1);
});
