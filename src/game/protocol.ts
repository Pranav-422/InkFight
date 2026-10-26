import type { ArenaId } from "./arena";
import type { Input, Slot, Snapshot } from "./sim";

// The five constellations of Arena 1's opening ceremony: each fighter locks one, and it grants a skill for the whole fight
// (src/game/arena.ts: ARENA_TUNE.stars). The pick lives in the match (`Snapshot.arena.pick`), which is what a guest and a resumed
// match read; the lobby has nothing to carry because the pick is made inside the fight, after both players have readied.
export type ConstellationId = "phoenix" | "hare" | "tortoise" | "serpent" | "comet";

export type PublicFighter = {
  id: string;
  name: string;
  class: string;
  imageUrl: string;
  specialMove: string;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  agi?: number; // AGI: jump, air control, hit recovery
  iq?: number; // IQ: energy gain, magic damage
  element?: string; // status effect on special hits (src/lib/stats.ts ELEMENTS)
  item?: string | null; // held item; null → from class
  pose?: string | null; // JSON keypoints from vision (see src/lib/vision.ts)
  rotation?: number; // degrees clockwise to stand the drawing upright
  specialKind?: string | null; // special-move building block (moves.ts); null → class default
  ultMove?: string; // the ultimate's name
  ultKind?: string | null; // ultimate building block; null → class default
  style?: string | null; // fighting style; null → class default
  sideSkill?: string | null; // side skill (moves.ts SIDE_SKILLS); null → class default
  flipItem?: boolean; // the held item is drawn upside down: swap grip and tip
  buff?: boolean; // admin buff: hits harder, takes less; such fights aren't recorded
};

export type LobbyPlayer = PublicFighter & { ready: boolean; rematch: boolean };

export type RoomStatus = "lobby" | "playing" | "over";

export type Lobby = {
  code: string;
  you: Slot;
  players: [LobbyPlayer | null, LobbyPlayer | null];
  status: RoomStatus;
  notice?: string;
  mode?: ArenaId; // the host's pick: an arena fight (src/game/arena.ts) instead of the normal best-of-3
};

// Guest → host (over the WebRTC data channels). The host applies its own actions locally.
// `sync` is only sent after a host-drop reconnect: the guest replies with its current match
// snapshot so the returning host can resume the fight as the authoritative sim.
export type ClientMsg = { t: "input"; input: Input } | { t: "ready"; ready: boolean } | { t: "rematch" } | { t: "sync"; s: Snapshot };

// Host → guest.
// `n` counts snapshots within a match so the guest can drop late ones.
// `reqsync` is sent by a returning host to ask the guest for its current match state so the
// host can resume the fight without restarting from scratch.
export type HostMsg = { t: "lobby"; lobby: Lobby } | { t: "snap"; s: Snapshot; n: number } | { t: "reqsync" };

export const ROOM_CODE = /^[A-Z0-9]{4,8}$/;

export function newRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I confusion
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
