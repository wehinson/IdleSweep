import test from "node:test";
import assert from "node:assert/strict";
import { integerOptions, selectionAfterCapacityUpgrade } from "../src/engine/field-specifications.js";

test("a capacity upgrade follows a selection that was at its previous maximum", () => {
  assert.equal(selectionAfterCapacityUpgrade(5, 5, 6), 6);
});

test("a capacity upgrade keeps a selection that was below its previous maximum", () => {
  assert.equal(selectionAfterCapacityUpgrade(4, 5, 6), 4);
});

test("integer options include both limits", () => {
  assert.deepEqual(integerOptions(3, 6), [3, 4, 5, 6]);
});
