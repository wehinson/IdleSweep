import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const themesDir = join(root, "themes");

function loadKit() {
  const module = { exports: {} };
  vm.runInNewContext(readFileSync(join(themesDir, "theme-kit.js"), "utf8"), { module, globalThis: {} });
  return module.exports;
}

function loadThemes() {
  const registered = [];
  const ThemeKit = { register: (theme) => registered.push(theme) };
  for (const id of readdirSync(themesDir)) {
    const file = join(themesDir, id, "theme.js");
    if (existsSync(file)) vm.runInNewContext(readFileSync(file, "utf8"), { ThemeKit, window: { ThemeKit } });
  }
  return registered;
}

const kit = loadKit();

test("translate keeps word boundaries and letter case", () => {
  const compiled = kit.compilePhrases({ Mines: "Sea Mines", Mine: "Sea Mine", mine: "sea mine", "✹": "✺" });
  assert.equal(kit.translate("Mines: 4", compiled), "Sea Mines: 4");
  assert.equal(kit.translate("HIRE 3 MINES", compiled), "HIRE 3 SEA MINES");
  assert.equal(kit.translate("Mine a mine ✹", compiled), "Sea Mine a sea mine ✺");
  assert.equal(kit.translate("Determined", compiled), "Determined");
});

test("translate returns the input when no phrases are given", () => {
  assert.equal(kit.translate("Mines", kit.compilePhrases({})), "Mines");
});

test("mapColor keeps alpha and ignores unknown colours", () => {
  const compiled = kit.compileColors({ "#182413": "#102030", "#9cac77": "rgba(0, 0, 0, 0.5)" });
  assert.equal(kit.mapColor("#182413", compiled), "#102030");
  assert.equal(kit.mapColor("rgba(24, 36, 19, 0.25)", compiled), "rgba(16, 32, 48, 0.25)");
  assert.equal(kit.mapColor("#9CAC77", compiled), "rgba(0, 0, 0, 0.5)");
  assert.equal(kit.mapColor("#abcdef", compiled), "#abcdef");
});

test("every theme is valid, unique, and scoped", () => {
  const themes = loadThemes();
  assert.equal(themes.length, 5, "five redesign themes are registered");
  assert.equal(new Set(themes.map((theme) => theme.id)).size, 5);
  for (const theme of themes) {
    const errors = kit.validateTheme(theme);
    assert.equal(errors.length, 0, `${theme.id}: ${errors.join("; ")}`);
    const css = readFileSync(join(themesDir, theme.id, "theme.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const selectors = css
      .replace(/@(?:import|font-face)[^;{]*;/g, "")
      .replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "")
      .replace(/@media[^{]+\{/g, "")
      .split("}")
      .map((block) => block.split("{")[0].trim())
      .filter(Boolean);
    for (const selector of selectors) {
      for (const part of selector.split(",")) {
        assert.match(part.trim(), new RegExp(`^html\\[data-theme="${theme.id}"\\]`), `${theme.id}: unscoped selector "${part.trim()}"`);
      }
    }
  }
});

test("every theme renames the core game vocabulary", () => {
  const core = ["Sweeper Inc.", "Mines", "Flags", "Shovels", "Hints", "Quartermaster", "Workshop", "Purse", "Message Board", "Operator Panel", "District", "Auto Mine", "✹", "⚑", "✦"];
  for (const theme of loadThemes()) {
    for (const term of core) assert.ok(term in theme.phrases, `${theme.id} is missing a phrase for "${term}"`);
  }
});
