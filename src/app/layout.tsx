import { LogOut } from "lucide-react";
import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { logout } from "./(auth)/actions";
import "./globals.css";

const display = Bricolage_Grotesque({ variable: "--font-display", subsets: ["latin"], weight: ["600", "800"] });
const body = Inter({ variable: "--font-body", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Inkfight",
  description: "Draw a stick figure. Scan it. Make it fight.",
};

const NAV = [
  { href: "/create", label: "New fighter", desktopOnly: true },
  { href: "/play", label: "Fight a friend", short: "Fight" },
  { href: "/gallery", label: "Gallery", desktopOnly: true },
  { href: "/leaderboard", label: "Leaderboard", short: "Ranks" },
];

const linkCls = "rounded-full px-2.5 py-1.5 text-muted whitespace-nowrap hover:bg-ink/5 hover:text-ink sm:px-3";

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await getSession();
  return (
    <html lang="en" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <header className="border-b border-line bg-paper/90 backdrop-blur sticky top-0 z-20">
          <nav className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
            <Link href="/" className="font-display text-2xl font-extrabold tracking-tight">
              ink<span className="text-hit">fight</span>
            </Link>
            <div className="ml-auto flex items-center text-sm sm:gap-1">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className={`${linkCls} ${n.desktopOnly ? "hidden md:block" : ""}`}>
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
              {session ? (
                <form action={logout} className="ml-1 flex items-center gap-2">
                  <span
                    title={session.email}
                    className="flex size-8 items-center justify-center rounded-full bg-ink font-display text-sm font-extrabold uppercase text-white"
                  >
                    {session.name.slice(0, 1)}
                  </span>
                  <span className="hidden max-w-28 truncate font-semibold lg:inline">{session.name}</span>
                  <button title="Log out" className="rounded-full p-1.5 text-muted hover:bg-ink/5 hover:text-ink">
                    <LogOut className="size-4" />
                    <span className="sr-only">Log out</span>
                  </button>
                </form>
              ) : (
                <Link href="/login" className="ml-1 rounded-full bg-ink px-3.5 py-1.5 font-semibold whitespace-nowrap text-white hover:bg-ink/85">
                  Log in
                </Link>
              )}
            </div>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
