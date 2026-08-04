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
  assert.deepEqual(hydrateSave(parsed), gameState());
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
  assert.equal(migrated.workerState.workerTypes.surveyor.level, 7);
  assert.equal(migrated.workerState.workerTypes.excavator.level, 3);
  assert.equal(Object.values(migrated.workerState.workersById).filter((worker) => worker.typeId === "surveyor").length, 1);
  assert.equal(Object.values(migrated.contractInstances)[0].typeId, "abandonedYard");
  assert.match(migrated.schemaMigrationNotice, /Districts replaced Field Queue/);
});

test("save validation rejects malformed boards and future versions", () => {
  const parsed = JSON.parse(serializeSave(gameState()));
  parsed.state.fieldQueue.board.pop();
  assert.throws(() => validateSave(parsed), /board size/);
  parsed.state.fieldQueue = modeState();
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
  parsed.state.player.specialEquipment.unknownTool = 1;
  assert.throws(() => validateSave(parsed), /Unknown special equipment id/);
});

test("save validation rejects a corrupted District coordinate index", () => {
  const state = gameState();
  state.district = createDistrict(config.district, { seed: "corrupt-index" });
  const parsed = JSON.parse(serializeSave(state));
  parsed.state.district.parcelCoordinateIndex["4,8"] = "missing-parcel";
  assert.throws(() => validateSave(parsed), /Duplicate or invalid Parcel coordinate/);
});
