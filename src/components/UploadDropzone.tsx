"use client";

import { ImageUp, Loader2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const LOADING_LINES = [
  "Squinting at your linework…",
  "Counting stick limbs (should be 4)…",
  "Checking if that's a sword or a baguette…",
  "Negotiating stats with the judges…",
  "Inventing a special move…",
  "Writing some light trash talk…",
];

const MAX_SIDE = 1600;

// Phone photos are huge; shrink in the browser so upload + vision stay fast.
async function downscale(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that image"))), "image/jpeg", 0.88),
  );
}

export function UploadDropzone({ returnRoom }: { returnRoom?: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState(0);
  const [error, setError] = useState<string | null>(null);

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
  }

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setLine(0);
    try {
      const body = new FormData();
      body.append("image", await downscale(file), "drawing.jpg");
      const res = await fetch("/api/characters", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went sideways.");
      router.push(returnRoom ? `/play/${returnRoom}?fighter=${data.id}` : `/character/${data.id}?new=1`);
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
          <img src={preview} alt="Your drawing" className={`max-h-[60vh] w-full object-contain ${busy ? "opacity-40" : ""}`} />
          {busy && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Loader2 className="size-8 animate-spin text-hit" />
              <p key={line} className="pop-in font-display text-lg font-extrabold">
                {LOADING_LINES[line]}
              </p>
            </div>
          )}
          {!busy && (
            <button
              onClick={() => {
                setFile(null);
                setPreview(null);
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

      <div className="flex">
        <button
          onClick={submit}
          disabled={!file || busy}
          className="w-full rounded-xl bg-hit px-6 py-3 font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Analyzing…" : "Bring it to life"}
        </button>
      </div>

      {error && <p className="rounded-xl bg-hit/10 px-4 py-3 text-sm text-hit">{error}</p>}
    </div>
  );
}
