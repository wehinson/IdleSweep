import test from "node:test";
import assert from "node:assert/strict";
import { hydrateSave, serializeSave, validateSave } from "../src/persistence/save-schema.js";
import { parseImportedSave } from "../src/persistence/storage.js";
import { createDeveloperTelemetry, restartDeveloperRun } from "../src/engine/developer-telemetry.js";
import config from "../config.js";
import { createDistrict } from "../src/engine/district.js";

function modeState(rows = 3, cols = 3) {
  return {
    board: Array.from({ length: rows * cols }, (_, index) => ({ index, row: Math.floor(index / cols), col: index % cols })),
    settings: { rows, cols, mines: 1 },
    roundElapsedMs: 321,
    recentlyRevealed: [1],
    treasurePopups: [[2, 10]],
  };
}

function gameState() {
  const developerTelemetry = createDeveloperTelemetry();
  restartDeveloperRun(developerTelemetry, { rows: 3, cols: 3, mines: 1 }, 1000);
  return {
    player: {
      coins: 25,
      shovels: 1,
      flags: 2,
      mines: 0,
      shovelUses: 5,
      specialEquipment: {},
      specialists: {},
      contracts: { offeredIds: [], active: null },
    },
    settings: { rows: 3, cols: 3, mines: 1 },
    currentMode: "board",
    fieldQueue: modeState(),
    autoMiners: {
      workerTargets: {},
      initiative: { agents: [], specialists: [] },
      surveyElapsedMs: 500,
      workerElapsedMs: 1000,
    },
    messageBoard: { challenges: [], nextChallengeInMs: 5000 },
    timers: { challengeTickElapsedMs: 0 },
    developerTelemetry,
  };
}

test("save state round-trips as plain JSON", () => {
  const text = serializeSave(gameState(), () => new Date("2026-01-01T00:00:00.000Z"));
  const parsed = JSON.parse(text);
  validateSave(parsed);
  const hydrated = hydrateSave(parsed);
  assert.equal(parsed.schemaVersion, 4);
  assert.deepEqual(Object.keys(parsed.state).sort(), ["preferences", "profile", "run"]);
  assert.equal(hydrated.player.coins, 25);
  assert.equal(hydrated.profile.hints, 0);
  assert.equal(hydrated.runMeta.ordinal, 1);
  assert.deepEqual(hydrated.fieldQueue.settings, gameState().fieldQueue.settings);
});

test("v1 migration preserves the visible board and converts workers and contracts while deleting the queue", () => {
  const legacyState = gameState();
  legacyState.player.specialists = { surveyor: 7, excavator: 3 };
  legacyState.player.contracts.active = { id: "abandonedYard", previousSettings: { rows: 3, cols: 3, mines: 1 } };
  legacyState.currentMode = "fieldQueue";
  legacyState.autoMiners.queue = [modeState(), modeState(4, 4)];
  legacyState.autoMiners.workerFields = { surveyor: 0, excavator: 1 };
  const legacyDocument = {
    format: "idle-sweep-save",
    schemaVersion: 1,
    exportedAt: "2026-01-01T00:00:00.000Z",
    state: legacyState,
  };

  const migrated = hydrateSave(legacyDocument);

  assert.equal(migrated.currentMode, "board");
  assert.equal(migrated.currentBoardId, "main-board");
  assert.deepEqual(migrated.boardSessions["main-board"].modeState.settings, legacyState.fieldQueue.settings);
  assert.equal(migrated.boardSessions["main-board"].category, "STANDARD_CONTRACT");
  assert.equal("queue" in migrated.autoMiners, false);
  assert.deepEqual(migrated.autoMiners.workerTasks, {});
  assert.equal(Object.values(migrated.autoMiners.workerTargets).every((target) => target === null), true);
  assert.equal(migrated.workerState.workerTypes.surveyor.level, 0);
  assert.equal(migrated.workerState.workerTypes.excavator.level, 0);
  assert.equal(Object.keys(migrated.workerState.workersById).length, 0);
  assert.equal(Object.values(migrated.contractInstances)[0].typeId, "abandonedYard");
  assert.match(migrated.schemaMigrationNotice, /Workers and High Score started fresh/);
  assert.equal(migrated.runMeta.currentHighScore, null);
});

test("v3 migration preserves free automatic flags and blocks over-capacity placement", () => {
  const original = gameState();
  original.player.flagCapacityLevel = 0;
  original.player.flags = 9;
  original.boardSessions = {
    retained: {
      id: "retained",
      category: "STANDARD",
      owner: { type: "main", id: "main" },
      seed: "legacy-flags",
      settings: { rows: 4, cols: 4, mines: 1 },
      status: "COMMITTED",
      initialMineCount: 1,
      modeState: modeState(4, 4),
      automation: { interactionMode: "assist", mutationRevision: 0, reservations: {}, findings: [], stalled: false, stallStartedAt: null, speculativeGuessCount: 0 },
      entrances: [],
      campDiscovery: false,
      contractInstanceId: null,
      parcelId: null,
      digBudget: null,
      createdOrdinal: 1,
    },
  };
  original.boardSessions.retained.modeState.board.forEach((cell) => Object.assign(cell, { flagged: true, flaggedByWorker: true }));
  const v3 = JSON.parse(serializeSave(original));
  v3.schemaVersion = 3;
  delete v3.state.run.flagPool;
  const migrated = hydrateSave(v3);
  assert.equal(migrated.flagPool.maximumFlags, 15);
  assert.equal(migrated.flagPool.availableFlags, 0);
  assert.equal(migrated.flagPool.missingFlags, 0);
  assert.equal(migrated.flagPool.migrationOverCapacity, true);
  assert.match(migrated.schemaMigrationNotice, /temporarily over capacity/);
});

test("v2 migration preserves inventory and resets workers, blueprints, telemetry detail, and High Score", () => {
  const state = gameState();
  state.player.hints = 7;
  state.player.curios = [2, 0, 0];
  state.player.stats = { boardsCompleted: 12, currentWinStreak: 4 };
  state.player.specialists = { surveyor: 6 };
  state.developerTelemetry.currentAttempt.actions = [{ actionType: "dig" }];
  const migrated = hydrateSave({ format: "idle-sweep-save", schemaVersion: 2, exportedAt: "2026-01-01T00:00:00.000Z", state });
  assert.equal(migrated.player.coins, 25);
  assert.equal(migrated.player.hints, 7);
  assert.deepEqual(migrated.player.curios, [2, 0, 0]);
  assert.equal(migrated.player.stats.currentWinStreak, 4);
  assert.equal(Object.keys(migrated.workerState.workersById).length, 0);
  assert.deepEqual(migrated.profile.blueprintLibrary.ownedIds, []);
  assert.equal(migrated.profile.allTimeHighScore, null);
  assert.equal("actions" in migrated.developerTelemetry.currentAttempt, false);
});

test("save validation rejects malformed boards and future versions", () => {
  const parsed = JSON.parse(serializeSave(gameState()));
  parsed.state.run.fieldQueue.board.pop();
  assert.throws(() => validateSave(parsed), /board size/);
  parsed.state.run.fieldQueue = modeState();
  parsed.schemaVersion = 99;
  assert.throws(() => validateSave(parsed), /newer game version/);
});

test("save validation rejects non-JSON values", () => {
  const state = gameState();
  state.player.bad = new Set([1]);
  assert.throws(() => serializeSave(state), /non-JSON value/);
});

test("import rejects corrupted JSON without producing replacement state", () => {
  assert.throws(() => parseImportedSave('{"format":'), SyntaxError);
});

test("save validation rejects unknown catalog identifiers", () => {
  const parsed = JSON.parse(serializeSave(gameState()));
  parsed.state.profile.specialEquipment.unknownTool = 1;
  assert.throws(() => validateSave(parsed), /Unknown special equipment id/);
});

test("save validation rejects a corrupted District coordinate index", () => {
  const state = gameState();
  state.district = createDistrict(config.district, { seed: "corrupt-index" });
  const parsed = JSON.parse(serializeSave(state));
  parsed.state.run.district.parcelCoordinateIndex["4,8"] = "missing-parcel";
  assert.throws(() => validateSave(parsed), /Duplicate or invalid Parcel coordinate/);
});
