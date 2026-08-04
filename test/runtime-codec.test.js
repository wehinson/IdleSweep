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
  assert.equal(encoded.boardEncoding, 1);
  assert.deepEqual(encoded.board[0], [0, 0, 0, 0]);
  assert.equal(decoded.roundStartTime, 16500);
  assert.deepEqual([...decoded.recentlyRevealed], [0]);
  assert.deepEqual([...decoded.treasurePopups], [[0, 12]]);
  assert.equal(decoded.statusText, "Sweeping");
  assert.deepEqual(decoded.board[0], {
    index: 0, row: 0, col: 0, mine: false, treasure: false, treasureValue: 0,
    treasureCollected: false, open: false, flagged: false, flaggedByPlayer: false,
    adjacent: 0, curio: false, curioItem: 0, curioCollected: false,
    provenMine: false, satisfiedClueSafe: false, completeTheCountMine: false,
  });
});
