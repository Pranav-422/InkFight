import "server-only";
import type { Character, Room } from "@prisma/client";
import type { PublicFighter } from "@/game/protocol";

export const ROOM_TTL_MS = 3 * 60 * 60 * 1000;

export const isStale = (r: Room) => Date.now() - r.updatedAt.getTime() > ROOM_TTL_MS;

// buff: the seat's player is an admin with the buff on (decided on the server, never sent by a client).
export function publicFighter(c: Character, buff = false): PublicFighter {
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
    agi: c.agi,
    iq: c.iq,
    element: c.element,
    item: c.item,
    pose: c.pose,
    rotation: c.rotation,
    flipItem: c.flipItem,
    specialKind: c.specialKind,
    ultMove: c.ultName,
    ultKind: c.ultKind,
    style: c.style,
    sideSkill: c.sideSkill,
    ...(buff && { buff }),
  };
}
