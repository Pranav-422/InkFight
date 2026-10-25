"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { setSecurity, type SecurityState } from "../actions";
import { SECURITY_QUESTIONS } from "../questions";

const input = "rounded-xl bg-card px-4 py-3 font-normal ring-1 ring-line outline-none focus:ring-2 focus:ring-ink";

export function SecurityForm({ next, current }: { next: string; current: string | null }) {
  const [state, action, pending] = useActionState<SecurityState, FormData>(setSecurity, {});
  return (
    <div className="mx-auto w-full max-w-sm">
      <h1 className="font-display text-3xl font-extrabold">{current ? "Change your security question" : "Set a security question"}</h1>
      <p className="mt-1 text-sm text-muted">If you ever forget your password, the right answer lets you set a new one.</p>
      <form action={action} className="mt-6 grid gap-3">
        <input type="hidden" name="next" value={next} />
        <label className="grid gap-1 text-sm font-medium">
          Question
          <select name="question" required defaultValue={current ?? SECURITY_QUESTIONS[0]} className={input}>
            {SECURITY_QUESTIONS.map((q) => (
              <option key={q}>{q}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Answer
          <input name="answer" required minLength={2} maxLength={100} autoComplete="off" placeholder="Not case sensitive" className={input} />
        </label>
        {state.error && <p className="rounded-xl bg-hit/10 px-3 py-2 text-sm text-hit">{state.error}</p>}
        <button
          disabled={pending}
          className="mt-1 inline-flex items-center justify-center gap-2 rounded-xl bg-hit px-5 py-3 font-semibold text-white hover:brightness-110 disabled:opacity-60"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          Save
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        <Link href={next} className="font-semibold text-ink underline-offset-2 hover:underline">
          Skip for now
        </Link>
      </p>
    </div>
  );
}
