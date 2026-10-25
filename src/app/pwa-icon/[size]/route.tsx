import { ImageResponse } from "next/og";

// App icon for the installable app (manifest, home screen, browser tab):
// a punching stickman on notebook paper. Drawn on request, cached for a year.
const SIZES = new Set([180, 192, 512]);

export async function GET(_req: Request, ctx: RouteContext<"/pwa-icon/[size]">) {
  const size = Number((await ctx.params).size);
  if (!SIZES.has(size)) return new Response("Unknown icon size", { status: 404 });
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#fff9ed" }}>
        <svg width={size} height={size} viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="44" fill="#e5482d" />
          <g stroke="#17171a" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <circle cx="42" cy="27" r="9" fill="#ffffff" />
            <path d="M42 36 L42 60 M42 44 L60 40 L76 40 M42 44 L30 52 L36 58 M42 60 L32 80 M42 60 L54 70 L56 80" />
          </g>
          <circle cx="78" cy="40" r="5" fill="#f2b705" />
        </svg>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=31536000, immutable" } },
  );
}
