"use client";

import { useEffect } from "react";

// While `active`, ask before leaving the page: internal links, the header back button
// ([data-leave]), and closing or reloading the tab. Used for an unfinished design and
// a fight in progress.
export function useLeaveGuard(active: boolean, message: string) {
  useEffect(() => {
    if (!active) return;
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest("a[href], [data-leave]");
      if (!el || (el instanceof HTMLAnchorElement && (el.target === "_blank" || el.origin !== location.origin))) return;
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [active, message]);
}
