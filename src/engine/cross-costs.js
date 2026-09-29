export const CROSS_COST_UPGRADES = Object.freeze({
  tallerGrid: "height",
  widerGrid: "width",
  addMine: "mines",
  addTreasure: "treasure",
});

export function calculateCrossCost({ id, baseCost, ownGrowth, ownLevel, levels, categories = CROSS_COST_UPGRADES, matrix }) {
  const target = categories[id];
  let multiplier = 1;
  if (target) {
    for (const [sourceId, sourceCategory] of Object.entries(categories)) {
      if (sourceId === id) continue;
      const factor = matrix?.[target]?.[sourceCategory] ?? 1;
      multiplier *= factor ** Math.max(0, Number(levels?.[sourceId]) || 0);
    }
  }
  const base = Number(baseCost) * Number(ownGrowth) ** Math.max(0, Number(ownLevel) || 0);
  return {
    baseCost: Math.ceil(base),
    multiplier,
    surcharge: Math.max(0, Math.ceil(base * multiplier) - Math.ceil(base)),
    cost: Math.ceil(base * multiplier),
  };
}
