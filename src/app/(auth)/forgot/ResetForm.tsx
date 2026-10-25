"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { answerReset, findQuestion, type QuestionState } from "../actions";

const input = "rounded-xl bg-card px-4 py-3 font-normal ring-1 ring-line outline-none focus:ring-2 focus:ring-ink";
const button =
  "mt-1 inline-flex items-center justify-center gap-2 rounded-xl bg-hit px-5 py-3 font-semibold text-white hover:brightness-110 disabled:opacity-60";

// shortcut: only the security question for now (the emailed code didn't arrive; requestReset/resetPassword in
// ../actions.ts and src/lib/mail.ts are kept). Bring back an email form once Resend has a verified domain.
export function ResetForm() {
  return (
    <div className="mx-auto w-full max-w-sm">
      <QuestionReset />
      <p className="mt-4 text-center text-sm text-muted">
        Remembered it?{" "}
        <Link href="/login" className="font-semibold text-ink underline-offset-2 hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}

function QuestionReset() {
  const [found, find, finding] = useActionState<QuestionState, FormData>(findQuestion, {});
  const [done, answer, answering] = useActionState<QuestionState, FormData>(answerReset, {});
  const question = done.question ?? found.question;
  const email = done.email ?? found.email;
  const error = question ? done.error : found.error;
  return (
    <>
      <h1 className="font-display text-3xl font-extrabold">Forgot your password?</h1>
      <p className="mt-1 text-sm text-muted">{question ? <>Answer the question for <b>{email}</b> and pick a new password.</> : "Answer the security question you set after logging in, then pick a new password."}</p>
      {!question ? (
        <form action={find} className="mt-6 grid gap-3">
          <label className="grid gap-1 text-sm font-medium">
            Email
            <input name="email" type="email" required autoComplete="email" placeholder="you@example.com" defaultValue={email} className={input} />
          </label>
          {error && <p className="rounded-xl bg-hit/10 px-3 py-2 text-sm text-hit">{error}</p>}
          <button disabled={finding} className={button}>
            {finding && <Loader2 className="size-4 animate-spin" />}
            Show my question
          </button>
        </form>
      ) : (
        <form action={answer} className="mt-6 grid gap-3">
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="question" value={question} />
          <p className="rounded-xl bg-card px-4 py-3 text-sm font-semibold ring-1 ring-line">{question}</p>
          <label className="grid gap-1 text-sm font-medium">
            Answer
            <input name="answer" required autoComplete="off" className={input} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            New password
            <input name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="At least 8 characters" className={input} />
          </label>
          {error && <p className="rounded-xl bg-hit/10 px-3 py-2 text-sm text-hit">{error}</p>}
          <button disabled={answering} className={button}>
            {answering && <Loader2 className="size-4 animate-spin" />}
            Set new password
          </button>
        </form>
      )}
    </>
  );
}
