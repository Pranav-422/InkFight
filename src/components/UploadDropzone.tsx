"use client";

import { Camera, ImageUp, Loader2, RotateCcw, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SPECIAL_INFO, SPECIAL_KINDS, STYLE_INFO, STYLES, type SpecialKind, type Style } from "@/game/moves";
import { cleanDrawing, ITEMS, measureDrawing, type Item, type Measured } from "@/game/sprite";
import { classFromItems } from "@/lib/stats";
import { MovePreview, type Demo } from "./MovePreview";
import { useLeaveGuard } from "./useLeaveGuard";

const ITEM_LABEL: Record<Item, string> = {
  sword: "A sword / blade (Sword)",
  mace: "A mace / club / hammer (Mace)",
  book: "A book (Attacker)",
  staff: "A staff / wand (Attacker)",
  shield: "A shield (Tank)",
  bow: "A bow (Attacker)",
  nothing: "Nothing, bare fists (Fighter)",
};

const LOADING_LINES = [
  "Squinting at your linework…",
  "Counting stick limbs (should be 4)…",
  "Checking if that's a sword or a baguette…",
  "Negotiating stats with the judges…",
  "Inventing a special move…",
  "Writing some light trash talk…",
];

export function UploadDropzone({ returnRoom, returnTo }: { returnRoom?: string; returnTo?: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  useLeaveGuard(!!file && !busy, "Your new fighter isn't finished yet. Leave it incomplete?");
  const [line, setLine] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [facts, setFacts] = useState<Measured | null>(null);
  const [name, setName] = useState("");
  const [turn, setTurn] = useState(0); // degrees clockwise to stand a sideways photo up
  // Correction panel: explicit choices beat the AI. "" = let the AI decide.
  const [itemPicked, setItemPicked] = useState(false);
  const [style, setStyle] = useState<Style | "">("");
  const [special, setSpecial] = useState<SpecialKind | "">("");
  const [demo, setDemo] = useState<Demo>({ kind: "style", n: 0 });
  const measureId = useRef(0);
  const [measuring, setMeasuring] = useState(false);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setLine((l) => (l + 1) % LOADING_LINES.length), 1800);
    return () => clearInterval(t);
  }, [busy]);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  function choose(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("That's not an image. Nice try though.");
      return;
    }
    setError(null);
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setTurn(0);
    setItemPicked(false);
    measure(f, 0);
  }

  // Measure the drawing right away so the user can check the item guess before upload.
  // Only the latest request may land: a slow earlier photo/rotation must not overwrite it.
  function measure(f: File, deg: number) {
    const id = ++measureId.current;
    setFacts(null);
    setMeasuring(true);
    measureDrawing(f, deg)
      .then((m) => id === measureId.current && setFacts(m))
      .catch((err) => console.warn("[measure]", err))
      .finally(() => id === measureId.current && setMeasuring(false));
  }

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setLine(0);
    try {
      const body = new FormData();
      // Only the cut-out figure is uploaded, already turned upright; the photo stays on the device.
      body.append("image", await cleanDrawing(file, turn), "drawing.png");
      if (name.trim()) body.append("name", name.trim());
      if (facts) body.append("features", JSON.stringify(facts));
      if (itemPicked && facts) body.append("pick_item", facts.item);
      if (style) body.append("pick_style", style);
      if (special) body.append("pick_special", special);
      const res = await fetch("/api/characters", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went sideways.");
      router.push(
        returnRoom ? `/play/${returnRoom}?fighter=${data.id}` : returnTo ? `${returnTo}?fighter=${data.id}` : `/character/${data.id}?new=1`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went sideways.");
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      {!preview ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            choose(e.dataTransfer.files[0]);
          }}
          className={`flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed bg-card transition ${
            dragging ? "border-hit bg-hit/5" : "border-ink/20 hover:border-ink/40"
          }`}
        >
          <ImageUp className="size-10 text-ink/60" strokeWidth={1.5} />
          <span className="font-display text-xl font-extrabold">Drop your drawing here</span>
          <span className="text-sm text-muted">or tap to pick a photo · JPG, PNG, WEBP</span>
        </button>
      ) : (
        <div className="relative overflow-hidden rounded-2xl bg-white ring-1 ring-line">
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
          <img
            src={preview}
            alt="Your drawing"
            className={`max-h-[60vh] w-full object-contain transition-transform ${busy ? "opacity-40" : ""}`}
            style={turn ? { transform: `rotate(${turn}deg)${turn % 180 ? " scale(0.75)" : ""}` } : undefined}
          />
          {busy && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Loader2 className="size-8 animate-spin text-hit" />
              <p key={line} className="pop-in font-display text-lg font-extrabold">
                {LOADING_LINES[line]}
              </p>
            </div>
          )}
          {!busy && file && (
            <button
              onClick={() => {
                const next = (turn + 90) % 360;
                setTurn(next);
                measure(file, next);
              }}
              className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1.5 text-sm ring-1 ring-line hover:bg-white"
              title="Drawn sideways? Turn it so the head is at the top"
            >
              <RotateCw className="size-3.5" /> Turn
            </button>
          )}
          {!busy && (
            <button
              onClick={() => {
                setFile(null);
                setPreview(null);
                setFacts(null);
              }}
              className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1.5 text-sm ring-1 ring-line hover:bg-white"
            >
              <RotateCcw className="size-3.5" /> Swap
            </button>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => choose(e.target.files?.[0])}
      />
      {/* Opens the back camera directly on phones; desktops fall back to a file pick. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => choose(e.target.files?.[0])}
      />
      {!preview && (
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-ink px-6 py-3 font-semibold text-white hover:bg-ink/85"
        >
          <Camera className="size-4" /> Take a photo
        </button>
      )}

      {preview && !busy && (
        <label className="grid gap-1 text-sm font-semibold">
          Name your fighter <span className="font-normal text-muted">(optional: leave empty and the AI names it)</span>
          <input
            value={name}
            maxLength={32}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Professor Scribbles"
            className="rounded-xl bg-card px-4 py-2.5 font-normal ring-1 ring-line outline-none focus:ring-2 focus:ring-ink"
          />
        </label>
      )}

      {preview && !busy && (
        <label className="flex flex-wrap items-center gap-2 rounded-xl bg-card px-4 py-3 text-sm ring-1 ring-line">
          <span className="font-semibold">Holding:</span>
          {facts ? (
            <select
              value={facts.item}
              onChange={(e) => {
                setFacts({ ...facts, item: e.target.value as Item });
                setItemPicked(true);
              }}
              className="min-w-0 flex-1 rounded-lg bg-paper px-2 py-1.5 ring-1 ring-line"
            >
              {ITEMS.map((i) => (
                <option key={i} value={i}>
                  {ITEM_LABEL[i]}
                </option>
              ))}
            </select>
          ) : measuring ? (
            <span className="flex items-center gap-1.5 text-muted">
              <Loader2 className="size-3.5 animate-spin" /> reading your drawing…
            </span>
          ) : (
            <span className="text-muted">couldn&apos;t read it, we&apos;ll guess</span>
          )}
          <span className="w-full text-xs text-muted">Our best guess from the ink. Wrong? Fix it: the item decides the class.</span>
        </label>
      )}

      {preview && !busy && (
        <details className="rounded-xl bg-card px-4 py-3 text-sm ring-1 ring-line">
          <summary className="cursor-pointer font-semibold">Correct the AI (optional): fighting style and special move</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Fighting style</span>
              <select
                value={style}
                onChange={(e) => {
                  setStyle(e.target.value as Style | "");
                  if (e.target.value) setDemo((d) => ({ kind: "style", n: d.n + 1 }));
                }}
                className="rounded-lg bg-paper px-2 py-1.5 ring-1 ring-line"
              >
                <option value="">Auto: AI reads the drawing</option>
                {STYLES.map((s) => (
                  <option key={s} value={s}>
                    {s}: {STYLE_INFO[s].blurb}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Special move</span>
              <select
                value={special}
                onChange={(e) => {
                  setSpecial(e.target.value as SpecialKind | "");
                  if (e.target.value) setDemo((d) => ({ kind: "special", n: d.n + 1 }));
                }}
                className="rounded-lg bg-paper px-2 py-1.5 ring-1 ring-line"
              >
                <option value="">Auto: AI picks and names it</option>
                {SPECIAL_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}: {SPECIAL_INFO[k].looks}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {demo.n > 0 && preview && (
            <MovePreview
              className="mt-3"
              fighter={{ imageUrl: preview, rotation: turn, class: classFromItems(facts && facts.item !== "nothing" ? [facts.item] : []), style: style || null, specialKind: special || null }}
              demo={demo}
            />
          )}
        </details>
      )}

      <div className="flex">
        <button
          onClick={submit}
          disabled={!file || busy || measuring}
          className="w-full rounded-xl bg-hit px-6 py-3 font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Analyzing…" : "Bring it to life"}
        </button>
      </div>

      {error && <p className="rounded-xl bg-hit/10 px-4 py-3 text-sm text-hit">{error}</p>}
    </div>
  );
}
