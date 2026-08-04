export function createBoardCells(settings) {
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
    flaggedByPlayer: false,
    adjacent: 0,
    provenMine: false,
    satisfiedClueSafe: false,
    completeTheCountMine: false,
  }));
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
