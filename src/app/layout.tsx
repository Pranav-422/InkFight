import { LogOut } from "lucide-react";
import type { Metadata, Viewport } from "next";
import { Bangers, Lilita_One, Manrope } from "next/font/google";
import Link from "next/link";
import { BackButton } from "@/components/BackButton";
import { InstallButton } from "@/components/InstallButton";
import { SoundToggle } from "@/components/SoundSwitch";
import { TabBar } from "@/components/TabBar";
import { getSession, isAdmin } from "@/lib/auth";
import { logout } from "./(auth)/actions";
import "./globals.css";

// Lilita One for headings and buttons, Bangers only for comic moments (logo, VS, K.O.), Manrope for reading.
const display = Lilita_One({ variable: "--font-display", subsets: ["latin"], weight: "400" });
const comic = Bangers({ variable: "--font-comic", subsets: ["latin"], weight: "400" });
const body = Manrope({ variable: "--font-body", subsets: ["latin"], weight: ["500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "Inkfight",
  description: "Draw a stick figure. Scan it. Make it fight.",
  applicationName: "Inkfight",
  appleWebApp: { capable: true, title: "Inkfight", statusBarStyle: "default" },
  icons: { icon: "/pwa-icon/192", apple: "/pwa-icon/180" },
};

export const viewport: Viewport = { themeColor: "#fff9ed", viewportFit: "cover" };

type NavItem = { href: string; label: string; short?: string; desktopOnly?: boolean };
const NAV_IN: NavItem[] = [
  { href: "/home", label: "Home" },
  { href: "/create", label: "New fighter", desktopOnly: true },
  { href: "/play", label: "Fight a friend", short: "Fight" },
  { href: "/play/dungeon", label: "Dungeon", desktopOnly: true },
  { href: "/gallery", label: "Gallery", desktopOnly: true },
  { href: "/leaderboard", label: "Leaderboard", short: "Ranks" },
];
const NAV_OUT: NavItem[] = [
  { href: "/gallery", label: "Gallery" },
  { href: "/leaderboard", label: "Leaderboard", short: "Ranks" },
];

const linkCls = "px-2.5 py-1.5 text-sm font-bold text-muted whitespace-nowrap hover:bg-gold hover:text-ink sm:px-3";

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await getSession();
  return (
    <html lang="en" className={`${display.variable} ${comic.variable} ${body.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <header className="sticky top-0 z-20 border-b-[3px] border-ink bg-paper">
          <nav className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3 sm:gap-4">
            <BackButton home={session ? "/home" : "/"} />
            <Link href={session ? "/home" : "/"} className="font-comic text-3xl leading-none tracking-wide [text-shadow:2px_2px_0_var(--gold)]">
              Ink<span className="text-hit">fight</span>
            </Link>
            <div className="ml-auto flex items-center text-sm sm:gap-1">
              <InstallButton />
              <SoundToggle />
              {(session ? NAV_IN : NAV_OUT).map((n) => (
                <Link key={n.href} href={n.href} className={`${linkCls} ${n.desktopOnly || session ? "hidden lg:block" : ""}`}>
                  {n.short ? (
                    <>
                      <span className="sm:hidden">{n.short}</span>
                      <span className="hidden sm:inline">{n.label}</span>
                    </>
                  ) : (
                    n.label
                  )}
                </Link>
              ))}
              {isAdmin(session) && (
                <Link href="/admin" className={`${linkCls} font-semibold text-hit`}>
                  Admin
                </Link>
              )}
              {session ? (
                <form action={logout} className="ml-1 flex items-center gap-2">
                  <Link href={`/player/${session.userId}`} title={session.email} className="flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-full bg-ink font-display text-sm font-extrabold text-white">
                      {session.name.slice(0, 1)}
                    </span>
                    <span className="hidden max-w-24 truncate font-semibold 2xl:inline">{session.name}</span>
                  </Link>
                  <button title="Log out" className="rounded-full p-1.5 text-muted hover:bg-ink/5 hover:text-ink">
                    <LogOut className="size-4" />
                    <span className="sr-only">Log out</span>
                  </button>
                </form>
              ) : (
                <>
                  <Link href="/login" className={linkCls}>
                    Log in
                  </Link>
                  <Link href="/signup" className="ml-1 rounded-full bg-ink px-3.5 py-1.5 font-semibold whitespace-nowrap text-white hover:bg-ink/85">
                    Sign up
                  </Link>
                </>
              )}
            </div>
          </nav>
        </header>
        <main className={`mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8 ${session ? "pb-28 lg:pb-8" : ""}`}>{children}</main>
        {session && <TabBar />}
      </body>
    </html>
  );
}
