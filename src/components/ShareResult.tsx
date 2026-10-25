"use client";

import { Check, Share2 } from "lucide-react";
import { useState } from "react";

// "Share result": the Web Share API where the browser has it (phones), else the link is copied. A server page passes `url`; the
// result overlays pass `getUrl`, which runs on click, so a link that needs a lookup (the stored battle of an online fight) is only
// fetched when someone asks for it.
export function ShareResult({ title, text, url: fixed, getUrl, className = "" }: { title: string; text: string; url?: string; getUrl?: () => Promise<string> | string; className?: string }) {
  const [state, setState] = useState<"idle" | "busy" | "copied" | "failed">("idle");
  async function share() {
    setState("busy");
    try {
      const rel = fixed ?? (await getUrl?.()) ?? window.location.href;
      const url = new URL(rel, window.location.origin).toString();
      if (typeof navigator.share === "function") {
        try {
          await navigator.share({ title, text, url });
          setState("idle");
          return;
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return setState("idle"); // they closed the sheet
          // any other failure: fall through to copying
        }
      }
      await navigator.clipboard.writeText(url);
      setState("copied");
      setTimeout(() => setState("idle"), 2500);
    } catch {
      setState("failed");
      setTimeout(() => setState("idle"), 2500);
    }
  }
  return (
    <button
      type="button"
      onClick={share}
      disabled={state === "busy"}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold hover:bg-white/20 disabled:opacity-60 ${className}`}
    >
      {state === "copied" ? <Check className="size-4" /> : <Share2 className="size-4" />}
      {state === "copied" ? "Link copied" : state === "failed" ? "Couldn't share" : "Share result"}
    </button>
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The link to share for a finished fight: the stored battle's page if the host has reported it (it does so a moment after the
// match ends, so ask a few times), else a link that carries the fighters and the score (/share).
export async function resultUrl(aId: string, bId: string, wins: [number, number]): Promise<string> {
  for (let i = 0; i < 3; i++) {
    try {
      const r = (await (await fetch(`/api/battles/lookup?a=${encodeURIComponent(aId)}&b=${encodeURIComponent(bId)}`)).json()) as { id?: string | null };
      if (r.id) return `/battle/${r.id}`;
    } catch {}
    if (i < 2) await sleep(1200);
  }
  return cardUrl(aId, bId, wins);
}

// The link for a fight that is not stored (vs the computer): the card is built from the URL.
export const cardUrl = (aId: string, bId: string, wins: [number, number]) => `/share?${new URLSearchParams({ a: aId, b: bId, sa: String(wins[0]), sb: String(wins[1]) })}`;
