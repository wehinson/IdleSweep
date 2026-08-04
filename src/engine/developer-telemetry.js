export const DEVELOPER_TELEMETRY_VERSION = 1;

export function createDeveloperTelemetry() {
  return {
    schemaVersion: DEVELOPER_TELEMETRY_VERSION,
    nextRunNumber: 1,
    currentRun: null,
    completedRuns: [],
    actions: [],
  };
}

export function hydrateDeveloperTelemetry(value) {
  const telemetry = value && typeof value === "object" ? value : createDeveloperTelemetry();
  return {
    schemaVersion: DEVELOPER_TELEMETRY_VERSION,
    nextRunNumber: Math.max(1, Number(telemetry.nextRunNumber) || 1),
    currentRun: telemetry.currentRun ? cloneRun(telemetry.currentRun) : null,
    completedRuns: Array.isArray(telemetry.completedRuns) ? telemetry.completedRuns.map(cloneRun) : [],
    actions: Array.isArray(telemetry.actions) ? telemetry.actions.map(cloneAction) : [],
  };
}

// Records a board interaction as a durable audit entry.  This intentionally
// lives beside the aggregate telemetry rather than in a tile, so the board
// remains a snapshot of its current state while the save retains its history.
export function recordDeveloperAction(telemetry, action) {
  if (!telemetry || !Array.isArray(telemetry.actions)) return;
  telemetry.actions.push(cloneAction(action));
}

export function restartDeveloperRun(telemetry, context, now = Date.now()) {
  if (telemetry.currentRun) finalizeCurrentRun(telemetry, "abandoned", now);
  const runNumber = telemetry.nextRunNumber;
  telemetry.nextRunNumber += 1;
  telemetry.currentRun = {
    id: `board-${runNumber}`,
    runNumber,
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
    flagRemovals: 0,
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
  };
  return telemetry.currentRun;
}

export function recordDeveloperEvent(telemetry, event, now = Date.now()) {
  const run = telemetry.currentRun;
  if (!run || run.outcome !== "in_progress") return;
  const count = Math.max(0, Number(event.count) || 0);
  switch (event.type) {
    case "dig": run.digActions += count || 1; break;
    case "reveal": run.revealCount += count || 1; break;
    case "flagPlaced": run.flagPlacements += count || 1; break;
    case "flagRemoved": run.flagRemovals += count || 1; break;
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
  const run = telemetry.currentRun;
  if (!run || run.outcome !== "in_progress") return;
  run.outcome = outcome;
  run.durationMs = Math.max(0, Number(durationMs) || 0);
  run.endedAtEpochMs = now;
  if (outcome === "contract_completed") run.contractCompletionTimeMs = run.durationMs;
}

export function summarizeDeveloperTelemetry(telemetry, now = Date.now()) {
  const runs = [...telemetry.completedRuns];
  if (telemetry.currentRun?.outcome !== "in_progress") runs.push(telemetry.currentRun);
  const boardDurations = runs.map((run) => run.durationMs).filter(Number.isFinite);
  const contractDurations = runs.map((run) => run.contractCompletionTimeMs).filter(Number.isFinite);
  const firstPurchases = runs.map((run) => run.firstPurchaseTimeMs).filter(Number.isFinite);
  const totals = runs.reduce((result, run) => {
    for (const key of ["revealCount", "flagPlacements", "flagRemovals", "chordUses", "mineHits", "shovelDurabilityConsumed", "shovelsConsumed", "coinsEarned", "recoveredMinesEarned"]) {
      result[key] += Number(run[key]) || 0;
    }
    mergeMap(result.equipmentUses, run.equipmentUses);
    mergeMap(result.purchases, run.purchases);
    return result;
  }, {
    revealCount: 0, flagPlacements: 0, flagRemovals: 0, chordUses: 0, mineHits: 0,
    shovelDurabilityConsumed: 0, shovelsConsumed: 0, coinsEarned: 0, recoveredMinesEarned: 0,
    equipmentUses: {}, purchases: {},
  });
  const abandoned = runs.filter((run) => run.outcome === "abandoned").length;
  return {
    runsRecorded: runs.length,
    averageBoardDurationMs: average(boardDurations),
    mineHitRate: runs.length ? totals.mineHits / runs.length : 0,
    abandonedBoardRate: runs.length ? abandoned / runs.length : 0,
    averageContractCompletionTimeMs: average(contractDurations),
    averageTimeBeforeFirstPurchaseMs: average(firstPurchases),
    ...totals,
    currentRunElapsedMs: telemetry.currentRun?.outcome === "in_progress"
      ? Math.max(0, now - telemetry.currentRun.startedAtEpochMs)
      : 0,
  };
}

function finalizeCurrentRun(telemetry, fallbackOutcome, now) {
  const run = telemetry.currentRun;
  if (run.outcome === "in_progress") {
    run.outcome = fallbackOutcome;
    run.endedAtEpochMs = now;
    run.durationMs = Math.max(0, now - run.startedAtEpochMs);
  }
  telemetry.completedRuns.push(cloneRun(run));
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

function cloneAction(action) {
  return JSON.parse(JSON.stringify(action));
}
