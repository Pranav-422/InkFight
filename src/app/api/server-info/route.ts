import { networkInterfaces } from "os";

// Local dev only: LAN addresses so the invite link works on a friend's phone
// instead of pointing at "localhost". Hosted deployments return nothing.
export async function GET() {
  if (process.env.VERCEL) return Response.json({ lan: [] });
  const lan = Object.values(networkInterfaces())
    .flat()
    .filter((n) => n && n.family === "IPv4" && !n.internal)
    .map((n) => n!.address);
  return Response.json({ lan });
}
