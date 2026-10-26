"use client";

import { Download } from "lucide-react";
import { useEffect, useState } from "react";

// Chrome/Edge/Android fire `beforeinstallprompt` when the app can be installed.
// Show our own button for it (iPhone users use Share → Add to Home Screen).
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function InstallButton() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => setPrompt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  if (!prompt) return null;
  return (
    <button
      onClick={async () => {
        await prompt.prompt();
        await prompt.userChoice;
        setPrompt(null);
      }}
      title="Install app"
      aria-label="Install app"
      className="mr-1 inline-flex items-center gap-1 rounded-full bg-gold/30 px-3 py-1.5 font-semibold whitespace-nowrap hover:bg-gold/50"
    >
      <Download className="size-3.5" />
      <span className="sm:hidden">App</span>
    </button>
  );
}
