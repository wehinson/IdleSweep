export const DEVELOPER_TELEMETRY_VERSION = 1;

export function createDeveloperTelemetry() {
  return {
    schemaVersion: DEVELOPER_TELEMETRY_VERSION,
    nextAttemptNumber: 1,
    currentAttempt: null,
    completedAttempts: [],
  };
}

export function hydrateDeveloperTelemetry(value) {
  const telemetry = value && typeof value === "object" ? value : createDeveloperTelemetry();
  return {
    schemaVersion: DEVELOPER_TELEMETRY_VERSION,
    nextAttemptNumber: Math.max(1, Number(telemetry.nextAttemptNumber ?? telemetry.nextRunNumber) || 1),
    currentAttempt: telemetry.currentAttempt || telemetry.currentRun ? cloneRun(telemetry.currentAttempt || telemetry.currentRun) : null,
    completedAttempts: Array.isArray(telemetry.completedAttempts || telemetry.completedRuns)
      ? (telemetry.completedAttempts || telemetry.completedRuns).map(cloneRun) : [],
  };
}

// Records a board interaction as a durable audit entry.  This intentionally
// lives beside the aggregate telemetry rather than in a tile, so the board
// remains a snapshot of its current state while the save retains its history.
export function recordDeveloperAction(telemetry, action) {
  const attempt = telemetry?.currentAttempt;
  if (!attempt) return;
  attempt.actionCount = (attempt.actionCount || 0) + 1;
  if (action.actor === "worker") attempt.workerActionCount = (attempt.workerActionCount || 0) + 1;
}

export function restartDeveloperRun(telemetry, context, now = Date.now()) {
  if (telemetry.currentAttempt) finalizeCurrentRun(telemetry, "abandoned", now);
  const runNumber = telemetry.nextAttemptNumber;
  telemetry.nextAttemptNumber += 1;
  telemetry.currentAttempt = {
    id: `board-attempt-${runNumber}`,
    attemptNumber: runNumber,
    startedAtEpochMs: now,
    endedAtEpochMs: null,
    durationMs: null,
    mode: "board",
    board: {
      rows: context.rows,
      cols: context.cols,
      mines: context.mines,
    },
    contractId: context.contractId || null,
    outcome: "in_progress",
    digActions: 0,
    revealCount: 0,
    flagPlacements: 0,
    manualFlagPlacements: 0,
    automaticFlagPlacements: 0,
    flagRemovals: 0,
    flagsReturnedAfterVictory: 0,
    flagsExposed: 0,
    flagsRecoveredAfterFailure: 0,
    flagsLostAfterFailure: 0,
    flagsRegenerated: 0,
    flagsReplaced: 0,
    flagLockerRefills: 0,
    missingFlagTimeMs: 0,
    flagbearerNoFlagsTimeMs: 0,
    manualReserveBlocks: 0,
    preRiskFlagRemovals: 0,
    flagPoolAtStart: {
      available: Math.max(0, Number(context.availableFlags) || 0),
      deployed: Math.max(0, Number(context.deployedFlags) || 0),
      missing: Math.max(0, Number(context.missingFlags) || 0),
    },
    flagPoolAtEnd: null,
    chordUses: 0,
    mineHits: 0,
    shovelDurabilityConsumed: 0,
    shovelsConsumed: 0,
    coinsEarned: 0,
    recoveredMinesEarned: 0,
    contractCompletionTimeMs: null,
    equipmentUses: {},
    purchases: {},
    firstPurchaseTimeMs: null,
    actionCount: 0,
    workerActionCount: 0,
  };
  return telemetry.currentAttempt;
}

export function recordDeveloperEvent(telemetry, event, now = Date.now()) {
  const run = telemetry.currentAttempt;
  if (!run || run.outcome !== "in_progress") return;
  const count = Math.max(0, Number(event.count) || 0);
  switch (event.type) {
    case "dig": run.digActions += count || 1; break;
    case "reveal": run.revealCount += count || 1; break;
    case "flagPlaced": run.flagPlacements += count || 1; run.manualFlagPlacements += count || 1; break;
    case "automaticFlagPlaced": run.flagPlacements += count || 1; run.automaticFlagPlacements += count || 1; break;
    case "flagRemoved": run.flagRemovals += count || 1; break;
    case "flagsReturnedAfterVictory": run.flagsReturnedAfterVictory += count; break;
    case "flagsExposed": run.flagsExposed += count; break;
    case "flagsRecoveredAfterFailure": run.flagsRecoveredAfterFailure += count; break;
    case "flagsLostAfterFailure": run.flagsLostAfterFailure += count; break;
    case "flagsRegenerated": run.flagsRegenerated += count; break;
    case "flagsReplaced": run.flagsReplaced += count; break;
    case "flagLockerRefill": run.flagLockerRefills += count || 1; break;
    case "missingFlagTime": run.missingFlagTimeMs += count; break;
    case "flagbearerNoFlagsTime": run.flagbearerNoFlagsTimeMs += count; break;
    case "manualReserveBlockedFlagbearer": run.manualReserveBlocks += count || 1; break;
    case "preRiskFlagRemoval": run.preRiskFlagRemovals += count || 1; break;
    case "flagPoolEnd": run.flagPoolAtEnd = { available: event.available, deployed: event.deployed, missing: event.missing }; break;
    case "chord": run.chordUses += count || 1; break;
    case "mineHit": run.mineHits += count || 1; break;
    case "shovelDurability": run.shovelDurabilityConsumed += count; break;
    case "shovelConsumed": run.shovelsConsumed += count || 1; break;
    case "coinsEarned": run.coinsEarned += count; break;
    case "recoveredMines": run.recoveredMinesEarned += count; break;
    case "equipment": incrementMap(run.equipmentUses, event.id, count || 1); break;
    case "purchase":
      incrementMap(run.purchases, event.id, count || 1);
      if (run.firstPurchaseTimeMs === null) run.firstPurchaseTimeMs = Math.max(0, now - run.startedAtEpochMs);
      break;
    default: break;
  }
}

export function resolveDeveloperRun(telemetry, outcome, durationMs, now = Date.now()) {
  const run = telemetry.currentAttempt;
  if (!run || run.outcome !== "in_progress") return;
  run.outcome = outcome;
  run.durationMs = Math.max(0, Number(durationMs) || 0);
  run.endedAtEpochMs = now;
  if (outcome === "contract_completed") run.contractCompletionTimeMs = run.durationMs;
}

export function summarizeDeveloperTelemetry(telemetry, now = Date.now()) {
  const runs = [...telemetry.completedAttempts];
  if (telemetry.currentAttempt?.outcome !== "in_progress") runs.push(telemetry.currentAttempt);
  const boardDurations = runs.map((run) => run.durationMs).filter(Number.isFinite);
  const contractDurations = runs.map((run) => run.contractCompletionTimeMs).filter(Number.isFinite);
  const firstPurchases = runs.map((run) => run.firstPurchaseTimeMs).filter(Number.isFinite);
  const totals = runs.reduce((result, run) => {
    for (const key of ["revealCount", "flagPlacements", "manualFlagPlacements", "automaticFlagPlacements", "flagRemovals", "flagsReturnedAfterVictory", "flagsExposed", "flagsRecoveredAfterFailure", "flagsLostAfterFailure", "flagsRegenerated", "flagsReplaced", "flagLockerRefills", "missingFlagTimeMs", "flagbearerNoFlagsTimeMs", "manualReserveBlocks", "preRiskFlagRemovals", "chordUses", "mineHits", "shovelDurabilityConsumed", "shovelsConsumed", "coinsEarned", "recoveredMinesEarned"]) {
      result[key] += Number(run[key]) || 0;
    }
    mergeMap(result.equipmentUses, run.equipmentUses);
    mergeMap(result.purchases, run.purchases);
    return result;
  }, {
    revealCount: 0, flagPlacements: 0, manualFlagPlacements: 0, automaticFlagPlacements: 0, flagRemovals: 0,
    flagsReturnedAfterVictory: 0, flagsExposed: 0, flagsRecoveredAfterFailure: 0, flagsLostAfterFailure: 0,
    flagsRegenerated: 0, flagsReplaced: 0, flagLockerRefills: 0, missingFlagTimeMs: 0,
    flagbearerNoFlagsTimeMs: 0, manualReserveBlocks: 0, preRiskFlagRemovals: 0,
    chordUses: 0, mineHits: 0,
    shovelDurabilityConsumed: 0, shovelsConsumed: 0, coinsEarned: 0, recoveredMinesEarned: 0,
    equipmentUses: {}, purchases: {},
  });
  const abandoned = runs.filter((run) => run.outcome === "abandoned").length;
  return {
    attemptsRecorded: runs.length,
    averageBoardDurationMs: average(boardDurations),
    mineHitRate: runs.length ? totals.mineHits / runs.length : 0,
    abandonedBoardRate: runs.length ? abandoned / runs.length : 0,
    averageContractCompletionTimeMs: average(contractDurations),
    averageTimeBeforeFirstPurchaseMs: average(firstPurchases),
    ...totals,
    currentAttemptElapsedMs: telemetry.currentAttempt?.outcome === "in_progress"
      ? Math.max(0, now - telemetry.currentAttempt.startedAtEpochMs)
      : 0,
  };
}

function finalizeCurrentRun(telemetry, fallbackOutcome, now) {
  const run = telemetry.currentAttempt;
  if (run.outcome === "in_progress") {
    run.outcome = fallbackOutcome;
    run.endedAtEpochMs = now;
    run.durationMs = Math.max(0, now - run.startedAtEpochMs);
  }
  telemetry.completedAttempts.push(cloneRun(run));
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function incrementMap(target, id, count) {
  if (!id) return;
  target[id] = (target[id] || 0) + count;
}

function mergeMap(target, source = {}) {
  Object.entries(source).forEach(([id, count]) => incrementMap(target, id, Number(count) || 0));
}

function cloneRun(run) {
  return JSON.parse(JSON.stringify(run));
}
