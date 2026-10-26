import { ImageResponse } from "next/og";
import { bossLook } from "@/game/bossLook";

// A dungeon boss "drawn on paper": a stick figure in the boss's ink with its own head, drawn from the same layers as in the game (src/game/bossLook.ts: hair,
// hats, scars, blindfolds). The game builds its fighter from that data directly (src/game/bossSprite.ts); this image is for the share cards, and for anything
// that still reads a boss like a scanned drawing. The outfit and the held item are the game's business, never drawn here (a filled shape near the hand would
// fool the joint finder of the scan pipeline).

// The head box is 300 x 300 with the face circle at (150, 150), radius 72; the figure's head is a circle at (200, 120) with radius 42.
const FACE = 42 / 72;

export async function GET(_req: Request, ctx: RouteContext<"/boss-art/[floor]">) {
  const floor = Number((await ctx.params).floor);
  const look = bossLook(floor);
  if (!look) return new Response("No such floor", { status: 404 });
  const ink = look.palette.ink;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#ffffff" }}>
        <svg width="400" height="600" viewBox="0 0 400 600">
          <g stroke={ink} strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <path d="M200 162 L200 340 M200 200 L150 250 L128 304 M200 200 L250 250 L272 304 M200 340 L162 430 L150 524 M200 340 L238 430 L250 524" />
          </g>
          <g transform={`translate(${200 - 150 * FACE} ${120 - 150 * FACE}) scale(${FACE})`} strokeLinecap="round" strokeLinejoin="round">
            {look.head.map((l, i) => (
              <path key={i} d={l.d} fill={l.fill ?? "none"} stroke={l.stroke ?? "none"} strokeWidth={l.sw ?? 8} />
            ))}
          </g>
        </svg>
      </div>
    ),
    { width: 400, height: 600, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
