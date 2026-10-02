"use server";

import { redirect } from "next/navigation";
import { endSession, hashPassword, startSession, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";

export type AuthState = { error?: string; email?: string; name?: string };

// Only allow same-site relative redirects after login.
function safeNext(v: FormDataEntryValue | null) {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/create";
}

export async function login(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Email and password, please.", email };

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
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
  if (password.length < 6) return { error: "Password needs at least 6 characters.", email, name };

  if (await db.user.findUnique({ where: { email } })) {
    return { error: "There's already an account with that email. Try logging in.", email, name };
  }
  const user = await db.user.create({ data: { name, email, passwordHash: await hashPassword(password) } });
  await startSession({ userId: user.id, name: user.name, email: user.email });
  redirect(safeNext(form.get("next")));
}

export async function logout() {
  await endSession();
  redirect("/");
}
