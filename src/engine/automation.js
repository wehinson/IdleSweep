import { getNeighbors } from "./board.js";

export const INTERACTION_MODES = Object.freeze({ manual: "manual", analyze: "analyze", assist: "assist" });

export function createAutomationState(mode = INTERACTION_MODES.manual) {
  return {
    interactionMode: mode,
    mutationRevision: 0,
    reservations: {},
    findings: [],
    stalled: false,
    stallStartedAt: null,
    speculativeGuessCount: 0,
  };
}

export function mutateAutomation(state) {
  return { ...state, mutationRevision: state.mutationRevision + 1, reservations: {}, findings: [], stalled: false, stallStartedAt: null };
}

export function reserveTarget(state, index, workerId, findingId) {
  if (state.reservations[index]) return { ok: false, state };
  return { ok: true, state: { ...state, reservations: { ...state.reservations, [index]: { workerId, findingId, revision: state.mutationRevision } } } };
}

export function releaseTarget(state, index) {
  const reservations = { ...state.reservations };
  delete reservations[index];
  return { ...state, reservations };
}

export function speculationCost(settings, priorBoardGuesses, config) {
  const area = settings.rows * settings.cols;
  const density = area ? settings.mines / area : 0;
  return Math.ceil(
    config.baseCoinCost
    * Math.max(1, area / config.referenceArea) ** config.areaExponent
    * (1 + config.densityWeight * density)
    * config.repeatedGuessGrowth ** Math.max(0, priorBoardGuesses),
  );
}

export function estimateSpeculativeTargets(board, settings) {
  const hidden = board.filter((cell) => !cell.open && !cell.flagged);
  const flagged = board.filter((cell) => cell.flagged).length;
  const globalRisk = hidden.length ? Math.max(0, settings.mines - flagged) / hidden.length : 1;
  return hidden.map((cell) => {
    const local = getNeighbors(cell, board, settings)
      .filter((neighbor) => neighbor.open && !neighbor.mine && neighbor.adjacent > 0)
      .map((clue) => {
        const nearby = getNeighbors(clue, board, settings);
        const known = nearby.filter((neighbor) => neighbor.flagged || neighbor.provenMine || neighbor.completeTheCountMine).length;
        const unresolved = nearby.filter((neighbor) => !neighbor.open && !neighbor.flagged && !neighbor.provenMine && !neighbor.completeTheCountMine).length;
        return unresolved > 0 ? Math.max(0, clue.adjacent - known) / unresolved : null;
      }).filter(Number.isFinite);
    return { index: cell.index, risk: Math.min(1, local.length ? Math.max(...local) : globalRisk), source: local.length ? "local" : "global" };
  }).sort((left, right) => left.risk - right.risk || left.index - right.index);
}

export function deriveInterventionQueue(boardSessions, currentBoardId, now = Date.now(), snoozes = {}) {
  return Object.values(boardSessions || {})
    .filter((session) => session.id !== currentBoardId && session.automation?.interactionMode === INTERACTION_MODES.assist && session.automation?.stalled)
    .filter((session) => !Number.isFinite(snoozes[session.id]) || snoozes[session.id] <= now)
    .map((session) => ({
      boardId: session.id,
      category: session.category,
      parcelId: session.parcelId,
      rows: session.settings.rows,
      cols: session.settings.cols,
      mines: session.initialMineCount ?? session.settings.mines,
      stalledForMs: Math.max(0, now - (session.automation.stallStartedAt || now)),
      reason: session.automation.stallReason || "no-proof",
    }));
}

export function snoozeIntervention(snoozes, boardId, untilEpochMs) {
  return { ...(snoozes || {}), [boardId]: Math.max(0, Number(untilEpochMs) || 0) };
}
