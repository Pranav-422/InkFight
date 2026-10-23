import { DEMO_ACCOUNTS } from "@/app/(auth)/demo";
import { getSession, signToken } from "@/lib/auth";
import { db } from "@/lib/db";
import { publicFighter } from "@/lib/rooms";

// Split-screen test match: hands the page a short-lived token for a demo account,
// so one tab can play both sides of a real room. Only demo accounts (their
// passwords are public on the login page anyway), never a real user.
export async function POST() {
  const s = await getSession();
  if (!s) return Response.json({ error: "Log in first." }, { status: 401 });
  const email = DEMO_ACCOUNTS.find((d) => d.email !== s.email)!.email;
  const user = await db.user.findUnique({ where: { email } });
  const fighter = user && (await db.character.findFirst({ where: { ownerId: user.id }, orderBy: { createdAt: "asc" } }));
  if (!user || !fighter) return Response.json({ error: "Demo account isn't set up. Run `npm run seed`." }, { status: 500 });
  const token = await signToken({ userId: user.id, name: user.name, email: user.email }, 3 * 60 * 60);
  return Response.json({ token, userId: user.id, name: user.name, fighter: publicFighter(fighter) });
}
