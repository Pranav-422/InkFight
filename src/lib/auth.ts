import "server-only";
import bcrypt from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db";

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

export async function startSession(s: Session) {
  const token = await new SignJWT({ name: s.name, email: s.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
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

export const getSession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    return { userId: payload.sub, name: String(payload.name ?? ""), email: String(payload.email ?? "") };
  } catch {
    return null;
  }
});

// Admins are listed by email in ADMIN_EMAILS (comma-separated), checked on the server only.
export function isAdmin(s: { email: string } | null): boolean {
  if (!s) return false;
  const list = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(s.email.toLowerCase());
}

// The admin buff counts only while that user is still an admin and has it switched on.
export const buffOn = (u: { email: string; buff: boolean } | null | undefined) => !!u?.buff && isAdmin(u);
export async function sessionBuff(s: Session | null): Promise<boolean> {
  if (!s || !isAdmin(s)) return false;
  return !!(await db.user.findUnique({ where: { id: s.userId }, select: { buff: true } }))?.buff;
}

// For pages: bounce to /login and come back afterwards.
export async function requireUser(next: string): Promise<Session> {
  const s = await getSession();
  if (!s) redirect(`/login?next=${encodeURIComponent(next)}`);
  return s;
}
