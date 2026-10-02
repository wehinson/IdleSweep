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
  assert.equal(treasure.cost, Math.ceil(80 * 1.75 ** 5 * 1.01 ** 2 * 1.01 ** 3 * 1.06 ** 4));
  assert.notEqual(mine.multiplier, treasure.multiplier);
});


test("treasure upgrades cost more and increase faster than mine upgrades", () => {
  const mine = config.progression.items.addMine;
  const treasure = config.progression.items.addTreasure;
  assert.ok(treasure.baseCost > mine.baseCost);
  assert.ok(treasure.growth > mine.growth);
  let previousGap = 0;
  for (let level = 0; level < 15; level += 1) {
    const levels = { addMine: level, addTreasure: level, tallerGrid: 2, widerGrid: 3 };
    const cost = (id, item) => calculateCrossCost({ id, baseCost: item.baseCost, ownGrowth: item.growth, ownLevel: level, levels, categories: config.crossCosts.categories, matrix: config.crossCosts.matrix }).cost;
    const gap = cost("addTreasure", treasure) - cost("addMine", mine);
    assert.ok(gap > previousGap);
    previousGap = gap;
  }
});
