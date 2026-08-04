import test from "node:test";
import assert from "node:assert/strict";
import {
  BOARD_CATEGORIES,
  CAMP_PHASES,
  acceptCampContract,
  commitCampEligibleAttempt,
  createCampEntrances,
  createCampProgression,
  createEntrance,
  protectedEntranceIndexes,
  resolveCampAttempt,
  resolveCampDiscovery,
} from "../src/engine/camp-progression.js";

const config = { firstEligibleAttempt: 100, retryMinimum: 25, retryMaximum: 75, debugDelay: 5 };

test("Camp discovery activates on the 100th eligible board and excludes Parcel boards", () => {
  let state = createCampProgression(config);
  for (let index = 1; index < 100; index += 1) {
    state = commitCampEligibleAttempt(state, { boardId: `b${index}`, category: BOARD_CATEGORIES.standard }).progression;
  }
  state = commitCampEligibleAttempt(state, { boardId: "parcel", category: BOARD_CATEGORIES.districtParcel }).progression;
  assert.equal(state.eligibleAttemptCount, 99);
  const result = commitCampEligibleAttempt(state, { boardId: "b100", category: BOARD_CATEGORIES.standardContract });
  assert.equal(result.discoveryActivated, true);
  assert.equal(result.progression.phase, CAMP_PHASES.discoveryActive);
  assert.equal(result.progression.activeDiscoveryBoardId, "b100");
});

test("Camp failures schedule one persisted retry and Camp victory unlocks Districts", () => {
  let state = { ...createCampProgression(config), phase: CAMP_PHASES.discoveryActive, eligibleAttemptCount: 100, activeDiscoveryBoardId: "x" };
  state = resolveCampDiscovery(state, { boardId: "x", won: false, rng: () => 0, config });
  assert.equal(state.nextCampDiscoveryAt, 125);
  assert.equal(state.failureCount, 1);
  state = { ...state, phase: CAMP_PHASES.contractAvailable };
  state = acceptCampContract(state, "camp-contract");
  state = resolveCampAttempt(state, { won: true, rng: () => 0, config });
  assert.equal(state.phase, CAMP_PHASES.districtUnlocked);
  assert.equal(state.nextCampDiscoveryAt, null);
});

test("entrances are contiguous, protected, and Camp omits the bottom edge", () => {
  const entrance = createEntrance({ rows: 10, cols: 15 }, () => 0.4, { widths: [2, 3] });
  assert.ok([2, 3].includes(entrance.width));
  assert.equal(entrance.indexes.length, entrance.width);
  const camp = createCampEntrances({ rows: 10, cols: 15 }, () => 0.2);
  assert.deepEqual(camp.map((item) => item.edge), ["top", "left", "right"]);
  assert.equal(protectedEntranceIndexes(camp).size, camp.reduce((sum, item) => sum + item.width, 0));
});
