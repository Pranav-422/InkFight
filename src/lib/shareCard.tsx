import "server-only";
import { readFile } from "fs/promises";
import { headers } from "next/headers";
import { ImageResponse } from "next/og";
import path from "path";
import { BOSSES } from "@/game/dungeon";
import { db } from "./db";

export { battleScore, parseScore } from "./shareScore";

// The 1080 x 1080 result card: both fighters (their cut-out drawings), names, score, the site and the link. One drawing
// function serves the stored-battle card (/battle/[id]/opengraph-image) and the query-built card for CPU fights (/card).

export const CARD_SIZE = { width: 1080, height: 1080 };
export type CardFighter = { name: string; imageUrl: string };

// The public origin of this request (for links in the card and its page).
export async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3001";
  return `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
}

// A fighter named in a share link: a stored design (not hidden by an admin), or a dungeon boss ("boss-3").
export async function resolveFighter(id: string): Promise<CardFighter | null> {
  if (!/^[A-Za-z0-9-]{3,40}$/.test(id)) return null;
  const boss = /^boss-(\d{1,2})$/.exec(id);
  if (boss) {
    const b = BOSSES[Number(boss[1]) - 1];
    return b ? { name: b.title, imageUrl: `/boss-art/${b.floor}` } : null;
  }
  const c = await db.character.findUnique({ where: { id }, select: { name: true, imageUrl: true, hidden: true } });
  return c && !c.hidden ? { name: c.name, imageUrl: c.imageUrl } : null;
}

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
const dataUri = (bytes: ArrayBuffer | Buffer, ext: string) => `data:${MIME[ext] ?? "image/png"};base64,${Buffer.from(bytes as ArrayBuffer).toString("base64")}`;

// A fighter's drawing as a data URI, read from where it lives rather than fetched from the request's host (which a client
// could choose): the sample art in /public, uploads on disk, the boss art route, or our Blob store.
async function loadImage(url: string): Promise<string | null> {
  try {
    let m = /^\/samples\/([\w.-]+\.(png|jpg|webp|gif))$/.exec(url);
    if (m) return dataUri(await readFile(path.join(process.cwd(), "public", "samples", m[1])), m[2]);
    m = /^\/api\/uploads\/([\w-]+\.(jpg|png|webp|gif))$/.exec(url);
    if (m) return dataUri(await readFile(path.join(process.cwd(), "uploads", m[1])), m[2]);
    const boss = /^\/boss-art\/(\d{1,2})$/.exec(url);
    if (boss) {
      const { GET } = await import("@/app/boss-art/[floor]/route");
      const res = await GET(new Request("http://card.local" + url), { params: Promise.resolve({ floor: boss[1] }) } as never);
      return dataUri(await res.arrayBuffer(), "png");
    }
    const u = new URL(url);
    if (u.protocol === "https:" && u.hostname.endsWith(".public.blob.vercel-storage.com")) {
      const res = await fetch(u, { signal: AbortSignal.timeout(6000) });
      if (res.ok) return dataUri(await res.arrayBuffer(), u.pathname.split(".").pop()?.toLowerCase() ?? "png");
    }
  } catch {}
  return null;
}

const INK = "#17171a", PAPER = "#f7f5f0", HIT = "#e5482d", GOLD = "#f2b705", MUTED = "#6b6a66";

// score: [A's rounds, B's rounds]; link: shown at the bottom (no scheme).
export async function renderCard(a: CardFighter, b: CardFighter, score: [number, number], link: string) {
  const [ia, ib] = await Promise.all([loadImage(a.imageUrl), loadImage(b.imageUrl)]);
  const winner = score[0] > score[1] ? 0 : 1;
  const name = (n: string) => (n.length > 17 ? n.slice(0, 16) + "…" : n);
  const side = (f: CardFighter, img: string | null, won: boolean) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 380 }}>
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", width: 380, height: 470, background: "#ffffff", borderRadius: 36,
          border: `${won ? 10 : 3}px solid ${won ? GOLD : "#e4e1d9"}`, overflow: "hidden",
        }}
      >
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" width={340} height={430} style={{ objectFit: "contain" }} />
        ) : (
          <div style={{ display: "flex", fontSize: 120, color: "#e4e1d9" }}>?</div>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "center", width: 380, marginTop: 22, fontSize: 44, fontWeight: 800, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name(f.name)}</div>
      <div style={{ display: "flex", marginTop: 6, fontSize: 28, fontWeight: 800, letterSpacing: 4, color: won ? "#b88a00" : MUTED }}>{won ? "WINNER" : "DEFEATED"}</div>
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: PAPER, position: "relative", padding: "56px 70px 0 120px" }}>
        {[200, 270, 340, 410, 480, 550, 620, 690, 760, 830, 900].map((y) => (
          <div key={y} style={{ position: "absolute", left: 0, top: y, width: 1080, height: 2, background: "rgba(47,91,224,.09)" }} />
        ))}
        <div style={{ position: "absolute", left: 96, top: 0, width: 3, height: 1080, background: "rgba(229,72,45,.28)" }} />
        <div style={{ display: "flex", fontSize: 64, fontWeight: 800, color: INK }}>
          ink<span style={{ color: HIT }}>fight</span>
        </div>
        <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginTop: 44 }}>
          {side(a, ia, winner === 0)}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 470, width: 110 }}>
            <div style={{ display: "flex", fontSize: 78, fontWeight: 800, color: HIT }}>VS</div>
          </div>
          {side(b, ib, winner === 1)}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginTop: 28, fontSize: 120, fontWeight: 800, color: INK, marginRight: 20 }}>
          {score[0]} – {score[1]}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 8, marginRight: 20 }}>
          <div style={{ display: "flex", fontSize: 38, fontWeight: 800, color: INK }}>Fought on InkFight</div>
          <div style={{ display: "flex", fontSize: 30, color: MUTED, marginTop: 6 }}>{link}</div>
        </div>
      </div>
    ),
    { ...CARD_SIZE },
  );
}
