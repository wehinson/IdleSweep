import test from "node:test";
import assert from "node:assert/strict";
import { challengeMatchesClear } from "../src/engine/challenges.js";
import { contractDigRequirement, listAvailableContracts } from "../src/engine/contracts.js";
import { createAutoMinerState, surveyorIntervalMs, workerCost } from "../src/engine/auto-miners.js";

test("contract rules calculate capacity and availability", () => {
  const types = [{ id: "a", rows: 4, cols: 5 }, { id: "b", rows: 5, cols: 5 }];
  const contracts = { active: null, unlockedTypeCount: 2, cooldowns: [0, 3] };
  assert.equal(contractDigRequirement(types[0], 1), 20);
  assert.deepEqual(listAvailableContracts(types, contracts, [], false).map(({ id }) => id), ["a"]);
  assert.deepEqual(listAvailableContracts(types, contracts, ["a"], true).map(({ id }) => id), ["b"]);
});

test("challenge rules preserve flag, chord, and speed behavior", () => {
  const base = { sizeAny: true, minesAny: true };
  assert.equal(challengeMatchesClear({ ...base, type: "flagLimit", flagLimit: 2 }, { flagPlacements: 2 }), true);
  assert.equal(challengeMatchesClear({ ...base, type: "noChording" }, { usedChording: true }), false);
  assert.equal(challengeMatchesClear({ ...base, type: "speedClear", seconds: 10 }, { elapsed: 9999 }), true);
});

test("Auto Miner state and costs are deterministic", () => {
  const specialists = [
    { id: "surveyor", group: "queue", baseCost: 100 },
    { id: "excavator", group: "agents", baseCost: 150 },
    { id: "analyst", group: "specialists", baseCost: 5 },
  ];
  const state = createAutoMinerState(specialists, 250);
  assert.equal(state.lastSurveyAt, 250);
  assert.equal(state.automationMode, "manual");
  assert.equal(state.workerTargets.excavator, null);
  assert.equal(state.workerPolicies.excavator, "focus");
  assert.deepEqual(state.initiative.specialists, ["analyst"]);
  assert.equal(workerCost(specialists[0], 1), 160);
  assert.equal(surveyorIntervalMs(1), 60000);
});
