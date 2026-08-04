export function encodeModeState(state, now) {
  if (!state) return null;
  const roundElapsedMs = state.roundStarted
    ? Math.max(0, now - (Number.isFinite(state.roundStartTime) ? state.roundStartTime : now))
    : 0;
  const encoded = {
    ...state,
    boardEncoding: 1,
    board: state.board.map(encodeCell),
    roundElapsedMs,
    recentlyRevealed: Array.from(state.recentlyRevealed || []),
    treasurePopups: Array.from(state.treasurePopups || []),
    notice: { code: "literal", args: { text: state.statusText || "" } },
    controls: { resetText: state.resetText || "READY" },
  };
  delete encoded.roundStartTime;
  delete encoded.statusText;
  delete encoded.resetText;
  return encoded;
}

export function decodeModeState(state, now) {
  if (!state) return null;
  const decoded = {
    ...state,
    board: state.boardEncoding === 1
      ? state.board.map((cell, index) => decodeCell(cell, index, state.settings.cols))
      : state.board,
    roundStartTime: state.roundStarted ? now - state.roundElapsedMs : 0,
    recentlyRevealed: new Set(state.recentlyRevealed || []),
    treasurePopups: new Map(state.treasurePopups || []),
    statusText: state.notice?.args?.text || "",
    resetText: state.controls?.resetText || "READY",
  };
  delete decoded.roundElapsedMs;
  delete decoded.notice;
  delete decoded.controls;
  delete decoded.boardEncoding;
  return decoded;
}

function encodeCell(cell) {
  const mask = (cell.mine ? 1 : 0)
    | (cell.treasure ? 2 : 0)
    | (cell.treasureCollected ? 4 : 0)
    | (cell.open ? 8 : 0)
    | (cell.flagged ? 16 : 0)
    | (cell.flaggedByPlayer ? 32 : 0)
    | (cell.curio ? 64 : 0)
    | (cell.curioCollected ? 128 : 0);
  return [mask, cell.treasureValue || 0, cell.curioItem || 0, cell.adjacent || 0];
}

function decodeCell(encoded, index, cols) {
  const [mask = 0, treasureValue = 0, curioItem = 0, adjacent = 0] = encoded;
  return {
    index,
    row: Math.floor(index / cols),
    col: index % cols,
    mine: Boolean(mask & 1),
    treasure: Boolean(mask & 2),
    treasureValue,
    treasureCollected: Boolean(mask & 4),
    open: Boolean(mask & 8),
    flagged: Boolean(mask & 16),
    flaggedByPlayer: Boolean(mask & 32),
    adjacent,
    curio: Boolean(mask & 64),
    curioItem,
    curioCollected: Boolean(mask & 128),
    provenMine: false,
    satisfiedClueSafe: false,
    completeTheCountMine: false,
  };
}
