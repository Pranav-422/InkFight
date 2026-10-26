// Draws a normal (non-arena) fight with the Renderer of a checkout and saves frames at fixed ticks, to compare with another checkout's:
//   node scripts/shots-7b/compare-normal.mjs <repo root> <out dir>      (run it once per checkout, e.g. main's worktree and this branch)
//   for f in <dir A>/*.png; do cmp -s $f <dir B>/$(basename $f) && echo identical || echo DIFFERENT; done
// Playwright comes from PLAYWRIGHT_DIR (default /opt/node-tools), esbuild from the checkout's own node_modules.
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const [root, out] = process.argv.slice(2);
const { chromium } = createRequire(path.join(process.env.PLAYWRIGHT_DIR ?? "/opt/node-tools", "x.js"))("playwright");
const esbuild = createRequire(path.join(root, "x.js"))("esbuild");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "normal-cmp-"));
const entry = path.join(tmp, "entry.ts");
fs.writeFileSync(entry, fs.readFileSync(path.join(here, "normal-entry.ts.tmpl"), "utf8").replaceAll("__ROOT__", root));
const bundle = path.join(tmp, "bundle.js");
await esbuild.build({ entryPoints: [entry], bundle: true, outfile: bundle, format: "iife", platform: "browser", logLevel: "error", define: { "process.env.NODE_ENV": '"development"' }, absWorkingDir: root });
const page = path.join(tmp, "page.html");
fs.writeFileSync(page, `<!doctype html><meta charset=utf-8><body style="margin:0;background:#222"><canvas id=c style="width:960px;display:block"></canvas><script src="${bundle}"></script>`);
const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
pg.on("pageerror", (e) => console.log("pageerror", e.message));
await pg.goto("file://" + page);
const shots = await pg.evaluate((t) => window.capture(t), [60, 150, 300, 600, 900, 1500]);
fs.mkdirSync(out, { recursive: true });
for (const [n, u] of Object.entries(shots)) fs.writeFileSync(path.join(out, n + ".png"), Buffer.from(u.split(",")[1], "base64"));
console.log("wrote", Object.keys(shots).join(" "));
await b.close();
fs.rmSync(tmp, { recursive: true, force: true });
