import test from "node:test";
import assert from "node:assert/strict";
import config from "../config.js";
import {
  JOB_STATES,
  PARCEL_STATES,
  SURVEY_STATES,
  activeParcels,
  activateParcel,
  caveInParcel,
  createDistrict,
  secureParcel,
  startRecovery,
  startClearance,
  startSurvey,
  tickDistrict,
  validateDistrict,
} from "../src/engine/district.js";

test("District starts with a Secured Camp Parcel and three Unknown neighbors", () => {
  const district = createDistrict(config.district, { seed: "test" });
  const camp = district.parcelsById["camp-parcel"];
  assert.equal(camp.discoveryState, PARCEL_STATES.secured);
  assert.deepEqual(camp.passages, { north: true, east: true, south: false, west: true });
  assert.equal(Object.values(district.parcelsById).filter((parcel) => parcel.discoveryState === PARCEL_STATES.unknown).length, 3);
  assert.equal(validateDistrict(district), true);
});

test("survey timers freeze as remaining duration and reveal a persistent report", () => {
  let district = createDistrict(config.district, { seed: "survey" });
  const unknown = Object.values(district.parcelsById).find((parcel) => parcel.discoveryState === PARCEL_STATES.unknown);
  district = startSurvey(district, unknown.id, "surveyor-1", 60000);
  const reloaded = JSON.parse(JSON.stringify(district));
  assert.equal(reloaded.parcelsById[unknown.id].surveyRemainingMs, 60000);
  let result = tickDistrict(district, 59000, config.district);
  assert.equal(result.district.parcelsById[unknown.id].surveyStatus, SURVEY_STATES.inProgress);
  assert.equal(result.district.parcelsById[unknown.id].surveyRemainingMs, 1000);
  result = tickDistrict(result.district, 1000, config.district);
  const surveyed = result.district.parcelsById[unknown.id];
  assert.equal(surveyed.surveyStatus, SURVEY_STATES.complete);
  assert.ok(surveyed.surveyReport.mineDensity);
  assert.deepEqual(result.releasedWorkerIds, ["surveyor-1"]);
});

test("simultaneous surveys use start order for stable type numbering", () => {
  let district = createDistrict(config.district, { seed: "survey-order" });
  const [first, second] = Object.values(district.parcelsById)
    .filter((parcel) => parcel.discoveryState === PARCEL_STATES.unknown)
    .sort((left, right) => left.createdOrdinal - right.createdOrdinal);
  district.parcelsById[second.id].parcelType = first.parcelType;
  district.parcelsById[second.id].typeDisplayName = first.typeDisplayName;
  district = startSurvey(district, first.id, "surveyor-1", 1000);
  district = startSurvey(district, second.id, "surveyor-2", 1000);
  district = tickDistrict(district, 1000, config.district).district;
  assert.equal(district.parcelsById[first.id].typeSequenceNumber, 1);
  assert.equal(district.parcelsById[second.id].typeSequenceNumber, 2);
  assert.equal(district.parcelsById[first.id].displayName, `${first.typeDisplayName} 1`);
  assert.equal(district.parcelsById[second.id].displayName, `${first.typeDisplayName} 2`);
});

test("blocker reports are accurate and multiple Excavators divide clearance time", () => {
  let district = createDistrict(config.district, { seed: "blocker" });
  const unknown = Object.values(district.parcelsById).find((parcel) => parcel.discoveryState === PARCEL_STATES.unknown);
  district.parcelsById[unknown.id].accessibilityBlockers = [{ type: "flooding", resolved: false }];
  district.parcelsById[unknown.id].truth.hazards = ["Flooding"];
  district = startSurvey(district, unknown.id, "surveyor-1", 1);
  district = tickDistrict(district, 1, config.district).district;
  const surveyed = district.parcelsById[unknown.id];
  assert.equal(surveyed.discoveryState, PARCEL_STATES.surveyed);
  assert.deepEqual(surveyed.surveyReport.hazards, ["Flooding"]);
  assert.equal(surveyed.accessibilityBlockers[0].type, "flooding");
  district = startClearance(district, unknown.id, ["excavator-1", "excavator-2"], config.district.clearance.flooding);
  assert.equal(district.parcelsById[unknown.id].clearanceRemainingMs, 90000);
  const result = tickDistrict(district, 90000, config.district);
  assert.equal(result.district.parcelsById[unknown.id].clearanceState, JOB_STATES.idle);
  assert.equal(result.district.parcelsById[unknown.id].discoveryState, PARCEL_STATES.accessible);
  assert.deepEqual(result.releasedWorkerIds.sort(), ["excavator-1", "excavator-2"]);
});

test("securing Parcels expands coordinates without breaking reciprocity", () => {
  let district = createDistrict(config.district, { seed: "expansion" });
  const unknown = Object.values(district.parcelsById).find((parcel) => parcel.discoveryState === PARCEL_STATES.unknown);
  district = secureParcel(district, unknown.id, config.district);
  assert.ok(Object.keys(district.parcelsById).length >= 4);
  assert.equal(validateDistrict(district), true);
});

test("thousands of seeded expansions keep coordinates unique, passages reciprocal, and reloads stable", () => {
  let expansionCount = 0;
  let sawSouthernExpansion = false;
  for (let seedIndex = 0; seedIndex < 750; seedIndex += 1) {
    const seed = `property-${seedIndex}`;
    let district = createDistrict(config.district, { seed });
    assert.deepEqual(district, createDistrict(config.district, { seed }));
    const initialUnknownIds = Object.values(district.parcelsById)
      .filter((parcel) => parcel.discoveryState === PARCEL_STATES.unknown)
      .sort((left, right) => left.createdOrdinal - right.createdOrdinal)
      .map((parcel) => parcel.id);
    for (const parcelId of initialUnknownIds) {
      district = secureParcel(district, parcelId, config.district);
      expansionCount += 1;
      assert.equal(validateDistrict(district), true);
    }
    sawSouthernExpansion ||= Object.values(district.parcelsById).some((parcel) => parcel.mapY > 8);
    assert.equal(validateDistrict(JSON.parse(JSON.stringify(district))), true);
  }
  assert.equal(expansionCount, 2250);
  assert.equal(sawSouthernExpansion, true);
});

test("cave-in recovery uses remaining time and creates a new seed", () => {
  let district = createDistrict(config.district, { seed: "recovery" });
  const parcel = Object.values(district.parcelsById).find((item) => item.discoveryState === PARCEL_STATES.unknown);
  parcel.discoveryState = PARCEL_STATES.accessible;
  district = activateParcel(district, parcel.id);
  district = caveInParcel(district, parcel.id);
  const oldSeed = district.parcelsById[parcel.id].truth.boardSeed;
  district = startRecovery(district, parcel.id, ["excavator-1", "excavator-2"], config.district);
  let result = tickDistrict(district, 149999, config.district);
  assert.equal(result.district.parcelsById[parcel.id].discoveryState, PARCEL_STATES.cavedIn);
  result = tickDistrict(result.district, 1, config.district);
  assert.equal(result.district.parcelsById[parcel.id].discoveryState, PARCEL_STATES.accessible);
  assert.notEqual(result.district.parcelsById[parcel.id].truth.boardSeed, oldSeed);
  assert.deepEqual(result.releasedWorkerIds.sort(), ["excavator-1", "excavator-2"]);
  assert.equal(activeParcels(result.district).length, 0);
});
