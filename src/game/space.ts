// The fighting space: tick rate and the shapes every other file measures against. A leaf module (sim.ts re-exports
// these), so arena.ts can use them without importing the sim.

export const TICK_HZ = 60;
export const ARENA = { w: 960, h: 540, ground: 480, wall: 30 };
export const BODY = { w: 70, h: 170 };
