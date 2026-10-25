// The host's pick for a room (a normal fight or an arena fight) is remembered per room code in this browser: the host
// may leave to scan a new fighter and come back to the room. A guest never reads it: the lobby the host sends carries the mode.
import { isArenaId, type ArenaId } from "@/game/arena";

const key = (code: string) => `inkfight-room-mode:${code}`;

export function saveRoomMode(code: string, mode: ArenaId | null) {
  try {
    if (mode) localStorage.setItem(key(code), mode);
    else localStorage.removeItem(key(code));
  } catch {}
}

export function readRoomMode(code: string): ArenaId | undefined {
  try {
    const v = localStorage.getItem(key(code));
    return isArenaId(v) ? v : undefined;
  } catch {
    return undefined;
  }
}
