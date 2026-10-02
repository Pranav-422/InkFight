"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { login, signup, type AuthState } from "./actions";

export function AuthForm({ mode, next, demo }: { mode: "login" | "signup"; next?: string; demo?: { email: string; password: string }[] }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "login" ? login : signup, {});
  const isLogin = mode === "login";

  return (
    <div className="mx-auto w-full max-w-sm">
      <h1 className="font-display text-3xl font-extrabold">{isLogin ? "Welcome back, fighter" : "Join the fight"}</h1>
      <p className="mt-1 text-sm text-muted">{isLogin ? "Log in to draw, scan and fight." : "One account, unlimited scribbled warriors."}</p>

      <form action={action} className="mt-6 grid gap-3">
        <input type="hidden" name="next" value={next ?? ""} />
        {!isLogin && (
          <Field label="Handle" name="name" placeholder="InkNinja" defaultValue={state.name} autoComplete="nickname" />
        )}
        <Field label="Email" name="email" type="email" placeholder="you@example.com" defaultValue={state.email} autoComplete="email" />
        <Field
          label="Password"
          name="password"
          type="password"
          placeholder={isLogin ? "••••••" : "At least 6 characters"}
          autoComplete={isLogin ? "current-password" : "new-password"}
        />
        {state.error && <p className="rounded-xl bg-hit/10 px-3 py-2 text-sm text-hit">{state.error}</p>}
        <button
          disabled={pending}
          className="mt-1 inline-flex items-center justify-center gap-2 rounded-xl bg-hit px-5 py-3 font-semibold text-white hover:brightness-110 disabled:opacity-60"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          {isLogin ? "Log in" : "Create account"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-muted">
        {isLogin ? "New here? " : "Already have an account? "}
        <Link
          href={`/${isLogin ? "signup" : "login"}${next ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-semibold text-ink underline-offset-2 hover:underline"
        >
          {isLogin ? "Create an account" : "Log in"}
        </Link>
      </p>

      {demo && demo.length > 0 && (
        <div className="mt-6 rounded-2xl bg-card p-4 text-sm ring-1 ring-line">
          <p className="font-semibold">Demo accounts</p>
          <p className="text-xs text-muted">Open one in each browser to fight yourself.</p>
          <ul className="mt-2 grid gap-1 font-mono text-xs">
            {demo.map((d) => (
              <li key={d.email}>
                {d.email} · {d.password}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      {label}
      <input
        {...props}
        required
        className="rounded-xl bg-card px-4 py-3 font-normal ring-1 ring-line outline-none focus:ring-2 focus:ring-ink"
      />
    </label>
  );
}
