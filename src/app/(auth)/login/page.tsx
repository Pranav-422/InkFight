import Link from "next/link";
import { getSession } from "@/lib/auth";
import { logout } from "../actions";
import { AuthForm } from "../AuthForm";
import { DEMO_ACCOUNTS } from "../demo";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const nextPath = typeof next === "string" ? next : undefined;
  const session = await getSession();
  // Don't silently bounce: in one browser every tab shares this login, which is
  // how "two players in two tabs" ended up as the same account.
  if (session) {
    const again = `/login${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`;
    return (
      <div className="mx-auto max-w-sm py-6">
        <h1 className="font-display text-3xl font-extrabold">You&apos;re already logged in</h1>
        <p className="mt-2 text-muted">
          This browser is signed in as <span className="font-semibold text-ink">{session.name}</span> ({session.email}).
        </p>
        <div className="mt-6 grid gap-2">
          <Link href={nextPath ?? "/create"} className="rounded-xl bg-hit px-5 py-3 text-center font-semibold text-white hover:brightness-110">
            Continue as {session.name}
          </Link>
          <form action={logout}>
            <input type="hidden" name="to" value={again} />
            <button className="w-full rounded-xl bg-card px-5 py-3 font-semibold ring-1 ring-line hover:ring-ink">Log out and switch account</button>
          </form>
        </div>
        <p className="mt-5 rounded-xl bg-gold/20 p-3 text-sm">
          Playing against yourself? Log the second account in from an <b>incognito window</b> or another browser. Tabs in the same
          window share one login, so they can&apos;t be two different players.
        </p>
      </div>
    );
  }
  return (
    <div className="py-6">
      <AuthForm mode="login" next={nextPath} demo={DEMO_ACCOUNTS.map(({ email, password }) => ({ email, password }))} />
    </div>
  );
}
