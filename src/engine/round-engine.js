import { createBoardCells, getNeighbors, hasClearedBoard, updateBoardAdjacency } from "./board.js";
import { refreshProofMetadata } from "./proofs.js";
import { createGame } from "./game-engine.js";
import { createStartingStats } from "./player.js";

export function selectMineIndexes(availableIndexes, target, rng = Math.random) {
  const pool = [...availableIndexes];
  const count = Math.min(Math.max(0, target), pool.length);
  for (let index = 0; index < count; index += 1) {
    const selected = index + Math.floor(rng() * (pool.length - index));
    [pool[index], pool[selected]] = [pool[selected], pool[index]];
  }
  return pool.slice(0, count);
}

export function safetyIndexesFor(settings, index, radius = 0) {
  const center = { row: Math.floor(index / settings.cols), col: index % settings.cols };
  const safe = new Set();
  for (let row = Math.max(0, center.row - radius); row <= Math.min(settings.rows - 1, center.row + radius); row += 1) {
    for (let col = Math.max(0, center.col - radius); col <= Math.min(settings.cols - 1, center.col + radius); col += 1) {
      safe.add(row * settings.cols + col);
    }
  }
  safe.add(index);
  return safe;
}

export function revealWaves(board, settings, startIndex) {
  const startCell = board[startIndex];
  if (!startCell) return [];
  const waves = [];
  const pending = [{ cell: startCell, distance: 0 }];
  const queued = new Set([startIndex]);
  while (pending.length > 0) {
    const { cell, distance } = pending.shift();
    if (cell.open || cell.flagged || cell.mine) continue;
    if (!waves[distance]) waves[distance] = [];
    waves[distance].push(cell.index);
    if (cell.adjacent !== 0) continue;
    getNeighbors(cell, board, settings).forEach((neighbor) => {
      if (!queued.has(neighbor.index)) {
        queued.add(neighbor.index);
        pending.push({ cell: neighbor, distance: distance + 1 });
      }
    });
  }
  return waves;
}

export function evaluateChord(board, settings, index) {
  const cell = board[index];
  if (!cell || !cell.open || cell.mine || cell.adjacent <= 0) {
    return { allowed: false, required: cell?.adjacent || 0, actual: 0, candidates: [] };
  }
  const nearby = getNeighbors(cell, board, settings);
  const actual = nearby.filter((neighbor) => neighbor.flagged).length;
  return {
    allowed: actual === cell.adjacent,
    required: cell.adjacent,
    actual,
    candidates: nearby.filter((neighbor) => !neighbor.open && !neighbor.flagged).map((neighbor) => neighbor.index),
  };
}

export function calculateRoundPayout(treasureValue, mineCount, mineYieldPercent = 0) {
  const multiplier = 1 + Math.max(0, mineCount - 1) * mineYieldPercent;
  return Math.round(treasureValue * multiplier);
}

export function consumeShovelState({ shovelUses, shovelDurability, cost = 1 }) {
  if (shovelUses < cost) return { shovelUses, shovels: Math.ceil(shovelUses / shovelDurability), broke: false, consumed: false };
  const nextUses = shovelUses - cost;
  return {
    shovelUses: nextUses,
    shovels: Math.ceil(nextUses / shovelDurability),
    broke: nextUses % shovelDurability === 0,
    consumed: true,
  };
}

export function breakCurrentShovelState({ shovelUses, shovelDurability, shovels }) {
  if (shovelUses <= 0 || shovels <= 0) return { shovelUses, shovels, broke: false };
  const currentUses = shovelUses % shovelDurability || shovelDurability;
  return {
    shovelUses: Math.max(0, shovelUses - currentUses),
    shovels: Math.max(0, shovels - 1),
    broke: true,
  };
}

export function createRoundState(options = {}) {
  const settings = { rows: 3, cols: 3, mines: 1, ...(options.settings || {}) };
  const board = createBoardCells(settings);
  const presetMineIndexes = options.mineIndexes ? [...options.mineIndexes] : null;
  if (presetMineIndexes) {
    presetMineIndexes.forEach((index) => {
      if (board[index]) board[index].mine = true;
    });
    updateBoardAdjacency(board, settings);
    refreshProofMetadata(board, settings);
  }
  (options.treasures || []).forEach(({ index, value }) => {
    if (!board[index] || board[index].mine) return;
    board[index].treasure = true;
    board[index].treasureValue = value;
  });
  const shovelDurability = options.player?.shovelDurability || 10;
  const shovelUses = options.player?.shovelUses ?? shovelDurability;
  const player = {
    coins: 0,
    mines: 0,
    flags: 15,
    shovelDurability,
    shovelUses,
    shovels: Math.ceil(shovelUses / shovelDurability),
    mineYieldPercent: 0,
    stats: createStartingStats(),
    equipment: {
      probeCharge: 0,
      controlledBlast: 0,
      seismicTrap: 0,
      bombBot: 0,
      mineEncapsulation: 0,
    },
    ...(options.player || {}),
  };
  player.stats = { ...createStartingStats(), ...(options.player?.stats || {}) };
  player.equipment = { probeCharge: 0, controlledBlast: 0, seismicTrap: 0, bombBot: 0, mineEncapsulation: 0, ...(options.player?.equipment || {}) };
  return {
    settings,
    board,
    presetMineIndexes,
    safetyRadius: Math.max(0, options.safetyRadius || 0),
    minesPlaced: Boolean(presetMineIndexes),
    roundStarted: false,
    roundResolved: false,
    outcome: "playing",
    moves: 0,
    flagsPlaced: 0,
    roundFlagPlacements: 0,
    roundUsedChording: false,
    roundTreasureValue: 0,
    roundTreasureCount: 0,
    rewardCommitted: false,
    lastNotice: null,
    player,
    activeEquipment: { bombBotUses: 0, mineEncapsulationUses: 0 },
    contract: options.contract ? clone(options.contract) : null,
    contractProgress: {
      boardsUntilNext: options.contractProgress?.boardsUntilNext ?? 10,
      completed: options.contractProgress?.completed ?? 0,
      failed: options.contractProgress?.failed ?? 0,
    },
  };
}

export function createRoundEngine(options = {}) {
  const initialState = options.initialState ? clone(options.initialState) : createRoundState(options);
  refreshProofMetadata(initialState.board, initialState.settings);
  return createGame({
    config: options.config || {},
    initialState,
    rng: options.rng || Math.random,
    clock: options.clock || (() => 0),
    reducer: reduceRoundState,
  });
}

export function reduceRoundState(state, action, services) {
  if (action.type === "replaceState") return clone(action.state);
  const next = clone(state);
  const effects = [];
  if (action.type === "round/open") openCell(next, action.index, services.rng, effects);
  else if (action.type === "round/flag") toggleFlag(next, action.index, effects);
  else if (action.type === "round/chord") chordCell(next, action.index, effects);
  else if (action.type === "round/equipment") useEquipment(next, action.id, action.index, effects);
  else if (action.type === "round/reset") return { state: resetRound(next), effects: [{ type: "roundReset" }] };
  else return state;
  refreshProofMetadata(next.board, next.settings);
  return { state: next, effects };
}

function openCell(state, index, rng, effects) {
  const cell = state.board[index];
  if (!cell || state.roundResolved || cell.open || cell.flagged) return;
  if (state.player.shovelUses <= 0) {
    effects.push({ type: "rejected", reason: "noDurability" });
    return;
  }
  state.roundStarted = true;
  if (!state.minesPlaced) placeMines(state, index, rng);
  state.moves += 1;
  if (cell.mine) {
    state.player.stats.minesTriggered += 1;
    if (state.activeEquipment.bombBotUses > 0) {
      state.activeEquipment.bombBotUses = 0;
      destroyMine(state, cell);
      effects.push({ type: "equipment", id: "bombBot", result: "absorbed" });
      maybeWin(state, effects);
      return;
    }
    breakCurrentShovel(state.player);
    cell.open = true;
    loseRound(state, effects);
    return;
  }
  consumeDurability(state.player);
  revealFrom(state, index);
  maybeWin(state, effects);
}

function placeMines(state, safeIndex, rng) {
  const safeIndexes = safetyIndexesFor(state.settings, safeIndex, state.safetyRadius);
  const available = state.board.filter((cell) => !safeIndexes.has(cell.index) && !cell.flagged).map((cell) => cell.index);
  selectMineIndexes(available, state.settings.mines, rng).forEach((index) => { state.board[index].mine = true; });
  state.minesPlaced = true;
  updateBoardAdjacency(state.board, state.settings);
}

function revealFrom(state, index) {
  revealWaves(state.board, state.settings, index).flat().forEach((cellIndex) => {
    const cell = state.board[cellIndex];
    if (cell.open || cell.flagged || cell.mine) return;
    cell.open = true;
    state.player.stats.safeTilesDug += 1;
    if (state.activeEquipment.bombBotUses > 0) state.activeEquipment.bombBotUses -= 1;
    collectTreasure(state, cell);
  });
}

function toggleFlag(state, index, effects) {
  const cell = state.board[index];
  if (!cell || state.roundResolved || cell.open) return;
  if (!cell.flagged && state.activeEquipment.mineEncapsulationUses > 0) {
    state.activeEquipment.mineEncapsulationUses -= 1;
    state.roundFlagPlacements += 1;
    if (cell.mine) {
      state.player.mines += 1;
      state.player.stats.minesCorrectlyFlagged += 1;
      state.player.stats.minesRecovered += 1;
      destroyMine(state, cell);
      effects.push({ type: "equipment", id: "mineEncapsulation", result: "collected" });
    } else {
      cell.open = true;
      state.player.stats.safeTilesDug += 1;
      collectTreasure(state, cell);
      effects.push({ type: "equipment", id: "mineEncapsulation", result: "missed" });
    }
    maybeWin(state, effects);
    return;
  }
  if (!cell.flagged && state.player.flags <= 0) {
    effects.push({ type: "rejected", reason: "noFlags" });
    return;
  }
  cell.flagged = !cell.flagged;
  cell.flaggedByPlayer = cell.flagged;
  state.flagsPlaced += cell.flagged ? 1 : -1;
  state.player.flags += cell.flagged ? -1 : 1;
  if (cell.flagged) state.roundFlagPlacements += 1;
}

function chordCell(state, index, effects) {
  const cell = state.board[index];
  if (!cell || state.roundResolved || !cell.open || cell.mine || cell.adjacent <= 0) return;
  const chord = evaluateChord(state.board, state.settings, index);
  if (!chord.allowed) {
    effects.push({ type: "rejected", reason: "flagMismatch", required: chord.required, actual: chord.actual });
    return;
  }
  const candidates = chord.candidates.map((candidateIndex) => state.board[candidateIndex]);
  if (candidates.length === 0) return;
  state.moves += 1;
  state.roundUsedChording = true;
  candidates.filter((candidate) => !candidate.mine).forEach((candidate) => revealFrom(state, candidate.index));
  const mine = candidates.find((candidate) => candidate.mine);
  if (mine) {
    state.player.stats.minesTriggered += 1;
    if (state.activeEquipment.bombBotUses > 0) {
      state.activeEquipment.bombBotUses = 0;
      destroyMine(state, mine);
      effects.push({ type: "equipment", id: "bombBot", result: "absorbed" });
      maybeWin(state, effects);
      return;
    }
    breakCurrentShovel(state.player);
    mine.open = true;
    loseRound(state, effects);
    return;
  }
  maybeWin(state, effects);
}

function useEquipment(state, id, index, effects) {
  if (state.roundResolved || (state.player.equipment[id] || 0) <= 0) {
    effects.push({ type: "rejected", reason: "equipmentUnavailable", id });
    return;
  }
  if (!state.minesPlaced) {
    effects.push({ type: "rejected", reason: "minesNotPlaced", id });
    return;
  }
  const cell = state.board[index];
  state.roundStarted = true;
  if (id === "probeCharge") {
    if (!cell || cell.open) return;
    spendEquipment(state, id);
    effects.push({ type: "probe", index, mine: cell.mine });
  } else if (id === "controlledBlast") {
    if (!cell) return;
    spendEquipment(state, id);
    let destroyed = 0;
    for (let row = Math.max(0, cell.row - 1); row <= Math.min(state.settings.rows - 1, cell.row + 1); row += 1) {
      for (let col = Math.max(0, cell.col - 1); col <= Math.min(state.settings.cols - 1, cell.col + 1); col += 1) {
        const target = state.board[row * state.settings.cols + col];
        if (target.mine) {
          destroyMine(state, target);
          destroyed += 1;
        } else if (!target.open) {
          refundFlag(state, target);
          target.open = true;
          state.player.stats.safeTilesDug += 1;
          collectTreasure(state, target);
        }
      }
    }
    updateBoardAdjacency(state.board, state.settings);
    effects.push({ type: "equipment", id, destroyed });
    maybeWin(state, effects);
  } else if (id === "seismicTrap") {
    if (!cell) return;
    spendEquipment(state, id);
    const count = state.board.filter((target) => target.mine && (target.row === cell.row || target.col === cell.col)).length;
    effects.push({ type: "seismic", index, count });
  } else if (id === "bombBot") {
    spendEquipment(state, id);
    state.activeEquipment.bombBotUses = 15;
    effects.push({ type: "equipment", id, uses: 15 });
  } else if (id === "mineEncapsulation") {
    spendEquipment(state, id);
    state.activeEquipment.mineEncapsulationUses = 20;
    effects.push({ type: "equipment", id, uses: 20 });
  }
}

function collectTreasure(state, cell) {
  if (!cell.treasure || cell.treasureCollected) return;
  cell.treasureCollected = true;
  state.roundTreasureValue += cell.treasureValue;
  state.roundTreasureCount += 1;
  state.player.stats.treasureCachesFound += 1;
}

function maybeWin(state, effects) {
  if (!state.roundResolved && hasClearedBoard(state.board)) winRound(state, effects);
}

function winRound(state, effects) {
  if (state.rewardCommitted) return;
  state.roundResolved = true;
  state.outcome = "won";
  const mineCount = state.board.filter((cell) => cell.mine).length;
  const payout = calculateRoundPayout(state.roundTreasureValue, mineCount, state.player.mineYieldPercent);
  state.player.coins += payout;
  state.player.stats.coinsEarned += payout;
  state.player.stats.boardsCompleted += 1;
  state.player.stats.currentWinStreak += 1;
  state.player.stats.longestWinStreak = Math.max(state.player.stats.longestWinStreak, state.player.stats.currentWinStreak);
  if (state.contract) {
    state.player.coins += state.contract.rewardCoins || 0;
    state.player.mines += state.contract.rewardMines || 0;
    state.player.stats.coinsEarned += state.contract.rewardCoins || 0;
    state.player.stats.contractsCompleted += 1;
    state.player.stats.contractsWon += 1;
    state.contractProgress.completed += 1;
    state.contract = null;
  } else {
    state.contractProgress.boardsUntilNext = Math.max(0, state.contractProgress.boardsUntilNext - 1);
  }
  state.rewardCommitted = true;
  effects.push({ type: "victory", payout });
}

function loseRound(state, effects) {
  if (state.roundResolved) return;
  state.roundResolved = true;
  state.outcome = "lost";
  state.player.stats.boardsLost += 1;
  state.player.stats.currentWinStreak = 0;
  state.player.stats.minesCorrectlyFlagged += state.board.filter((cell) => cell.mine && cell.flaggedByPlayer).length;
  if (state.contract) {
    state.player.stats.contractsLost += 1;
    state.contractProgress.failed += 1;
    state.contract = null;
  } else {
    state.contractProgress.boardsUntilNext = Math.max(0, state.contractProgress.boardsUntilNext - 1);
  }
  state.board.forEach((cell) => { if (cell.mine) cell.open = true; });
  effects.push({ type: "failure" });
}

function consumeDurability(player) {
  const result = consumeShovelState(player);
  player.shovelUses = result.shovelUses;
  player.shovels = result.shovels;
  if (result.broke) player.stats.shovelsBroken += 1;
}

function breakCurrentShovel(player) {
  const result = breakCurrentShovelState(player);
  player.shovelUses = result.shovelUses;
  player.shovels = result.shovels;
  if (result.broke) player.stats.shovelsBroken += 1;
}

function destroyMine(state, cell) {
  if (!cell.mine) return;
  refundFlag(state, cell);
  cell.mine = false;
  cell.open = true;
  updateBoardAdjacency(state.board, state.settings);
}

function refundFlag(state, cell) {
  if (cell.flagged) {
    state.flagsPlaced = Math.max(0, state.flagsPlaced - 1);
    if (cell.flaggedByPlayer) state.player.flags += 1;
  }
  cell.flagged = false;
  cell.flaggedByPlayer = false;
}

function spendEquipment(state, id) {
  state.player.equipment[id] = Math.max(0, state.player.equipment[id] - 1);
}

function resetRound(state) {
  const reset = createRoundState({
    settings: state.settings,
    safetyRadius: state.safetyRadius,
    mineIndexes: state.presetMineIndexes,
    player: state.player,
    contract: state.contract,
    contractProgress: state.contractProgress,
  });
  reset.player = clone(state.player);
  return reset;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
