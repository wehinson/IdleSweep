import test from "node:test";
import assert from "node:assert/strict";
import config from "../config.js";
import { blueprintChance, discoverBlueprint, selectBlueprintPlacement } from "../src/engine/blueprints.js";

function library() {
  return { ownedIds: [], reservedByBoardId: {}, pityMisses: 0, discoveries: [] };
}

test("blueprint pity grows, reservations prevent duplicates, and discovery resets pity", () => {
  assert.equal(blueprintChance(3, config.blueprints), 0.11);
  let state = library();
  let placement = selectBlueprintPlacement({ library: state, boardId: "a", rng: () => 0.99, config: config.blueprints, eligible: true });
  assert.equal(placement.library.pityMisses, 1);
  placement = selectBlueprintPlacement({ library: placement.library, boardId: "a", rng: () => 0, config: config.blueprints, eligible: true });
  assert.ok(placement.blueprintId);
  const discovered = discoverBlueprint({ ...placement.library, pityMisses: 7 }, "a", "2026-01-01T00:00:00.000Z");
  assert.equal(discovered.library.pityMisses, 0);
  assert.deepEqual(discovered.library.ownedIds, [placement.blueprintId]);
});
