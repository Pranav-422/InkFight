import type { Input, Slot, Snapshot } from "./sim";

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
  pose?: string | null; // JSON keypoints from vision (see src/lib/vision.ts)
  rotation?: number; // degrees clockwise to stand the drawing upright
  specialKind?: string | null; // special-move building block (moves.ts); null → class default
  style?: string | null; // fighting style; null → class default
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
};

// Guest → host (over the WebRTC data channels). The host applies its own actions locally.
export type ClientMsg = { t: "input"; input: Input } | { t: "ready"; ready: boolean } | { t: "rematch" };

// Host → guest.
// `n` counts snapshots within a match so the guest can drop late ones.
export type HostMsg = { t: "lobby"; lobby: Lobby } | { t: "snap"; s: Snapshot; n: number };

export const ROOM_CODE = /^[A-Z0-9]{4,8}$/;

export function newRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I confusion
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
