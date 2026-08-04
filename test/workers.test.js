import test from "node:test";
import assert from "node:assert/strict";
import { createWorkerState, hireWorker, nextWorkerHireCost } from "../src/engine/workers.js";

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
