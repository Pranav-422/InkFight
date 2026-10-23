# InkFight: project memory (chat 1 on 2026-10-02, chat 2 on 2026-10-11, chat 3 on 2026-10-23)

Read this first in a new chat. It explains what was built, why it's built this way, and what's still open.

## What it is

You draw a stick figure on paper, photograph it, and upload it. Your drawing becomes a fighter on a canvas that **you control live** (move, jump, attack, block, special) against a friend playing **online on their own device**. Power comes from the drawing: the held item picks the class, size/pose/colors adjust stats. Results go to a shared leaderboard.

- **Live:** https://inkfight.vercel.app
- **GitHub:** https://github.com/Pranav-422/InkFight (branch `main`)
- **Original specs:** `PRD.md`, `TECH_SPEC.md`, `DESIGN_BRIEF.md`. We've diverged from them, see "History".

## Demo accounts (seeded by `prisma/seed.ts`, each has a starter fighter)

| Email | Password | Handle | Starter |
|---|---|---|---|
| demo1@inkfight.app | inkfight123 | InkNinja | Sir Scribbles (Warrior) |
| demo2@inkfight.app | inkfight123 | DoodleDon | Margin Mage (Mage) |

To fight yourself, use the **split-screen test match** at `/play/test` (chat 3), or one normal window + one incognito window. Tabs in the same browser share one login cookie.

## History (why things are the way they are)

1. **v1 followed the spec:** auto-battle (deterministic engine, AI narration, CSS animation). The user rejected it ("galti hai"). They want to *play*, not watch.
2. **v2 was real-time PvP** with a custom Node WebSocket server (`server.ts`). The user picked: **online on separate devices** and **the whole drawing as the sprite** (no limb rigging).
3. **v3 (current):** the user wanted **Vercel only** and has only GitHub (Vercel login via the CLI already works). Vercel can't hold WebSockets, so I rewrote multiplayer as **WebRTC peer-to-peer**. Also added **login/signup**, a **landing page**, Postgres and Vercel Blob. The WebSocket server and `ws` are gone.
4. **Fixed bugs:**
   - **LAN IP showed a dead page:** Next 16 dev blocks cross-origin dev assets. Fixed with `allowedDevOrigins` in `next.config.ts`.
   - **Two accounts in one browser:** when both players were tabs of one browser, the second tab silently stayed account #1, re-hosted the room and nobody connected.
     - Login/signup now show "already logged in as X → log out and switch".
     - A BroadcastChannel check blocks opening the same room in two tabs.
     - Switching accounts in another tab is detected.

## Chat 2 additions (2026-10-11)

- **Vs computer** (`/play/cpu`):
  - Pick your fighter, any gallery fighter for the CPU, and Easy/Normal/Hard. Runs fully in the browser (`src/game/useCpuMatch.ts`); the AI is in `src/game/cpu.ts`.
  - The AI reacts with a delay, blocks, dodges projectiles and uses specials.
  - CPU matches are **not** saved to the leaderboard.
  - Entry points: a card on `/play`, and on character pages ("practice vs computer" for your own fighter, "Fight X vs computer" for others').
- **Controller console** (`src/components/Controller.tsx`):
  - An on-screen gamepad with a D-pad and PUNCH / KICK / BLOCK / SPECIAL buttons. The special button fills with the energy meter.
  - Shown on desktop and phone. Buttons light up when you press keys too.
  - Real gamepads work through the Gamepad API (A jump, X punch, Y kick, B special, LB/RB/LT block, D-pad/stick move).
  - **Keys changed:** A/D move, W jump, **S block**, J punch, **K kick**, L special.
- **Kick**: new move in `sim.ts` (`KICK`: slower, longer reach, low hit, 1.5× damage). Input has a `kick` counter.
- **Puppet animation**:
  - `src/game/skeleton.ts` does joints → triangle mesh → bone skinning → per-frame deformation, drawn as texture-mapped triangles.
  - `src/game/poses.ts` holds the per-state limb targets: punch, kick, walk, jump, block, hit, specials, KO topple.
  - **Joints source:** Claude Vision keypoints (`Character.pose`, new `pose` field in the vision schema) when there's an API key. Otherwise the browser estimates them from the ink (head = top fifth, hip = where the legs merge, hands/feet = extremes).
  - **Props near the head:** the head bone only owns ink inside the head circle, so a sword next to it doesn't bend.
- **Sprite extraction rewritten** (`src/game/sprite.ts`):
  - It now uses local paper brightness, ignores dark non-paper areas (table), and keeps only the figure blob.
  - A second pass re-cuts the figure from the full-resolution photo, so small doodles stay sharp.
- **Rotation** (`Character.rotation`, 0/90/180/270):
  - The owner can rotate a sideways drawing on the character page (`RotateControl`, `PATCH /api/characters/[id]`).
  - Claude's `head_points` sets it automatically once there's an API key.
- **New migrations:** `character_pose` and `character_rotation`. They are applied on Vercel by `vercel-build`.
- **Known limit:** busy or scribbly drawings, like the user's "Crayon Supreme" photo with a big shield, rig poorly without Claude keypoints and look messy when they move. Clean stick figures animate well.

## Chat 3 additions (2026-10-23)

- **Dashboard `/home`:** greeting, W/L + best rank, quick actions, my fighters. Login/signup default to `/home`, and `/` redirects there when logged in. Nav: logged in = Home/New fighter/Fight/Gallery/Leaderboard; logged out = Gallery/Leaderboard/Log in/Sign up.
- **Invite fix:** a friend opening `/play/CODE` while logged out sees "Your friend challenged you → Sign up and scan my fighter" (→ `/create?room=CODE`), with **no demo accounts** shown. Before, they took a demo login and fought with the gallery starters. The room always shows the picker ("Scan a new fighter" first, last fighter only highlighted); `?fighter=` still skips it.
- **Split-screen test match `/play/test`:** a real room + WebRTC with both players in one tab. `POST /api/test-session` returns a 3h JWT for the *other* demo account; `getSession` accepts `Authorization: Bearer` before the cookie. `useGameRoom(code, fighter, user, { token, sameTab, record })`. Keys: P1 WASD + J/K/L, P2 arrows + 1/2/3. Not recorded on the leaderboard.
- **Clean stickman renderer (`src/game/stickman.ts`):** a fixed skeleton posed by `poses.ts`, drawn as strokes in the drawing's ink colour. The head is the drawing's head (circle crop, `sprite.ts` `cutHead`), plus a class item in the hand. Specials glow red with afterimages, armor glows blue. The photo-mesh puppet (`buildRig`/`drawRig` in `skeleton.ts`) is no longer used. `estimateJoints` now finds the head on the spine column, so a raised sword isn't the head.
- **Real offline stats:** `measureDrawing`/`measureInk` (`sprite.ts`) measure fill, aspect, stance, arm spread, ink hues, and guess the item (sword/staff/bow/shield/book/nothing). The create page shows "Holding: [guess ▾]" for the user to confirm. Server validates with zod (`features` form field). `featuresFromMeasurements` + 2 new rules (Wide stance +DEF, Arms out +ATK). The hash now only picks name/special. "Why these stats" shows the measured numbers. With a Claude key, Claude's items win when it sees one.
- **Fixes:** RoomClient memoizes `players` (the renderer was rebuilt on every lobby update). The guest drops late snapshots (`n` seq in `HostMsg`). `/create?next=/play/cpu|/play/test` returns there. Camera button on upload (`capture="environment"`).
- **Self-check:** `npx tsx scripts/check-stats.ts` (stat mapping + synthetic drawings).
- **Known limits:** item guess is a heuristic (user confirms). Sideways photos are measured before rotation, so their aspect/arm numbers are off.

## Architecture

| Piece | File(s) |
|---|---|
| Fight simulation, 60 Hz, pure TS, authoritative | `src/game/sim.ts` (`deriveDef` = stats → physics) |
| P2P room: signaling + host loop + guest | `src/game/useGameRoom.ts` |
| Wire types, room codes | `src/game/protocol.ts` |
| Signaling APIs (offer/answer in the `Room` table) | `src/app/api/rooms/[code]/route.ts`, `.../answer/route.ts` |
| Match result (host reports, deduped by `matchKey`) | `src/app/api/battles/route.ts` |
| Drawing → head crop + ink colour; drawing measurements (stats) | `src/game/sprite.ts` |
| Stickman body (FK skeleton, class items) | `src/game/stickman.ts` |
| Canvas renderer (interpolation, squash/stretch, FX, HUD) | `src/game/render.ts` |
| Canvas + keyboard/touch controls | `src/components/GameCanvas.tsx` |
| Room UI (picker, lobby, invite, result) | `src/app/play/[code]/RoomClient.tsx` |
| Vision analysis (Claude, structured output) + offline fallback | `src/lib/vision.ts` |
| Rule-based stats: item→class, caps, 70% rules / 30% AI blend | `src/lib/stats.ts` |
| Auth: bcryptjs + jose JWT cookie `inkfight_session` | `src/lib/auth.ts`, `src/app/(auth)/*` |
| Storage: Vercel Blob if `BLOB_READ_WRITE_TOKEN`, else `./uploads` | `src/lib/storage.ts` |
| Pages | `/` landing, `/home`, `/login`, `/signup`, `/create` (upload), `/play`, `/play/[code]`, `/play/cpu`, `/play/test`, `/demo`, `/character/[id]`, `/gallery`, `/leaderboard` |

**How P2P works:**
1. The room creator's browser is the **host**: it runs the sim and streams snapshots at 30/s.
2. The guest sends inputs. Jump/attack/special are counters, so quick taps survive packet loss.
3. Channels: `ctl` (reliable) and `game` (unordered, `maxRetransmits:0`).
4. Non-trickle ICE, with Google + Cloudflare STUN only.
5. The host must keep its tab open.

**Stack:** Next.js 16.3 (App Router, **async params**, `PageProps`/`RouteContext` globals; read `node_modules/next/dist/docs/` before coding, per AGENTS.md), React 19, Tailwind v4, Prisma 6 + PostgreSQL, `@anthropic-ai/sdk` (`claude-opus-5-5`, `client.beta.messages.parse` + `betaZodOutputFormat`, `fallbacks: "default"`), lucide-react.

**Design:**
- Colors: paper `#f7f5f0`, ink `#17171a`, accents hit `#e5482d`, guard `#2f5be0`, gold `#f2b705`.
- Fonts: Bricolage Grotesque (display) and Inter.
- Copy tone: playful trash-talk.

## Hosting (Vercel team `unhinged1`, project `inkfight`)

- **Neon Postgres** (`inkfight-db`) → `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (Prisma `directUrl`).
- **Blob store** `inkfight-drawings` (public) → `BLOB_READ_WRITE_TOKEN`.
- **`AUTH_SECRET`** is set for production and preview.
- **Build:** the `vercel-build` script runs `prisma migrate deploy && tsx prisma/seed.ts && next build`.
- **Deploy:** `npx vercel deploy --prod --yes`. The upload often fails with `fetch failed` on this network; just retry, it resumes. The repo is **not** linked for auto-deploy on push.

## Local dev

- **Database:** local Postgres via `npx prisma dev -n inkfight-local --detach` (port 51218, db `template1`). `.env` URLs need `&pgbouncer=true`, otherwise you get "prepared statement already exists".
- **Commands:** `npm run dev` → http://localhost:3001. Run `npm run seed` for the demo users.
- **`.env.local`:** created by `vercel link`. It has `VERCEL_OIDC_TOKEN`. I removed `BLOB_READ_WRITE_TOKEN` from it on purpose, so local uploads stay in `./uploads`.
- **Old SQLite data:** kept as `prisma/sqlite-backup.db`. The user's own 2 "Crayon Supreme" fighters were imported into the *local* DB only (owner demo1). Their images are in `./uploads`, so they aren't on prod.

## Gotchas learned

- **Port 3000** is often the user's other project, Safe Bite AI (`D:\SafebiteAi`). InkFight uses **3001**.
- **Orphaned servers:** on Windows, background dev servers can outlive their task. Check `Get-NetTCPConnection -LocalPort 3001` and kill the leftover PID.
- **Prisma resets:** `prisma migrate reset` refuses without explicit user consent (an AI guard). Don't bypass it; use a new `prisma dev` instance instead.
- **One instance per folder:** Next 16 refuses to start a second `next dev` in the same folder.
- **Neon CLI leftovers:** the Neon install added `.agents/`, `.claude/` and `skills-lock.json`. They are excluded from git and Vercel deploys but not deleted.
- **Git identity:** only set locally in this repo, `Pranav-422 <Pranav-422@users.noreply.github.com>`. Commits end with a Claude co-author line.

## Open items / ideas

- **TURN server:** P2P fails on strict networks (some mobile data / corporate). Add one via the `NEXT_PUBLIC_ICE_SERVERS` env (JSON array). Free option: metered.ca, which needs a signup.
- **Claude Vision key:** `ANTHROPIC_API_KEY` is not set anywhere yet, so fighters come from the offline generator. Real analysis has never been tested.
- **Auto-deploy:** link the GitHub repo to the Vercel project so pushes deploy.
- **Possible next steps:** sound effects, a mid-match reconnect for the guest, a host-migration-free rematch flow, more classes, shareable result cards.

## User preferences

- Talks in Hinglish, so reply in Hinglish. Keep it short and concrete.
- Wants things actually running and verified, with screenshots/tests, not just written.
- Ask before hard-to-reverse or account-level actions (legal terms, deleting data). Hosting on Vercel and pushing to GitHub were explicitly approved.
