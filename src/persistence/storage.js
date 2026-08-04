import { hydrateSave, serializeSave, validateSave } from "./save-schema.js";

export const SAVE_STORAGE_KEY = "idle-sweeper.save.v1";
export const LEGACY_MESSAGE_BOARD_KEY = "idle-sweeper.message-board.v1";
export const SWAP_CONTROLS_STORAGE_KEY = "idle-sweeper.swap-controls.v1";
export const SAVE_WARNING_BYTES = 4 * 1024 * 1024;

export function loadSwapControlsPreference(storage = window.localStorage) {
  return storage.getItem(SWAP_CONTROLS_STORAGE_KEY) === "1";
}

export function storeSwapControlsPreference(enabled, storage = window.localStorage) {
  storage.setItem(SWAP_CONTROLS_STORAGE_KEY, enabled ? "1" : "0");
}

export function loadStoredSave(storage = window.localStorage) {
  const raw = storage.getItem(SAVE_STORAGE_KEY);
  if (!raw) return null;
  return hydrateSave(JSON.parse(raw));
}

export function storeSave(state, storage = window.localStorage) {
  const serialized = serializeSave(state);
  if (serialized.length >= SAVE_WARNING_BYTES) console.warn(`Idle Sweep save is ${serialized.length.toLocaleString()} bytes.`);
  storage.setItem(SAVE_STORAGE_KEY, serialized);
}

export function clearStoredSaves(storage = window.localStorage) {
  storage.removeItem(SAVE_STORAGE_KEY);
  storage.removeItem(LEGACY_MESSAGE_BOARD_KEY);
}

export function readLegacyMessageBoard(storage = window.localStorage) {
  const raw = storage.getItem(LEGACY_MESSAGE_BOARD_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  return parsed && Array.isArray(parsed.challenges) ? parsed : null;
}

export function parseImportedSave(text) {
  const document = JSON.parse(text);
  validateSave(document);
  return hydrateSave(document);
}

export function downloadSave(state, documentRef = document) {
  const json = serializeSave(state);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = documentRef.createElement("a");
  anchor.href = url;
  anchor.download = `idle-sweep-save-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
