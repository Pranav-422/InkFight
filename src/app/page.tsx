import { BookOpen, Camera, Gamepad2, Hand, PenLine, Shield, Sword, Target, WandSparkles, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const STEPS: [LucideIcon, string, string][] = [
  [PenLine, "Draw", "Any stick figure on any paper. Give it a sword, a book, a shield — or nothing at all."],
  [Camera, "Scan", "Snap a photo. AI reads what's in its hands, how big it is, its pose and ink colors."],
  [Gamepad2, "Fight", "Your drawing becomes a fighter you control, live, against a friend on their own phone."],
];

const CLASSES: [LucideIcon, string, string, string][] = [
  [Sword, "Sword", "Warrior", "Dash slash"],
  [BookOpen, "Book", "Mage", "Magic bolt"],
  [WandSparkles, "Staff / wand", "Caster", "Heavy orb"],
  [Shield, "Shield", "Tank", "Shield charge + armor"],
  [Target, "Bow", "Ranger", "Long-range arrow"],
  [Hand, "Empty hands", "Brawler", "Launcher uppercut"],
];

export default async function Landing() {
  const [session, recent] = await Promise.all([
    getSession(),
    db.character.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
  ]);
  const start = session ? "/create" : "/signup?next=/create";

  return (
    <div className="grid gap-20 pb-8">
      {/* Hero */}
      <section className="grid items-center gap-10 md:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-hit">Draw · Scan · Fight</p>
          <h1 className="mt-2 font-display text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl">
            Your doodle.
            <br />
            Your <span className="text-hit">fighter.</span>
          </h1>
          <p className="mt-4 max-w-md text-lg text-muted">
            Draw a stick figure, take a photo, and it jumps onto the screen — ready to throw hands with your friend&apos;s drawing.
            How you draw it decides how hard it hits.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href={start} className="rounded-xl bg-hit px-6 py-3.5 font-semibold text-white hover:brightness-110">
              {session ? "Scan a fighter" : "Start drawing — it's free"}
            </Link>
            <Link
              href={session ? "/play" : "/login?next=/play"}
              className="rounded-xl bg-card px-6 py-3.5 font-semibold ring-1 ring-line hover:ring-ink"
            >
              {session ? "Fight a friend" : "Log in"}
            </Link>
          </div>
        </div>

        {/* Mini arena */}
        <div className="relative rounded-3xl bg-card p-5 shadow-[0_20px_50px_-25px_rgba(0,0,0,.35)] ring-1 ring-line">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-sm">
            <div>
              <p className="font-display font-extrabold">Sir Scribbles</p>
              <div className="mt-1 h-2.5 rounded-full bg-line">
                <div className="h-full w-[72%] rounded-full bg-ink" />
              </div>
            </div>
            <span className="font-display text-2xl font-extrabold">42</span>
            <div className="text-right">
              <p className="font-display font-extrabold">Margin Mage</p>
              <div className="mt-1 h-2.5 rounded-full bg-line">
                <div className="ml-auto h-full w-[38%] rounded-full bg-hit" />
              </div>
            </div>
          </div>
          <div className="relative mt-4 flex h-64 items-end justify-between border-b-[3px] border-ink px-6 pb-1 sm:h-72">
            {/* eslint-disable-next-line @next/next/no-img-element -- static sample art */}
            <img src="/samples/warrior.png" alt="A stick-figure warrior holding a sword" className="h-[92%] -rotate-3 mix-blend-multiply" />
            <span className="absolute left-1/2 top-1/3 -translate-x-1/2 -rotate-6 font-display text-3xl font-extrabold text-hit">POW!</span>
            {/* eslint-disable-next-line @next/next/no-img-element -- static sample art */}
            <img src="/samples/mage.png" alt="A stick-figure mage holding a book" className="h-[85%] -scale-x-100 rotate-6 mix-blend-multiply" />
          </div>
          <p className="mt-3 text-center text-xs text-muted">Real drawings. Real-time. On paper, then on screen.</p>
        </div>
      </section>

      {/* How it works */}
      <section>
        <h2 className="font-display text-3xl font-extrabold">How it works</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-3">
          {STEPS.map(([Icon, title, body], i) => (
            <li key={title} className="rounded-2xl bg-card p-5 ring-1 ring-line">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-ink text-white">
                  <Icon className="size-5" />
                </span>
                <span className="text-sm font-semibold text-muted">Step {i + 1}</span>
              </div>
              <p className="mt-4 font-display text-xl font-extrabold">{title}</p>
              <p className="mt-1 text-sm text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Power */}
      <section className="grid gap-8 md:grid-cols-[1fr_1.3fr]">
        <div>
          <h2 className="font-display text-3xl font-extrabold">Draw it strong, it fights strong</h2>
          <p className="mt-3 text-muted">
            Stats come from what&apos;s actually on the paper — not dice. A big figure gets more HP. An aggressive pose hits harder. Whatever it
            holds picks its class and special move.
          </p>
          <ul className="mt-5 grid gap-2 text-sm">
            <li><span className="font-semibold">HP</span> → health</li>
            <li><span className="font-semibold text-hit">ATK</span> → punch damage</li>
            <li><span className="font-semibold text-guard">DEF</span> → less damage taken, stronger blocks</li>
            <li><span className="font-semibold">SPD</span> → run speed, jump height, attack rate</li>
          </ul>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {CLASSES.map(([Icon, item, cls, special]) => (
            <li key={cls} className="rounded-2xl bg-card p-4 ring-1 ring-line">
              <Icon className="size-6" />
              <p className="mt-3 text-xs text-muted">Holding: {item}</p>
              <p className="font-display text-lg font-extrabold">{cls}</p>
              <p className="text-xs text-hit">{special}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Recent fighters */}
      {recent.length > 0 && (
        <section>
          <div className="flex items-end justify-between">
            <h2 className="font-display text-3xl font-extrabold">Fresh off the page</h2>
            <Link href="/gallery" className="text-sm font-semibold text-muted hover:text-ink">
              See all →
            </Link>
          </div>
          <ul className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-6">
            {recent.map((c) => (
              <li key={c.id}>
                <Link href={`/character/${c.id}`} className="block rounded-2xl bg-card p-2 ring-1 ring-line transition hover:ring-ink">
                  {/* eslint-disable-next-line @next/next/no-img-element -- user uploads */}
                  <img src={c.imageUrl} alt="" className="aspect-square w-full rounded-xl bg-white object-contain" />
                  <p className="mt-2 truncate px-1 text-sm font-semibold">{c.name}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* CTA */}
      <section className="rounded-3xl bg-ink px-6 py-12 text-center text-white">
        <h2 className="font-display text-3xl font-extrabold sm:text-4xl">Grab a pen. Settle it on paper.</h2>
        <p className="mx-auto mt-2 max-w-md text-white/70">Takes a minute to scan. Takes a lot longer to live down losing.</p>
        <Link href={start} className="mt-6 inline-block rounded-xl bg-hit px-6 py-3.5 font-semibold text-white hover:brightness-110">
          {session ? "Scan a fighter" : "Create your account"}
        </Link>
      </section>
    </div>
  );
}
