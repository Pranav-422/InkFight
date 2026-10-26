// Arena 1's interface on the canvas, in the style of docs/design/arena-1/ui-reference.png (see arenaUi.ts for the pieces): the HUD (a black band across
// the top with the clock hanging from a notch in it, a gold name plate, a health bar and an energy bar for each fighter), the opening ceremony's title bar,
// the constellation pop-up (a roster strip of the five constellations between the fighters, a gold name plate in each lower corner), the banners of the
// guided pauses and the stamps for a scene change and a hazard warning. Everything is a function of the snapshot and the clock, except the pale trail
// behind a health bar, which eases down in real time.

import { ARENA_TUNE, arenaTick, arenaWorld, CONSTELLATIONS, lavaY, platformsAt, SCENE_NAMES, sceneAt, starInfo } from "./arena";
import { drawStar, starColor } from "./arenaStars";
import { bar, brush, fit, P_COLOR, P_TEXT, path, plate, slab, tag, UI, type Pt } from "./arenaUi";
import type { Cue, Slot, Snapshot } from "./sim";
import { ARENA, TICK_HZ } from "./space";

export type HudArgs = { names: [string, string]; you: Slot; admin?: [boolean, boolean]; buffs: [number, number] };

const ease = (p: number) => p * p * (3 - 2 * p);
// The shape of the HUD's black band, in the units it is laid out in: how tall the side plates are, how wide the clock block is at its foot, how far it
// hangs, and how much its sides lean. On a phone the arena is drawn at ~0.4x: the whole band is drawn bigger (see `panels`), and loses its small print.
const band = (phone: boolean) => {
  const H = phone ? 70 : 84, CW = phone ? 112 : 188, CH = H + (phone ? 14 : 18);
  return { H, CW, CH, lean: (CH - H) * 0.7 };
};
const clock = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

export class ArenaHud {
  private trail: [number, number] = [1, 1]; // each health bar's pale stretch: what was lost a moment ago
  private lastNow = 0;

  constructor(private fd: string, private fb: string) {}

  draw(ctx: CanvasRenderingContext2D, s: Snapshot, now: number, z: number, info: HudArgs) {
    const stage = s.cue?.id;
    ctx.save();
    ctx.textBaseline = "alphabetic";
    if (stage === "open" || stage === "pick") {
      // The opening ceremony has no clock or health bars yet: a title bar, and the pop-up while they choose.
      this.titleBar(ctx, s, z);
      if (stage === "pick") this.pick(ctx, s, now, z, info);
    } else if (stage === "reveal") {
      // (no bars: the sky is the point)
      if (s.cue) this.banner(ctx, s.cue, now, z, 62);
    } else {
      this.panels(ctx, s, now, z, info);
      if (s.cue) this.banner(ctx, s.cue, now, z, stage === "marks" ? 150 : undefined);
      if (s.phase === "fight") this.alerts(ctx, s, now, z);
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- the HUD

  private panels(ctx: CanvasRenderingContext2D, s: Snapshot, now: number, z: number, info: HudArgs) {
    const a = s.arena!;
    const phone = z > 1.2; // on a phone the arena is drawn at ~0.4x: the whole band is drawn bigger and loses its small print
    const k = phone ? z : 1;
    const W = ARENA.w / k;
    const { H, CW, CH, lean } = band(phone);
    const cx = W / 2;
    const dt = this.lastNow ? Math.min(100, now - this.lastNow) : 0;
    this.lastNow = now;

    ctx.save();
    ctx.scale(k, k);
    // The black band: one shape, its lower edge notched to hang the clock, washed red from the left and blue from the right, with a gold edge.
    const edge: Pt[] = [[W + 4, H], [cx + CW / 2 + lean, H], [cx + CW / 2, CH], [cx - CW / 2, CH], [cx - CW / 2 - lean, H], [-4, H]];
    ctx.save();
    path(ctx, [[-4, -4], [W + 4, -4], ...edge]);
    ctx.fillStyle = UI.black;
    ctx.fill();
    ctx.clip();
    for (const [x0, x1, c] of [[0, cx, "229,72,45"], [W, cx, "47,91,224"]] as const) {
      const g = ctx.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, `rgba(${c},.34)`);
      g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(Math.min(x0, x1), 0, Math.abs(x1 - x0), CH);
    }
    brush(ctx, 0, 0, W, CH);
    ctx.restore();
    ctx.strokeStyle = UI.gold;
    ctx.lineWidth = 3;
    ctx.lineJoin = "miter";
    ctx.beginPath();
    edge.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();

    // The clock, with the scene it is in.
    const secs = Math.max(0, Math.ceil(s.timer / TICK_HZ));
    const scene = sceneAt(arenaTick(s));
    ctx.textAlign = "center";
    ctx.fillStyle = UI.muted;
    const label = phone ? `${scene + 1}/5` : `${scene + 1}/5  ·  ${SCENE_NAMES[scene]}`;
    fit(ctx, label, CW - 6, 10.5, 800, this.fd, 7);
    ctx.fillText(label, cx, 16);
    ctx.font = `800 ${phone ? 30 : 38}px ${this.fd}`;
    ctx.fillStyle = secs <= 10 && Math.floor(now / 250) % 2 ? UI.p1Text : "#fff";
    ctx.fillText(clock(secs), cx, phone ? CH - 14 : CH - 20);

    for (const slot of [0, 1] as Slot[]) {
      const left = slot === 0;
      const f = s.fighters[slot];
      const avail = W / 2 - CW / 2 - lean - 24; // the room for a fighter's plates, between the outer edge and the slanted end of the notch
      const X = (off: number, w = 0) => (left ? 10 + off : W - 10 - off - w); // a box `w` wide, `off` in from the outer edge
      const sign = left ? 1 : -1;
      const align = left ? "left" : "right"; // along the outer edge
      const inner = left ? "right" : "left"; // against the notch

      // Row 1: the tag, the gold name plate (heavy black type, like the select screen's), the chips, and the constellation on the far end.
      const rh = phone ? 22 : 24, ry = 7, tagW = 34;
      tag(ctx, slot, X(0, tagW), ry, tagW, rh, this.fd);
      const mine = info.you === slot;
      const name = phone && mine ? "YOU" : info.names[slot].toUpperCase();
      const chips: { text: string; bg: string; fg: string; line: string }[] = [];
      if (info.admin?.[slot]) chips.push({ text: "BUFF", bg: UI.black, fg: UI.gold, line: UI.gold });
      if (info.buffs[slot] > 0) chips.push({ text: `+${info.buffs[slot]}%`, bg: UI.black, fg: UI.gold, line: UI.gold });
      if (mine && !phone) chips.push({ text: "YOU", bg: UI.paper, fg: UI.ink, line: UI.paper });
      ctx.font = `800 ${phone ? 11 : 12}px ${this.fd}`;
      const chipW = chips.map((c) => ctx.measureText(c.text).width + 14);
      const star = a.pick[slot];
      const scorched = (a.weak[slot] ?? 0) > 0.01;
      ctx.font = `800 11px ${this.fd}`;
      const starText = star && !phone ? `★ ${starInfo(star).name.toUpperCase()}` : "";
      const starW = starText ? ctx.measureText(starText).width + 6 : 0;
      const reserved = chipW.reduce((t, w) => t + w + 4, 0) + (starW ? starW + 6 : 0);
      const nameMax = Math.max(60, avail - tagW - 4 - reserved);
      const nameSize = fit(ctx, name, nameMax - 26, phone ? 15 : 17, 800, this.fd, 9);
      const nw = Math.min(nameMax, ctx.measureText(name).width + 26);
      const px = X(tagW + 4, nw);
      plate(ctx, slab(px, ry, nw, rh, left ? [0, 8, 0, 0] : [8, 0, 0, 0]), UI.gold);
      ctx.fillStyle = UI.ink;
      ctx.textAlign = "center";
      ctx.font = `800 ${nameSize}px ${this.fd}`;
      ctx.fillText(name, px + nw / 2 - sign * 2, ry + rh * 0.73, nw - 22); // (a little off the middle: the plate's slanted end takes more of the room)
      let off = tagW + 4 + nw + 4;
      chips.forEach((c, i) => {
        const cw = chipW[i], ch = rh - 4;
        plate(ctx, slab(X(off, cw), ry + 2, cw, ch, left ? [3, 0, 3, 0] : [0, 3, 0, 3]), c.bg, c.line, 1.5);
        ctx.fillStyle = c.fg;
        ctx.font = `800 ${phone ? 11 : 12}px ${this.fd}`;
        ctx.textAlign = "center";
        ctx.fillText(c.text, X(off, cw) + cw / 2, ry + 2 + ch * 0.74);
        off += cw + 4;
      });
      if (starText) {
        ctx.font = `800 11px ${this.fd}`;
        ctx.fillStyle = starColor(star!);
        ctx.textAlign = inner;
        ctx.fillText(starText, left ? 10 + avail : W - 10 - avail, ry + rh * 0.7);
      } else if (phone && scorched) {
        ctx.font = `800 10px ${this.fd}`;
        ctx.fillStyle = P_TEXT[0];
        ctx.textAlign = inner;
        ctx.fillText("SCORCHED", left ? 10 + avail : W - 10 - avail, ry + rh * 0.7);
      }

      // Row 2: health, in yellow, going orange and then red; a pale stretch behind it for what was just lost; the number at the inner end.
      const hy = ry + rh + 4, hh = phone ? 16 : 18;
      const pct = Math.max(0, f.hp / s.maxHp[slot]);
      this.trail[slot] = pct >= this.trail[slot] ? pct : Math.max(pct, this.trail[slot] - (dt / 1000) * 0.5);
      const hcol = pct > 0.5 ? UI.gold : pct > 0.25 ? "#ff8a22" : Math.floor(now / 200) % 2 ? UI.p1 : P_TEXT[0];
      const hl = sign * hh * 0.5;
      bar(ctx, X(0, avail), hy, avail, hh, pct, hcol, { fromRight: !left, trail: this.trail[slot], ticks: true, lean: hl });
      ctx.font = `800 ${phone ? 11 : 12}px ${this.fd}`;
      ctx.textAlign = left ? "right" : "left";
      ctx.lineJoin = "round";
      ctx.lineWidth = 3;
      ctx.strokeStyle = UI.black;
      const hp = `${Math.max(0, Math.ceil(pct * 100))}%`;
      const hx = left ? 10 + avail - 8 : W - 10 - avail + 8;
      ctx.strokeText(hp, hx, hy + hh * 0.76);
      ctx.fillStyle = "#fff";
      ctx.fillText(hp, hx, hy + hh * 0.76);
      if (f.tension > 0) {
        // The thin bar under the health once the fighter is hurt badly enough for it to start filling.
        ctx.fillStyle = f.tension >= 1 && Math.floor(now / 160) % 2 ? UI.gold : UI.p1;
        const tw = avail * Math.min(1, f.tension);
        ctx.fillRect(left ? X(0) : X(0, tw), hy + hh + 1, tw, 3);
      }

      // Row 3: the energy meter (a notch at half: the first special; full: the ultimate), the side skill, and what is ready.
      const ey = hy + hh + 5, eh = 8;
      const ew = phone ? Math.round(avail * 0.52) : 170, sw = phone ? 46 : 66;
      const full = f.energy >= 100, half = f.energy >= 50;
      bar(ctx, X(0, ew), ey, ew, eh, f.energy / 100, full ? (Math.floor(now / 200) % 2 ? UI.p1 : UI.gold) : UI.gold, { fromRight: !left, lean: sign * 4 });
      ctx.fillStyle = "rgba(255,255,255,.9)";
      ctx.fillRect(X(0, ew) + ew / 2 - 1, ey - 1, 2, eh + 2);
      const skillPct = 1 - (f.skillCd ?? 0) / Math.max(1, s.skillCds?.[slot] ?? 1);
      bar(ctx, X(ew + 8, sw), ey, sw, eh, skillPct, skillPct >= 1 ? P_TEXT[1] : "rgba(255,255,255,.4)", { fromRight: !left, lean: sign * 4 });
      if (half) {
        ctx.font = `800 ${phone ? 10 : 11}px ${this.fd}`;
        ctx.fillStyle = full ? P_TEXT[0] : UI.gold;
        ctx.textAlign = inner;
        const word = phone ? (full ? "ULTIMATE" : "SPECIAL") : full ? "ULTIMATE READY" : "SPECIAL READY";
        ctx.fillText(word, left ? 10 + avail : W - 10 - avail, ey + eh);
      }
      // Row 4 (not on a phone): the fighting style, and the scorch (red) beside it.
      if (!phone) {
        const base = ey + eh + 12;
        ctx.font = `700 10px ${this.fb}`;
        ctx.textAlign = align;
        ctx.fillStyle = UI.muted;
        const style = s.styles[slot].toUpperCase();
        ctx.fillText(style, X(0), base);
        if (scorched) {
          const at = ctx.measureText(style).width + 12;
          ctx.font = `800 10px ${this.fd}`;
          ctx.fillStyle = P_TEXT[0];
          ctx.fillText(`SCORCHED  -${Math.round(a.weak[slot] * 100)}% DMG`, X(at), base);
        }
      }
      // A combo while a chain is running.
      if ((f.action === "attack" || f.action === "kick") && f.combo > 0) {
        ctx.font = `800 ${phone ? 18 : 20}px ${this.fd}`;
        ctx.textAlign = align;
        ctx.lineWidth = 5;
        ctx.strokeStyle = UI.black;
        ctx.fillStyle = UI.gold;
        const t = `${f.combo + 1} HIT COMBO`;
        ctx.strokeText(t, X(0, 0), CH + 26);
        ctx.fillText(t, X(0, 0), CH + 26);
      }
    }
    ctx.restore();
  }

  // The stamp for a scene change, and the red tags that warn of what is about to hurt: under the clock, in front of nothing that matters.
  private alerts(ctx: CanvasRenderingContext2D, s: Snapshot, now: number, z: number) {
    const a = s.arena!;
    const phone = z > 1.2, k = phone ? z : 1;
    const tick = arenaTick(s);
    const scene = sceneAt(tick);
    const into = tick - ARENA_TUNE.scenes[scene];
    const CH = band(phone).CH * k;
    const warns: string[] = [];
    if (a.cracks.some((c) => tick < c.born + c.glow)) warns.push("GROUND CRACKING");
    if (a.meteors.length) warns.push("METEOR INCOMING");
    if (platformsAt(arenaWorld(s)).some((p) => p.state === "warn")) warns.push("THE GROUND SHAKES");
    if (scene === 4 && lavaY(arenaWorld(s)) < ARENA.ground + 20) warns.push("LAVA ON THE FLOOR");
    const shown = warns.slice(0, 2);
    const wsize = Math.round(12 * Math.min(z, 1.4)), wh = wsize + 8;
    shown.forEach((w, i) => {
      const pulse = 0.78 + 0.22 * Math.sin(now / 120);
      ctx.font = `800 ${wsize}px ${this.fd}`;
      const tw = ctx.measureText(w).width + 26, th = wh;
      const y = CH + 10 * k + i * (th + 4);
      plate(ctx, slab(ARENA.w / 2 - tw / 2, y, tw, th, [6, 0, 6, 0]), `rgba(229,72,45,${pulse})`, UI.ink, 1.5);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.fillText(w, ARENA.w / 2, y + th * 0.75);
    });
    if (into < 3 * TICK_HZ) {
      const pop = Math.min(1, into / 8), fade = Math.min(1, (3 * TICK_HZ - into) / 30);
      ctx.save();
      ctx.translate(ARENA.w / 2, CH + 10 * k + shown.length * (wh + 4) + 24 * k); // (under the warnings, if there are any)
      ctx.rotate(-0.04);
      ctx.scale(0.8 + 0.2 * pop, 0.8 + 0.2 * pop);
      ctx.globalAlpha = fade;
      const size = Math.round(18 * Math.min(z, 1.3));
      ctx.font = `800 ${size}px ${this.fd}`;
      const text = `${scene + 1} · ${SCENE_NAMES[scene]}`;
      const w = ctx.measureText(text).width + 40, h = size + 14;
      plate(ctx, slab(-w / 2, -h / 2, w, h, [h * 0.3, 0, h * 0.3, 0]), UI.gold, UI.ink, 3, 4);
      ctx.fillStyle = UI.ink;
      ctx.textAlign = "center";
      ctx.fillText(text, 0, size * 0.34);
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------- the ceremony

  // The title bar over the opening ceremony: a black band with the title in a notch that hangs from it; the controls on the left (like the select
  // screen's BACK / SELECT) and the arena on the right.
  private titleBar(ctx: CanvasRenderingContext2D, s: Snapshot, z: number) {
    const phone = z > 1.25;
    const pop = ease(Math.min(1, s.phaseT / 18));
    const small = s.cue?.id === "open" ? "ARENA 1" : "SELECT YOUR";
    const big = s.cue?.id === "open" ? "INFERNO CRATER" : "CONSTELLATION";
    const k = phone ? Math.min(1.6, z) : 1;
    const W = ARENA.w / k, cx = W / 2;
    const H = 36, CH = 66, CW = 252, lean = (CH - H) * 0.7;
    ctx.save();
    ctx.scale(k, k);
    ctx.translate(0, -(1 - pop) * (CH + 8));
    const edge: Pt[] = [[W + 4, H], [cx + CW / 2 + lean, H], [cx + CW / 2, CH], [cx - CW / 2, CH], [cx - CW / 2 - lean, H], [-4, H]];
    ctx.save();
    path(ctx, [[-4, -4], [W + 4, -4], ...edge]);
    ctx.fillStyle = UI.black;
    ctx.fill();
    ctx.clip();
    brush(ctx, 0, 0, W, CH);
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    edge.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.strokeStyle = UI.gold;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - CW / 2 + 6, CH + 3);
    ctx.lineTo(cx + CW / 2 - 6, CH + 3);
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = UI.muted;
    ctx.font = `800 10px ${this.fd}`;
    ctx.fillText(small, cx, 20);
    ctx.fillStyle = "#fff";
    fit(ctx, big, CW - 20, 26, 800, this.fd, 12);
    ctx.fillText(big, cx, 52);
    if (!phone && s.cue?.id === "pick") {
      // The controls in the left corner, the arena in the right, as small as the select screen's (while the stars wake, the title says it already).
      ctx.font = `800 11px ${this.fd}`;
      ctx.fillStyle = "#fff";
      this.glyph(ctx, 30, 22, "◀▶");
      ctx.textAlign = "left";
      ctx.fillText("CHOOSE", 52, 26);
      this.glyph(ctx, 136, 22, "●");
      ctx.textAlign = "left";
      ctx.fillText("PUNCH  LOCKS IT", 152, 26);
      ctx.textAlign = "right";
      ctx.fillText("INFERNO CRATER", W - 14, 26);
      ctx.fillStyle = UI.gold;
      ctx.fillText("ARENA 1", W - 14 - ctx.measureText("INFERNO CRATER").width - 10, 26);
    }
    ctx.restore();
  }

  // A button glyph: a white ring with the symbol in it (the select screen's controller hints).
  private glyph(ctx: CanvasRenderingContext2D, x: number, y: number, symbol: string) {
    const w = symbol.length > 1 ? 30 : 16;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - 8, w, 16, 8);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = `800 8px ${this.fd}`;
    ctx.textAlign = "center";
    ctx.fillText(symbol, x, y + 3);
  }

  // The pop-up: the five constellations as a roster strip between the two fighters (each fighter's cursor in their colour with a P tag over it, a
  // gold frame once locked), and under it in each lower corner a gold plate with the focused constellation's name and what it grants.
  // On a phone only the player's own plate is drawn, larger.
  private pick(ctx: CanvasRenderingContext2D, s: Snapshot, now: number, z: number, info: HudArgs) {
    const a = s.arena!;
    const compact = z > 1.25;
    const pop = ease(Math.min(1, s.phaseT / 14));
    const k = compact ? 1.4 : 1;
    const T = 52 * k, G = 5 * k, P = 10 * k;
    const sw = 5 * T + 4 * G + 2 * P, sh = T + 2 * P;
    const sx = (ARENA.w - sw) / 2, sy = (compact ? 300 : 398) + (1 - pop) * 90;
    ctx.save();
    // The strip.
    const lean = P * 0.8;
    const body = slab(sx, sy, sw, sh, [lean, 0, lean, 0]);
    plate(ctx, body, UI.black, "rgba(255,255,255,.9)", 2, 5);
    ctx.save();
    path(ctx, body);
    ctx.clip();
    brush(ctx, sx, sy, sw, sh);
    ctx.restore();
    CONSTELLATIONS.forEach((id, i) => {
      const by = a.pick.indexOf(id);
      const mine = (sl: Slot) => a.pick[sl] === null && a.cur[sl] === i;
      const focus = ([0, 1] as Slot[]).filter(mine);
      const locked = by >= 0;
      const lift = focus.length || locked ? 6 * k : 0;
      const tx = sx + P + i * (T + G), ty = sy + P - lift;
      ctx.fillStyle = "#1d1d22";
      ctx.fillRect(tx, ty, T, T);
      ctx.save();
      ctx.beginPath();
      ctx.rect(tx, ty, T, T);
      ctx.clip();
      drawStar(ctx, id, tx + T / 2, ty + T / 2, T * 0.96, locked ? 1 : 0.9);
      ctx.restore();
      ctx.strokeStyle = "rgba(255,255,255,.18)";
      ctx.lineWidth = 1;
      ctx.strokeRect(tx + 0.5, ty + 0.5, T - 1, T - 1);
      // The cursors and the lock.
      const pulse = 0.65 + 0.35 * Math.sin(now / 150);
      focus.forEach((sl, n) => {
        ctx.strokeStyle = P_COLOR[sl];
        ctx.globalAlpha = pulse;
        ctx.lineWidth = 3.5;
        const g = 2 + n * 4;
        ctx.strokeRect(tx - g, ty - g, T + 2 * g, T + 2 * g);
        ctx.globalAlpha = 1;
        const tw = 32 * k, th = 17 * k;
        tag(ctx, sl, sl === 0 ? tx - g : tx + T + g - tw, ty - th - g - 3, tw, th, this.fd);
      });
      if (locked) {
        ctx.strokeStyle = UI.gold;
        ctx.lineWidth = 4;
        ctx.strokeRect(tx - 2, ty - 2, T + 4, T + 4);
        const tw = 42 * k, th = 17 * k;
        tag(ctx, by as Slot, tx + (T - tw) / 2, ty - th - 5, tw, th, this.fd, `P${by + 1} ✓`, UI.gold, UI.ink);
      }
    });
    ctx.restore();

    // The gold plates.
    for (const slot of compact ? [info.you] : ([0, 1] as Slot[])) {
      const left = slot === 0;
      const locked = a.pick[slot] !== null;
      const id = a.pick[slot] ?? CONSTELLATIONS[a.cur[slot]];
      const c = starInfo(id);
      const PW = compact ? 400 : 236, PH = compact ? 84 : 72;
      const slide = (1 - pop) * (PW + 20);
      const px = compact ? (ARENA.w - PW) / 2 : left ? -slide : ARENA.w - PW + slide;
      const py = compact ? sy + sh + 42 : ARENA.h - PH;
      ctx.save();
      // The name tab over the plate: who is choosing.
      const nm = `P${slot + 1}  ·  ${info.names[slot].toUpperCase()}`;
      ctx.font = `800 ${compact ? 14 : 11}px ${this.fd}`;
      const tabW = Math.min(PW - 20, ctx.measureText(nm).width + 28), tabH = compact ? 22 : 19;
      const tabX = compact || left ? px : px + PW - tabW;
      plate(ctx, slab(tabX, py - tabH, tabW, tabH, left || compact ? [0, 8, 0, 0] : [8, 0, 0, 0]), UI.black, "rgba(255,255,255,.9)", 1.5);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "left";
      fit(ctx, nm, tabW - 22, compact ? 14 : 11, 800, this.fd, 8);
      ctx.fillText(nm, tabX + 11, py - tabH * 0.3);
      // The plate: gold, the name in heavy black type, what it grants under it, a stripe in the constellation's colour down the slanted edge.
      const cut = compact ? 12 : 10;
      plate(ctx, slab(px, py, PW, PH, compact || left ? [0, cut, 0, 0] : [cut, 0, 0, 0]), UI.gold);
      ctx.fillStyle = starColor(id);
      const sx0 = compact || left ? px + PW - cut - 6 : px + 2;
      ctx.beginPath();
      if (compact || left) {
        ctx.moveTo(sx0, py);
        ctx.lineTo(sx0 + 6, py);
        ctx.lineTo(sx0 + 6 + cut, py + PH);
        ctx.lineTo(sx0 + cut, py + PH);
      } else {
        ctx.moveTo(sx0 + cut, py);
        ctx.lineTo(sx0 + cut + 6, py);
        ctx.lineTo(sx0 + 6, py + PH);
        ctx.lineTo(sx0, py + PH);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = UI.ink;
      const right = !compact && !left;
      ctx.textAlign = right ? "right" : "left";
      const tx = right ? px + PW - 22 : px + 16;
      const ns = fit(ctx, c.name.toUpperCase(), PW - 60, compact ? 40 : 32, 800, this.fd, 14);
      ctx.fillText(c.name.toUpperCase(), tx, py + ns * 0.95 + 6);
      fit(ctx, c.skill, PW - 54, compact ? 15 : 11, 800, this.fb, 8);
      ctx.fillText(c.skill, tx, py + PH - (compact ? 14 : 10));
      if (locked) {
        // The stamp, in the row of the name tab: on the far side of it from the screen's edge.
        const lw = compact ? 92 : 78, lh = tabH;
        const lx = compact || left ? tabX + tabW + 8 : tabX - 8 - lw;
        plate(ctx, slab(lx, py - lh, lw, lh, [5, 0, 5, 0]), UI.gold, UI.ink, 1.5);
        ctx.fillStyle = UI.ink;
        ctx.textAlign = "center";
        ctx.font = `800 ${compact ? 13 : 11}px ${this.fd}`;
        ctx.fillText("LOCKED ✓", lx + lw / 2 + 2, py - lh * 0.3);
      }
      ctx.restore();
    }
    if (compact && a.pick[info.you] === null) {
      // How to choose, on a phone, under the strip.
      ctx.font = `800 13px ${this.fd}`;
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff";
      ctx.lineWidth = 4;
      ctx.strokeStyle = UI.black;
      ctx.strokeText("◀ ▶  CHOOSE    PUNCH  LOCKS IT", ARENA.w / 2, sy + sh + 15);
      ctx.fillText("◀ ▶  CHOOSE    PUNCH  LOCKS IT", ARENA.w / 2, sy + sh + 15);
    }
  }

  // ---------------------------------------------------------------- the banners

  // The big word of a phase ("FIGHT!", "K.O.!", ...): heavy type on a slanted plate, gold for the start, red for the end, black for the rest.
  big(ctx: CanvasRenderingContext2D, text: string, tone: "gold" | "red" | "black", y: number, size: number) {
    ctx.save();
    ctx.font = `800 ${size}px ${this.fd}`;
    ctx.textAlign = "center";
    const w = ctx.measureText(text).width + size * 1.3, h = size * 1.28, c = h * 0.22;
    const fill = tone === "gold" ? UI.gold : tone === "red" ? UI.p1 : UI.black;
    plate(ctx, slab(ARENA.w / 2 - w / 2, y - size * 0.92, w, h, [c, 0, c, 0]), fill, tone === "black" ? "rgba(255,255,255,.92)" : UI.ink, tone === "black" ? 2.5 : 4, size / 9);
    ctx.fillStyle = tone === "gold" ? UI.ink : "#fff";
    ctx.fillText(text, ARENA.w / 2 + c * 0.1, y);
    ctx.restore();
  }

  // ---------------------------------------------------------------- the banners of a guided pause

  // The headline of a guided pause, under the HUD: what to do, and who has done it (P1 ✓ / P2 ...).
  private banner(ctx: CanvasRenderingContext2D, cue: Cue, now: number, z: number, y?: number) {
    void now;
    const phone = z > 1.2;
    const size = Math.round(30 * Math.min(z, 1.35));
    ctx.font = `800 ${size}px ${this.fd}`;
    const w = ctx.measureText(cue.text).width + 80, h = size + 18, c = h * 0.3;
    const yy = y ?? band(phone).CH * (phone ? z : 1) + h / 2 + 22; // (under the clock's notch)
    ctx.save();
    ctx.translate(ARENA.w / 2, yy);
    ctx.rotate(-0.025);
    ctx.textAlign = "center";
    plate(ctx, slab(-w / 2, -h / 2, w, h, [c, 0, c, 0]), UI.black, "rgba(255,255,255,.92)", 2, 6);
    // The gold line along the foot of the plate.
    ctx.fillStyle = UI.gold;
    path(ctx, [[-w / 2 + c * (5 / h), h / 2 - 5], [w / 2 - c + c * (5 / h), h / 2 - 5], [w / 2 - c, h / 2], [-w / 2, h / 2]]);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillText(cue.text, c * 0.1, size * 0.34 - 2);
    if (cue.target) {
      // Who is in place: P1 / P2 tags, gold with a tick once they are.
      const th = Math.round(16 * Math.min(z, 1.3)), tw = th * 2.5;
      cue.done.forEach((d, slot) => {
        const x = (slot === 0 ? -1 : 1) * (w / 2 - tw / 2 - 18) - tw / 2;
        tag(ctx, slot as Slot, x, h / 2 + 12, tw, th, this.fd, `P${slot + 1} ${d ? "✓" : "…"}`, d ? UI.gold : P_COLOR[slot], d ? UI.ink : "#fff");
      });
    }
    ctx.restore();
  }
}

