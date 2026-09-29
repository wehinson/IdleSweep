export function visibleGridRange({ scrollLeft, scrollTop, clientWidth, clientHeight, rows, cols, cellSize = 34, overscan = 2 }) {
  const firstCol = Math.max(0, Math.floor(scrollLeft / cellSize) - overscan);
  const firstRow = Math.max(0, Math.floor(scrollTop / cellSize) - overscan);
  const lastCol = Math.min(cols - 1, Math.ceil((scrollLeft + clientWidth) / cellSize) + overscan);
  const lastRow = Math.min(rows - 1, Math.ceil((scrollTop + clientHeight) / cellSize) + overscan);
  return { firstRow, lastRow, firstCol, lastCol };
}

export function visibleIndexes(range, cols) {
  const indexes = [];
  for (let row = range.firstRow; row <= range.lastRow; row += 1) {
    for (let col = range.firstCol; col <= range.lastCol; col += 1) indexes.push(row * cols + col);
  }
  return indexes;
}
