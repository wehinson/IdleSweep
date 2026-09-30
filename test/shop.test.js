import test from "node:test";
import assert from "node:assert/strict";
import config from "../config.js";
import { SPECIAL_EQUIPMENT } from "../src/engine/catalogs.js";
import { equipmentShopState, purchaseSpecialEquipment, upgradeIsUnlocked, flagReplacementSize } from "../src/engine/shop.js";
import { createProfile, createRun, restructureState } from "../src/engine/runs.js";
import { repairMissingFlags, createFlagPool } from "../src/engine/flag-pool.js";
import { purchaseChording, chordingLevel } from "../src/engine/abilities.js";
import { createStartingSpecialEquipment } from "../src/engine/player.js";

test("starter equipment does not reveal the shop or count as a purchase", () => {
  const player = { mines: 0, stats: { minesRecovered: 0 }, specialEquipment: createStartingSpecialEquipment(SPECIAL_EQUIPMENT) };
  assert.equal(equipmentShopState(player, createProfile()).unlocked, false);
  assert.equal(equipmentShopState(player).unlocked, false);
  player.mines = 1;
  assert.deepEqual(equipmentShopState(player, createProfile()).items.map((item) => item.id), ["probeCharge"]);
});

test("equipment requires recovered mines and unlocks in price order after purchases", () => {
  const player = { mines: 0, specialEquipment: {}, stats: { minesRecovered: 0 } };
  const profile = createProfile();
  assert.deepEqual(equipmentShopState(player, profile).items, []);
  player.mines = 50;
  assert.deepEqual(equipmentShopState(player, profile).items.map((item) => item.id), ["probeCharge"]);
  assert.equal(purchaseSpecialEquipment(player, profile, "bombBot"), false);
  for (let index = 0; index < SPECIAL_EQUIPMENT.length; index += 1) {
    const item = SPECIAL_EQUIPMENT[index];
    assert.equal(purchaseSpecialEquipment(player, profile, item.id), true);
    player.specialEquipment[item.id] = 0;
    assert.deepEqual(equipmentShopState(player, profile).items.map((entry) => entry.id), SPECIAL_EQUIPMENT.slice(0, index + 2).map((entry) => entry.id));
  }
  player.mines = 0;
  const retained = restructureState({ profile, run: createRun(), boardSessions: {}, createRunState: createRun }).profile;
  assert.equal(equipmentShopState(player, retained).items.length, SPECIAL_EQUIPMENT.length);
});

test("unaffordable equipment cannot unlock the next item", () => {
  const player = { mines: 0, specialEquipmentUnlocked: true, specialEquipment: {} };
  const profile = createProfile();
  assert.equal(purchaseSpecialEquipment(player, profile, "probeCharge"), false);
  assert.deepEqual(profile.equipmentPurchaseIds, []);
});

test("upgrades reveal a growing prefix in their constant order", () => {
  const keys = ["tallerGridLevel", "widerGridLevel", "shovelTier", "mineLevel", "treasureLevel", "mineYieldLevel", "treasureValueLevel", "betterFlagsLevel"];
  const player = Object.fromEntries(keys.map((key) => [key, 0]));
  const order = config.progression.order;
  for (let index = 0; index < order.length; index += 1) {
    assert.deepEqual(order.filter((id) => upgradeIsUnlocked(id, player, order)), order.slice(0, index + 1));
    player[keys[index]] += 1;
  }
});

test("flag replacement restores half of capacity and caps at missing stock", () => {
  assert.deepEqual(config.capacity.flags.map((capacity) => flagReplacementSize(capacity)), [7, 50, 125, 250]);
  const pool = createFlagPool(100, { availableFlags: 0 });
  assert.equal(repairMissingFlags(pool, flagReplacementSize(100), 0).repaired, 50);
  const partial = createFlagPool(100, { availableFlags: 97 });
  assert.equal(repairMissingFlags(partial, flagReplacementSize(100), 0).repaired, 3);
});

test("chording has two paid levels, a maximum, and preserves legacy cascade access", () => {
  const player = { mines: 11, shovelTier: 3, safetyRadius: 1, chordingLevel: 0 };
  assert.equal(purchaseChording(player, config.abilities.chordingMineCosts), true);
  assert.equal(chordingLevel(player), 1);
  assert.equal(player.mines, 8);
  assert.equal(purchaseChording(player, config.abilities.chordingMineCosts), true);
  assert.equal(chordingLevel(player), 2);
  assert.equal(player.mines, 0);
  assert.equal(purchaseChording(player, config.abilities.chordingMineCosts), false);
  assert.equal(chordingLevel({ chordingUnlocked: true }), 2);
  assert.equal(purchaseChording({ mines: 100, shovelTier: 2, safetyRadius: 1 }, config.abilities.chordingMineCosts), false);
});
