import { UploadDropzone } from "@/components/UploadDropzone";
import { ROOM_CODE } from "@/game/protocol";
import { requireUser } from "@/lib/auth";
import { hasApiKey } from "@/lib/vision";

const TIPS = [
  ["Dark lines", "Pen or marker beats a faint pencil."],
  ["Good light", "No phone shadow across the page."],
  ["Plain paper", "One figure, nothing busy behind it."],
  ["Give it gear", "Book → Mage. Sword → Warrior. Nothing → Brawler."],
];

export default async function CreatePage({ searchParams }: PageProps<"/create">) {
  const { room } = await searchParams;
  const returnRoom = typeof room === "string" && ROOM_CODE.test(room) ? room : undefined;
  const user = await requireUser(returnRoom ? `/create?room=${returnRoom}` : "/create");

  return (
    <div className="grid gap-10 md:grid-cols-[1.3fr_1fr] md:items-start">
      <section>
        <p className="text-sm text-muted">Hey {user.name} 👋</p>
        <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight">Scan a new fighter</h1>
        <p className="mt-2 max-w-md text-muted">
          Snap a photo of your doodle. We read what you drew — size, pose, what it&apos;s holding — and turn it into a fighter.
        </p>
        {returnRoom && (
          <p className="mt-4 rounded-xl bg-gold/20 px-4 py-3 text-sm font-medium">
            Room {returnRoom} is waiting. Make your fighter and you&apos;ll go straight back.
          </p>
        )}
        <div className="mt-6">
          <UploadDropzone returnRoom={returnRoom} />
        </div>
        {!hasApiKey() && (
          <p className="mt-3 text-xs text-muted">
            Running in offline mode — stats come from a deterministic generator. Add <code>ANTHROPIC_API_KEY</code> for real
            drawing analysis.
          </p>
        )}
      </section>

      <aside className="rounded-2xl bg-card p-5 ring-1 ring-line">
        <h2 className="font-display text-xl font-extrabold">What makes a good scan</h2>
        <ul className="mt-4 grid gap-4">
          {TIPS.map(([title, body], i) => (
            <li key={title} className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">
                {i + 1}
              </span>
              <div>
                <p className="font-semibold">{title}</p>
                <p className="text-sm text-muted">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
