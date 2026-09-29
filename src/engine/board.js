const CELL_BITS = Object.freeze({
  mine: 1,
  treasure: 2,
  treasureCollected: 4,
  open: 8,
  flagged: 16,
  flaggedByPlayer: 32,
  flaggedByWorker: 64,
  curio: 128,
  curioCollected: 256,
  provenMine: 512,
  satisfiedClueSafe: 1024,
  completeTheCountMine: 2048,
  blueprintCollected: 4096,
});

export function createBoardCells(settings) {
  const length = settings.rows * settings.cols;
  const storage = {
    bits: new Uint16Array(length),
    adjacent: new Uint8Array(length),
    treasureValues: new Map(),
    curioItems: new Map(),
    blueprintIds: new Map(),
  };
  const cells = Array.from({ length }, (_, index) => createCellView(index, settings.cols, storage));
  Object.defineProperty(cells, "storage", { value: storage, enumerable: false });
  return cells;
}

export function createBoardCellsFrom(source, settings) {
  const cells = createBoardCells(settings);
  source.forEach((input, index) => {
    const cell = cells[index];
    for (const key of Object.keys(CELL_BITS)) cell[key] = Boolean(input[key]);
    cell.adjacent = input.adjacent || 0;
    cell.treasureValue = input.treasureValue || 0;
    cell.curioItem = input.curioItem || 0;
    cell.blueprintId = input.blueprintId || null;
  });
  return cells;
}

function createCellView(index, cols, storage) {
  const cell = { index, row: Math.floor(index / cols), col: index % cols };
  for (const [name, bit] of Object.entries(CELL_BITS)) {
    Object.defineProperty(cell, name, {
      enumerable: true,
      get: () => Boolean(storage.bits[index] & bit),
      set: (value) => {
        if (value) storage.bits[index] |= bit;
        else storage.bits[index] &= ~bit;
      },
    });
  }
  defineNumeric(cell, "adjacent", storage.adjacent, index);
  defineSparse(cell, "treasureValue", storage.treasureValues, index, 0);
  defineSparse(cell, "curioItem", storage.curioItems, index, 0);
  defineSparse(cell, "blueprintId", storage.blueprintIds, index, null);
  return cell;
}

function defineNumeric(cell, name, values, index) {
  Object.defineProperty(cell, name, {
    enumerable: true,
    get: () => values[index],
    set: (value) => { values[index] = Math.max(0, Number(value) || 0); },
  });
}

function defineSparse(cell, name, values, index, emptyValue) {
  Object.defineProperty(cell, name, {
    enumerable: true,
    get: () => values.get(index) ?? emptyValue,
    set: (value) => {
      if (value === emptyValue || value === null || value === undefined || value === 0) values.delete(index);
      else values.set(index, value);
    },
  });
}

export function getNeighbors(cell, cells, settings) {
  const neighbors = [];
  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
      if (rowOffset === 0 && colOffset === 0) continue;
      const row = cell.row + rowOffset;
      const col = cell.col + colOffset;
      if (row < 0 || row >= settings.rows || col < 0 || col >= settings.cols) continue;
      neighbors.push(cells[row * settings.cols + col]);
    }
  }
  return neighbors;
}

export function updateBoardAdjacency(cells, settings) {
  cells.forEach((cell) => {
    cell.adjacent = getNeighbors(cell, cells, settings).filter((neighbor) => neighbor.mine).length;
  });
  return cells;
}

export function hasClearedBoard(cells) {
  return cells.every((cell) => cell.mine || cell.open);
}
