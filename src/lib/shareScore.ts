// Scores in share links and stored battles. No server-only code here, so scripts/check-share.ts can run it.

// A final score of a match (first to WINS_NEEDED = 2 rounds): "2" and "0" or "1", either way round. Anything else is refused.
export function parseScore(a: unknown, b: unknown): [number, number] | null {
  const x = Number(a), y = Number(b);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x > 2 || y > 2 || x + y < 2 || x === y || Math.max(x, y) !== 2) return null;
  return [x, y];
}

// Rounds won by A and B from a stored battle's log; a log without them is shown as 2 to 0 for the winner.
export function battleScore(log: string, aWon: boolean): [number, number] {
  try {
    const w = (JSON.parse(log) as { wins?: number[] }).wins;
    const s = parseScore(w?.[0], w?.[1]);
    if (s) return s;
  } catch {}
  return aWon ? [2, 0] : [0, 2];
}
