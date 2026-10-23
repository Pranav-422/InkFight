import "server-only";
import bcrypt from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

const COOKIE = "inkfight_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export type Session = { userId: string; name: string; email: string };

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(s);
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export const signToken = (s: Session, maxAge = MAX_AGE) =>
  new SignJWT({ name: s.name, email: s.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.userId)
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .sign(secret());

export async function startSession(s: Session) {
  const token = await signToken(s);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

// A "Bearer" header wins over the cookie: the split-screen test match runs a second
// player (a demo account) in the same tab, which can't have its own cookie.
export const getSession = cache(async (): Promise<Session | null> => {
  const bearer = (await headers()).get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  const token = bearer ?? (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    return { userId: payload.sub, name: String(payload.name ?? ""), email: String(payload.email ?? "") };
  } catch {
    return null;
  }
});

// For pages: bounce to /login and come back afterwards.
export async function requireUser(next: string): Promise<Session> {
  const s = await getSession();
  if (!s) redirect(`/login?next=${encodeURIComponent(next)}`);
  return s;
}
