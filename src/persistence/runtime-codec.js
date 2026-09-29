export function encodeModeState(state, now) {
  if (!state) return null;
  const roundElapsedMs = state.roundStarted
    ? Math.max(0, now - (Number.isFinite(state.roundStartTime) ? state.roundStartTime : now))
    : 0;
  const encoded = {
    ...state,
    boardEncoding: 2,
    board: encodeBoard(state.board),
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
    board: state.boardEncoding === 2
      ? decodeBoard(state.board, state.settings)
      : state.boardEncoding === 1
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

function encodeBoard(board) {
  const bytes = new Uint8Array(board.length * 3);
  const treasures = [];
  const curios = [];
  const blueprints = [];
  board.forEach((cell, index) => {
    const mask = cellMask(cell);
    bytes[index * 3] = mask & 255;
    bytes[index * 3 + 1] = mask >>> 8;
    bytes[index * 3 + 2] = cell.adjacent || 0;
    if (cell.treasure) treasures.push([index, cell.treasureValue || 0]);
    if (cell.curio) curios.push([index, cell.curioItem || 0]);
    if (cell.blueprintId) blueprints.push([index, cell.blueprintId]);
  });
  return { length: board.length, cells: bytesToBase64(bytes), treasures, curios, blueprints };
}

function decodeBoard(encoded, settings) {
  const bytes = base64ToBytes(encoded.cells);
  if (encoded.length !== settings.rows * settings.cols || bytes.length !== encoded.length * 3) {
    throw new Error("The compact Board data has an invalid size.");
  }
  const treasures = new Map(encoded.treasures || []);
  const curios = new Map(encoded.curios || []);
  const blueprints = new Map(encoded.blueprints || []);
  return Array.from({ length: encoded.length }, (_, index) => {
    const mask = bytes[index * 3] | (bytes[index * 3 + 1] << 8);
    const cell = decodeCell([mask, treasures.get(index) || 0, curios.get(index) || 0, bytes[index * 3 + 2]], index, settings.cols);
    cell.blueprintId = blueprints.get(index) || null;
    cell.blueprintCollected = Boolean(mask & 512);
    return cell;
  });
}

function cellMask(cell) {
  return (cell.mine ? 1 : 0)
    | (cell.treasure ? 2 : 0)
    | (cell.treasureCollected ? 4 : 0)
    | (cell.open ? 8 : 0)
    | (cell.flagged ? 16 : 0)
    | (cell.flaggedByPlayer ? 32 : 0)
    | (cell.curio ? 64 : 0)
    | (cell.curioCollected ? 128 : 0)
    | (cell.flaggedByWorker ? 256 : 0)
    | (cell.blueprintCollected ? 512 : 0);
}

function bytesToBase64(bytes) {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(value, "base64"));
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeCell(cell) {
  const mask = cellMask(cell);
  const blueprintCode = cell.blueprintId === "pattern121" ? 1 : cell.blueprintId === "pattern1221" ? 2 : 0;
  return [mask, cell.treasureValue || 0, cell.curioItem || 0, cell.adjacent || 0, blueprintCode, cell.blueprintCollected ? 1 : 0];
}

function decodeCell(encoded, index, cols) {
  const [mask = 0, treasureValue = 0, curioItem = 0, adjacent = 0, blueprintCode = 0, blueprintCollected = 0] = encoded;
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
    flaggedByWorker: Boolean(mask & 256),
    adjacent,
    curio: Boolean(mask & 64),
    curioItem,
    curioCollected: Boolean(mask & 128),
    provenMine: false,
    satisfiedClueSafe: false,
    completeTheCountMine: false,
    blueprintId: blueprintCode === 1 ? "pattern121" : blueprintCode === 2 ? "pattern1221" : null,
    blueprintCollected: Boolean(blueprintCollected),
  };
}
