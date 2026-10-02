# Inkfight

Draw a stick figure on paper and take a photo of it. The drawing becomes **your fighter on a canvas**, and you control it live against a friend who is playing on their own device. Your fighter's power comes from what you drew: what it holds, how big it is, its pose and its colors. Every match result goes to a shared leaderboard.

**Live:** https://inkfight.vercel.app

Demo accounts (created by `prisma/seed.ts`, each with a starter fighter):

| Email | Password |
|---|---|
| demo1@inkfight.app | inkfight123 |
| demo2@inkfight.app | inkfight123 |

## Run it locally

```bash
npm install
npx prisma dev -n inkfight-local --detach   # local Postgres; put its TCP URL in .env (add &pgbouncer=true)
npx prisma migrate deploy && npm run seed
npm run dev                                  # http://localhost:3001
```

`.env` needs `DATABASE_URL`, `DATABASE_URL_UNPOOLED` and `AUTH_SECRET` (see `.env.example`). Locally, uploads go to `./uploads`. If `BLOB_READ_WRITE_TOKEN` is set, they go to Vercel Blob instead. For real drawing analysis, add `ANTHROPIC_API_KEY`. Without it, a deterministic offline generator creates the fighter.

## Deploy (Vercel)

The Vercel project `inkfight` has a Neon Postgres database (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`) and a public Blob store (`BLOB_READ_WRITE_TOKEN`), plus `AUTH_SECRET`. `npx vercel deploy --prod` runs the `vercel-build` script: migrate, seed the demo accounts (idempotent), then build.

## How online play works

Vercel can't keep WebSockets open, so the server only handles **matchmaking**: the room creator's browser posts a WebRTC offer to `/api/rooms/[code]`, the friend posts an answer, and from then on the two browsers talk **directly** over WebRTC data channels. The host's browser runs the authoritative 60 Hz simulation (`src/game/sim.ts`) and streams snapshots to the guest, exactly like a game server would. After the match it reports the result to `/api/battles`.

- The host must keep their tab open during the match.
- Some strict networks (often mobile data, or corporate Wi-Fi) block direct peer-to-peer connections. Add a TURN server via `NEXT_PUBLIC_ICE_SERVERS` (a JSON array of RTCIceServer) to cover those cases.

## How to play

1. **New fighter**: upload a photo of your drawing.
2. **Fight a friend → Create room**: send your friend the link or the room code.
3. Your friend opens the link and picks or draws a fighter. When both players press **I'm ready**, the fight starts. The first to win 2 rounds wins the match.

| | Keyboard | Phone |
|---|---|---|
| Move | A / D (or ← →) | ◀ ▶ |
| Jump | W / ↑ / Space | ▲ |
| Attack | J | HIT |
| Block (hold) | K | 🛡 |
| Special (meter full) | L | ★ |

## Drawing → power

| Stat | In the game |
|---|---|
| HP | Health |
| ATK | Punch damage (4–10 per hit) |
| DEF | Less damage taken (up to −30%), and blocks absorb 55–90% |
| SPD | Run speed, jump height, attack rate |
| Class (from the held item) | Special move: Mage → magic bolt, Ranger → arrow, Caster → heavy orb, Warrior → dash slash, Tank → shield charge + armor, Brawler → launcher uppercut |

Hitting, getting hit and time all fill the special meter. Each fighter's page has a "How it fights" panel with the exact numbers.

## Architecture

| Piece | File |
|---|---|
| Authoritative 60 Hz fight simulation (pure TS) | `src/game/sim.ts` |
| P2P rooms: signaling, host loop, ready/rematch | `src/game/useGameRoom.ts`, `src/app/api/rooms/**` |
| Login (bcrypt + signed cookie) | `src/lib/auth.ts`, `src/app/(auth)/**` |
| Wire protocol | `src/game/protocol.ts` |
| Drawing → transparent sprite (removes the paper, crops to the ink) | `src/game/sprite.ts` |
| Canvas renderer (interpolation, squash/stretch, FX, HUD) | `src/game/render.ts` |
| Canvas + keyboard/touch controls | `src/components/GameCanvas.tsx` |
| Vision analysis + rule-based stats | `src/lib/vision.ts`, `src/lib/stats.ts` |

The host sends snapshots 30 times per second. The guest only sends inputs and draws what it receives, so both players always see the same fight. Jump, attack and special presses are sent as counters, so a quick tap between two packets is still registered.
