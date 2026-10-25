import { ImageResponse } from "next/og";
import { BOSSES } from "@/game/dungeon";

// A dungeon boss "drawn on paper": a stick figure in the boss's ink with its own head mark, read by the
// same sprite pipeline as a scanned drawing (head crop + ink colour). The item is drawn by the game from
// the boss's data, never here (a filled shape near the hand fools the joint finder).

// Light tints don't read as ink on paper (Whiteout's correction-fluid white): darken them toward ink.
function inkOf(tint: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(tint.slice(i, i + 2), 16));
  if (0.299 * r + 0.587 * g + 0.114 * b <= 170) return tint;
  const mix = (c: number) => Math.round(c * 0.45 + 23 * 0.55).toString(16).padStart(2, "0");
  return `#${mix(r)}${mix(g)}${mix(b)}`;
}

// A mark above the head per boss, so ten stickmen don't look alike. Head centre (200, 120), radius 42.
function mark(floor: number, ink: string) {
  const s = { stroke: ink, strokeWidth: 10, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  switch (floor) {
    case 2: // flames
      return <path {...s} d="M168 88 L176 58 L188 82 L200 50 L212 82 L224 58 L232 88" />;
    case 3: // a lightning bolt
      return <path {...s} d="M214 40 L196 70 L214 70 L194 96" />;
    case 4: // a hood
      return <path {...s} d="M150 140 Q150 62 200 62 Q250 62 250 140" />;
    case 5: // a small crown
      return <path {...s} d="M176 84 L176 62 L190 74 L200 56 L210 74 L224 62 L224 84" />;
    case 6: // sun rays
      return <path {...s} d="M200 66 L200 44 M168 74 L156 56 M232 74 L244 56" />;
    case 7: // a helmet band
      return <path {...s} d="M156 108 L244 108" />;
    case 8: // a flat-top
      return <path {...s} d="M164 92 L164 72 L236 72 L236 92" />;
    case 9: // a halo
      return <ellipse cx="200" cy="54" rx="34" ry="10" stroke={ink} strokeWidth="8" fill="none" />;
    case 10: // a tall crown
      return <path {...s} d="M168 84 L168 48 L184 66 L200 36 L216 66 L232 48 L232 84 Z" />;
    default:
      return null;
  }
}

export async function GET(_req: Request, ctx: RouteContext<"/boss-art/[floor]">) {
  const floor = Number((await ctx.params).floor);
  const boss = BOSSES[floor - 1];
  if (!boss) return new Response("No such floor", { status: 404 });
  const ink = inkOf(boss.tint);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#ffffff" }}>
        <svg width="400" height="600" viewBox="0 0 400 600">
          <g stroke={ink} strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <path d="M200 162 L200 340 M200 200 L150 250 L128 304 M200 200 L250 250 L272 304 M200 340 L162 430 L150 524 M200 340 L238 430 L250 524" />
            <circle cx="200" cy="120" r="42" fill="#ffffff" />
            <path d="M184 132 Q200 144 216 132" strokeWidth="7" />
          </g>
          {mark(floor, ink)}
        </svg>
      </div>
    ),
    { width: 400, height: 600, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
