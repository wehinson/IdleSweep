import test from "node:test";
import assert from "node:assert/strict";
import { BOARD_CATEGORIES } from "../src/engine/camp-progression.js";
import { createBoardSession, releaseContractDigs, reserveContractDigs } from "../src/engine/board-sessions.js";

test("Contract dig budgets are isolated and refund unused digs", () => {
  const session = createBoardSession({ category: BOARD_CATEGORIES.standardContract, settings: { rows: 10, cols: 15, mines: 10 }, seed: "contract" });
  const player = { shovelUses: 200, shovels: 20, shovelDurability: 10 };
  const reserved = reserveContractDigs(session, player, 0, 150);
  assert.equal(reserved.ok, true);
  assert.equal(reserved.player.shovelUses, 50);
  const updated = { ...reserved.session, digBudget: { ...reserved.session.digBudget, remaining: 100 } };
  const released = releaseContractDigs(updated, reserved.player, 10);
  assert.equal(released.player.shovelUses, 150);
  assert.equal(released.refunded, 100);
});

test("Contract reservations prevent oversubscription and remove the current shovel before refund", () => {
  const first = createBoardSession({ category: BOARD_CATEGORIES.standardContract, settings: { rows: 10, cols: 10, mines: 10 }, seed: "first" });
  const second = createBoardSession({ category: BOARD_CATEGORIES.standardContract, settings: { rows: 8, cols: 8, mines: 8 }, seed: "second" });
  const player = { shovelUses: 150, shovels: 15, shovelDurability: 10 };
  const reserved = reserveContractDigs(first, player, 0, 100);
  assert.equal(reserved.ok, true);
  assert.equal(reserveContractDigs(second, reserved.player, 0, 64).ok, false);
  const failedBoard = { ...reserved.session, digBudget: { ...reserved.session.digBudget, remaining: 73 } };
  const released = releaseContractDigs(failedBoard, reserved.player, 10, { breakCurrent: true });
  assert.equal(released.broken, 3);
  assert.equal(released.refunded, 70);
  assert.equal(released.player.shovelUses, 120);
});
