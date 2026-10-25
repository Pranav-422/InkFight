"use server";

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { endSession, getSession, hashPassword, startSession, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/mail";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { SECURITY_QUESTIONS } from "./questions";

// Compared against when the email is unknown, so a wrong email takes as long as a wrong password.
const DUMMY_HASH = "$2b$10$6zP65Lbd5mUkZWq4/M3aveZ1AVyy6YDSAn7/lr4fkUewiR6yjwMVS";

export type AuthState = { error?: string; email?: string; name?: string };

// Only allow same-site relative redirects after login.
function safeNext(v: FormDataEntryValue | null) {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/home";
}

// No security question yet: ask for one on the way in (it can be skipped).
const askSecurity = (form: FormData) => `/security?next=${encodeURIComponent(safeNext(form.get("next")))}`;

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
  redirect(user.securityQuestion ? safeNext(form.get("next")) : askSecurity(form));
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
  redirect(askSecurity(form));
}

export async function logout(form?: FormData) {
  await endSession();
  const to = form?.get("to");
  redirect(typeof to === "string" && /^\/(login|signup)(\?|$)/.test(to) ? to : "/");
}

// Password reset: a 6-digit code goes to the account's email, good for 15 minutes and 5 tries.
const RESET_MS = 15 * 60_000;
const RESET_TRIES = 5;
const codeHash = (userId: string, code: string) => createHmac("sha256", process.env.AUTH_SECRET!).update(`reset:${userId}:${code}`).digest();

export type ResetState = { error?: string; email?: string; sent?: boolean };

export async function requestReset(_prev: ResetState, form: FormData): Promise<ResetState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "That email doesn't look right.", email };
  if (!(await rateLimit(`reset-ip:${await clientIp()}`, 6, 15 * 60_000)) || !(await rateLimit(`reset:${email}`, 3, 15 * 60_000))) {
    return { error: "Too many codes asked for. Wait 15 minutes and try again.", email };
  }
  const user = await db.user.findUnique({ where: { email } });
  // Same answer whether or not the account exists, so this can't be used to find out who's signed up.
  if (user) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await db.user.update({
      where: { id: user.id },
      data: { resetHash: codeHash(user.id, code).toString("hex"), resetExpires: new Date(Date.now() + RESET_MS), resetTries: 0 },
    });
    const ok = await sendMail(
      email,
      `Your InkFight code: ${code}`,
      `Hi ${user.name},\n\nYour InkFight password reset code is ${code}. It works for 15 minutes.\n\nDidn't ask for it? Ignore this email; your password stays the same.`,
    );
    if (!ok) return { error: "Couldn't send the email right now. Try again in a minute.", email };
  }
  return { sent: true, email };
}

export async function resetPassword(_prev: ResetState, form: FormData): Promise<ResetState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const code = String(form.get("code") ?? "").replace(/\D/g, "");
  const password = String(form.get("password") ?? "");
  const back = { sent: true, email };
  if (code.length !== 6) return { ...back, error: "The code has 6 digits." };
  if (password.length < 8 || password.length > 200) return { ...back, error: "Password needs at least 8 characters." };
  if (!(await rateLimit(`reset-try-ip:${await clientIp()}`, 20, 15 * 60_000))) return { ...back, error: "Too many tries. Wait 15 minutes." };

  const user = await db.user.findUnique({ where: { email } });
  const live = user?.resetHash && user.resetExpires && user.resetExpires.getTime() > Date.now() && user.resetTries < RESET_TRIES;
  if (!user || !live) return { ...back, error: "That code has expired or had too many wrong tries. Ask for a new one." };
  if (!timingSafeEqual(codeHash(user.id, code), Buffer.from(user.resetHash!, "hex"))) {
    await db.user.update({ where: { id: user.id }, data: { resetTries: { increment: 1 } } });
    return { ...back, error: "Wrong code. Check the email again." };
  }
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password), resetHash: null, resetExpires: null, resetTries: 0 } });
  await startSession({ userId: user.id, name: user.name, email: user.email });
  redirect("/home");
}

// Temporary second reset path while testing: a security question set after login. The answer is stored
// as a bcrypt hash, so a right answer lets the player set a new password (the old one can't be shown).
// shortcut: weaker than the emailed code (answers can be guessed or looked up); remove once Resend has a domain.
const normAnswer = (a: string) => a.trim().toLowerCase().replace(/\s+/g, " ");

export type SecurityState = { error?: string };

export async function setSecurity(_prev: SecurityState, form: FormData): Promise<SecurityState> {
  const s = await getSession();
  if (!s) redirect("/login");
  const question = String(form.get("question") ?? "");
  const answer = normAnswer(String(form.get("answer") ?? ""));
  if (!SECURITY_QUESTIONS.includes(question)) return { error: "Pick one of the questions." };
  if (answer.length < 2 || answer.length > 100) return { error: "The answer needs at least 2 characters." };
  await db.user.update({ where: { id: s.userId }, data: { securityQuestion: question, securityAnswer: await hashPassword(answer) } });
  redirect(safeNext(form.get("next")));
}

export type QuestionState = { error?: string; email?: string; question?: string };

export async function findQuestion(_prev: QuestionState, form: FormData): Promise<QuestionState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!(await rateLimit(`secq-ip:${await clientIp()}`, 10, 15 * 60_000))) return { error: "Too many tries. Wait 15 minutes.", email };
  const user = await db.user.findUnique({ where: { email }, select: { securityQuestion: true } });
  if (!user?.securityQuestion) return { error: "No security question is set for that email. Use the emailed code instead.", email };
  return { email, question: user.securityQuestion };
}

export async function answerReset(_prev: QuestionState, form: FormData): Promise<QuestionState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const answer = normAnswer(String(form.get("answer") ?? ""));
  const password = String(form.get("password") ?? "");
  const back = { email, question: String(form.get("question") ?? "") };
  if (password.length < 8 || password.length > 200) return { ...back, error: "Password needs at least 8 characters." };
  if (!(await rateLimit(`secq-ip:${await clientIp()}`, 10, 15 * 60_000)) || !(await rateLimit(`secq:${email}`, 5, 15 * 60_000))) {
    return { ...back, error: "Too many tries. Wait 15 minutes." };
  }
  const user = await db.user.findUnique({ where: { email } });
  const ok = await verifyPassword(answer, user?.securityAnswer ?? DUMMY_HASH);
  if (!user || !ok) return { ...back, error: "That answer doesn't match." };
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } });
  await startSession({ userId: user.id, name: user.name, email: user.email });
  redirect("/home");
}
