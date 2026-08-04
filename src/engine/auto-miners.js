export function createAutoMinerState(specialists, now = 0) {
  return {
    automationMode: "manual",
    workerTargets: Object.fromEntries(specialists.map((worker) => [worker.id, null])),
    workerPolicies: Object.fromEntries(specialists
      .filter((worker) => worker.group === "agents")
      .map((worker) => [worker.id, "focus"])),
    initiative: {
      agents: ["excavator", "flagbearer"],
      specialists: specialists.filter((worker) => worker.group === "specialists").map((worker) => worker.id),
    },
    workerTasks: {},
    lastSurveyAt: now,
    lastWorkerTickAt: 0,
    statusText: "Workers can assist the visible board and Active Parcels.",
  };
}

export function workerCost(worker, level) {
  return Math.ceil(worker.baseCost * 1.6 ** level);
}

export function surveyorIntervalMs(level) {
  if (level <= 1) return 60000;
  return Math.max(5000, Math.round(60000 / (1 + (level - 1) * 0.16)));
}
