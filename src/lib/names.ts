// Fighter names typed by players: trimmed, single-spaced, no control or invisible
// characters, 2-32 long. Returns null when nothing usable is left.
export function cleanName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 32);
  return s.length >= 2 ? s : null;
}
