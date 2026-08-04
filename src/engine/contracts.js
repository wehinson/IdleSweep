export function findContractType(types, id) {
  return types.find((type) => type.id === id) || null;
}

export function contractDigRequirement(contractType, digCostPerTile) {
  return contractType.rows * contractType.cols * digCostPerTile;
}

export function listAvailableContracts(types, contracts, offeredIds, ignoreCooldowns = false) {
  const unavailableIds = new Set(offeredIds);
  if (contracts.active?.id) unavailableIds.add(contracts.active.id);
  return types.filter((type, index) => (
    index < contracts.unlockedTypeCount
    && !unavailableIds.has(type.id)
    && (ignoreCooldowns || (contracts.cooldowns[index] || 0) <= 0)
  ));
}

export function tickContractCooldowns(cooldowns) {
  return cooldowns.map((count) => Math.max(0, count - 1));
}
