import { chooseWeighted, createSeededRandom, createStableId, seededInteger } from "./seeded-random.js";

export const PARCEL_STATES = Object.freeze({
  unknown: "UNKNOWN",
  surveyed: "SURVEYED",
  accessible: "ACCESSIBLE",
  active: "ACTIVE",
  cavedIn: "CAVED_IN",
  secured: "SECURED",
});

export const SURVEY_STATES = Object.freeze({
  notStarted: "NOT_STARTED",
  inProgress: "IN_PROGRESS",
  complete: "COMPLETE",
});

export const JOB_STATES = Object.freeze({
  idle: "IDLE",
  inProgress: "IN_PROGRESS",
});

export const DIRECTIONS = Object.freeze(["north", "east", "south", "west"]);
export const DIRECTION_DELTAS = Object.freeze({
  north: { x: 0, y: -1 },
  east: { x: 1, y: 0 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 },
});
export const OPPOSITE_DIRECTION = Object.freeze({ north: "south", east: "west", south: "north", west: "east" });

const DIMENSION_LABELS = ["Small", "Medium", "Large", "Very large"];
const DENSITY_LABELS = ["Sparse", "Light", "Moderate", "Heavy", "Severe"];
const TREASURE_LABELS = ["Very low", "Low", "Moderate", "High", "Very high"];
const CURIO_LABELS = ["None detected", "Unlikely", "Possible", "Promising", "Exceptional"];
const PASSAGE_LABELS = [
  "No clear sign of further passages.",
  "A possible continuation may exist.",
  "Signs suggest more than one possible route.",
  "This Parcel appears likely to connect deeper into the District.",
];

export function coordinateKey(x, y) {
  return `${x},${y}`;
}

export function createDistrict(config, options = {}) {
  const seed = String(options.seed || `district-${Date.now()}`);
  const district = {
    id: options.id || createStableId("district", seed, 0),
    seed,
    viewport: { x: 0, y: 0, width: config.initialViewportWidth, height: config.initialViewportHeight },
    parcelsById: {},
    parcelCoordinateIndex: {},
    nextParcelOrdinal: 1,
    nextSurveyCompletionOrdinal: 1,
    typeSurveyCounts: {},
  };
  const camp = {
    id: "camp-parcel",
    districtId: district.id,
    mapX: 4,
    mapY: 8,
    parcelType: "campParcel",
    typeSequenceNumber: 1,
    displayName: "Camp Parcel",
    discoveryState: PARCEL_STATES.secured,
    surveyStatus: SURVEY_STATES.complete,
    surveyReport: {
      dimensions: "10 × 15 established camp",
      mineDensity: "Cleared",
      hazards: ["No known special hazard"],
      treasurePotential: "Excavated",
      curioPotential: "Excavated",
      passageHint: "Three established routes leave the Camp Parcel.",
    },
    truth: options.campTruth || { width: 15, height: 10, mineCount: 30, treasureCount: 1, curioCount: 0, boardSeed: `${seed}:camp` },
    boardId: options.campBoardId || null,
    boardState: options.campBoardState || null,
    passages: { north: true, east: true, south: false, west: true },
    spawnedFromParcelId: null,
    inboundDirections: [],
    accessibilityBlockers: [],
    assignedSurveyorId: null,
    assignedExcavatorIds: [],
    surveyRemainingMs: 0,
    clearanceState: JOB_STATES.idle,
    clearanceRemainingMs: 0,
    caveInRecoveryState: JOB_STATES.idle,
    caveInRecoveryRemainingMs: 0,
    caveInCount: 0,
    createdOrdinal: 0,
    surveyedOrdinal: 0,
  };
  addParcel(district, camp);
  for (const direction of ["north", "east", "west"]) ensurePassageDestination(district, camp.id, direction, config);
  return district;
}

export function spawnUnknownParcel(district, sourceParcelId, direction, config) {
  const next = clone(district);
  const parcel = spawnUnknownMutable(next, sourceParcelId, direction, config);
  return { district: next, parcel };
}

export function secureParcel(district, parcelId, config) {
  const next = clone(district);
  const parcel = next.parcelsById[parcelId];
  if (!parcel) throw new Error(`Unknown Parcel: ${parcelId}`);
  parcel.discoveryState = PARCEL_STATES.secured;
  parcel.securedOrdinal = parcel.securedOrdinal || next.nextSurveyCompletionOrdinal++;
  for (const direction of config.passageGeneration.directionOrder) {
    if (parcel.passages[direction]) ensurePassageDestinationMutable(next, parcelId, direction, config);
  }
  return next;
}

export function startSurvey(district, parcelId, workerId, durationMs) {
  const next = clone(district);
  const parcel = requiredParcel(next, parcelId);
  if (parcel.discoveryState !== PARCEL_STATES.unknown || parcel.surveyStatus !== SURVEY_STATES.notStarted) {
    throw new Error("Only an unsurveyed Unknown Parcel may be surveyed.");
  }
  parcel.surveyStatus = SURVEY_STATES.inProgress;
  parcel.assignedSurveyorId = workerId;
  parcel.surveyRemainingMs = Math.max(0, durationMs);
  parcel.surveyStartedOrdinal = next.nextSurveyCompletionOrdinal++;
  return next;
}

export function startClearance(district, parcelId, workerIds, blockerConfig) {
  const next = clone(district);
  const parcel = requiredParcel(next, parcelId);
  const blocker = parcel.accessibilityBlockers.find((item) => !item.resolved);
  if (parcel.discoveryState !== PARCEL_STATES.surveyed || !blocker) throw new Error("This Parcel has no unresolved accessibility blocker.");
  if (!workerIds.length) throw new Error("At least one Excavator is required.");
  parcel.assignedExcavatorIds = [...workerIds];
  parcel.clearanceState = JOB_STATES.inProgress;
  parcel.clearanceRemainingMs = blockerConfig.baseDurationMs / workerIds.length;
  return next;
}

export function beginExcavation(district, parcelId, boardId) {
  const next = clone(district);
  const parcel = requiredParcel(next, parcelId);
  if (parcel.discoveryState !== PARCEL_STATES.accessible) throw new Error("Only an Accessible Parcel may begin excavation.");
  parcel.boardId = boardId;
  return next;
}

export function activateParcel(district, parcelId) {
  const next = clone(district);
  const parcel = requiredParcel(next, parcelId);
  if (parcel.discoveryState !== PARCEL_STATES.accessible) return next;
  parcel.discoveryState = PARCEL_STATES.active;
  parcel.activatedOrdinal = next.nextSurveyCompletionOrdinal++;
  return next;
}

export function caveInParcel(district, parcelId) {
  const next = clone(district);
  const parcel = requiredParcel(next, parcelId);
  if (parcel.discoveryState !== PARCEL_STATES.active) return next;
  parcel.discoveryState = PARCEL_STATES.cavedIn;
  parcel.boardId = null;
  parcel.boardState = null;
  parcel.assignedExcavatorIds = [];
  parcel.caveInCount = (parcel.caveInCount || 0) + 1;
  return next;
}

export function startRecovery(district, parcelId, workerIds, config) {
  const next = clone(district);
  const parcel = requiredParcel(next, parcelId);
  if (parcel.discoveryState !== PARCEL_STATES.cavedIn) throw new Error("Only a Caved-In Parcel may be recovered.");
  if (!workerIds.length) throw new Error("At least one Excavator is required.");
  parcel.assignedExcavatorIds = [...workerIds];
  parcel.caveInRecoveryState = JOB_STATES.inProgress;
  parcel.caveInRecoveryRemainingMs = config.recovery.baseDurationMs / workerIds.length;
  return next;
}

export function tickDistrict(district, deltaMs, config) {
  const next = clone(district);
  const releasedWorkerIds = [];
  const completed = [];
  const elapsed = Math.max(0, Number(deltaMs) || 0);
  const parcels = Object.values(next.parcelsById).sort((left, right) => (
    (left.surveyStartedOrdinal || Number.MAX_SAFE_INTEGER) - (right.surveyStartedOrdinal || Number.MAX_SAFE_INTEGER)
    || left.id.localeCompare(right.id)
  ));
  for (const parcel of parcels) {
    if (parcel.surveyStatus === SURVEY_STATES.inProgress) {
      parcel.surveyRemainingMs = Math.max(0, parcel.surveyRemainingMs - elapsed);
      if (parcel.surveyRemainingMs === 0) {
        completeSurveyMutable(next, parcel);
        if (parcel.assignedSurveyorId) releasedWorkerIds.push(parcel.assignedSurveyorId);
        parcel.assignedSurveyorId = null;
        completed.push({ type: "survey", parcelId: parcel.id });
      }
    }
    if (parcel.clearanceState === JOB_STATES.inProgress) {
      parcel.clearanceRemainingMs = Math.max(0, parcel.clearanceRemainingMs - elapsed);
      if (parcel.clearanceRemainingMs === 0) {
        parcel.accessibilityBlockers.forEach((blocker) => { blocker.resolved = true; });
        parcel.clearanceState = JOB_STATES.idle;
        parcel.discoveryState = PARCEL_STATES.accessible;
        releasedWorkerIds.push(...parcel.assignedExcavatorIds);
        parcel.assignedExcavatorIds = [];
        completed.push({ type: "clearance", parcelId: parcel.id });
      }
    }
    if (parcel.caveInRecoveryState === JOB_STATES.inProgress) {
      parcel.caveInRecoveryRemainingMs = Math.max(0, parcel.caveInRecoveryRemainingMs - elapsed);
      if (parcel.caveInRecoveryRemainingMs === 0) {
        regenerateTruthMutable(parcel, config, `${next.seed}:recovery:${parcel.id}:${parcel.caveInCount}`);
        parcel.caveInRecoveryState = JOB_STATES.idle;
        parcel.discoveryState = PARCEL_STATES.accessible;
        releasedWorkerIds.push(...parcel.assignedExcavatorIds);
        parcel.assignedExcavatorIds = [];
        completed.push({ type: "recovery", parcelId: parcel.id });
      }
    }
  }
  return { district: next, releasedWorkerIds: [...new Set(releasedWorkerIds)], completed };
}

export function activeParcels(district) {
  return Object.values(district?.parcelsById || {})
    .filter((parcel) => parcel.discoveryState === PARCEL_STATES.active)
    .sort((left, right) => (left.activatedOrdinal || 0) - (right.activatedOrdinal || 0) || left.id.localeCompare(right.id));
}

export function parcelDisplayName(district, parcel) {
  if (parcel.discoveryState === PARCEL_STATES.unknown) return "Unknown";
  if (parcel.id === "camp-parcel") return "Camp Parcel";
  const count = district.typeSurveyCounts[parcel.parcelType] || 0;
  return count > 1 ? `${parcel.typeDisplayName} ${parcel.typeSequenceNumber}` : parcel.typeDisplayName;
}

export function validateDistrict(district) {
  const seen = new Set();
  for (const parcel of Object.values(district.parcelsById)) {
    const key = coordinateKey(parcel.mapX, parcel.mapY);
    if (seen.has(key) || district.parcelCoordinateIndex[key] !== parcel.id) throw new Error(`Duplicate or invalid Parcel coordinate: ${key}`);
    seen.add(key);
    for (const direction of DIRECTIONS) {
      if (!parcel.passages[direction]) continue;
      const targetKey = neighborKey(parcel, direction);
      const targetId = district.parcelCoordinateIndex[targetKey];
      if (!targetId) continue;
      const target = district.parcelsById[targetId];
      if (!target.passages[OPPOSITE_DIRECTION[direction]]) throw new Error(`Non-reciprocal passage between ${parcel.id} and ${target.id}`);
    }
  }
  return true;
}

function spawnUnknownMutable(district, sourceParcelId, direction, config) {
  const source = requiredParcel(district, sourceParcelId);
  const delta = DIRECTION_DELTAS[direction];
  if (!delta || !source.passages[direction]) throw new Error("A source passage is required before spawning an Unknown Parcel.");
  const mapX = source.mapX + delta.x;
  const mapY = source.mapY + delta.y;
  const key = coordinateKey(mapX, mapY);
  const existingId = district.parcelCoordinateIndex[key];
  if (existingId) {
    const existing = district.parcelsById[existingId];
    if (!existing.passages[OPPOSITE_DIRECTION[direction]]) throw new Error(`Existing Parcel ${existingId} does not reciprocate ${direction}.`);
    return existing;
  }
  const ordinal = district.nextParcelOrdinal++;
  const id = createStableId("parcel", district.seed, ordinal);
  district.parcelCoordinateIndex[key] = id;
  const rng = createSeededRandom(`${district.seed}:parcel:${ordinal}`);
  const type = chooseWeighted(config.parcelTypes, (item) => item.weight, rng);
  const width = seededInteger(rng, ...type.width);
  const height = seededInteger(rng, ...type.height);
  const density = type.mineDensity[0] + rng() * (type.mineDensity[1] - type.mineDensity[0]);
  const mineCount = Math.max(1, Math.min(width * height - 1, Math.round(width * height * density)));
  const blocker = type.blocker && rng() < type.blocker.chance
    ? [{ type: type.blocker.type, resolved: false }]
    : [];
  const parcel = {
    id,
    districtId: district.id,
    mapX,
    mapY,
    parcelType: type.id,
    typeDisplayName: type.displayName,
    typeSequenceNumber: null,
    displayName: "Unknown",
    discoveryState: PARCEL_STATES.unknown,
    surveyStatus: SURVEY_STATES.notStarted,
    surveyReport: null,
    truth: {
      width,
      height,
      mineDensity: density,
      mineCount,
      treasureCount: seededInteger(rng, ...type.treasure),
      curioCount: seededInteger(rng, ...type.curios),
      hazards: [...type.hazards],
      boardSeed: `${district.seed}:board:${ordinal}:${Math.floor(rng() * 0xffffffff).toString(36)}`,
    },
    boardId: null,
    boardState: null,
    passages: { north: false, east: false, south: false, west: false },
    spawnedFromParcelId: sourceParcelId,
    inboundDirections: [OPPOSITE_DIRECTION[direction]],
    accessibilityBlockers: blocker,
    assignedSurveyorId: null,
    assignedExcavatorIds: [],
    surveyRemainingMs: 0,
    clearanceState: JOB_STATES.idle,
    clearanceRemainingMs: 0,
    caveInRecoveryState: JOB_STATES.idle,
    caveInRecoveryRemainingMs: 0,
    caveInCount: 0,
    createdOrdinal: ordinal,
  };
  parcel.passages[OPPOSITE_DIRECTION[direction]] = true;
  generateDormantPassages(parcel, district, config, rng);
  district.parcelsById[id] = parcel;
  return parcel;
}

function generateDormantPassages(parcel, district, config, rng) {
  const inbound = new Set(parcel.inboundDirections);
  const guaranteed = [];
  const open = [];
  let blockedCount = 0;
  for (const direction of config.passageGeneration.directionOrder) {
    if (inbound.has(direction)) continue;
    const neighborId = district.parcelCoordinateIndex[neighborKey(parcel, direction)];
    if (!neighborId) {
      open.push(direction);
      continue;
    }
    const neighbor = district.parcelsById[neighborId];
    if (neighbor.passages[OPPOSITE_DIRECTION[direction]]) guaranteed.push(direction);
    else blockedCount += 1;
  }
  guaranteed.forEach((direction) => { parcel.passages[direction] = true; });
  let passageOrdinal = guaranteed.length;
  for (const direction of open) {
    if (passageOrdinal >= config.passageGeneration.chances.length) break;
    const chance = Math.max(0, Math.min(1,
      config.passageGeneration.chances[passageOrdinal] - blockedCount * config.passageGeneration.blockedSidePenalty,
    ));
    if (rng() < chance) parcel.passages[direction] = true;
    passageOrdinal += 1;
  }
}

function ensurePassageDestination(district, parcelId, direction, config) {
  return ensurePassageDestinationMutable(district, parcelId, direction, config);
}

function ensurePassageDestinationMutable(district, parcelId, direction, config) {
  const parcel = requiredParcel(district, parcelId);
  const existingId = district.parcelCoordinateIndex[neighborKey(parcel, direction)];
  if (!existingId) return spawnUnknownMutable(district, parcelId, direction, config);
  const existing = district.parcelsById[existingId];
  if (!existing.passages[OPPOSITE_DIRECTION[direction]]) throw new Error(`Passage conflict at ${neighborKey(parcel, direction)}.`);
  return existing;
}

function completeSurveyMutable(district, parcel) {
  parcel.surveyStatus = SURVEY_STATES.complete;
  parcel.surveyedOrdinal = district.nextSurveyCompletionOrdinal++;
  const count = (district.typeSurveyCounts[parcel.parcelType] || 0) + 1;
  district.typeSurveyCounts[parcel.parcelType] = count;
  parcel.typeSequenceNumber = count;
  parcel.surveyReport = createSurveyReport(parcel);
  parcel.discoveryState = parcel.accessibilityBlockers.some((blocker) => !blocker.resolved)
    ? PARCEL_STATES.surveyed
    : PARCEL_STATES.accessible;
  Object.values(district.parcelsById)
    .filter((candidate) => candidate.parcelType === parcel.parcelType && candidate.surveyStatus === SURVEY_STATES.complete)
    .forEach((candidate) => { candidate.displayName = parcelDisplayName(district, candidate); });
}

function createSurveyReport(parcel) {
  const truth = parcel.truth;
  const rng = createSeededRandom(`${truth.boardSeed}:survey`);
  const area = truth.width * truth.height;
  let dimension = area < 120 ? 0 : area < 220 ? 1 : area < 340 ? 2 : 3;
  const ratio = truth.width / truth.height;
  const shape = ratio >= 1.8 ? "Long and narrow" : ratio <= 0.56 ? "Tall and narrow" : ratio >= 1.35 ? "Broad chamber" : null;
  const density = truth.mineDensity < 0.13 ? 0 : truth.mineDensity < 0.17 ? 1 : truth.mineDensity < 0.22 ? 2 : truth.mineDensity < 0.27 ? 3 : 4;
  const treasure = truth.treasureCount <= 1 ? 0 : truth.treasureCount <= 2 ? 1 : truth.treasureCount <= 4 ? 2 : truth.treasureCount <= 6 ? 3 : 4;
  const curios = Math.min(4, truth.curioCount);
  const onwardCount = DIRECTIONS.filter((direction) => parcel.passages[direction] && !parcel.inboundDirections.includes(direction)).length;
  return {
    dimensions: shape || DIMENSION_LABELS[dimension],
    mineDensity: DENSITY_LABELS[noisyCategory(density, DENSITY_LABELS.length, rng)],
    hazards: truth.hazards.length ? [...truth.hazards] : ["No known special hazard"],
    treasurePotential: TREASURE_LABELS[noisyCategory(treasure, TREASURE_LABELS.length, rng)],
    curioPotential: CURIO_LABELS[noisyCategory(curios, CURIO_LABELS.length, rng)],
    passageHint: PASSAGE_LABELS[noisyCategory(Math.min(3, onwardCount), PASSAGE_LABELS.length, rng)],
  };
}

function noisyCategory(index, length, rng) {
  if (rng() >= 0.25) return index;
  const direction = rng() < 0.5 ? -1 : 1;
  return Math.max(0, Math.min(length - 1, index + direction));
}

function regenerateTruthMutable(parcel, config, seed) {
  const type = config.parcelTypes.find((item) => item.id === parcel.parcelType);
  const rng = createSeededRandom(seed);
  let replacement = null;
  for (let attempt = 0; attempt < 50 && !replacement; attempt += 1) {
    const width = seededInteger(rng, ...type.width);
    const height = seededInteger(rng, ...type.height);
    const density = type.mineDensity[0] + rng() * (type.mineDensity[1] - type.mineDensity[0]);
    const candidate = {
      ...parcel.truth,
      width,
      height,
      mineDensity: density,
      mineCount: Math.max(1, Math.min(width * height - 1, Math.round(width * height * density))),
      treasureCount: seededInteger(rng, ...type.treasure),
      curioCount: seededInteger(rng, ...type.curios),
      boardSeed: `${seed}:${attempt}:${Math.floor(rng() * 0xffffffff).toString(36)}`,
    };
    if (!parcel.surveyReport) replacement = candidate;
    else {
      const report = createSurveyReport({ ...parcel, truth: candidate });
      if (["dimensions", "mineDensity", "treasurePotential", "curioPotential"].every((key) => report[key] === parcel.surveyReport[key])) {
        replacement = candidate;
      }
    }
  }
  parcel.truth = replacement || { ...parcel.truth, boardSeed: `${seed}:fallback` };
  parcel.boardId = null;
  parcel.boardState = null;
}

function neighborKey(parcel, direction) {
  const delta = DIRECTION_DELTAS[direction];
  return coordinateKey(parcel.mapX + delta.x, parcel.mapY + delta.y);
}

function addParcel(district, parcel) {
  const key = coordinateKey(parcel.mapX, parcel.mapY);
  if (district.parcelCoordinateIndex[key]) throw new Error(`Parcel coordinate already reserved: ${key}`);
  district.parcelsById[parcel.id] = parcel;
  district.parcelCoordinateIndex[key] = parcel.id;
}

function requiredParcel(district, parcelId) {
  const parcel = district.parcelsById[parcelId];
  if (!parcel) throw new Error(`Unknown Parcel: ${parcelId}`);
  return parcel;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
