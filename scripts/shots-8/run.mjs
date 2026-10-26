// Playwright is not a dependency of the project: this needs the one that ships with the cloud sessions (PLAYWRIGHT_DIR, the folder
// that holds node_modules/playwright; default /opt/node-tools). esbuild comes with the project's tooling.
//   node scripts/shots-8/run.mjs <out dir> <specs.json | heads> [W H DPR]
// specs.json: [{ "name": "b1-idle", "floor": 1, "at": "idle" }, ...] (see Spec in entry.ts); W H DPR default to the desktop canvas (960 x 540, 1).
// OPTS='{"seed":7}' changes the particle seed.
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const req = createRequire(path.join(process.env.PLAYWRIGHT_DIR ?? "/opt/node-tools", "x.js"));
const { chromium } = req("playwright");
const esbuild = createRequire(path.join(here, "../../x.js"))("esbuild");
{
  const [out, specsFile, W = "960", H = "540", DPR = "1"] = process.argv.slice(2);
  const bundle = path.join(os.tmpdir(), "shots-8-bundle.js");
  await esbuild.build({ entryPoints: [path.join(here, "entry.ts")], bundle: true, outfile: bundle, format: "iife", platform: "browser", logLevel: "error", define: { "process.env.NODE_ENV": '"development"' } });
  const page = path.join(os.tmpdir(), "shots-8.html");
  const phone = Number(W) < 700;
  fs.writeFileSync(page, `<!doctype html><meta charset=utf-8><body style="margin:0;background:#222"><canvas id=c style="width:${phone ? "100vw" : "960px"};display:block"></canvas><script src="${bundle}"></script>`);
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: Number(W), height: Number(H) }, deviceScaleFactor: Number(DPR) });
  pg.on("console", (m) => console.log("page:", m.text()));
  pg.on("pageerror", (e) => console.log("pageerror", e.message));
  await pg.goto("file://" + page);
  fs.mkdirSync(out, { recursive: true });
  if (specsFile === "heads") {
    const url = await pg.evaluate(() => window.bossHeads());
    fs.writeFileSync(path.join(out, "heads.png"), Buffer.from(url.split(",")[1], "base64"));
    console.log("wrote heads.png");
  } else {
    const specs = JSON.parse(fs.readFileSync(specsFile, "utf8"));
    const opts = process.env.OPTS ? JSON.parse(process.env.OPTS) : {};
    const shots = await pg.evaluate(([s, o]) => window.captureBoss(s, o), [specs, opts]);
    for (const [name, url] of Object.entries(shots)) fs.writeFileSync(path.join(out, `${name}${phone ? "-phone" : ""}.png`), Buffer.from(url.split(",")[1], "base64"));
    console.log("wrote", Object.keys(shots).join(", "));
  }
  await b.close();
}
