"use client";

import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

// Back on every page except the two start pages. With no history to go back to
// (a shared link, or the installed app opening straight on a page), go home instead.
export function BackButton({ home }: { home: string }) {
  const router = useRouter();
  const path = usePathname();
  if (path === "/" || path === "/home") return null;
  return (
    <button
      onClick={() => (window.history.length > 1 ? router.back() : router.push(home))}
      className="-ml-1.5 rounded-full p-1.5 text-muted hover:bg-ink/5 hover:text-ink"
      title="Back"
    >
      <ArrowLeft className="size-5" />
      <span className="sr-only">Back</span>
    </button>
  );
}
