"use client";

// Build a fighter from category panels instead of a photo. The choices are drawn as a
// clean stick figure on a white "page", and that image goes through the normal pipeline
// (head cut-out, measuring, fair stats), so it fights and looks like any scanned drawing.

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { FighterAvatar } from "@/components/FighterAvatar";
import { MovePreview, type Demo } from "@/components/MovePreview";
import { useLeaveGuard } from "@/components/useLeaveGuard";
import { CLASS_SKILL, CLASS_ULT, SIDE_SKILLS, SKILL_INFO, SPECIAL_INFO, SPECIAL_KINDS, STYLE_INFO, STYLES, type SideSkill, type SpecialKind, type Style } from "@/game/moves";
import type { BoneName } from "@/game/skeleton";
import { ITEMS, measureDrawing, type Item } from "@/game/sprite";
import { drawStick, HEAD_R, solveStick } from "@/game/stickman";
import { classFromItems, ELEMENTS, suggestElement, type Element } from "@/lib/stats";

const HEADS = ["round", "spiky", "cap", "helmet", "ninja", "square"] as const;
type Head = (typeof HEADS)[number];
const INKS: [string, string][] = [
  ["Ink black", "#17171a"],
  ["Ballpoint blue", "#1f3fb5"],
  ["Marker red", "#c0281b"],
  ["Forest green", "#1d7a3a"],
  ["Royal purple", "#5b2a9e"],
  ["Burnt orange", "#c25a0e"],
];
const INK_COLOR_NAMES: Record<string, string> = {
  "#17171a": "black",
  "#1f3fb5": "blue",
  "#c0281b": "red",
  "#1d7a3a": "green",
  "#5b2a9e": "purple",
  "#c25a0e": "red",
};
const ITEM_NAME: Record<Item, string> = { sword: "Sword (Sword)", mace: "Mace (Mace)", book: "Spellbook (Attacker)", staff: "Staff (Attacker)", shield: "Shield (Tank)", bow: "Bow (Attacker)", nothing: "Bare fists (Fighter)" };

type Build = { head: Head; ink: string; item: Item; style: Style; special: SpecialKind; ult: SpecialKind | ""; skill: SideSkill | ""; element: Element; name: string }; // skill, ult "": the class's

// Draw the build as a stick-figure "drawing": 720 x 800, white paper, ink lines. Wide
// enough that a sword held out front stays on the page (ink touching the edge is ignored).
function render(b: Build): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 720;
  c.height = 800;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  g.translate(300, 740);
  g.scale(3.6, 3.6);
  const pose = solveStick({} as Record<BoneName, number>);
  drawStick(g, pose, { ink: b.ink, head: null, prop: null, cls: classFromItems(b.item === "nothing" ? [] : [b.item]), item: "nothing", accent: b.ink, width: 6, plain: true }); // the item is drawn as a vector from b.item, never baked into the drawing (a filled mace head fooled the joint finder)
  drawHead(g, b.head, pose.joints.head, b.ink);
  return c;
}

function drawHead(g: CanvasRenderingContext2D, head: Head, at: { x: number; y: number }, ink: string) {
  const r = HEAD_R;
  g.save();
  g.translate(at.x, at.y);
  g.strokeStyle = g.fillStyle = ink;
  g.lineWidth = 3;
  g.lineCap = g.lineJoin = "round";
  if (head === "square") {
    g.clearRect(-r - 4, -r - 4, 2 * r + 8, 2 * r + 8);
    g.fillStyle = "#fff";
    g.fillRect(-r, -r, 2 * r, 2 * r);
    g.strokeRect(-r, -r, 2 * r, 2 * r);
    g.fillStyle = ink;
  }
  // Face: eyes and a grin.
  g.beginPath();
  g.arc(-7, -3, 2.2, 0, Math.PI * 2);
  g.arc(7, -3, 2.2, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(0, 4, 7, 0.2, Math.PI - 0.2);
  g.stroke();
  g.beginPath();
  if (head === "spiky") {
    for (let i = -3; i <= 3; i++) {
      const a = -Math.PI / 2 + i * 0.35;
      g.moveTo(Math.cos(a - 0.15) * r, Math.sin(a - 0.15) * r);
      g.lineTo(Math.cos(a) * (r + 12), Math.sin(a) * (r + 12));
      g.lineTo(Math.cos(a + 0.15) * r, Math.sin(a + 0.15) * r);
    }
  } else if (head === "cap") {
    g.moveTo(-r, -6);
    g.quadraticCurveTo(0, -r - 14, r, -6);
    g.lineTo(r + 14, -4);
  } else if (head === "helmet") {
    g.arc(0, 0, r + 3, Math.PI, 0);
    g.moveTo(-r - 3, 0);
    g.lineTo(r + 3, 0);
    g.moveTo(0, -r - 3);
    g.lineTo(0, -r - 12);
  } else if (head === "ninja") {
    g.moveTo(-r, -9);
    g.lineTo(r, -9);
    g.moveTo(-r, -13);
    g.lineTo(r, -13);
    g.moveTo(-r, -11);
    g.lineTo(-r - 14, -2);
    g.moveTo(-r, -11);
    g.lineTo(-r - 10, 4);
  }
  g.stroke();
  g.restore();
}

function Choice<T extends string>({ label, value, options, onChange, show }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void; show: (v: T) => string }) {
  return (
    <fieldset className="rounded-2xl bg-card p-4 ring-1 ring-line">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-muted">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={`rounded-lg px-3 py-1.5 text-sm ring-1 ${value === o ? "bg-ink font-semibold text-white ring-ink" : "ring-line hover:ring-ink"}`}
          >
            {show(o)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function BuildClient() {
  const router = useRouter();
  const [b, setB] = useState<Build>({ head: "round", ink: INKS[0][1], item: "sword", style: "Karate", special: "slash", ult: "", skill: "", element: "NONE", name: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [demo, setDemo] = useState<Demo>({ kind: "style", n: 0 });
  const set = <K extends keyof Build>(k: K) => (v: Build[K]) => setB((x) => ({ ...x, [k]: v }));
  // Picking a move plays it in the training room (again on every click, even the same pick).
  const pick = <K extends "item" | "style" | "special" | "ult" | "skill">(k: K) => (v: Build[K]) => {
    set(k)(v);
    setDemo((d) => ({ kind: k, n: d.n + 1 }));
  };
  const cls = useMemo(() => classFromItems(b.item === "nothing" ? [] : [b.item]), [b.item]);
  const autoElement = suggestElement([INK_COLOR_NAMES[b.ink] ?? "black"]);
  useLeaveGuard(!busy, "Your fighter isn't saved yet. Leave without building it?");

  // Redraw the "drawing" when the look changes; the avatar extracts it like a scan.
  useEffect(() => {
    const t = setTimeout(() => setPreview(render(b).toDataURL("image/png")), 0);
    return () => clearTimeout(t);
  }, [b]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const canvas = render(b);
      const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((x) => (x ? res(x) : rej(new Error("Couldn't draw it"))), "image/png"));
      const form = new FormData();
      form.append("image", blob, "built.png");
      form.append("features", JSON.stringify({ ...(await measureDrawing(blob)), item: b.item }));
      form.append("builder", "1");
      form.append("pick_item", b.item);
      form.append("pick_style", b.style);
      form.append("pick_special", b.special);
      if (b.ult) form.append("pick_ult", b.ult);
      if (b.skill) form.append("pick_skill", b.skill);
      form.append("pick_element", b.element);
      if (b.name.trim()) form.append("name", b.name.trim());
      const res = await fetch("/api/characters", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went sideways.");
      router.push(`/character/${data.id}?new=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went sideways.");
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_minmax(0,340px)] md:items-start">
      <div className="grid gap-4">
        <div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight">Build a fighter</h1>
          <p className="mt-1 text-sm text-muted">No drawing needed: pick the parts. Stats are split fairly from the budget everyone shares.</p>
        </div>
        <Choice label="Head" value={b.head} options={HEADS} onChange={set("head")} show={(h) => h[0].toUpperCase() + h.slice(1)} />
        <fieldset className="rounded-2xl bg-card p-4 ring-1 ring-line">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-muted">Ink colour</legend>
          <div className="flex flex-wrap gap-2">
            {INKS.map(([label, hex]) => (
              <button
                key={hex}
                type="button"
                onClick={() => set("ink")(hex)}
                title={label}
                aria-label={label}
                className={`size-9 rounded-full ring-2 ring-offset-2 ${b.ink === hex ? "ring-ink" : "ring-transparent"}`}
                style={{ background: hex }}
              />
            ))}
          </div>
        </fieldset>
        <Choice label="Weapon / item (sets the class)" value={b.item} options={ITEMS} onChange={pick("item")} show={(i) => ITEM_NAME[i]} />
        <Choice label="Fighting style" value={b.style} options={STYLES} onChange={pick("style")} show={(s) => s} />
        <p className="-mt-2 px-1 text-xs text-muted">{STYLE_INFO[b.style].blurb}</p>
        <Choice label="Special move (L, half a meter)" value={b.special} options={SPECIAL_KINDS} onChange={pick("special")} show={(k) => k} />
        <p className="-mt-2 px-1 text-xs text-muted">{SPECIAL_INFO[b.special].looks}</p>
        <Choice label="Ultimate (S + L, full meter)" value={b.ult} options={["", ...SPECIAL_KINDS] as const} onChange={pick("ult")} show={(k) => (k ? k : `Class: ${CLASS_ULT[cls]}`)} />
        <p className="-mt-2 px-1 text-xs text-muted">Grabs the opponent and pounds them before launching them. {SPECIAL_INFO[b.ult || CLASS_ULT[cls]].looks}</p>
        <Choice label="Side skill (U)" value={b.skill} options={["", ...SIDE_SKILLS] as const} onChange={pick("skill")} show={(k) => (k ? SKILL_INFO[k].name : `Class: ${SKILL_INFO[CLASS_SKILL[cls]].name}`)} />
        <p className="-mt-2 px-1 text-xs text-muted">{SKILL_INFO[b.skill || CLASS_SKILL[cls]].how}</p>
        <Choice label="Element" value={b.element} options={ELEMENTS} onChange={set("element")} show={(e) => e} />
        <p className="-mt-2 px-1 text-xs text-muted">auto from ink: {autoElement}</p>
        <label className="grid gap-1 text-sm font-semibold">
          Name <span className="font-normal text-muted">(optional)</span>
          <input
            value={b.name}
            maxLength={32}
            onChange={(e) => set("name")(e.target.value)}
            placeholder="e.g. Sir Pencilot"
            className="rounded-xl bg-card px-4 py-2.5 font-normal ring-1 ring-line outline-none focus:ring-2 focus:ring-ink"
          />
        </label>
      </div>

      <aside className="sticky top-20 grid gap-3">
        <div className="aspect-square rounded-2xl bg-white ring-1 ring-line">
          {preview && <FighterAvatar key={preview} fighter={{ imageUrl: preview, class: cls, item: b.item, style: b.style }} />}
        </div>
        {preview && <MovePreview fighter={{ imageUrl: preview, class: cls, item: b.item, style: b.style, specialKind: b.special, ultKind: b.ult || null, sideSkill: b.skill || null }} demo={demo} />}
        <p className="-mt-1 text-center text-xs text-muted">Pick a style, special or ultimate to try it on the dummy.</p>
        <p className="text-center text-sm">
          <span className="font-semibold">{cls}</span> · {b.style} · {b.special} / {b.ult || CLASS_ULT[cls]} · {b.element}
        </p>
        <button onClick={create} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-hit px-6 py-3 font-semibold text-white hover:brightness-110 disabled:opacity-50">
          {busy && <Loader2 className="size-4 animate-spin" />}
          {busy ? "Building…" : "Build it"}
        </button>
        {error && <p className="rounded-xl bg-hit/10 px-4 py-3 text-sm text-hit">{error}</p>}
      </aside>
    </div>
  );
}
