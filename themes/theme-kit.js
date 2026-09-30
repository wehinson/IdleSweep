/*
 * ThemeKit: runtime reskin layer shared by the redesign branches.
 *
 * A theme is presentation only. It never changes game state or engine data.
 *   - phrases: display text remapped at render time (DOM text, attributes, canvas text)
 *   - canvas.colors: literal canvas colours remapped when the game paints
 *   - canvas.fonts: canvas font families remapped
 *   - css: a stylesheet whose rules are all scoped to html[data-theme="<id>"]
 *
 * The pure core (compilePhrases, translate, mapColor, validateTheme) runs in Node
 * for tests. The browser runtime (register, apply, picker) runs only with a DOM.
 */
(function (root, factory) {
  const kit = factory(root);
  if (typeof module === "object" && module.exports) module.exports = kit;
  else root.ThemeKit = kit;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  // ---------- pure core ----------

  const LETTER = "A-Za-z\\u00C0-\\u024F";

  function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function capitalize(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function variantsOf(from, to) {
    const out = [[from, to]];
    if (/[a-z]/.test(from)) out.push([from.toUpperCase(), to.toUpperCase()]);
    if (/^[a-z]/.test(from)) out.push([capitalize(from), capitalize(to)]);
    return out;
  }

  function compilePhrases(phrases) {
    const lookup = new Map();
    for (const [from, to] of Object.entries(phrases || {})) {
      if (!from || typeof to !== "string") continue;
      for (const [variantFrom, variantTo] of variantsOf(from, to)) {
        if (!lookup.has(variantFrom)) lookup.set(variantFrom, variantTo);
      }
    }
    if (lookup.size === 0) return null;
    const keys = [...lookup.keys()].sort((a, b) => b.length - a.length);
    const parts = keys.map((key) => {
      let pattern = escapeRegExp(key);
      if (new RegExp(`^[${LETTER}0-9]`).test(key)) pattern = `(?<![${LETTER}])${pattern}`;
      if (new RegExp(`[${LETTER}0-9]$`).test(key)) pattern = `${pattern}(?![${LETTER}])`;
      return pattern;
    });
    return { regex: new RegExp(parts.join("|"), "g"), lookup, cache: new Map() };
  }

  function translate(text, compiled) {
    if (!compiled || typeof text !== "string" || text.length === 0) return text;
    const cached = compiled.cache.get(text);
    if (cached !== undefined) return cached;
    compiled.regex.lastIndex = 0;
    const result = text.replace(compiled.regex, (match) => compiled.lookup.get(match) ?? match);
    if (compiled.cache.size > 5000) compiled.cache.clear();
    compiled.cache.set(text, result);
    return result;
  }

  function parseColor(value) {
    if (typeof value !== "string") return null;
    const text = value.trim().toLowerCase();
    let match = /^#([0-9a-f]{3})$/.exec(text);
    if (match) {
      const [r, g, b] = match[1].split("").map((c) => parseInt(c + c, 16));
      return { r, g, b, a: 1 };
    }
    match = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(text);
    if (match) {
      const n = parseInt(match[1], 16);
      const a = match[2] ? parseInt(match[2], 16) / 255 : 1;
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a };
    }
    match = /^rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/.exec(text);
    if (match) {
      let a = match[4] === undefined ? 1 : parseFloat(match[4]);
      if (match[4] && match[4].endsWith("%")) a /= 100;
      return { r: +match[1], g: +match[2], b: +match[3], a };
    }
    return null;
  }

  function colorKey(color) {
    return `${color.r},${color.g},${color.b}`;
  }

  // Compile { "#9cac77": "#1b2a3a", "rgb(24,36,19)": "#fff" } into rgb-keyed lookups.
  function compileColors(colors) {
    const map = new Map();
    for (const [from, to] of Object.entries(colors || {})) {
      const source = parseColor(from);
      const target = parseColor(to);
      if (source && target) map.set(colorKey(source), target);
    }
    return map.size ? { map, cache: new Map() } : null;
  }

  // Map a literal colour and keep its alpha (multiplied by the target's alpha).
  function mapColor(value, compiled) {
    if (!compiled || typeof value !== "string") return value;
    const cached = compiled.cache.get(value);
    if (cached !== undefined) return cached;
    let result = value;
    const color = parseColor(value);
    if (color) {
      const target = compiled.map.get(colorKey(color));
      if (target) {
        const alpha = Math.round(color.a * target.a * 1000) / 1000;
        result = alpha >= 1 ? `rgb(${target.r}, ${target.g}, ${target.b})` : `rgba(${target.r}, ${target.g}, ${target.b}, ${alpha})`;
      }
    }
    if (compiled.cache.size > 2000) compiled.cache.clear();
    compiled.cache.set(value, result);
    return result;
  }

  function mapFont(font, fonts) {
    if (!fonts || typeof font !== "string") return font;
    let result = font;
    for (const [from, to] of Object.entries(fonts)) {
      if (result.includes(from)) result = result.split(from).join(to);
    }
    return result;
  }

  function validateTheme(theme) {
    const errors = [];
    if (!theme || typeof theme !== "object") return ["theme must be an object"];
    if (!/^[a-z0-9-]+$/.test(theme.id || "")) errors.push("id must be kebab-case");
    if (!theme.name) errors.push("name is required");
    if (!theme.author) errors.push("author is required");
    if (theme.phrases && typeof theme.phrases !== "object") errors.push("phrases must be an object");
    if (theme.labels && typeof theme.labels !== "object") errors.push("labels must be an object");
    for (const [from, to] of Object.entries(theme.phrases || {})) {
      if (typeof to !== "string") errors.push(`phrase "${from}" must map to a string`);
    }
    for (const [from, to] of Object.entries(theme.canvas?.colors || {})) {
      if (!parseColor(from)) errors.push(`canvas colour key "${from}" is not a hex/rgb colour`);
      if (!parseColor(to)) errors.push(`canvas colour value "${to}" is not a hex/rgb colour`);
    }
    return errors;
  }

  const core = { compilePhrases, translate, parseColor, compileColors, mapColor, mapFont, validateTheme };

  if (typeof document === "undefined") return core;

  // ---------- browser runtime ----------

  const ORIGINAL = { id: "original", name: "Original", author: "Current game", phrases: {} };
  const themes = new Map([[ORIGINAL.id, ORIGINAL]]);
  const listeners = [];
  const textRecords = new WeakMap();
  const attrRecords = new WeakMap();
  const ATTRS = ["title", "aria-label", "data-tooltip", "placeholder", "alt"];
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "NOSCRIPT"]);

  let options = { storageKey: "themekit.theme", baseTitle: document.title };
  let active = ORIGINAL;
  let compiledPhrases = null;
  let compiledColors = null;
  let observer = null;

  function isSkipped(node) {
    const element = node.nodeType === 1 ? node : node.parentElement;
    if (!element) return true;
    if (SKIP_TAGS.has(element.tagName)) return true;
    return Boolean(element.closest("[data-theme-skip]"));
  }

  function processText(node) {
    if (isSkipped(node)) return;
    const current = node.nodeValue;
    const record = textRecords.get(node);
    if (record && current === record.written) return;
    const output = translate(current, compiledPhrases);
    textRecords.set(node, { original: current, written: output });
    if (output !== current) node.nodeValue = output;
  }

  function processAttribute(element, name) {
    if (!element.hasAttribute(name) || isSkipped(element)) return;
    const current = element.getAttribute(name);
    let records = attrRecords.get(element);
    const record = records && records.get(name);
    if (record && current === record.written) return;
    const output = translate(current, compiledPhrases);
    if (!records) attrRecords.set(element, (records = new Map()));
    records.set(name, { original: current, written: output });
    if (output !== current) element.setAttribute(name, output);
  }

  function walk(rootNode, visitText, visitElement) {
    if (rootNode.nodeType === 3) return visitText(rootNode);
    if (rootNode.nodeType !== 1 && rootNode.nodeType !== 9 && rootNode.nodeType !== 11) return;
    if (rootNode.nodeType === 1) visitElement(rootNode);
    const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();
    while (node) {
      if (node.nodeType === 3) visitText(node);
      else visitElement(node);
      node = walker.nextNode();
    }
  }

  function translateTree(rootNode) {
    walk(rootNode, processText, (element) => ATTRS.forEach((name) => processAttribute(element, name)));
  }

  function restoreTree(rootNode) {
    walk(
      rootNode,
      (node) => {
        const record = textRecords.get(node);
        if (record && node.nodeValue === record.written && record.original !== record.written) node.nodeValue = record.original;
        textRecords.delete(node);
      },
      (element) => {
        const records = attrRecords.get(element);
        if (!records) return;
        for (const [name, record] of records) {
          if (element.getAttribute(name) === record.written && record.original !== record.written) element.setAttribute(name, record.original);
        }
        attrRecords.delete(element);
      },
    );
  }

  function onMutations(mutations) {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") processText(mutation.target);
      else if (mutation.type === "attributes") processAttribute(mutation.target, mutation.attributeName);
      else mutation.addedNodes.forEach((node) => translateTree(node));
    }
  }

  function startObserver() {
    if (observer || !compiledPhrases) return;
    observer = new MutationObserver(onMutations);
    observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  function stopObserver() {
    if (!observer) return;
    onMutations(observer.takeRecords());
    observer.disconnect();
    observer = null;
  }

  function setFonts(url) {
    let link = document.getElementById("themekit-fonts");
    if (!url) return link && link.remove();
    if (!link) {
      link = document.createElement("link");
      link.id = "themekit-fonts";
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    if (link.href !== url) link.href = url;
  }

  function readStored() {
    try {
      const fromQuery = new URLSearchParams(location.search).get("theme");
      if (fromQuery) return fromQuery;
      return localStorage.getItem(options.storageKey);
    } catch {
      return null;
    }
  }

  function store(id) {
    try {
      localStorage.setItem(options.storageKey, id);
    } catch {
      /* storage can be blocked; the theme still applies for this page view */
    }
  }

  // Static elements whose label spans several nodes (e.g. "Auto<br>Mine") get whole-HTML labels.
  const labelOriginals = new Map();

  function restoreLabels() {
    for (const [element, record] of labelOriginals) {
      element.innerHTML = record.html;
      if (record.skip === null) element.removeAttribute("data-theme-skip");
    }
    labelOriginals.clear();
  }

  function applyLabels(labels) {
    for (const [selector, html] of Object.entries(labels || {})) {
      document.querySelectorAll(selector).forEach((element) => {
        labelOriginals.set(element, { html: element.innerHTML, skip: element.getAttribute("data-theme-skip") });
        element.setAttribute("data-theme-skip", "");
        element.innerHTML = html;
      });
    }
  }

  function apply(id, { persist = true } = {}) {
    const theme = themes.get(id) || ORIGINAL;
    const previous = active;
    stopObserver();
    restoreLabels();
    if (document.body) restoreTree(document.body);
    active = theme;
    compiledPhrases = compilePhrases(theme.phrases);
    compiledColors = compileColors(theme.canvas && theme.canvas.colors);
    document.documentElement.dataset.theme = theme.id;
    setFonts(theme.fonts);
    document.title = theme.title || options.baseTitle;
    if (document.body && compiledPhrases) translateTree(document.body);
    if (document.body) applyLabels(theme.labels);
    startObserver();
    if (persist) store(theme.id);
    syncPicker();
    for (const listener of listeners) {
      try {
        listener(theme, previous);
      } catch (error) {
        console.error("Theme listener failed", error);
      }
    }
    return theme;
  }

  // ---- canvas remapping ----

  const PAINT_PROPS = ["fillStyle", "strokeStyle", "shadowColor"];

  function wrapGradient(gradient) {
    if (!gradient || gradient.__themekit) return gradient;
    const addColorStop = gradient.addColorStop;
    gradient.addColorStop = function (offset, color) {
      return addColorStop.call(this, offset, mapColor(color, compiledColors));
    };
    gradient.__themekit = true;
    return gradient;
  }

  function wrapContext(context) {
    if (!context || context.__themekit) return context;
    const proto = Object.getPrototypeOf(context);
    for (const prop of PAINT_PROPS) {
      const descriptor = Object.getOwnPropertyDescriptor(proto, prop);
      if (!descriptor) continue;
      Object.defineProperty(context, prop, {
        configurable: true,
        get() {
          return descriptor.get.call(this);
        },
        set(value) {
          descriptor.set.call(this, compiledColors ? mapColor(value, compiledColors) : value);
        },
      });
    }
    const fontDescriptor = Object.getOwnPropertyDescriptor(proto, "font");
    if (fontDescriptor) {
      Object.defineProperty(context, "font", {
        configurable: true,
        get() {
          return fontDescriptor.get.call(this);
        },
        set(value) {
          const fonts = active.canvas && active.canvas.fonts;
          fontDescriptor.set.call(this, fonts ? mapFont(value, fonts) : value);
        },
      });
    }
    for (const method of ["fillText", "strokeText", "measureText"]) {
      const original = context[method];
      context[method] = function (text, ...rest) {
        return original.call(this, compiledPhrases ? translate(String(text), compiledPhrases) : text, ...rest);
      };
    }
    for (const method of ["createLinearGradient", "createRadialGradient", "createConicGradient"]) {
      const original = context[method];
      if (typeof original !== "function") continue;
      context[method] = function (...args) {
        return wrapGradient(original.apply(this, args));
      };
    }
    context.__themekit = true;
    return context;
  }

  if (typeof HTMLCanvasElement !== "undefined") {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      const context = getContext.call(this, type, ...rest);
      return type === "2d" ? wrapContext(context) : context;
    };
  }

  // ---- theme picker ----

  let picker = null;

  function buildPicker() {
    if (picker || !document.body) return;
    picker = document.createElement("div");
    picker.className = "themekit-picker";
    picker.setAttribute("data-theme-skip", "");
    picker.innerHTML = `
      <style>
        .themekit-picker{position:fixed;left:10px;bottom:10px;z-index:2147483000;display:flex;gap:4px;align-items:center;
          font:600 12px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;color:#f5f5f5;background:rgba(20,20,24,.86);
          border:1px solid rgba(255,255,255,.22);border-radius:999px;padding:4px 6px;box-shadow:0 6px 20px rgba(0,0,0,.35);
          backdrop-filter:blur(6px);letter-spacing:0;text-transform:none}
        .themekit-picker *{font:inherit;color:inherit;letter-spacing:0;text-transform:none}
        .themekit-picker button{background:transparent;border:0;border-radius:999px;cursor:pointer;padding:3px 7px;min-width:0;min-height:0;box-shadow:none}
        .themekit-picker button:hover{background:rgba(255,255,255,.14)}
        .themekit-picker select{background:#26262c;border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:3px 8px;max-width:58vw}
        .themekit-picker.is-collapsed select,.themekit-picker.is-collapsed .themekit-step{display:none}
      </style>
      <button type="button" class="themekit-toggle" title="Theme picker" aria-label="Theme picker">🎨</button>
      <button type="button" class="themekit-step" data-step="-1" aria-label="Previous theme">‹</button>
      <select aria-label="Theme"></select>
      <button type="button" class="themekit-step" data-step="1" aria-label="Next theme">›</button>`;
    document.body.appendChild(picker);
    const select = picker.querySelector("select");
    select.addEventListener("change", () => apply(select.value));
    picker.querySelector(".themekit-toggle").addEventListener("click", () => picker.classList.toggle("is-collapsed"));
    picker.querySelectorAll(".themekit-step").forEach((button) =>
      button.addEventListener("click", () => step(Number(button.dataset.step))),
    );
    // Keep game keyboard handlers from reacting to picker keys.
    picker.addEventListener("keydown", (event) => event.stopPropagation());
    syncPicker();
  }

  function syncPicker() {
    if (!picker) return;
    const select = picker.querySelector("select");
    const ids = [...themes.keys()];
    if (select.options.length !== ids.length) {
      select.textContent = "";
      for (const theme of themes.values()) {
        const option = document.createElement("option");
        option.value = theme.id;
        option.textContent = theme.id === ORIGINAL.id ? theme.name : `${theme.name} · ${theme.author}`;
        select.appendChild(option);
      }
    }
    select.value = active.id;
  }

  function step(delta) {
    const ids = [...themes.keys()];
    const index = (ids.indexOf(active.id) + delta + ids.length) % ids.length;
    apply(ids[index]);
  }

  function register(theme) {
    const errors = validateTheme(theme);
    if (errors.length) {
      console.error(`Theme "${theme && theme.id}" is invalid:`, errors);
      return false;
    }
    themes.set(theme.id, theme);
    syncPicker();
    return true;
  }

  function start(config = {}) {
    options = { ...options, ...config, baseTitle: config.baseTitle || document.title };
    const boot = () => {
      buildPicker();
      apply(readStored() || ORIGINAL.id, { persist: false });
    };
    if (document.body) boot();
    else document.addEventListener("DOMContentLoaded", boot, { once: true });
  }

  return {
    ...core,
    register,
    start,
    apply,
    step,
    list: () => [...themes.values()],
    active: () => active,
    onChange(listener) {
      listeners.push(listener);
    },
    // Translate one string with the active theme (for code that builds text off-DOM).
    text: (value) => translate(value, compiledPhrases),
    // Map one colour with the active theme's canvas palette.
    color: (value) => mapColor(value, compiledColors),
    // Read a theme-specific canvas option, such as scanlines or an overlay painter.
    canvasOption: (name, fallback) => (active.canvas && name in active.canvas ? active.canvas[name] : fallback),
  };
});
