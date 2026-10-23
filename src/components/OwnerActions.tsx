"use client";

import { Check, Loader2, Pencil, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

// Rename / delete for the fighter's owner (shown on cards and the character page).
export function OwnerActions({ id, name, afterDelete }: { id: string; name: string; afterDelete?: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(method: "PATCH" | "DELETE", body?: object) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/characters/${id}`, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "That didn't work.");
      return false;
    }
    return true;
  }

  const btn = "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold ring-1 ring-line hover:ring-ink disabled:opacity-50";
  return (
    <div className="mt-2 grid gap-1">
      {editing ? (
        <form
          className="flex items-center gap-1"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await call("PATCH", { name: value })) {
              setEditing(false);
              router.refresh();
            }
          }}
        >
          <input
            autoFocus
            value={value}
            maxLength={32}
            onChange={(e) => setValue(e.target.value)}
            aria-label="Fighter name"
            className="min-w-0 flex-1 rounded-lg bg-paper px-2 py-1.5 text-sm ring-1 ring-line outline-none focus:ring-ink"
          />
          <button disabled={busy} className={btn} title="Save name">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          </button>
          <button type="button" onClick={() => setEditing(false)} className={btn} title="Cancel">
            <X className="size-3.5" />
          </button>
        </form>
      ) : (
        <div className="flex gap-1">
          <button onClick={() => setEditing(true)} className={btn}>
            <Pencil className="size-3.5" /> Rename
          </button>
          <button
            disabled={busy}
            onClick={async () => {
              if (!window.confirm(`Delete ${name} for good? Its fight record goes too.`)) return;
              if (await call("DELETE")) {
                if (afterDelete) router.push(afterDelete);
                else router.refresh();
              }
            }}
            className={`${btn} text-hit`}
          >
            <Trash2 className="size-3.5" /> Delete
          </button>
        </div>
      )}
      {error && <p className="text-xs text-hit">{error}</p>}
    </div>
  );
}
