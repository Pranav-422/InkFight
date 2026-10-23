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
          <Link href={nextPath ?? "/home"} className="rounded-xl bg-hit px-5 py-3 text-center font-semibold text-white hover:brightness-110">
            Continue as {session.name}
          </Link>
          <form action={logout}>
            <input type="hidden" name="to" value={again} />
            <button className="w-full rounded-xl bg-card px-5 py-3 font-semibold ring-1 ring-line hover:ring-ink">Log out and switch account</button>
          </form>
        </div>
        <p className="mt-5 rounded-xl bg-gold/20 p-3 text-sm">
          Playing against yourself? Use a{" "}
          <Link href="/play/test" className="font-semibold underline">
            test match
          </Link>{" "}
          (both players on one screen), or log the second account in from an <b>incognito window</b>. Tabs in the same window
          share one login, so they can&apos;t be two different players.
        </p>
      </div>
    );
  }
  // Came from a friend's invite link: they should fight with their own drawing,
  // so push signup + scan, and don't offer the shared demo accounts.
  const room = nextPath?.match(/^\/play\/([A-Z0-9]{4,8})$/)?.[1];
  if (room) {
    return (
      <div className="py-6">
        <div className="mx-auto mb-8 max-w-sm rounded-2xl bg-ink p-5 text-white">
          <p className="text-xs font-semibold uppercase tracking-widest text-gold">Room {room}</p>
          <p className="mt-1 font-display text-2xl font-extrabold">Your friend challenged you!</p>
          <p className="mt-1 text-sm text-white/70">Sign up, scan your own stick-figure drawing, and you&apos;ll go straight into the fight.</p>
          <Link
            href={`/signup?next=${encodeURIComponent(`/create?room=${room}`)}`}
            className="mt-4 block rounded-xl bg-hit px-5 py-3 text-center font-semibold text-white hover:brightness-110"
          >
            Sign up and scan my fighter
          </Link>
        </div>
        <AuthForm mode="login" next={nextPath} />
      </div>
    );
  }
  return (
    <div className="py-6">
      <AuthForm mode="login" next={nextPath} demo={DEMO_ACCOUNTS.map(({ email, password }) => ({ email, password }))} />
    </div>
  );
}
