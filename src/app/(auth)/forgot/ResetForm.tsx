"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { answerReset, findQuestion, requestReset, resetPassword, type QuestionState, type ResetState } from "../actions";

const input = "rounded-xl bg-card px-4 py-3 font-normal ring-1 ring-line outline-none focus:ring-2 focus:ring-ink";
const button =
  "mt-1 inline-flex items-center justify-center gap-2 rounded-xl bg-hit px-5 py-3 font-semibold text-white hover:brightness-110 disabled:opacity-60";

export function ResetForm() {
  const [byQuestion, setByQuestion] = useState(false);
  const toggle = (
    <button type="button" onClick={() => setByQuestion((v) => !v)} className="mt-3 w-full text-center text-sm font-semibold text-muted underline-offset-2 hover:text-ink hover:underline">
      {byQuestion ? "Email me a code instead" : "Answer your security question instead"}
    </button>
  );
  return (
    <div className="mx-auto w-full max-w-sm">
      {byQuestion ? <QuestionReset /> : <EmailReset />}
      {toggle}
      <p className="mt-4 text-center text-sm text-muted">
        Remembered it?{" "}
        <Link href="/login" className="font-semibold text-ink underline-offset-2 hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}

function EmailReset() {
  const [asked, ask, asking] = useActionState<ResetState, FormData>(requestReset, {});
  const [done, reset, resetting] = useActionState<ResetState, FormData>(resetPassword, {});
  const sent = asked.sent || done.sent;
  const email = done.email ?? asked.email;
  const error = done.sent ? done.error : asked.error;

  return (
    <>
      <h1 className="font-display text-3xl font-extrabold">Forgot your password?</h1>
      <p className="mt-1 text-sm text-muted">
        {sent ? (
          <>
            If <b>{email}</b> has an account, a 6-digit code is on its way. Check spam too.
          </>
        ) : (
          "We'll email you a 6-digit code."
        )}
      </p>

      {!sent ? (
        <form action={ask} className="mt-6 grid gap-3">
          <label className="grid gap-1 text-sm font-medium">
            Email
            <input name="email" type="email" required autoComplete="email" placeholder="you@example.com" defaultValue={email} className={input} />
          </label>
          {error && <p className="rounded-xl bg-hit/10 px-3 py-2 text-sm text-hit">{error}</p>}
          <button disabled={asking} className={button}>
            {asking && <Loader2 className="size-4 animate-spin" />}
            Send me a code
          </button>
        </form>
      ) : (
        <form action={reset} className="mt-6 grid gap-3">
          <input type="hidden" name="email" value={email} />
          <label className="grid gap-1 text-sm font-medium">
            Code
            <input
              name="code"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              placeholder="123456"
              className={`${input} font-mono tracking-[.3em]`}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            New password
            <input name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="At least 8 characters" className={input} />
          </label>
          {error && <p className="rounded-xl bg-hit/10 px-3 py-2 text-sm text-hit">{error}</p>}
          <button disabled={resetting} className={button}>
            {resetting && <Loader2 className="size-4 animate-spin" />}
            Set new password
          </button>
        </form>
      )}
    </>
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
      <p className="mt-1 text-sm text-muted">{question ? <>Answer the question for <b>{email}</b> and pick a new password.</> : "Answer the security question you set after logging in."}</p>
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
