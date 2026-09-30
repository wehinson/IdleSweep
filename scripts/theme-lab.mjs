// Theme lab: one local server for both redesign branches.
//   /        index with every theme of both games
//   /sweep/  IdleSweep (Sweeper Inc.) from the IdleSweep redesign worktree
//   /snake/  IdleSnake (Snake Forever) from the IdleSnake redesign worktree
// Each game also has the in-page theme picker (bottom left) and accepts ?theme=<id>.
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const codeRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const games = {
  sweep: { title: "Sweeper Inc.", root: resolve(process.env.SWEEP_ROOT || join(codeRoot, "IdleSweep-redesign")) },
  snake: { title: "Snake Forever", root: resolve(process.env.SNAKE_ROOT || join(codeRoot, "IdleSnake-redesign")) },
};
const port = Number(process.env.PORT) || 8090;
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function readThemes(root) {
  const dir = join(root, "themes");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((id) => existsSync(join(dir, id, "theme.js")))
    .map((id) => {
      const source = readFileSync(join(dir, id, "theme.js"), "utf8");
      const name = /["']?name["']?\s*:\s*"([^"]+)"/.exec(source)?.[1] || id;
      const author = /["']?author["']?\s*:\s*"([^"]+)"/.exec(source)?.[1] || "";
      return { id, name, author };
    });
}

function escapeHtml(text) {
  return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

function indexPage() {
  const sections = Object.entries(games)
    .map(([key, game]) => {
      const themes = readThemes(game.root);
      const links = [{ id: "original", name: "Original", author: "Current game" }, ...themes]
        .map((t) => `<li><a href="/${key}/?theme=${t.id}">${escapeHtml(t.name)}</a><span>${escapeHtml(t.author)}</span></li>`)
        .join("");
      return `<section><h2>${escapeHtml(game.title)}</h2><p><code>${escapeHtml(game.root)}</code></p><ul>${links}</ul></section>`;
    })
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Theme Lab</title><style>
body{margin:0;padding:24px;font:16px/1.45 system-ui,"Segoe UI",sans-serif;background:#16161b;color:#eee}
h1{margin:0 0 4px}main{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));max-width:900px}
section{background:#222229;border:1px solid #3a3a46;border-radius:12px;padding:16px}h2{margin:0}p{margin:4px 0 10px;color:#9a9aa8;font-size:12px;overflow-wrap:anywhere}
ul{list-style:none;margin:0;padding:0;display:grid;gap:6px}li{display:flex;justify-content:space-between;gap:8px;padding:8px 10px;background:#2c2c35;border-radius:8px}
a{color:#8fd3ff;font-weight:600}span{color:#9a9aa8}
</style></head><body><h1>Theme Lab</h1><p>Pick a game and a theme. Inside a game, use the picker at the bottom left to switch themes without reloading.</p><main>${sections}</main></body></html>`;
}

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  if (pathname === "/" || pathname === "/index.html") {
    response.writeHead(200, { "Content-Type": types[".html"], "Cache-Control": "no-store" });
    response.end(indexPage());
    return;
  }
  const match = /^\/(sweep|snake)(\/.*)?$/.exec(pathname);
  if (!match) {
    response.writeHead(404).end("Not found");
    return;
  }
  if (!match[2]) {
    response.writeHead(302, { Location: `/${match[1]}/` }).end();
    return;
  }
  const root = games[match[1]].root;
  const relative = match[2] === "/" ? "index.html" : match[2].slice(1);
  const target = resolve(root, relative);
  if (!target.startsWith(root + sep) || !existsSync(target) || !statSync(target).isFile()) {
    response.writeHead(404).end("Not found");
    return;
  }
  response.writeHead(200, { "Content-Type": types[extname(target)] || "application/octet-stream", "Cache-Control": "no-store" });
  createReadStream(target).pipe(response);
}).listen(port, () => {
  console.log(`Theme Lab is running at http://localhost:${port}`);
});
