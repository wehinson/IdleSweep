import test from "node:test";
import assert from "node:assert/strict";
import { assignBlueprints, assignWorkers, availableWorkers, createWorkerState, hireWorker, nextWorkerHireCost, upgradeWorker, workerUpgradeCost } from "../src/engine/workers.js";

const definitions = [{ id: "excavator", baseCost: 150 }];

test("worker ownership is separate from shared level and later hires grow fifteen-fold", () => {
  let state = createWorkerState(definitions, { excavator: 4 });
  assert.equal(state.workerTypes.excavator.level, 4);
  assert.equal(Object.keys(state.workersById).length, 1);
  assert.equal(nextWorkerHireCost(definitions[0], state.workerTypes.excavator), 2250);
  let result = hireWorker(state, definitions[0]);
  state = result.state;
  assert.equal(result.cost, 2250);
  result = hireWorker(state, definitions[0]);
  assert.equal(result.cost, 33750);
  assert.equal(result.state.workerTypes.excavator.level, 4);
});

test("Analyst levels, blueprint slots, and District assignments are individual", () => {
  const analyst = { id: "analyst", baseCost: 250 };
  let state = createWorkerState([analyst], {});
  state = hireWorker(state, analyst).state;
  assert.equal(workerUpgradeCost(analyst, state.workersById["analyst-1"], { baseCost: 5, growth: 1.6 }), 5);
  state = upgradeWorker(state, "analyst-1");
  assert.equal(workerUpgradeCost(analyst, state.workersById["analyst-1"], { baseCost: 5, growth: 1.6 }), 8);
  state = assignBlueprints(state, "analyst-1", ["pattern121"]);
  assert.deepEqual(state.workersById["analyst-1"].blueprintIds, ["pattern121"]);
  state = assignWorkers(state, ["analyst-1"], { type: "SURVEY", parcelId: "p1" });
  assert.equal(availableWorkers(state, "analyst").length, 0);
});
