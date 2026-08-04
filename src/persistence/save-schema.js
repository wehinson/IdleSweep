import config from "../../config.js";
import { SPECIAL_EQUIPMENT, SPECIALISTS } from "../engine/catalogs.js";
import { createCampProgression } from "../engine/camp-progression.js";
import { validateDistrict } from "../engine/district.js";
import { createWorkerState } from "../engine/workers.js";

export const SAVE_FORMAT = "idle-sweep-save";
export const SAVE_SCHEMA_VERSION = 2;

export function serializeSave(state, now = () => new Date()) {
  const document = {
    format: SAVE_FORMAT,
    schemaVersion: SAVE_SCHEMA_VERSION,
    exportedAt: now().toISOString(),
    state,
  };
  validateSave(document);
  return JSON.stringify(document, null, 2);
}

export function migrateSave(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error("The selected file is not a save document.");
  }
  if (document.format !== SAVE_FORMAT) throw new Error("This is not an Idle Sweep save file.");
  if (document.schemaVersion > SAVE_SCHEMA_VERSION) throw new Error("This save was created by a newer game version.");
  if (document.schemaVersion === 1) return migrateVersionOne(document);
  if (document.schemaVersion !== SAVE_SCHEMA_VERSION) throw new Error("This save version is not supported.");
  return document;
}

export function validateSave(input) {
  const document = migrateSave(input);
  const { state } = document;
  assertPlainObject(state, "state");
  assertPlainObject(state.player, "state.player");
  assertPlainObject(state.settings, "state.settings");
  assertPlainObject(state.messageBoard, "state.messageBoard");
  assertPlainObject(state.timers, "state.timers");
  if (state.developerTelemetry !== undefined) validateDeveloperTelemetry(state.developerTelemetry);
  if (!new Set(["board", "district"]).has(state.currentMode)) throw new Error("The save contains an invalid game mode.");
  validateSettings(state.settings, "state.settings");
  if (state.fieldQueue !== null) validateModeState(state.fieldQueue, "state.fieldQueue");
  if (state.autoMiners !== null) validateAutoMiners(state.autoMiners);
  if (!Array.isArray(state.messageBoard.challenges)) throw new Error("The message board challenge list is invalid.");
  validatePlayer(state.player);
  validateMessageBoard(state.messageBoard);
  if (state.campProgression !== undefined) validateCampProgression(state.campProgression);
  if (state.workerState !== undefined) validateWorkerState(state.workerState);
  if (state.district !== undefined && state.district !== null) validateDistrict(state.district);
  if (state.boardSessions !== undefined) validateBoardSessions(state.boardSessions);
  if (state.contractInstances !== undefined) validateContractInstances(state.contractInstances, state.boardSessions || {});
  assertFiniteNonNegative(state.messageBoard.nextChallengeInMs, "next challenge timer");
  assertJsonValue(state, "state");
  return document;
}

function validateDeveloperTelemetry(telemetry) {
  assertPlainObject(telemetry, "state.developerTelemetry");
  if (telemetry.schemaVersion !== 1) throw new Error("The developer telemetry version is invalid.");
  assertFiniteNonNegative(telemetry.nextRunNumber, "developer telemetry run number");
  if (!Array.isArray(telemetry.completedRuns)) throw new Error("The developer telemetry run list is invalid.");
  if (telemetry.actions !== undefined && !Array.isArray(telemetry.actions)) throw new Error("The developer telemetry action list is invalid.");
  telemetry.completedRuns.forEach((run, index) => validateDeveloperRun(run, `state.developerTelemetry.completedRuns[${index}]`));
  if (telemetry.currentRun !== null) validateDeveloperRun(telemetry.currentRun, "state.developerTelemetry.currentRun");
  (telemetry.actions || []).forEach((action, index) => validateDeveloperAction(action, `state.developerTelemetry.actions[${index}]`));
}

function migrateVersionOne(document) {
  const state = structuredCloneSafe(document.state);
  const mainBoardId = "main-board";
  const mainMode = state.fieldQueue || null;
  const activeContractId = state.player?.contracts?.active?.id || null;
  const migratedContractInstanceId = activeContractId ? `contract-${activeContractId}-migrated` : null;
  state.schemaMigrationNotice = state.autoMiners?.queue?.length
    ? "Queued Field boards were retired when Districts replaced Field Queue. Your visible board, workers, and resources were preserved."
    : null;
  state.currentMode = "board";
  state.currentView = "board";
  state.currentBoardId = mainBoardId;
  state.boardSessions = mainMode ? {
    [mainBoardId]: {
      id: mainBoardId,
      category: activeContractId ? "STANDARD_CONTRACT" : "STANDARD",
      owner: activeContractId ? { type: "contract", id: activeContractId } : { type: "main", id: "main" },
      seed: `migrated:${document.exportedAt || "v1"}`,
      settings: { ...mainMode.settings },
      status: legacyBoardStatus(mainMode),
      modeState: mainMode,
      entrances: [],
      campDiscovery: false,
      contractInstanceId: migratedContractInstanceId,
      parcelId: null,
      digBudget: null,
      createdOrdinal: 0,
    },
  } : {};
  state.campProgression = createCampProgression(config.campDiscovery);
  state.district = null;
  state.workerState = createWorkerState(SPECIALISTS, state.player?.specialists || {});
  state.contractInstances = {};
  state.nextBoardOrdinal = 1;
  state.nextContractInstanceOrdinal = 1;
  if (activeContractId && mainMode) {
    state.contractInstances[migratedContractInstanceId] = {
      id: migratedContractInstanceId,
      typeId: activeContractId,
      boardId: mainBoardId,
      status: "ACCEPTED",
      special: false,
    };
  }
  state.autoMiners = state.autoMiners ? {
    ...state.autoMiners,
    workerTasks: {},
    workerTargets: Object.fromEntries(Object.keys(state.workerState.workersById).map((workerId) => [workerId, null])),
  } : null;
  if (state.autoMiners) {
    delete state.autoMiners.queue;
    delete state.autoMiners.workerFields;
  }
  state.fieldQueue = mainMode;
  return { ...document, schemaVersion: 2, state };
}

function legacyBoardStatus(mode) {
  if (!mode.roundStarted) return "PREVIEW";
  if (!mode.roundResolved && !mode.gameOver) return "COMMITTED";
  if (mode.board.some((cell) => cell.mine && cell.open)) return "LOST";
  if (mode.board.every((cell) => cell.mine || cell.open)) return "WON";
  return "LOST";
}

function validateCampProgression(progression) {
  assertPlainObject(progression, "state.campProgression");
  if (!new Set(["LOCKED_COUNTDOWN", "CAMP_DISCOVERY_ACTIVE", "CAMP_CONTRACT_AVAILABLE", "CAMP_ATTEMPT_ACTIVE", "DISTRICT_UNLOCKED"]).has(progression.phase)) {
    throw new Error("The Camp progression phase is invalid.");
  }
  assertFiniteNonNegative(progression.eligibleAttemptCount, "Camp eligible attempt count");
  assertFiniteNonNegative(progression.failureCount, "Camp failure count");
  if (progression.nextCampDiscoveryAt !== null) assertFiniteNonNegative(progression.nextCampDiscoveryAt, "next Camp discovery target");
}

function validateWorkerState(workerState) {
  assertPlainObject(workerState, "state.workerState");
  assertPlainObject(workerState.workerTypes, "state.workerState.workerTypes");
  assertPlainObject(workerState.workersById, "state.workerState.workersById");
  const specialistIds = new Set(SPECIALISTS.map((item) => item.id));
  for (const [id, worker] of Object.entries(workerState.workersById)) {
    assertPlainObject(worker, `state.workerState.workersById.${id}`);
    if (!specialistIds.has(worker.typeId)) throw new Error(`Unknown worker type: ${worker.typeId}`);
    if (!new Set(["AVAILABLE", "ASSIGNED"]).has(worker.status)) throw new Error(`Invalid worker status: ${worker.status}`);
  }
}

function validateBoardSessions(boardSessions) {
  assertPlainObject(boardSessions, "state.boardSessions");
  const categories = new Set(["STANDARD", "STANDARD_CONTRACT", "CAMP_CONTRACT", "DISTRICT_PARCEL", "DEV_TEST"]);
  const statuses = new Set(["PREVIEW", "COMMITTED", "WON", "LOST"]);
  for (const [id, session] of Object.entries(boardSessions)) {
    assertPlainObject(session, `state.boardSessions.${id}`);
    if (session.id !== id) throw new Error(`Board session key does not match its id: ${id}`);
    if (!categories.has(session.category)) throw new Error(`Unknown board category: ${session.category}`);
    if (!statuses.has(session.status)) throw new Error(`Unknown board status: ${session.status}`);
    assertPlainObject(session.owner, `state.boardSessions.${id}.owner`);
    validateSettings(session.settings, `state.boardSessions.${id}.settings`);
    if (session.modeState !== null) validateModeState(session.modeState, `state.boardSessions.${id}.modeState`);
  }
}

function validateContractInstances(instances, boardSessions) {
  assertPlainObject(instances, "state.contractInstances");
  const typeIds = new Set([...config.contracts.types.map((type) => type.id), config.campDiscovery.contract.id]);
  const statuses = new Set(["ACCEPTED", "COMPLETED", "FAILED"]);
  const acceptedTypes = new Set();
  for (const [id, instance] of Object.entries(instances)) {
    assertPlainObject(instance, `state.contractInstances.${id}`);
    if (instance.id !== id || !typeIds.has(instance.typeId) || !statuses.has(instance.status)) {
      throw new Error(`Invalid Contract instance: ${id}`);
    }
    if (!boardSessions[instance.boardId]) throw new Error(`Contract instance ${id} references a missing board.`);
    if (instance.status === "ACCEPTED") {
      if (acceptedTypes.has(instance.typeId)) throw new Error(`Duplicate accepted Contract type: ${instance.typeId}`);
      acceptedTypes.add(instance.typeId);
    }
  }
}

function validateDeveloperAction(action, path) {
  assertPlainObject(action, path);
  if (!new Set(["player", "worker"]).has(action.actor)) throw new Error(`${path}.actor is invalid.`);
  if (typeof action.actionType !== "string" || !action.actionType) throw new Error(`${path}.actionType is invalid.`);
  assertPlainObject(action.target, `${path}.target`);
  for (const key of ["index", "row", "col"]) assertFiniteNonNegative(action.target[key], `${path}.target.${key}`);
  assertFiniteNonNegative(action.timeMs, `${path}.timeMs`);
  if (!Array.isArray(action.evidence)) throw new Error(`${path}.evidence is invalid.`);
  assertPlainObject(action.result, `${path}.result`);
}

function validateDeveloperRun(run, path) {
  assertPlainObject(run, path);
  if (typeof run.id !== "string" || !run.id) throw new Error(`${path}.id is invalid.`);
  if (!new Set(["in_progress", "cleared", "mine_hit", "contract_completed", "abandoned"]).has(run.outcome)) {
    throw new Error(`${path}.outcome is invalid.`);
  }
  assertPlainObject(run.board, `${path}.board`);
  assertPlainObject(run.equipmentUses, `${path}.equipmentUses`);
  assertPlainObject(run.purchases, `${path}.purchases`);
  for (const key of ["runNumber", "startedAtEpochMs", "digActions", "revealCount", "flagPlacements", "flagRemovals", "chordUses", "mineHits", "shovelDurabilityConsumed", "shovelsConsumed", "coinsEarned", "recoveredMinesEarned"]) {
    assertFiniteNonNegative(run[key], `${path}.${key}`);
  }
  for (const key of ["rows", "cols", "mines"]) assertFiniteNonNegative(run.board[key], `${path}.board.${key}`);
  for (const [key, value] of Object.entries(run.equipmentUses)) assertFiniteNonNegative(value, `${path}.equipmentUses.${key}`);
  for (const [key, value] of Object.entries(run.purchases)) assertFiniteNonNegative(value, `${path}.purchases.${key}`);
  for (const key of ["endedAtEpochMs", "durationMs", "contractCompletionTimeMs", "firstPurchaseTimeMs"]) {
    if (run[key] !== null) assertFiniteNonNegative(run[key], `${path}.${key}`);
  }
}

function validatePlayer(player) {
  for (const key of ["coins", "shovels", "flags", "mines", "shovelUses"]) {
    assertFiniteNonNegative(player[key], `player.${key}`);
  }
  if (player.hints !== undefined) assertFiniteNonNegative(player.hints, "player.hints");
  assertPlainObject(player.specialEquipment, "player.specialEquipment");
  assertPlainObject(player.specialists, "player.specialists");
  assertPlainObject(player.contracts, "player.contracts");
  const equipmentIds = new Set(SPECIAL_EQUIPMENT.map((item) => item.id));
  const specialistIds = new Set(SPECIALISTS.map((item) => item.id));
  Object.entries(player.specialEquipment).forEach(([id, count]) => {
    if (!equipmentIds.has(id)) throw new Error(`Unknown special equipment id: ${id}`);
    assertFiniteNonNegative(count, `special equipment ${id}`);
  });
  Object.entries(player.specialists).forEach(([id, level]) => {
    if (!specialistIds.has(id)) throw new Error(`Unknown specialist id: ${id}`);
    assertFiniteNonNegative(level, `specialist ${id}`);
  });
  const contractIds = new Set(config.contracts.types.map((item) => item.id));
  const offeredIds = player.contracts.offeredIds || [];
  if (!Array.isArray(offeredIds) || offeredIds.some((id) => !contractIds.has(id))) throw new Error("The save contains an unknown contract offer.");
  if (player.contracts.active?.id && !contractIds.has(player.contracts.active.id)) throw new Error("The save contains an unknown active contract.");
}

function validateMessageBoard(messageBoard) {
  const challengeIds = new Set(config.messageBoard.challenges.types.map((item) => item.id));
  if (messageBoard.challenges.length > config.messageBoard.challenges.maxActive) throw new Error("The message board contains too many challenges.");
  messageBoard.challenges.forEach((challenge) => {
    assertPlainObject(challenge, "challenge");
    if (!challengeIds.has(challenge.type)) throw new Error(`Unknown challenge type: ${challenge.type}`);
    assertFiniteNonNegative(challenge.expiresInMs, "challenge expiry");
  });
}

export function hydrateSave(input) {
  const document = validateSave(migrateSave(input));
  return structuredCloneSafe(document.state);
}

function validateAutoMiners(autoMiners) {
  assertPlainObject(autoMiners, "state.autoMiners");
  if (autoMiners.queue !== undefined && (!Array.isArray(autoMiners.queue) || autoMiners.queue.length > 0)) throw new Error("Retired queued boards cannot appear in a v2 save.");
  assertPlainObject(autoMiners.workerTargets || {}, "state.autoMiners.workerTargets");
  assertPlainObject(autoMiners.initiative, "state.autoMiners.initiative");
  const specialistIds = new Set(SPECIALISTS.map((item) => item.id));
  Object.entries(autoMiners.workerTargets || {}).forEach(([id, targetId]) => {
    const instanceType = id.replace(/-\d+$/, "");
    if (!specialistIds.has(id) && !specialistIds.has(instanceType)) throw new Error(`Unknown Auto Miner specialist id: ${id}`);
    if (targetId !== null && typeof targetId !== "string") throw new Error(`Auto Miner target for ${id} is invalid.`);
  });
  for (const group of ["agents", "specialists"]) {
    if (!Array.isArray(autoMiners.initiative[group]) || autoMiners.initiative[group].some((id) => !specialistIds.has(id))) {
      throw new Error(`The Auto Miner ${group} initiative is invalid.`);
    }
  }
  assertFiniteNonNegative(autoMiners.surveyElapsedMs, "Surveyor timer");
  assertFiniteNonNegative(autoMiners.workerElapsedMs, "worker timer");
  if (autoMiners.automationMode !== undefined && !new Set(["manual", "assist", "analyze"]).has(autoMiners.automationMode)) {
    throw new Error("The Auto Miner automation mode is invalid.");
  }
  if (autoMiners.workerPolicies !== undefined) {
    assertPlainObject(autoMiners.workerPolicies, "Auto Miner worker policies");
    Object.entries(autoMiners.workerPolicies).forEach(([id, policy]) => {
      if (!new Set(["excavator", "flagbearer"]).has(id) || !new Set(["focus", "jump"]).has(policy)) {
        throw new Error("The Auto Miner worker policy is invalid.");
      }
    });
  }
}

function validateModeState(mode, path) {
  assertPlainObject(mode, path);
  validateSettings(mode.settings, `${path}.settings`);
  if (!Array.isArray(mode.board) || mode.board.length !== mode.settings.rows * mode.settings.cols) {
    throw new Error(`${path} has an invalid board size.`);
  }
  mode.board.forEach((cell, index) => {
    if (mode.boardEncoding === 1) {
      if (!Array.isArray(cell) || cell.length !== 4 || cell.some((value) => !Number.isFinite(value))) {
        throw new Error(`${path} has invalid compact cell data at ${index}.`);
      }
      return;
    }
    assertPlainObject(cell, `${path}.board[${index}]`);
    if (cell.index !== index) throw new Error(`${path} has invalid cell indexes.`);
  });
  assertFiniteNonNegative(mode.roundElapsedMs, `${path}.roundElapsedMs`);
  if (!Array.isArray(mode.recentlyRevealed) || !Array.isArray(mode.treasurePopups)) {
    throw new Error(`${path} contains invalid transient collections.`);
  }
  const equipmentIds = new Set(SPECIAL_EQUIPMENT.map((item) => item.id));
  if (mode.selectedEquipmentId !== null && mode.selectedEquipmentId !== undefined && !equipmentIds.has(mode.selectedEquipmentId)) {
    throw new Error(`${path} contains an unknown selected equipment id.`);
  }
}

function validateSettings(settings, path) {
  for (const key of ["rows", "cols", "mines"]) {
    if (!Number.isInteger(settings[key]) || settings[key] < 0) throw new Error(`${path}.${key} is invalid.`);
  }
  if (settings.rows < 1 || settings.cols < 1 || settings.mines > settings.rows * settings.cols) {
    throw new Error(`${path} contains impossible board dimensions.`);
  }
}

function assertPlainObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object.`);
}

function assertFiniteNonNegative(value, name) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative number.`);
}

function assertJsonValue(value, path) {
  if (value === null || ["string", "boolean"].includes(typeof value)) return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${path} contains a non-finite number.`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonValue(item, `${path}[${index}]`));
    return;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${path} contains a non-JSON value.`);
  Object.entries(value).forEach(([key, item]) => assertJsonValue(item, `${path}.${key}`));
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}
