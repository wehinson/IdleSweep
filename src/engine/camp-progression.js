export const BOARD_CATEGORIES = Object.freeze({
  standard: "STANDARD",
  standardContract: "STANDARD_CONTRACT",
  campContract: "CAMP_CONTRACT",
  districtParcel: "DISTRICT_PARCEL",
  devTest: "DEV_TEST",
});

export const CAMP_PHASES = Object.freeze({
  lockedCountdown: "LOCKED_COUNTDOWN",
  discoveryActive: "CAMP_DISCOVERY_ACTIVE",
  contractAvailable: "CAMP_CONTRACT_AVAILABLE",
  attemptActive: "CAMP_ATTEMPT_ACTIVE",
  districtUnlocked: "DISTRICT_UNLOCKED",
});

const EDGES = Object.freeze(["top", "right", "bottom", "left"]);

export function createCampProgression(config) {
  return {
    phase: CAMP_PHASES.lockedCountdown,
    eligibleAttemptCount: 0,
    nextCampDiscoveryAt: config.firstEligibleAttempt,
    failureCount: 0,
    activeDiscoveryBoardId: null,
    campContractInstanceId: null,
  };
}

export function isCampEligibleBoard(category) {
  return category === BOARD_CATEGORIES.standard || category === BOARD_CATEGORIES.standardContract;
}

export function commitCampEligibleAttempt(progression, { boardId, category }) {
  if (!isCampEligibleBoard(category) || progression.phase === CAMP_PHASES.districtUnlocked) {
    return { progression, discoveryActivated: false };
  }
  const next = { ...progression, eligibleAttemptCount: progression.eligibleAttemptCount + 1 };
  const due = next.phase === CAMP_PHASES.lockedCountdown
    && next.eligibleAttemptCount >= next.nextCampDiscoveryAt;
  if (!due) return { progression: next, discoveryActivated: false };
  next.phase = CAMP_PHASES.discoveryActive;
  next.activeDiscoveryBoardId = boardId;
  return { progression: next, discoveryActivated: true };
}

export function resolveCampDiscovery(progression, { boardId, won, rng, config }) {
  if (progression.phase !== CAMP_PHASES.discoveryActive || progression.activeDiscoveryBoardId !== boardId) {
    return progression;
  }
  if (won) {
    return {
      ...progression,
      phase: CAMP_PHASES.contractAvailable,
      activeDiscoveryBoardId: null,
    };
  }
  return scheduleCampRetry({ ...progression, activeDiscoveryBoardId: null }, rng, config);
}

export function acceptCampContract(progression, contractInstanceId) {
  if (progression.phase !== CAMP_PHASES.contractAvailable) return progression;
  return { ...progression, phase: CAMP_PHASES.attemptActive, campContractInstanceId: contractInstanceId };
}

export function resolveCampAttempt(progression, { won, rng, config }) {
  if (progression.phase !== CAMP_PHASES.attemptActive) return progression;
  if (won) {
    return {
      ...progression,
      phase: CAMP_PHASES.districtUnlocked,
      campContractInstanceId: null,
      activeDiscoveryBoardId: null,
      nextCampDiscoveryAt: null,
    };
  }
  return scheduleCampRetry({ ...progression, campContractInstanceId: null }, rng, config);
}

export function scheduleCampRetry(progression, rng, config) {
  const distance = config.retryMinimum
    + Math.floor(rng() * (config.retryMaximum - config.retryMinimum + 1));
  return {
    ...progression,
    phase: CAMP_PHASES.lockedCountdown,
    failureCount: progression.failureCount + 1,
    nextCampDiscoveryAt: progression.eligibleAttemptCount + distance,
  };
}

export function debugScheduleCampDiscovery(progression, config) {
  if (progression.phase === CAMP_PHASES.districtUnlocked || progression.phase === CAMP_PHASES.attemptActive) return progression;
  return {
    ...progression,
    phase: CAMP_PHASES.lockedCountdown,
    activeDiscoveryBoardId: null,
    nextCampDiscoveryAt: progression.eligibleAttemptCount + config.debugDelay,
  };
}

export function createEntrance(settings, rng, options = {}) {
  const edges = options.edges || EDGES;
  const widths = options.widths || [2, 3];
  const edge = edges[Math.floor(rng() * edges.length)];
  const horizontal = edge === "top" || edge === "bottom";
  const limit = horizontal ? settings.cols : settings.rows;
  const validWidths = widths.filter((width) => width <= limit);
  const width = validWidths[Math.floor(rng() * validWidths.length)] || Math.max(1, limit);
  const avoidCorners = Boolean(options.avoidCorners) && limit > width + 1;
  const minimumStart = avoidCorners ? 1 : 0;
  const maximumStart = avoidCorners ? limit - width - 1 : limit - width;
  const start = minimumStart + Math.floor(rng() * (Math.max(minimumStart, maximumStart) - minimumStart + 1));
  const indexes = [];
  for (let offset = 0; offset < width; offset += 1) {
    const position = start + offset;
    const row = edge === "top" ? 0 : edge === "bottom" ? settings.rows - 1 : position;
    const col = edge === "left" ? 0 : edge === "right" ? settings.cols - 1 : position;
    indexes.push(row * settings.cols + col);
  }
  return { edge, width, start, indexes, revealMode: options.revealMode || "progressive" };
}

export function createCampEntrances(settings, rng, widths = [2, 3]) {
  return ["top", "left", "right"].map((edge) => createEntrance(settings, rng, {
    edges: [edge],
    widths,
    avoidCorners: true,
    revealMode: "visible",
  }));
}

export function protectedEntranceIndexes(entrances = []) {
  return new Set(entrances.flatMap((entrance) => entrance.indexes));
}

export function revealedEntranceSegments(entrance, board) {
  return entrance.indexes.map((index) => Boolean(board[index]?.open));
}
