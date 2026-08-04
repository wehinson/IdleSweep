import test from "node:test";
import assert from "node:assert/strict";
import { createRoundEngine, safetyIndexesFor } from "../src/engine/round-engine.js";

function mineIndexes(state) {
  return state.board.filter((cell) => cell.mine).map((cell) => cell.index);
}

function winTwoByTwo(engine) {
  engine.dispatch({ type: "round/open", index: 3 });
  engine.dispatch({ type: "round/open", index: 1 });
  engine.dispatch({ type: "round/open", index: 2 });
}

test("first click and its configured safety radius never receive mines", () => {
  const settings = { rows: 5, cols: 5, mines: 8 };
  const engine = createRoundEngine({ settings, safetyRadius: 1, rng: () => 0 });
  engine.dispatch({ type: "round/open", index: 12 });
  const state = engine.getState();
  const safe = safetyIndexesFor(settings, 12, 1);
  assert.equal([...safe].every((index) => !state.board[index].mine), true);
});

test("mine generation places the requested number of unique mines", () => {
  const engine = createRoundEngine({ settings: { rows: 6, cols: 6, mines: 10 }, rng: () => 0.25 });
  engine.dispatch({ type: "round/open", index: 0 });
  const mines = mineIndexes(engine.getState());
  assert.equal(mines.length, 10);
  assert.equal(new Set(mines).size, 10);
  assert.equal(mines.includes(0), false);
});

test("mine generation safely caps impossible density after reserving the first click", () => {
  const engine = createRoundEngine({ settings: { rows: 2, cols: 2, mines: 4 }, rng: () => 0 });
  engine.dispatch({ type: "round/open", index: 0 });
  assert.equal(mineIndexes(engine.getState()).length, 3);
  assert.equal(engine.getState().board[0].mine, false);
});

test("opening a zero cascades through connected zeros and their numbered border", () => {
  const engine = createRoundEngine({ settings: { rows: 3, cols: 3, mines: 1 }, mineIndexes: [8] });
  engine.dispatch({ type: "round/open", index: 0 });
  const state = engine.getState();
  assert.equal(state.board.filter((cell) => cell.open && !cell.mine).length, 8);
  assert.equal(state.outcome, "won");
});

test("a complete zero cascade costs exactly one durability", () => {
  const engine = createRoundEngine({
    settings: { rows: 3, cols: 3, mines: 1 },
    mineIndexes: [8],
    player: { shovelUses: 5, shovelDurability: 5 },
  });
  engine.dispatch({ type: "round/open", index: 0 });
  assert.equal(engine.getState().player.shovelUses, 4);
});

test("flags consume and refund stock, block opening, and track placements", () => {
  const engine = createRoundEngine({ settings: { rows: 2, cols: 2, mines: 1 }, mineIndexes: [0], player: { flags: 2 } });
  engine.dispatch({ type: "round/flag", index: 0 });
  engine.dispatch({ type: "round/open", index: 0 });
  let state = engine.getState();
  assert.equal(state.board[0].flagged, true);
  assert.equal(state.board[0].open, false);
  assert.equal(state.player.flags, 1);
  assert.equal(state.roundFlagPlacements, 1);
  engine.dispatch({ type: "round/flag", index: 0 });
  state = engine.getState();
  assert.equal(state.board[0].flagged, false);
  assert.equal(state.player.flags, 2);
});

test("flag placement is rejected when inventory is empty", () => {
  const engine = createRoundEngine({ settings: { rows: 2, cols: 2, mines: 1 }, mineIndexes: [0], player: { flags: 0 } });
  const result = engine.dispatch({ type: "round/flag", index: 0 });
  assert.equal(result.effects[0].reason, "noFlags");
  assert.equal(engine.getState().board[0].flagged, false);
});

test("correct chording reveals neighbors, costs no durability, and can win", () => {
  const engine = createRoundEngine({ settings: { rows: 3, cols: 3, mines: 1 }, mineIndexes: [0] });
  engine.dispatch({ type: "round/open", index: 4 });
  const durabilityAfterOpen = engine.getState().player.shovelUses;
  engine.dispatch({ type: "round/flag", index: 0 });
  engine.dispatch({ type: "round/chord", index: 4 });
  const state = engine.getState();
  assert.equal(state.outcome, "won");
  assert.equal(state.roundUsedChording, true);
  assert.equal(state.player.shovelUses, durabilityAfterOpen);
});

test("chording with the wrong flag count is rejected without changing the board", () => {
  const engine = createRoundEngine({ settings: { rows: 3, cols: 3, mines: 1 }, mineIndexes: [0] });
  engine.dispatch({ type: "round/open", index: 4 });
  const result = engine.dispatch({ type: "round/chord", index: 4 });
  assert.equal(result.effects[0].reason, "flagMismatch");
  assert.equal(engine.getState().outcome, "playing");
  assert.equal(engine.getState().roundUsedChording, false);
});

test("chording with the correct count but an incorrect flag triggers a mine", () => {
  const engine = createRoundEngine({ settings: { rows: 3, cols: 3, mines: 1 }, mineIndexes: [0] });
  engine.dispatch({ type: "round/open", index: 4 });
  engine.dispatch({ type: "round/flag", index: 1 });
  engine.dispatch({ type: "round/chord", index: 4 });
  const state = engine.getState();
  assert.equal(state.outcome, "lost");
  assert.equal(state.board[0].open, true);
  assert.equal(state.player.stats.minesTriggered, 1);
});

test("victory is detected only after every safe tile is open", () => {
  const engine = createRoundEngine({ settings: { rows: 2, cols: 2, mines: 1 }, mineIndexes: [0] });
  engine.dispatch({ type: "round/open", index: 3 });
  assert.equal(engine.getState().outcome, "playing");
  engine.dispatch({ type: "round/open", index: 1 });
  assert.equal(engine.getState().outcome, "playing");
  engine.dispatch({ type: "round/open", index: 2 });
  assert.equal(engine.getState().outcome, "won");
});

test("opening a mine fails the round and breaks the current shovel", () => {
  const engine = createRoundEngine({
    settings: { rows: 2, cols: 2, mines: 1 },
    mineIndexes: [0],
    player: { shovelUses: 7, shovelDurability: 10, shovels: 1 },
  });
  engine.dispatch({ type: "round/open", index: 0 });
  const state = engine.getState();
  assert.equal(state.outcome, "lost");
  assert.equal(state.player.shovelUses, 0);
  assert.equal(state.player.shovels, 0);
  assert.equal(state.player.stats.boardsLost, 1);
});

test("treasure rewards remain pending until victory and commit only once", () => {
  const engine = createRoundEngine({
    settings: { rows: 2, cols: 2, mines: 1 },
    mineIndexes: [0],
    treasures: [{ index: 3, value: 25 }],
  });
  engine.dispatch({ type: "round/open", index: 3 });
  assert.equal(engine.getState().roundTreasureValue, 25);
  assert.equal(engine.getState().player.coins, 0);
  engine.dispatch({ type: "round/open", index: 1 });
  engine.dispatch({ type: "round/open", index: 2 });
  assert.equal(engine.getState().player.coins, 25);
  engine.dispatch({ type: "round/open", index: 2 });
  assert.equal(engine.getState().player.coins, 25);
  assert.equal(engine.getState().rewardCommitted, true);
});

test("pending treasure is not committed after a mine-hit loss", () => {
  const engine = createRoundEngine({
    settings: { rows: 3, cols: 3, mines: 2 },
    mineIndexes: [0, 8],
    treasures: [{ index: 4, value: 30 }],
  });
  engine.dispatch({ type: "round/open", index: 4 });
  engine.dispatch({ type: "round/open", index: 0 });
  assert.equal(engine.getState().outcome, "lost");
  assert.equal(engine.getState().roundTreasureValue, 30);
  assert.equal(engine.getState().player.coins, 0);
  assert.equal(engine.getState().rewardCommitted, false);
});

test("reset clears round state while preserving consumed player resources", () => {
  const engine = createRoundEngine({ settings: { rows: 2, cols: 2, mines: 1 }, mineIndexes: [0], player: { flags: 2, coins: 40 } });
  engine.dispatch({ type: "round/open", index: 3 });
  engine.dispatch({ type: "round/flag", index: 0 });
  const shovelUses = engine.getState().player.shovelUses;
  engine.dispatch({ type: "round/reset" });
  const state = engine.getState();
  assert.equal(state.outcome, "playing");
  assert.equal(state.moves, 0);
  assert.equal(state.board.every((cell) => !cell.open && !cell.flagged), true);
  assert.equal(state.player.shovelUses, shovelUses);
  assert.equal(state.player.flags, 1);
  assert.equal(state.player.coins, 40);
});

test("contract victory commits its rewards and progress", () => {
  const engine = createRoundEngine({
    settings: { rows: 2, cols: 2, mines: 1 },
    mineIndexes: [0],
    contract: { id: "starter", rewardCoins: 50, rewardMines: 2 },
  });
  winTwoByTwo(engine);
  const state = engine.getState();
  assert.equal(state.player.coins, 50);
  assert.equal(state.player.mines, 2);
  assert.equal(state.player.stats.contractsCompleted, 1);
  assert.equal(state.contractProgress.completed, 1);
  assert.equal(state.contract, null);
});

test("contract failure records the loss without granting rewards", () => {
  const engine = createRoundEngine({
    settings: { rows: 2, cols: 2, mines: 1 },
    mineIndexes: [0],
    contract: { id: "starter", rewardCoins: 50, rewardMines: 2 },
  });
  engine.dispatch({ type: "round/open", index: 0 });
  const state = engine.getState();
  assert.equal(state.player.coins, 0);
  assert.equal(state.player.mines, 0);
  assert.equal(state.player.stats.contractsLost, 1);
  assert.equal(state.contractProgress.failed, 1);
});

test("probe and seismic equipment return information and consume inventory", () => {
  const engine = createRoundEngine({
    settings: { rows: 3, cols: 3, mines: 2 },
    mineIndexes: [0, 8],
    player: { equipment: { probeCharge: 1, seismicTrap: 1 } },
  });
  const probe = engine.dispatch({ type: "round/equipment", id: "probeCharge", index: 0 });
  const seismic = engine.dispatch({ type: "round/equipment", id: "seismicTrap", index: 0 });
  assert.deepEqual(probe.effects[0], { type: "probe", index: 0, mine: true });
  assert.equal(seismic.effects[0].count, 1);
  assert.equal(engine.getState().player.equipment.probeCharge, 0);
  assert.equal(engine.getState().player.equipment.seismicTrap, 0);
  assert.equal(engine.getState().board[0].open, false);
});

test("Controlled Blast destroys mines and opens its 3x3 region", () => {
  const engine = createRoundEngine({
    settings: { rows: 3, cols: 3, mines: 1 },
    mineIndexes: [0],
    player: { equipment: { controlledBlast: 1 } },
  });
  const result = engine.dispatch({ type: "round/equipment", id: "controlledBlast", index: 4 });
  assert.equal(result.effects[0].destroyed, 1);
  assert.equal(engine.getState().board.every((cell) => cell.open), true);
  assert.equal(engine.getState().outcome, "won");
  assert.equal(engine.getState().player.equipment.controlledBlast, 0);
});

test("Bomb-Bot absorbs one mine hit and Mine Encapsulation collects a mine", () => {
  const bombBot = createRoundEngine({
    settings: { rows: 2, cols: 2, mines: 1 },
    mineIndexes: [0],
    player: { equipment: { bombBot: 1 } },
  });
  bombBot.dispatch({ type: "round/equipment", id: "bombBot" });
  bombBot.dispatch({ type: "round/open", index: 0 });
  assert.notEqual(bombBot.getState().outcome, "lost");
  assert.equal(mineIndexes(bombBot.getState()).length, 0);

  const encapsulation = createRoundEngine({
    settings: { rows: 2, cols: 2, mines: 1 },
    mineIndexes: [0],
    player: { equipment: { mineEncapsulation: 1 } },
  });
  encapsulation.dispatch({ type: "round/equipment", id: "mineEncapsulation" });
  encapsulation.dispatch({ type: "round/flag", index: 0 });
  assert.equal(encapsulation.getState().player.mines, 1);
  assert.equal(mineIndexes(encapsulation.getState()).length, 0);
});

test("Mine Encapsulation opens a false target and spends one active use", () => {
  const engine = createRoundEngine({
    settings: { rows: 2, cols: 2, mines: 1 },
    mineIndexes: [0],
    player: { equipment: { mineEncapsulation: 1 }, flags: 3 },
  });
  engine.dispatch({ type: "round/equipment", id: "mineEncapsulation" });
  const result = engine.dispatch({ type: "round/flag", index: 1 });
  assert.equal(result.effects[0].result, "missed");
  assert.equal(engine.getState().board[1].open, true);
  assert.equal(engine.getState().activeEquipment.mineEncapsulationUses, 19);
  assert.equal(engine.getState().player.flags, 3);
});

test("equipment cannot be used before deferred mines are placed", () => {
  const engine = createRoundEngine({
    settings: { rows: 3, cols: 3, mines: 1 },
    player: { equipment: { probeCharge: 1 } },
  });
  const result = engine.dispatch({ type: "round/equipment", id: "probeCharge", index: 0 });
  assert.equal(result.effects[0].reason, "minesNotPlaced");
  assert.equal(engine.getState().player.equipment.probeCharge, 1);
});

test("round state can be serialized and restored without a UI", () => {
  const engine = createRoundEngine({ settings: { rows: 3, cols: 3, mines: 1 }, mineIndexes: [0] });
  engine.dispatch({ type: "round/open", index: 4 });
  engine.dispatch({ type: "round/flag", index: 0 });
  assert.equal(engine.getState().outcome, "playing");
  const serialized = JSON.stringify(engine.getState());
  const restored = createRoundEngine({ initialState: JSON.parse(serialized) });
  assert.deepEqual(restored.getState(), engine.getState());
});

test("actions after resolution cannot mutate rewards or board state", () => {
  const engine = createRoundEngine({ settings: { rows: 2, cols: 2, mines: 1 }, mineIndexes: [0] });
  winTwoByTwo(engine);
  const resolved = JSON.stringify(engine.getState());
  engine.dispatch({ type: "round/open", index: 0 });
  engine.dispatch({ type: "round/flag", index: 0 });
  assert.equal(JSON.stringify(engine.getState()), resolved);
});

test("opening is rejected cleanly when no durability remains", () => {
  const engine = createRoundEngine({
    settings: { rows: 2, cols: 2, mines: 1 },
    mineIndexes: [0],
    player: { shovelUses: 0, shovels: 0 },
  });
  const result = engine.dispatch({ type: "round/open", index: 3 });
  assert.equal(result.effects[0].reason, "noDurability");
  assert.equal(engine.getState().board[3].open, false);
});
