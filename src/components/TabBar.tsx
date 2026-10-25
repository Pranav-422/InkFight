"use client";

import { Castle, Home, Plus, Swords, Trophy, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Phones only (logged in): the main places one thumb away. Hidden while a fight runs (GameCanvas sets body[data-fight]).
const TABS: [string, string, LucideIcon, (p: string) => boolean][] = [
  ["/home", "Home", Home, (p) => p === "/home"],
  ["/play", "Fight", Swords, (p) => p === "/play" || p.startsWith("/play/cpu") || /^\/play\/[A-Z0-9]{4,8}$/.test(p)],
  ["/create", "New", Plus, (p) => p === "/create" || p === "/build"],
  ["/play/dungeon", "Dungeon", Castle, (p) => p.startsWith("/play/dungeon")],
  ["/leaderboard", "Ranks", Trophy, (p) => p === "/leaderboard" || p === "/gallery"],
];

export function TabBar() {
  const path = usePathname();
  return (
    <nav className="tabbar fixed inset-x-0 bottom-0 z-30 border-t-[3px] border-ink bg-paper pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {TABS.map(([href, label, Icon, on]) => {
          const active = on(path);
          if (href === "/create") {
            return (
              <li key={href} className="flex justify-center">
                <Link
                  href={href}
                  aria-label="New fighter"
                  className="press sticker -mt-5 flex size-14 items-center justify-center bg-gold text-ink"
                >
                  <Plus className="size-7" strokeWidth={2.6} />
                </Link>
              </li>
            );
          }
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 font-display text-[10px] font-extrabold uppercase tracking-wider ${active ? "text-ink" : "text-muted"}`}
              >
                <span className={`px-3 py-0.5 ${active ? "bg-gold outline-2 outline-ink" : ""}`}>
                  <Icon className="size-5" strokeWidth={active ? 2.5 : 2} />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
