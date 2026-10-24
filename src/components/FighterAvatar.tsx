"use client";

// The fighter as it looks in the arena: the extracted stickman wearing the drawing's
// head and item, idling, and now and then showing off a move from its style.
// Used on every card and picker, for players' and computer fighters alike.

import { useEffect, useRef } from "react";
import { MOVES, STYLE_INFO, styleOf, type MoveName } from "@/game/moves";
import { normClass } from "@/lib/stats";
import { poseFor } from "@/game/poses";
import { resolvePose, type BoneName } from "@/game/skeleton";
import type { Snapshot } from "@/game/sim";
import { loadSpriteCached, type Sprite } from "@/game/sprite";
import { buildFor, drawStick, solveStick, STICK_REST } from "@/game/stickman";

type AvatarFighter = { imageUrl: string; class: string; item?: string | null; pose?: string | null; rotation?: number; style?: string | null; flipItem?: boolean; def?: number; spd?: number };

const ACCENT: Record<string, string> = { Tank: "#2f5be0", Attacker: "#2f5be0", Fighter: "#e5482d" };

export function FighterAvatar({ fighter, className = "", showcase = true }: { fighter: AvatarFighter; className?: string; showcase?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { imageUrl, pose, rotation, class: cls, item, style, flipItem, def, spd } = fighter;

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    let sprite: Sprite | null = null;
    let alive = true;
    loadSpriteCached(imageUrl, pose, rotation ?? 0, flipItem ?? false)
      .then((s) => alive && (sprite = s))
      .catch(() => {});

    const build = buildFor(def ?? 70, spd ?? 70);
    const chain = STYLE_INFO[styleOf(style, cls)];
    const showMoves: MoveName[] = [...chain.punch, ...chain.kick];
    let limbs: Record<BoneName, number> | null = null;
    let raf = 0, visible = true, last = performance.now(), moveAt = performance.now() + 1500 + Math.random() * 1500, mi = 0;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(frame);
    });
    io.observe(canvas);

    function frame(now: number) {
      raf = 0;
      if (!alive || !visible) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      // Showcase: play one move of the style every few seconds.
      const move = showMoves[mi % showMoves.length];
      const t = Math.floor(((now - moveAt) / 1000) * 60);
      const playing = showcase && t >= 0 && t < MOVES[move].dur;
      if (showcase && t >= MOVES[move].dur) {
        moveAt = now + 2200 + Math.random() * 1800;
        mi++;
      }
      const f = {
        action: playing ? (chain.punch.includes(move) ? "attack" : "kick") : "idle",
        move: playing ? move : null,
        t: Math.max(0, t),
        grounded: true,
        moving: false,
        blocking: false,
        hitN: 0,
      } as unknown as Snapshot["fighters"][number];
      const motion = poseFor(f, "uppercut", now);
      const target = resolvePose(STICK_REST, motion.pose);
      const k = 1 - Math.exp(-Math.min(0.05, (now - last) / 1000) * (playing ? 38 : 22));
      last = now;
      const cur = {} as Record<BoneName, number>;
      for (const name of Object.keys(target) as BoneName[]) {
        const p0 = limbs?.[name] ?? target[name];
        cur[name] = p0 + Math.atan2(Math.sin(target[name] - p0), Math.cos(target[name] - p0)) * k;
      }
      limbs = cur;
      const body = solveStick(cur, build);
      const lift = -Math.max(body.joints.footF.y, body.joints.footB.y);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const scale = (canvas.height * 0.78) / 200;
      ctx.setTransform(scale, 0, 0, scale, canvas.width / 2 - 10 * scale + motion.lunge * scale, canvas.height * 0.93);
      ctx.fillStyle = "rgba(23,23,26,.1)";
      ctx.beginPath();
      ctx.ellipse(0, 4, 46, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.translate(0, lift);
      if (motion.flip) ctx.scale(-1, 1);
      const s: Sprite | null = sprite;
      drawStick(ctx, body, {
        ink: s?.ink ?? "#17171a",
        head: s?.head ?? null,
        prop: s?.prop ?? null,
        cls,
        item,
        accent: ACCENT[normClass(cls)] ?? "#f2b705",
        width: s?.width ?? 7,
        build,
        now,
      });
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => {
      alive = false;
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [imageUrl, pose, rotation, cls, item, style, flipItem, showcase, def, spd]);

  return <canvas ref={ref} className={`block h-full w-full ${className}`} aria-hidden />;
}
