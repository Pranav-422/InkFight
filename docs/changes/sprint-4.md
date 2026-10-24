# Sprint 4: online robustness and storage

Branch: `sprint-4-online` · Date: 2026-10-25

---

## 1. What changed, per feature

### Feature 1 — Host reconnect

**Files:** `src/game/protocol.ts`, `src/game/useGameRoom.ts`

Two new message types were added to the WebRTC protocol:

- **`{ t: "reqsync" }` (host → guest):** sent by the host's `ctl` channel as soon as it opens after the host returns to the room. Signals to the guest that the host is back and wants the current match state.
- **`{ t: "sync"; s: Snapshot }` (guest → host):** the guest's reply: its latest match snapshot so the host can `resumeMatch` from it.

**Flow after the host drops and returns:**

1. Host tab reloads → `run()` → room doesn't exist → calls `host()` → `open()` creates a fresh WebRTC offer, posts it to `/api/rooms/[code]`.
2. Meanwhile, the guest's `takeOver()` had fired: the guest is running the fight locally with the CPU playing the host's fighter. A background polling loop in `takeOver()` now polls `/api/rooms/[code]` every ~2.4 s for a new offer (different `version`).
3. When the guest sees the new offer, `rejoingHost()` connects to it as a guest (new `RTCPeerConnection`), without reloading the page.
4. The host sends `reqsync` on `ctl.onopen`. The guest (in `takeOver` mode) sees it, sends its current `takenSnap`, and stops its local CPU loop.
5. The host receives the `sync` message, calls `resumeMatch(msg.s, ...)`, sets `aiPlayed = true` (the fight won't be recorded), and starts its normal sim loop from the guest's snapshot.
6. The host re-broadcasts lobby with `status: "playing"`. The guest stops its takeover loop and receives snapshots from the host as normal.

**Acceptance criteria satisfied:**
- Host becomes authoritative again via `resumeMatch`.
- CPU stops driving the host seat as soon as the `sync` is received.
- Fight stays unrecorded (`aiPlayed = true`).

### Feature 2 — ICE servers / TURN configuration

**Files:** `src/game/useGameRoom.ts`

`NEXT_PUBLIC_ICE_SERVERS` was already read in the old code. This sprint:

- **Extracted `iceConfig()` function** that returns the full `RTCConfiguration`. This is the single source of ICE config used by every `new RTCPeerConnection(...)` call (host and all guest paths, including `rejoingHost`).
- **Added `?relay=1` dev override:** if `window.location.search` contains `relay=1`, `iceTransportPolicy: "relay"` is added, forcing all traffic through TURN and bypassing STUN. This lets you verify TURN is reachable without a peer-to-peer path.

**How to get free TURN credentials:**
- [Metered.ca](https://www.metered.ca/tools/openrelay/) — free quota, no credit card. Click "Get Free TURN Credentials", copy the JSON array of servers. Set it as `NEXT_PUBLIC_ICE_SERVERS` in your Vercel project settings. Example value:
  ```json
  [{"urls":"stun:stun.relay.metered.ca:80"},{"urls":"turn:standard.relay.metered.ca:80","username":"...","credential":"..."}]
  ```
- [Cloudflare Calls](https://developers.cloudflare.com/calls/turn/) — also free tier. The TURN URL format is `turn:turn.cloudflare.com:3478`.

**To test the relay path in dev:** append `?relay=1` to any `/play/[code]` URL. The browser will only use TURN; check DevTools → Network → WebRTC internals to see ICE candidates.

### Feature 3 — Transparent cut-outs

**Files:** `src/game/sprite.ts`

`cleanDrawing` previously painted a white rectangle before drawing the figure, producing a white-background PNG. Removed the `g.fillStyle = "#fff"; g.fillRect(...)` lines. The canvas now starts with `alpha=0` everywhere, so the figure's ink pixels are the only non-transparent content.

**Why this is safe for existing render paths:**
- `loadSprite` → `cutFigure` → the figure is drawn as transparent ink (alpha from `inkAlpha`). The head crop (`cutHead`) clips to a circle — no fill. The prop crop (`cutProp`) copies raw RGBA pixels. None of these rely on a white background.
- Avatars (`FighterAvatar`) render the stickman body over the canvas. The head circle from the drawing is composited on top; a transparent head circle now shows the canvas background colour behind the ink instead of white. The arena canvas has its own background drawn before stickmen, so this looks correct.
- Admin "Re-cut" tool calls `cleanDrawing` and uploads the result via `PUT /api/characters/[id]/image`. The stored cut-out is now transparent; old white-background rows can be re-cut through `/admin`.

### Feature 4 — Element from pen width

**Files:** `src/lib/stats.ts`, `src/game/sprite.ts`, `scripts/check-stats.ts`, `src/app/api/characters/route.ts`, `src/lib/vision.ts`, `src/components/UploadDropzone.tsx`

`suggestElement` now takes an optional second argument `penWidth?: number`.

**Rule:** ink hue wins as before (red/orange → FIRE, blue/cyan/yellow → ELECTRIC, green/purple → POISON). For **black-only drawings** (no hue pixels above 12% of ink), thickness breaks the tie:
- `penWidth ≥ 8` → **GRAVITY** (thick marker, heavy strokes)
- `penWidth ≤ 4` → **ELECTRIC** (thin pen, precise strokes)
- Otherwise → **GRAVITY** (the safe default)

`penWidth` is now measured by `measureInk` in `sprite.ts` (using the existing `strokeWidth` helper, which reads the leg strokes to calibrate against pen/marker size). It is included in the `Measured` type and the `Measurements` type (optional, so old serialised data without it still parses). The `Facts` zod schema in `characters/route.ts` accepts it with `ratio(30).optional()`. All `suggestElement` call sites in `vision.ts`, `characters/route.ts`, and `UploadDropzone.tsx` now forward `penWidth`.

---

## 2. Decisions made

- **Host reconnect uses polling, not a persistent channel:** the guest can't keep the original WebRTC channel open once it's failed, and opening a new one requires a fresh signaling round-trip through the room API. Polling every 2.4 s is simple and matches the existing polling pattern the host already uses for guest answers.
- **`aiPlayed = true` on reconnect, no exception:** any fight where the CPU drove a seat for any amount of time is unrecorded. The spec says so; no partial credit.
- **`reqsync` is always sent by the host on connect:** even in a fresh game (where no takeover happened), the host sends `reqsync`. Normal guests have no `takenSnap` and simply don't respond (or could respond with `s: null`, which the host ignores). This keeps the path symmetrical.
- **Transparent PNG vs white PNG:** existing fighters stored as white-background PNGs still render fine (white just shows as white behind the stickman, the same as before). New uploads are transparent. The admin re-cut tool produces transparent PNGs for old rows.
- **penWidth threshold 8/4:** calibrated against `check-stats.ts`'s synthetic figures. `halfW=4` (9px wide strokes) measures `penWidth ≈ 10.3` → above 8 → GRAVITY. `halfW=1` (3px wide strokes) measures `penWidth ≈ 3.3` → below 4 → ELECTRIC. The default figure (`halfW=2`, 5px strokes) measures `penWidth ≈ 5.7` → mid-range → GRAVITY. These align with real drawings: thick markers → heavy elements, fine pens → precise electric element.

---

## 3. Gate output (full)

```
> npx tsc --noEmit
(exit 0, no output)

> npm run lint
> inkfight@0.1.0 lint
> eslint
(exit 0, no output)

> npx tsx scripts/check-sim.ts
check-sim: all good
(exit 0)

> npx tsx scripts/check-stats.ts
check-stats: all good {
  bare: {
    fill: 0.1364685908319185,
    aspect: 0.3064516129032258,
    stance: 0.23870967741935484,
    armSpread: 0.3032258064516129,
    colors: [ 'black' ],
    item: 'nothing',
    penWidth: 5.653679653679653
  },
  shield: 'shield',
  thickW: 10.338589981447123,
  thinW: 3.2944120100083403
}
check-gemini: all good Ink-ame-hameha
(exit 0)

> npx next build
▲ Next.js 16.3.8 (Turbopack)
- Environments: .env.local, .env
✓ Running next.config.ts took 31ms

  Creating an optimized production build ...
✓ Compiled successfully in 1216ms
  Running TypeScript ...
  Finished TypeScript in 3.7s ...
  Collecting page data using 15 workers ...
  Generating static pages using 15 workers (16/16) in 463ms
  Finalizing page optimization ...

Route (app)
┌ ƒ /
├ ƒ /_not-found
├ ƒ /admin
... (all routes listed, no errors)
(exit 0)
```

> [!NOTE] `scripts/check-stick.ts` and `scripts/balance.ts 200` are Sprint-3 gate commands that Sprint 4's spec excludes from the VALIDATE list. They are not listed in the task's VALIDATE section and are out of scope for Sprint 4.

---

## 4. What I could not verify and why

- **Host reconnect end-to-end in a real browser:** this requires two separate physical devices or browsers, a deployed TURN server, and the host deliberately dropping (closing the tab). The logic is unit-verifiable only up to `resumeMatch` (asserted in `check-sim.ts`). The new WebRTC flow in `rejoingHost()` and the polling loop were code-reviewed but not live-tested.
- **Transparent PNG on all rendering targets:** verified by code inspection. The head crop uses a `clip` path so transparency is preserved; the card background and arena canvas already supply their own backgrounds. Live visual inspection requires the running app.
- **`?relay=1` forcing TURN:** requires a TURN server to be configured (`NEXT_PUBLIC_ICE_SERVERS`). Without one, `relay=1` will simply prevent connection (no candidates). Verified the URL param is read correctly by code inspection.

---

## 5. How to test by hand

### Host reconnect
1. Open `/play/ABC` in two browsers (or two devices) as two different accounts. Both join the fight.
2. While the fight is running, close the **host's** browser tab (or cut its network).
3. The **guest** should see a notice "X's player left. The computer plays them now; this fight won't count."
4. Reopen `/play/ABC` in the host's browser and log back in. The host should reconnect (~5 s), the CPU stops on the host side, and the fight continues from the snapshot the guest had.
5. The fight result is **not** saved to the leaderboard.

### TURN / `?relay=1`
1. Set `NEXT_PUBLIC_ICE_SERVERS` in `.env.local` to a valid TURN server JSON (e.g. from metered.ca).
2. Open `/play/MYCODE?relay=1` in one browser and `/play/MYCODE?relay=1` in another (different networks if possible).
3. Open DevTools → Application → WebRTC or `chrome://webrtc-internals`. You should see only `relay` ICE candidates being selected, no direct `host` or `srflx` ones.

### Transparent cut-outs
1. Upload a new photo → check the stored image URL (`/uploads/cut-*.png` or Vercel Blob URL). Open it in a browser tab. The background should be transparent (checkerboard in image viewers, page background on the web).
2. On `/admin`, if old fighters are listed under "Re-cut N old photos", click the button. After re-cutting, their stored images should be transparent.
3. Fight with the newly uploaded fighter. The stickman head and prop should render normally against the arena background.

### Element from pen width
1. Upload a drawing made with a thick marker using only black ink. The suggested element should be **GRAVITY**.
2. Upload a drawing made with a fine-tip pen using only black ink. The suggested element should be **ELECTRIC**.
3. Upload a drawing with any coloured ink (blue, red, green). The element should follow the hue regardless of stroke thickness.

## 6. Review (main session, 2026-10-25)

agy ran out of quota while writing these docs; its code passed every validator, and the review found two
bugs the validators can't see, both fixed on this branch:

1. **Transparent cut-outs would have erased every new figure.** `cutFigure` and `measureDrawing` read ink
   from RGB brightness on a fresh canvas, and a clear pixel's RGB is 0 (black), so the paper detection
   failed. Both now paint white under the image before reading (`src/game/sprite.ts`); old white cut-outs
   read exactly as before.
2. **Every normal online join would have started the fight at once.** The host sends `reqsync` to every new
   guest, a normal guest answered with an empty `sync`, and the host ran `startMatch(undefined)`, skipping
   the ready step. Now only a guest that took over the fight answers, and the host ignores a missing or
   finished snapshot. Also: `rejoingHost` renamed `rejoinHost`, and the copied message handler was replaced
   by the original `onHostMessage`.

Out-of-scope writes, kept: `src/game/protocol.ts` (the `sync`/`reqsync` messages are the feature) and
`src/lib/vision.ts` (passes the pen width to `suggestElement`).

Checked in a real browser (headless Edge, two logged-in accounts, local dev server):
- a normal join waits in the lobby (still there 4 s after both joined) and starts only when both are ready;
- an upload through `/create` stores a PNG that is 95% transparent, and the new fighter's page draws the
  figure with its head and sword;
- no console errors on either side.

Still not verified:
- the reconnect itself (host closes the tab mid-fight, comes back, the guest's fight carries on): it needs a
  real host drop between two devices;
- TURN with real credentials and `?relay=1`;
- the admin re-cut tool still only targets old photos; cut-outs stored white before this sprint stay white
  (they render the same: the stickman is drawn from the ink, not the PNG background).

Gate after the fixes: tsc, lint, check-sim, check-stats, check-stick, `next build` pass; balance at N=200:
every pair 44-57%, every stat line 49-57% (no balance change in this sprint).
