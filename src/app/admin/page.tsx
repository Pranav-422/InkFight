import { notFound } from "next/navigation";
import { isAdmin, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminDesigns, type AdminDesign } from "./AdminDesigns";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Inkfight" };

const dayAgo = () => new Date(Date.now() - 24 * 60 * 60 * 1000);

// Admin only (ADMIN_EMAILS). Everyone else gets a plain 404, so the page isn't advertised.
export default async function AdminPage() {
  const s = await requireUser("/admin");
  if (!isAdmin(s)) notFound();

  const [chars, users, battles, newToday] = await Promise.all([
    db.character.findMany({ orderBy: { createdAt: "desc" }, include: { owner: { select: { email: true } } } }),
    db.user.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true, email: true, createdAt: true, _count: { select: { characters: true } } } }),
    db.battle.count(),
    db.character.count({ where: { createdAt: { gte: dayAgo() } } }),
  ]);
  const designs: AdminDesign[] = chars.map((c) => {
    let source = "?";
    try {
      source = JSON.parse(c.detectedItems).source ?? "?";
    } catch {}
    return {
      id: c.id,
      name: c.name,
      imageUrl: c.imageUrl,
      class: c.class,
      style: c.style,
      specialKind: c.specialKind,
      specialMove: c.specialMove,
      pose: c.pose,
      rotation: c.rotation,
      stats: `${c.atk} ATK · ${c.def} DUR · ${c.spd} SPD`,
      owner: c.ownerHandle,
      ownerEmail: c.owner?.email ?? "(deleted user)",
      ownerId: c.ownerId,
      createdAt: c.createdAt.toISOString(),
      source,
      cpu: c.cpu,
      hidden: c.hidden,
    };
  });

  return (
    <div className="grid gap-8">
      <section>
        <p className="text-xs font-semibold uppercase tracking-widest text-hit">Admin</p>
        <h1 className="font-display text-3xl font-extrabold">Designs & players</h1>
        <dl className="mt-4 flex flex-wrap gap-2">
          {[
            ["Designs", chars.length],
            ["New in 24h", newToday],
            ["Players", users.length],
            ["Fights recorded", battles],
            ["Computer roster", chars.filter((c) => c.cpu && !c.hidden).length],
            ["Hidden", chars.filter((c) => c.hidden).length],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-card px-4 py-2.5 ring-1 ring-line">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">{k}</dt>
              <dd className="font-display text-2xl font-extrabold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <AdminDesigns designs={designs} />

      <section>
        <h2 className="font-display text-2xl font-extrabold">Players</h2>
        <div className="mt-3 overflow-x-auto rounded-2xl bg-card ring-1 ring-line">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-2">Handle</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Designs</th>
                <th className="px-4 py-2">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2 font-semibold">
                    <a href={`/player/${u.id}`} className="hover:underline">
                      @{u.name}
                    </a>
                  </td>
                  <td className="px-4 py-2">{u.email}</td>
                  <td className="px-4 py-2 tabular-nums">{u._count.characters}</td>
                  <td className="px-4 py-2 text-muted">{u.createdAt.toLocaleString("en-GB")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
