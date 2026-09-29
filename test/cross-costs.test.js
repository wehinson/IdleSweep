import test from "node:test";
import assert from "node:assert/strict";
import config from "../config.js";
import { calculateCrossCost } from "../src/engine/cross-costs.js";

test("cross-costs apply the configured asymmetric matrix", () => {
  const levels = { tallerGrid: 2, widerGrid: 3, addMine: 4, addTreasure: 5 };
  const mine = calculateCrossCost({
    id: "addMine", baseCost: 90, ownGrowth: 1.8, ownLevel: 4, levels,
    categories: config.crossCosts.categories, matrix: config.crossCosts.matrix,
  });
  const treasure = calculateCrossCost({
    id: "addTreasure", baseCost: 80, ownGrowth: 1.75, ownLevel: 5, levels,
    categories: config.crossCosts.categories, matrix: config.crossCosts.matrix,
  });
  assert.equal(mine.cost, Math.ceil(90 * 1.8 ** 4 * 1.01 ** 2 * 1.01 ** 3 * 1.05 ** 5));
  assert.equal(treasure.cost, Math.ceil(80 * 1.75 ** 5 * 1.01 ** 2 * 1.01 ** 3 * 1.04 ** 4));
  assert.notEqual(mine.multiplier, treasure.multiplier);
});
