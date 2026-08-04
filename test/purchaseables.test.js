import test from "node:test";
import assert from "node:assert/strict";
import GAME_CONFIG from "../config.js";
import { performPurchase } from "../src/engine/purchaseables.js";
import {
  PURCHASEABLE_KINDS,
  SPECIAL_EQUIPMENT,
  STORE_PURCHASEABLES,
  STORE_PURCHASEABLE_BY_ID,
} from "../src/engine/catalogs.js";

test("store purchaseable registry has unique stable ids across every store kind", () => {
  const ids = STORE_PURCHASEABLES.map((purchaseable) => purchaseable.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(new Set(STORE_PURCHASEABLES.map((purchaseable) => purchaseable.kind)), new Set(Object.values(PURCHASEABLE_KINDS)));
  assert.equal(STORE_PURCHASEABLE_BY_ID["supply:shovel"].telemetryId, "shovel");
  assert.equal(STORE_PURCHASEABLE_BY_ID["upgrade:shovelCapacity"].kind, PURCHASEABLE_KINDS.upgrade);
  assert.equal(STORE_PURCHASEABLE_BY_ID["ability:chording"].kind, PURCHASEABLE_KINDS.ability);
  assert.deepEqual(
    STORE_PURCHASEABLES.filter((purchaseable) => purchaseable.kind === PURCHASEABLE_KINDS.upgrade && !purchaseable.targetId.endsWith("Capacity"))
      .map((purchaseable) => purchaseable.targetId),
    GAME_CONFIG.progression.order,
  );
  assert.deepEqual(
    STORE_PURCHASEABLES.filter((purchaseable) => purchaseable.kind === PURCHASEABLE_KINDS.supply).map((purchaseable) => purchaseable.targetId),
    ["shovel", "flags", "hints"],
  );
});

test("every special equipment item has a store purchaseable", () => {
  for (const item of SPECIAL_EQUIPMENT) {
    assert.deepEqual(STORE_PURCHASEABLE_BY_ID[`equipment:${item.id}`], {
      id: `equipment:${item.id}`,
      kind: PURCHASEABLE_KINDS.equipment,
      targetId: item.id,
      telemetryId: `equipment:${item.id}`,
    });
  }
});

test("shared purchase dispatcher rejects unavailable or unknown purchases without invoking handlers", () => {
  let calls = 0;
  const handlers = Object.fromEntries(Object.values(PURCHASEABLE_KINDS).map((kind) => [kind, () => {
    calls += 1;
    return true;
  }]));

  assert.equal(performPurchase({ registry: STORE_PURCHASEABLE_BY_ID, id: "supply:shovel", isAvailable: () => false, handlers }), false);
  assert.equal(performPurchase({ registry: STORE_PURCHASEABLE_BY_ID, id: "unknown", isAvailable: () => true, handlers }), false);
  assert.equal(calls, 0);
});

test("shared purchase dispatcher delegates each purchase kind to its matching handler", () => {
  const handled = [];
  const handlers = Object.fromEntries(Object.values(PURCHASEABLE_KINDS).map((kind) => [kind, (purchaseable) => {
    handled.push(`${kind}:${purchaseable.targetId}`);
    return true;
  }]));

  for (const [id, expected] of [
    ["supply:shovel", "supply:shovel"],
    ["upgrade:shovelCapacity", "upgrade:shovelCapacity"],
    ["ability:safetyRadius", "ability:safetyRadius"],
    ["equipment:probeCharge", "equipment:probeCharge"],
  ]) {
    assert.equal(performPurchase({ registry: STORE_PURCHASEABLE_BY_ID, id, isAvailable: () => true, handlers }), true);
    assert.equal(handled.at(-1), expected);
  }
});
