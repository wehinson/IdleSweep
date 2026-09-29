export function createWorkerState(definitions, legacyLevels = {}) {
  const workerTypes = {};
  const workersById = {};
  for (const definition of definitions) {
    const level = Math.max(0, legacyLevels[definition.id] || 0);
    workerTypes[definition.id] = {
      level,
      hireCount: level > 0 ? 1 : 0,
      lastHireCost: level > 0 ? definition.baseCost : 0,
      nextWorkerNumber: level > 0 ? 2 : 1,
    };
    if (level > 0) {
      const id = `${definition.id}-1`;
      workersById[id] = createWorker(id, definition.id, 1, level);
    }
  }
  return { workerTypes, workersById };
}

export function nextWorkerHireCost(workerDefinition, workerTypeState) {
  if (!workerTypeState || workerTypeState.hireCount === 0) return workerDefinition.baseCost;
  return Math.ceil((workerTypeState.lastHireCost || workerDefinition.baseCost) * 15);
}

export function hireWorker(workerState, workerDefinition) {
  const type = workerState.workerTypes[workerDefinition.id];
  if (!type) throw new Error(`Unknown worker type: ${workerDefinition.id}`);
  const cost = nextWorkerHireCost(workerDefinition, type);
  const number = type.nextWorkerNumber;
  const id = `${workerDefinition.id}-${number}`;
  return {
    cost,
    workerId: id,
    state: {
      workerTypes: {
        ...workerState.workerTypes,
        [workerDefinition.id]: {
          ...type,
          level: Math.max(1, type.level),
          hireCount: type.hireCount + 1,
          lastHireCost: cost,
          nextWorkerNumber: number + 1,
        },
      },
      workersById: { ...workerState.workersById, [id]: createWorker(id, workerDefinition.id, number, 1) },
    },
  };
}

export function workerUpgradeCost(workerDefinition, worker, options = {}) {
  const base = options.baseCost ?? workerDefinition.upgradeBaseCost ?? workerDefinition.baseCost;
  const growth = options.growth ?? 1.6;
  return Math.ceil(base * growth ** Math.max(0, worker.level - 1));
}

export function upgradeWorker(workerState, workerId) {
  const worker = workerState.workersById[workerId];
  if (!worker) throw new Error(`Unknown worker: ${workerId}`);
  const next = structuredCloneSafe(workerState);
  next.workersById[workerId].level += 1;
  next.workerTypes[worker.typeId].level = Math.max(
    ...Object.values(next.workersById).filter((item) => item.typeId === worker.typeId).map((item) => item.level),
  );
  return next;
}

export function assignBlueprints(workerState, workerId, blueprintIds, secondSlotLevel = 5) {
  const worker = workerState.workersById[workerId];
  if (!worker || worker.typeId !== "analyst") throw new Error(`Worker ${workerId} is not an Analyst.`);
  const capacity = worker.level >= secondSlotLevel ? 2 : 1;
  const unique = [...new Set(blueprintIds)];
  if (unique.length > capacity) throw new Error(`Analyst ${workerId} can hold ${capacity} blueprint assignment${capacity === 1 ? "" : "s"}.`);
  const next = structuredCloneSafe(workerState);
  next.workersById[workerId].blueprintIds = unique;
  return next;
}

export function availableWorkers(workerState, typeId) {
  return Object.values(workerState.workersById)
    .filter((worker) => worker.typeId === typeId && worker.status === "AVAILABLE")
    .sort((left, right) => left.number - right.number);
}

export function assignWorkers(workerState, workerIds, assignment) {
  const next = structuredCloneSafe(workerState);
  for (const id of workerIds) {
    const worker = next.workersById[id];
    if (!worker || worker.status !== "AVAILABLE") throw new Error(`Worker ${id} is not available.`);
    worker.status = "ASSIGNED";
    worker.assignment = { ...assignment };
  }
  return next;
}

export function releaseWorkers(workerState, workerIds) {
  const next = structuredCloneSafe(workerState);
  for (const id of workerIds) {
    const worker = next.workersById[id];
    if (!worker) continue;
    worker.status = "AVAILABLE";
    worker.assignment = null;
  }
  return next;
}

function createWorker(id, typeId, number, level = 1) {
  return { id, typeId, number, level, status: "AVAILABLE", assignment: null, blueprintIds: [] };
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}
