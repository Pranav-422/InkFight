# InkFight: project memory (chats 1-5: 2026-10-02 to 2026-10-24)

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

To fight yourself, use one normal window + one incognito window (the split-screen test match was removed in chat 5). Tabs in the same browser share one login cookie.

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
- **Split-screen test match:** added here, **removed in chat 5** (with the bearer-token login) at the user's request.
- **Clean stickman renderer (`src/game/stickman.ts`):** a fixed skeleton posed by `poses.ts`, drawn as strokes in the drawing's ink colour. The head is the drawing's head (circle crop, `sprite.ts` `cutHead`), plus a class item in the hand. Specials glow red with afterimages, armor glows blue. The photo-mesh puppet (`buildRig`/`drawRig` in `skeleton.ts`) is no longer used. `estimateJoints` now finds the head on the spine column, so a raised sword isn't the head.
- **Real offline stats:** `measureDrawing`/`measureInk` (`sprite.ts`) measure fill, aspect, stance, arm spread, ink hues, and guess the item (sword/staff/bow/shield/book/nothing). The create page shows "Holding: [guess ▾]" for the user to confirm. Server validates with zod (`features` form field). `featuresFromMeasurements` + 2 new rules (Wide stance +DEF, Arms out +ATK). The hash now only picks name/special. "Why these stats" shows the measured numbers. With a Claude key, Claude's items win when it sees one.
- **Fixes:** RoomClient memoizes `players` (the renderer was rebuilt on every lobby update). The guest drops late snapshots (`n` seq in `HostMsg`). `/create?next=/play/cpu|/play/test` returns there. Camera button on upload (`capture="environment"`).
- **Self-check:** `npx tsx scripts/check-stats.ts` (stat mapping + synthetic drawings).
- **Known limits:** item guess is a heuristic (user confirms). Sideways photos are measured before rotation, so their aspect/arm numbers are off.

## Chat 4 additions (2026-10-23)

- **Moves (`src/game/moves.ts`):** 6 fighting styles (Boxing, Taekwondo, Muay Thai, Karate, Street, Systema; a nod to Lookism), each a punch chain + kick chain (tap again within `COMBO_WINDOW` to continue; late presses are buffered). 12 special building blocks: bolt, arrow, orb, beam (Kamehameha-style), wave, slash, charge, uppercut, spiral (Rasengan-style), teleport, barrage, meteor. Stored as `Character.specialKind` / `style` (migration `character_moves`); null = class default (`CLASS_SPECIAL` / `CLASS_STYLE`).
- **Sim feel:** hit-stop (`m.freeze`), a 16-tick super-freeze when a special starts, KO slow-motion (`m.slow`, every 3rd tick). Snapshots now go out every tick (60/s).
- **Renderer:** strike smears, impact rings, ink splats on the floor, flash, special dim + speed lines, per-special FX, camera push-in on specials and the KO, cinema bars in slow-mo, drifting background doodles, intro taunts and a victory pose. The renderer keeps the lowest foot on the floor (bent legs = crouch). The stickman holds the item **cut from the photo** (`sprite.ts` `propSide`/`cutProp`), with the drawing's pen width.
- **Avatars:** `FighterAvatar` (idle + showcase moves, IntersectionObserver-paused) on cards, pickers, gallery, leaderboard, landing. Sprites cached by `loadSpriteCached`.
- **App:** PWA (`app/manifest.ts`, icons at `/pwa-icon/[192|180|512]` via `ImageResponse`, `InstallButton`), `BackButton` in the header on every page but `/` and `/home`.
- **AI decisions:** `GEMINI_API_KEY` (wins) or `ANTHROPIC_API_KEY`. Gemini via REST `generateContent` (JSON mode, schema in the prompt, zod-validated), model `GEMINI_MODEL` (default `gemini-3.8-flash`). The AI picks special kind, style, name, stats. Offline picks from `CLASS_SPECIAL_POOL` + `styleFromLook`. Neither key is set on Vercel yet.
- **Commits:** one commit per finished feature (or a few related changes) and push those together; not a push per small change.

## Chat 5 additions (2026-10-23/24)

- **Removed** `/play/test`, `/api/test-session`, bearer auth, P1/P2 keymaps.
- **Back button** everywhere incl. `/home`; `useLeaveGuard` confirms before leaving an unfinished upload/build or a running fight (links, `[data-leave]` buttons, tab close).
- **Names:** optional name on upload/build (`cleanName`, 2-32 chars). Owner/admin **rename + delete** (`PATCH`/`DELETE /api/characters/[id]`, `OwnerActions`); delete removes the Blob/local file; demo starters (`/samples/…`) only an admin may change.
- **Player profiles** `/player/[id]` (W/L, win rate, best rank, fighters, recent fights).
- **Admin** `/admin`, `isAdmin()` = email in `ADMIN_EMAILS` (`iamabadguy001@gmail.com`; set it on Vercel too). Lists every design with photo + owner email + AI source; toggles `Character.cpu` (CPU roster) and `Character.hidden` (off gallery/leaderboard/CPU lists); admins may fight with any design (CPU and rooms). No email verification exists, so the admin email must be signed up by the user before anyone else.
- **Security:** `RateLimit` table + `rateLimit()` (login per IP and per email+IP, signup per IP, uploads 4/min 25/day, room/answer/battle/edit APIs); upload type sniffed from bytes; unknown-email logins still run bcrypt; 8+ char passwords; security headers in `next.config.ts` (CSP frame-ancestors/object-src/base-uri/form-action, XFO, nosniff, HSTS…).
- **Crayon fix (sprite.ts):** figure blob = most *solid* ink (alpha ≥ 200), found at 1024 px (`FIND_SIDE`), blobs link only at alpha ≥ 140 (faint page shading used to chain the doodle to the photo edge), wider merge margin, empty head crop → plain circle. Upload "Turn" button (user rotation wins over AI). Prompt checks both hands. Root cause of the bad prod upload: it went through an *old deployment URL*, and the Gemini key was added after the last deploy (needs a redeploy).
- **Fair stats:** HP 200 for all; `BUDGET` 210 over atk/def(durability, shown "DUR")/spd, each 40-100; `clampStats` rebalances any line (migration `fair_stats` rescaled rows). `deriveDef` tunables in `TUNE`; SPD also sets punch/kick **tempo**. `scripts/balance.ts` (CPU vs CPU matrix; `--tune` bisects `STYLE_TUNE`/`SPECIAL_TUNE` in moves.ts against every style×special). Matrix 28-70% (was 0-100%).
- **Research:** `docs/gemini-research-prompt.md` + `scripts/research.ts` → `docs/research/*.json` (stats, 30 martial arts, 37 anime / 90 chars / 112 moves, 15 new special ideas). Free key: Pro/search unavailable and 3.8-flash daily quota ran out, so data is thin; rerun with a paid key for depth.
- **Builder** `/build`: categories (head, ink, item, style, special, name) are drawn as a stick figure and sent through the normal pipeline with `builder=1` (no AI) + `pick_*` fields. Upload has a "Correct the AI" panel; explicit `pick_item/style/special` always win.
- **Online:** guest jitter buffer (3 snapshots, steady playout); cached notebook page; lighter glow. **Disconnects:** guest drops → host's CPU plays them, room reopens with `keepGuest` (seat reserved), they resume on return; host drops → guest continues locally vs CPU via `sim.resumeMatch`. Such fights aren't recorded. Notices show above the arena.

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
- **AI key:** `GEMINI_API_KEY` is set locally and on Vercel (Production); Claude key not set. Free Gemini quota is small (3.8-flash ran out in one day of testing).
- **Auto-deploy:** link the GitHub repo to the Vercel project so pushes deploy.
- **Possible next steps:** sound effects, a mid-match reconnect for the guest, a host-migration-free rematch flow, more classes, shareable result cards.

## User preferences

- Talks in Hinglish, so reply in Hinglish. Keep it short and concrete.
- Wants things actually running and verified, with screenshots/tests, not just written.
- Ask before hard-to-reverse or account-level actions (legal terms, deleting data). Hosting on Vercel and pushing to GitHub were explicitly approved.

## Chat 6 additions (2026-10-24): InkFight 2.0, Phase 1 in sprints (plan in the session's plan file)

- **Sprint 0 (done):**
  - **Cut-out storage:** uploads store only the figure (`cleanDrawing` in `sprite.ts`, upright PNG on white, file `cut-*.png`), never the photo. Cards show no photo thumbnail. `/admin` has "Re-cut N old photos" (`PUT /api/characters/[id]/image`, admin only: saves the cut-out, deletes the photo, resets rotation/pose).
  - **Training room** `MovePreview` (real sim + `Renderer(canvas, true)` preview mode vs a dummy) on `/build` and in the upload "Correct the AI" panel. Every style/special/item pick replays it.
  - **Sword fix:** `heldAngle(fore)` in `stickman.ts` (blades point forward-up in every stance). Photo props are held at their point nearest the shoulder; long props are turned along `heldAngle`. Owner toggle "Flip item" (`Character.flipItem`). The builder canvas is 720 wide, because a sword touching the edge made the figure finder drop the figure.
  - **Admin buff:** `User.buff` (toggle on `/admin`). The server sets `PublicFighter.buff` (`buffOn`/`sessionBuff` in `auth.ts`). Sim ×1.3 dealt, ×0.75 taken. A gold BUFF tag shows on the HUD. Buffed fights aren't recorded.
- **Sprint 1 (done):** 5 stats STR/DUR/SPD/AGI/IQ (budget 350), classes Sword/Mace/Tank/Attacker/Fighter (`CLASS_BASE` in `stats.ts`, `TRAIT` in `sim.ts`), elements, Attacker blast, inspect panel (`InspectPanel`, hover HUD / hold I / tap), phone controls (`Joystick`, `TouchControls`), migration `attacker_iq` (old Mages had STR where IQ belongs).
- **Balance (`scripts/balance.ts`, `scripts/matchup.ts`):** gate = every class *pair* (both cells, 2N matches) 40-60% and every stat line 45-62%; run it at N=200 (`npx tsx scripts/balance.ts 200`, ~1 min). Last result: pairs 42-59%, lines 45-54%. Lessons:
  - Fix mechanics before numbers. Root causes found: specials refilled their own meter (barrage looped), the CPU dropped its guard right before a beam fired, the Sword CPU always stepped back (Sword vs Mace 64% / 32% without), Mace broke charge armor ×1.5 (now `MACE_BREAK` ×1.25).
  - One knob per stat (`STR_EXP`, `DUR_EXP`, `IQ_EXP`); `TEMPO_GAIN` is very steep (0.002 → 0.003 moves the SPD line 44% → 66%).
  - The classes pass updates all factors at once from the whole matrix (one at a time never converged). The stat-line check uses a Fighter, so retune `lines,classes` together.
  - One N=80 cell is ±5.6%: judge pairs, not cells. All of this is CPU vs CPU, not human play.
- **Research for Sprints 2-5:** `docs/research/v2/` (specials, techniques, bosses, animation; index in its README).
- **Sprint 2 (done, 2026-10-25):**
  - **Moves:** J swings the class weapon (`CLASS_CHAIN`: Sword iai/risingSlash/thrust, Mace overhead/slam, Tank jab/shieldBash with armor, Attacker inkPalm/palm; Fighter = style punches). K = style kicks. S+K = `sweep` (low: goes under a guard, knockdown), toward+K = roundhouse, J/K in the air = airSlash/divePunch/flyingKick, switching buttons after 2 hits = the style's `mix` finisher.
  - **Side skills** (U / gamepad RB / SKILL button; `Character.sideSkill`, migration `side_skill`, null = `CLASS_SKILL`): blade, reflect, bubble, weave, poise (`SKILL_INFO`, `SKILL_TUNE` = duration factor). A press while reeling is queued (`skillQ`). Picker in `/build` and the upload panel; `MovePreview` demo kind `"skill"`; shown on the character page and in the inspect panel (tier 2).
  - **Limb clash:** two strikes active on the coming tick that reach each other cancel (before, slot 0 always won trades).
  - **Look:** class idle loops (`idleFor` in poses.ts, Attacker hovers), sword crescent, mace floor crack, sweep dust, skill FX, clash sparks, HUD skill bar.
  - **Balance:** gate PASS at N=200: pairs 44-57%, lines 49-57%. Skills are tuned so a class with its skill beats itself without it 60% (`--tune N skills`, `SKILL_N` 400). `scripts/check-sim.ts` asserts skills, queue, clash, sweep, bubble, air and mix moves.
  - **Balance lessons:** a reactive CPU makes timing skills degenerate (weave is used as a read now; its free counter-stun was removed); refreshing an element each hit is a permanent burn (blade only sets your own element on a clean target); `statLines` must seed each kit separately (one shared seed made 200 kits worth a handful of samples, ±10 points of noise); the lines pass now moves all knobs at once like the classes pass.
- **Delegation (2026-10-25):** task sheet `docs/tasks/next-sprints.md` (branch per sprint, gate, `docs/changes/sprint-N.md` with the gate output; no pushes to main, no deploys by agents). Sprint 3 runs in a Claude Code cloud session (branch `sprint-3-ultimates`). Sprint 4 was built by agy (`sprint-4-online`) and needed two review fixes (transparent PNGs read as black ink; every normal join auto-started the fight): always review agent work in a browser, the validators can't see those. Sprint 5 part 1 is on `sprint-5-dungeon` (no sim.ts changes; part 2 after Sprint 3 merges).
- **Dungeon facts:** bosses in `src/game/dungeon.ts`; `clampStats` honours `budget`/`cap` (bosses only); budgets are tuned by `scripts/dungeon.ts --tune` (most are under 350: the boss AI is the edge); art at `/boss-art/[n]`; progress `User.dungeonFloor` + `POST /api/dungeon/clear`.
- **Sprint 3 (done, 2026-10-24, branch `sprint-3-ultimates`, docs in `docs/changes/sprint-3.md`):**
  - **Two specials:** L = slot 1 (50 energy, `SLOT1_SCALE` 0.55, 6-tick freeze); S+L = ultimate (100, `ULT_SCALE`, 16-tick freeze). `Character.ultKind/ultName/ultDesc` (migration `ultimate`; null kind = `CLASS_ULT`; `ultTitle()` names old fighters). Pickers in `/build`, the upload panel, character page, inspect panel, `MovePreview` demo `ult`. CPU saves for the ult with `LEVELS.ult` chance (`brain.saving`).
  - **Hit-lock:** an unblocked ult hit sets `opp.locked` (pinned `LOCK.gap` px in front, echo hits every 7 ticks for 42, finale with launch 12; beam/barrage hold for their own length; projectile ults pull the attacker back in on contact; a guard stops it; interrupting the attacker releases without the finale). Renderer: zoom 1.35, `rgba(5,5,12,.62)` blackout, pounding pose.
  - **Impact + crits:** Ink Flash (finisher crit, `0.03 + 0.003·(IQ−60)`, ×1.5), impact frames on ult hits/crits, "Reduce flashes" (`flashes.ts`, localStorage, follows prefers-reduced-motion). **Spine recoil:** `hitHigh` (>70% body height). **Cosmetics + proportions:** `drawStick` (`plain` skips cosmetics: the builder's drawing is measured, so it must stay clean), `buildFor(dur, spd)`. **Tension:** below 30% HP, `tension` rises and boosts every energy gain by up to ×1.8 (energy only).
  - **Balance:** new `--tune N ult` pass sets `ULT_SCALE`; specials/styles are priced with the kind in both slots; the kit generator varies the ult. Lesson: a default ult that whiffs against a guard (Sword's teleport: 7 dmg per use vs the Tank's 21) breaks a pair no factor can fix; look at `matchup.ts` (now splits slot-1/ult usage and damage). Gate: pairs 43-58%, lines 46-59% (DUR 46 is the thin margin).
  - **Local DB in cloud sessions:** `pg_ctlcluster 16 main start`, create a user/db, point both `DATABASE_URL*` at it; `prisma migrate deploy` + `prisma/seed.ts` work. `next typegen` is needed for `PageProps`/`RouteContext` before `tsc`.
  - **Not verified:** two real devices, phones/gamepads, real AI calls. See the docs.
- **Sprint 5 part 2 (done, 2026-10-25, branch `sprint-5-part2` = part 1 + Sprint 3 + Sprint 4 merged; docs in `docs/changes/sprint-5-part2.md`, with the merge notes):**
  - **Passives** only via `createMatch(..., { boss: bossRun(floor).spec })` (`FighterDef.passive`; state in `Fighter.pv`, marks on the player in `Fighter.marks`); `balance.ts` asserts no player kit has one. Hooks: `applyHit` (afterimage, spine, margin damage, phase-2 clamp), `bossHits` (heat, cracks, dance, marks), `bossTick` (timers, swap, blink, ruled lines), `energyGain` (pride), move end (dance), idle branch (draw). Telegraphs in `render.ts` (`bossGlow`, `bossFx`, `marksFx`, `hazard`).
  - **Phase 2** (floor 10): clamp to exactly half HP, new def, `phase` event, `Match.hazards` (Red Margin Lines), resets each round. **New kinds** shatter/counter/dash_slash/pull/remote_detonation in `SPECIAL_KINDS`; `BASE_KINDS` (12) is what the AI/offline generator may pick. **Unlocks:** `UNLOCK_FLOOR`, `VARIANTS`, `specialChoices(cleared)`, `lockedReason`; `POST /api/characters` 403s locked `pick_special/ult/variant`; `/build` and `/create` list only unlocked.
  - **Balance/dungeon:** dungeon budgets `[350,311,327,354,297,320,331,304,328,330]`, curve 84→14%. Lessons: a tuned factor at the bisection edge (pull 2.989) means a mechanic is too weak, not that the number is wrong (pull base damage 0.8→3.0x); a cached boss spec froze the second form's budget (the tuner moved floor 10 to 245 and it then played at 88%): `bossRun` refreshes it; fights in `check-sim.ts` zero dodge (`ruleStats` + `agi: 40` is rebalanced up, so "no agility" fighters still slipped hits).
  - **Not verified:** a full climb winning several floors; most passive tells by eye; Sprint 4's two review fixes (see docs) may not be on `origin/sprint-4-online`.

## State on 2026-10-25 (after Sprints 2-5)

- **Live:** Sprints 2, 3, 4 and 5 (both parts) are merged into `main` and deployed. Gate at the merge: class pairs 41-59%, stat lines 47-55%, dungeon curve 84% → 14%.
- **Online between two real devices fails without a relay** (Wi-Fi client isolation, carrier NAT). Two browsers on one machine always connect, so local tests can't show this.
- **Supabase Realtime fallback (2026-10-25, `fac3290`, live):** WebRTC first; no direct link 5 s after the answer (or ICE fails) → both join a Supabase broadcast channel (`src/game/relay.ts`), topic `inkfight:<code>:<relayKey>` (HMAC of the offer with `AUTH_SECRET`, `src/lib/rooms.ts`, returned by the room POST and the answer POST). Over it the host sends every 4th snapshot (`RELAY_SNAP_EVERY`), the guest interpolates (`SnapBuffer.span`); silence 10 s = drop. Env `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (project `mtxckwpgumdvatbnumti`, owner's account; set locally and on Vercel Production). Free tier: 100 msgs/s per project (sent + delivered), ~45/s per relayed fight. Test: `?relay=1` on one side (with no TURN the direct link can't form). Not covered: the host-drop rejoin (`rejoinHost`) is still direct-only. Cloudflare TURN (`/api/turn`, `TURN_KEY_ID`/`TURN_KEY_API_TOKEN`) stays optional.
- **Props must touch the hand** (`propSide` in sprite.ts follows the ink connected through the forearm); the builder's cap brim and stray scan marks used to float by the hand.
- **AI analysis is capped at 20 s** (vision.ts), then the offline generator.
- **Next:** `docs/tasks/sprint-6.md` (sound, share cards, admin follow-ups, scan cleanup; mobile redesign and arena art once the owner brings designs made from `docs/design/prompts.md`).
- **Local DB gotcha:** `prisma dev` dies now and then and leaves `%LOCALAPPDATA%\prisma-dev-nodejs\Data\durable-streams\inkfight-local\server.lock.lock`; with no prisma process running, delete it and start `npx prisma dev -n inkfight-local --detach` again.
- **Sprint 6a: sound (branch `sprint-6-sound`, docs `docs/changes/sprint-6-sound.md`):** `src/game/sound.ts` (procedural Web Audio recipes, one context, voice cap 10, `localStorage["inkfight.sound"]` default on), played from `Renderer.effect()`/`ingest()`; `SoundToggle` in the header and `SoundSwitch` in the fight settings; `scripts/check-sound.ts` (fake audio). Unverified: how it sounds, real phones.
- **Sprint 6b: share card (branch `sprint-6-share`, docs `docs/changes/sprint-6-share.md`):** `src/lib/shareCard.tsx` (`renderCard`, 1080x1080 `ImageResponse`; drawings read from disk/boss route/Blob host only), `/battle/[id]` (+ `opengraph-image.tsx`), `/card` and `/share` (query-built, validated by `parseScore`/`resolveFighter`), `GET /api/battles/lookup`, `ShareResult` on both result overlays. Server pages pass `url=`, client overlays `getUrl=` (functions can't cross the server/client line). Unverified: overlays end to end, real share sheets and link previews.
- **Sprint 6c: follow-ups (branch `sprint-6-followups`, docs `docs/changes/sprint-6-followups.md`):** `/admin` lists each design's special, ultimate and side skill; re-cut now also lists pre-Sprint-4 white cut-outs once (`src/lib/cutout.ts`: new cut-outs are `tcut-*`, `needsRecut`). `sim.ts` queues an S + L pressed in hit-stun (`Fighter.ultQ`, like `skillQ`; fires on the first free tick only with a full meter). The CPU doesn't press specials while reeling (`reelFree` in `cpu.ts`), otherwise it queues too and Tank-Fighter went to 62-67%. Touch ULT holds block 160 ms (`GUARD_HOLD_MS`). `CLASS_TUNE` re-tuned (`--tune 320 classes`; N=160 was noisy at the 60% edge): pairs 41-60%, lines 50-55%.
- **Sprint 6d: scans (branch `sprint-6-scan`, docs `docs/changes/sprint-6-scan.md`):** the vision `pose` may carry `head_box` (circle: x, y, r as a fraction of the longer side) and `item_box` (rectangle or null), validated one by one in `validPose` (a box that doesn't fit its joints is dropped). `sprite.ts` `cutHead` crops exactly the head box, `propSide` only takes ink inside the item box (+ margin), still connected to the hand, with the old search as fallback. `headSpecks` (pure) erases specks and hatching (4+ parallel short strokes, 3 when they grow out of the outline) from the head crop; offline keeps the old circle plus that cleanup. Not verified with a real model or real photos (no key, empty `./uploads` in the cloud env).

## Sprint 7: Arena 1, Inferno Crater (branch `sprint-7-arena`, docs `docs/changes/sprint-7-arena.md`)

- **What:** an opt-in match mode, `createMatch(a, b, inputs, { arena: "inferno" })`: one 5:00 fight (health pool x18, `ARENA_TUNE.hpMul`) in five scenes on the match clock (0:00 Arrival, 0:30 Heatwave, 1:00 Ground Fracture, 1:45 Volcanic Warning, 2:30 Elevated Final Arena); KO ends it, at 5:00 higher health wins, equal = draw (`matchWinner` null, not recorded). Normal fights are untouched (`check-sim` hashes their snapshots; `balance.ts 200` prints what main prints).
- **Where:** `src/game/arena.ts` (the whole `ARENA_TUNE` table, scene/platform/lava functions of the tick, `arenaStep`), `space.ts` (ARENA/BODY/TICK_HZ, re-exported by sim.ts), `arenaNav.ts` (CPU: flee cracks and markers, BFS over jump plans up the stairs), `arenaRender.ts` (procedural backdrop baked per scene + live hazards + HUD), hooks in `sim.ts` (`arenaSurface`, `arenaStep`, `pinned`, weakness/matchup in `applyHit`), `cpu.ts` (wrapper), `render.ts`. State is `Match.arena` (in every Snapshot, ~230 bytes); platforms and lava are pure functions of the tick; one-shot cues go through the event list (`type: "arena"`).
- **Rules worth remembering:** platforms are one-way (S + jump drops); a rising rock carries a fighter; environment damage is capped per 10 s (11 one-second buckets) and never takes the last HP; cracks max 2, glow 1.67 s, never near a fighter, a 200 px safe strip; meteors marker 1.4 s, one blast never hits both; staircase rises 66-67 px (weakest jumper's apex 106), gaps 10-15, final platform 420 wide 200 up; lava reaches the floor at 3:10 and never the final platform. The clock stops in hit-stop like a normal round.
- **Balance:** the 5-minute fight pushed Tank-Fighter / Sword-Tank 15 points further, so `ARENA_TUNE.matchup` trims damage per matchup (found with `npx tsx scripts/arena.ts --tune`, ~15 min; a trim moves a pair's log-odds about 18 per unit of log factor, so steps must be ~1-3%). `scripts/arena.ts` (about 8 min) asserts the staircase against the sim's own jump numbers with real jumps, prints ASCII layouts, and checks the CPU (climb 100%, hazards 17.9% of damage, pairs 38-57%, determinism).
- **Modes:** `/play/cpu` Mode step (`?arena=inferno`), `RoomStart` switch (kept per room code in `roomMode.ts`), `Lobby.mode`, `useGameRoom(code, fighter, user, mode)`. Online arena fights are reported to `/api/battles` (`RECORD_ARENA` in the route; `docs/tasks/arena-1.md` said unrecorded, the task message said recorded: the message won).
- **Not done:** constellations / plausibility (hook `FighterDef.lavaResist`, unused), the depth axis, a real-phone / real-sound check, a relayed arena fight, a human-played climb.


## Sprint 7b: Arena 1, pass 2 (branch `sprint-7b-arena`, docs `docs/changes/sprint-7b.md`, task sheet `docs/tasks/arena-1b.md`)

- **What (parts A-G, one commit each):** guided pauses (sim phase `"cue"`, `Match.cue`), the opening ceremony (5 constellations with skills in `ARENA_TUNE.stars`, picked in the fight itself, in every snapshot as `ArenaState.pick`), the weather
  crossfade over 9 s and a visible heatwave, lava that leaks from the cracks, scene 5's story (climb, marks, the stars answer with a seeded 10-50% plausibility buff, the ring with solid walls), the ending (the winner boots the loser
  into the lava, the loser's star falls, the sky clears, then the result), and the on-canvas interface in the style of `docs/design/arena-1/ui-reference.png`.
- **Where:** `src/game/arena.ts` (`STORY` beats, `arenaBeat` / `arenaCueTick` / `arenaCueInput`, `arenaBoost` / `arenaDamageFactor` / `arenaEnergyMul`, `ringBounds` / `arenaRingClamp`, `arenaEndBegin` / `arenaEndStep`, all numbers in
  `ARENA_TUNE`), `sim.ts` (hooks), `arenaNav.ts` + `cpu.ts` (the computer climbs, picks, walks to its mark), `arenaRender.ts` (sky, ring, reveal, ending's star), `arenaStars.ts`, `arenaUi.ts` (the kit: slanted plates, tags, bars),
  `arenaHud.ts` (HUD, ceremony bar, pop-up, banners), `render.ts` (spin / rim / lava clip of the loser, effects).
- **Rules worth remembering:** two clocks: `arenaTick(m)` is the match clock (frozen in a pause, the 5:00 and every scene run on it), `arenaWorld(m)` = it + `a.pause` (platforms, lava, the weather fade run on it, so the stairs rise while
  the fight is held). `createMatch(..., { arena, seed })`: the seed goes into `ArenaState` and is mixed into every arena roll (callers pick it with `Math.random`; without one every roll repeats). Damage the stars / buff / matchup change goes
  through `arenaDamageFactor` in `applyHit`, not by editing `FighterDef`. A fighter at or above the platform can't leave the ring (`arenaRingClamp`, `arenaCanDrop`). The ending is scripted after the fighters move (`arenaEndStep`) and
  deals nothing; floor ending lava is `ARENA.ground + 52` (the lake under the slab), the ring's is `lavaY`. A normal fight is untouched: `check-sim` hashes three of them, `balance.ts 200` matches main, and
  `scripts/shots-7b/compare-normal.mjs` shows byte-identical frames.
- **Balance:** `scripts/arena.ts` (default 300 fights per class pair, about 6 min; `--quick` is seconds; `--tune N` re-fits `ARENA_TUNE.matchup`, a few minutes at 100): pairs 45-58%, hazards 8-9% of damage (the sheet's 10% floor was pass 1's
  own: a solid ring has no hazard that reaches a fighter, so the floor is 5%), the computer climbs 100%, nobody lifted by a timeout.
- **Tools:** `scripts/shots-7b/` (`run.mjs` + `entry.ts` draw real Renderer frames of a computer-played fight at named moments, desktop and phone; `compare-normal.mjs`).
- **Not verified:** a real phone, the sound by ear, a relayed arena fight, a human climbing / choosing / watching the ending, motion at 60 fps (still frames only), "exactly" like the reference photo (layout, type and colours are matched, the
  painted art is not).
