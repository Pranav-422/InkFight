"use server";

import { redirect } from "next/navigation";
import { endSession, hashPassword, startSession, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rateLimit";

// Compared against when the email is unknown, so a wrong email takes as long as a wrong password.
const DUMMY_HASH = "$2b$10$6zP65Lbd5mUkZWq4/M3aveZ1AVyy6YDSAn7/lr4fkUewiR6yjwMVS";

export type AuthState = { error?: string; email?: string; name?: string };

// Only allow same-site relative redirects after login.
function safeNext(v: FormDataEntryValue | null) {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/home";
}

export async function login(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Email and password, please.", email };
  // Brute-force guard: per IP, and per account from that IP (keyed by both, so a
  // stranger can't lock someone else out of their account).
  const ip = await clientIp();
  if (!(await rateLimit(`login-ip:${ip}`, 20, 15 * 60_000)) || !(await rateLimit(`login:${email}:${ip}`, 8, 15 * 60_000))) {
    return { error: "Too many login attempts. Wait 15 minutes and try again.", email };
  }

  const user = await db.user.findUnique({ where: { email } });
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    return { error: "That email and password don't match. Typo?", email };
  }
  await startSession({ userId: user.id, name: user.name, email: user.email });
  redirect(safeNext(form.get("next")));
}

export async function signup(_prev: AuthState, form: FormData): Promise<AuthState> {
  const name = String(form.get("name") ?? "").trim().slice(0, 24);
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (name.length < 2) return { error: "Pick a handle with at least 2 characters.", email, name };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "That email doesn't look right.", email, name };
  if (password.length < 8 || password.length > 200) return { error: "Password needs at least 8 characters.", email, name };
  if (!(await rateLimit(`signup-ip:${await clientIp()}`, 5, 60 * 60_000))) return { error: "Too many new accounts from here. Try again in an hour.", email, name };

  if (await db.user.findUnique({ where: { email } })) {
    return { error: "There's already an account with that email. Try logging in.", email, name };
  }
  const user = await db.user.create({ data: { name, email, passwordHash: await hashPassword(password) } });
  await startSession({ userId: user.id, name: user.name, email: user.email });
  redirect(safeNext(form.get("next")));
}

export async function logout(form?: FormData) {
  await endSession();
  const to = form?.get("to");
  redirect(typeof to === "string" && /^\/(login|signup)(\?|$)/.test(to) ? to : "/");
}
