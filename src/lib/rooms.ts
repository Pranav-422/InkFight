import "server-only";
import type { Character, Room } from "@prisma/client";
import type { PublicFighter } from "@/game/protocol";

export const ROOM_TTL_MS = 3 * 60 * 60 * 1000;

export const isStale = (r: Room) => Date.now() - r.updatedAt.getTime() > ROOM_TTL_MS;

export function publicFighter(c: Character): PublicFighter {
  return {
    id: c.id,
    name: c.name,
    class: c.class,
    imageUrl: c.imageUrl,
    specialMove: c.specialMove,
    hp: c.hp,
    atk: c.atk,
    def: c.def,
    spd: c.spd,
  };
}
