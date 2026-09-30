import { SPECIAL_EQUIPMENT } from "./catalogs.js";
import { createStartingSpecialEquipment } from "./player.js";

const UPGRADE_LEVEL_KEYS = Object.freeze({
  tallerGrid: "tallerGridLevel", widerGrid: "widerGridLevel", improveShovel: "shovelTier",
  addMine: "mineLevel", addTreasure: "treasureLevel", mineYield: "mineYieldLevel",
  treasureValue: "treasureValueLevel", betterFlags: "betterFlagsLevel",
  shovelCapacity: "shovelCapacityLevel", flagCapacity: "flagCapacityLevel",
});

export function upgradeIsUnlocked(id, player, order) {
  const index = order.indexOf(id);
  if (index <= 0) return true;
  const lastPurchased = order.reduce((last, entry, position) => player[UPGRADE_LEVEL_KEYS[entry]] > 0 ? position : last, -1);
  return index <= lastPurchased + 1;
}

export function flagReplacementSize(capacity, fraction = 0.5) {
  return Math.max(1, Math.floor(capacity * fraction));
}

export function equipmentShopState(player, profile = {}) {
  const purchasedIds = new Set(profile.equipmentPurchaseIds || []);
  // Older saves have no purchase history. Starter tools are not purchases.
  if (!Array.isArray(profile.equipmentPurchaseIds)) {
    const startingStock = createStartingSpecialEquipment(SPECIAL_EQUIPMENT);
    SPECIAL_EQUIPMENT.forEach((item) => {
      if ((player.specialEquipment?.[item.id] || 0) > startingStock[item.id]) purchasedIds.add(item.id);
    });
  }
  const unlocked = Boolean(player.specialEquipmentUnlocked || player.mines > 0
    || player.stats?.minesRecovered > 0 || purchasedIds.size);
  const lastPurchased = SPECIAL_EQUIPMENT.reduce((last, item, index) => purchasedIds.has(item.id) ? index : last, -1);
  return {
    unlocked,
    purchasedIds: [...purchasedIds],
    items: unlocked ? SPECIAL_EQUIPMENT.slice(0, lastPurchased + 2) : [],
  };
}

export function purchaseSpecialEquipment(player, profile, id) {
  const shop = equipmentShopState(player, profile);
  const item = shop.items.find((entry) => entry.id === id);
  if (!item || player.mines < item.cost) return false;
  player.mines -= item.cost;
  player.specialEquipment[id] = (player.specialEquipment[id] || 0) + 1;
  player.specialEquipmentUnlocked = true;
  profile.equipmentPurchaseIds = [...new Set([...shop.purchasedIds, id])];
  return true;
}
