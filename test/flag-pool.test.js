import test from "node:test";
import assert from "node:assert/strict";
import {
  countDeployedFlags,
  createFlagPool,
  migrateLegacyFlagPool,
  refillFlagPool,
  repairMissingFlags,
  resolveFlagLoss,
  returnDeployedFlags,
  setManualFlagReserve,
  tickFlagRegeneration,
  tryDeployFlag,
  workerUsableFlags,
} from "../src/engine/flag-pool.js";

function session(flags, status = "COMMITTED") {
  return { status, modeState: { board: Array.from({ length: flags + 1 }, (_, index) => ({ flagged: index < flags })) } };
}

test("manual flags deploy, return, and remain global across Boards", () => {
  const boards = { main: session(2), contract: session(1) };
  let pool = createFlagPool(10, { availableFlags: 7, missingFlags: 0 });
  assert.equal(countDeployedFlags(boards), 3);
  const placement = tryDeployFlag(pool, 3);
  assert.equal(placement.ok, true);
  pool = placement.pool;
  assert.equal(pool.availableFlags, 6);
  pool = returnDeployedFlags(pool, 1, 3);
  assert.equal(pool.availableFlags, 7);
  assert.equal(pool.availableFlags + 3 + pool.missingFlags, pool.maximumFlags);
});

test("victory returns only that Board and keeps missing flags", () => {
  const pool = createFlagPool(10, { availableFlags: 3, missingFlags: 2 });
  const next = returnDeployedFlags(pool, 3, 2);
  assert.deepEqual([next.availableFlags, next.missingFlags], [6, 2]);
});

test("loss rolls each deployed flag independently", () => {
  const rolls = [0.1, 0.8, 0.2, 0.9];
  const result = resolveFlagLoss(createFlagPool(10, { availableFlags: 4, missingFlags: 0 }), 4, 2, () => rolls.shift(), 0.5);
  assert.deepEqual({ recovered: result.recovered, lost: result.lost }, { recovered: 2, lost: 2 });
  assert.deepEqual([result.pool.availableFlags, result.pool.missingFlags], [6, 2]);
});

test("regeneration returns one missing flag per interval and stops at zero", () => {
  let pool = createFlagPool(10, { availableFlags: 6, missingFlags: 3, flagRegenRemainingMs: 5000 });
  let result = tickFlagRegeneration(pool, 5000, 1, 30000);
  assert.equal(result.regenerated, 1);
  assert.deepEqual([result.pool.availableFlags, result.pool.missingFlags, result.pool.flagRegenRemainingMs], [7, 2, 30000]);
  result = tickFlagRegeneration(result.pool, 60000, 1, 30000);
  assert.equal(result.regenerated, 2);
  assert.deepEqual([result.pool.availableFlags, result.pool.missingFlags, result.pool.flagRegenRemainingMs], [9, 0, 0]);
});

test("shop repairs partial bundles and Locker upgrades refill around deployments", () => {
  let result = repairMissingFlags(createFlagPool(20, { availableFlags: 5, missingFlags: 2 }), 5, 13);
  assert.equal(result.repaired, 2);
  assert.deepEqual([result.pool.availableFlags, result.pool.missingFlags], [7, 0]);
  const upgraded = refillFlagPool(result.pool, 30, 13);
  assert.deepEqual([upgraded.maximumFlags, upgraded.availableFlags, upgraded.missingFlags], [30, 17, 0]);
});

test("Flagbearers respect the global manual reserve", () => {
  let pool = setManualFlagReserve(createFlagPool(15, { availableFlags: 5 }), 5);
  assert.equal(workerUsableFlags(pool), 0);
  assert.equal(tryDeployFlag(pool, 10, { worker: true }).reason, "manualReserve");
  assert.equal(tryDeployFlag(pool, 10).ok, true);
  pool = setManualFlagReserve(pool, 4);
  assert.equal(tryDeployFlag(pool, 10, { worker: true }).ok, true);
});

test("duplicate automatic placement does not consume another flag", () => {
  const pool = createFlagPool(10, { availableFlags: 6, missingFlags: 0 });
  const result = tryDeployFlag(pool, 4, { worker: true, cell: { flagged: true, flaggedByWorker: true } });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "alreadyFlagged");
  assert.equal(result.pool.availableFlags, 6);
});

test("legacy free automatic flags can remain over capacity without new placement", () => {
  const pool = migrateLegacyFlagPool({ maximumFlags: 15, oldAvailableFlags: 8, deployedFlags: 17 });
  assert.deepEqual([pool.availableFlags, pool.missingFlags, pool.migrationOverCapacity], [0, 0, true]);
  assert.equal(tryDeployFlag(pool, 17).ok, false);
  const normalized = returnDeployedFlags(pool, 3, 14);
  assert.deepEqual([normalized.availableFlags, normalized.missingFlags, normalized.migrationOverCapacity], [1, 0, false]);
});
