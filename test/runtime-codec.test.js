import test from "node:test";
import assert from "node:assert/strict";
import { decodeModeState, encodeModeState } from "../src/persistence/runtime-codec.js";

test("active rounds resume with frozen elapsed time and restored collections", () => {
  const runtime = {
    board: [{ index: 0 }],
    settings: { rows: 1, cols: 1, mines: 0 },
    roundStarted: true,
    roundStartTime: 1000,
    recentlyRevealed: new Set([0]),
    treasurePopups: new Map([[0, 12]]),
    statusText: "Sweeping",
    resetText: "AGAIN",
  };
  const encoded = encodeModeState(runtime, 4500);
  const decoded = decodeModeState(JSON.parse(JSON.stringify(encoded)), 20000);
  assert.equal(encoded.roundElapsedMs, 3500);
  assert.equal(encoded.boardEncoding, 2);
  assert.equal(typeof encoded.board.cells, "string");
  assert.equal(encoded.board.length, 1);
  assert.equal(decoded.roundStartTime, 16500);
  assert.deepEqual([...decoded.recentlyRevealed], [0]);
  assert.deepEqual([...decoded.treasurePopups], [[0, 12]]);
  assert.equal(decoded.statusText, "Sweeping");
  assert.deepEqual(decoded.board[0], {
    index: 0, row: 0, col: 0, mine: false, treasure: false, treasureValue: 0,
    treasureCollected: false, open: false, flagged: false, flaggedByPlayer: false,
    adjacent: 0, curio: false, curioItem: 0, curioCollected: false, flaggedByWorker: false,
    provenMine: false, satisfiedClueSafe: false, completeTheCountMine: false,
    blueprintId: null, blueprintCollected: false,
  });
});

test("compact Board encoding restores sparse finds and worker flags", () => {
  const board = Array.from({ length: 4 }, (_, index) => ({ index, row: Math.floor(index / 2), col: index % 2 }));
  Object.assign(board[1], { treasure: true, treasureValue: 27, open: true });
  Object.assign(board[2], { curio: true, curioItem: 4, curioCollected: true });
  Object.assign(board[3], { flagged: true, flaggedByWorker: true, blueprintId: "pattern1221" });
  const encoded = encodeModeState({ board, settings: { rows: 2, cols: 2, mines: 1 }, roundStarted: false, recentlyRevealed: new Set(), treasurePopups: new Map() }, 0);
  const restored = decodeModeState(JSON.parse(JSON.stringify(encoded)), 0);
  assert.deepEqual(encoded.board.treasures, [[1, 27]]);
  assert.equal(restored.board[2].curioItem, 4);
  assert.equal(restored.board[3].flaggedByWorker, true);
  assert.equal(restored.board[3].blueprintId, "pattern1221");
});
