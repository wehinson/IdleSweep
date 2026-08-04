import { getNeighbors } from "./board.js";

const PROOF_KEYS = ["provenMine", "satisfiedClueSafe", "completeTheCountMine"];

export function clearProofMetadata(board) {
  board.forEach((cell) => {
    PROOF_KEYS.forEach((key) => { cell[key] = false; });
  });
  return board;
}

function confirmedMine(cell) {
  return cell.provenMine || cell.completeTheCountMine;
}

function clueContext(clue, board, settings) {
  const nearby = getNeighbors(clue, board, settings);
  const knownMines = nearby.filter(confirmedMine).length;
  // Flags deliberately remain candidates.  Calculated safe spaces do not.
  const candidates = nearby.filter((cell) => !cell.open && !cell.satisfiedClueSafe && !confirmedMine(cell));
  return { nearby, knownMines, candidates, remaining: clue.adjacent - knownMines };
}

function mark(cells, key) {
  let changed = false;
  cells.forEach((cell) => {
    if (cell.flagged || cell.open || cell[key]) return;
    cell[key] = true;
    changed = true;
  });
  return changed;
}

export function refreshProofMetadata(board, settings) {
  clearProofMetadata(board);
  let changed = true;
  while (changed) {
    changed = false;
    const clues = board.filter((cell) => cell.open && !cell.mine && cell.adjacent > 0);

    // Direct proofs take precedence, preserving their label over later count completions.
    clues.forEach((clue) => {
      const { nearby, candidates, remaining } = clueContext(clue, board, settings);
      const usesCalculatedSafe = nearby.some((cell) => cell.satisfiedClueSafe);
      if (!usesCalculatedSafe && remaining > 0 && candidates.length === remaining) changed = mark(candidates, "provenMine") || changed;
    });
    clues.forEach((clue) => {
      const { nearby, knownMines } = clueContext(clue, board, settings);
      if (knownMines === clue.adjacent) {
        changed = mark(nearby.filter((cell) => !cell.open && !confirmedMine(cell)), "satisfiedClueSafe") || changed;
      }
    });
    clues.forEach((clue) => {
      const { nearby, candidates, remaining } = clueContext(clue, board, settings);
      const usedCalculatedSafe = nearby.some((cell) => cell.satisfiedClueSafe);
      if (usedCalculatedSafe && remaining > 0 && candidates.length === remaining) {
        changed = mark(candidates, "completeTheCountMine") || changed;
      }
    });
  }
  return board;
}

export function availableProofs(board, settings) {
  const proofs = [];
  board.filter((cell) => cell.open && !cell.mine && cell.adjacent > 0).forEach((clue) => {
    const nearby = getNeighbors(clue, board, settings);
    for (const type of ["provenMine", "completeTheCountMine", "satisfiedClueSafe"]) {
      const targets = nearby.filter((cell) => cell[type] && !cell.flagged).map((cell) => cell.index);
      if (targets.length) proofs.push({ type, clueIndex: clue.index, targetIndexes: targets });
    }
  });
  return proofs;
}

export function availableFlagSatisfiedSafeProofs(board, settings) {
  const proofs = [];
  board.filter((cell) => cell.open && !cell.mine && cell.adjacent > 0).forEach((clue) => {
    const nearby = getNeighbors(clue, board, settings);
    const flagCount = nearby.filter((cell) => cell.flagged).length;
    if (flagCount !== clue.adjacent) return;
    const targetIndexes = nearby.filter((cell) => !cell.open && !cell.flagged).map((cell) => cell.index);
    if (targetIndexes.length) proofs.push({ type: "flagSatisfiedClueSafe", clueIndex: clue.index, targetIndexes });
  });
  return proofs;
}

export function scoreProofCascade(board, settings, proof) {
  const baseline = new Set(board.filter((cell) => PROOF_KEYS.some((key) => cell[key])).map((cell) => cell.index));
  const simulated = board.map((cell) => ({ ...cell }));
  // A safe deduction unlocks information only once its targets are opened.
  // Flags remain unresolved candidates by design, so mine hints have no added
  // simulated board effect beyond their own immediate targets.
  if (proof.type === "satisfiedClueSafe") {
    proof.targetIndexes.forEach((index) => { simulated[index].open = true; });
  }
  refreshProofMetadata(simulated, settings);
  const followOn = simulated.filter((cell) => PROOF_KEYS.some((key) => cell[key]) && !baseline.has(cell.index)).length;
  return proof.targetIndexes.length + followOn;
}
