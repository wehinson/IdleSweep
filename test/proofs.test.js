import test from "node:test";
import assert from "node:assert/strict";
import { createBoardCells, updateBoardAdjacency } from "../src/engine/board.js";
import { availableFlagSatisfiedSafeProofs, refreshProofMetadata } from "../src/engine/proofs.js";

function boardWithMines(settings, mines) {
  const board = createBoardCells(settings);
  mines.forEach((index) => { board[index].mine = true; });
  updateBoardAdjacency(board, settings);
  return board;
}

test("a clue with exactly its remaining candidate count proves mines", () => {
  const settings = { rows: 3, cols: 3, mines: 1 };
  const board = boardWithMines(settings, [0]);
  board.slice(1).forEach((cell) => { cell.open = true; });
  refreshProofMetadata(board, settings);
  assert.equal(board[0].provenMine, true);
  assert.equal(board[0].completeTheCountMine, false);
});

test("player flags stay candidates and never receive proof metadata", () => {
  const settings = { rows: 3, cols: 3, mines: 1 };
  const board = boardWithMines(settings, [0]);
  board.slice(1).forEach((cell) => { cell.open = true; });
  board[0].flagged = true;
  refreshProofMetadata(board, settings);
  assert.equal(board[0].provenMine, false);
  assert.equal(board[0].satisfiedClueSafe, false);
  assert.equal(board[0].completeTheCountMine, false);
});

test("placed flags make the other hidden neighbors safe for the excavator", () => {
  const settings = { rows: 3, cols: 3, mines: 1 };
  const board = boardWithMines(settings, [0]);
  board[4].open = true;
  board[0].flagged = true;
  const proofs = availableFlagSatisfiedSafeProofs(board, settings);
  assert.deepEqual(proofs, [{ type: "flagSatisfiedClueSafe", clueIndex: 4, targetIndexes: [1, 2, 3, 5, 6, 7, 8] }]);
});

test("an excavator proof trusts a placed flag even when it is incorrect", () => {
  const settings = { rows: 3, cols: 3, mines: 1 };
  const board = boardWithMines(settings, [0]);
  board[4].open = true;
  board[1].flagged = true;
  const proofs = availableFlagSatisfiedSafeProofs(board, settings);
  assert.equal(proofs.length, 1);
  assert.ok(proofs[0].targetIndexes.includes(0));
});

test("confirmed mines satisfy clues and mark remaining hidden neighbors safe", () => {
  const settings = { rows: 3, cols: 3, mines: 2 };
  const board = boardWithMines(settings, [0, 1]);
  [2, 4, 5].forEach((index) => { board[index].open = true; });
  refreshProofMetadata(board, settings);
  assert.equal(board[1].provenMine, true);
  assert.equal(board[7].satisfiedClueSafe, true);
});

test("calculated safe spaces produce complete-the-count mines", () => {
  const settings = { rows: 3, cols: 3, mines: 2 };
  const board = boardWithMines(settings, [0, 1]);
  [2, 3, 4, 5, 6].forEach((index) => { board[index].open = true; });
  refreshProofMetadata(board, settings);
  assert.equal(board[1].provenMine, true);
  assert.equal(board[0].completeTheCountMine, true);
  assert.equal(board[7].satisfiedClueSafe, true);
});
