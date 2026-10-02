import { BOARD_CATEGORIES } from "./camp-progression.js";

const SCORE_CATEGORIES = new Set([
  BOARD_CATEGORIES.standard,
  BOARD_CATEGORIES.standardContract,
  BOARD_CATEGORIES.campContract,
  BOARD_CATEGORIES.districtParcel,
]);

export function createProfile(options = {}) {
  return {
    hints: Math.max(0, options.hints || 0),
    specialEquipment: clone(options.specialEquipment || {}),
    equipmentPurchaseIds: [...(options.equipmentPurchaseIds || [])],
    curios: [...(options.curios || [])],
    blueprintLibrary: {
      ownedIds: [...(options.blueprintLibrary?.ownedIds || [])],
      reservedByBoardId: { ...(options.blueprintLibrary?.reservedByBoardId || {}) },
      pityMisses: Math.max(0, options.blueprintLibrary?.pityMisses || 0),
      discoveries: [...(options.blueprintLibrary?.discoveries || [])],
    },
    lifetimeStats: clone(options.lifetimeStats || {}),
    allTimeHighScore: options.allTimeHighScore ? clone(options.allTimeHighScore) : null,
    highScoreHistory: [...(options.highScoreHistory || [])].map(clone),
    boardArchive: [...(options.boardArchive || [])].map(clone),
    restructuringCount: Math.max(0, options.restructuringCount || 0),
  };
}

export function createRun(options = {}) {
  const ordinal = Math.max(1, options.ordinal || 1);
  const startedAt = options.startedAt || new Date().toISOString();
  return {
    id: options.id || `run-${ordinal}-${startedAt}`,
    ordinal,
    seed: String(options.seed || `run:${ordinal}:${startedAt}`),
    startedAt,
    currentHighScore: null,
    stats: {
      coinsEarned: 0,
      minesRecovered: 0,
      parcelsSecured: 0,
      blueprintsDiscovered: 0,
      curiosDiscovered: 0,
      equipmentAcquired: 0,
      workersHired: 0,
      ...(options.stats || {}),
    },
  };
}

export function createBoardSummary(session, options = {}) {
  return {
    id: session.id,
    runId: options.runId || null,
    runOrdinal: options.runOrdinal || null,
    category: session.developerTest ? BOARD_CATEGORIES.devTest : session.category,
    outcome: options.outcome || String(session.status || "ABANDONED"),
    rows: session.settings.rows,
    cols: session.settings.cols,
    initialMineCount: session.initialMineCount ?? null,
    treasureCount: options.treasureCount || 0,
    elapsedMs: Math.max(0, options.elapsedMs || 0),
    equipmentUsed: clone(options.equipmentUsed || {}),
    workerParticipation: Boolean(options.workerParticipation),
    completedAt: options.completedAt || new Date().toISOString(),
  };
}

export function evaluateHighScore(profile, run, summary) {
  if (!SCORE_CATEGORIES.has(summary.category) || summary.outcome !== "WON" || !Number.isFinite(summary.initialMineCount)) {
    return { profile, run, result: "ineligible" };
  }
  const score = summary.initialMineCount;
  const record = { ...clone(summary), score };
  const nextProfile = clone(profile);
  const nextRun = clone(run);
  if (!nextRun.currentHighScore || score > nextRun.currentHighScore.score) nextRun.currentHighScore = record;
  const allTime = nextProfile.allTimeHighScore;
  if (!allTime || score > allTime.score) {
    nextProfile.allTimeHighScore = record;
    nextProfile.highScoreHistory.push({ ...record, recordType: "improvement" });
    return { profile: nextProfile, run: nextRun, result: "improvement" };
  }
  if (score === allTime.score) {
    nextProfile.highScoreHistory.push({ ...record, recordType: "tie" });
    return { profile: nextProfile, run: nextRun, result: "tie" };
  }
  return { profile: nextProfile, run: nextRun, result: "below" };
}

export function restructureState({ profile, run, boardSessions, createRunState, now = () => new Date(), seed }) {
  const timestamp = now().toISOString();
  const archived = Object.values(boardSessions || {})
    .filter((session) => session.initialMineCount !== null && session.initialMineCount !== undefined)
    .filter((session) => !profile.boardArchive.some((summary) => summary.id === session.id))
    .map((session) => createBoardSummary(session, {
      runId: run.id,
      runOrdinal: run.ordinal,
      outcome: ["WON", "LOST"].includes(session.status) ? session.status : "ABANDONED",
      completedAt: timestamp,
    }));
  const nextProfile = clone(profile);
  nextProfile.boardArchive.push(...archived);
  nextProfile.blueprintLibrary.reservedByBoardId = {};
  nextProfile.restructuringCount += 1;
  const nextOrdinal = run.ordinal + 1;
  return {
    profile: nextProfile,
    run: createRunState({ ordinal: nextOrdinal, seed: seed || `run:${nextOrdinal}:${timestamp}`, startedAt: timestamp }),
    archived,
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
