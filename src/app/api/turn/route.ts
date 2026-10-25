import { getSession } from "@/lib/auth";
import { rateLimit, tooMany } from "@/lib/rateLimit";

// Short-lived TURN credentials (Cloudflare Realtime TURN) for players whose networks block a direct
// peer-to-peer link: client isolation on Wi-Fi, carrier NAT on mobile data. The key stays on the server.
// Without TURN_KEY_ID / TURN_KEY_API_TOKEN this hands out nothing and the game uses STUN only.
export async function GET() {
  const s = await getSession();
  if (!s) return Response.json({ iceServers: [] }, { status: 401 });
  const id = process.env.TURN_KEY_ID, token = process.env.TURN_KEY_API_TOKEN;
  if (!id || !token) return Response.json({ iceServers: [] });
  if (!(await rateLimit(`turn:${s.userId}`, 30, 3_600_000))) return tooMany();
  const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${id}/credentials/generate-ice-servers`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ttl: 86400 }),
  }).catch(() => null);
  if (!r?.ok) return Response.json({ iceServers: [] });
  const data = (await r.json().catch(() => ({}))) as { iceServers?: RTCIceServer[] };
  // Browsers block port 53, and with non-trickle ICE a dead URL stalls gathering: drop it.
  const iceServers = (data.iceServers ?? [])
    .map((x) => ({ ...x, urls: (Array.isArray(x.urls) ? x.urls : [x.urls]).filter((u) => !/:53(\?|$)/.test(u)) }))
    .filter((x) => x.urls.length);
  return Response.json({ iceServers }, { headers: { "Cache-Control": "no-store" } });
}
