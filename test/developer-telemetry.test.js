import test from "node:test";
import assert from "node:assert/strict";
import {
  createDeveloperTelemetry,
  recordDeveloperAction,
  recordDeveloperEvent,
  resolveDeveloperRun,
  restartDeveloperRun,
  summarizeDeveloperTelemetry,
} from "../src/engine/developer-telemetry.js";

test("developer telemetry snapshots and resets every board run", () => {
  const telemetry = createDeveloperTelemetry();
  restartDeveloperRun(telemetry, { rows: 3, cols: 3, mines: 1 }, 1000);
  recordDeveloperEvent(telemetry, { type: "reveal", count: 4 }, 1100);
  recordDeveloperEvent(telemetry, { type: "purchase", id: "shovel" }, 1250);
  resolveDeveloperRun(telemetry, "cleared", 500, 1500);
  restartDeveloperRun(telemetry, { rows: 4, cols: 4, mines: 2 }, 2000);

  assert.equal(telemetry.completedRuns.length, 1);
  assert.equal(telemetry.completedRuns[0].revealCount, 4);
  assert.equal(telemetry.completedRuns[0].firstPurchaseTimeMs, 250);
  assert.equal(telemetry.currentRun.revealCount, 0);
  assert.deepEqual(telemetry.currentRun.board, { rows: 4, cols: 4, mines: 2 });
});

test("developer telemetry derives rates, averages, and counter maps", () => {
  const telemetry = createDeveloperTelemetry();
  restartDeveloperRun(telemetry, { rows: 3, cols: 3, mines: 1 }, 1000);
  recordDeveloperEvent(telemetry, { type: "mineHit" }, 1200);
  recordDeveloperEvent(telemetry, { type: "equipment", id: "probeCharge" }, 1200);
  resolveDeveloperRun(telemetry, "mine_hit", 400, 1400);
  restartDeveloperRun(telemetry, { rows: 3, cols: 3, mines: 1 }, 2000);
  restartDeveloperRun(telemetry, { rows: 3, cols: 3, mines: 1 }, 2600);

  const summary = summarizeDeveloperTelemetry(telemetry, 2700);
  assert.equal(summary.runsRecorded, 2);
  assert.equal(summary.averageBoardDurationMs, 500);
  assert.equal(summary.mineHitRate, 0.5);
  assert.equal(summary.abandonedBoardRate, 0.5);
  assert.deepEqual(summary.equipmentUses, { probeCharge: 1 });
});

test("developer telemetry keeps structured board actions", () => {
  const telemetry = createDeveloperTelemetry();
  recordDeveloperAction(telemetry, {
    actor: "worker",
    specialistId: "excavator",
    actionType: "dig",
    target: { index: 4, row: 1, col: 1 },
    timeMs: 1250,
    evidence: [{ index: 1, row: 0, col: 1, adjacent: 1, flaggedNeighbors: 1, hiddenNeighbors: 1 }],
    result: { outcome: "opened", revealedTiles: [4, 5] },
  });

  assert.deepEqual(telemetry.actions, [{
    actor: "worker",
    specialistId: "excavator",
    actionType: "dig",
    target: { index: 4, row: 1, col: 1 },
    timeMs: 1250,
    evidence: [{ index: 1, row: 0, col: 1, adjacent: 1, flaggedNeighbors: 1, hiddenNeighbors: 1 }],
    result: { outcome: "opened", revealedTiles: [4, 5] },
  }]);
});
