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
      workersById[id] = createWorker(id, definition.id, 1);
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
      workersById: { ...workerState.workersById, [id]: createWorker(id, workerDefinition.id, number) },
    },
  };
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

function createWorker(id, typeId, number) {
  return { id, typeId, number, status: "AVAILABLE", assignment: null };
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}
