import GAME_CONFIG from "./config.js";
import { createGame } from "./src/engine/game-engine.js";
import { createBoardCells, createBoardCellsFrom, getNeighbors, hasClearedBoard, updateBoardAdjacency } from "./src/engine/board.js";
import { availableFlagSatisfiedSafeProofs, availableProofs, refreshProofMetadata, scoreProofCascade } from "./src/engine/proofs.js";
import { performPurchase } from "./src/engine/purchaseables.js";
import {
  GAME_MODES,
  SPECIAL_EQUIPMENT,
  SPECIAL_EQUIPMENT_BY_ID,
  SPECIALISTS,
  STORE_PURCHASEABLE_BY_ID,
} from "./src/engine/catalogs.js";
import {
  clamp as clampValue,
  exponentialCost as calculateExponentialCost,
  formatCurrency as formatCurrencyValue,
  randomInteger as chooseRandomInteger,
} from "./src/engine/economy.js";
import {
  breakCurrentShovelState,
  calculateRoundPayout,
  consumeShovelState,
  evaluateChord,
  revealWaves as calculateRevealWaves,
  selectMineIndexes,
} from "./src/engine/round-engine.js";
import { advanceChallengeTimers, challengeMatchesClear as matchesChallengeClear } from "./src/engine/challenges.js";
import {
  contractDigRequirement as calculateContractDigRequirement,
  findContractType,
  listAvailableContracts,
  tickContractCooldowns as decreaseContractCooldowns,
} from "./src/engine/contracts.js";
import {
  createAutoMinerState,
  surveyorIntervalMs as calculateSurveyorIntervalMs,
  workerCost as calculateWorkerCost,
} from "./src/engine/auto-miners.js";
import {
  BOARD_CATEGORIES,
  CAMP_PHASES,
  acceptCampContract,
  commitCampEligibleAttempt,
  createCampEntrances,
  createCampProgression,
  createEntrance,
  debugScheduleCampDiscovery,
  protectedEntranceIndexes,
  resolveCampAttempt,
  resolveCampDiscovery,
} from "./src/engine/camp-progression.js";
import {
  BOARD_SESSION_STATUS,
  commitBoardSession,
  createBoardSession,
  releaseContractDigs,
  reserveContractDigs,
  resolveBoardSession,
  materializeBoardSession,
} from "./src/engine/board-sessions.js";
import {
  JOB_STATES,
  PARCEL_STATES,
  SURVEY_STATES,
  activeParcels,
  activateParcel,
  beginExcavation,
  caveInParcel,
  coordinateKey,
  createDistrict,
  parcelDisplayName,
  secureParcel,
  startClearance,
  startRecovery,
  startSurvey,
  tickDistrict,
} from "./src/engine/district.js";
import { createSeededRandom } from "./src/engine/seeded-random.js";
import {
  assignWorkers,
  availableWorkers,
  createWorkerState,
  hireWorker,
  nextWorkerHireCost,
  releaseWorkers,
  upgradeWorker,
  workerUpgradeCost,
  assignBlueprints,
} from "./src/engine/workers.js";
import {
  createStartingSpecialEquipment as createEquipmentInventory,
  createStartingSpecialists as createSpecialistLevels,
  createStartingStats as createEmptyStats,
} from "./src/engine/player.js";
import {
  createDeveloperTelemetry,
  hydrateDeveloperTelemetry,
  recordDeveloperAction,
  recordDeveloperEvent,
  resolveDeveloperRun,
  restartDeveloperRun,
  summarizeDeveloperTelemetry,
} from "./src/engine/developer-telemetry.js";
import {
  clearStoredSaves,
  loadStoredSave,
  loadSwapControlsPreference,
  readLegacyMessageBoard,
  storeSave,
  storeSwapControlsPreference,
} from "./src/persistence/storage.js";
import { decodeModeState, encodeModeState } from "./src/persistence/runtime-codec.js";
import { bindSaveControls } from "./src/ui/save-controls.js";
import { createCellInputController } from "./src/ui/board-input.js";
import { renderCurioLedger, renderStatsLedger } from "./src/ui/ledger-view.js";
import { calculateCrossCost } from "./src/engine/cross-costs.js";
import { BLUEPRINTS, discoverBlueprint, matchBlueprint, releaseBlueprintReservation, selectBlueprintPlacement } from "./src/engine/blueprints.js";
import { INTERACTION_MODES, deriveInterventionQueue, estimateSpeculativeTargets, speculationCost, mutateAutomation, reserveTarget, snoozeIntervention } from "./src/engine/automation.js";
import { createBoardSummary, createProfile, createRun, evaluateHighScore, restructureState } from "./src/engine/runs.js";
import { visibleGridRange, visibleIndexes } from "./src/ui/virtual-grid.js";
import { integerOptions, selectionAfterCapacityUpgrade } from "./src/engine/field-specifications.js";
import {
  countBoardFlags,
  countDeployedFlags,
  createFlagPool,
  refillFlagPool,
  repairMissingFlags,
  resolveFlagLoss,
  returnDeployedFlags,
  setManualFlagReserve,
  tickFlagRegeneration,
  tryDeployFlag,
  validateFlagPool,
  workerUsableFlags,
} from "./src/engine/flag-pool.js";

const BALANCE_CONFIG = GAME_CONFIG;
const GRID_LIMITS = GAME_CONFIG.gridLimits;
const PROGRESSION_CONFIG = GAME_CONFIG.progression;
const MESSAGE_CONFIG = GAME_CONFIG.messages;
const COPY_CONFIG = GAME_CONFIG.copy;
const CONTRACT_CONFIG = GAME_CONFIG.contracts;
const MESSAGE_BOARD_CONFIG = GAME_CONFIG.messageBoard;
const CHALLENGE_CONFIG = MESSAGE_BOARD_CONFIG.challenges;
const CAMP_CONFIG = GAME_CONFIG.campDiscovery;
const DISTRICT_CONFIG = GAME_CONFIG.district;
const FLAG_CONFIG = GAME_CONFIG.flags;
const WORKER_ROUND_MS = 10000;
const WORKER_SCAN_STEP_MS = 1000;
const WORKER_OPEN_SCAN_STEP_MS = WORKER_SCAN_STEP_MS / 2;
const WORKER_TIMER_TOLERANCE_MS = 25;
const DEFAULT_SETTINGS = {
  rows: GRID_LIMITS.min,
  cols: GRID_LIMITS.min,
  mines: 1,
  treasures: 1,
};

function formatMessage(key, values = {}) {
  const template = MESSAGE_CONFIG[key] || key;
  return template.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? "");
}

function formatCopy(template, values = {}) {
  return template.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? "");
}

const boardElement = document.querySelector("#board");
const mineCountElement = document.querySelector("#mine-count");
const moveCountElement = document.querySelector("#move-count");
const fieldValueElement = document.querySelector("#field-value");
const statusElement = document.querySelector("#status");
const resetButton = document.querySelector("#reset");
const rowsInput = document.querySelector("#rows-input");
const colsInput = document.querySelector("#cols-input");
const minesInput = document.querySelector("#mines-input");
const treasuresInput = document.querySelector("#treasures-input");
const settingsNote = document.querySelector("#settings-note");
const fieldSpecificationToggleButton = document.querySelector("#field-specification-toggle");
const fieldSpecificationMenuElement = document.querySelector("#field-specification-menu");
const swapControlsInput = document.querySelector("#swap-controls-input");
const coinCountElement = document.querySelector("#coin-count");
const shovelCountElement = document.querySelector("#shovel-count");
const shovelUsesElement = document.querySelector("#shovel-uses");
const shovelResourceElement = document.querySelector("#shovel-resource");
const flagStockElement = document.querySelector("#flag-stock");
const flagCapacityElement = document.querySelector("#flag-capacity");
const flagDeployedElement = document.querySelector("#flag-deployed");
const flagMissingElement = document.querySelector("#flag-missing");
const flagRegenerationElement = document.querySelector("#flag-regeneration");
const flagResourceElement = document.querySelector("#flag-resource");
const hintResourceElement = document.querySelector("#hint-resource");
const hintStockElement = document.querySelector("#hint-stock");
const hintCapacityElement = document.querySelector("#hint-capacity");
const mineResourceElement = document.querySelector("#mine-resource");
const activeMineCountElement = document.querySelector("#active-mine-count");
const mineResourceDetailElement = document.querySelector("#mine-resource-detail");
const buyShovelButton = document.querySelector("#buy-shovel");
const buyShovelDetailElement = document.querySelector("#buy-shovel-detail");
const buyShovelCostElement = document.querySelector("#buy-shovel-cost");
const buyFlagsButton = document.querySelector("#buy-flags");
const buyFlagsCostElement = document.querySelector("#buy-flags-cost");
const buyHintsButton = document.querySelector("#buy-hints");
const buyHintsCostElement = document.querySelector("#buy-hints-cost");
const useHintButton = document.querySelector("#use-hint");
const storeNoteElement = document.querySelector("#store-note");
const statsGridElement = document.querySelector("#stats-grid");
const fastestConfigsElement = document.querySelector("#fastest-configs");
const developerStatsGridElement = document.querySelector("#developer-stats-grid");
const developerStatsNoteElement = document.querySelector("#developer-stats-note");
const resetProgressButton = document.querySelector("#reset-progress");
const restructureProgressButton = document.querySelector("#restructure-progress");
const restructureModalElement = document.querySelector("#restructure-modal");
const restructureCancelButton = document.querySelector("#restructure-cancel");
const restructureConfirmButton = document.querySelector("#restructure-confirm");
const restructureRunSummaryElement = document.querySelector("#restructure-run-summary");
const restructureLostSummaryElement = document.querySelector("#restructure-lost-summary");
const restructureRetainedSummaryElement = document.querySelector("#restructure-retained-summary");
const allTimeHighScoreElement = document.querySelector("#all-time-high-score");
const runHighScoreElement = document.querySelector("#run-high-score");
const appVersionElement = document.querySelector("#app-version");
const curioChanceElement = document.querySelector("#curio-chance");
const curioGridElement = document.querySelector("#curio-grid");
const curioNoteElement = document.querySelector("#curio-note");
const contractCountdownElement = document.querySelector("#contract-countdown");
const challengeCountdownElement = document.querySelector("#challenge-countdown");
const surveyorCountdownElement = document.querySelector("#surveyor-countdown");
const messageBoardListElement = document.querySelector("#message-board-list");
const generateContractButton = document.querySelector("#generate-contract");
const generateChallengeButton = document.querySelector("#generate-challenge");
const surveyNowButton = document.querySelector("#survey-now");
const contractModalElement = document.querySelector("#contract-modal");
const contractModalLabelElement = document.querySelector("#contract-modal-label");
const contractModalTitleElement = document.querySelector("#contract-modal-title");
const contractModalDescriptionElement = document.querySelector("#contract-modal-description");
const contractModalFieldElement = document.querySelector("#contract-modal-field");
const contractModalMinesElement = document.querySelector("#contract-modal-mines");
const contractModalRewardElement = document.querySelector("#contract-modal-reward");
const contractModalDigsElement = document.querySelector("#contract-modal-digs");
const contractModalFlagsElement = document.querySelector("#contract-modal-flags");
const contractModalStartButton = document.querySelector("#contract-modal-start");
const fieldClearModalElement = document.querySelector("#field-clear-modal");
const fieldClearModalDescriptionElement = document.querySelector("#field-clear-modal-description");
const fieldClearModalDismissButton = document.querySelector("#field-clear-modal-dismiss");
const specialEquipmentStoreElement = document.querySelector("#special-equipment-store");
const specialEquipmentListElement = document.querySelector("#special-equipment-list");
const equipmentToggleButton = document.querySelector("#equipment-toggle");
const equipmentTotalElement = document.querySelector("#equipment-total");
const equipmentInventoryElement = document.querySelector("#equipment-inventory");
const equipmentInventoryListElement = document.querySelector("#equipment-inventory-list");
const districtButton = document.querySelector("#district-button");
const autoMinersButton = document.querySelector("#auto-miners-button");
const quartermasterPanelElement = document.querySelector("#quartermaster-panel");
const quartermasterTooltipElement = document.querySelector("#quartermaster-tooltip");
const specialistsPanelElement = document.querySelector("#specialists-panel");
const autoMineFieldElement = document.querySelector("#auto-mine-field");
const surveyorCardElement = document.querySelector("#surveyor-card");
const agentListElement = document.querySelector("#agent-list");
const specialistListElement = document.querySelector("#specialist-list");
const specialistNoteElement = document.querySelector("#specialist-note");
const workerTooltipElement = document.querySelector("#worker-tooltip");
const blueprintLibraryElement = document.querySelector("#blueprint-library");
const blueprintCountElement = document.querySelector("#blueprint-count");
const interventionFeedElement = document.querySelector("#intervention-feed");
const interventionCountElement = document.querySelector("#intervention-count");
const speculationEnabledElement = document.querySelector("#speculation-enabled");
const speculationThresholdElement = document.querySelector("#speculation-threshold");
const speculationThresholdValueElement = document.querySelector("#speculation-threshold-value");
const manualFlagReserveElement = document.querySelector("#manual-flag-reserve");
const manualFlagReserveValueElement = document.querySelector("#manual-flag-reserve-value");
const workerUsableFlagsElement = document.querySelector("#worker-usable-flags");
const boardInputController = createCellInputController({ swapped: loadSwapControlsPreference() });
swapControlsInput.checked = loadSwapControlsPreference();
swapControlsInput.addEventListener("change", () => {
  boardInputController.setSwapped(swapControlsInput.checked);
  storeSwapControlsPreference(swapControlsInput.checked);
});

const upgradeElements = {
  tallerGrid: document.querySelector("#taller-grid"),
  tallerGridTitle: document.querySelector("#taller-grid-title"),
  tallerGridDetail: document.querySelector("#taller-grid-detail"),
  tallerGridCost: document.querySelector("#taller-grid-cost"),
  widerGrid: document.querySelector("#wider-grid"),
  widerGridTitle: document.querySelector("#wider-grid-title"),
  widerGridDetail: document.querySelector("#wider-grid-detail"),
  widerGridCost: document.querySelector("#wider-grid-cost"),
  improveShovel: document.querySelector("#improve-shovel"),
  upgradeTitle: document.querySelector("#upgrade-title"),
  upgradeDetail: document.querySelector("#upgrade-detail"),
  upgradeCost: document.querySelector("#upgrade-cost"),
  addMine: document.querySelector("#add-mine"),
  addMineDetail: document.querySelector("#add-mine-detail"),
  addMineCost: document.querySelector("#add-mine-cost"),
  addTreasure: document.querySelector("#add-treasure"),
  addTreasureDetail: document.querySelector("#add-treasure-detail"),
  addTreasureCost: document.querySelector("#add-treasure-cost"),
  treasureValue: document.querySelector("#treasure-value"),
  treasureValueDetail: document.querySelector("#treasure-value-detail"),
  treasureValueCost: document.querySelector("#treasure-value-cost"),
  betterFlags: document.querySelector("#better-flags"),
  betterFlagsDetail: document.querySelector("#better-flags-detail"),
  betterFlagsCost: document.querySelector("#better-flags-cost"),
  mineYield: document.querySelector("#mine-yield"),
  mineYieldDetail: document.querySelector("#mine-yield-detail"),
  mineYieldCost: document.querySelector("#mine-yield-cost"),
  shovelCap: document.querySelector("#shovel-cap"),
  shovelCapDetail: document.querySelector("#shovel-cap-detail"),
  shovelCapCost: document.querySelector("#shovel-cap-cost"),
  flagCap: document.querySelector("#flag-cap"),
  shovelCapTitle: document.querySelector("#shovel-cap-title"),
  flagCapTitle: document.querySelector("#flag-cap-title"),
  flagCapDetail: document.querySelector("#flag-cap-detail"),
  flagCapCost: document.querySelector("#flag-cap-cost"),
};

const abilityElements = {
  safetyRadius: document.querySelector("#safety-radius"),
  safetyRadiusDetail: document.querySelector("#safety-radius-detail"),
  safetyRadiusCost: document.querySelector("#safety-radius-cost"),
  chording: document.querySelector("#chording"),
  chordingTitle: document.querySelector("#chording-title"),
  chordingDetail: document.querySelector("#chording-detail"),
  chordingCost: document.querySelector("#chording-cost"),
};

let board = [];
let settings = { ...DEFAULT_SETTINGS };
let gameOver = false;
let roundStarted = false;
let roundStartTime = 0;
let moves = 0;
let flagsPlaced = 0;
let minesPlaced = false;
let isRevealing = false;
let revealToken = 0;
// Multiple cascades can be in flight at once (one per click that started a
// reveal). A token is "active" as long as it's in this set; clearing the set
// cancels every in-flight cascade at once (game reset, mode switch, loss).
const activeRevealTokens = new Set();

function beginReveal() {
  const token = ++revealToken;
  activeRevealTokens.add(token);
  isRevealing = true;
  return token;
}

function endReveal(token) {
  activeRevealTokens.delete(token);
  isRevealing = activeRevealTokens.size > 0;
}
let recentlyRevealed = new Set();
let treasurePopups = new Map();
let boardButtons = [];
let renderedBoardRef = null;
let renderedGridKey = "";
let virtualScrollFrame = 0;
let pendingBoardFocusIndex = null;
let workerTooltipState = null;
let quartermasterTooltipSource = null;
const workerMarkerData = new WeakMap();
let emergencyHandoutNotice = false;
let emergencyHandoutStatus = "";
let roundTreasureValue = 0;
let roundTreasureCount = 0;
let roundFlagPlacements = 0;
let roundUsedChording = false;
let lastManualFlagRemovalAt = 0;
let roundResolved = false;
let selectedEquipmentId = null;
let activeEquipment = createRoundEquipmentState();
let revealedHints = [];
let lastChallengeTickTime = performance.now();
let player = createStartingPlayer();
let flagPool = createFlagPool(BALANCE_CONFIG.capacity.flags[0], {
  regenIntervalMs: FLAG_CONFIG.regenerationIntervalMs,
});
let profile = createProfile({
  hints: player.hints,
  specialEquipment: player.specialEquipment,
  curios: player.curios,
  lifetimeStats: player.stats,
});
let runMeta = createRun({ ordinal: GAME_CONFIG.runs.startingRunOrdinal });
let preferences = {
  lastBoardSelection: { ...DEFAULT_SETTINGS },
  speculationEnabled: false,
  riskThreshold: GAME_CONFIG.automation.defaultRiskThreshold,
  manualFlagReserve: 0,
};
let currentMode = GAME_MODES.board;
let currentBoardState = null;
let autoMinersState = createAutoMinerState(SPECIALISTS, performance.now());
let autoMineMenuOpen = false;
let boardSessions = {};
let currentBoardId = null;
let currentView = "board";
let campProgression = createCampProgression(CAMP_CONFIG);
let district = null;
let selectedParcelId = null;
let workerState = createWorkerState(SPECIALISTS, player.specialists);
let contractInstances = {};
let nextBoardOrdinal = 1;
let nextContractInstanceOrdinal = 1;
let lastDistrictTickTime = performance.now();
let schemaMigrationNotice = null;
let developerTelemetry = createDeveloperTelemetry();
const stateEngine = createGame({
  config: GAME_CONFIG,
  initialState: null,
  clock: () => performance.now(),
  rng: () => Math.random(),
  reducer: reduceRuntimeAction,
});
let saveReady = false;
let autosaveTimer = null;
appVersionElement.textContent = GAME_CONFIG.version;

function createStartingPlayer() {
  const durability = BALANCE_CONFIG.shovel.tiers[0].durability;

  return {
    coins: BALANCE_CONFIG.startingCoins,
    shovels: BALANCE_CONFIG.startingShovels,
    flags: BALANCE_CONFIG.startingFlags,
    hints: BALANCE_CONFIG.startingHints,
    mines: BALANCE_CONFIG.startingMines,
    shovelTier: 0,
    shovelUses: BALANCE_CONFIG.startingShovels * durability,
    shovelCapacityLevel: 0,
    flagCapacityLevel: 0,
    mineLevel: 0,
    treasureLevel: 0,
    treasureValueLevel: 0,
    betterFlagsLevel: 0,
    mineYieldLevel: 0,
    tallerGridLevel: 0,
    widerGridLevel: 0,
    safetyRadius: 0,
    chordingUnlocked: false,
    specialEquipmentUnlocked: false,
    specialEquipment: createStartingSpecialEquipment(),
    specialists: createStartingSpecialists(),
    emergencyShovelUsed: false,
    curioMisses: 0,
    curios: Array.from({ length: BALANCE_CONFIG.curio.itemCount }, () => 0),
    contracts: createStartingContracts(),
    messageBoard: createStartingMessageBoard(),
    stats: createStartingStats(),
  };
}

function createStartingSpecialists() {
  return createSpecialistLevels(SPECIALISTS);
}

function createStartingSpecialEquipment() {
  return createEquipmentInventory(SPECIAL_EQUIPMENT);
}

function createRoundEquipmentState() {
  return {
    bombBotUses: 0,
    mineEncapsulationUses: 0,
  };
}

function createModeState() {
  return {
    board: board.map((cell) => ({ ...cell })),
    settings: { ...settings },
    gameOver,
    roundStarted,
    roundStartTime,
    roundResolved,
    moves,
    flagsPlaced,
    minesPlaced,
    isRevealing: false,
    revealToken,
    recentlyRevealed: new Set(recentlyRevealed),
    treasurePopups: new Map(treasurePopups),
    roundTreasureValue,
    roundTreasureCount,
    roundFlagPlacements,
    roundUsedChording,
    selectedEquipmentId,
    activeEquipment: { ...activeEquipment },
    revealedHints: [...revealedHints],
    statusText: statusElement.textContent,
    resetText: resetButton.textContent,
    running: false,
    lastActionAt: 0,
  };
}

function loadModeState(state) {
  board = createBoardCellsFrom(state.board, state.settings);
  settings = normalizeFieldSettings(state.settings);
  gameOver = state.gameOver;
  roundStarted = state.roundStarted;
  roundStartTime = state.roundStartTime;
  roundResolved = state.roundResolved;
  moves = state.moves;
  flagsPlaced = state.flagsPlaced;
  minesPlaced = state.minesPlaced;
  isRevealing = false;
  activeRevealTokens.clear();
  revealToken = state.revealToken;
  recentlyRevealed = new Set(state.recentlyRevealed);
  treasurePopups = new Map(state.treasurePopups);
  roundTreasureValue = state.roundTreasureValue;
  roundTreasureCount = state.roundTreasureCount;
  roundFlagPlacements = state.roundFlagPlacements;
  roundUsedChording = state.roundUsedChording;
  selectedEquipmentId = state.selectedEquipmentId;
  activeEquipment = { ...state.activeEquipment };
  revealedHints = state.revealedHints || [];
  refreshProofMetadata(board, settings);
  statusElement.textContent = state.statusText;
  resetButton.textContent = state.resetText;
}

function saveCurrentModeState() {
  currentBoardState = createModeState();
  const session = currentBoardSession();
  if (session && currentView === "board") {
    session.modeState = currentBoardState;
    session.settings = { ...settings };
  }
}

function currentBoardSession() {
  return currentBoardId ? boardSessions[currentBoardId] || null : null;
}

function totalDeployedFlags() {
  return Object.values(boardSessions).reduce((total, session) => {
    if ([BOARD_SESSION_STATUS.won, BOARD_SESSION_STATUS.lost].includes(session.status)) return total;
    if (currentView === "board" && session.id === currentBoardId) return total + board.filter((cell) => cell.flagged).length;
    return total + countBoardFlags(session.modeState);
  }, 0);
}

function syncLegacyFlagStock() {
  player.flags = flagPool.availableFlags;
}

function deployCompanyFlag({ worker = false, cell = null } = {}) {
  const result = tryDeployFlag(flagPool, totalDeployedFlags(), { worker, cell });
  flagPool = result.pool;
  syncLegacyFlagStock();
  return result;
}

function returnCompanyFlags(count, deployedAfter = Math.max(0, totalDeployedFlags() - count)) {
  flagPool = returnDeployedFlags(flagPool, count, deployedAfter);
  syncLegacyFlagStock();
}

function clearCompanyFlag(cell) {
  if (!cell?.flagged) return false;
  const deployedBefore = totalDeployedFlags();
  cell.flagged = false;
  cell.flaggedByPlayer = false;
  cell.flaggedByWorker = false;
  flagsPlaced = Math.max(0, flagsPlaced - 1);
  returnCompanyFlags(1, Math.max(0, deployedBefore - 1));
  return true;
}

function reconcileResolvedBoardFlags(won) {
  const deployedBefore = totalDeployedFlags();
  const boardFlags = board.filter((cell) => cell.flagged);
  const deployedAfter = Math.max(0, deployedBefore - boardFlags.length);
  let result = { exposed: boardFlags.length, recovered: boardFlags.length, lost: 0 };
  if (won) {
    returnCompanyFlags(boardFlags.length, deployedAfter);
  } else {
    const resolution = resolveFlagLoss(
      flagPool,
      boardFlags.length,
      deployedAfter,
      Math.random,
      FLAG_CONFIG.failureRecoveryChance,
    );
    flagPool = resolution.pool;
    syncLegacyFlagStock();
    result = resolution;
  }
  boardFlags.forEach((cell) => {
    cell.flagged = false;
    cell.flaggedByPlayer = false;
    cell.flaggedByWorker = false;
  });
  flagsPlaced = 0;
  return result;
}

function markBoardMutation(boardId = currentBoardId) {
  const session = boardSessions[boardId];
  if (!session) return;
  session.automation = mutateAutomation(session.automation);
  Object.entries(autoMinersState?.workerTasks || {}).forEach(([workerId, task]) => {
    if (task.boardId === boardId && task.phase !== "scanning") delete autoMinersState.workerTasks[workerId];
  });
}

function setBoardStalled(boardId, reason = "no-proof") {
  const automation = boardSessions[boardId]?.automation;
  if (!automation || automation.stalled) return;
  automation.stalled = true;
  automation.stallStartedAt = Date.now();
  automation.stallReason = reason;
}

function refreshBoardFindings(session = currentBoardSession()) {
  if (!session?.automation || !session.modeState) return;
  const mode = session.automation.interactionMode;
  if (![INTERACTION_MODES.analyze, INTERACTION_MODES.assist].includes(mode)) return;
  const stateBoard = session.id === currentBoardId ? board : session.modeState.board;
  const stateSettings = session.id === currentBoardId ? settings : session.settings;
  const basic = [
    ...availableFlagSatisfiedSafeProofs(stateBoard, stateSettings).map((proof) => ({ ...proof, conclusionType: "safe", blueprintId: null })),
    ...availableProofs(stateBoard, stateSettings)
      .filter((proof) => ["provenMine", "completeTheCountMine"].includes(proof.type))
      .map((proof) => ({ ...proof, conclusionType: "mine", blueprintId: null })),
  ];
  const advanced = (session.automation.findings || []).filter((finding) => finding.blueprintId && finding.revision === session.automation.mutationRevision);
  session.automation.findings = [...advanced, ...basic.map((finding, index) => ({
    id: `basic:${session.automation.mutationRevision}:${index}`,
    revision: session.automation.mutationRevision,
    evidenceIndexes: [finding.clueIndex].filter(Number.isInteger),
    targetIndexes: [...finding.targetIndexes],
    conclusionType: finding.conclusionType,
    blueprintId: null,
    orientation: null,
  }))];
}

function createSessionForCurrentBoard({ category = BOARD_CATEGORIES.standard, owner = { type: "main", id: "main" }, seed, contractInstanceId = null, parcelId = null, entrances = [] } = {}) {
  const id = currentBoardId || `board-${nextBoardOrdinal}`;
  const session = createBoardSession({
    id,
    ordinal: nextBoardOrdinal++,
    category,
    owner,
    seed: seed || `${Date.now()}:${id}`,
    settings,
    modeState: createModeState(),
    contractInstanceId,
    parcelId,
    entrances,
  });
  boardSessions[id] = session;
  currentBoardId = id;
  currentBoardState = session.modeState;
  return session;
}

function switchToBoardSession(boardId) {
  const target = boardSessions[boardId];
  if (!target?.modeState) return false;
  if (currentView === "board" && currentBoardSession()) saveCurrentModeState();
  currentBoardId = boardId;
  currentView = "board";
  currentMode = GAME_MODES.board;
  fieldSpecificationMenuElement.hidden = true;
  fieldSpecificationToggleButton.setAttribute("aria-expanded", "false");
  loadModeState(target.modeState);
  syncLegacyActiveContract();
  scrollToSelectedFinding(target);
  render();
  return true;
}

function scrollToSelectedFinding(session) {
  const index = session.automation?.findings?.[0]?.targetIndexes?.[0];
  if (!Number.isInteger(index)) {
    boardElement.scrollTop = 0;
    boardElement.scrollLeft = 0;
    return;
  }
  const cellSize = GAME_CONFIG.automation.viewport.cellSize;
  const row = Math.floor(index / session.settings.cols);
  const col = index % session.settings.cols;
  boardElement.scrollTop = Math.max(0, row * cellSize - boardElement.clientHeight / 2);
  boardElement.scrollLeft = Math.max(0, col * cellSize - boardElement.clientWidth / 2);
  pendingBoardFocusIndex = index;
}

function primaryBoardSession() {
  return Object.values(boardSessions)
    .filter((session) => session.owner?.type === "main" && ![BOARD_SESSION_STATUS.won, BOARD_SESSION_STATUS.lost].includes(session.status))
    .sort((left, right) => right.createdOrdinal - left.createdOrdinal)[0] || null;
}

function returnToHomeBoard() {
  const target = primaryBoardSession() || Object.values(boardSessions).find((session) => session.modeState);
  if (target) {
    switchToBoardSession(target.id);
    return;
  }
  saveCurrentModeState();
  settings = preferredFieldSettings();
  currentBoardId = `board-${nextBoardOrdinal}`;
  startGame();
}

function handleRoundControl() {
  if (currentView === "district") {
    returnToHomeBoard();
    return;
  }
  const session = currentBoardSession();
  if (!roundStarted && !gameOver && session?.owner?.type === "contract") {
    returnToHomeBoard();
    return;
  }
  if (!roundStarted && !gameOver && session?.owner?.type !== "main") {
    saveCurrentModeState();
    openDistrictMap();
    return;
  }
  if (roundStarted && !gameOver) {
    statusElement.textContent = "This board is committed. Finish it or switch to another worksite.";
    render();
    return;
  }
  if (gameOver && session?.owner?.type === "contract") {
    returnToHomeBoard();
    return;
  }
  if (gameOver && session?.owner?.type !== "main") {
    openDistrictMap();
    return;
  }
  if (gameOver && session?.owner?.type === "main") {
    saveCurrentModeState();
    settings = preferredFieldSettings();
    currentBoardId = `board-${nextBoardOrdinal}`;
    startGame();
    return;
  }
  startGame();
}

function syncLegacyActiveContract() {
  const instance = activeContractInstance();
  player.contracts.active = instance
    ? { id: instance.typeId, instanceId: instance.id, previousSettings: { ...DEFAULT_SETTINGS }, briefingOpen: false }
    : null;
}

function activeContractInstance() {
  const session = currentBoardSession();
  return session?.contractInstanceId ? contractInstances[session.contractInstanceId] || null : null;
}

function acceptedContractInstances() {
  return Object.values(contractInstances).filter((instance) => instance.status === "ACCEPTED");
}

function createBlankSession(settingsForBoard, metadata) {
  if (currentView === "board" && currentBoardSession()) saveCurrentModeState();
  const previousBoardId = currentBoardId;
  const previousView = currentView;
  currentBoardId = null;
  fieldSpecificationMenuElement.hidden = true;
  fieldSpecificationToggleButton.setAttribute("aria-expanded", "false");
  settings = { ...settingsForBoard };
  startGame({ preserveSettings: true, preserveSession: true });
  const id = `board-${nextBoardOrdinal}`;
  currentBoardId = id;
  const session = createSessionForCurrentBoard({ ...metadata, seed: metadata.seed || `${Date.now()}:${id}` });
  currentView = "board";
  currentMode = GAME_MODES.board;
  if (!session) {
    currentBoardId = previousBoardId;
    currentView = previousView;
  }
  return session;
}

function captureGameState() {
  const now = performance.now();
  saveCurrentModeState();
  profile = createProfile({
    ...profile,
    hints: player.hints,
    specialEquipment: player.specialEquipment,
    curios: player.curios,
    lifetimeStats: player.stats,
  });
  preferences = {
    ...preferences,
    speculationEnabled: Boolean(autoMinersState?.speculationEnabled),
    riskThreshold: autoMinersState?.riskThreshold ?? GAME_CONFIG.automation.defaultRiskThreshold,
    manualFlagReserve: flagPool.manualFlagReserve,
  };
  syncLegacyFlagStock();
  const savedPlayer = JSON.parse(JSON.stringify(player));
  delete savedPlayer.messageBoard;
  const savedAutoMiners = autoMinersState
    ? {
        ...JSON.parse(JSON.stringify(autoMinersState)),
        workerTasks: encodeWorkerTasks(autoMinersState.workerTasks, now),
        surveyElapsedMs: Math.max(0, now - autoMinersState.lastSurveyAt),
        workerElapsedMs: autoMinersState.lastWorkerTickAt > 0
          ? Math.max(0, now - autoMinersState.lastWorkerTickAt)
          : 1000,
        notice: { code: "literal", args: { text: autoMinersState.statusText || "" } },
      }
    : null;
  if (savedAutoMiners) {
    delete savedAutoMiners.queue;
    delete savedAutoMiners.workerFields;
    delete savedAutoMiners.lastSurveyAt;
    delete savedAutoMiners.lastWorkerTickAt;
    delete savedAutoMiners.statusText;
  }

  const savedBoardSessions = Object.fromEntries(Object.entries(boardSessions).map(([id, session]) => [id, {
    ...JSON.parse(JSON.stringify({ ...session, modeState: null })),
    modeState: session.modeState ? encodeModeState(session.modeState, now) : null,
  }]));

  return {
    profile,
    runMeta,
    preferences,
    player: savedPlayer,
    flagPool: JSON.parse(JSON.stringify(flagPool)),
    settings: { ...settings },
    currentMode: currentView === "district" ? GAME_MODES.district : GAME_MODES.board,
    currentView,
    currentBoardId,
    boardSessions: savedBoardSessions,
    campProgression: JSON.parse(JSON.stringify(campProgression)),
    district: district ? JSON.parse(JSON.stringify(district)) : null,
    workerState: JSON.parse(JSON.stringify(workerState)),
    contractInstances: JSON.parse(JSON.stringify(contractInstances)),
    nextBoardOrdinal,
    nextContractInstanceOrdinal,
    schemaMigrationNotice,
    fieldQueue: null,
    autoMiners: savedAutoMiners,
    messageBoard: JSON.parse(JSON.stringify(player.messageBoard)),
    timers: {
      challengeTickElapsedMs: Math.max(0, now - lastChallengeTickTime),
    },
    developerTelemetry: JSON.parse(JSON.stringify(developerTelemetry)),
  };
}

function replaceGameState(savedState) {
  const now = performance.now();
  const defaults = createStartingPlayer();
  player = {
    ...defaults,
    ...savedState.player,
    specialEquipment: { ...defaults.specialEquipment, ...savedState.player.specialEquipment },
    specialists: { ...defaults.specialists, ...savedState.player.specialists },
    contracts: { ...defaults.contracts, ...savedState.player.contracts },
    stats: { ...defaults.stats, ...savedState.player.stats },
    messageBoard: JSON.parse(JSON.stringify(savedState.messageBoard)),
  };
  profile = savedState.profile || createProfile({
    hints: player.hints,
    specialEquipment: player.specialEquipment,
    curios: player.curios,
    lifetimeStats: player.stats,
  });
  runMeta = savedState.runMeta || createRun({ ordinal: 1 });
  preferences = savedState.preferences || {
    lastBoardSelection: savedState.settings,
    speculationEnabled: false,
    riskThreshold: GAME_CONFIG.automation.defaultRiskThreshold,
    manualFlagReserve: 0,
  };
  settings = normalizeFieldSettings(savedState.settings);
  preferences.lastBoardSelection = normalizeFieldSettings(preferences.lastBoardSelection || settings);
  developerTelemetry = hydrateDeveloperTelemetry(savedState.developerTelemetry);
  currentView = savedState.currentView || (savedState.currentMode === GAME_MODES.district ? "district" : "board");
  currentMode = currentView === "district" ? GAME_MODES.district : GAME_MODES.board;
  boardSessions = Object.fromEntries(Object.entries(savedState.boardSessions || {}).map(([id, session]) => [id, {
    ...session,
    modeState: session.modeState ? decodeModeState(session.modeState, now) : null,
  }]));
  flagPool = validateFlagPool({
    ...(savedState.flagPool || createFlagPool(flagCapacity(), {
      availableFlags: savedState.player.flags,
      manualFlagReserve: preferences.manualFlagReserve,
      regenIntervalMs: FLAG_CONFIG.regenerationIntervalMs,
    })),
    maximumFlags: flagCapacity(),
  }, countDeployedFlags(boardSessions));
  preferences.manualFlagReserve = flagPool.manualFlagReserve;
  syncLegacyFlagStock();
  currentBoardId = savedState.currentBoardId || Object.keys(boardSessions)[0] || null;
  currentBoardState = currentBoardId && boardSessions[currentBoardId]?.modeState
    ? boardSessions[currentBoardId].modeState
    : decodeModeState(savedState.fieldQueue, now);
  campProgression = savedState.campProgression || createCampProgression(CAMP_CONFIG);
  district = savedState.district || null;
  workerState = savedState.workerState || createWorkerState(SPECIALISTS, savedState.player.specialists || {});
  contractInstances = savedState.contractInstances || {};
  nextBoardOrdinal = savedState.nextBoardOrdinal || Math.max(1, Object.keys(boardSessions).length + 1);
  nextContractInstanceOrdinal = savedState.nextContractInstanceOrdinal || Math.max(1, Object.keys(contractInstances).length + 1);
  schemaMigrationNotice = savedState.schemaMigrationNotice || null;
  autoMinersState = savedState.autoMiners
    ? {
        ...savedState.autoMiners,
        workerTasks: decodeWorkerTasks(savedState.autoMiners.workerTasks, now),
        workerTargets: savedState.autoMiners.workerTargets || {},
        lastSurveyAt: now - savedState.autoMiners.surveyElapsedMs,
        lastWorkerTickAt: now - savedState.autoMiners.workerElapsedMs,
        statusText: savedState.autoMiners.notice?.args?.text || "",
        speculationEnabled: preferences.speculationEnabled,
        speculationInitialized: savedState.autoMiners.speculationInitialized ?? Boolean(preferences.speculationEnabled),
        riskThreshold: preferences.riskThreshold,
      }
    : createAutoMinerState(SPECIALISTS, now);
  if (autoMinersState) {
    delete autoMinersState.queue;
    delete autoMinersState.workerFields;
    delete autoMinersState.surveyElapsedMs;
    delete autoMinersState.workerElapsedMs;
    delete autoMinersState.notice;
  }

  isRevealing = false;
  activeRevealTokens.clear();
  boardInputController.cancel();
  lastChallengeTickTime = now;
  contractModalElement.hidden = true;
  fieldClearModalElement.hidden = true;
  equipmentInventoryElement.hidden = true;
  fieldSpecificationMenuElement.hidden = true;
  fieldSpecificationToggleButton.setAttribute("aria-expanded", "false");
  document.body.classList.remove("is-auto-miners");

  if (currentBoardState) {
    loadModeState(currentBoardState);
    syncLegacyActiveContract();
    if (!developerTelemetry.currentAttempt) {
      restartDeveloperRun(developerTelemetry, {
        ...settings,
        contractId: activeContractType()?.id || null,
        availableFlags: flagPool.availableFlags,
        deployedFlags: totalDeployedFlags(),
        missingFlags: flagPool.missingFlags,
      });
    }
  } else {
    startGame();
    return;
  }
  if (schemaMigrationNotice) {
    statusElement.textContent = schemaMigrationNotice;
    schemaMigrationNotice = null;
  }
  render();
  scheduleAutosave();
}

function scheduleAutosave() {
  if (!saveReady) return;
  window.clearTimeout(autosaveTimer);
  autosaveTimer = window.setTimeout(saveNow, 350);
}

function saveNow() {
  if (!saveReady) return;
  try {
    const snapshot = captureGameState();
    stateEngine.dispatch({ type: "replaceState", state: snapshot });
    storeSave(snapshot);
    const saveStatus = document.querySelector("#save-status");
    if (saveStatus) saveStatus.textContent = "Saved in this browser.";
  } catch (error) {
    const saveStatus = document.querySelector("#save-status");
    if (saveStatus) saveStatus.textContent = `Autosave unavailable: ${error.message}`;
  }
}

function showSaveNotice(message) {
  const saveStatus = document.querySelector("#save-status");
  if (saveStatus) saveStatus.textContent = message;
}

function dispatchGameAction(type, payload = {}) {
  const result = stateEngine.dispatch({ type, payload });
  scheduleAutosave();
  return result;
}

function createStartingContracts() {
  return {
    boardsUntilNext: CONTRACT_CONFIG.firstAfterBoards,
    offeredIds: [],
    active: null,
    returnSettings: null,
    unlockedTypeCount: 1,
    completedByType: Array.from({ length: CONTRACT_CONFIG.types.length }, () => 0),
    cooldowns: Array.from({ length: CONTRACT_CONFIG.types.length }, () => 0),
  };
}

function createStartingMessageBoard() {
  const startingBoard = {
    challenges: [],
    nextChallengeId: 1,
    nextChallengeInMs: randomChallengeDelayMs(),
  };

  return loadSavedMessageBoard(startingBoard);
}

function loadSavedMessageBoard(fallback) {
  try {
    const saved = readLegacyMessageBoard();
    if (!saved || !Array.isArray(saved.challenges)) return fallback;

    const challenges = saved.challenges
      .filter((challenge) => challenge && typeof challenge.id === "string" && Number.isFinite(challenge.expiresInMs) && (challenge.claimable || challenge.expiresInMs > 0))
      .slice(0, CHALLENGE_CONFIG.maxActive);
    const nextChallengeId = Number.isInteger(saved.nextChallengeId) && saved.nextChallengeId > 0
      ? saved.nextChallengeId
      : fallback.nextChallengeId;
    const nextChallengeInMs = Number.isFinite(saved.nextChallengeInMs) && saved.nextChallengeInMs > 0
      ? saved.nextChallengeInMs
      : fallback.nextChallengeInMs;

    return { challenges, nextChallengeId, nextChallengeInMs };
  } catch {
    return fallback;
  }
}

function saveMessageBoard() {
  scheduleAutosave();
}

function createStartingStats() {
  return createEmptyStats();
}

function createBoard() {
  return createBoardCells(settings);
}

function placeMines(safeIndex) {
  const safeIndexes = safetyIndexesFor(safeIndex);
  protectedEntranceIndexes(currentBoardSession()?.entrances || []).forEach((index) => safeIndexes.add(index));
  const availableIndexes = board
    .filter((cell) => !safeIndexes.has(cell.index) && !cell.flagged)
    .map((cell) => cell.index);
  const mineTarget = Math.min(settings.mines, availableIndexes.length);
  let session = currentBoardSession();
  const rng = createSeededRandom(`${session?.seed || Date.now()}:materialize:${safeIndex}`);
  selectMineIndexes(availableIndexes, mineTarget, rng).forEach((index) => {
    board[index].mine = true;
  });

  minesPlaced = true;
  if (session) {
    session = materializeBoardSession(session, mineTarget);
    boardSessions[session.id] = session;
  }
  placeTreasures(mineTarget, rng);
  placeCurios(rng);
  placeBlueprint(rng);
  updateAdjacency();
  refreshProofMetadata(board, settings);
  markBoardMutation();
}

function placeTreasures(_mineTarget, rng = Math.random) {
  const treasureCandidates = board
    .filter((cell) => !cell.mine)
    .map((cell) => cell.index);
  const treasureIndexes = new Set();
  const contractType = activeContractType();
  const session = currentBoardSession();
  const parcel = session?.parcelId ? district?.parcelsById?.[session.parcelId] : null;
  const requestedTreasureCount = parcel?.truth?.treasureCount
    ?? (session?.category === BOARD_CATEGORIES.campContract
      ? CAMP_CONFIG.contract.treasureCount
      : (settings.treasures ?? maxUnlockedTreasureCount()) + (contractType?.bonusTreasures || 0));
  const treasureTarget = Math.min(requestedTreasureCount, treasureCandidates.length);
  const range = treasureValueRange();

  chooseTreasureIndexes(treasureCandidates, treasureTarget, contractType, rng).forEach((index) => {
    treasureIndexes.add(index);
  });

  treasureIndexes.forEach((index) => {
    board[index].treasure = true;
    board[index].treasureValue = range.minimum + Math.floor(rng() * (range.maximum - range.minimum + 1));
  });
}

function chooseTreasureIndexes(candidates, target, contractType, rng = Math.random) {
  if (!contractType?.nearMineTreasureWeight) {
    const selected = new Set();
    while (selected.size < target) {
      const randomIndex = Math.floor(rng() * candidates.length);
      selected.add(candidates[randomIndex]);
    }
    return [...selected];
  }

  const pool = candidates.map((index) => {
    const cell = board[index];
    const nearMine = neighbors(cell).some((neighbor) => neighbor.mine);
    return {
      index,
      weight: nearMine ? contractType.nearMineTreasureWeight : 1,
    };
  });
  const selected = [];

  while (selected.length < target && pool.length > 0) {
    const totalWeight = pool.reduce((total, item) => total + item.weight, 0);
    let roll = rng() * totalWeight;
    const chosenIndex = pool.findIndex((item) => {
      roll -= item.weight;
      return roll <= 0;
    });
    const [chosen] = pool.splice(Math.max(0, chosenIndex), 1);
    selected.push(chosen.index);
  }

  return selected;
}

function placeCurios(rng) {
  const session = currentBoardSession();
  const parcel = session?.parcelId ? district?.parcelsById?.[session.parcelId] : null;
  const rolledCurio = parcel ? null : rng() < curioChance();
  const requested = parcel ? parcel.truth.curioCount : rolledCurio ? 1 : 0;
  if (!parcel && !rolledCurio) player.curioMisses += 1;
  const candidates = board.filter((cell) => !cell.mine && !cell.treasure);
  for (let count = 0; count < requested && candidates.length > 0; count += 1) {
    const [cell] = candidates.splice(Math.floor(rng() * candidates.length), 1);
    cell.curio = true;
    cell.curioItem = 1 + Math.floor(rng() * BALANCE_CONFIG.curio.itemCount);
    cell.curioCollected = false;
  }
}

function placeBlueprint(rng) {
  const session = currentBoardSession();
  if (!session || session.category !== BOARD_CATEGORIES.districtParcel) return;
  const placement = selectBlueprintPlacement({
    library: profile.blueprintLibrary,
    boardId: session.id,
    rng,
    config: GAME_CONFIG.blueprints,
    eligible: true,
  });
  profile.blueprintLibrary = placement.library;
  if (!placement.blueprintId) return;
  const candidates = board.filter((cell) => !cell.mine && !cell.treasure && !cell.curio && !cell.blueprintId);
  if (!candidates.length) {
    profile.blueprintLibrary = releaseBlueprintReservation(profile.blueprintLibrary, session.id);
    return;
  }
  const cell = candidates[Math.floor(rng() * candidates.length)];
  cell.blueprintId = placement.blueprintId;
  cell.blueprintCollected = false;
}

function safetyIndexesFor(index) {
  const clickedCell = board[index];
  const radius = currentSafetyRadius();
  const safeIndexes = new Set([index]);

  board.forEach((cell) => {
    const rowDistance = Math.abs(cell.row - clickedCell.row);
    const colDistance = Math.abs(cell.col - clickedCell.col);

    if (rowDistance <= radius && colDistance <= radius) {
      safeIndexes.add(cell.index);
    }
  });

  return safeIndexes;
}

function maxSafetyAreaSize(radius = player.safetyRadius) {
  let largestArea = 1;

  for (let row = 0; row < settings.rows; row += 1) {
    for (let col = 0; col < settings.cols; col += 1) {
      const rowSpan = Math.min(settings.rows - 1, row + radius) - Math.max(0, row - radius) + 1;
      const colSpan = Math.min(settings.cols - 1, col + radius) - Math.max(0, col - radius) + 1;
      largestArea = Math.max(largestArea, rowSpan * colSpan);
    }
  }

  return largestArea;
}

function maxMineCount(radius = currentSafetyRadius()) {
  return Math.max(0, settings.rows * settings.cols - maxSafetyAreaSize(radius));
}

function currentSafetyRadius() {
  return safetyRadiusForSettings(settings);
}

function safetyRadiusForSettings(fieldSettings) {
  if (fieldSettings.rows <= GRID_LIMITS.min && fieldSettings.cols <= GRID_LIMITS.min) return 0;
  const surveyorLevel = workerState?.workerTypes?.surveyor?.level || 0;
  let surveyorRadius = 0;
  if (campProgression.phase !== CAMP_PHASES.districtUnlocked && surveyorLevel > 0) {
    if (surveyorLevel >= 20) surveyorRadius = 2;
    else if (surveyorLevel >= 10) surveyorRadius = 1;
  }
  return Math.max(player.safetyRadius, surveyorRadius);
}

function safetySizeLabel(level) {
  return level >= 2 ? "5x5" : level === 1 ? "3x3" : "1x1";
}

function maxUnlockedMineCount() {
  return 1 + player.mineLevel;
}

function maxUnlockedTreasureCount() {
  return 1 + player.treasureLevel;
}

function normalizeFieldSettings(value = {}, fallbackTreasures = maxUnlockedTreasureCount()) {
  return {
    ...value,
    rows: Number.isInteger(value.rows) ? value.rows : GRID_LIMITS.min,
    cols: Number.isInteger(value.cols) ? value.cols : GRID_LIMITS.min,
    mines: Number.isInteger(value.mines) ? value.mines : 1,
    treasures: Number.isInteger(value.treasures) ? value.treasures : fallbackTreasures,
  };
}

function preferredFieldSettings() {
  return normalizeFieldSettings(preferences.lastBoardSelection || DEFAULT_SETTINGS);
}

function maxTreasureCountFor(fieldSettings, treasureLevel = player.treasureLevel) {
  const safeTileCount = Math.max(1, fieldSettings.rows * fieldSettings.cols - fieldSettings.mines);
  return Math.min(1 + treasureLevel, safeTileCount);
}

function availableRows() {
  if (isFixedBoardSession()) return [settings.rows];
  return Array.from({ length: Math.max(1, player.tallerGridLevel + 1) }, (_, index) => GRID_LIMITS.min + index);
}

function availableCols() {
  if (isFixedBoardSession()) return [settings.cols];
  return Array.from({ length: Math.max(1, player.widerGridLevel + 1) }, (_, index) => GRID_LIMITS.min + index);
}

function availableMines() {
  if (isFixedBoardSession()) return [settings.mines];
  const maximum = Math.min(maxMineCount(), maxUnlockedMineCount());
  return maximum >= 1 ? Array.from({ length: maximum }, (_, index) => index + 1) : [];
}

function availableTreasures() {
  if (isFixedBoardSession()) return [settings.treasures ?? maxUnlockedTreasureCount()];
  return integerOptions(1, maxTreasureCountFor(settings));
}

function updateAdjacency(cells = board) {
  updateBoardAdjacency(cells, settings);
  refreshProofMetadata(cells, settings);
}

function neighbors(cell, cells = board) {
  return getNeighbors(cell, cells, settings);
}

function startGame({ preserveSettings = false, preserveSession = false } = {}) {
  if (!isContractActive() && player.contracts.returnSettings) {
    settings = player.contracts.returnSettings;
    player.contracts.returnSettings = null;
  }
  if (!isContractActive() && !preserveSettings) {
    settings.rows = clamp(settings.rows, GRID_LIMITS.min, GRID_LIMITS.min + player.tallerGridLevel);
    settings.cols = clamp(settings.cols, GRID_LIMITS.min, GRID_LIMITS.min + player.widerGridLevel);
    const legalMaximumMines = Math.min(maxMineCount(), maxUnlockedMineCount());
    if (legalMaximumMines >= 1) settings.mines = clamp(settings.mines, 1, legalMaximumMines);
    settings.treasures = clamp(settings.treasures ?? maxUnlockedTreasureCount(), 1, maxTreasureCountFor(settings));
  }
  syncSettingsControls();
  board = createBoard();
  restartDeveloperRun(developerTelemetry, {
    ...settings,
    contractId: activeContractType()?.id || null,
    availableFlags: flagPool.availableFlags,
    deployedFlags: totalDeployedFlags(),
    missingFlags: flagPool.missingFlags,
  });
  gameOver = false;
  roundStarted = false;
  roundStartTime = 0;
  roundResolved = false;
  moves = 0;
  flagsPlaced = 0;
  minesPlaced = false;
  isRevealing = false;
  activeRevealTokens.clear();
  recentlyRevealed.clear();
  treasurePopups.clear();
  emergencyHandoutNotice = false;
  emergencyHandoutStatus = "";
  roundTreasureValue = 0;
  roundTreasureCount = 0;
  roundFlagPlacements = 0;
  roundUsedChording = false;
  revealedHints = [];
  selectedEquipmentId = null;
  activeEquipment = createRoundEquipmentState();
  equipmentInventoryElement.hidden = true;
  equipmentToggleButton.setAttribute("aria-expanded", "false");
  boardInputController.cancel();
  resetButton.textContent = "READY";
  statusElement.textContent = player.shovelUses > 0
    ? formatMessage("idle")
    : formatMessage("idleNoShovels");
  if (!preserveSession) {
    if (!currentBoardId || !boardSessions[currentBoardId]) {
      currentBoardId = `board-${nextBoardOrdinal}`;
      createSessionForCurrentBoard();
    } else {
      const session = currentBoardSession();
      session.modeState = createModeState();
      session.settings = { ...settings };
      session.status = BOARD_SESSION_STATUS.preview;
      session.entrances = [];
      session.campDiscovery = false;
    }
    currentView = "board";
    currentMode = GAME_MODES.board;
  }
  render();
}

function openDistrictMap() {
  if (currentView === "board" && currentBoardSession()) saveCurrentModeState();
  currentView = "district";
  currentMode = GAME_MODES.district;
  fieldSpecificationMenuElement.hidden = true;
  fieldSpecificationToggleButton.setAttribute("aria-expanded", "false");
  selectedParcelId ||= district ? "camp-parcel" : null;
  resetButton.textContent = "BACK";
  render();
}

function renderDistrictMap() {
  boardElement.className = "district-view";
  boardElement.removeAttribute("style");
  boardElement.setAttribute("role", "region");
  useHintButton.disabled = true;
  equipmentToggleButton.disabled = true;
  resetButton.disabled = false;
  mineCountElement.textContent = "--";
  moveCountElement.textContent = "--";
  fieldValueElement.textContent = "";
  resetButton.textContent = "BACK";
  districtButton.classList.add("is-active");

  if (campProgression.phase !== CAMP_PHASES.districtUnlocked || !district) {
    const remaining = Math.max(0, (campProgression.nextCampDiscoveryAt || 0) - campProgression.eligibleAttemptCount);
    statusElement.textContent = "Discover and secure the Camp Parcel to unlock Districts.";
    boardElement.innerHTML = `
      <section class="district-locked">
        <span class="district-map__eyebrow">District access locked</span>
        <h2>Discover a Camp Parcel</h2>
        <p>Continue clearing standard and Contract boards. The next route opportunity is ${remaining || "ready on the next eligible board"}${remaining ? ` board${remaining === 1 ? "" : "s"} away` : ""}.</p>
      </section>
    `;
    return;
  }

  const viewport = district.viewport;
  const cells = [];
  for (let y = viewport.y; y < viewport.y + viewport.height; y += 1) {
    for (let x = viewport.x; x < viewport.x + viewport.width; x += 1) {
      const parcelId = district.parcelCoordinateIndex[coordinateKey(x, y)];
      const parcel = parcelId ? district.parcelsById[parcelId] : null;
      const selected = parcelId === selectedParcelId;
      cells.push(parcel
        ? `<button class="district-cell state-${parcel.discoveryState.toLowerCase()}${selected ? " is-selected" : ""}" type="button" role="gridcell" aria-label="${parcelDisplayName(district, parcel)}, ${formatParcelState(parcel)}, coordinates ${x}, ${y}" data-parcel-id="${parcel.id}" style="grid-column:${x - viewport.x + 1};grid-row:${y - viewport.y + 1}"><strong>${parcelDisplayName(district, parcel)}</strong><span>${formatParcelState(parcel)}</span>${renderPassageMarks(parcel)}</button>`
        : `<span class="district-cell is-empty" role="gridcell" style="grid-column:${x - viewport.x + 1};grid-row:${y - viewport.y + 1}" aria-hidden="true"></span>`);
    }
  }
  const selected = selectedParcelId ? district.parcelsById[selectedParcelId] : null;
  statusElement.textContent = selected ? `${parcelDisplayName(district, selected)} · ${formatParcelState(selected)}` : "Select a Parcel.";
  boardElement.innerHTML = `
    <div class="district-toolbar" aria-label="District map controls">
      <button type="button" data-pan="north" aria-label="Pan north">↑</button>
      <button type="button" data-pan="west" aria-label="Pan west">←</button>
      <button type="button" data-recenter="true">Camp</button>
      <button type="button" data-pan="east" aria-label="Pan east">→</button>
      <button type="button" data-pan="south" aria-label="Pan south">↓</button>
    </div>
    <div class="district-map" role="grid" aria-label="District Parcel map" style="--district-cols:${viewport.width};--district-rows:${viewport.height}">${cells.join("")}</div>
    <aside class="parcel-inspector">${selected ? renderParcelInspector(selected) : "<p>Select a known location.</p>"}</aside>
  `;
}

function formatParcelState(parcel) {
  if (parcel.surveyStatus === SURVEY_STATES.inProgress) return `Surveying ${formatClock(parcel.surveyRemainingMs)}`;
  if (parcel.clearanceState === JOB_STATES.inProgress) return `Clearing ${formatClock(parcel.clearanceRemainingMs)}`;
  if (parcel.caveInRecoveryState === JOB_STATES.inProgress) return `Recovering ${formatClock(parcel.caveInRecoveryRemainingMs)}`;
  return parcel.discoveryState.replaceAll("_", " ");
}

function renderPassageMarks(parcel) {
  if (parcel.discoveryState !== PARCEL_STATES.secured) return "";
  return Object.entries(parcel.passages).filter(([, open]) => open).map(([direction]) => `<i class="passage-mark is-${direction}" aria-hidden="true"></i>`).join("");
}

function renderParcelInspector(parcel) {
  const title = parcelDisplayName(district, parcel);
  if (parcel.discoveryState === PARCEL_STATES.unknown) {
    if (parcel.surveyStatus === SURVEY_STATES.inProgress) return `<h2>${title}</h2><p>Survey in progress: ${formatClock(parcel.surveyRemainingMs)}.</p>`;
    const surveyor = availableWorkers(workerState, "surveyor")[0];
    return `<h2>${title}</h2><p>Assign one Surveyor to identify this Parcel.</p><button class="parcel-action" type="button" data-survey-parcel="${parcel.id}" ${surveyor ? "" : "disabled"}>${surveyor ? `Assign ${workerLabel(surveyor)}` : "No Surveyor available"}</button>`;
  }
  const report = parcel.surveyReport;
  const reportMarkup = report ? `<dl class="survey-report"><div><dt>Dimensions</dt><dd>${report.dimensions}</dd></div><div><dt>Mines</dt><dd>${report.mineDensity}</dd></div><div><dt>Hazards</dt><dd>${report.hazards.join(", ")}</dd></div><div><dt>Treasure</dt><dd>${report.treasurePotential}</dd></div><div><dt>Curios</dt><dd>${report.curioPotential}</dd></div><div><dt>Routes</dt><dd>${report.passageHint}</dd></div></dl>` : "";
  if (parcel.clearanceState === JOB_STATES.inProgress) return `<h2>${title}</h2>${reportMarkup}<p>Access clearance: ${formatClock(parcel.clearanceRemainingMs)}.</p>`;
  if (parcel.discoveryState === PARCEL_STATES.surveyed) {
    const blocker = parcel.accessibilityBlockers.find((item) => !item.resolved);
    const job = DISTRICT_CONFIG.clearance[blocker?.type];
    return `<h2>${title}</h2>${reportMarkup}<p><strong>${job?.name || "Blocked"}</strong> · ${job?.digCost || 0} digs · ${formatClock(job?.baseDurationMs || 0)} base time.</p>${renderExcavatorAssignmentButtons("clear", parcel.id, job?.digCost || 0)}`;
  }
  if (parcel.discoveryState === PARCEL_STATES.accessible) {
    return `<h2>${title}</h2>${reportMarkup}<button class="parcel-action" type="button" data-excavate-parcel="${parcel.id}">${parcel.boardId ? "Open Board Preview" : "Begin Excavation"}</button>`;
  }
  if (parcel.discoveryState === PARCEL_STATES.active) {
    return `<h2>${title}</h2>${reportMarkup}<p>${boardSessions[parcel.boardId]?.modeState?.moves || 0} recorded moves.</p><button class="parcel-action" type="button" data-resume-board="${parcel.boardId}">Resume Board</button>`;
  }
  if (parcel.discoveryState === PARCEL_STATES.cavedIn) {
    if (parcel.caveInRecoveryState === JOB_STATES.inProgress) return `<h2>${title}</h2>${reportMarkup}<p>Recovery: ${formatClock(parcel.caveInRecoveryRemainingMs)}.</p>`;
    return `<h2>${title}</h2>${reportMarkup}<p class="parcel-warning">Caved-In · ${DISTRICT_CONFIG.recovery.digCost} digs required.</p>${renderExcavatorAssignmentButtons("recover", parcel.id, DISTRICT_CONFIG.recovery.digCost)}`;
  }
  return `<h2>${title}</h2>${reportMarkup}<p>Secured. ${Object.values(parcel.passages).filter(Boolean).length} passages revealed.</p><p class="parcel-placeholder">Infrastructure will be available in a future expansion.</p>`;
}

function renderExcavatorAssignmentButtons(action, parcelId, cost) {
  const workers = availableWorkers(workerState, "excavator");
  if (!workers.length) return `<button class="parcel-action" type="button" disabled>No Excavator available</button>`;
  return workers.map((worker, index) => `<button class="parcel-action" type="button" data-${action}-parcel="${parcelId}" data-worker-count="${index + 1}" ${player.shovelUses >= cost ? "" : "disabled"}>Assign ${index + 1} Excavator${index ? "s" : ""}</button>`).join("");
}

function workerLabel(worker) {
  const definition = SPECIALISTS.find((item) => item.id === worker.typeId);
  return `${definition?.name || worker.typeId} ${worker.number}`;
}

function startParcelSurvey(parcelId) {
  const worker = availableWorkers(workerState, "surveyor")[0];
  if (!worker || !district) return;
  const duration = calculateSurveyorIntervalMs(worker.level);
  district = startSurvey(district, parcelId, worker.id, duration);
  workerState = assignWorkers(workerState, [worker.id], { type: "SURVEY", parcelId });
  render();
}

function startParcelClearance(parcelId, count) {
  const parcel = district?.parcelsById[parcelId];
  const blocker = parcel?.accessibilityBlockers.find((item) => !item.resolved);
  const job = blocker ? DISTRICT_CONFIG.clearance[blocker.type] : null;
  const workers = availableWorkers(workerState, "excavator").slice(0, count);
  if (!job || workers.length !== count || player.shovelUses < job.digCost) return;
  player.shovelUses -= job.digCost;
  player.shovels = Math.ceil(player.shovelUses / currentShovel().durability);
  district = startClearance(district, parcelId, workers.map((worker) => worker.id), job);
  workerState = assignWorkers(workerState, workers.map((worker) => worker.id), { type: "CLEARANCE", parcelId });
  render();
}

function beginParcelBoard(parcelId) {
  const parcel = district?.parcelsById[parcelId];
  if (!parcel || parcel.discoveryState !== PARCEL_STATES.accessible) return;
  if (parcel.boardId && boardSessions[parcel.boardId]) {
    switchToBoardSession(parcel.boardId);
    return;
  }
  const session = createBlankSession({ rows: parcel.truth.height, cols: parcel.truth.width, mines: parcel.truth.mineCount }, {
    category: BOARD_CATEGORIES.districtParcel,
    owner: { type: "parcel", id: parcel.id },
    seed: parcel.truth.boardSeed,
    parcelId: parcel.id,
  });
  const surveyor = availableWorkers(workerState, "surveyor")[0];
  if (surveyor) {
    session.openingSurvey = {
      workerId: surveyor.id,
      remainingMs: calculateSurveyorIntervalMs(surveyor.level),
      safeIndex: Math.floor(session.settings.rows / 2) * session.settings.cols + Math.floor(session.settings.cols / 2),
    };
    workerState = assignWorkers(workerState, [surveyor.id], { type: "BOARD_OPENING", boardId: session.id, parcelId });
  }
  district = beginExcavation(district, parcel.id, session.id);
  render();
}

function startParcelRecovery(parcelId, count) {
  const workers = availableWorkers(workerState, "excavator").slice(0, count);
  if (!district || workers.length !== count || player.shovelUses < DISTRICT_CONFIG.recovery.digCost) return;
  player.shovelUses -= DISTRICT_CONFIG.recovery.digCost;
  player.shovels = Math.ceil(player.shovelUses / currentShovel().durability);
  district = startRecovery(district, parcelId, workers.map((worker) => worker.id), DISTRICT_CONFIG);
  workerState = assignWorkers(workerState, workers.map((worker) => worker.id), { type: "RECOVERY", parcelId });
  render();
}

function panDistrict(direction) {
  if (!district) return;
  if (direction === "north") district.viewport.y -= 1;
  if (direction === "south") district.viewport.y += 1;
  if (direction === "west") district.viewport.x -= 1;
  if (direction === "east") district.viewport.x += 1;
  render();
}

function tickDistrictRuntime(deltaMs = 1000) {
  lastDistrictTickTime = performance.now();
  if (!district || document.visibilityState === "hidden") return;
  const result = tickDistrict(district, deltaMs, DISTRICT_CONFIG);
  district = result.district;
  if (result.releasedWorkerIds.length) workerState = releaseWorkers(workerState, result.releasedWorkerIds);
  if (result.completed.length) {
    const latest = result.completed.at(-1);
    const parcel = district.parcelsById[latest.parcelId];
    statusElement.textContent = `${parcelDisplayName(district, parcel)}: ${latest.type} complete.`;
  }
  if (currentView === "district" || result.completed.length) render();
}

function render() {
  refreshProofMetadata(board, settings);
  refreshBoardFindings();
  updateRunUI();
  if (currentView === "district") {
    boardElement.innerHTML = "";
    renderDistrictMap();
    updateQuartermaster();
    updateModeUI();
    updateProgressionUI();
    updateCurioUI();
    updateContractUI();
    updateChallengeUI();
    updateStatsUI();
    return;
  }
  boardElement.className = "board";
  boardElement.setAttribute("role", "grid");
  equipmentToggleButton.disabled = false;
  resetButton.disabled = roundStarted && !gameOver;
  if (resetButton.disabled) resetButton.textContent = "LOCKED";
  else if (!roundStarted && !gameOver && currentBoardSession()?.owner?.type !== "main") resetButton.textContent = "BACK";
  useHintButton.disabled = gameOver || isRevealing || !roundStarted || player.hints <= 0 || !hasKnownHint();
  updateSurveyorUI();
  boardElement.classList.toggle("is-revealing", isRevealing);
  const virtual = board.length > 2500;
  const cellSize = GAME_CONFIG.automation.viewport.cellSize;
  boardElement.classList.toggle("is-virtual", virtual);
  boardElement.style.aspectRatio = virtual ? "auto" : `${settings.cols} / ${settings.rows}`;
  boardElement.style.gridTemplateColumns = virtual ? `repeat(${settings.cols}, ${cellSize}px)` : `repeat(${settings.cols}, minmax(0, 1fr))`;
  boardElement.style.gridTemplateRows = virtual ? `repeat(${settings.rows}, ${cellSize}px)` : `repeat(${settings.rows}, minmax(0, 1fr))`;
  boardElement.setAttribute("aria-label", `${settings.cols} by ${settings.rows} minesweeper board`);

  // Rebuilding every button on every tick of a cascade fill (see revealGradually)
  // restarted CSS animations (tile-reveal, treasure-float) on cells that weren't
  // even changing, which read as flicker. Reuse existing buttons whenever the
  // board identity and grid shape haven't changed, and only rebuild from scratch
  // when they have.
  const range = virtual ? visibleGridRange({
    scrollLeft: boardElement.scrollLeft,
    scrollTop: boardElement.scrollTop,
    clientWidth: boardElement.clientWidth || 680,
    clientHeight: boardElement.clientHeight || 680,
    rows: settings.rows,
    cols: settings.cols,
    cellSize,
    overscan: GAME_CONFIG.automation.viewport.overscan,
  }) : null;
  const renderIndexes = virtual ? visibleIndexes(range, settings.cols) : board.map((cell) => cell.index);
  const gridKey = `${settings.cols}x${settings.rows}:${virtual ? `${range.firstRow}-${range.lastRow}-${range.firstCol}-${range.lastCol}` : "full"}`;
  const structureStale = renderedBoardRef !== board || renderedGridKey !== gridKey || boardElement.children.length !== renderIndexes.length;
  if (structureStale) {
    boardElement.innerHTML = "";
    boardButtons = new Array(board.length);
    renderedBoardRef = board;
    renderedGridKey = gridKey;
  }

  const treasureRange = treasureValueRange();

  let visibleWorkerTooltipSource = false;
  renderIndexes.map((index) => board[index]).forEach((cell) => {
    let button = boardButtons[cell.index];
    const isNewButton = !button;
    if (isNewButton) {
      button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "gridcell");
      button.dataset.index = String(cell.index);
      const label = document.createElement("span");
      label.className = "cell-label";
      button.append(label);
boardInputController.bind(button, {
        enableLongPress: !selectedEquipmentId,
        onActivate: () => dispatchGameAction("board/activate", { index: cell.index }),
        onFlag: () => dispatchGameAction("board/flag", { index: cell.index }),
      });
      boardButtons[cell.index] = button;
      boardElement.append(button);
    }
    if (virtual) {
      button.style.gridRow = String(cell.row + 1);
      button.style.gridColumn = String(cell.col + 1);
    } else {
      button.style.gridRow = "";
      button.style.gridColumn = "";
    }

    const classes = ["cell"];
    button.setAttribute("aria-label", labelForCell(cell));
    button.title = "";
    delete button.dataset.adjacent;

    const entrance = currentBoardSession()?.entrances?.find((item) => item.indexes.includes(cell.index));
    if (entrance) {
      classes.push("has-entrance", `entrance-${entrance.edge}`);
      if (entrance.revealMode === "visible" || cell.open) classes.push("is-entrance-revealed");
    }
    const hint = revealedHints.find((entry) => entry.clueIndex === cell.index || entry.targetIndexes.includes(cell.index));
    if (hint) {
      classes.push("is-hinted");
      button.title = hint.type === "safe" ? "Hint: safe to dig" : "Hint: this is a mine";
    }

    const label = button.querySelector(".cell-label");
    let text = "";
    let popupValue = null;
    let popupTier = "gold";

    if (cell.open) {
      classes.push("is-open");
      if (recentlyRevealed.has(cell.index)) classes.push("is-newly-open");
      if (cell.mine) {
        classes.push("is-mine");
        text = "✹";
      } else if (cell.curio) {
        classes.push("is-curio");
        button.title = `Mine Curio ${cell.curioItem}`;
        text = cell.adjacent > 0 ? String(cell.adjacent) : "◆";
      } else if (cell.treasure) {
        const tier = treasureTierFor(cell.treasureValue, treasureRange);
        popupTier = tier;
        classes.push("is-treasure", `is-treasure-${tier}`);
        button.title = `${tier[0].toUpperCase()}${tier.slice(1)} treasure cache: +${formatCurrency(cell.treasureValue)} at round end`;
        text = cell.adjacent > 0 ? String(cell.adjacent) : "✦";
        if (treasurePopups.has(cell.index)) popupValue = treasurePopups.get(cell.index);
      } else if (cell.adjacent > 0) {
        button.dataset.adjacent = String(cell.adjacent);
        text = String(cell.adjacent);
      }

      if (player.chordingUnlocked && cell.adjacent > 0 && !cell.mine) {
        classes.push("is-chordable");
        button.title = formatMessage("chordingReady");
      }
    } else if (cell.flagged) {
      classes.push("is-flagged");
      text = "⚑";
    } else if (selectedEquipmentId && equipmentTargetsHiddenCell(selectedEquipmentId)) {
      classes.push("is-equipment-target");
    }

    label.textContent = text;
    button.className = classes.join(" ");

    // Leave an already-rendered popup for this value alone so its float-and-fade
    // animation isn't restarted on every reveal tick; only add/remove on change.
    const existingPopup = button.querySelector(".treasure-popup");
    if (popupValue == null) {
      if (existingPopup) existingPopup.remove();
    } else if (!existingPopup || existingPopup.dataset.value !== String(popupValue)) {
      if (existingPopup) existingPopup.remove();
      const popup = document.createElement("span");
      popup.className = `treasure-popup treasure-popup--${popupTier}`;
      popup.dataset.value = String(popupValue);
      popup.textContent = `+${formatCurrency(popupValue)}`;
      popup.setAttribute("aria-hidden", "true");
      button.append(popup);
    }

    // Keep an already-rendered marker so its pending ring keeps filling instead of
    // restarting on every tick; only add/remove when the cell's workers change.
    const cellWorkers = workerMarkersForCell(cell.index);
    const existingMarkers = new Map();
    button.querySelectorAll(".worker-cursor").forEach((marker) => {
      if (cellWorkers.some((worker) => worker.id === marker.dataset.workerId)) existingMarkers.set(marker.dataset.workerId, marker);
      else marker.remove();
    });
    button.classList.toggle("is-worker-cursor", cellWorkers.length > 0);
    cellWorkers.forEach((worker) => {
      const workerType = workerTypeForId(worker.id);
      const marker = existingMarkers.get(worker.id) || createWorkerMarker(button, worker, workerType);
      syncWorkerMarker(marker, worker, workerType);
      if (worker.task.phase !== "scanning" && workerTooltipState?.workerId === worker.id && !workerTooltipState.pinned) {
        visibleWorkerTooltipSource = true;
        updateWorkerTooltip(worker, workerType);
      }
    });
  });

  if (workerTooltipState && !workerTooltipState.pinned && !visibleWorkerTooltipSource) {
    workerTooltipState.pinned = true;
    showWorkerCompletionTooltip();
  }

  mineCountElement.textContent = String(Math.max(currentMineCount() - flagsPlaced, 0)).padStart(2, "0");
  moveCountElement.textContent = String(moves).padStart(2, "0");
  fieldValueElement.textContent = `Field value: ${formatCurrency(roundTreasureValue)}`;
  const safetyNote = currentSafetyRadius() > 0
    ? formatMessage("safetyNote", { size: safetySizeLabel(currentSafetyRadius()) })
    : formatMessage("firstTileSafe");
  settingsNote.textContent = `${settings.mines} mine${settings.mines === 1 ? "" : "s"} and ${settings.treasures} treasure${settings.treasures === 1 ? "" : "s"}. ${safetyNote}`;
  syncSettingsControls();
  updateQuartermaster();
  updateModeUI();
  updateProgressionUI();
  updateCurioUI();
  updateContractUI();
  updateChallengeUI();
  updateStatsUI();
}

function labelForCell(cell) {
  if (cell.open && cell.mine) return `Row ${cell.row + 1}, column ${cell.col + 1}, mine`;
  if (cell.open && cell.curio) return `Row ${cell.row + 1}, column ${cell.col + 1}, Mine Curio ${cell.curioItem}`;
  if (cell.open && cell.treasure) return `Row ${cell.row + 1}, column ${cell.col + 1}, ${treasureTierFor(cell.treasureValue, treasureValueRange())} treasure worth ${formatCurrency(cell.treasureValue)} at round end`;
  if (cell.open && cell.adjacent > 0) return `Row ${cell.row + 1}, column ${cell.col + 1}, ${cell.adjacent} nearby mines`;
  if (cell.open) return `Row ${cell.row + 1}, column ${cell.col + 1}, clear`;
  if (cell.flagged) return `Row ${cell.row + 1}, column ${cell.col + 1}, flagged`;
  return `Row ${cell.row + 1}, column ${cell.col + 1}, hidden`;
}

function findKnownHintCandidates() {
  const seen = new Set();
  const safe = [];
  const mine = [];
  board.forEach((cell) => {
    if (!cell.open && !cell.flagged) return;
    neighbors(cell).forEach((candidate) => {
      if (candidate.open || candidate.flagged || seen.has(candidate.index)) return;
      seen.add(candidate.index);
      (candidate.mine ? mine : safe).push(candidate);
    });
  });
  return { safe, mine };
}

function hasKnownHint() {
  const { safe, mine } = findKnownHintCandidates();
  return safe.length > 0 || mine.length > 0;
}

function useHint() {
  if (gameOver || isRevealing || !roundStarted || player.hints <= 0) return false;
  const { safe, mine } = findKnownHintCandidates();
  const pool = safe.length ? safe : mine;
  if (!pool.length) {
    statusElement.textContent = "No hint available right now.";
    render();
    return false;
  }
  const type = safe.length ? "safe" : "mine";
  const target = pool[Math.floor(Math.random() * pool.length)];
  player.hints -= 1;
  revealedHints.push({ type, clueIndex: null, targetIndexes: [target.index] });
  statusElement.textContent = type === "safe"
    ? `Hint: row ${target.row + 1}, column ${target.col + 1} is safe to dig.`
    : `Hint: row ${target.row + 1}, column ${target.col + 1} is a mine.`;
  render();
  return true;
}

function telemetryTile(cell) {
  const nearby = neighbors(cell);
  return {
    index: cell.index,
    row: cell.row,
    col: cell.col,
    adjacent: cell.adjacent,
    flaggedNeighbors: nearby.filter((neighbor) => neighbor.flagged).length,
    hiddenNeighbors: nearby.filter((neighbor) => !neighbor.open && !neighbor.flagged).length,
  };
}

function actionEvidence(cell, includeTarget = false) {
  const evidence = neighbors(cell)
    .filter((neighbor) => neighbor.open && !neighbor.mine)
    .map(telemetryTile);
  return includeTarget ? [telemetryTile(cell), ...evidence] : evidence;
}

function recordBoardAction({ actor = "player", specialistId = null, actionType, cell, evidence, result }) {
  if (!cell) return;
  recordDeveloperAction(developerTelemetry, {
    actor,
    ...(specialistId ? { specialistId } : {}),
    actionType,
    target: { index: cell.index, row: cell.row, col: cell.col },
    timeMs: roundStarted && Number.isFinite(roundStartTime)
      ? Math.max(0, performance.now() - roundStartTime)
      : 0,
    evidence: evidence || actionEvidence(cell),
    result,
  });
}

function openCell(index, { automaticOpening = false } = {}) {
  const cell = board[index];
  if (gameOver || cell.open || cell.flagged) return;
  if (!automaticOpening) cancelBoardOpeningSurvey();
  if (!canDig()) {
    if (!maybeGrantEmergencyShovel()) {
      emergencyHandoutNotice = false;
      statusElement.textContent = formatMessage("noShovels");
      render();
      return;
    }
  } else {
    emergencyHandoutNotice = false;
  }

  if (!startRoundIfNeeded()) return;
  recordDeveloperEvent(developerTelemetry, { type: "dig" });

  if (!minesPlaced) placeMines(cell.index);
  moves += 1;

  recordBoardAction({
    actionType: "dig",
    cell,
    result: cell.mine
      ? { outcome: "mine_hit", revealedTiles: [cell.index] }
      : { outcome: "opened", revealedTiles: revealWavesFrom(cell).flat().filter((target) => !target.mine).map((target) => target.index) },
  });

  if (cell.mine) {
    recordDeveloperEvent(developerTelemetry, { type: "mineHit" });
    player.stats.minesTriggered += 1;
    if (absorbExplosionWithBombBot(cell)) return;
    breakShovel();
    cell.open = true;
    markBoardMutation();
    loseGame();
    return;
  }

  // A manual dig costs one durability, regardless of how many tiles its
  // cascade reveals. Chording passes consumeDurability: false below, so it
  // never adds a cost for any of its revealed tiles.
  consumeShovel();
  const currentRevealToken = beginReveal();
  revealGradually(cell, currentRevealToken, { consumeDurability: false }).then((revealCompleted) => {
    if (!activeRevealTokens.has(currentRevealToken)) return;
    endReveal(currentRevealToken);
    const shouldPreserveHandout = emergencyHandoutNotice;
    if (hasWon()) {
      winGame();
      if (shouldPreserveHandout) {
        emergencyHandoutNotice = true;
        statusElement.textContent = emergencyHandoutStatus;
      }
    } else if (emergencyHandoutNotice) {
      render();
    } else if (!revealCompleted || !canDig()) {
      statusElement.textContent = formatMessage("shovelsSpent");
    } else {
      statusElement.textContent = formatMessage("cleanHit");
    }
    render();
  });
}

function revealGradually(startCell, token, { consumeDurability = false } = {}) {
  const waves = revealWavesFrom(startCell);

  return (async () => {
    for (const wave of waves) {
      for (const cell of wave) {
        if (!activeRevealTokens.has(token) || gameOver) return false;
        if (cell.open || cell.flagged || cell.mine) continue;
        if (consumeDurability && !consumeShovel()) return false;

        cell.open = true;
        markBoardMutation();
        recordDeveloperEvent(developerTelemetry, { type: "reveal" });
        player.stats.safeTilesDug += 1;
        tickBombBotUse();
        collectCellFinds(cell);
        recentlyRevealed = new Set([cell.index]);
        render();
        recentlyRevealed.clear();
        await delay(BALANCE_CONFIG.reveal.tileDelayMs);
      }
      await delay(BALANCE_CONFIG.reveal.waveDelayMs);
    }
    return true;
  })();
}

function revealWavesFrom(startCell) {
  return calculateRevealWaves(board, settings, startCell.index)
    .map((wave) => wave.map((index) => board[index]));
}

async function chordCell(index) {
  const cell = board[index];
  if (gameOver || !cell.open || cell.mine || cell.adjacent <= 0) return;

  const chord = evaluateChord(board, settings, index);
  if (!chord.allowed) {
    statusElement.textContent = formatMessage("chordNeedsFlags", { required: chord.required, actual: chord.actual });
    render();
    return;
  }

  const candidates = chord.candidates.map((candidateIndex) => board[candidateIndex]);
  if (candidates.length === 0) return;

  moves += 1;
  roundUsedChording = true;
  recordBoardAction({
    actionType: "chord",
    cell,
    evidence: actionEvidence(cell, true),
    result: {
      outcome: candidates.some((candidate) => candidate.mine) ? "mine_hit" : "opened",
      revealedTiles: candidates.filter((candidate) => !candidate.mine).map((candidate) => candidate.index),
    },
  });
  recordDeveloperEvent(developerTelemetry, { type: "chord" });
  const token = beginReveal();
  const safeCandidates = candidates.filter((candidate) => !candidate.mine);
  for (const candidate of safeCandidates) {
    if (!activeRevealTokens.has(token) || gameOver) return;
    const revealCompleted = await revealGradually(candidate, token, { consumeDurability: false });
    if (!revealCompleted) {
      endReveal(token);
      render();
      return;
    }
  }

  if (!activeRevealTokens.has(token) || gameOver) return;
  const mineCandidate = candidates.find((candidate) => candidate.mine);
  if (mineCandidate) {
    recordDeveloperEvent(developerTelemetry, { type: "mineHit" });
    player.stats.minesTriggered += 1;
    if (absorbExplosionWithBombBot(mineCandidate)) {
      endReveal(token);
      return;
    }
    breakShovel();
    mineCandidate.open = true;
    endReveal(token);
    loseGame();
    return;
  }

  endReveal(token);
  if (hasWon()) winGame();
  else statusElement.textContent = formatMessage("chordingComplete");
  render();
}

function delay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function collectCellFinds(cell) {
  collectBlueprint(cell);
  collectCurio(cell);
  collectTreasure(cell);
}

function updateRunUI() {
  const allTime = profile.allTimeHighScore?.score || 0;
  const current = runMeta.currentHighScore?.score || 0;
  allTimeHighScoreElement.textContent = String(allTime);
  runHighScoreElement.textContent = String(current);
}

function collectBlueprint(cell) {
  if (!cell.blueprintId || cell.blueprintCollected) return;
  cell.blueprintCollected = true;
  const result = discoverBlueprint(profile.blueprintLibrary, currentBoardId);
  profile.blueprintLibrary = result.library;
  if (!result.blueprintId) return;
  runMeta.stats.blueprintsDiscovered += 1;
  const blueprint = BLUEPRINTS.find((item) => item.id === result.blueprintId);
  statusElement.textContent = `Blueprint discovered: ${blueprint?.name || result.blueprintId}.`;
}

function collectTreasure(cell) {
  if (!cell.treasure || cell.treasureCollected) return;

  cell.treasureCollected = true;
  roundTreasureValue += cell.treasureValue;
  roundTreasureCount += 1;
  player.stats.treasureCachesFound += 1;
  treasurePopups.set(cell.index, cell.treasureValue);
  window.setTimeout(() => {
    if (treasurePopups.get(cell.index) !== cell.treasureValue) return;
    treasurePopups.delete(cell.index);
    render();
  }, 1800);
  if (!emergencyHandoutNotice) {
    statusElement.textContent = formatMessage("treasureFound", { value: formatCurrency(cell.treasureValue) });
  }
}

function collectCurio(cell) {
  if (!cell.curio || cell.curioCollected) return;
  cell.curioCollected = true;
  const item = cell.curioItem || 1;
  player.curios[item - 1] += 1;
  player.curioMisses = 0;
  player.stats.curiosFound += 1;
  runMeta.stats.curiosDiscovered += 1;
  if (!emergencyHandoutNotice) statusElement.textContent = formatMessage("curioFound", { item });
}

function toggleFlag(index) {
  const cell = board[index];
  if (gameOver || cell.open) return;
  if (!roundStarted || !minesPlaced) {
    statusElement.textContent = "The first action must uncover a guaranteed-safe tile.";
    render();
    return;
  }

  if (!cell.flagged && activeEquipment.mineEncapsulationUses > 0) {
    useMineEncapsulation(cell);
    return;
  }

  if (!cell.flagged && flagPool.availableFlags <= 0) {
    emergencyHandoutNotice = false;
    statusElement.textContent = formatMessage("flagPouchEmpty");
    render();
    return;
  }

  if (!cell.flagged && flagsPlaced >= currentMineCount()) {
    emergencyHandoutNotice = false;
    statusElement.textContent = formatMessage("flagLimitReached", { count: currentMineCount() });
    render();
    return;
  }

  emergencyHandoutNotice = false;
  const willFlag = !cell.flagged;
  if (willFlag) {
    const deployment = deployCompanyFlag({ cell });
    if (!deployment.ok) {
      statusElement.textContent = formatMessage("flagPouchEmpty");
      render();
      return;
    }
  }
  recordBoardAction({
    actionType: "flag",
    cell,
    result: { outcome: willFlag ? "flag_placed" : "flag_removed" },
  });
  if (willFlag) {
    cell.flagged = true;
    cell.flaggedByPlayer = true;
    cell.flaggedByWorker = false;
    roundFlagPlacements += 1;
    flagsPlaced += 1;
  } else {
    clearCompanyFlag(cell);
    lastManualFlagRemovalAt = Date.now();
  }
  recordDeveloperEvent(developerTelemetry, { type: willFlag ? "flagPlaced" : "flagRemoved" });
  markBoardMutation();
  statusElement.textContent = formatMessage(cell.flagged ? "flagPlanted" : "flagCleared");
  render();
}

function useSelectedEquipment(index) {
  const item = SPECIAL_EQUIPMENT_BY_ID[selectedEquipmentId];
  if (!item || (player.specialEquipment[item.id] || 0) <= 0) {
    clearSelectedEquipment();
    render();
    return;
  }

  if (gameOver || isRevealing) return;
  if (!minesPlaced) {
    statusElement.textContent = "Dig one square before using special equipment; mines are placed after the first click.";
    render();
    return;
  }

  const cell = board[index];
  if (!cell) return;

  if (item.id === "probeCharge") {
    if (cell.open) {
      statusElement.textContent = "Probe Charge needs a hidden square.";
      render();
      return;
    }
    startRoundIfNeeded();
    spendSelectedEquipment(item.id);
    statusElement.textContent = cell.mine
      ? `Probe Charge: row ${cell.row + 1}, column ${cell.col + 1} contains a mine.`
      : `Probe Charge: row ${cell.row + 1}, column ${cell.col + 1} is clear.`;
    recordBoardAction({ actionType: "probe_charge", cell, result: { outcome: cell.mine ? "mine_detected" : "clear_detected" } });
  } else if (item.id === "controlledBlast") {
    startRoundIfNeeded();
    spendSelectedEquipment(item.id);
    const destroyed = controlledBlast(cell);
    statusElement.textContent = `Controlled Blast opened the zone${destroyed > 0 ? ` and destroyed ${destroyed} mine${destroyed === 1 ? "" : "s"}` : ""}.`;
    recordBoardAction({ actionType: "controlled_blast", cell, result: { outcome: "activated", minesDestroyed: destroyed } });
  } else if (item.id === "seismicTrap") {
    startRoundIfNeeded();
    spendSelectedEquipment(item.id);
    const total = rowColumnMineCount(cell);
    statusElement.textContent = `Seismic Trap: ${total} mine${total === 1 ? "" : "s"} in that row and column.`;
    recordBoardAction({ actionType: "seismic_trap", cell, result: { outcome: "activated", minesDetected: total } });
  } else if (item.id === "bombBot") {
    startRoundIfNeeded();
    spendSelectedEquipment(item.id);
    activeEquipment.bombBotUses = 15;
    statusElement.textContent = "Bomb-Bot deployed for the next 15 opened squares.";
    recordBoardAction({ actionType: "bomb_bot", cell, result: { outcome: "activated", protectedOpens: 15 } });
  } else if (item.id === "mineEncapsulation") {
    startRoundIfNeeded();
    spendSelectedEquipment(item.id);
    activeEquipment.mineEncapsulationUses = 20;
    statusElement.textContent = "Mine Encapsulation armed for the next 20 flag attempts.";
    recordBoardAction({ actionType: "mine_encapsulation", cell, result: { outcome: "activated", protectedFlags: 20 } });
  }

  clearSelectedEquipment();
  if (hasWon()) winGame();
  render();
}

function spendSelectedEquipment(id) {
  player.specialEquipment[id] = Math.max(0, (player.specialEquipment[id] || 0) - 1);
  recordDeveloperEvent(developerTelemetry, { type: "equipment", id });
}

function clearSelectedEquipment() {
  selectedEquipmentId = null;
  equipmentInventoryElement.hidden = true;
  equipmentToggleButton.setAttribute("aria-expanded", "false");
}

function equipmentTargetsHiddenCell(id) {
  return id === "probeCharge" || id === "controlledBlast" || id === "seismicTrap";
}

function controlledBlast(centerCell) {
  let destroyed = 0;
  const rowStart = Math.max(0, centerCell.row - 1);
  const rowEnd = Math.min(settings.rows - 1, centerCell.row + 1);
  const colStart = Math.max(0, centerCell.col - 1);
  const colEnd = Math.min(settings.cols - 1, centerCell.col + 1);

  const openedCells = [];
  for (let row = rowStart; row <= rowEnd; row += 1) {
    for (let col = colStart; col <= colEnd; col += 1) {
      const cell = board[row * settings.cols + col];
      if (cell.mine) {
        destroyMine(cell);
        destroyed += 1;
      } else if (!cell.open) {
        if (cell.flagged) clearCompanyFlag(cell);
        cell.open = true;
        recordDeveloperEvent(developerTelemetry, { type: "reveal" });
        player.stats.safeTilesDug += 1;
        collectCellFinds(cell);
        openedCells.push(cell);
      }
    }
  }

  updateAdjacency();

  // Destroying mines can leave a blast-opened tile with zero adjacent mines.
  // Same as a normal dig, that tile needs to keep cascading outward — otherwise
  // it ends up bordering a still-hidden tile, which breaks the minesweeper
  // invariant that a "0" tile always has every neighbor revealed.
  const queue = openedCells.filter((cell) => cell.adjacent === 0);
  const queued = new Set(queue.map((cell) => cell.index));
  while (queue.length > 0) {
    const cell = queue.shift();
    neighbors(cell).forEach((neighbor) => {
      if (queued.has(neighbor.index) || neighbor.open || neighbor.flagged || neighbor.mine) return;
      queued.add(neighbor.index);
      neighbor.open = true;
      recordDeveloperEvent(developerTelemetry, { type: "reveal" });
      player.stats.safeTilesDug += 1;
      collectCellFinds(neighbor);
      if (neighbor.adjacent === 0) queue.push(neighbor);
    });
  }

  return destroyed;
}

function rowColumnMineCount(centerCell) {
  return board.filter((cell) => (
    cell.mine
    && (cell.row === centerCell.row || cell.col === centerCell.col)
  )).length;
}

function useMineEncapsulation(cell) {
  activeEquipment.mineEncapsulationUses = Math.max(0, activeEquipment.mineEncapsulationUses - 1);
  roundFlagPlacements += 1;
  recordDeveloperEvent(developerTelemetry, { type: "flagPlaced" });
  recordBoardAction({
    actionType: "flag",
    cell,
    result: { outcome: cell.mine ? "mine_collected" : "clear_revealed" },
  });

  if (cell.mine) {
    player.mines += 1;
    recordDeveloperEvent(developerTelemetry, { type: "recoveredMines", count: 1 });
    player.specialEquipmentUnlocked = true;
    player.stats.minesCorrectlyFlagged += 1;
    player.stats.minesRecovered += 1;
    destroyMine(cell);
    statusElement.textContent = `Mine encapsulated and collected. ${activeEquipment.mineEncapsulationUses} use${activeEquipment.mineEncapsulationUses === 1 ? "" : "s"} left.`;
    if (hasWon()) winGame();
    else render();
    return;
  }

  cell.open = true;
  cell.flagged = false;
  cell.flaggedByPlayer = false;
  recordDeveloperEvent(developerTelemetry, { type: "reveal" });
  player.stats.safeTilesDug += 1;
  collectCellFinds(cell);
  statusElement.textContent = `No mine was there. Encapsulation use wasted; ${activeEquipment.mineEncapsulationUses} left.`;
  if (hasWon()) winGame();
  else render();
}

function absorbExplosionWithBombBot(cell) {
  if (activeEquipment.bombBotUses <= 0) return false;

  activeEquipment.bombBotUses = 0;
  destroyMine(cell);
  statusElement.textContent = "Bomb-Bot absorbed the explosion. The round continues.";
  if (hasWon()) winGame();
  else render();
  return true;
}

function tickBombBotUse() {
  if (activeEquipment.bombBotUses <= 0) return;
  activeEquipment.bombBotUses = Math.max(0, activeEquipment.bombBotUses - 1);
}

function destroyMine(cell) {
  if (!cell.mine) return;
  if (cell.flagged) clearCompanyFlag(cell);
  cell.mine = false;
  cell.open = true;
  updateAdjacency();
}

function currentMineCount() {
  return minesPlaced ? board.filter((cell) => cell.mine).length : settings.mines;
}

function startRoundIfNeeded() {
  if (roundStarted) return true;
  let session = currentBoardSession();
  if (session?.status === BOARD_SESSION_STATUS.preview) {
    if (session.category === BOARD_CATEGORIES.standardContract || session.category === BOARD_CATEGORIES.campContract) {
      const requirement = session.settings.rows * session.settings.cols;
      const reservation = reserveContractDigs(session, {
        ...player,
        shovelDurability: currentShovel().durability,
      }, player.shovelTier, requirement);
      if (!reservation.ok) {
        statusElement.textContent = `Need ${requirement} unreserved digs to begin this Contract. Available: ${player.shovelUses}.`;
        render();
        return false;
      }
      session = reservation.session;
      player.shovelUses = reservation.player.shovelUses;
      player.shovels = reservation.player.shovels;
    }
    const campCommit = commitCampEligibleAttempt(campProgression, { boardId: session.id, category: session.category });
    campProgression = campCommit.progression;
    if (campCommit.discoveryActivated) {
      session.campDiscovery = true;
      session.entrances = [createEntrance(settings, createSeededRandom(`${session.seed}:camp-entrance`), {
        widths: CAMP_CONFIG.entranceWidths,
      })];
      statusElement.textContent = "A route toward the Camp Parcel lies somewhere along this field’s edge.";
    }
    if (session.category === BOARD_CATEGORIES.districtParcel && session.parcelId && district) {
      district = activateParcel(district, session.parcelId);
    }
    session = commitBoardSession(session);
    boardSessions[session.id] = session;
  }
  roundStarted = true;
  roundStartTime = performance.now();
  return true;
}

function loseGame() {
  if (roundResolved) return;
  roundResolved = true;
  gameOver = true;
  const contractType = activeContractType();
  const elapsed = roundStarted ? Math.max(0, performance.now() - roundStartTime) : 0;
  player.stats.boardsLost += 1;
  player.stats.currentWinStreak = 0;
  player.stats.minesCorrectlyFlagged += countCorrectPlayerFlags();
  const flagOutcome = reconcileResolvedBoardFlags(false);
  recordDeveloperEvent(developerTelemetry, { type: "flagsExposed", count: flagOutcome.exposed });
  recordDeveloperEvent(developerTelemetry, { type: "flagsRecoveredAfterFailure", count: flagOutcome.recovered });
  recordDeveloperEvent(developerTelemetry, { type: "flagsLostAfterFailure", count: flagOutcome.lost });
  if (lastManualFlagRemovalAt > 0 && Date.now() - lastManualFlagRemovalAt <= 10000) {
    recordDeveloperEvent(developerTelemetry, { type: "preRiskFlagRemoval" });
  }
  recordDeveloperEvent(developerTelemetry, {
    type: "flagPoolEnd",
    available: flagPool.availableFlags,
    deployed: totalDeployedFlags(),
    missing: flagPool.missingFlags,
  });
  resolveDeveloperRun(developerTelemetry, "mine_hit", elapsed);
  tickContractCooldowns();
  resetButton.textContent = contractType ? "DONE" : "RETRY";
  board.forEach((cell) => {
    if (cell.mine) cell.open = true;
  });
  finalizeCurrentBoardSession(false);
  if (contractType) {
    statusElement.textContent = failContract(contractType);
    render();
    return;
  }
  if (currentBoardSession()?.category === BOARD_CATEGORIES.standard) advanceContractSchedule();
  if (!maybeGrantEmergencyShovel("Boom. The shovel shattered.")) {
    emergencyHandoutNotice = false;
    statusElement.textContent = formatMessage("boomWaiting");
  }
  render();
}

function winGame() {
  if (roundResolved) return;
  roundResolved = true;
  gameOver = true;
  const contractType = activeContractType();
  const actualMineCount = board.filter((cell) => cell.mine).length;
  const correctFlags = countCorrectPlayerFlags();
  const roundPayout = calculateRoundPayout(roundTreasureValue, actualMineCount, mineYieldPercent());
  const elapsed = Math.max(0, performance.now() - roundStartTime);
  const configKey = `${settings.rows}×${settings.cols} / ${actualMineCount} mine${actualMineCount === 1 ? "" : "s"}`;

  player.coins += roundPayout;
  runMeta.stats.coinsEarned += roundPayout;
  recordDeveloperEvent(developerTelemetry, { type: "coinsEarned", count: roundPayout });
  player.stats.boardsCompleted += 1;
  player.stats.coinsEarned += roundPayout;
  player.stats.minesCorrectlyFlagged += correctFlags;
  player.stats.currentWinStreak += 1;
  player.stats.longestWinStreak = Math.max(player.stats.longestWinStreak, player.stats.currentWinStreak);
  player.stats.largestBoardCompleted = Math.max(player.stats.largestBoardCompleted, settings.rows * settings.cols);
  player.stats.highestMineDensityCompleted = Math.max(
    player.stats.highestMineDensityCompleted,
    settings.rows * settings.cols ? actualMineCount / (settings.rows * settings.cols) : 0,
  );
  player.stats.fastestClears[configKey] = Math.min(player.stats.fastestClears[configKey] || Number.POSITIVE_INFINITY, elapsed);

  const recovered = recoverFlaggedMines();
  recordDeveloperEvent(developerTelemetry, { type: "recoveredMines", count: recovered });
  const returnedFlags = board.filter((cell) => cell.flagged).length;
  reconcileResolvedBoardFlags(true);
  recordDeveloperEvent(developerTelemetry, { type: "flagsReturnedAfterVictory", count: returnedFlags });
  tickContractCooldowns();
  const contractText = contractType ? ` ${completeContract(contractType)}` : "";
  const challengeText = completeMatchingChallenges({
    rows: settings.rows,
    cols: settings.cols,
    mines: actualMineCount,
    elapsed,
    flagPlacements: roundFlagPlacements,
    usedChording: roundUsedChording,
  });
  recordDeveloperEvent(developerTelemetry, {
    type: "flagPoolEnd",
    available: flagPool.availableFlags,
    deployed: totalDeployedFlags(),
    missing: flagPool.missingFlags,
  });
  resolveDeveloperRun(developerTelemetry, contractType ? "contract_completed" : "cleared", elapsed);
  if (!contractType && currentBoardSession()?.category === BOARD_CATEGORIES.standard) advanceContractSchedule();
  resetButton.textContent = contractType ? "BACK" : "AGAIN";
  board.forEach((cell) => {
    if (cell.mine && !cell.flagged) {
      cell.flagged = true;
      cell.flaggedByPlayer = false;
      cell.flaggedByWorker = false;
      flagsPlaced += 1;
    }
  });

  const rewardText = roundPayout > 0
    ? formatMessage("rewardSuffix", { value: formatCurrency(roundPayout) })
    : formatMessage("noTreasurePayout");
  const recoveryText = recovered > 0
    ? formatMessage("recoverySuffix", { count: recovered, plural: recovered === 1 ? "" : "s" })
    : "";
  statusElement.textContent = formatMessage("boardClear", { reward: rewardText, recovery: recoveryText }) + contractText + challengeText;
  finalizeCurrentBoardSession(true);
}

function finalizeCurrentBoardSession(won) {
  let session = currentBoardSession();
  if (!session) return;
  if (session.digBudget) {
    const released = releaseContractDigs(session, {
      ...player,
      shovelDurability: currentShovel().durability,
    }, currentShovel().durability);
    session = released.session;
    player.shovelUses = released.player.shovelUses;
    player.shovels = released.player.shovels;
  }
  session = resolveBoardSession(session, won);
  session.modeState = createModeState();
  boardSessions[session.id] = session;
  archiveResolvedBoard(session, won);

  if (session.campDiscovery) {
    campProgression = resolveCampDiscovery(campProgression, {
      boardId: session.id,
      won,
      rng: Math.random,
      config: CAMP_CONFIG,
    });
  }

  if (session.category === BOARD_CATEGORIES.campContract) {
    campProgression = resolveCampAttempt(campProgression, { won, rng: Math.random, config: CAMP_CONFIG });
    if (won) {
      district = createDistrict(DISTRICT_CONFIG, {
        seed: `district:${session.seed}`,
        campBoardId: session.id,
      });
      selectedParcelId = "camp-parcel";
    }
  }

  if (session.category === BOARD_CATEGORIES.districtParcel && session.parcelId && district) {
    district = won
      ? secureParcel(district, session.parcelId, DISTRICT_CONFIG)
      : caveInParcel(district, session.parcelId);
    if (!won) {
      profile.blueprintLibrary = releaseBlueprintReservation(profile.blueprintLibrary, session.id);
      delete boardSessions[session.id];
    }
  }

  if (session.contractInstanceId && contractInstances[session.contractInstanceId]) {
    contractInstances[session.contractInstanceId].status = won ? "COMPLETED" : "FAILED";
  }
}

function archiveResolvedBoard(session, won) {
  if (profile.boardArchive.some((summary) => summary.id === session.id)) return;
  const currentAttempt = developerTelemetry.currentAttempt;
  const summary = createBoardSummary(session, {
    runId: runMeta.id,
    runOrdinal: runMeta.ordinal,
    outcome: won ? "WON" : "LOST",
    treasureCount: roundTreasureCount,
    elapsedMs: roundStarted ? Math.max(0, performance.now() - roundStartTime) : 0,
    equipmentUsed: currentAttempt?.equipmentUses || {},
    workerParticipation: Boolean(currentAttempt?.workerActionCount),
  });

  if (Number.isInteger(pendingBoardFocusIndex) && boardButtons[pendingBoardFocusIndex]) {
    boardButtons[pendingBoardFocusIndex].focus({ preventScroll: true });
    pendingBoardFocusIndex = null;
  }
  profile.boardArchive.push(summary);
  const score = evaluateHighScore(profile, runMeta, summary);
  profile = score.profile;
  runMeta = score.run;
}

function recoverFlaggedMines() {
  const chance = Math.min(1, mineCollectionChance() + (activeContractType()?.recoveryBonus || 0));
  if (chance <= 0) return 0;

  let recovered = 0;
  board.filter((cell) => cell.mine && cell.flaggedByPlayer).forEach((cell) => {
    if (Math.random() < chance) recovered += 1;
  });
  const workerChance = chance * GAME_CONFIG.automation.workerMineRecoveryMultiplier;
  board.filter((cell) => cell.mine && cell.flaggedByWorker).forEach((cell) => {
    if (Math.random() < workerChance) recovered += 1;
  });
  player.mines += recovered;
  player.stats.minesRecovered += recovered;
  runMeta.stats.minesRecovered += recovered;
  return recovered;
}

function countCorrectPlayerFlags() {
  return board.filter((cell) => cell.mine && cell.flaggedByPlayer).length;
}

function hasWon() {
  return hasClearedBoard(board);
}

function canDig() {
  const budget = currentBoardSession()?.digBudget;
  if (budget) return budget.remaining >= BALANCE_CONFIG.digCostPerTile;
  return player.shovelUses >= BALANCE_CONFIG.digCostPerTile;
}

function consumeShovel() {
  const session = currentBoardSession();
  if (session?.digBudget) {
    if (session.digBudget.remaining < BALANCE_CONFIG.digCostPerTile) return false;
    session.digBudget.remaining -= BALANCE_CONFIG.digCostPerTile;
    recordDeveloperEvent(developerTelemetry, { type: "shovelDurability", count: BALANCE_CONFIG.digCostPerTile });
    return true;
  }
  if (!canDig()) return false;

  const durability = currentShovel().durability;
  const result = consumeShovelState({
    shovelUses: player.shovelUses,
    shovelDurability: durability,
    cost: BALANCE_CONFIG.digCostPerTile,
  });
  recordDeveloperEvent(developerTelemetry, { type: "shovelDurability", count: BALANCE_CONFIG.digCostPerTile });
  if (result.broke) recordDeveloperEvent(developerTelemetry, { type: "shovelConsumed" });
  player.shovelUses = result.shovelUses;
  player.shovels = result.shovels;
  if (result.broke) player.stats.shovelsBroken += 1;
  maybeGrantEmergencyShovel();
  return true;
}

function breakShovel() {
  const session = currentBoardSession();
  if (session?.digBudget) {
    const durability = currentShovel().durability;
    const currentUses = session.digBudget.remaining % durability || Math.min(durability, session.digBudget.remaining);
    session.digBudget.remaining = Math.max(0, session.digBudget.remaining - currentUses);
    recordDeveloperEvent(developerTelemetry, { type: "shovelDurability", count: currentUses });
    if (currentUses > 0) {
      recordDeveloperEvent(developerTelemetry, { type: "shovelConsumed" });
      player.stats.shovelsBroken += 1;
    }
    return;
  }
  if (player.shovels <= 0 || player.shovelUses <= 0) return;

  const durability = currentShovel().durability;
  const currentUses = player.shovelUses % durability || durability;
  const result = breakCurrentShovelState({
    shovelUses: player.shovelUses,
    shovelDurability: durability,
    shovels: player.shovels,
  });
  recordDeveloperEvent(developerTelemetry, { type: "shovelDurability", count: currentUses });
  if (result.broke) recordDeveloperEvent(developerTelemetry, { type: "shovelConsumed" });
  player.shovelUses = result.shovelUses;
  player.shovels = result.shovels;
  if (result.broke) player.stats.shovelsBroken += 1;
}

function canPurchase() {
  return !isContractActive();
}

function purchaseSupply(targetId) {
  if (targetId === "shovel") {
    const cost = shovelSupplyCost();
    if (player.coins < cost || player.shovels >= shovelCapacity()) return false;

    emergencyHandoutNotice = false;
    player.coins -= cost;
    player.shovels += 1;
    player.shovelUses += currentShovel().durability;
    statusElement.textContent = formatMessage("suppliesShovel");
    return true;
  }

  if (targetId === "flags") {
    const cost = flagSupplyCost();
    if (player.coins < cost || flagPool.missingFlags <= 0) return false;

    emergencyHandoutNotice = false;
    player.coins -= cost;
    const result = repairMissingFlags(flagPool, FLAG_CONFIG.replacementBundleSize, totalDeployedFlags());
    flagPool = result.pool;
    syncLegacyFlagStock();
    recordDeveloperEvent(developerTelemetry, { type: "flagsReplaced", count: result.repaired });
    statusElement.textContent = formatMessage("suppliesFlags", { count: result.repaired });
    return true;
  }

  if (targetId === "hints") {
    const cost = BALANCE_CONFIG.shovel.hintSupplyCost;
    const bundle = BALANCE_CONFIG.shovel.hintBundleSize;
    if (player.coins < cost || player.hints + bundle > hintCapacity()) return false;
    player.coins -= cost;
    player.hints += bundle;
    statusElement.textContent = `Hint bundle stocked: +${bundle}.`;
    return true;
  }

  return false;
}

function purchaseEquipment(id) {
  const item = SPECIAL_EQUIPMENT_BY_ID[id];
  if (!item || player.mines < item.cost || !hasSpecialEquipmentAccess()) return false;

  player.mines -= item.cost;
  player.specialEquipment[id] = (player.specialEquipment[id] || 0) + 1;
  statusElement.textContent = `${item.name} stocked. Open the cabinet inventory during a round to use it.`;
  return true;
}

function activateEquipment(id) {
  const item = SPECIAL_EQUIPMENT_BY_ID[id];
  if (!item || (player.specialEquipment[id] || 0) <= 0) return;

  if (equipmentTargetsHiddenCell(id)) {
    if (!minesPlaced) {
      selectedEquipmentId = null;
      statusElement.textContent = "Dig one square before using targeted equipment; mines are placed after the first click.";
      render();
      return;
    }
    selectedEquipmentId = selectedEquipmentId === id ? null : id;
    statusElement.textContent = selectedEquipmentId
      ? `${item.name} selected. Choose a square on the board.`
      : `${item.name} selection canceled.`;
    render();
    return;
  }

  selectedEquipmentId = id;
  useSelectedEquipment(0);
}

function fieldSpecificationMaximum(id, fieldSettings, levels = player) {
  if (id === "tallerGrid") return GRID_LIMITS.min + levels.tallerGridLevel;
  if (id === "widerGrid") return GRID_LIMITS.min + levels.widerGridLevel;
  if (id === "addMine") {
    return Math.min(
      maxMineCountFor(fieldSettings.rows, fieldSettings.cols, safetyRadiusForSettings(fieldSettings)),
      1 + levels.mineLevel,
    );
  }
  if (id === "addTreasure") return maxTreasureCountFor(fieldSettings, levels.treasureLevel);
  return null;
}

function fieldSpecificationKey(id) {
  return {
    tallerGrid: "rows",
    widerGrid: "cols",
    addMine: "mines",
    addTreasure: "treasures",
  }[id] || null;
}

function purchaseUpgrade(targetId) {
  if (targetId === "shovelCapacity") return purchaseCapacityUpgrade("shovel");
  if (targetId === "flagCapacity") return purchaseCapacityUpgrade("flags");
  if (!isUpgradeUnlocked(targetId)) return false;
  const id = targetId;
  const item = PROGRESSION_CONFIG.items[id];
  if (!item) return false;
  const selectionKey = fieldSpecificationKey(id);
  const editCurrentField = canEditFieldSpecification();
  const fieldSelection = normalizeFieldSettings(editCurrentField ? settings : preferredFieldSettings());
  const previousSelectionMaximum = selectionKey ? fieldSpecificationMaximum(id, fieldSelection) : null;
  let restartForSelection = false;

  if (id === "improveShovel") {
    if (Object.values(boardSessions).some((session) => session.digBudget)) {
      statusElement.textContent = "Finish committed Contract boards before changing shovel tiers.";
      return false;
    }
    const nextTierIndex = player.shovelTier + 1;
    if (nextTierIndex >= BALANCE_CONFIG.shovel.tiers.length) return false;
    const cost = exponentialCost(item.baseCost, item.growth, player.shovelTier);
    if (player.coins < cost) return false;
    const intactShovels = player.shovels;
    player.coins -= cost;
    player.shovelTier = nextTierIndex;
    player.shovelUses = intactShovels * currentShovel().durability;
  } else {
    const levelKeys = {
      tallerGrid: "tallerGridLevel",
      widerGrid: "widerGridLevel",
      addMine: "mineLevel",
      addTreasure: "treasureLevel",
      mineYield: "mineYieldLevel",
      treasureValue: "treasureValueLevel",
      betterFlags: "betterFlagsLevel",
    };
    const levelKey = levelKeys[id];
    if (!levelKey) return false;
    const level = player[levelKey];
    const cost = progressionCost(id, level);
    if (player.coins < cost) return false;
    player.coins -= cost;
    player[levelKey] += 1;

    if (selectionKey) {
      const newSelectionMaximum = fieldSpecificationMaximum(id, fieldSelection);
      const nextValue = selectionAfterCapacityUpgrade(
        fieldSelection[selectionKey],
        previousSelectionMaximum,
        newSelectionMaximum,
      );
      if (nextValue !== fieldSelection[selectionKey]) {
        fieldSelection[selectionKey] = nextValue;
        fieldSelection.mines = Math.min(
          fieldSelection.mines,
          fieldSpecificationMaximum("addMine", fieldSelection),
        );
        fieldSelection.treasures = Math.min(
          fieldSelection.treasures,
          maxTreasureCountFor(fieldSelection),
        );
        preferences.lastBoardSelection = { ...fieldSelection };
        if (editCurrentField) {
          settings = { ...fieldSelection };
          restartForSelection = true;
        }
      }
    }
  }

  if (restartForSelection) startGame();
  statusElement.textContent = formatMessage("upgradeInstalled", { name: item.name });
  return true;
}

function purchaseCapacityUpgrade(kind) {
  const levels = kind === "shovel" ? BALANCE_CONFIG.capacity.shovel : BALANCE_CONFIG.capacity.flags;
  const levelKey = kind === "shovel" ? "shovelCapacityLevel" : "flagCapacityLevel";
  const costs = kind === "shovel" ? BALANCE_CONFIG.upgrades.shovelCapacityCosts : BALANCE_CONFIG.upgrades.flagCapacityCosts;
  const level = player[levelKey];
  if (level + 1 >= levels.length) return false;
  const cost = costs[level];
  if (player.coins < cost) return false;

  player.coins -= cost;
  player[levelKey] += 1;
  if (kind === "flags") {
    flagPool = refillFlagPool(flagPool, flagCapacity(), totalDeployedFlags());
    syncLegacyFlagStock();
    recordDeveloperEvent(developerTelemetry, { type: "flagLockerRefill", count: flagPool.availableFlags });
  }
  statusElement.textContent = formatMessage("storageExpanded", { kind: kind === "shovel" ? COPY_CONFIG.upgradeLabels.shovelLocker : COPY_CONFIG.upgradeLabels.flagLocker });
  return true;
}

function purchaseAbility(id) {
  let abilityMessage = formatMessage("abilityInstalled");

  if (id === "safetyRadius") {
    if (player.safetyRadius >= 2) return false;
    if (player.safetyRadius === 0) {
      const cost = BALANCE_CONFIG.abilities.safetyRadiusCosts[0];
      if (player.coins < cost) return false;
      player.coins -= cost;
    } else {
      const maxRowsUnlocked = GRID_LIMITS.min + player.tallerGridLevel;
      const maxColsUnlocked = GRID_LIMITS.min + player.widerGridLevel;
      if (maxRowsUnlocked < 4 || maxColsUnlocked < 4) return false;
      const mineCost = BALANCE_CONFIG.abilities.safetyRadiusMineCost;
      if (player.mines < mineCost) return false;
      player.mines -= mineCost;
    }
    player.safetyRadius += 1;
    settings.mines = Math.min(settings.mines, Math.min(maxMineCount(), maxUnlockedMineCount()));
    abilityMessage = formatMessage("safetyInstalled", { value: safetySizeLabel(player.safetyRadius) });
  } else if (id === "chording") {
    if (player.chordingUnlocked || player.shovelTier < 3 || player.mines < BALANCE_CONFIG.abilities.chordingMineCost) return false;
    player.mines -= BALANCE_CONFIG.abilities.chordingMineCost;
    player.chordingUnlocked = true;
    abilityMessage = formatMessage("chordingUnlocked");
  } else return false;
  if (!roundStarted || gameOver) startGame();
  statusElement.textContent = abilityMessage;
  return true;
}

function buyPurchase(id) {
  const purchaseable = STORE_PURCHASEABLE_BY_ID[id];
  const purchased = performPurchase({
    registry: STORE_PURCHASEABLE_BY_ID,
    id,
    isAvailable: canPurchase,
    handlers: {
      supply: ({ targetId }) => purchaseSupply(targetId),
      upgrade: ({ targetId }) => purchaseUpgrade(targetId),
      ability: ({ targetId }) => purchaseAbility(targetId),
      equipment: ({ targetId }) => purchaseEquipment(targetId),
    },
  });
  if (!purchased) return;

  recordDeveloperEvent(developerTelemetry, { type: "purchase", id: purchaseable.telemetryId });
  render();
}

function maybeGrantEmergencyShovel(prefix = "") {
  const emergency = BALANCE_CONFIG.emergencyShovel;
  if (!emergency.enabled || player.emergencyShovelUsed || player.shovels > 0 || player.shovelUses > 0 || player.coins >= shovelSupplyCost()) return false;

  player.emergencyShovelUsed = true;
  player.shovels = 1;
  player.shovelUses = emergency.durability;
  emergencyHandoutNotice = true;
  const lead = prefix ? `${prefix} ` : "";
  emergencyHandoutStatus = formatMessage("emergency", {
    prefix: lead,
    count: emergency.durability,
    warning: emergency.warning,
  });
  statusElement.textContent = emergencyHandoutStatus;
  return true;
}

function resetProgress() {
  player = createStartingPlayer();
  flagPool = createFlagPool(BALANCE_CONFIG.capacity.flags[0], { regenIntervalMs: FLAG_CONFIG.regenerationIntervalMs });
  profile = createProfile({
    hints: player.hints,
    specialEquipment: player.specialEquipment,
    curios: player.curios,
    lifetimeStats: player.stats,
  });
  runMeta = createRun({ ordinal: 1 });
  preferences = { lastBoardSelection: { ...DEFAULT_SETTINGS }, speculationEnabled: false, riskThreshold: GAME_CONFIG.automation.defaultRiskThreshold, manualFlagReserve: 0 };
  developerTelemetry = createDeveloperTelemetry();
  clearStoredSaves();
  saveReady = true;
  player.messageBoard = {
    challenges: [],
    nextChallengeId: 1,
    nextChallengeInMs: randomChallengeDelayMs(),
  };
  settings = { ...DEFAULT_SETTINGS };
  currentMode = GAME_MODES.board;
  currentView = "board";
  currentBoardId = null;
  boardSessions = {};
  campProgression = createCampProgression(CAMP_CONFIG);
  district = null;
  selectedParcelId = null;
  workerState = createWorkerState(SPECIALISTS, player.specialists);
  contractInstances = {};
  nextBoardOrdinal = 1;
  nextContractInstanceOrdinal = 1;
  currentBoardState = null;
  autoMinersState = createAutoMinerState(SPECIALISTS, performance.now());
  contractModalElement.hidden = true;
  fieldClearModalElement.hidden = true;
  fieldSpecificationMenuElement.hidden = true;
  fieldSpecificationToggleButton.setAttribute("aria-expanded", "false");
  document.body.classList.remove("is-contract-running", "is-auto-miners");
  startGame();
  statusElement.textContent = formatMessage("progressReset");
  render();
}

function openRestructurePreview() {
  if (isRevealing || !contractModalElement.hidden || !fieldClearModalElement.hidden) return;
  const activeBoards = Object.values(boardSessions).filter((session) => ![BOARD_SESSION_STATUS.won, BOARD_SESSION_STATUS.lost].includes(session.status));
  restructureRunSummaryElement.innerHTML = [
    ["Highest mines", runMeta.currentHighScore?.score || 0],
    ["Coins earned", runMeta.stats.coinsEarned || 0],
    ["Mines recovered", runMeta.stats.minesRecovered || 0],
    ["Blueprints", runMeta.stats.blueprintsDiscovered || 0],
    ["Curios", runMeta.stats.curiosDiscovered || 0],
    ["Workers hired", runMeta.stats.workersHired || 0],
  ].map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("");
  restructureLostSummaryElement.textContent = `${activeBoards.length} active Board${activeBoards.length === 1 ? "" : "s"}, ${player.coins.toLocaleString()} coins, ${player.mines.toLocaleString()} mines, all supplies, upgrades, workers, Contracts, Challenges, Camp progress, and the District.`;
  restructureRetainedSummaryElement.innerHTML = [
    ["Blueprints", profile.blueprintLibrary.ownedIds.length],
    ["Curios", player.curios.reduce((sum, count) => sum + count, 0)],
    ["Hints", player.hints],
    ["Equipment", specialEquipmentTotal()],
    ["All-time High Score", profile.allTimeHighScore?.score || 0],
  ].map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("");
  restructureModalElement.hidden = false;
}

function performCorporateRestructure() {
  const retainedStats = { ...player.stats };
  const retainedHints = player.hints;
  const retainedEquipment = JSON.parse(JSON.stringify(player.specialEquipment));
  const retainedCurios = [...player.curios];
  const retainedManualFlagReserve = flagPool.manualFlagReserve;
  const result = restructureState({ profile, run: runMeta, boardSessions, createRunState: createRun });
  profile = result.profile;
  runMeta = result.run;
  player = createStartingPlayer();
  flagPool = createFlagPool(BALANCE_CONFIG.capacity.flags[0], {
    manualFlagReserve: retainedManualFlagReserve,
    regenIntervalMs: FLAG_CONFIG.regenerationIntervalMs,
  });
  preferences.manualFlagReserve = flagPool.manualFlagReserve;
  player.hints = retainedHints;
  player.specialEquipment = retainedEquipment;
  player.curios = retainedCurios;
  player.stats = retainedStats;
  player.contracts = createStartingContracts();
  player.messageBoard = createStartingMessageBoard();
  developerTelemetry = createDeveloperTelemetry();
  settings = { ...DEFAULT_SETTINGS };
  preferences.lastBoardSelection = { ...DEFAULT_SETTINGS };
  currentMode = GAME_MODES.board;
  currentView = "board";
  currentBoardId = null;
  boardSessions = {};
  campProgression = createCampProgression(CAMP_CONFIG);
  district = null;
  selectedParcelId = null;
  workerState = createWorkerState(SPECIALISTS, {});
  player.specialists = createStartingSpecialists();
  contractInstances = {};
  nextBoardOrdinal = 1;
  nextContractInstanceOrdinal = 1;
  currentBoardState = null;
  autoMinersState = createAutoMinerState(SPECIALISTS, performance.now());
  autoMinersState.speculationEnabled = preferences.speculationEnabled;
  autoMinersState.speculationInitialized = Boolean(preferences.speculationEnabled);
  autoMinersState.riskThreshold = preferences.riskThreshold;
  restructureModalElement.hidden = true;
  contractModalElement.hidden = true;
  fieldClearModalElement.hidden = true;
  fieldSpecificationMenuElement.hidden = true;
  fieldSpecificationToggleButton.setAttribute("aria-expanded", "false");
  document.body.classList.remove("is-contract-running", "is-auto-miners");
  startGame();
  statusElement.textContent = `Corporate Restructuring complete. Run ${runMeta.ordinal} has begun.`;
  render();
}

function switchToAutoMiners() {
  autoMineMenuOpen = !autoMineMenuOpen;
  render();
}

function createAutoMinersState() {
  return createAutoMinerState(SPECIALISTS, performance.now());
}

function tickAutoMiners() {
  if (!fieldClearModalElement.hidden) return;
  if (document.visibilityState === "hidden") return;
  if (!autoMinersState) {
    updateSurveyorUI();
    return;
  }
  const now = performance.now();
  let changed = false;

  changed = tickBoardOpeningSurveys(1000) || changed;

  autoMinersState.lastWorkerTickAt = now;
  changed = runWorkerInitiative("agents", now) || changed;
  changed = runWorkerInitiative("specialists", now) || changed;

  if (changed) render();
  updateSurveyorUI();
}

function updateSurveyorUI() {
  if (specialistLevel("surveyor") <= 0) {
    surveyorCountdownElement.textContent = "locked";
    return;
  }
  const activeSurvey = district && Object.values(district.parcelsById).find((parcel) => parcel.surveyStatus === SURVEY_STATES.inProgress);
  surveyorCountdownElement.textContent = activeSurvey ? formatClock(activeSurvey.surveyRemainingMs) : campProgression.phase === CAMP_PHASES.districtUnlocked ? "available" : "opening assist";
}

function surveyNow() {
  campProgression = debugScheduleCampDiscovery(campProgression, CAMP_CONFIG);
  statusElement.textContent = campProgression.phase === CAMP_PHASES.districtUnlocked
    ? "Districts are already unlocked."
    : "Camp Parcel discovery scheduled in five eligible boards.";
  render();
}

function automationTargetIds(workerId) {
  const typeId = workerTypeForId(workerId);
  return Object.values(boardSessions)
    .filter((session) => session.modeState && session.status === BOARD_SESSION_STATUS.committed)
    .filter((session) => {
      const mode = session.automation?.interactionMode || INTERACTION_MODES.manual;
      return typeId === "analyst" ? [INTERACTION_MODES.analyze, INTERACTION_MODES.assist].includes(mode) : mode === INTERACTION_MODES.assist;
    })
    .sort((left, right) => left.createdOrdinal - right.createdOrdinal)
    .map((session) => session.id);
}

function tickReusableFlags(deltaMs) {
  if (flagPool.missingFlags > 0) recordDeveloperEvent(developerTelemetry, { type: "missingFlagTime", count: deltaMs });
  const blockedFlagbearers = Object.values(autoMinersState?.workerTasks || {}).filter((task) => task.phase === "noFlags").length;
  if (blockedFlagbearers > 0) recordDeveloperEvent(developerTelemetry, { type: "flagbearerNoFlagsTime", count: deltaMs * blockedFlagbearers });
  const result = tickFlagRegeneration(
    flagPool,
    deltaMs,
    totalDeployedFlags(),
    FLAG_CONFIG.regenerationIntervalMs,
  );
  flagPool = result.pool;
  syncLegacyFlagStock();
  if (result.regenerated > 0) recordDeveloperEvent(developerTelemetry, { type: "flagsRegenerated", count: result.regenerated });
  updateQuartermaster();
  return result.regenerated > 0;
}

function tickBoardOpeningSurveys(deltaMs) {
  let changed = false;
  Object.values(boardSessions).forEach((session) => {
    const task = session.openingSurvey;
    if (!task || session.status !== BOARD_SESSION_STATUS.preview) return;
    task.remainingMs = Math.max(0, task.remainingMs - deltaMs);
    if (task.remainingMs > 0) return;
    if (currentView === "board" && currentBoardId === session.id) openCell(task.safeIndex, { automaticOpening: true });
    workerState = releaseWorkers(workerState, [task.workerId]);
    delete session.openingSurvey;
    changed = true;
  });
  return changed;
}

function cancelBoardOpeningSurvey(session = currentBoardSession()) {
  if (!session?.openingSurvey) return;
  workerState = releaseWorkers(workerState, [session.openingSurvey.workerId]);
  delete session.openingSurvey;
}

function automationModeState(boardId) {
  if (currentView === "board" && currentBoardId === boardId && roundStarted && !gameOver) return createModeState();
  return boardId ? boardSessions[boardId]?.modeState || null : null;
}

function workerTypeForId(workerId) {
  return workerState.workersById[workerId]?.typeId || workerId;
}

function runWorkerInitiative(group, now) {
  const order = autoMinersState.initiative[group] || [];
  let changed = false;
  order.forEach((typeId) => {
    if (!fieldClearModalElement.hidden) return;
    if (typeId === "surveyor" || specialistLevel(typeId) <= 0) return;
    boardAutomationWorkers(typeId).forEach((worker) => {
      autoMinersState.workerTargets[worker.id] ??= null;
      changed = advanceWorkerTurn(worker.id, now) || changed;
    });
  });
  return changed;
}

function boardAutomationWorkers(typeId) {
  return Object.values(workerState.workersById)
    .filter((worker) => worker.typeId === typeId)
    .filter((worker) => worker.status === "AVAILABLE" || worker.assignment?.type === "BOARD_AUTOMATION")
    .sort((left, right) => left.number - right.number);
}

function advanceWorkerTurn(id, now) {
  const task = autoMinersState.workerTasks[id];
  if (!task) return beginWorkerTurn(id, now);
  if (!boardSessions[task.boardId]?.modeState || !automationTargetIds(id).includes(task.boardId)) {
    autoMinersState.workerTargets[id] = nextWorkerTarget(id, task.boardId);
    delete autoMinersState.workerTasks[id];
    return true;
  }

  const workingActiveBoard = currentView === "board" && currentBoardId === task.boardId;
  const visibleState = workingActiveBoard ? null : createModeState();
  const visibleBoardId = currentBoardId;
  const visibleView = currentView;
  const restoreVisibleBoard = () => {
    if (workingActiveBoard) return;
    currentBoardId = visibleBoardId;
    currentView = visibleView;
    loadModeState(visibleState);
    syncLegacyActiveContract();
  };
  if (!workingActiveBoard) {
    currentBoardId = task.boardId;
    loadModeState(boardSessions[task.boardId].modeState);
  }
  let resolved = false;

  if (task.phase === "noFlags") {
    const target = board[task.cursorIndex];
    if (!revalidateWorkerTask(id, task, target)) {
      delete autoMinersState.workerTasks[id];
      restoreVisibleBoard();
      return true;
    }
    if (workerUsableFlags(flagPool) <= 0) {
      restoreVisibleBoard();
      return false;
    }
    const session = boardSessions[task.boardId];
    const existing = session.automation.reservations[target.index];
    const reservation = existing?.workerId === id
      ? { ok: true, state: session.automation }
      : reserveTarget(session.automation, target.index, id, task.proof?.id || task.proof?.type);
    session.automation = reservation.state;
    if (!reservation.ok) {
      delete autoMinersState.workerTasks[id];
      restoreVisibleBoard();
      return true;
    }
    task.phase = "analyzing";
    task.phaseStartedAt = now;
    autoMinersState.statusText = "A company flag is available. Flagbearer work resumed.";
    restoreVisibleBoard();
    return true;
  }

  if (task.phase === "scanning") {
    if (task.nextScanAt && now + WORKER_TIMER_TOLERANCE_MS < task.nextScanAt) {
      restoreVisibleBoard();
      return false;
    }
    const cell = board[task.cursorIndex];
    if (!cell) {
      autoMinersState.workerTargets[id] = nextWorkerTarget(id, task.boardId);
      delete autoMinersState.workerTasks[id];
      restoreVisibleBoard();
      return true;
    }
    const targetState = workingActiveBoard ? null : boardSessions[task.boardId].modeState;
    if (targetState) {
      targetState.workerCursors ||= {};
      targetState.workerCursors[id] = cell.index;
    }
    const proof = workerProofForCell(id, cell);
    if (proof) {
      const session = boardSessions[task.boardId];
      if (workerTypeForId(id) === "analyst") {
        task.phase = "analyzing";
        task.phaseStartedAt = now;
        task.proof = proof;
        task.revision = session.automation.mutationRevision;
      } else if (workerTypeForId(id) === "flagbearer" && workerUsableFlags(flagPool) <= 0) {
        task.phase = "noFlags";
        task.proof = proof;
        task.revision = session.automation.mutationRevision;
        task.noFlagsStartedAt ||= Date.now();
        autoMinersState.statusText = "No Flags: a mine is proved, but no worker-usable company flags remain.";
        recordDeveloperEvent(developerTelemetry, { type: "manualReserveBlockedFlagbearer" });
      } else {
        const reservation = reserveTarget(session.automation, cell.index, id, proof.id || proof.blueprintId || proof.type);
        session.automation = reservation.state;
        if (reservation.ok) {
          task.phase = "analyzing";
          task.phaseStartedAt = now;
          task.proof = proof;
          task.revision = session.automation.mutationRevision;
        } else {
          continueWorkerScan(task, cell, now);
        }
      }
    } else if (task.stepsScanned + 1 >= task.scanOrder.length) {
      autoMinersState.workerTargets[id] = nextWorkerTarget(id, task.boardId);
      delete autoMinersState.workerTasks[id];
      const pending = Object.entries(autoMinersState.workerTasks).some(([otherId, other]) => otherId !== id && other.boardId === task.boardId);
      if (!pending) {
        setBoardStalled(task.boardId);
        maybeExecuteSpeculation(task.boardId);
      }
    } else {
      task.stepsScanned += 1;
      task.cursorIndex = task.scanOrder[(task.startOffset + task.stepsScanned) % task.scanOrder.length];
      task.nextScanAt = now + workerScanDurationMs(cell);
    }
  } else if (now - task.phaseStartedAt >= workerRoundDurationMs(id)) {
    const target = board[task.cursorIndex];
    if (revalidateWorkerTask(id, task, target)) {
      if (workerTypeForId(id) === "flagbearer" && workerUsableFlags(flagPool) <= 0) {
        task.phase = "noFlags";
        task.noFlagsStartedAt ||= Date.now();
        autoMinersState.statusText = "No Flags: a mine is proved, but no worker-usable company flags remain.";
        recordDeveloperEvent(developerTelemetry, { type: "manualReserveBlockedFlagbearer" });
      } else if (performWorkerAction(id, target) !== false) {
        continueWorkerScan(task, target, now);
      } else {
        delete autoMinersState.workerTasks[id];
      }
    } else {
      delete autoMinersState.workerTasks[id];
    }
    resolved = hasWon();
    if (resolved) delete autoMinersState.workerTasks[id];
  }

  if (resolved) {
    winGame();
  } else if (!workingActiveBoard) {
    const nextState = createModeState();
    nextState.workerCursors = boardSessions[task.boardId]?.modeState?.workerCursors || {};
    if (boardSessions[task.boardId]) {
      boardSessions[task.boardId].modeState = nextState;
    }
  }
  restoreVisibleBoard();
  return true;
}

function beginWorkerTurn(id, now) {
  const targets = automationTargetIds(id);
  let targetId = autoMinersState.workerTargets[id] || targets[0] || null;
  if (!targets.includes(targetId)) targetId = targets[0] || null;
  autoMinersState.workerTargets[id] = targetId;
  const field = automationModeState(targetId);
  const worker = workerState.workersById[id];
  if (!field) {
    if (worker?.assignment?.type === "BOARD_AUTOMATION") {
      worker.status = "AVAILABLE";
      worker.assignment = null;
      return true;
    }
    return false;
  }
  worker.status = "ASSIGNED";
  worker.assignment = { type: "BOARD_AUTOMATION", boardId: targetId };
  const order = scanOrderForSettings(id, field.settings);
  const cursor = field.workerCursors?.[id];
  const startOffset = Math.max(0, order.indexOf(cursor));
  autoMinersState.workerTasks[id] = {
    id,
    typeId: workerTypeForId(id),
    targetId,
    boardId: targetId,
    phase: "scanning",
    cursorIndex: order[startOffset],
    scanOrder: order,
    startOffset,
    stepsScanned: 0,
    nextScanAt: now,
    startedAt: now,
  };
  return true;
}

function nextWorkerTarget(workerId, targetId) {
  const targets = automationTargetIds(workerId);
  if (!targets.length) return null;
  const index = targets.indexOf(targetId);
  return targets[(index + 1 + targets.length) % targets.length];
}

function scanOrder(id) {
  if (id === "excavator") return board.map((cell) => cell.index);
  const order = [];
  for (let col = 0; col < settings.cols; col += 1) {
    for (let row = settings.rows - 1; row >= 0; row -= 1) order.push(row * settings.cols + col);
  }
  return order;
}

function scanOrderForSettings(id, fieldSettings) {
  if (workerTypeForId(id) === "excavator") return Array.from({ length: fieldSettings.rows * fieldSettings.cols }, (_, index) => index);
  const order = [];
  for (let col = 0; col < fieldSettings.cols; col += 1) {
    for (let row = fieldSettings.rows - 1; row >= 0; row -= 1) order.push(row * fieldSettings.cols + col);
  }
  return order;
}

function workerProofForCell(id, cell) {
  if (cell.open || cell.flagged) return null;
  const typeId = workerTypeForId(id);
  const session = currentBoardSession();
  if (typeId === "analyst") {
    const blueprintIds = workerState.workersById[id]?.blueprintIds || [];
    for (const blueprintId of blueprintIds) {
      const finding = matchBlueprint(board, settings, blueprintId)
        .find((entry) => entry.conclusions.some((item) => item.index === cell.index));
      if (finding) return {
        ...finding,
        id: `${blueprintId}:${finding.orientation}:${finding.conclusions.map((item) => item.index).join("-")}`,
        targetIndexes: finding.conclusions.map((item) => item.index),
        conclusionType: "mixed",
      };
    }
    return null;
  }
  const advanced = (session?.automation?.findings || []).find((finding) =>
    finding.blueprintId && finding.revision === session.automation.mutationRevision
      && finding.targetIndexes.includes(cell.index)
      && finding.conclusionType === (typeId === "excavator" ? "safe" : "mine"));
  if (advanced) return advanced;
  if (typeId === "excavator") {
    return availableFlagSatisfiedSafeProofs(board, settings).find((proof) => proof.targetIndexes.includes(cell.index)) || null;
  }
  return availableProofs(board, settings).find((proof) => ["provenMine", "completeTheCountMine"].includes(proof.type) && proof.targetIndexes.includes(cell.index)) || null;
}

function workerRoundDurationMs(id) {
  return Math.round(WORKER_ROUND_MS / Math.max(1, workerState.workersById[id]?.level || 1));
}

function workerScanDurationMs(cell) {
  return cell.open || cell.flagged ? WORKER_OPEN_SCAN_STEP_MS : WORKER_SCAN_STEP_MS;
}

function continueWorkerScan(task, cell, now) {
  const currentOffset = task.scanOrder.indexOf(cell.index);
  const nextOffset = (currentOffset + 1) % task.scanOrder.length;
  task.phase = "scanning";
  task.cursorIndex = task.scanOrder[nextOffset];
  task.startOffset = nextOffset;
  task.stepsScanned = 0;
  task.nextScanAt = now + workerScanDurationMs(cell);
  delete task.phaseStartedAt;
  delete task.proof;
}

function performWorkerAction(id, target) {
  const typeId = workerTypeForId(id);
  if (typeId === "analyst") {
    const task = autoMinersState.workerTasks[id];
    const session = boardSessions[task.boardId];
    const finding = task.proof;
    finding.conclusions.forEach((conclusion) => {
      session.automation.findings.push({
        id: `${finding.id}:${conclusion.index}`,
        revision: session.automation.mutationRevision,
        blueprintId: finding.blueprintId,
        orientation: finding.orientation,
        evidenceIndexes: [...finding.evidenceIndexes],
        targetIndexes: [conclusion.index],
        conclusionType: conclusion.type,
      });
    });
    session.automation.stalled = false;
    autoMinersState.statusText = `Analyst recorded a ${finding.blueprintId} finding.`;
    return;
  }
  if (typeId === "excavator") {
    recordBoardAction({
      actor: "worker",
      specialistId: typeId,
      actionType: "dig",
      cell: target,
      result: { outcome: "opened", revealedTiles: revealWavesFrom(target).flat().filter((cell) => !cell.mine).map((cell) => cell.index) },
    });
    revealAutoCell(target);
  } else {
    if (target.flagged || !flagAutoCell(target)) return false;
    recordBoardAction({ actor: "worker", specialistId: typeId, actionType: "flag", cell: target, result: { outcome: "flag_placed" } });
  }
  markBoardMutation();
  const worker = SPECIALISTS.find((item) => item.id === typeId);
  autoMinersState.statusText = `${worker.name} acted on ${taskBoardLabel(autoMinersState.workerTasks[id])}.`;
}

function revalidateWorkerTask(id, task, target) {
  const session = boardSessions[task.boardId];
  if (!session || session.automation.mutationRevision !== task.revision || !target || target.open || target.flagged) return false;
  const typeId = workerTypeForId(id);
  const mode = session.automation.interactionMode;
  if (typeId === "analyst") return [INTERACTION_MODES.analyze, INTERACTION_MODES.assist].includes(mode) && Boolean(workerProofForCell(id, target));
  if (mode !== INTERACTION_MODES.assist) return false;
  return Boolean(workerProofForCell(id, target));
}

function maybeExecuteSpeculation(boardId) {
  const session = boardSessions[boardId];
  if (!session?.automation?.stalled || !autoMinersState.speculationEnabled || session.automation.interactionMode !== INTERACTION_MODES.assist) return false;
  const targets = estimateSpeculativeTargets(board, settings);
  const target = targets[0];
  if (!target || target.risk > autoMinersState.riskThreshold) return false;
  const cost = speculationCost(settings, session.automation.speculativeGuessCount, GAME_CONFIG.automation.speculation);
  if (player.coins < cost) {
    session.automation.stallReason = "insufficient-coins";
    return false;
  }
  player.coins -= cost;
  session.automation.speculativeGuessCount += 1;
  const cell = board[target.index];
  recordBoardAction({ actor: "worker", specialistId: "speculation", actionType: "estimated-dig", cell, result: { outcome: cell.mine ? "mine_hit" : "opened", estimatedRisk: target.risk, cost } });
  if (cell.mine) {
    cell.open = true;
    markBoardMutation(boardId);
    loseGame();
  } else {
    revealAutoCell(cell);
    markBoardMutation(boardId);
    if (hasWon()) winGame();
  }
  return true;
}

function taskBoardLabel(task) {
  if (!task || task.boardId === currentBoardId) return "the current Board";
  const session = boardSessions[task.boardId];
  const parcel = session?.parcelId ? district?.parcelsById?.[session.parcelId] : null;
  return parcel ? parcelDisplayName(district, parcel) : "an Active Parcel";
}

function flagAutoCell(cell) {
  if (!cell || cell.open || cell.flagged) return false;
  const deployment = deployCompanyFlag({ worker: true, cell });
  if (!deployment.ok) return false;
  cell.flagged = true;
  cell.flaggedByPlayer = false;
  cell.flaggedByWorker = true;
  flagsPlaced += 1;
  roundFlagPlacements += 1;
  recordDeveloperEvent(developerTelemetry, { type: "automaticFlagPlaced" });
  refreshProofMetadata(board, settings);
  return true;
}

function encodeWorkerTasks(tasks = {}, now) {
  return Object.fromEntries(Object.entries(tasks).map(([id, task]) => {
    const encoded = {
      ...task,
      phaseElapsedMs: task.phaseStartedAt ? Math.max(0, now - task.phaseStartedAt) : 0,
      scanRemainingMs: task.nextScanAt ? Math.max(0, task.nextScanAt - now) : 0,
    };
    delete encoded.phaseStartedAt;
    delete encoded.nextScanAt;
    delete encoded.startedAt;
    return [id, encoded];
  }));
}

function decodeWorkerTasks(tasks = {}, now) {
  return Object.fromEntries(Object.entries(tasks || {}).map(([id, task]) => {
    const decoded = { ...task };
    if (decoded.phase !== "scanning") decoded.phaseStartedAt = now - (decoded.phaseElapsedMs || 0);
    if (decoded.phase === "scanning") decoded.nextScanAt = now + (decoded.scanRemainingMs || 0);
    delete decoded.phaseElapsedMs;
    delete decoded.scanRemainingMs;
    return [id, decoded];
  }));
}

function workerMarkersForCell(index) {
  if (!autoMinersState?.workerTasks) return [];
  return Object.entries(autoMinersState.workerTasks)
    .filter(([, task]) => task.boardId === currentBoardId && task.cursorIndex === index)
    .map(([id, task]) => ({ id, task, name: `${SPECIALISTS.find((worker) => worker.id === workerTypeForId(id))?.name || id} ${workerState.workersById[id]?.number || ""}`.trim() }));
}

function workerTaskStage(task) {
  if (task.phase === "noFlags") return "No Flags";
  if (task.phase === "scanning") return "Scanning";
  return performance.now() - task.phaseStartedAt < workerRoundDurationMs(task.id) / 3 ? "Analyzing" : "Planning action";
}

function workerTaskLabel(task) {
  if (task.phase === "noFlags") return "No Flags";
  if (task.phase === "scanning") return "Scanning";
  const stage = workerTaskStage(task);
  if (stage === "Analyzing") return stage;
  return workerTypeForId(task.id) === "excavator" ? "Excavating Safe Tile" : "Flagging Mine";
}

function createWorkerMarker(button, worker, workerType) {
  const marker = document.createElement("span");
  marker.className = `worker-cursor worker-cursor--${workerType}`;
  marker.dataset.workerId = worker.id;
  marker.setAttribute("aria-hidden", "true");

  const ring = document.createElement("span");
  ring.className = "worker-cursor__ring";
  const label = document.createElement("span");
  label.className = "worker-cursor__label";
  label.textContent = workerType === "excavator" ? "E" : "F";
  marker.append(ring, label);

  marker.addEventListener("pointerenter", (event) => {
    const current = workerMarkerData.get(marker);
    if (!current || current.worker.task.phase === "scanning") return;
    showWorkerTooltip(current.worker, current.workerType, event);
  });
  marker.addEventListener("pointerleave", hideWorkerTooltip);
  button.append(marker);
  return marker;
}

function syncWorkerMarker(marker, worker, workerType) {
  const { task } = worker;
  workerMarkerData.set(marker, { worker, workerType });

  const pending = task.phase !== "scanning";
  marker.classList.toggle("is-pending", pending);
  // The rich tooltip replaces the native one while an action is pending.
  marker.title = pending ? "" : `${worker.name}: ${workerTaskLabel(task)}`;

  const ring = marker.querySelector(".worker-cursor__ring");
  const phaseKey = pending ? String(task.phaseStartedAt) : "";
  if (ring.dataset.phaseKey === phaseKey) return;
  ring.dataset.phaseKey = phaseKey;
  if (!pending) {
    ring.style.animationDuration = "";
    ring.style.animationDelay = "";
    return;
  }
  // A negative delay starts the ring at the elapsed part of the round, so a marker
  // built mid-round (or restored from a save) picks the fill up where it stands.
  ring.style.animationDuration = `${workerRoundDurationMs(task.id)}ms`;
  ring.style.animationDelay = `${Math.min(0, task.phaseStartedAt - performance.now())}ms`;
}

function workerTooltipMarkup(worker, workerType) {
  const { task } = worker;
  if (task.phase === "noFlags") {
    return `<strong>${worker.name}: NO FLAGS</strong><span>A mine has been proved, but no worker-usable flags remain. Return, replace, regenerate, or release a reserved flag.</span>`;
  }
  const remainingSeconds = Math.max(0, Math.ceil((workerRoundDurationMs(task.id) - (performance.now() - task.phaseStartedAt)) / 1000));
  const countdown = `<span class="worker-tooltip__countdown">${remainingSeconds}s</span>`;
  if (workerTaskStage(task) === "Analyzing") {
    return `<strong>${worker.name}: ANALYZING</strong><span>Checking the current clue.</span>${countdown}`;
  }
  const proof = task.proof;
  const clue = board[proof?.clueIndex];
  if (!proof || !clue) return null;
  return `
    <strong>${worker.name}: ${workerType === "excavator" ? "EXCAVATING SAFE TILE" : "FLAGGING MINE"}</strong>
    <span>${proof.type === "flagSatisfiedClueSafe" ? "Placed flags satisfy this clue." : "The remaining hidden tiles complete this clue."}</span>
    ${countdown}
    <div class="proof-diagram" aria-label="Proof centered on row ${clue.row + 1}, column ${clue.col + 1}">${renderProofCells(clue, task, proof)}</div>
  `;
}

function showWorkerTooltip(worker, workerType, event) {
  if (!workerTooltipElement) return;
  workerTooltipState = { workerId: worker.id, worker, workerType, pinned: false, x: event.clientX, y: event.clientY };
  updateWorkerTooltip(worker, workerType);
}

function updateWorkerTooltip(worker, workerType) {
  if (!workerTooltipElement || !workerTooltipState) return;
  const markup = workerTooltipMarkup(worker, workerType);
  if (!markup) return;
  workerTooltipState.worker = worker;
  workerTooltipState.workerType = workerType;
  workerTooltipElement.innerHTML = markup;
  workerTooltipElement.hidden = false;
  positionWorkerTooltip(workerTooltipState.x, workerTooltipState.y);
}

function positionWorkerTooltip(x, y) {
  if (!workerTooltipElement) return;
  workerTooltipElement.style.left = "0px";
  workerTooltipElement.style.top = "0px";
  const { width, height } = workerTooltipElement.getBoundingClientRect();
  const edgePadding = 8;
  const left = Math.max(edgePadding, Math.min(x + 14, window.innerWidth - width - edgePadding));
  const below = y + 18;
  const top = below + height <= window.innerHeight - edgePadding
    ? below
    : Math.max(edgePadding, y - height - 14);
  workerTooltipElement.style.left = `${left}px`;
  workerTooltipElement.style.top = `${top}px`;
}

function hideWorkerTooltip() {
  if (!workerTooltipElement) return;
  workerTooltipState = null;
  workerTooltipElement.hidden = true;
  workerTooltipElement.innerHTML = "";
}

function showQuartermasterTooltip(source) {
  if (!quartermasterTooltipElement || !source?.dataset.tooltip) return;
  quartermasterTooltipSource = source;
  quartermasterTooltipElement.textContent = source.dataset.tooltip;
  quartermasterTooltipElement.hidden = false;
  positionQuartermasterTooltip();
}

function positionQuartermasterTooltip() {
  if (!quartermasterTooltipElement || !quartermasterTooltipSource) return;
  const sourceRect = quartermasterTooltipSource.getBoundingClientRect();
  const viewportPadding = 8;

  if (sourceRect.bottom < 0 || sourceRect.top > window.innerHeight) {
    hideQuartermasterTooltip();
    return;
  }

  quartermasterTooltipElement.style.left = "0px";
  quartermasterTooltipElement.style.top = "0px";
  const tooltipRect = quartermasterTooltipElement.getBoundingClientRect();
  const left = clamp(
    sourceRect.left + sourceRect.width / 2 - tooltipRect.width / 2,
    viewportPadding,
    Math.max(viewportPadding, window.innerWidth - tooltipRect.width - viewportPadding),
  );
  const preferredTop = sourceRect.top - tooltipRect.height - 10;
  const top = preferredTop >= viewportPadding
    ? preferredTop
    : Math.min(window.innerHeight - tooltipRect.height - viewportPadding, sourceRect.bottom + 10);

  quartermasterTooltipElement.style.left = `${left}px`;
  quartermasterTooltipElement.style.top = `${Math.max(viewportPadding, top)}px`;
}

function hideQuartermasterTooltip() {
  if (!quartermasterTooltipElement) return;
  quartermasterTooltipSource = null;
  quartermasterTooltipElement.hidden = true;
  quartermasterTooltipElement.textContent = "";
}

function showWorkerCompletionTooltip() {
  if (!workerTooltipElement || !workerTooltipState) return;
  workerTooltipElement.innerHTML = `
    <strong>${workerTooltipState.worker.name}: COMPLETE</strong>
    <span>Action complete.</span>
  `;
  workerTooltipElement.hidden = false;
  positionWorkerTooltip(workerTooltipState.x, workerTooltipState.y);
}

function renderProofCells(clue, task, proof) {
  const targetIndexes = new Set(proof.targetIndexes);
  const cells = [];
  for (let row = clue.row - 1; row <= clue.row + 1; row += 1) {
    for (let col = clue.col - 1; col <= clue.col + 1; col += 1) {
      const cell = row < 0 || col < 0 || row >= settings.rows || col >= settings.cols ? null : board[row * settings.cols + col];
      if (!cell) {
        cells.push('<span class="proof-cell is-void"></span>');
      } else if (cell.index === clue.index) {
        cells.push(`<span class="proof-cell is-clue">${cell.adjacent}</span>`);
      } else if (cell.index === task.cursorIndex) {
        cells.push(`<span class="proof-cell is-target">${task.typeId === "excavator" ? "✓" : "⚑"}</span>`);
      } else if (cell.flagged) {
        cells.push('<span class="proof-cell is-flag">⚑</span>');
      } else if (targetIndexes.has(cell.index)) {
        cells.push('<span class="proof-cell is-proof-target">□</span>');
      } else if (cell.open) {
        cells.push(`<span class="proof-cell is-open">${cell.adjacent || "·"}</span>`);
      } else {
        cells.push('<span class="proof-cell">□</span>');
      }
    }
  }
  return cells.join("");
}

function revealAutoCell(startCell) {
  const waves = revealWavesFrom(startCell);
  const opened = new Set();
  waves.flat().forEach((cell) => {
    if (cell.open || cell.flagged || cell.mine) return;
    cell.open = true;
    opened.add(cell.index);
    player.stats.safeTilesDug += 1;
    collectCellFinds(cell);
  });
  recentlyRevealed = opened;
  refreshProofMetadata(board, settings);
  markBoardMutation();
  window.setTimeout(() => {
    recentlyRevealed.clear();
    render();
  }, 220);
}

function specialistLevel(id) {
  return Math.max(0, workerState?.workerTypes?.[id]?.level ?? player.specialists?.[id] ?? 0);
}

function surveyorSafetyRadius() {
  const level = specialistLevel("surveyor");
  if (level >= 20) return 2;
  if (level >= 10) return 1;
  return 0;
}

function surveyorIntervalMs() {
  return calculateSurveyorIntervalMs(specialistLevel("surveyor"));
}

function updateModeUI() {
  districtButton.classList.toggle("is-active", currentView === "district");
  autoMinersButton.classList.toggle("is-active", autoMineMenuOpen);
  quartermasterPanelElement.setAttribute("aria-label", autoMineMenuOpen ? "Auto Mine shop and worker settings" : "Quartermaster inventory and store");
  specialistsPanelElement.hidden = !autoMineMenuOpen;
  document.body.classList.toggle("is-auto-miners", autoMineMenuOpen);
  if (!autoMineMenuOpen) return;

  autoMineFieldElement.textContent = String(activeParcels(district).length);
  const surveyorLevel = specialistLevel("surveyor");
  specialistNoteElement.textContent = surveyorLevel > 0
    ? campProgression.phase === CAMP_PHASES.districtUnlocked
      ? `Surveyors are assigned to Unknown Parcels. Survey time: ${formatClock(surveyorIntervalMs())}.`
      : `Surveyor replaces first-click safety. Starting area: ${surveyorSafetyRadius() === 2 ? "5x5" : surveyorSafetyRadius() === 1 ? "3x3" : "1 tile"}.`
    : "Hire a Surveyor to assist Camp discovery and later survey Unknown Parcels.";
  renderSurveyorCard();
  renderAutomationModeList();
  renderWorkerList(agentListElement, "agents");
  renderWorkerList(specialistListElement, "specialists");
  renderBlueprintLibrary();
  renderInterventionFeed();
  speculationEnabledElement.checked = Boolean(autoMinersState.speculationEnabled);
  speculationThresholdElement.value = String(Math.round((autoMinersState.riskThreshold || GAME_CONFIG.automation.defaultRiskThreshold) * 100));
  speculationThresholdValueElement.textContent = `${speculationThresholdElement.value}%`;
  manualFlagReserveElement.max = String(flagPool.maximumFlags);
  manualFlagReserveElement.value = String(flagPool.manualFlagReserve);
  manualFlagReserveValueElement.textContent = String(flagPool.manualFlagReserve);
  workerUsableFlagsElement.textContent = `Worker-usable now: ${workerUsableFlags(flagPool)}`;
}

function renderBlueprintLibrary() {
  const owned = new Set(profile.blueprintLibrary.ownedIds);
  blueprintCountElement.textContent = `${owned.size} / ${BLUEPRINTS.length}`;
  blueprintLibraryElement.innerHTML = BLUEPRINTS.map((blueprint) => `<article class="blueprint-card ${owned.has(blueprint.id) ? "is-owned" : "is-locked"}">
    <strong>${owned.has(blueprint.id) ? blueprint.name : "? ? ?"}</strong>
    <span>${owned.has(blueprint.id) ? blueprint.conclusions.map((type) => type === "mine" ? "✹" : "◇").join(" ") : "Undiscovered"}</span>
    <small>${owned.has(blueprint.id) ? "Rotations and reflections recognized" : "Discover on a Parcel Board"}</small>
  </article>`).join("");
}

function renderInterventionFeed() {
  const entries = deriveInterventionQueue(boardSessions, currentBoardId, Date.now(), autoMinersState.interventionSnoozes);
  interventionCountElement.textContent = String(entries.length);
  interventionFeedElement.innerHTML = entries.length ? entries.map((entry) => `<article class="intervention-entry">
    <strong>${entry.category.replaceAll("_", " ")}</strong><span>${entry.cols}×${entry.rows} · ${entry.mines} mines</span><small>${entry.reason}</small>
    <div><button type="button" data-intervention-board="${entry.boardId}">OPEN</button><button type="button" data-snooze-board="${entry.boardId}">SNOOZE 5M</button></div>
  </article>`).join("") : "<p>No stalled background Boards.</p>";
  interventionFeedElement.querySelectorAll("[data-intervention-board]").forEach((button) => button.addEventListener("click", () => switchToBoardSession(button.dataset.interventionBoard)));
  interventionFeedElement.querySelectorAll("[data-snooze-board]").forEach((button) => button.addEventListener("click", () => {
    autoMinersState.interventionSnoozes = snoozeIntervention(autoMinersState.interventionSnoozes, button.dataset.snoozeBoard, Date.now() + 300000);
    render();
  }));
}

function renderSurveyorCard() {
  renderWorkerRoles(surveyorCardElement, ["surveyor"]);
}

function renderWorkerList(element, group) {
  renderWorkerRoles(element, autoMinersState.initiative[group]);
}

function renderWorkerRoles(element, roleIds) {
  element.innerHTML = roleIds.map((id) => {
    const definition = SPECIALISTS.find((item) => item.id === id);
    const available = id === "surveyor"
      || (["excavator", "flagbearer"].includes(id) && specialistLevel("surveyor") > 0)
      || (id === "analyst" && profile.blueprintLibrary.ownedIds.length > 0);
    const hireCost = nextWorkerHireCost(definition, workerState.workerTypes[id]);
    const workers = Object.values(workerState.workersById).filter((worker) => worker.typeId === id).sort((a, b) => a.number - b.number);
    const workerCards = workers.map((worker) => {
      const analyst = id === "analyst";
      const upgradeCost = analyst
        ? workerUpgradeCost(definition, worker, { baseCost: GAME_CONFIG.automation.analyst.upgradeMineCost, growth: GAME_CONFIG.automation.analyst.upgradeGrowth })
        : workerUpgradeCost(definition, worker);
      const currency = analyst ? "mines" : definition.currency;
      const affordable = player[currency] >= upgradeCost;
      const capacity = analyst && worker.level >= GAME_CONFIG.blueprints.secondSlotLevel ? 2 : 1;
      const assignments = analyst ? Array.from({ length: capacity }, (_, slot) => blueprintAssignmentSelect(worker, slot)).join("") : "";
      return `<article class="specialist-card is-active" data-worker-instance="${worker.id}">
        <div class="specialist-card__topline"><strong>${definition.name} ${worker.number}</strong><b>LV ${worker.level}</b></div>
        <p>${worker.status === "ASSIGNED" ? `Assigned: ${worker.assignment?.type || "work"}` : "Available"}</p>
        ${assignments}
        <button class="worker-buy" type="button" data-worker-upgrade="${worker.id}" ${affordable ? "" : "disabled"}>UPGRADE ${currency === "coins" ? formatCurrency(upgradeCost) : `${upgradeCost} MINES`}</button>
      </article>`;
    }).join("");
    const canHire = available && player[definition.currency] >= hireCost;
    return `<article class="specialist-card ${available ? "is-available" : "is-locked"}">
      <div class="specialist-card__topline"><strong>${definition.name}</strong><b>${workers.length} HIRED</b></div>
      <p>${definition.task}</p>
      <button class="worker-buy" type="button" data-worker-hire-extra="${id}" ${canHire ? "" : "disabled"}>HIRE ${definition.currency === "coins" ? formatCurrency(hireCost) : `${hireCost} MINES`}</button>
    </article>${workerCards}`;
  }).join("");
  element.querySelectorAll("[data-worker-hire-extra]").forEach((button) => button.addEventListener("click", () => dispatchGameAction("autoMiners/hireExtra", { id: button.dataset.workerHireExtra })));
  element.querySelectorAll("[data-worker-upgrade]").forEach((button) => button.addEventListener("click", () => dispatchGameAction("autoMiners/upgrade", { workerId: button.dataset.workerUpgrade })));
  element.querySelectorAll("[data-blueprint-assignment]").forEach((select) => select.addEventListener("change", () => updateAnalystBlueprints(select.dataset.workerId)));
}

function blueprintAssignmentSelect(worker, slot) {
  const options = [`<option value="">Unassigned</option>`, ...profile.blueprintLibrary.ownedIds.map((id) => {
    const item = BLUEPRINTS.find((blueprint) => blueprint.id === id);
    return `<option value="${id}" ${worker.blueprintIds?.[slot] === id ? "selected" : ""}>${item?.name || id}</option>`;
  })];
  return `<select class="blueprint-assignment" data-blueprint-assignment="${slot}" data-worker-id="${worker.id}">${options.join("")}</select>`;
}

function updateAnalystBlueprints(workerId) {
  const selects = [...document.querySelectorAll(`[data-worker-id="${workerId}"]`)];
  const ids = selects.map((select) => select.value).filter(Boolean);
  workerState = assignBlueprints(workerState, workerId, ids, GAME_CONFIG.blueprints.secondSlotLevel);
  delete autoMinersState.workerTasks[workerId];
  render();
}

function workerCost(worker) {
  return calculateWorkerCost(worker, specialistLevel(worker.id));
}

function formatWorkerCost(worker, cost) {
  return worker.currency === "coins" ? `HIRE ${formatCurrency(cost)}` : `HIRE ${cost} MINE${cost === 1 ? "" : "S"}`;
}

function buyWorker(id) {
  buyAdditionalWorker(id);
}

function buyAdditionalWorker(id) {
  const definition = SPECIALISTS.find((item) => item.id === id);
  const available = definition?.id === "surveyor"
    || (["excavator", "flagbearer"].includes(definition?.id) && specialistLevel("surveyor") > 0)
    || (definition?.id === "analyst" && profile.blueprintLibrary.ownedIds.length > 0);
  if (!definition || !available) return;
  const cost = nextWorkerHireCost(definition, workerState.workerTypes[id]);
  const currency = definition.currency === "coins" ? "coins" : "mines";
  if (player[currency] < cost) return;
  player[currency] -= cost;
  const result = hireWorker(workerState, definition);
  workerState = result.state;
  player.specialists[id] = specialistLevel(id);
  runMeta.stats.workersHired += 1;
  autoMinersState.statusText = `${workerLabel(workerState.workersById[result.workerId])} hired for ${cost}.`;
  render();
}

function enableInitiativeDrag(element, group) {
  let draggedId = null;
  element.querySelectorAll("[data-worker-id]").forEach((card) => {
    card.addEventListener("dragstart", () => { draggedId = card.dataset.workerId; });
    card.addEventListener("dragover", (event) => event.preventDefault());
    card.addEventListener("drop", (event) => {
      event.preventDefault();
      const targetId = card.dataset.workerId;
      if (!draggedId || draggedId === targetId) return;
      dispatchGameAction("autoMiners/reorder", { group, draggedId, targetId });
    });
  });
}

function updateQuartermaster() {
  const tier = currentShovel();
  const shovelCost = shovelSupplyCost();
  const flagsCost = flagSupplyCost();
  const steelUnlocked = player.shovelTier >= 3;
  const mineTooltip = steelUnlocked ? COPY_CONFIG.tooltips.minesUnlocked : COPY_CONFIG.tooltips.minesLocked;
  if (player.mines > 0) player.specialEquipmentUnlocked = true;

  coinCountElement.textContent = formatCurrency(player.coins);
  shovelCountElement.textContent = String(player.shovels).padStart(2, "0");
  shovelUsesElement.textContent = `${player.shovelUses} digs`;
  const deployed = totalDeployedFlags();
  flagStockElement.textContent = String(flagPool.availableFlags).padStart(2, "0");
  flagCapacityElement.textContent = `${flagPool.maximumFlags} maximum`;
  flagDeployedElement.textContent = `${deployed} deployed`;
  flagMissingElement.textContent = `${flagPool.missingFlags} replacing`;
  flagRegenerationElement.hidden = flagPool.missingFlags <= 0;
  flagRegenerationElement.textContent = `Next replacement: ${formatFlagCountdown(flagPool.flagRegenRemainingMs)}`;
  hintStockElement.textContent = String(player.hints).padStart(2, "0");
  hintCapacityElement.textContent = `${hintCapacity()} max`;
  activeMineCountElement.textContent = String(player.mines).padStart(2, "0");
  mineResourceDetailElement.textContent = steelUnlocked ? `${Math.round(mineCollectionChance() * 100)}% recovery` : "locked";

  shovelResourceElement.dataset.tooltip = COPY_CONFIG.tooltips.shovel;
  flagResourceElement.dataset.tooltip = COPY_CONFIG.tooltips.flags;
  mineResourceElement.dataset.tooltip = mineTooltip;
  shovelResourceElement.setAttribute("aria-label", `Shovels: ${player.shovels} in stock. ${COPY_CONFIG.tooltips.shovel}.`);
  flagResourceElement.setAttribute("aria-label", `Flags: ${flagPool.availableFlags} available, ${deployed} deployed, ${flagPool.missingFlags} missing, ${flagPool.maximumFlags} maximum. ${COPY_CONFIG.tooltips.flags}.`);
  hintResourceElement.setAttribute("aria-label", `Hints: ${player.hints} in stock. Reveal one known safe space or mine.`);
  mineResourceElement.setAttribute("aria-label", mineTooltip);

  buyShovelCostElement.textContent = formatCurrency(shovelCost);
  buyFlagsCostElement.textContent = formatCurrency(flagsCost);
  buyHintsCostElement.textContent = formatCurrency(BALANCE_CONFIG.shovel.hintSupplyCost);
  buyShovelDetailElement.textContent = `+1 ${tier.name.toLowerCase()} shovel · ${shovelCapacity()} max`;
  buyShovelButton.disabled = !canPurchase() || player.coins < shovelCost || player.shovels >= shovelCapacity();
  buyFlagsButton.disabled = !canPurchase() || player.coins < flagsCost || flagPool.missingFlags <= 0;
  buyHintsButton.disabled = !canPurchase() || player.coins < BALANCE_CONFIG.shovel.hintSupplyCost || player.hints + BALANCE_CONFIG.shovel.hintBundleSize > hintCapacity();
  storeNoteElement.textContent = canPurchase()
    ? formatMessage("suppliesReady", { name: tier.name, durability: tier.durability })
    : formatMessage("suppliesLocked");
  updateSpecialEquipmentUI();
}

function updateSpecialEquipmentUI() {
  const unlocked = hasSpecialEquipmentAccess();
  const total = specialEquipmentTotal();
  specialEquipmentStoreElement.hidden = !unlocked;
  equipmentTotalElement.textContent = String(total);
  equipmentToggleButton.disabled = total <= 0;
  equipmentToggleButton.title = total > 0 ? "Special equipment inventory" : "No special equipment stocked";

  specialEquipmentListElement.innerHTML = SPECIAL_EQUIPMENT.map((item) => {
    const disabled = !canPurchase() || player.mines < item.cost;
    return `
      <button class="store-item store-item--compact special-equipment-buy" type="button" data-purchase-id="equipment:${item.id}" ${disabled ? "disabled" : ""}>
        <span class="store-item__copy"><strong>${item.name}</strong><small>${item.description}</small></span>
        <span class="store-item__cost">${item.cost} mine${item.cost === 1 ? "" : "s"}</span>
      </button>
    `;
  }).join("");

  specialEquipmentListElement.querySelectorAll("[data-purchase-id]").forEach((button) => {
    button.addEventListener("click", () => dispatchGameAction("purchase/buy", { id: button.dataset.purchaseId }));
  });

  equipmentInventoryListElement.innerHTML = SPECIAL_EQUIPMENT.map((item) => {
    const count = player.specialEquipment[item.id] || 0;
    const isSelected = selectedEquipmentId === item.id;
    const disabled = count <= 0 || gameOver || isRevealing || !minesPlaced;
    const tooltip = !minesPlaced
      ? "Dig one square before using special equipment; mines are placed after the first click."
      : item.description;
    const activeText = activeEquipmentStatus(item.id);
    return `
      <button class="equipment-inventory__item${isSelected ? " is-selected" : ""}" type="button" data-equipment-activate="${item.id}" data-tooltip="${tooltip}" ${disabled ? "disabled" : ""}>
        <span>
          <strong>${item.name}</strong>
          <small>${activeText || item.shortDescription}</small>
        </span>
        <b>${count}</b>
      </button>
    `;
  }).join("");

  equipmentInventoryListElement.querySelectorAll("[data-equipment-activate]").forEach((button) => {
    button.addEventListener("click", () => dispatchGameAction("equipment/activate", { id: button.dataset.equipmentActivate }));
  });
}

function activeEquipmentStatus(id) {
  if (id === "bombBot" && activeEquipment.bombBotUses > 0) return `${activeEquipment.bombBotUses} opens protected`;
  if (id === "mineEncapsulation" && activeEquipment.mineEncapsulationUses > 0) return `${activeEquipment.mineEncapsulationUses} flag attempts armed`;
  return "";
}

function hasSpecialEquipmentAccess() {
  return player.specialEquipmentUnlocked || player.mines > 0 || specialEquipmentTotal() > 0;
}

function specialEquipmentTotal() {
  return SPECIAL_EQUIPMENT.reduce((total, item) => total + (player.specialEquipment[item.id] || 0), 0);
}

function isUpgradeUnlocked(id) {
  const order = PROGRESSION_CONFIG.order;
  const index = order.indexOf(id);
  if (index < 0) return true;
  if (index === 0) return true;

  const previous = order[index - 1];
  return isProgressionMilestoneReached(previous);
}

function isProgressionMilestoneReached(id) {
  return {
    tallerGrid: player.tallerGridLevel >= 1,
    widerGrid: player.widerGridLevel >= 1,
    improveShovel: player.shovelTier >= 1,
    addMine: player.mineLevel >= 1,
    addTreasure: player.treasureLevel >= 1,
    mineYield: player.mineYieldLevel >= 1,
    treasureValue: player.treasureValueLevel >= 1,
    betterFlags: player.betterFlagsLevel >= 1,
  }[id] || false;
}

function progressionCost(id, level) {
  const item = PROGRESSION_CONFIG.items[id];
  if (!GAME_CONFIG.crossCosts.categories[id]) return exponentialCost(item.baseCost, item.growth, level);
  return calculateCrossCost({
    id,
    baseCost: item.baseCost,
    ownGrowth: item.growth,
    ownLevel: level,
    levels: {
      tallerGrid: player.tallerGridLevel,
      widerGrid: player.widerGridLevel,
      addMine: player.mineLevel,
      addTreasure: player.treasureLevel,
    },
    categories: GAME_CONFIG.crossCosts.categories,
    matrix: GAME_CONFIG.crossCosts.matrix,
  }).cost;
}

function upgradeSpecificWorker(workerId) {
  const worker = workerState.workersById[workerId];
  const definition = SPECIALISTS.find((item) => item.id === worker?.typeId);
  if (!worker || !definition) return;
  const analyst = definition.id === "analyst";
  const cost = analyst
    ? workerUpgradeCost(definition, worker, { baseCost: GAME_CONFIG.automation.analyst.upgradeMineCost, growth: GAME_CONFIG.automation.analyst.upgradeGrowth })
    : workerUpgradeCost(definition, worker);
  const currency = analyst ? "mines" : definition.currency;
  if (player[currency] < cost) return;
  player[currency] -= cost;
  workerState = upgradeWorker(workerState, workerId);
  player.specialists[definition.id] = specialistLevel(definition.id);
  delete autoMinersState.workerTasks[workerId];
  render();
}

function progressionCostBreakdown(id, level) {
  const item = PROGRESSION_CONFIG.items[id];
  if (!GAME_CONFIG.crossCosts.categories[id]) return { cost: progressionCost(id, level), surcharge: 0 };
  return calculateCrossCost({
    id, baseCost: item.baseCost, ownGrowth: item.growth, ownLevel: level,
    levels: { tallerGrid: player.tallerGridLevel, widerGrid: player.widerGridLevel, addMine: player.mineLevel, addTreasure: player.treasureLevel },
    categories: GAME_CONFIG.crossCosts.categories, matrix: GAME_CONFIG.crossCosts.matrix,
  });
}

function updateProgressionUI() {
  const progressionLocked = !canPurchase();
  const showProgression = (element, visible, disabled) => {
    element.hidden = !visible;
    element.disabled = disabled;
  };

  const taller = PROGRESSION_CONFIG.items.tallerGrid;
  const tallerCost = progressionCost("tallerGrid", player.tallerGridLevel);
  showProgression(upgradeElements.tallerGrid, isUpgradeUnlocked("tallerGrid"), progressionLocked || !Number.isFinite(tallerCost) || player.coins < tallerCost);
  upgradeElements.tallerGridTitle.textContent = taller.name;
  upgradeElements.tallerGridCost.textContent = formatCurrency(tallerCost);
  const tallerBreakdown = progressionCostBreakdown("tallerGrid", player.tallerGridLevel);
  upgradeElements.tallerGridDetail.textContent = `${formatCopy(taller.description, { next: GRID_LIMITS.min + player.tallerGridLevel + 1 })} Base ${formatCurrency(tallerBreakdown.baseCost)} + cross-cost ${formatCurrency(tallerBreakdown.surcharge)}.`;

  const wider = PROGRESSION_CONFIG.items.widerGrid;
  const widerCost = progressionCost("widerGrid", player.widerGridLevel);
  showProgression(upgradeElements.widerGrid, isUpgradeUnlocked("widerGrid"), progressionLocked || !Number.isFinite(widerCost) || player.coins < widerCost);
  upgradeElements.widerGridTitle.textContent = wider.name;
  upgradeElements.widerGridCost.textContent = formatCurrency(widerCost);
  const widerBreakdown = progressionCostBreakdown("widerGrid", player.widerGridLevel);
  upgradeElements.widerGridDetail.textContent = `${formatCopy(wider.description, { next: GRID_LIMITS.min + player.widerGridLevel + 1 })} Base ${formatCurrency(widerBreakdown.baseCost)} + cross-cost ${formatCurrency(widerBreakdown.surcharge)}.`;

  const shovelItem = PROGRESSION_CONFIG.items.improveShovel;
  const nextTier = BALANCE_CONFIG.shovel.tiers[player.shovelTier + 1];
  const shovelCost = progressionCost("improveShovel", player.shovelTier);
  const contractDigsReserved = Object.values(boardSessions).some((session) => session.digBudget);
  showProgression(upgradeElements.improveShovel, isUpgradeUnlocked("improveShovel") && Boolean(nextTier), progressionLocked || contractDigsReserved || !nextTier || player.coins < shovelCost);
  upgradeElements.upgradeTitle.textContent = shovelItem.name;
  upgradeElements.upgradeDetail.textContent = nextTier
    ? formatCopy(shovelItem.description, { current: currentShovel().name, next: nextTier.name })
    : formatCopy(shovelItem.finalDescription, { current: currentShovel().name });
  upgradeElements.upgradeCost.textContent = nextTier ? formatCurrency(shovelCost) : "MAX";

  const mineItem = PROGRESSION_CONFIG.items.addMine;
  const mineCost = progressionCost("addMine", player.mineLevel);
  showProgression(upgradeElements.addMine, isUpgradeUnlocked("addMine"), progressionLocked || player.coins < mineCost);
  upgradeElements.addMineCost.textContent = formatCurrency(mineCost);
  const mineBreakdown = progressionCostBreakdown("addMine", player.mineLevel);
  upgradeElements.addMineDetail.textContent = `${formatCopy(mineItem.description, { next: maxUnlockedMineCount() + 1 })} Base ${formatCurrency(mineBreakdown.baseCost)} + cross-cost ${formatCurrency(mineBreakdown.surcharge)}.`;

  const treasureItem = PROGRESSION_CONFIG.items.addTreasure;
  const treasureCost = progressionCost("addTreasure", player.treasureLevel);
  showProgression(upgradeElements.addTreasure, isUpgradeUnlocked("addTreasure"), progressionLocked || player.coins < treasureCost);
  upgradeElements.addTreasureCost.textContent = formatCurrency(treasureCost);
  const treasureBreakdown = progressionCostBreakdown("addTreasure", player.treasureLevel);
  upgradeElements.addTreasureDetail.textContent = `${treasureItem.description} Base ${formatCurrency(treasureBreakdown.baseCost)} + cross-cost ${formatCurrency(treasureBreakdown.surcharge)}.`;

  const yieldItem = PROGRESSION_CONFIG.items.mineYield;
  const yieldCost = progressionCost("mineYield", player.mineYieldLevel);
  showProgression(upgradeElements.mineYield, isUpgradeUnlocked("mineYield"), progressionLocked || player.coins < yieldCost);
  upgradeElements.mineYieldCost.textContent = formatCurrency(yieldCost);
  upgradeElements.mineYieldDetail.textContent = `${yieldItem.description} +${Math.round(mineYieldPercent() * 100)}% per extra mine.`;

  const valueItem = PROGRESSION_CONFIG.items.treasureValue;
  const valueCost = progressionCost("treasureValue", player.treasureValueLevel);
  showProgression(upgradeElements.treasureValue, isUpgradeUnlocked("treasureValue"), progressionLocked || player.coins < valueCost);
  upgradeElements.treasureValueCost.textContent = formatCurrency(valueCost);
  upgradeElements.treasureValueDetail.textContent = `${valueItem.description} Average: ${formatCurrency(treasureAverage())}.`;

  const flagsItem = PROGRESSION_CONFIG.items.betterFlags;
  const flagsUpgradeCost = progressionCost("betterFlags", player.betterFlagsLevel);
  showProgression(upgradeElements.betterFlags, isUpgradeUnlocked("betterFlags"), progressionLocked || player.coins < flagsUpgradeCost);
  upgradeElements.betterFlagsCost.textContent = formatCurrency(flagsUpgradeCost);
  upgradeElements.betterFlagsDetail.textContent = `${flagsItem.description} Current recovery: ${Math.round(mineCollectionChance() * 100)}%.`;

  const shovelCap = shovelCapacity();
  const nextShovelCap = nextCapacity("shovel");
  const shovelCapCost = capacityUpgradeCost("shovel");
  showProgression(upgradeElements.shovelCap, Boolean(nextShovelCap), progressionLocked || player.coins < shovelCapCost);
  upgradeElements.shovelCapTitle.textContent = COPY_CONFIG.upgradeLabels.shovelLocker;
  upgradeElements.shovelCapCost.textContent = nextShovelCap ? formatCurrency(shovelCapCost) : "MAX";
  upgradeElements.shovelCapDetail.textContent = nextShovelCap ? `${shovelCap} → ${nextShovelCap} shovels` : "50 shovel maximum reached";

  const flagCap = flagCapacity();
  const nextFlagCap = nextCapacity("flags");
  const flagCapCost = capacityUpgradeCost("flags");
  showProgression(upgradeElements.flagCap, Boolean(nextFlagCap), progressionLocked || player.coins < flagCapCost);
  upgradeElements.flagCapTitle.textContent = COPY_CONFIG.upgradeLabels.flagLocker;
  upgradeElements.flagCapCost.textContent = nextFlagCap ? formatCurrency(flagCapCost) : "MAX";
  upgradeElements.flagCapDetail.textContent = nextFlagCap
    ? `${flagCap} → ${nextFlagCap} reusable flags. Upgrading completely repairs and refills the pool.`
    : "Maximum reusable flag capacity reached";

  const safetyMaxed = player.safetyRadius >= 2;
  const safetyNextCostsMines = player.safetyRadius === 1;
  const maxRowsUnlocked = GRID_LIMITS.min + player.tallerGridLevel;
  const maxColsUnlocked = GRID_LIMITS.min + player.widerGridLevel;
  const fourByFourUnlocked = maxRowsUnlocked >= 4 && maxColsUnlocked >= 4;
  const safetyLocked = safetyNextCostsMines && !fourByFourUnlocked;
  const safetyCost = safetyNextCostsMines
    ? BALANCE_CONFIG.abilities.safetyRadiusMineCost
    : BALANCE_CONFIG.abilities.safetyRadiusCosts[0];
  const safetyAffordable = safetyNextCostsMines ? player.mines >= safetyCost : player.coins >= safetyCost;
  showProgression(
    abilityElements.safetyRadius,
    true,
    progressionLocked || safetyMaxed || safetyLocked || !safetyAffordable,
  );
  abilityElements.safetyRadiusCost.textContent = safetyMaxed
    ? "MAX"
    : safetyNextCostsMines
      ? `${safetyCost} mines`
      : formatCurrency(safetyCost);
  abilityElements.safetyRadiusDetail.textContent = safetyMaxed
    ? formatMessage("safetyMax")
    : safetyLocked
      ? "Unlock: expand the board to 4×4."
      : `${safetySizeLabel(player.safetyRadius)} → ${safetySizeLabel(player.safetyRadius + 1)}; no mine near first click`;

  const chordingVisible = player.shovelTier >= 3;
  showProgression(abilityElements.chording, true, progressionLocked || !chordingVisible || (!player.chordingUnlocked && player.mines < BALANCE_CONFIG.abilities.chordingMineCost));
  abilityElements.chordingTitle.textContent = player.chordingUnlocked ? "Chording ready" : "Unlock Chording";
  abilityElements.chordingDetail.textContent = player.chordingUnlocked
    ? formatMessage("chordingReady")
    : !chordingVisible
      ? "Unlock: upgrade to a Steel Shovel."
      : formatMessage("chordingDescription");
  abilityElements.chordingCost.textContent = player.chordingUnlocked ? "READY" : `${BALANCE_CONFIG.abilities.chordingMineCost} mines`;
}

function updateStatsUI() {
  renderStatsLedger({
    stats: player.stats,
    gridElement: statsGridElement,
    fastestElement: fastestConfigsElement,
    formatCurrency,
    formatDuration,
  });
  const summary = summarizeDeveloperTelemetry(developerTelemetry);
  const current = developerTelemetry.currentAttempt;
  const developerEntries = [
    ["Attempts recorded", summary.attemptsRecorded],
    ["Average board duration", formatOptionalDuration(summary.averageBoardDurationMs)],
    ["Current run reveals", current?.revealCount ?? 0],
    ["Current flags placed / removed", `${current?.flagPlacements ?? 0} / ${current?.flagRemovals ?? 0}`],
    ["Current chords used", current?.chordUses ?? 0],
    ["Mine-hit rate", formatPercent(summary.mineHitRate, 1)],
    ["Current shovels / durability consumed", `${current?.shovelsConsumed ?? 0} / ${current?.shovelDurabilityConsumed ?? 0}`],
    ["Current coins earned", formatCurrency(current?.coinsEarned ?? 0)],
    ["Current recovered mines earned", current?.recoveredMinesEarned ?? 0],
    ["Average contract completion", formatOptionalDuration(summary.averageContractCompletionTimeMs)],
    ["Current equipment use", formatCounterMap(current?.equipmentUses || {})],
    ["Boards abandoned", formatPercent(summary.abandonedBoardRate, 1)],
    ["Average time to first purchase", formatOptionalDuration(summary.averageTimeBeforeFirstPurchaseMs)],
    ["Current purchases", formatCounterMap(current?.purchases || {})],
  ];
  developerStatsGridElement.innerHTML = developerEntries.map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`).join("");
  developerStatsNoteElement.textContent = current
    ? `Current ${current.id}: ${current.board.rows}×${current.board.cols}, ${current.outcome.replace("_", " ")}. Raw records are stored in save JSON under developerTelemetry.`
    : "Raw records are stored in save JSON under developerTelemetry.";
}

function formatOptionalDuration(milliseconds) {
  return Number.isFinite(milliseconds) ? formatDuration(milliseconds) : "—";
}

function formatCounterMap(counts) {
  const entries = Object.entries(counts);
  return entries.length ? entries.map(([id, count]) => `${id}: ${count}`).join(", ") : "—";
}

function updateCurioUI() {
  renderCurioLedger({
    curios: player.curios,
    chance: curioChance(),
    itemCount: BALANCE_CONFIG.curio.itemCount,
    chanceElement: curioChanceElement,
    gridElement: curioGridElement,
    noteElement: curioNoteElement,
    formatPercent,
  });
}

function activeChallenges() {
  return player.messageBoard.challenges.filter((challenge) => challenge.claimable || challenge.expiresInMs > 0);
}

function challengeBoardRequirementsMet(challenge) {
  const sizeMet = challenge.sizeAny || (settings.rows >= challenge.rows && settings.cols >= challenge.cols);
  const minesMet = challenge.minesAny || currentMineCount() >= challenge.minMines;
  return { sizeMet, minesMet };
}

function challengeProperties(challenge) {
  const { sizeMet, minesMet } = challenge.claimable
    ? { sizeMet: true, minesMet: true }
    : challengeBoardRequirementsMet(challenge);
  const properties = [
    ["Size", challenge.sizeAny ? "Any" : `${challenge.rows}×${challenge.cols}+`, sizeMet],
    ["Mines", challenge.minesAny ? "Any" : `${challenge.minMines}+`, minesMet],
    ["Reward", formatCurrency(challenge.rewardCoins), challenge.claimable],
  ];

  if (challenge.type === "flagLimit") properties.splice(2, 0, ["Challenge", `No more than ${challenge.flagLimit} flag${challenge.flagLimit === 1 ? "" : "s"}`, challenge.claimable]);
  if (challenge.type === "noChording") properties.splice(2, 0, ["Challenge", "No chording", challenge.claimable]);
  if (challenge.type === "speedClear") properties.splice(2, 0, ["Challenge", `${challenge.seconds}s or less`, challenge.claimable]);
  return properties;
}

function challengeMatchesClear(challenge, result) {
  return matchesChallengeClear(challenge, result);
}

function completeMatchingChallenges(result) {
  const newlyClaimable = [];
  player.messageBoard.challenges = activeChallenges().map((challenge) => {
    if (challenge.claimable || !challengeMatchesClear(challenge, result)) return challenge;
    const claimableChallenge = { ...challenge, claimable: true };
    newlyClaimable.push(claimableChallenge);
    return claimableChallenge;
  });

  if (newlyClaimable.length === 0) return "";

  saveMessageBoard();
  return newlyClaimable.map((challenge) => formatMessage("challengeClaimable", {
    name: challenge.name,
  })).join("");
}

function claimChallengeReward(challengeId) {
  const challenges = activeChallenges();
  const challenge = challenges.find((entry) => String(entry.id) === String(challengeId));
  if (!challenge || !challenge.claimable) return;

  player.messageBoard.challenges = challenges.filter((entry) => entry !== challenge);

  const coins = challenge.rewardCoins;
  player.coins += coins;
  recordDeveloperEvent(developerTelemetry, { type: "coinsEarned", count: coins });
  player.stats.coinsEarned += coins;
  player.stats.challengesCompleted += 1;
  player.stats.challengesWon += 1;
  saveMessageBoard();
  statusElement.textContent = formatMessage("challengeWon", {
    name: challenge.name,
    coins: formatCurrency(coins),
  });
  render();
}

function updateChallengeUI() {
  const messageBoard = player.messageBoard;
  const challenges = activeChallenges();

  challengeCountdownElement.textContent = challenges.length >= CHALLENGE_CONFIG.maxActive
    ? "Board full"
    : `Next in ${formatClock(messageBoard.nextChallengeInMs)}`;

  renderMessageBoardList();
}

function updateContractUI() {
  const contracts = player.contracts;
  const active = activeContractType();
  const offered = offeredContractTypes();

  document.body.classList.toggle(
    "is-contract-running",
    Boolean(active) && !contracts.active?.briefingOpen,
  );

  if (active) {
    contractCountdownElement.textContent = "in field";
  } else if (offered.length >= availableContractSlotCount()) {
    contractCountdownElement.textContent = "ready";
  } else {
    contractCountdownElement.textContent = `${contracts.boardsUntilNext} board${contracts.boardsUntilNext === 1 ? "" : "s"}`;
  }

  renderMessageBoardList();
  updateContractModal(active);
}

function renderMessageBoardList() {
  const tiles = [];
  if (campProgression.phase === CAMP_PHASES.contractAvailable) {
    tiles.push(renderContractTile(campContractType(), "Priority offer", true, CAMP_CONFIG.contract.mines, true));
  }
  acceptedContractInstances().forEach((instance) => {
    const contractType = instance.special ? campContractType() : contractTypeById(instance.typeId);
    const session = boardSessions[instance.boardId];
    if (contractType && session) tiles.push(renderAcceptedContractTile(contractType, instance, session));
  });
  offeredContractTypes().forEach((contractType) => {
    tiles.push(renderContractTile(contractType, "Offer ready", true));
  });

  activeChallenges().forEach((challenge) => {
    tiles.push(renderChallengeTile(challenge));
  });

  messageBoardListElement.innerHTML = tiles.join("");
}

function renderContractTile(contractType, status, canAccept, mineCount = null, priority = false) {
  const properties = contractProperties(contractType, mineCount)
    .map(renderMessageTileProperty)
    .join("");
  const disabled = !canAccept;
  const title = "";
  const action = canAccept
    ? `<button class="contract-button message-tile__button js-start-contract" type="button" data-contract-id="${contractType.id}"${disabled ? " disabled" : ""}${title ? ` title="${title}"` : ""}>Accept</button>`
    : "";

  return `
    <article class="message-tile message-tile--contract${priority ? " is-priority" : ""}">
      <div class="message-tile__topline">
        <div>
          <span class="message-tile__kind">Contract</span>
          <strong>${contractType.name}</strong>
        </div>
        <span>${status}</span>
      </div>
      <p>${contractType.description}</p>
      <div class="message-tile__properties">${properties}</div>
      ${action}
    </article>
  `;
}

function renderAcceptedContractTile(contractType, instance, session) {
  const properties = contractProperties(contractType, session.settings.mines).map(renderMessageTileProperty).join("");
  const label = session.status === BOARD_SESSION_STATUS.committed ? "In progress" : "Accepted";
  return `
    <article class="message-tile message-tile--contract">
      <div class="message-tile__topline"><div><span class="message-tile__kind">Contract</span><strong>${contractType.name}</strong></div><span>${label}</span></div>
      <p>${contractType.description}</p>
      <div class="message-tile__properties">${properties}</div>
      <button class="contract-button message-tile__button js-resume-contract" type="button" data-instance-id="${instance.id}">${currentBoardId === session.id && currentView === "board" ? "Current board" : "Resume"}</button>
    </article>
  `;
}

function renderChallengeTile(challenge) {
  const properties = challengeProperties(challenge)
    .map(renderMessageTileProperty)
    .join("");
  const statusText = challenge.claimable ? "Ready to claim" : formatClock(challenge.expiresInMs);
  const action = challenge.claimable
    ? `<button class="contract-button message-tile__button js-claim-challenge" type="button" data-challenge-id="${challenge.id}">Claim Reward</button>`
    : "";

  return `
    <article class="message-tile message-tile--challenge${challenge.claimable ? " is-claimable" : ""}">
      <div class="message-tile__topline">
        <div>
          <span class="message-tile__kind">Challenge</span>
          <strong>${challenge.name}</strong>
        </div>
        <span>${statusText}</span>
      </div>
      <div class="message-tile__properties">${properties}</div>
      ${action}
    </article>
  `;
}

function renderMessageTileProperty([label, value, met]) {
  return `<span${met ? ' class="is-met"' : ""}><strong>${label}</strong>${value}</span>`;
}

function updateContractModal(contractType) {
  if (!contractType || !player.contracts.active?.briefingOpen) {
    contractModalElement.hidden = true;
    return;
  }

  contractModalElement.hidden = false;
  contractModalLabelElement.textContent = "Contract accepted";
  contractModalTitleElement.textContent = contractType.name;
  contractModalDescriptionElement.textContent = contractType.description;
  contractModalFieldElement.textContent = `${contractType.rows}×${contractType.cols}`;
  contractModalMinesElement.textContent = `${settings.mines}`;
  contractModalRewardElement.textContent = contractType.isCamp
    ? "Board finds + District access"
    : `${formatCurrency(contractType.rewardCoins)} + ${contractType.rewardMines} mines`;
  contractModalDigsElement.textContent = `${player.shovelUses}/${contractDigRequirement(contractType)} digs`;
  contractModalFlagsElement.textContent = `${contractType.mines.max}`;
}

function acceptOfferedContract(contractId) {
  const special = contractId === CAMP_CONFIG.contract.id && campProgression.phase === CAMP_PHASES.contractAvailable;
  const contractType = special ? campContractType() : offeredContractTypes().find((type) => type.id === contractId);
  if (!contractType || acceptedContractInstances().some((instance) => instance.typeId === contractId)) return;
  const mineCount = special ? CAMP_CONFIG.contract.mines : randomInteger(contractType.mines.min, contractType.mines.max);
  const instanceId = `contract-${nextContractInstanceOrdinal++}`;
  const session = createBlankSession({ rows: contractType.rows, cols: contractType.cols, mines: mineCount }, {
    category: special ? BOARD_CATEGORIES.campContract : BOARD_CATEGORIES.standardContract,
    owner: { type: "contract", id: instanceId },
    seed: `${Date.now()}:${instanceId}`,
    contractInstanceId: instanceId,
    entrances: special ? createCampEntrances({ rows: contractType.rows, cols: contractType.cols }, createSeededRandom(`${instanceId}:entrances`), CAMP_CONFIG.entranceWidths) : [],
  });
  contractInstances[instanceId] = { id: instanceId, typeId: contractId, boardId: session.id, status: "ACCEPTED", special };
  if (special) campProgression = acceptCampContract(campProgression, instanceId);
  else player.contracts.offeredIds = offeredContractIds().filter((id) => id !== contractType.id);
  player.contracts.active = { id: contractType.id, instanceId, previousSettings: { ...DEFAULT_SETTINGS }, briefingOpen: true };
  contractModalElement.hidden = true;
  statusElement.textContent = formatMessage("contractStarted", { name: contractType.name });
  render();
}

function closeContractBriefing() {
  if (!player.contracts.active) return;
  player.contracts.active.briefingOpen = false;
  contractModalElement.hidden = true;
  render();
}

function activeContractType() {
  const instance = activeContractInstance();
  if (!instance) return null;
  return instance.special ? campContractType() : contractTypeById(instance.typeId);
}

function campContractType() {
  return {
    ...CAMP_CONFIG.contract,
    isCamp: true,
    mines: { min: CAMP_CONFIG.contract.mines, max: CAMP_CONFIG.contract.mines },
    rewardCoins: 0,
    rewardMines: 0,
  };
}

function offeredContractIds() {
  if (Array.isArray(player.contracts.offeredIds)) {
    return [...new Set(player.contracts.offeredIds)].filter((id) => contractTypeById(id));
  }
  return player.contracts.offeredId && contractTypeById(player.contracts.offeredId)
    ? [player.contracts.offeredId]
    : [];
}

function offeredContractTypes() {
  return offeredContractIds().map(contractTypeById).filter(Boolean);
}

function contractTypeById(id) {
  return findContractType(CONTRACT_CONFIG.types, id);
}

function isContractActive() {
  return Boolean(activeContractInstance());
}

function isContractBoardDisplayed() {
  return isContractActive();
}

function isFixedBoardSession() {
  const session = currentBoardSession();
  return Boolean(session && (session.category === BOARD_CATEGORIES.districtParcel || session.contractInstanceId));
}

function contractSummary(contractType, mineCount = null) {
  const mines = mineCount || `${contractType.mines.min}-${contractType.mines.max}`;
  return `${contractType.rows}×${contractType.cols}, ${mines} mines, ${formatCurrency(contractType.rewardCoins)} + ${contractType.rewardMines} mine reward.`;
}

function contractProperties(contractType, mineCount = null) {
  const mines = mineCount || `${contractType.mines.min}-${contractType.mines.max}`;
  return [
    ["Field", `${contractType.rows}×${contractType.cols}`],
    ["Mines", mines],
    ["Reward", contractType.isCamp ? "Board finds + District access" : `${formatCurrency(contractType.rewardCoins)} + ${contractType.rewardMines} mine${contractType.rewardMines === 1 ? "" : "s"}`],
    ["Digs", contractDigRequirement(contractType)],
    ["Flags", contractType.mines.max],
  ];
}

function contractCapacitySummary(contractType) {
  return `Requires ${contractDigRequirement(contractType)} digs; you have ${player.shovelUses}.`;
}

function contractDigRequirement(contractType) {
  return calculateContractDigRequirement(contractType, BALANCE_CONFIG.digCostPerTile);
}

function hasContractDigCapacity(contractType) {
  return player.shovelUses >= contractDigRequirement(contractType);
}

function contractDigCapacityMessage(contractType) {
  return formatMessage("contractNeedsShovels", {
    name: contractType.name,
    needed: contractDigRequirement(contractType),
    available: player.shovelUses,
  });
}

function advanceContractSchedule() {
  const contracts = player.contracts;
  if (availableContractTypes().length === 0) return;

  contracts.boardsUntilNext = Math.max(0, contracts.boardsUntilNext - 1);
  if (contracts.boardsUntilNext > 0) return;

  const offer = rollContractOffer();
  if (!offer) {
    contracts.boardsUntilNext = randomContractDelay();
    return;
  }

  addContractOffer(offer.id);
  contracts.boardsUntilNext = randomContractDelay();
  statusElement.textContent = formatMessage("contractReady", { name: offer.name });
}

function rollContractOffer(ignoreCooldowns = false) {
  const available = availableContractTypes(ignoreCooldowns);
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

function availableContractTypes(ignoreCooldowns = false) {
  const unavailable = [
    ...offeredContractIds(),
    ...acceptedContractInstances().filter((instance) => !instance.special).map((instance) => instance.typeId),
  ];
  return listAvailableContracts(
    CONTRACT_CONFIG.types,
    { ...player.contracts, active: null },
    unavailable,
    ignoreCooldowns,
  );
}

function availableContractSlotCount() {
  const acceptedIds = new Set(acceptedContractInstances().filter((instance) => !instance.special).map((instance) => instance.typeId));
  return CONTRACT_CONFIG.types
    .slice(0, player.contracts.unlockedTypeCount)
    .filter((type) => !acceptedIds.has(type.id))
    .length;
}

function addContractOffer(contractId) {
  player.contracts.offeredIds = [...new Set([...offeredContractIds(), contractId])];
}

function generateContractOffer() {
  const offer = rollContractOffer(true);
  if (!offer) {
    statusElement.textContent = "All available contract types are already posted.";
    updateContractUI();
    return;
  }

  addContractOffer(offer.id);
  statusElement.textContent = formatMessage("contractReady", { name: offer.name });
  updateContractUI();
}

function completeContract(contractType) {
  const contracts = player.contracts;
  const typeIndex = CONTRACT_CONFIG.types.indexOf(contractType);
  if (contractType.isCamp) {
    player.stats.contractsCompleted += 1;
    player.stats.contractsWon += 1;
    contracts.active = null;
    return " Establish a Camp complete. Districts are now available.";
  }

  player.coins += contractType.rewardCoins;
  recordDeveloperEvent(developerTelemetry, { type: "coinsEarned", count: contractType.rewardCoins });
  player.mines += contractType.rewardMines;
  recordDeveloperEvent(developerTelemetry, { type: "recoveredMines", count: contractType.rewardMines });
  player.stats.coinsEarned += contractType.rewardCoins;
  player.stats.contractsCompleted += 1;
  player.stats.contractsWon += 1;
  if (typeIndex >= 0) {
    contracts.completedByType[typeIndex] += 1;
    if (contracts.completedByType[typeIndex] === 1 && typeIndex + 1 === contracts.unlockedTypeCount) {
      contracts.unlockedTypeCount = Math.min(CONTRACT_CONFIG.types.length, contracts.unlockedTypeCount + 1);
    }
  }

  contracts.active = null;
  contracts.boardsUntilNext = randomContractDelay();
  contracts.returnSettings = null;
  document.body.classList.remove("is-contract-running");
  return formatMessage("contractWon", {
    name: contractType.name,
    coins: formatCurrency(contractType.rewardCoins),
    mines: contractType.rewardMines,
    plural: contractType.rewardMines === 1 ? "" : "s",
  });
}

function failContract(contractType) {
  const contracts = player.contracts;
  const typeIndex = CONTRACT_CONFIG.types.indexOf(contractType);
  if (contractType.isCamp) {
    player.stats.contractsLost += 1;
    contracts.active = null;
    return "Establish a Camp failed. Another Camp Parcel route will need to be discovered.";
  }

  if (typeIndex >= 0) contracts.cooldowns[typeIndex] = CONTRACT_CONFIG.lossCooldownGames;
  player.stats.contractsLost += 1;
  contracts.active = null;
  contracts.boardsUntilNext = randomContractDelay();
  contracts.returnSettings = null;
  document.body.classList.remove("is-contract-running");
  return formatMessage("contractLost", {
    name: contractType.name,
    count: CONTRACT_CONFIG.lossCooldownGames,
  });
}

function tickContractCooldowns() {
  player.contracts.cooldowns = decreaseContractCooldowns(player.contracts.cooldowns);
}

function randomContractDelay() {
  return randomInteger(CONTRACT_CONFIG.minBoardsBetween, CONTRACT_CONFIG.maxBoardsBetween);
}

function tickMessageBoard() {
  const now = performance.now();
  const elapsed = now - lastChallengeTickTime;
  lastChallengeTickTime = now;
  if (document.visibilityState === "hidden" || elapsed <= 0) {
    updateChallengeUI();
    return;
  }

  player.messageBoard = advanceChallengeTimers(player.messageBoard, elapsed, CHALLENGE_CONFIG.maxActive);
  const messageBoard = player.messageBoard;

  if (messageBoard.challenges.length < CHALLENGE_CONFIG.maxActive) {
    if (messageBoard.nextChallengeInMs <= 0) {
      const challenge = createChallengeOffer();
      messageBoard.challenges.push(challenge);
      messageBoard.nextChallengeInMs = randomChallengeDelayMs();
      statusElement.textContent = formatMessage("challengeReady", { name: challenge.name });
    }
  }

  saveMessageBoard();
  updateChallengeUI();
}

function createChallengeOffer() {
  const type = CHALLENGE_CONFIG.types[Math.floor(Math.random() * CHALLENGE_CONFIG.types.length)];
  const maxRows = GRID_LIMITS.min + player.tallerGridLevel;
  const maxCols = GRID_LIMITS.min + player.widerGridLevel;
  const maxMines = Math.max(1, Math.min(maxUnlockedMineCount(), maxMineCountFor(maxRows, maxCols, player.safetyRadius)));
  const sizeAny = Math.random() < CHALLENGE_CONFIG.sizeAnyChance;
  const minesAny = Math.random() < CHALLENGE_CONFIG.mineAnyChance;
  const rows = sizeAny ? null : randomInteger(GRID_LIMITS.min, maxRows);
  const cols = sizeAny ? null : randomInteger(GRID_LIMITS.min, maxCols);
  const boardTileCount = sizeAny ? maxRows * maxCols : rows * cols;
  const possibleMines = sizeAny
    ? maxMines
    : Math.max(1, Math.min(maxMines, maxMineCountFor(rows, cols, player.safetyRadius)));
  const minMines = minesAny ? null : randomInteger(1, possibleMines);
  const expiresInMs = randomChallengeLifetimeMs();
  const rewardCoins = challengeRewardCoins(type, boardTileCount, minMines || Math.max(1, Math.floor(maxMines / 2)));
  const challenge = {
    id: messageBoardChallengeId(),
    type: type.id,
    name: type.name,
    sizeAny,
    minesAny,
    rows,
    cols,
    minMines,
    rewardCoins,
    expiresInMs,
  };

  if (type.id === "flagLimit") challenge.flagLimit = randomInteger(0, Math.max(0, Math.min(8, minMines || possibleMines)));
  if (type.id === "speedClear") challenge.seconds = type.seconds;
  return challenge;
}

function generateChallengeOffer() {
  const challenges = activeChallenges();
  if (challenges.length >= CHALLENGE_CONFIG.maxActive) {
    player.messageBoard.challenges = challenges;
    statusElement.textContent = "The message board is full.";
    updateChallengeUI();
    return;
  }

  const challenge = createChallengeOffer();
  player.messageBoard.challenges = [...challenges, challenge];
  player.messageBoard.nextChallengeInMs = randomChallengeDelayMs();
  saveMessageBoard();
  statusElement.textContent = formatMessage("challengeReady", { name: challenge.name });
  updateChallengeUI();
}

function messageBoardChallengeId() {
  const id = player.messageBoard.nextChallengeId;
  player.messageBoard.nextChallengeId += 1;
  return id;
}

function challengeRewardCoins(type, tileCount, mines) {
  const difficultyMultiplier = {
    flagLimit: 1.15,
    noChording: 1,
    speedClear: 1.35,
  }[type.id] || 1;
  return Math.round((CHALLENGE_CONFIG.rewardBaseCoins
    + tileCount * CHALLENGE_CONFIG.rewardCoinsPerTile
    + mines * CHALLENGE_CONFIG.rewardCoinsPerMine) * difficultyMultiplier);
}

function randomChallengeDelayMs() {
  return randomInteger(CHALLENGE_CONFIG.minSecondsBetween, CHALLENGE_CONFIG.maxSecondsBetween) * 1000;
}

function randomChallengeLifetimeMs() {
  const steps = (CHALLENGE_CONFIG.maxLifetimeSeconds - CHALLENGE_CONFIG.minLifetimeSeconds) / CHALLENGE_CONFIG.lifetimeStepSeconds;
  return (CHALLENGE_CONFIG.minLifetimeSeconds + randomInteger(0, steps) * CHALLENGE_CONFIG.lifetimeStepSeconds) * 1000;
}

function maxMineCountFor(rows, cols, safetyRadius = 0) {
  const safeAreaWidth = Math.min(cols, safetyRadius * 2 + 1);
  const safeAreaHeight = Math.min(rows, safetyRadius * 2 + 1);
  return Math.max(1, rows * cols - safeAreaWidth * safeAreaHeight);
}

function setSelectOptions(element, values, selectedValue) {
  const signature = values.join(",");
  if (element.dataset.options !== signature) {
    element.replaceChildren(...values.map((value) => {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = String(value);
      return option;
    }));
    element.dataset.options = signature;
  }
  element.value = String(selectedValue);
}

function canEditFieldSpecification() {
  return currentView === "board" && !isFixedBoardSession() && (!roundStarted || gameOver);
}

function syncSettingsControls() {
  settings = normalizeFieldSettings(settings);
  setSelectOptions(rowsInput, availableRows(), settings.rows);
  setSelectOptions(colsInput, availableCols(), settings.cols);
  setSelectOptions(minesInput, availableMines(), settings.mines);
  setSelectOptions(treasuresInput, availableTreasures(), settings.treasures);
  const locked = !canEditFieldSpecification();
  rowsInput.disabled = locked;
  colsInput.disabled = locked;
  minesInput.disabled = locked;
  treasuresInput.disabled = locked;
}

function applySettingsFromControls() {
  if (isFixedBoardSession()) {
    statusElement.textContent = formatMessage("finishRound");
    syncSettingsControls();
    return;
  }
  if (roundStarted && !gameOver) {
    statusElement.textContent = formatMessage("finishRound");
    syncSettingsControls();
    return;
  }
  const nextSettings = {
    rows: clamp(Number.parseInt(rowsInput.value, 10) || GRID_LIMITS.min, GRID_LIMITS.min, GRID_LIMITS.min + player.tallerGridLevel),
    cols: clamp(Number.parseInt(colsInput.value, 10) || GRID_LIMITS.min, GRID_LIMITS.min, GRID_LIMITS.min + player.widerGridLevel),
    mines: Number.parseInt(minesInput.value, 10) || 1,
    treasures: Number.parseInt(treasuresInput.value, 10) || 1,
  };
  nextSettings.mines = clamp(
    nextSettings.mines,
    1,
    Math.min(
      maxMineCountFor(nextSettings.rows, nextSettings.cols, safetyRadiusForSettings(nextSettings)),
      maxUnlockedMineCount(),
    ),
  );
  nextSettings.treasures = clamp(nextSettings.treasures, 1, maxTreasureCountFor(nextSettings));
  settings = nextSettings;
  preferences.lastBoardSelection = { ...settings };
  startGame();
}

function currentShovel() {
  return BALANCE_CONFIG.shovel.tiers[player.shovelTier];
}

function shovelCapacity() {
  return BALANCE_CONFIG.capacity.shovel[player.shovelCapacityLevel];
}

function flagCapacity() {
  return BALANCE_CONFIG.capacity.flags[player.flagCapacityLevel];
}

function renderAutomationModeList() {
  const modes = [
    ["manual", "Manual", "Workers are paused."],
    ["assist", "Assist", "Surveyor, Excavator, and Flagbearer work."],
    ["analyze", "Analyze", "Show basic and Analyst findings without worker actions."],
  ];
  const selectedMode = currentBoardSession()?.automation?.interactionMode || INTERACTION_MODES.manual;
  const element = document.querySelector("#automation-mode-list");
  element.innerHTML = modes.map(([id, name, detail]) => `
    <button class="worker-buy${selectedMode === id ? " is-selected" : ""}" type="button" data-automation-mode="${id}">
      <strong>${name}</strong><small>${detail}</small>
    </button>
  `).join("");
  element.querySelectorAll("[data-automation-mode]").forEach((button) => {
    button.addEventListener("click", () => dispatchGameAction("autoMiners/setMode", { mode: button.dataset.automationMode }));
  });
}

function hintCapacity() {
  return 10;
}

function nextCapacity(kind) {
  const levels = kind === "shovel" ? BALANCE_CONFIG.capacity.shovel : BALANCE_CONFIG.capacity.flags;
  const level = kind === "shovel" ? player.shovelCapacityLevel : player.flagCapacityLevel;
  return levels[level + 1] || null;
}

function capacityUpgradeCost(kind) {
  const costs = kind === "shovel" ? BALANCE_CONFIG.upgrades.shovelCapacityCosts : BALANCE_CONFIG.upgrades.flagCapacityCosts;
  const level = kind === "shovel" ? player.shovelCapacityLevel : player.flagCapacityLevel;
  return costs[level] || 0;
}

function shovelSupplyCost() {
  return Math.ceil(BALANCE_CONFIG.shovel.supplyCost * BALANCE_CONFIG.shovel.supplyCostMultiplierPerTier ** player.shovelTier);
}

function flagSupplyCost() {
  return Math.ceil(BALANCE_CONFIG.shovel.flagSupplyCost * (1 + player.betterFlagsLevel * 0.5));
}

function shovelUpgradeCost() {
  return progressionCost("improveShovel", player.shovelTier);
}

function mineCollectionChance() {
  if (player.shovelTier < 3) return 0;
  const tierBonus = (player.shovelTier - 3) * BALANCE_CONFIG.mineCollection.betterShovelChancePerTier;
  const flagBonus = player.betterFlagsLevel * BALANCE_CONFIG.upgrades.betterFlagsChancePerLevel;
  return Math.min(1, BALANCE_CONFIG.mineCollection.steelBaseChance + tierBonus + flagBonus);
}

function mineYieldPercent() {
  return 0.01 + player.mineYieldLevel * BALANCE_CONFIG.upgrades.mineYieldPercentPerLevel;
}

function treasureValueRange() {
  const minimum = BALANCE_CONFIG.treasure.startingMinimumCoins + player.treasureValueLevel * BALANCE_CONFIG.treasure.minimumGrowth;
  const maximum = BALANCE_CONFIG.treasure.startingMaximumCoins + player.treasureValueLevel * BALANCE_CONFIG.treasure.maximumGrowth;
  return { minimum, maximum };
}

function treasureTierFor(value, { minimum, maximum }) {
  if (maximum <= minimum) return "gold";
  const bronzeMax = minimum + Math.floor((maximum - minimum) * 0.4);
  const silverMax = minimum + Math.floor((maximum - minimum) * 0.8);
  if (value <= bronzeMax) return "bronze";
  if (value <= silverMax) return "silver";
  return "gold";
}

function treasureAverage() {
  const { minimum, maximum } = treasureValueRange();
  return Math.round((minimum + maximum) / 2);
}

function curioChance() {
  const curio = BALANCE_CONFIG.curio;
  const misses = Math.max(0, player.curioMisses);
  return curio.maxChance - ((curio.maxChance - curio.baseChance) * curio.missDecay ** misses);
}

function upgradeLabel(id) {
  return PROGRESSION_CONFIG.items[id]?.name || "Upgrade";
}

function exponentialCost(base, growth, step) {
  return calculateExponentialCost(base, growth, step);
}

function formatCurrency(value) {
  return formatCurrencyValue(value, BALANCE_CONFIG.currencySymbol);
}

function grantDebugCoins() {
  player.coins += 10000;
  player.mines += 5;
  render();
}

function startDeveloperBoard({ parcel = false } = {}) {
  const session = createBlankSession(parcel ? { rows: 25, cols: 25, mines: 90 } : { rows: 100, cols: 100, mines: 1500 }, {
    category: parcel ? BOARD_CATEGORIES.districtParcel : BOARD_CATEGORIES.devTest,
    owner: { type: "developer", id: parcel ? "parcel-smoke" : "large-smoke" },
    seed: `developer:${parcel ? "parcel" : "large"}:${Date.now()}`,
    parcelId: parcel ? "developer-parcel" : null,
  });
  session.developerTest = true;
  statusElement.textContent = parcel ? "Developer Parcel Board ready." : "Developer large Board ready.";
  render();
}

function formatPercent(value, decimals = 0) {
  return `${(value * 100).toFixed(decimals)}%`;
}

function formatDuration(milliseconds) {
  return `${(milliseconds / 1000).toFixed(2)}s`;
}

function formatClock(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatFlagCountdown(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function randomInteger(minimum, maximum) {
  return chooseRandomInteger(minimum, maximum, () => Math.random());
}

function clamp(value, min, max) {
  return clampValue(value, min, max);
}

function activateBoardCell(index) {
  const cell = board[index];
  if (!cell) return;
  if (cell.open && cell.adjacent > 0 && player.chordingUnlocked) {
    chordCell(index);
    return;
  }
  if (selectedEquipmentId) {
    useSelectedEquipment(index);
    return;
  }
  if (!cell.open) openCell(index);
}

function reorderInitiative({ group, draggedId, targetId }) {
  if (!autoMinersState || !draggedId || draggedId === targetId) return;
  const order = autoMinersState.initiative[group];
  if (!Array.isArray(order)) return;
  const from = order.indexOf(draggedId);
  const to = order.indexOf(targetId);
  if (from < 0 || to < 0) return;
  order.splice(from, 1);
  order.splice(to, 0, draggedId);
  render();
}

function reduceRuntimeAction(state, action) {
  if (action.type === "replaceState") return action.state;
  const handler = GAME_ACTION_HANDLERS[action.type];
  if (!handler) return state;
  handler(action.payload || {});
  const snapshot = captureGameState();
  return {
    state: snapshot,
    effects: [{ type: "notice", notice: { code: "literal", args: { text: statusElement.textContent } } }],
  };
}

const GAME_ACTION_HANDLERS = {
  "board/activate": ({ index }) => activateBoardCell(index),
  "board/flag": ({ index }) => toggleFlag(index),
  "settings/change": applySettingsFromControls,
  "settings/toggle": () => {
    fieldSpecificationMenuElement.hidden = !fieldSpecificationMenuElement.hidden;
    fieldSpecificationToggleButton.setAttribute("aria-expanded", String(!fieldSpecificationMenuElement.hidden));
    if (!fieldSpecificationMenuElement.hidden) {
      equipmentInventoryElement.hidden = true;
      equipmentToggleButton.setAttribute("aria-expanded", "false");
    }
  },
  "purchase/buy": ({ id }) => buyPurchase(id),
  "equipment/toggle": () => {
    if (specialEquipmentTotal() <= 0) return;
    equipmentInventoryElement.hidden = !equipmentInventoryElement.hidden;
    equipmentToggleButton.setAttribute("aria-expanded", String(!equipmentInventoryElement.hidden));
    if (!equipmentInventoryElement.hidden) {
      fieldSpecificationMenuElement.hidden = true;
      fieldSpecificationToggleButton.setAttribute("aria-expanded", "false");
    }
  },
  "equipment/activate": ({ id }) => activateEquipment(id),
  "contracts/accept": ({ id }) => acceptOfferedContract(id),
  "contracts/resume": ({ instanceId }) => {
    const instance = contractInstances[instanceId];
    if (instance) switchToBoardSession(instance.boardId);
  },
  "contracts/generate": generateContractOffer,
  "contracts/closeBriefing": closeContractBriefing,
  "challenges/generate": generateChallengeOffer,
  "challenges/claim": ({ id }) => claimChallengeReward(id),
  "autoMiners/showQueue": () => {
    if (currentView === "district") {
      returnToHomeBoard();
      return;
    }
    openDistrictMap();
  },
  "autoMiners/showField": switchToAutoMiners,
  "autoMiners/survey": surveyNow,
  "autoMiners/hire": ({ id }) => buyWorker(id),
  "autoMiners/hireExtra": ({ id }) => buyAdditionalWorker(id),
  "autoMiners/upgrade": ({ workerId }) => upgradeSpecificWorker(workerId),
  "autoMiners/setMode": ({ mode }) => {
    if (!["manual", "assist", "analyze"].includes(mode)) return;
    const session = currentBoardSession();
    if (!session) return;
    session.automation.interactionMode = mode;
    session.automation.findings = [];
    session.automation.reservations = {};
    if (mode === INTERACTION_MODES.manual) {
      Object.entries(autoMinersState.workerTasks).forEach(([workerId, task]) => {
        if (task.boardId === session.id) {
          delete autoMinersState.workerTasks[workerId];
          const worker = workerState.workersById[workerId];
          if (worker?.assignment?.type === "BOARD_AUTOMATION") {
            worker.status = "AVAILABLE";
            worker.assignment = null;
          }
        }
      });
    }
    autoMinersState.statusText = `${mode[0].toUpperCase()}${mode.slice(1)} automation selected.`;
    render();
  },
  "autoMiners/speculation": ({ enabled, threshold }) => {
    if (enabled !== undefined) {
      const nextEnabled = Boolean(enabled);
      if (nextEnabled && !autoMinersState.speculationInitialized) {
        autoMinersState.riskThreshold = GAME_CONFIG.automation.defaultRiskThreshold;
        autoMinersState.speculationInitialized = true;
      }
      autoMinersState.speculationEnabled = nextEnabled;
    }
    if (threshold !== undefined) autoMinersState.riskThreshold = clamp(Number(threshold), 0.01, 0.5);
    preferences.speculationEnabled = autoMinersState.speculationEnabled;
    preferences.riskThreshold = autoMinersState.riskThreshold;
    render();
  },
  "autoMiners/manualFlagReserve": ({ value }) => {
    flagPool = setManualFlagReserve(flagPool, value);
    preferences.manualFlagReserve = flagPool.manualFlagReserve;
    autoMinersState.statusText = `Manual Flag Reserve set to ${flagPool.manualFlagReserve}. ${workerUsableFlags(flagPool)} flags are worker-usable now.`;
    render();
  },
  "autoMiners/reorder": reorderInitiative,
  "autoMiners/dismissClear": () => {
    fieldClearModalElement.hidden = true;
    render();
  },
  "round/reset": handleRoundControl,
  "round/hint": () => useHint(),
  "progress/reset": resetProgress,
  "progress/restructurePreview": openRestructurePreview,
  "progress/restructureConfirm": performCorporateRestructure,
  "debug/grantCoins": grantDebugCoins,
  "timers/tick": ({ deltaMs = 1000 }) => {
    tickMessageBoard();
    tickReusableFlags(deltaMs);
    tickAutoMiners();
    tickDistrictRuntime(deltaMs);
  },
};

rowsInput.addEventListener("change", () => dispatchGameAction("settings/change"));
colsInput.addEventListener("change", () => dispatchGameAction("settings/change"));
minesInput.addEventListener("change", () => dispatchGameAction("settings/change"));
treasuresInput.addEventListener("change", () => dispatchGameAction("settings/change"));
fieldSpecificationToggleButton.addEventListener("click", () => dispatchGameAction("settings/toggle"));
buyShovelButton.addEventListener("click", () => dispatchGameAction("purchase/buy", { id: "supply:shovel" }));
buyFlagsButton.addEventListener("click", () => dispatchGameAction("purchase/buy", { id: "supply:flags" }));
buyHintsButton.addEventListener("click", () => dispatchGameAction("purchase/buy", { id: "supply:hints" }));
useHintButton.addEventListener("click", () => dispatchGameAction("round/hint"));
equipmentToggleButton.addEventListener("click", () => dispatchGameAction("equipment/toggle"));
upgradeElements.improveShovel.addEventListener("click", () => dispatchGameAction("purchase/buy", { id: "upgrade:improveShovel" }));
upgradeElements.addMine.addEventListener("click", () => dispatchGameAction("purchase/buy", { id: "upgrade:addMine" }));
upgradeElements.addTreasure.addEventListener("click", () => dispatchGameAction("purchase/buy", { id: "upgrade:addTreasure" }));
upgradeElements.treasureValue.addEventListener("click", () => dispatchGameAction("purchase/buy", { id: "upgrade:treasureValue" }));
upgradeElements.betterFlags.addEventListener("click", () => dispatchGameAction("purchase/buy", { id: "upgrade:betterFlags" }));
upgradeElements.mineYield.addEventListener("click", () => dispatchGameAction("purchase/buy", { id: "upgrade:mineYield" }));
upgradeElements.shovelCap.addEventListener("click", () => dispatchGameAction("purchase/buy", { id: "upgrade:shovelCapacity" }));
upgradeElements.flagCap.addEventListener("click", () => dispatchGameAction("purchase/buy", { id: "upgrade:flagCapacity" }));
upgradeElements.tallerGrid.addEventListener("click", () => dispatchGameAction("purchase/buy", { id: "upgrade:tallerGrid" }));
upgradeElements.widerGrid.addEventListener("click", () => dispatchGameAction("purchase/buy", { id: "upgrade:widerGrid" }));
abilityElements.safetyRadius.addEventListener("click", () => dispatchGameAction("purchase/buy", { id: "ability:safetyRadius" }));
abilityElements.chording.addEventListener("click", () => dispatchGameAction("purchase/buy", { id: "ability:chording" }));
messageBoardListElement.addEventListener("click", (event) => {
  const button = event.target.closest(".js-start-contract");
  if (button) dispatchGameAction("contracts/accept", { id: button.dataset.contractId });
  const resume = event.target.closest(".js-resume-contract");
  if (resume) dispatchGameAction("contracts/resume", { instanceId: resume.dataset.instanceId });
  const claim = event.target.closest(".js-claim-challenge");
  if (claim) dispatchGameAction("challenges/claim", { id: claim.dataset.challengeId });
});
districtButton.addEventListener("click", () => dispatchGameAction("autoMiners/showQueue"));
autoMinersButton.addEventListener("click", () => dispatchGameAction("autoMiners/showField"));
generateContractButton.addEventListener("click", () => dispatchGameAction("contracts/generate"));
generateChallengeButton.addEventListener("click", () => dispatchGameAction("challenges/generate"));
surveyNowButton.addEventListener("click", () => dispatchGameAction("autoMiners/survey"));
contractModalStartButton.addEventListener("click", () => dispatchGameAction("contracts/closeBriefing"));
fieldClearModalDismissButton.addEventListener("click", () => dispatchGameAction("autoMiners/dismissClear"));
resetButton.addEventListener("click", () => dispatchGameAction("round/reset"));
quartermasterPanelElement.addEventListener("pointerover", (event) => {
  const source = event.target.closest("[data-tooltip]");
  if (!source || !quartermasterPanelElement.contains(source) || source.contains(event.relatedTarget)) return;
  showQuartermasterTooltip(source);
});
quartermasterPanelElement.addEventListener("pointerout", (event) => {
  const source = event.target.closest("[data-tooltip]");
  if (source && source === quartermasterTooltipSource && !source.contains(event.relatedTarget)) hideQuartermasterTooltip();
});
quartermasterPanelElement.addEventListener("focusin", (event) => {
  const source = event.target.closest("[data-tooltip]");
  if (source && quartermasterPanelElement.contains(source)) showQuartermasterTooltip(source);
});
quartermasterPanelElement.addEventListener("focusout", (event) => {
  const source = event.target.closest("[data-tooltip]");
  if (source && source === quartermasterTooltipSource && !source.contains(event.relatedTarget)) hideQuartermasterTooltip();
});
quartermasterPanelElement.addEventListener("scroll", positionQuartermasterTooltip, { passive: true });
window.addEventListener("resize", positionQuartermasterTooltip);
document.addEventListener("pointermove", () => {
  // A completed tooltip stays visible while the pointer is still, then clears
  // as soon as the player moves it again.
  if (workerTooltipState?.pinned) hideWorkerTooltip();
});
boardElement.addEventListener("click", (event) => {
  if (currentView !== "district") return;
  const parcelButton = event.target.closest("[data-parcel-id]");
  if (parcelButton) {
    selectedParcelId = parcelButton.dataset.parcelId;
    render();
    return;
  }
  const pan = event.target.closest("[data-pan]");
  if (pan) return panDistrict(pan.dataset.pan);
  if (event.target.closest("[data-recenter]")) {
    district.viewport.x = 0;
    district.viewport.y = 0;
    render();
    return;
  }
  const survey = event.target.closest("[data-survey-parcel]");
  if (survey) return startParcelSurvey(survey.dataset.surveyParcel);
  const clear = event.target.closest("[data-clear-parcel]");
  if (clear) return startParcelClearance(clear.dataset.clearParcel, Number(clear.dataset.workerCount));
  const excavate = event.target.closest("[data-excavate-parcel]");
  if (excavate) return beginParcelBoard(excavate.dataset.excavateParcel);
  const resume = event.target.closest("[data-resume-board]");
  if (resume) return switchToBoardSession(resume.dataset.resumeBoard);
  const recover = event.target.closest("[data-recover-parcel]");
  if (recover) return startParcelRecovery(recover.dataset.recoverParcel, Number(recover.dataset.workerCount));
});
resetProgressButton.addEventListener("click", () => {
  if (window.confirm("Delete all progress, permanent collections, and records? This cannot be undone.")) dispatchGameAction("progress/reset");
});
boardElement.addEventListener("scroll", () => {
  if (!boardElement.classList.contains("is-virtual") || virtualScrollFrame) return;
  virtualScrollFrame = window.requestAnimationFrame(() => {
    virtualScrollFrame = 0;
    render();
  });
});
restructureProgressButton.addEventListener("click", () => dispatchGameAction("progress/restructurePreview"));
restructureCancelButton.addEventListener("click", () => { restructureModalElement.hidden = true; });
restructureConfirmButton.addEventListener("click", () => dispatchGameAction("progress/restructureConfirm"));
speculationEnabledElement.addEventListener("change", () => dispatchGameAction("autoMiners/speculation", { enabled: speculationEnabledElement.checked }));
speculationThresholdElement.addEventListener("input", () => {
  speculationThresholdValueElement.textContent = `${speculationThresholdElement.value}%`;
});
speculationThresholdElement.addEventListener("change", () => dispatchGameAction("autoMiners/speculation", { threshold: Number(speculationThresholdElement.value) / 100 }));
manualFlagReserveElement.addEventListener("input", () => {
  manualFlagReserveValueElement.textContent = manualFlagReserveElement.value;
});
manualFlagReserveElement.addEventListener("change", () => dispatchGameAction("autoMiners/manualFlagReserve", { value: Number(manualFlagReserveElement.value) }));
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !fieldSpecificationMenuElement.hidden) {
    fieldSpecificationMenuElement.hidden = true;
    fieldSpecificationToggleButton.setAttribute("aria-expanded", "false");
    fieldSpecificationToggleButton.focus();
    return;
  }
  if (event.shiftKey && event.key.toLowerCase() === "g") {
    event.preventDefault();
    dispatchGameAction("debug/grantCoins");
  }
  if (event.shiftKey && event.key.toLowerCase() === "l") {
    event.preventDefault();
    startDeveloperBoard();
  }
  if (event.shiftKey && event.key.toLowerCase() === "p") {
    event.preventDefault();
    startDeveloperBoard({ parcel: true });
  }
});
function initializeApplication() {
  bindSaveControls({
    captureState: captureGameState,
    replaceState: (state) => {
      saveReady = true;
      replaceGameState(state);
      stateEngine.dispatch({ type: "replaceState", state });
      saveNow();
    },
    showNotice: showSaveNotice,
  });

  let restored = null;
  let restoreFailed = false;
  try {
    restored = loadStoredSave();
  } catch (error) {
    restoreFailed = true;
    showSaveNotice(`Saved data could not be loaded: ${error.message}`);
  }

  if (restored) replaceGameState(restored);
  else startGame();

  saveReady = !restoreFailed;
  if (saveReady) saveNow();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveNow();
  });
  window.addEventListener("beforeunload", saveNow);
  window.setInterval(() => dispatchGameAction("timers/tick", { deltaMs: 500 }), 500);
}

initializeApplication();
