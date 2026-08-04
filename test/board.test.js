import test from "node:test";
import assert from "node:assert/strict";
import { createBoardCells, getNeighbors, hasClearedBoard, updateBoardAdjacency } from "../src/engine/board.js";

test("board creation and adjacency are deterministic", () => {
  const settings = { rows: 3, cols: 3, mines: 1 };
  const board = createBoardCells(settings);
  board[0].mine = true;
  updateBoardAdjacency(board, settings);
  assert.equal(board.length, 9);
  assert.equal(board[1].adjacent, 1);
  assert.equal(board[4].adjacent, 1);
  assert.equal(board[8].adjacent, 0);
  assert.equal(getNeighbors(board[4], board, settings).length, 8);
});

test("clear evaluation ignores unopened mines", () => {
  const board = createBoardCells({ rows: 2, cols: 2, mines: 1 });
  board[0].mine = true;
  board.slice(1).forEach((cell) => { cell.open = true; });
  assert.equal(hasClearedBoard(board), true);
});
