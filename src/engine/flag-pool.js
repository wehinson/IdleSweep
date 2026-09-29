const DEFAULT_REGEN_INTERVAL_MS = 30000;

export function createFlagPool(maximumFlags, options = {}) {
  const maximum = nonNegativeInteger(maximumFlags);
  const available = options.availableFlags === undefined ? maximum : nonNegativeInteger(options.availableFlags);
  const missing = options.missingFlags === undefined ? Math.max(0, maximum - available) : nonNegativeInteger(options.missingFlags);
  return {
    maximumFlags: maximum,
    availableFlags: Math.min(maximum, available),
    missingFlags: Math.min(maximum, missing),
    manualFlagReserve: Math.min(maximum, nonNegativeInteger(options.manualFlagReserve)),
    flagRegenRemainingMs: missing > 0
      ? positiveMilliseconds(options.flagRegenRemainingMs, options.regenIntervalMs)
      : 0,
    migrationOverCapacity: Boolean(options.migrationOverCapacity),
  };
}

export function workerUsableFlags(pool) {
  return Math.max(0, pool.availableFlags - pool.manualFlagReserve);
}

export function countBoardFlags(modeState) {
  const board = modeState?.board;
  if (Array.isArray(board)) {
    if (modeState.boardEncoding === 1) return board.filter((cell) => Boolean((cell?.[0] || 0) & 16)).length;
    return board.filter((cell) => Boolean(cell?.flagged)).length;
  }
  if (modeState?.boardEncoding === 2 && board?.cells) {
    const bytes = base64ToBytes(board.cells);
    let count = 0;
    for (let index = 0; index < board.length; index += 1) {
      const mask = bytes[index * 3] | ((bytes[index * 3 + 1] || 0) << 8);
      if (mask & 16) count += 1;
    }
    return count;
  }
  return 0;
}

export function countDeployedFlags(boardSessions = {}, options = {}) {
  const includeResolved = Boolean(options.includeResolved);
  return Object.values(boardSessions).reduce((total, session) => {
    if (!includeResolved && ["WON", "LOST"].includes(session?.status)) return total;
    return total + countBoardFlags(session?.modeState);
  }, 0);
}

export function validateFlagPool(pool, deployedFlags) {
  const maximum = nonNegativeInteger(pool.maximumFlags);
  const deployed = nonNegativeInteger(deployedFlags);
  const overCapacity = deployed > maximum;
  const availableLimit = Math.max(0, maximum - deployed);
  const available = Math.min(availableLimit, nonNegativeInteger(pool.availableFlags));
  const missingLimit = Math.max(0, maximum - deployed - available);
  const missing = overCapacity ? 0 : Math.min(missingLimit, nonNegativeInteger(pool.missingFlags));
  const repairedMissing = overCapacity ? 0 : maximum - deployed - available;
  return {
    ...pool,
    maximumFlags: maximum,
    availableFlags: available,
    missingFlags: Math.max(missing, repairedMissing),
    manualFlagReserve: Math.min(maximum, nonNegativeInteger(pool.manualFlagReserve)),
    flagRegenRemainingMs: repairedMissing > 0
      ? positiveMilliseconds(pool.flagRegenRemainingMs)
      : 0,
    migrationOverCapacity: overCapacity,
  };
}

export function migrateLegacyFlagPool({ maximumFlags, oldAvailableFlags, deployedFlags, manualFlagReserve = 0, regenIntervalMs }) {
  const maximum = nonNegativeInteger(maximumFlags);
  const deployed = nonNegativeInteger(deployedFlags);
  if (deployed > maximum) {
    return createFlagPool(maximum, {
      availableFlags: 0,
      missingFlags: 0,
      manualFlagReserve,
      migrationOverCapacity: true,
      regenIntervalMs,
    });
  }
  const available = Math.min(nonNegativeInteger(oldAvailableFlags), maximum - deployed);
  return createFlagPool(maximum, {
    availableFlags: available,
    missingFlags: maximum - deployed - available,
    manualFlagReserve,
    regenIntervalMs,
  });
}

export function tryDeployFlag(pool, deployedFlags, { worker = false, cell = null } = {}) {
  const normalized = validateFlagPool(pool, deployedFlags);
  if (cell?.flagged) return { ok: false, reason: "alreadyFlagged", pool: normalized };
  if (normalized.migrationOverCapacity || normalized.availableFlags <= 0) return { ok: false, reason: "noFlags", pool: normalized };
  if (worker && workerUsableFlags(normalized) <= 0) return { ok: false, reason: "manualReserve", pool: normalized };
  return { ok: true, pool: { ...normalized, availableFlags: normalized.availableFlags - 1 } };
}

export function returnDeployedFlags(pool, count, deployedFlagsAfterReturn) {
  const returned = nonNegativeInteger(count);
  const deployed = nonNegativeInteger(deployedFlagsAfterReturn);
  const room = Math.max(0, pool.maximumFlags - deployed - pool.missingFlags - pool.availableFlags);
  const availableFlags = pool.availableFlags + Math.min(returned, room);
  return validateFlagPool({ ...pool, availableFlags }, deployed);
}

export function resolveFlagLoss(pool, count, deployedFlagsAfterLoss, rng = Math.random, recoveryChance = 0.5) {
  const exposed = nonNegativeInteger(count);
  const chance = Math.max(0, Math.min(1, Number(recoveryChance) || 0));
  let recovered = 0;
  for (let index = 0; index < exposed; index += 1) if (rng() < chance) recovered += 1;
  const deployed = nonNegativeInteger(deployedFlagsAfterLoss);
  const room = Math.max(0, pool.maximumFlags - deployed - pool.availableFlags - pool.missingFlags);
  const returned = Math.min(recovered, room);
  const newlyMissing = Math.min(exposed - recovered, Math.max(0, room - returned));
  const next = validateFlagPool({
    ...pool,
    availableFlags: pool.availableFlags + returned,
    missingFlags: pool.missingFlags + newlyMissing,
  }, deployed);
  return { pool: next, exposed, recovered: returned, lost: newlyMissing };
}

export function repairMissingFlags(pool, count, deployedFlags) {
  const repaired = Math.min(nonNegativeInteger(count), pool.missingFlags);
  const next = validateFlagPool({
    ...pool,
    missingFlags: pool.missingFlags - repaired,
    availableFlags: pool.availableFlags + repaired,
  }, deployedFlags);
  return { pool: next, repaired };
}

export function refillFlagPool(pool, maximumFlags, deployedFlags) {
  const maximum = nonNegativeInteger(maximumFlags);
  const deployed = nonNegativeInteger(deployedFlags);
  return createFlagPool(maximum, {
    availableFlags: Math.max(0, maximum - deployed),
    missingFlags: 0,
    manualFlagReserve: Math.min(maximum, pool.manualFlagReserve),
    flagRegenRemainingMs: 0,
    migrationOverCapacity: deployed > maximum,
  });
}

export function setManualFlagReserve(pool, value) {
  return { ...pool, manualFlagReserve: Math.min(pool.maximumFlags, nonNegativeInteger(value)) };
}

export function tickFlagRegeneration(pool, elapsedMs, deployedFlags, intervalMs = DEFAULT_REGEN_INTERVAL_MS) {
  const interval = Math.max(1, nonNegativeInteger(intervalMs) || DEFAULT_REGEN_INTERVAL_MS);
  let next = validateFlagPool(pool, deployedFlags);
  if (next.missingFlags <= 0) return { pool: { ...next, flagRegenRemainingMs: 0 }, regenerated: 0 };
  let remaining = positiveMilliseconds(next.flagRegenRemainingMs, interval) - Math.max(0, Number(elapsedMs) || 0);
  let regenerated = 0;
  while (remaining <= 0 && next.missingFlags > 0) {
    const repair = repairMissingFlags(next, 1, deployedFlags);
    next = repair.pool;
    regenerated += repair.repaired;
    remaining += interval;
  }
  return {
    pool: { ...next, flagRegenRemainingMs: next.missingFlags > 0 ? remaining : 0 },
    regenerated,
  };
}

function nonNegativeInteger(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function positiveMilliseconds(value, fallback = DEFAULT_REGEN_INTERVAL_MS) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : Math.max(1, Number(fallback) || DEFAULT_REGEN_INTERVAL_MS);
}

function base64ToBytes(value) {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(value, "base64"));
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
