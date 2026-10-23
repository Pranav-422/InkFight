// Runs docs/gemini-research-prompt.md through Gemini (with Google Search grounding) and
// saves each answer to docs/research/<task>.json. Re-running skips files that exist.
//   npx tsx scripts/research.ts            all tasks
//   npx tsx scripts/research.ts stats      one task (stats | martial-arts | anime-NN)
// Needs GEMINI_API_KEY (read from .env / .env.local).

import { loadEnvConfig } from "@next/env";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

loadEnvConfig(process.cwd(), true, { info() {}, error: console.error });
const KEY = process.env.GEMINI_API_KEY;
if (!KEY) throw new Error("GEMINI_API_KEY is not set");

// Pro first when the key's plan allows it; free keys get flash. Each model is tried with
// Google Search grounding, then without (grounding has its own, smaller quota).
const MODELS = ["gemini-3.1-pro-preview", "gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3-flash-preview"];
const OUT = "docs/research";

// Three titles per call keeps each answer inside the output limit.
const ANIME: string[][] = [
  ["Dragon Ball (Z, Super)", "Naruto (incl. Shippuden)", "One Piece"],
  ["Bleach", "Jujutsu Kaisen", "Demon Slayer"],
  ["My Hero Academia", "Hunter x Hunter", "Fullmetal Alchemist: Brotherhood"],
  ["One Punch Man", "Mob Psycho 100", "Attack on Titan"],
  ["Yu Yu Hakusho", "Fist of the North Star", "JoJo's Bizarre Adventure"],
  ["Baki", "Kengan Ashura", "Lookism"],
  ["Hajime no Ippo", "The God of High School", "Tower of God"],
  ["Chainsaw Man", "Black Clover", "Fairy Tail"],
  ["Rurouni Kenshin", "Inuyasha", "Saint Seiya"],
  ["Boruto", "Tokyo Ghoul", "Akame ga Kill"],
  ["Solo Leveling", "Kaiju No. 8", "Sakamoto Days"],
  ["Fire Force", "The Seven Deadly Sins", "Kill la Kill", "Gurren Lagann"],
];

const doc = readFileSync("docs/gemini-research-prompt.md", "utf8");
const section = (start: string) => {
  const i = doc.indexOf(start);
  if (i < 0) throw new Error(`missing section ${start}`);
  const j = doc.indexOf("\n## ", i + start.length);
  return doc.slice(i, j < 0 ? undefined : j).trim();
};
const context = section("## Context");

const tasks: [string, string][] = [
  ["stats", section("## Task: stats")],
  ["martial-arts", section("## Task: martial-arts")],
  ...ANIME.map((list, i): [string, string] => [`anime-${String(i + 1).padStart(2, "0")}`, `${section("## Task: anime-batch")}\n\nAnime for this batch: ${list.join("; ")}.`]),
];

async function ask(prompt: string): Promise<string> {
  let last = "";
  for (const model of MODELS) {
    for (const search of [true, false]) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": KEY! },
          // JSON mode can't be combined with search grounding, so the format is asked for in the prompt.
          body: JSON.stringify({
            system_instruction: { parts: [{ text: context }] },
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            ...(search ? { tools: [{ google_search: {} }] } : {}),
            generationConfig: { temperature: 0.4, maxOutputTokens: 65536 },
          }),
          signal: AbortSignal.timeout(600_000),
        });
        const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]; error?: { message?: string } };
        if (!res.ok) throw new Error(`${res.status} ${data.error?.message?.slice(0, 150)}`);
        const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
        if (!text) throw new Error(`empty (${data.candidates?.[0]?.finishReason})`);
        console.log(`  ${model}${search ? " +search" : ""}: ${text.length} chars, finish=${data.candidates?.[0]?.finishReason}`);
        return text;
      } catch (err) {
        last = `${model}${search ? " +search" : ""}: ${err instanceof Error ? err.message : err}`;
        console.log(`  failed ${last}`);
      }
    }
  }
  throw new Error(last);
}

// The answer should be one JSON object, maybe inside a code fence.
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(raw);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const only = process.argv[2];
  for (const [id, prompt] of tasks) {
    if (only && id !== only) continue;
    const file = `${OUT}/${id}.json`;
    if (existsSync(file)) {
      console.log(`${id}: already done`);
      continue;
    }
    console.log(`${id}: asking…`);
    const t0 = Date.now();
    try {
      const text = await ask(prompt);
      try {
        writeFileSync(file, JSON.stringify(extractJson(text), null, 1));
        console.log(`${id}: saved in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      } catch {
        writeFileSync(`${OUT}/${id}.raw.txt`, text); // keep it to repair by hand
        console.log(`${id}: answer wasn't valid JSON, raw text saved`);
      }
    } catch (err) {
      console.log(`${id}: gave up (${err instanceof Error ? err.message : err})`);
    }
  }
}
main();
