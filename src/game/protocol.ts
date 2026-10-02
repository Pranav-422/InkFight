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
export type HostMsg = { t: "lobby"; lobby: Lobby } | { t: "snap"; s: Snapshot };

export const ROOM_CODE = /^[A-Z0-9]{4,8}$/;

export function newRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I confusion
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
