import { downloadSave, parseImportedSave } from "../persistence/storage.js";

export function bindSaveControls({ captureState, replaceState, showNotice }) {
  const exportButton = document.querySelector("#export-save");
  const importButton = document.querySelector("#import-save");
  const importInput = document.querySelector("#import-save-input");

  exportButton.addEventListener("click", () => {
    try {
      downloadSave(captureState());
      showNotice("Save exported.");
    } catch (error) {
      showNotice(`Export failed: ${error.message}`);
    }
  });

  importButton.addEventListener("click", () => importInput.click());
  importInput.addEventListener("change", async () => {
    const [file] = importInput.files;
    importInput.value = "";
    if (!file) return;
    try {
      const state = parseImportedSave(await file.text());
      if (!window.confirm("Replace the current game with this save?")) return;
      replaceState(state);
      showNotice("Save imported.");
    } catch (error) {
      showNotice(`Import failed: ${error.message}`);
    }
  });
}
