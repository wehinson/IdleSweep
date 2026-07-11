const DEFAULT_SETTINGS = {
  rows: 7,
  cols: 5,
  mines: 6,
  safety: "safe-cell",
};

const GRID_LIMITS = {
  min: 3,
  max: 12,
};

// All economy and progression numbers live here so the game can be balanced in one place.
const BALANCE_CONFIG = {
  currencySymbol: "$",
  startingCoins: 100,
  startingShovels: 2,
  startingFlags: 15,
  startingMines: 0,
  digCostPerTile: 1,
  reveal: {
    tileDelayMs: 48,
    waveDelayMs: 42,
  },
  shovel: {
    buyBaseCost: 25,
    buyCostGrowth: 1.35,
    flagBundleSize: 5,
    flagBaseCost: 10,
    flagCostGrowth: 1.28,
    upgradeBaseCost: 60,
    upgradeCostGrowth: 2.2,
    tiers: [
      { name: "Wooden", durability: 40 },
      { name: "Copper", durability: 70 },
      { name: "Iron", durability: 115 },
      { name: "Steel", durability: 190 },
      { name: "Titanium", durability: 310 },
      { name: "Obsidian", durability: 500 },
      { name: "Diamond", durability: 800 },
    ],
  },
  treasure: {
    count: 4,
    minimumCoins: 6,
    maximumCoins: 16,
  },
  emergencyShovel: {
    enabled: true,
    durability: 40,
    warning: "There will be no more handouts. Use your money wisely.",
  },
};

const boardElement = document.querySelector("#board");
const mineCountElement = document.querySelector("#mine-count");
const moveCountElement = document.querySelector("#move-count");
const statusElement = document.querySelector("#status");
const resetButton = document.querySelector("#reset");
const rowsInput = document.querySelector("#rows-input");
const colsInput = document.querySelector("#cols-input");
const minesInput = document.querySelector("#mines-input");
const minesRange = document.querySelector("#mines-range");
const safetyInputs = Array.from(document.querySelectorAll('input[name="safety"]'));
const settingsNote = document.querySelector("#settings-note");
const coinCountElement = document.querySelector("#coin-count");
const shovelCountElement = document.querySelector("#shovel-count");
const shovelUsesElement = document.querySelector("#shovel-uses");
const shovelResourceElement = document.querySelector("#shovel-resource");
const shovelTooltipElement = document.querySelector("#shovel-tooltip");
const flagStockElement = document.querySelector("#flag-stock");
const activeMineCountElement = document.querySelector("#active-mine-count");
const buyShovelButton = document.querySelector("#buy-shovel");
const buyShovelCostElement = document.querySelector("#buy-shovel-cost");
const buyFlagsButton = document.querySelector("#buy-flags");
const buyFlagsCostElement = document.querySelector("#buy-flags-cost");
const improveShovelButton = document.querySelector("#improve-shovel");
const upgradeTitleElement = document.querySelector("#upgrade-title");
const upgradeDetailElement = document.querySelector("#upgrade-detail");
const upgradeCostElement = document.querySelector("#upgrade-cost");
const storeNoteElement = document.querySelector("#store-note");
const resetProgressButton = document.querySelector("#reset-progress");

let board = [];
let settings = { ...DEFAULT_SETTINGS };
let gameOver = false;
let moves = 0;
let flagsPlaced = 0;
let longPressTimer = null;
let ignoreNextClick = false;
let minesPlaced = false;
let isRevealing = false;
let revealToken = 0;
let recentlyRevealed = new Set();
let treasurePopups = new Map();
let emergencyHandoutNotice = false;
let emergencyHandoutStatus = "";
let player = createStartingPlayer();

function createStartingPlayer() {
  const durability = BALANCE_CONFIG.shovel.tiers[0].durability;

  return {
    coins: BALANCE_CONFIG.startingCoins,
    shovels: BALANCE_CONFIG.startingShovels,
    flags: BALANCE_CONFIG.startingFlags,
    mines: BALANCE_CONFIG.startingMines,
    shovelTier: 0,
    shovelUses: BALANCE_CONFIG.startingShovels * durability,
    shovelPurchases: 0,
    flagPurchases: 0,
    emergencyShovelUsed: false,
  };
}

function createBoard() {
  return Array.from({ length: settings.rows * settings.cols }, (_, index) => ({
    index,
    row: Math.floor(index / settings.cols),
    col: index % settings.cols,
    mine: false,
    treasure: false,
    treasureValue: 0,
    treasureCollected: false,
    open: false,
    flagged: false,
    adjacent: 0,
  }));
}

function placeMines(safeIndex) {
  const safeIndexes = safetyIndexesFor(safeIndex);
  const availableIndexes = board
    .filter((cell) => !safeIndexes.has(cell.index) && !cell.flagged)
    .map((cell) => cell.index);
  const mineIndexes = new Set();
  const mineTarget = Math.min(settings.mines, availableIndexes.length);

  while (mineIndexes.size < mineTarget) {
    const randomAvailableIndex = Math.floor(Math.random() * availableIndexes.length);
    mineIndexes.add(availableIndexes[randomAvailableIndex]);
  }

  mineIndexes.forEach((index) => {
    board[index].mine = true;
  });

  minesPlaced = true;
  placeTreasures();
  updateAdjacency();
}

function placeTreasures() {
  const treasureCandidates = board
    .filter((cell) => !cell.mine)
    .map((cell) => cell.index);
  const treasureIndexes = new Set();
  const treasureTarget = Math.min(BALANCE_CONFIG.treasure.count, treasureCandidates.length);

  while (treasureIndexes.size < treasureTarget) {
    const randomIndex = Math.floor(Math.random() * treasureCandidates.length);
    treasureIndexes.add(treasureCandidates[randomIndex]);
  }

  treasureIndexes.forEach((index) => {
    board[index].treasure = true;
    board[index].treasureValue = randomInteger(
      BALANCE_CONFIG.treasure.minimumCoins,
      BALANCE_CONFIG.treasure.maximumCoins,
    );
  });
}

function safetyIndexesFor(index) {
  const clickedCell = board[index];
  const radius = settings.safety === "safe-5x5" ? 2 : 1;
  const safeIndexes = new Set([index]);

  if (settings.safety === "safe-cell") {
    return safeIndexes;
  }

  board.forEach((cell) => {
    const rowDistance = Math.abs(cell.row - clickedCell.row);
    const colDistance = Math.abs(cell.col - clickedCell.col);

    if (rowDistance <= radius && colDistance <= radius) {
      safeIndexes.add(cell.index);
    }
  });

  return safeIndexes;
}

function maxSafetyAreaSize() {
  if (settings.safety === "safe-cell") {
    return 1;
  }

  const radius = settings.safety === "safe-5x5" ? 2 : 1;
  let largestArea = 1;

  for (let row = 0; row < settings.rows; row += 1) {
    for (let col = 0; col < settings.cols; col += 1) {
      const rowSpan = Math.min(settings.rows - 1, row + radius) - Math.max(0, row - radius) + 1;
      const colSpan = Math.min(settings.cols - 1, col + radius) - Math.max(0, col - radius) + 1;
      largestArea = Math.max(largestArea, rowSpan * colSpan);
    }
  }

  return largestArea;
}

function maxMineCount() {
  return Math.max(0, settings.rows * settings.cols - maxSafetyAreaSize());
}

function updateAdjacency(cells = board) {
  cells.forEach((cell) => {
    cell.adjacent = neighbors(cell, cells).filter((neighbor) => neighbor.mine).length;
  });
}

function neighbors(cell, cells = board) {
  const nearby = [];

  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
      if (rowOffset === 0 && colOffset === 0) continue;

      const row = cell.row + rowOffset;
      const col = cell.col + colOffset;

      if (row >= 0 && row < settings.rows && col >= 0 && col < settings.cols) {
        nearby.push(cells[row * settings.cols + col]);
      }
    }
  }

  return nearby;
}

function startGame() {
  settings.mines = clamp(settings.mines, 0, maxMineCount());
  syncSettingsControls();
  board = createBoard();
  gameOver = false;
  moves = 0;
  flagsPlaced = 0;
  player.mines = BALANCE_CONFIG.startingMines;
  minesPlaced = false;
  isRevealing = false;
  revealToken += 1;
  recentlyRevealed.clear();
  treasurePopups.clear();
  emergencyHandoutNotice = false;
  emergencyHandoutStatus = "";
  ignoreNextClick = false;
  resetButton.textContent = "READY";
  statusElement.textContent = player.shovelUses > 0
    ? "Sweep the grid. Right-click or long-press to flag."
    : "No shovels left. Visit the Quartermaster before digging.";
  render();
}

function render() {
  boardElement.innerHTML = "";
  boardElement.classList.toggle("is-revealing", isRevealing);
  boardElement.style.aspectRatio = `${settings.cols} / ${settings.rows}`;
  boardElement.style.gridTemplateColumns = `repeat(${settings.cols}, minmax(0, 1fr))`;
  boardElement.style.gridTemplateRows = `repeat(${settings.rows}, minmax(0, 1fr))`;
  boardElement.setAttribute(
    "aria-label",
    `${settings.cols} by ${settings.rows} minesweeper board`,
  );

  board.forEach((cell) => {
    const button = document.createElement("button");
    button.className = "cell";
    button.type = "button";
    button.setAttribute("role", "gridcell");
    button.setAttribute("aria-label", labelForCell(cell));
    button.dataset.index = String(cell.index);

    if (cell.open) {
      button.classList.add("is-open");
      button.disabled = true;
      if (recentlyRevealed.has(cell.index)) {
        button.classList.add("is-newly-open");
      }
      if (cell.mine) {
        button.classList.add("is-mine");
        button.textContent = "✹";
      } else if (cell.treasure) {
        button.classList.add("is-treasure");
        button.title = `Treasure cache: +${formatCurrency(cell.treasureValue)}`;
        button.textContent = cell.adjacent > 0 ? String(cell.adjacent) : "✦";
        if (treasurePopups.has(cell.index)) {
          const popup = document.createElement("span");
          popup.className = "treasure-popup";
          popup.textContent = `+${formatCurrency(treasurePopups.get(cell.index))}`;
          popup.setAttribute("aria-hidden", "true");
          button.append(popup);
        }
      } else if (cell.adjacent > 0) {
        button.dataset.adjacent = String(cell.adjacent);
        button.textContent = String(cell.adjacent);
      }
    } else if (cell.flagged) {
      button.classList.add("is-flagged");
      button.textContent = "⚑";
    }

    button.addEventListener("click", () => {
      if (ignoreNextClick) {
        ignoreNextClick = false;
        return;
      }

      openCell(cell.index);
    });
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      toggleFlag(cell.index);
    });
    button.addEventListener("pointerdown", () => scheduleLongPress(cell.index));
    button.addEventListener("pointerup", cancelLongPress);
    button.addEventListener("pointerleave", cancelLongPress);
    button.addEventListener("pointercancel", cancelLongPress);

    boardElement.append(button);
  });

  mineCountElement.textContent = String(Math.max(settings.mines - flagsPlaced, 0)).padStart(2, "0");
  moveCountElement.textContent = String(moves).padStart(2, "0");
  settingsNote.textContent = `${settings.mines} mine${settings.mines === 1 ? "" : "s"}, placed after the first click.`;
  updateQuartermaster();
}

function labelForCell(cell) {
  if (cell.open && cell.mine) return `Row ${cell.row + 1}, column ${cell.col + 1}, mine`;
  if (cell.open && cell.treasure) {
    return `Row ${cell.row + 1}, column ${cell.col + 1}, treasure worth ${formatCurrency(cell.treasureValue)}`;
  }
  if (cell.open && cell.adjacent > 0) {
    return `Row ${cell.row + 1}, column ${cell.col + 1}, ${cell.adjacent} nearby mines`;
  }
  if (cell.open) return `Row ${cell.row + 1}, column ${cell.col + 1}, clear`;
  if (cell.flagged) return `Row ${cell.row + 1}, column ${cell.col + 1}, flagged`;
  return `Row ${cell.row + 1}, column ${cell.col + 1}, hidden`;
}

function openCell(index) {
  const cell = board[index];
  if (gameOver || isRevealing || cell.open || cell.flagged) return;
  if (!canDig()) {
    if (!maybeGrantEmergencyShovel()) {
      emergencyHandoutNotice = false;
      statusElement.textContent = "Your shovels are spent. Buy a fresh one to keep digging.";
      render();
      return;
    }
  } else {
    emergencyHandoutNotice = false;
  }

  if (!minesPlaced) {
    placeMines(cell.index);
  }

  moves += 1;

  if (cell.mine) {
    breakShovel();
    cell.open = true;
    loseGame();
    return;
  }

  isRevealing = true;
  const currentRevealToken = ++revealToken;
  revealGradually(cell, currentRevealToken).then((revealCompleted) => {
    if (currentRevealToken !== revealToken) return;

    isRevealing = false;
    const shouldPreserveHandout = emergencyHandoutNotice;
    if (hasWon()) {
      winGame();
      if (shouldPreserveHandout) {
        emergencyHandoutNotice = true;
        statusElement.textContent = emergencyHandoutStatus;
      }
    } else if (emergencyHandoutNotice) {
      render();
    } else if (!revealCompleted || !canDig()) {
      statusElement.textContent = "Shovels spent. Restock at the Quartermaster to keep sweeping.";
    } else {
      statusElement.textContent = "Clean hit. Keep sweeping.";
    }
    render();
  });
}

function revealGradually(startCell, token) {
  const waves = revealWavesFrom(startCell);

  return (async () => {
    for (const wave of waves) {
      for (const cell of wave) {
        if (token !== revealToken || gameOver) return false;
        if (cell.open || cell.flagged || cell.mine) continue;
        if (!consumeShovel()) return false;

        cell.open = true;
        collectTreasure(cell);
        recentlyRevealed = new Set([cell.index]);
        render();
        recentlyRevealed.clear();
        await delay(BALANCE_CONFIG.reveal.tileDelayMs);
      }

      await delay(BALANCE_CONFIG.reveal.waveDelayMs);
    }

    return true;
  })();
}

function revealWavesFrom(startCell) {
  const waves = [];
  const pending = [{ cell: startCell, distance: 0 }];
  const queued = new Set([startCell.index]);

  while (pending.length > 0) {
    const { cell, distance } = pending.shift();
    if (cell.open || cell.flagged || cell.mine) continue;

    if (!waves[distance]) waves[distance] = [];
    waves[distance].push(cell);

    if (cell.adjacent !== 0) continue;

    neighbors(cell).forEach((neighbor) => {
      if (!queued.has(neighbor.index)) {
        queued.add(neighbor.index);
        pending.push({ cell: neighbor, distance: distance + 1 });
      }
    });
  }

  return waves;
}

function delay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function collectTreasure(cell) {
  if (!cell.treasure || cell.treasureCollected) return;

  cell.treasureCollected = true;
  player.coins += cell.treasureValue;
  treasurePopups.set(cell.index, cell.treasureValue);
  window.setTimeout(() => {
    if (treasurePopups.get(cell.index) !== cell.treasureValue) return;
    treasurePopups.delete(cell.index);
    render();
  }, 900);
  if (!emergencyHandoutNotice) {
    statusElement.textContent = `Treasure found: +${formatCurrency(cell.treasureValue)}.`;
  }
}

function toggleFlag(index) {
  const cell = board[index];
  if (gameOver || isRevealing || cell.open) return;

  if (!cell.flagged && player.flags <= 0) {
    emergencyHandoutNotice = false;
    statusElement.textContent = "Flag pouch empty. Buy five more at the Quartermaster.";
    render();
    return;
  }

  emergencyHandoutNotice = false;
  cell.flagged = !cell.flagged;
  flagsPlaced += cell.flagged ? 1 : -1;
  player.flags += cell.flagged ? -1 : 1;
  statusElement.textContent = cell.flagged ? "Flag planted." : "Flag cleared.";
  render();
}

function scheduleLongPress(index) {
  cancelLongPress();
  longPressTimer = window.setTimeout(() => {
    toggleFlag(index);
    ignoreNextClick = true;
    longPressTimer = null;
  }, 450);
}

function cancelLongPress() {
  if (longPressTimer) {
    window.clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function loseGame() {
  gameOver = true;
  resetButton.textContent = "RETRY";
  board.forEach((cell) => {
    if (cell.mine) cell.open = true;
  });
  if (!maybeGrantEmergencyShovel("Boom. The shovel shattered.")) {
    emergencyHandoutNotice = false;
    statusElement.textContent = "Boom. The shovel shattered. Cabinet reset is waiting.";
  }
  render();
}

function winGame() {
  gameOver = true;
  resetButton.textContent = "AGAIN";
  emergencyHandoutNotice = false;
  statusElement.textContent = "Board clear. High score energy.";
  board.forEach((cell) => {
    if (cell.mine && !cell.flagged) {
      cell.flagged = true;
      flagsPlaced += 1;
    }
  });
}

function hasWon() {
  return board.every((cell) => cell.mine || cell.open);
}

function canDig() {
  return player.shovelUses >= BALANCE_CONFIG.digCostPerTile;
}

function consumeShovel() {
  if (!canDig()) return false;

  player.shovelUses -= BALANCE_CONFIG.digCostPerTile;
  player.shovels = Math.ceil(player.shovelUses / currentShovel().durability);
  maybeGrantEmergencyShovel();
  return true;
}

function breakShovel() {
  if (player.shovels <= 0 || player.shovelUses <= 0) return;

  const durability = currentShovel().durability;
  const currentShovelUses = player.shovelUses % durability || durability;
  player.shovelUses = Math.max(0, player.shovelUses - currentShovelUses);
  player.shovels = Math.max(0, player.shovels - 1);
}

function buyShovel() {
  const cost = shovelPurchaseCost();
  if (player.coins < cost) return;

  emergencyHandoutNotice = false;
  player.coins -= cost;
  player.shovels += 1;
  player.shovelUses += currentShovel().durability;
  player.shovelPurchases += 1;
  statusElement.textContent = "Fresh shovel stocked. Back to work.";
  render();
}

function buyFlags() {
  const cost = flagPurchaseCost();
  if (player.coins < cost) return;

  emergencyHandoutNotice = false;
  player.coins -= cost;
  player.flags += BALANCE_CONFIG.shovel.flagBundleSize;
  player.flagPurchases += 1;
  statusElement.textContent = `Flag bundle stocked: +${BALANCE_CONFIG.shovel.flagBundleSize}.`;
  render();
}

function improveShovel() {
  const nextTierIndex = player.shovelTier + 1;
  if (nextTierIndex >= BALANCE_CONFIG.shovel.tiers.length) return;

  const cost = shovelUpgradeCost();
  if (player.coins < cost) return;

  emergencyHandoutNotice = false;
  const intactShovels = player.shovels;
  player.coins -= cost;
  player.shovelTier = nextTierIndex;
  player.shovelUses = intactShovels * currentShovel().durability;
  statusElement.textContent = `${currentShovel().name} shovel upgrade installed.`;
  render();
}

function maybeGrantEmergencyShovel(prefix = "") {
  const emergency = BALANCE_CONFIG.emergencyShovel;
  if (
    !emergency.enabled ||
    player.emergencyShovelUsed ||
    player.shovels > 0 ||
    player.shovelUses > 0 ||
    player.coins >= shovelPurchaseCost()
  ) {
    return false;
  }

  player.emergencyShovelUsed = true;
  player.shovels = 1;
  player.shovelUses = emergency.durability;
  emergencyHandoutNotice = true;

  const lead = prefix ? `${prefix} ` : "";
  emergencyHandoutStatus = `${lead}Quartermaster comped one wooden shovel: ${emergency.durability} digs. ${emergency.warning}`;
  statusElement.textContent = emergencyHandoutStatus;
  return true;
}

function resetProgress() {
  player = createStartingPlayer();
  startGame();
  statusElement.textContent = "Progress reset. Fresh purse, fresh tools.";
  render();
}

function updateQuartermaster() {
  const tier = currentShovel();
  const nextTier = BALANCE_CONFIG.shovel.tiers[player.shovelTier + 1];
  const shovelCost = shovelPurchaseCost();
  const flagsCost = flagPurchaseCost();
  const upgradeCost = shovelUpgradeCost();

  coinCountElement.textContent = formatCurrency(player.coins);
  shovelCountElement.textContent = String(player.shovels).padStart(2, "0");
  shovelUsesElement.textContent = `${player.shovelUses} digs`;
  flagStockElement.textContent = String(player.flags).padStart(2, "0");
  activeMineCountElement.textContent = String(player.mines).padStart(2, "0");

  const tooltip = `${tier.name} shovel: ${tier.durability} tiles before it breaks.`;
  shovelTooltipElement.textContent = tooltip;
  shovelResourceElement.title = tooltip;
  shovelResourceElement.setAttribute("aria-label", tooltip);

  buyShovelCostElement.textContent = formatCurrency(shovelCost);
  buyFlagsCostElement.textContent = formatCurrency(flagsCost);
  buyShovelButton.disabled = player.coins < shovelCost;
  buyFlagsButton.disabled = player.coins < flagsCost;

  if (nextTier) {
    upgradeTitleElement.textContent = "Improve shovel";
    upgradeDetailElement.textContent = `${tier.name} → ${nextTier.name}`;
    upgradeCostElement.textContent = formatCurrency(upgradeCost);
    improveShovelButton.disabled = player.coins < upgradeCost;
    storeNoteElement.textContent = `${tier.name} tools last ${tier.durability} tiles. Treasures refill the purse.`;
  } else {
    upgradeTitleElement.textContent = "Shovel perfected";
    upgradeDetailElement.textContent = `${tier.name} is the final tier`;
    upgradeCostElement.textContent = "MAX";
    improveShovelButton.disabled = true;
    storeNoteElement.textContent = `${tier.name} tools are fully upgraded. Treasures refill the purse.`;
  }
}

function currentShovel() {
  return BALANCE_CONFIG.shovel.tiers[player.shovelTier];
}

function shovelPurchaseCost() {
  return exponentialCost(
    BALANCE_CONFIG.shovel.buyBaseCost,
    BALANCE_CONFIG.shovel.buyCostGrowth,
    player.shovelPurchases,
  );
}

function flagPurchaseCost() {
  return exponentialCost(
    BALANCE_CONFIG.shovel.flagBaseCost,
    BALANCE_CONFIG.shovel.flagCostGrowth,
    player.flagPurchases,
  );
}

function shovelUpgradeCost() {
  return exponentialCost(
    BALANCE_CONFIG.shovel.upgradeBaseCost,
    BALANCE_CONFIG.shovel.upgradeCostGrowth,
    player.shovelTier,
  );
}

function exponentialCost(base, growth, step) {
  return Math.ceil(base * growth ** step);
}

function formatCurrency(value) {
  return `${BALANCE_CONFIG.currencySymbol}${Math.max(0, Math.floor(value))}`;
}

function randomInteger(minimum, maximum) {
  return Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function readIntegerInput(input, fallback, min, max) {
  const value = Number.parseInt(input.value, 10);
  if (Number.isNaN(value)) return fallback;
  return clamp(value, min, max);
}

function syncSettingsControls() {
  const maxMines = maxMineCount();

  rowsInput.value = String(settings.rows);
  colsInput.value = String(settings.cols);
  minesInput.max = String(maxMines);
  minesInput.value = String(settings.mines);
  minesRange.max = String(maxMines);
  minesRange.value = String(settings.mines);

  safetyInputs.forEach((input) => {
    input.checked = input.value === settings.safety;
  });
}

function applySettingsFromControls(source) {
  settings.rows = readIntegerInput(rowsInput, settings.rows, GRID_LIMITS.min, GRID_LIMITS.max);
  settings.cols = readIntegerInput(colsInput, settings.cols, GRID_LIMITS.min, GRID_LIMITS.max);
  settings.safety = safetyInputs.find((input) => input.checked)?.value || settings.safety;

  const mineSource = source === minesRange ? minesRange : minesInput;
  settings.mines = readIntegerInput(mineSource, settings.mines, 0, maxMineCount());
  startGame();
}

rowsInput.addEventListener("change", () => applySettingsFromControls(rowsInput));
colsInput.addEventListener("change", () => applySettingsFromControls(colsInput));
minesInput.addEventListener("change", () => applySettingsFromControls(minesInput));
minesInput.addEventListener("input", () => applySettingsFromControls(minesInput));
minesRange.addEventListener("input", () => applySettingsFromControls(minesRange));
safetyInputs.forEach((input) => {
  input.addEventListener("change", () => applySettingsFromControls(input));
});
buyShovelButton.addEventListener("click", buyShovel);
buyFlagsButton.addEventListener("click", buyFlags);
improveShovelButton.addEventListener("click", improveShovel);
resetButton.addEventListener("click", startGame);
resetProgressButton.addEventListener("click", resetProgress);
startGame();
