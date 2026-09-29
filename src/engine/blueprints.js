import { getNeighbors } from "./board.js";

export const BLUEPRINTS = Object.freeze([
  { id: "pattern121", name: "1-2-1", clues: [1, 2, 1], conclusions: ["mine", "safe", "mine"] },
  { id: "pattern1221", name: "1-2-2-1", clues: [1, 2, 2, 1], conclusions: ["safe", "mine", "mine", "safe"] },
]);

export function blueprintChance(misses, config) {
  return Math.min(config.maxChance, config.baseChance + Math.max(0, misses) * config.pityIncrease);
}

export function selectBlueprintPlacement({ library, boardId, rng = Math.random, config, eligible }) {
  if (!eligible) return { library, blueprintId: null, rolled: false };
  const owned = new Set(library.ownedIds || []);
  const reserved = new Set(Object.values(library.reservedByBoardId || {}));
  const available = BLUEPRINTS.filter((item) => !owned.has(item.id) && !reserved.has(item.id));
  if (!available.length) return { library, blueprintId: null, rolled: false };
  const next = clone(library);
  if (rng() >= blueprintChance(next.pityMisses, config)) {
    next.pityMisses += 1;
    return { library: next, blueprintId: null, rolled: true };
  }
  const blueprint = available[Math.floor(rng() * available.length)];
  next.reservedByBoardId[boardId] = blueprint.id;
  return { library: next, blueprintId: blueprint.id, rolled: true };
}

export function discoverBlueprint(library, boardId, discoveredAt = new Date().toISOString()) {
  const id = library.reservedByBoardId?.[boardId];
  if (!id) return { library, blueprintId: null };
  const next = clone(library);
  if (!next.ownedIds.includes(id)) next.ownedIds.push(id);
  next.discoveries.push({ id, boardId, discoveredAt });
  next.pityMisses = 0;
  delete next.reservedByBoardId[boardId];
  return { library: next, blueprintId: id };
}

export function releaseBlueprintReservation(library, boardId) {
  if (!library.reservedByBoardId?.[boardId]) return library;
  const next = clone(library);
  delete next.reservedByBoardId[boardId];
  return next;
}

export function matchBlueprint(board, settings, blueprintId) {
  const definition = BLUEPRINTS.find((item) => item.id === blueprintId);
  if (!definition) return [];
  const findings = [];
  for (const orientation of ["horizontal-above", "horizontal-below", "vertical-left", "vertical-right"]) {
    scanOrientation(board, settings, definition, orientation, findings);
  }
  return deduplicate(findings);
}

function scanOrientation(board, settings, definition, orientation, findings) {
  const length = definition.clues.length;
  const horizontal = orientation.startsWith("horizontal");
  const clueDelta = horizontal ? [0, 1] : [1, 0];
  const targetDelta = orientation === "horizontal-above" ? [-1, 0]
    : orientation === "horizontal-below" ? [1, 0]
      : orientation === "vertical-left" ? [0, -1] : [0, 1];
  for (let row = 0; row < settings.rows; row += 1) {
    for (let col = 0; col < settings.cols; col += 1) {
      const clues = [];
      const targets = [];
      let valid = true;
      for (let offset = 0; offset < length; offset += 1) {
        const clue = cellAt(board, settings, row + clueDelta[0] * offset, col + clueDelta[1] * offset);
        const target = cellAt(board, settings, row + clueDelta[0] * offset + targetDelta[0], col + clueDelta[1] * offset + targetDelta[1]);
        if (!clue?.open || clue.mine || !target || target.open || target.flagged) { valid = false; break; }
        const known = getNeighbors(clue, board, settings).filter((cell) => cell.flagged || cell.provenMine || cell.completeTheCountMine).length;
        if (clue.adjacent - known !== definition.clues[offset]) { valid = false; break; }
        clues.push(clue);
        targets.push(target);
      }
      if (!valid || !hasCompleteFrontier(board, settings, clues, new Set(targets.map((cell) => cell.index)))) continue;
      findings.push({
        blueprintId: definition.id,
        orientation,
        evidenceIndexes: clues.map((cell) => cell.index),
        conclusions: targets.map((cell, index) => ({ index: cell.index, type: definition.conclusions[index] })),
      });
    }
  }
}

function hasCompleteFrontier(board, settings, clues, targets) {
  return clues.every((clue) => getNeighbors(clue, board, settings)
    .filter((cell) => !cell.open && !cell.flagged && !cell.provenMine && !cell.completeTheCountMine)
    .every((cell) => targets.has(cell.index)));
}

function cellAt(board, settings, row, col) {
  if (row < 0 || col < 0 || row >= settings.rows || col >= settings.cols) return null;
  return board[row * settings.cols + col];
}

function deduplicate(findings) {
  const seen = new Set();
  return findings.filter((finding) => {
    const key = `${finding.blueprintId}:${finding.conclusions.map((item) => `${item.index}:${item.type}`).join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
