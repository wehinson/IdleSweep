import test from "node:test";
import assert from "node:assert/strict";
import { clamp, exponentialCost, formatCurrency, randomInteger } from "../src/engine/economy.js";

test("economy helpers preserve game rounding and deterministic randomness", () => {
  assert.equal(exponentialCost(10, 1.25, 1), 13);
  assert.equal(formatCurrency(12.9, "$"), "$12");
  assert.equal(clamp(20, 1, 10), 10);
  assert.equal(randomInteger(2, 5, () => 0), 2);
  assert.equal(randomInteger(2, 5, () => 0.999), 5);
});
