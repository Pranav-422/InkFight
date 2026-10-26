// What each dungeon boss looks like, as data (Sprint 8): the head drawing (SVG path layers, so hair, hats, scars and blindfolds can leave the head circle),
// the outfit drawn on the body (src/game/outfit.ts), the palette from the research's colours, its idle loop (poses.ts) and its aura (render.ts).
// One source for every consumer: the browser builds the head sprite from it (src/game/bossSprite.ts, no PNG round trip), drawStick draws the outfit,
// the renderer reads the palette for the aura and the move effects, and /boss-art/[floor] draws the same head into the PNG used by share cards.
// Nothing in here names the fighter it is a parody of.

import type { MoveName } from "./moves";

// ---------------------------------------------------------------- the head

// A path in the head's box: 300 x 300, the face circle at (150, 150) with radius 72, the character looking to the right (+x). Drawn 15 px down (HEAD_DY),
// so a hat or a spike of hair has room above. fill / stroke are CSS colours; a layer with neither fill nor stroke draws nothing.
export type HeadLayer = { d: string; fill?: string; stroke?: string; sw?: number };
export const HEAD_BOX = 300;
export const HEAD_FACE = { x: 150, y: 165, r: 72 }; // where the face circle sits in the canvas (after the 15 px drop)
export const HEAD_DY = 15;

const INK = "#17171a";
const num = (n: number) => Math.round(n * 10) / 10;
const circle = (cx: number, cy: number, r: number) => `M${num(cx - r)} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
const ellipse = (cx: number, cy: number, rx: number, ry: number) => `M${num(cx - rx)} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0z`;
const poly = (pts: number[][]) => `M${pts.map(([x, y]) => `${num(x)} ${num(y)}`).join("L")}z`;
const almond = (cx: number, cy: number, w: number, h: number, tilt = 0) => `M${num(cx - w)} ${num(cy + tilt)}Q${cx} ${num(cy - h)} ${num(cx + w)} ${num(cy - tilt)}Q${cx} ${num(cy + h)} ${num(cx - w)} ${num(cy + tilt)}z`;
const face = (fill: string): HeadLayer => ({ d: circle(150, 150, 72), fill, stroke: INK, sw: 12 });
const ink = (d: string, sw = 8, stroke = INK): HeadLayer => ({ d, stroke, sw });
const dot = (cx: number, cy: number, r: number, fill = INK): HeadLayer => ({ d: circle(cx, cy, r), fill });
const eyeWhite = (cx: number, cy: number, rx: number, ry: number): HeadLayer => ({ d: ellipse(cx, cy, rx, ry), fill: "#fff", stroke: INK, sw: 5 });

// ---------------------------------------------------------------- the outfit

// Pieces drawn on the body from the boss's data (src/game/outfit.ts). Colours are CSS colours.
export type Piece =
  | { t: "shorts"; color: string; stripe?: string } // trunks over the thighs
  | { t: "shins"; color: string } // tape bands round the shins
  | { t: "wraps"; color: string } // tape bands round both wrists
  | { t: "gloves"; color: string; cuff?: string } // boxing gloves on both hands
  | { t: "sash"; color: string; tails?: boolean } // a belt at the waist, with the tails flying
  | { t: "coat"; color: string; lining?: string; trim?: string; hem?: "flat" | "zig"; len?: number; open?: boolean; collar?: boolean } // a garment from the shoulders to below the hip
  | { t: "cloth"; color: string; lining?: string; len?: number } // a haori or cape hanging behind, swaying
  | { t: "armband"; color: string } // a band round the upper arm
  | { t: "sleeves"; color: string } // short sleeves over the upper arms
  | { t: "scabbards"; n: number; color: string } // swords at the hip
  | { t: "orbs"; colors: string[] } // little spheres circling behind the shoulders
  | { t: "tattoo"; color: string }; // lines along the near arm

// ---------------------------------------------------------------- the look

export type Palette = {
  main: string; // the colour of its moves' effects (replaces the arena's red / blue in them)
  sub: string; // the second effect colour
  glow: string; // the aura's colour
  core: string; // the bright middle of an effect
  ink: string; // the stroke colour of its stickman
  ult?: string; // the colour of its ultimate's effects, when it isn't the main one
};

export type AuraKind = "heat" | "cracks" | "ghost" | "smoke" | "lightning" | "flame" | "steam" | "rings" | "ki" | "clock";

export type BossLook = {
  floor: number;
  palette: Palette;
  idle: string; // poses.ts BOSS_IDLE
  aura: AuraKind;
  head: HeadLayer[];
  outfit: Piece[];
  stretch?: MoveName[]; // moves whose limb is drawn out to the length of the reach (the rubber man)
  sheathes?: boolean; // its sword stays in the scabbard between swings (the sheathed swordsman)
  hover?: boolean;
};

const looks: BossLook[] = [
  // ---------------------------------------------------------------- 1. Brass Shin: a bruiser with a rope headband and orange trunks
  {
    floor: 1,
    palette: { main: "#ff5500", sub: "#ffb066", glow: "#ff7a1a", core: "#fff1dc", ink: "#222222" },
    idle: "brawler",
    aura: "heat",
    head: [
      ink("M84 112Q40 104 14 144", 14, "#ff5500"),
      ink("M84 120Q50 134 32 188", 12, "#ff5500"),
      face("#f0cfae"),
      { d: circle(86, 160, 12), fill: "#f0cfae", stroke: INK, sw: 7 },
      { d: poly([[78, 140], [70, 104], [80, 76], [92, 52], [108, 72], [120, 40], [136, 68], [152, 34], [168, 66], [186, 44], [196, 70], [216, 58], [212, 88], [228, 108], [224, 134], [208, 118], [198, 104], [182, 114], [168, 100], [152, 114], [136, 102], [120, 116], [106, 106], [92, 126]]), fill: "#232326", stroke: INK, sw: 7 },
      ink("M72 108Q150 92 228 110", 22, INK),
      ink("M72 108Q150 92 228 110", 16, "#ff5500"),
      ink("M74 102Q150 86 226 104", 4, "#ffe0c8"),
      { d: circle(78, 110, 12), fill: "#ff5500", stroke: INK, sw: 5 },
      ink("M124 134L168 142M184 142L222 132", 11),
      eyeWhite(150, 156, 11, 8),
      eyeWhite(200, 156, 11, 8),
      dot(154, 157, 4.5),
      dot(204, 157, 4.5),
      ink("M190 116L204 178", 6, "#c0392b"),
      ink("M184 140l16 -4M186 154l16 -4M190 168l14 -4", 4, "#c0392b"),
      ink("M226 152Q238 166 224 174", 6),
      ink("M158 198Q186 190 214 200", 9),
    ],
    outfit: [
      { t: "shorts", color: "#ff5500", stripe: "#ffffff" },
      { t: "shins", color: "#ffffff" },
      { t: "wraps", color: "#ffffff" },
    ],
  },
  // ---------------------------------------------------------------- 2. Crosshatch: a scarred wanderer, a red sash, an arm covered in lines
  {
    floor: 2,
    palette: { main: "#4444ff", sub: "#ff0000", glow: "#ff3b3b", core: "#e8eeff", ink: "#2b1d18" },
    idle: "grappler",
    aura: "cracks",
    head: [
      face("#8d5b3d"),
      { d: circle(86, 160, 12), fill: "#8d5b3d", stroke: INK, sw: 7 },
      { d: poly([[72, 134], [66, 96], [76, 62], [88, 30], [104, 58], [112, 20], [128, 52], [144, 14], [158, 48], [176, 18], [184, 52], [206, 28], [206, 62], [230, 50], [222, 88], [236, 108], [224, 128], [210, 110], [196, 100], [180, 108], [166, 94], [150, 104], [134, 92], [118, 106], [100, 98], [88, 120]]), fill: "#17131a", stroke: INK, sw: 7 },
      { d: almond(150, 148, 22, 12, 2), fill: "#fff", stroke: INK, sw: 5 },
      { d: almond(202, 148, 22, 12, 2), fill: "#fff", stroke: INK, sw: 5 },
      dot(154, 148, 8, "#d11a1a"),
      dot(206, 148, 8, "#d11a1a"),
      dot(156, 148, 3.5),
      dot(208, 148, 3.5),
      ink("M122 126L174 138M184 138L228 124", 12),
      ink("M120 100L196 196", 17, "#5a3420"),
      ink("M206 98L110 190", 17, "#5a3420"),
      ink("M120 100L196 196", 9, "#ecc4aa"),
      ink("M206 98L110 190", 9, "#ecc4aa"),
      ink("M162 206Q190 200 214 208", 9),
    ],
    outfit: [
      { t: "coat", color: "#2a2328", trim: "#cc2222", hem: "flat", len: 0.3, open: true },
      { t: "sash", color: "#cc2222", tails: true },
      { t: "tattoo", color: "#d63030" },
    ],
  },
  // ---------------------------------------------------------------- 3. Pip Punchline: a boxer with a cowlick and a plaster on his cheek
  {
    floor: 3,
    palette: { main: "#888888", sub: "#e5482d", glow: "#aaaaaa", core: "#ffffff", ink: "#17171a" },
    idle: "boxer",
    aura: "ghost",
    head: [
      face("#f7dbc3"),
      { d: circle(86, 160, 12), fill: "#f7dbc3", stroke: INK, sw: 7 },
      { d: poly([[76, 136], [70, 100], [84, 72], [108, 58], [132, 62], [150, 56], [170, 62], [196, 58], [216, 76], [226, 102], [222, 128], [210, 112], [198, 100], [184, 110], [170, 96], [152, 108], [134, 96], [118, 108], [102, 98], [90, 118]]), fill: "#17171a", stroke: INK, sw: 7 },
      { d: "M184 66Q214 14 246 40Q226 36 214 64Z", fill: "#17171a", stroke: INK, sw: 6 },
      ink("M128 126L166 124M186 124L224 126", 11),
      { d: circle(150, 150, 15), fill: "#fff", stroke: INK, sw: 5 },
      { d: circle(204, 150, 15), fill: "#fff", stroke: INK, sw: 5 },
      dot(156, 152, 8),
      dot(210, 152, 8),
      dot(159, 148, 3, "#fff"),
      dot(213, 148, 3, "#fff"),
      { d: circle(134, 186, 12), fill: "rgba(255,120,110,.5)" },
      { d: poly([[196, 172], [238, 186], [230, 208], [188, 194]]), fill: "#fff", stroke: INK, sw: 5 },
      dot(212, 190, 2.5),
      dot(224, 195, 2.5),
      ink("M164 196Q186 206 208 194", 8),
    ],
    outfit: [
      { t: "shorts", color: "#2f5be0", stripe: "#ffffff" },
      { t: "gloves", color: "#e5482d", cuff: "#ffffff" },
      { t: "sash", color: "#ffffff" },
    ],
  },
  // ---------------------------------------------------------------- 4. Pale Ogre: long black hair over one eye, white pupils on black, little horns
  {
    floor: 4,
    palette: { main: "#ff0033", sub: "#ffffff", glow: "#ff0033", core: "#ffffff", ink: "#14101a" },
    idle: "counter",
    aura: "smoke",
    head: [
      { d: poly([[86, 100], [58, 150], [50, 214], [72, 252], [98, 214], [104, 150]]), fill: "#0e0b12", stroke: INK, sw: 6 },
      face("#ece6f1"),
      { d: poly([[72, 150], [62, 100], [76, 64], [104, 42], [140, 32], [176, 38], [206, 56], [222, 88], [224, 118], [206, 98], [186, 92], [170, 120], [150, 102], [132, 130], [116, 164], [104, 204], [90, 238], [78, 210], [70, 180]]), fill: "#0e0b12", stroke: INK, sw: 6 },
      { d: poly([[146, 40], [168, 42], [176, 100], [158, 104]]), fill: "#f3f3f6" },
      { d: "M120 70L114 32L148 60z", fill: "#fff", stroke: INK, sw: 5 },
      { d: "M178 64L194 28L208 72z", fill: "#fff", stroke: INK, sw: 5 },
      { d: almond(206, 150, 22, 13), fill: "#0a0a0a", stroke: "#ff0033", sw: 4 },
      dot(210, 150, 6.5, "#fff"),
      { d: almond(158, 152, 16, 10), fill: "#0a0a0a", stroke: "#ff0033", sw: 3 },
      dot(160, 152, 5, "#fff"),
      ink("M208 168L203 198", 6, "#ff0033"),
      ink("M170 206L216 202", 7),
      { d: "M196 203L202 217L209 202z", fill: "#fff", stroke: INK, sw: 3 },
    ],
    outfit: [
      { t: "coat", color: "#14101a", lining: "#ff0033", trim: "#ffffff", hem: "flat", len: 0.75, open: true, collar: true },
      { t: "armband", color: "#ff0033" },
    ],
  },
  // ---------------------------------------------------------------- 5. Yellow Streak: yellow lightning hair, closed eyes, worried brows, a drop of sweat
  {
    floor: 5,
    palette: { main: "#ffff00", sub: "#ffffff", glow: "#fff27a", core: "#ffffff", ink: "#3b2f00" },
    idle: "sheathed",
    aura: "lightning",
    head: [
      face("#f7dcc4"),
      { d: poly([[68, 170], [60, 122], [72, 86], [96, 60], [110, 30], [126, 62], [148, 22], [166, 60], [190, 30], [200, 64], [226, 48], [222, 86], [238, 108], [226, 130], [232, 152], [212, 142], [200, 116], [184, 128], [170, 104], [154, 126], [138, 104], [122, 130], [108, 108], [94, 140], [88, 176]]), fill: "#ffd21f", stroke: INK, sw: 7 },
      { d: poly([[100, 50], [110, 30], [122, 54]]), fill: "#ff9a00" },
      { d: poly([[138, 44], [148, 22], [160, 48]]), fill: "#ff9a00" },
      { d: poly([[180, 50], [190, 30], [198, 56]]), fill: "#ff9a00" },
      { d: poly([[212, 66], [226, 48], [222, 80]]), fill: "#ff9a00" },
      ink("M122 132L170 118M184 118L230 134", 9),
      ink("M126 152Q148 168 170 152M184 152Q206 168 228 152", 8),
      { d: circle(134, 182, 12), fill: "rgba(255,130,140,.55)" },
      { d: circle(216, 182, 12), fill: "rgba(255,130,140,.55)" },
      ink("M168 204Q178 194 188 204Q198 214 208 202", 7),
      { d: "M86 124Q72 148 86 156Q102 148 86 124z", fill: "#7ec8ff", stroke: INK, sw: 4 },
    ],
    outfit: [
      { t: "cloth", color: "#ffd21f", lining: "#ff9a00", len: 0.62 },
      { t: "scabbards", n: 1, color: "#3b2f00" },
    ],
    sheathes: true,
  },
  // ---------------------------------------------------------------- 6. Triple Nib: green hair, a scarred closed eye, three earrings, a sword in his teeth
  {
    floor: 6,
    palette: { main: "#00ff66", sub: "#ff0044", glow: "#00cc55", core: "#f0fff0", ink: "#0f1f17" },
    idle: "ronin",
    aura: "flame",
    head: [
      face("#efc49c"),
      { d: circle(86, 162, 12), fill: "#efc49c", stroke: INK, sw: 7 },
      dot(80, 160, 6, "#ffd23f"),
      dot(78, 176, 6, "#ffd23f"),
      dot(80, 192, 6, "#ffd23f"),
      { d: poly([[76, 138], [70, 102], [82, 72], [96, 50], [110, 70], [126, 40], [140, 66], [160, 36], [172, 64], [194, 44], [200, 70], [222, 64], [216, 94], [230, 112], [222, 134], [208, 116], [196, 104], [180, 114], [166, 100], [150, 114], [132, 102], [118, 114], [104, 106], [90, 126]]), fill: "#2f9e44", stroke: INK, sw: 7 },
      ink("M122 130L168 138M184 134L228 120", 11),
      ink("M130 154Q150 166 170 154", 8),
      { d: almond(206, 150, 20, 11), fill: "#fff", stroke: INK, sw: 5 },
      dot(210, 150, 6),
      ink("M146 112L156 192", 7, "#b3261e"),
      { d: "M168 196L192 196L192 210L168 210z", fill: "#1f3d27", stroke: INK, sw: 5 },
      { d: "M190 190L198 190L198 216L190 216z", fill: "#ffd23f", stroke: INK, sw: 4 },
      { d: "M198 198L278 198L290 203.5L278 209L198 209z", fill: "#e8eef2", stroke: INK, sw: 5 },
      ink("M150 206L168 204", 8),
    ],
    outfit: [
      { t: "sash", color: "#1f8a3a", tails: true },
      { t: "armband", color: "#111111" },
      { t: "scabbards", n: 2, color: "#111111" },
    ],
  },
  // ---------------------------------------------------------------- 7. Rubber Bo: a straw hat, a scar under the eye, a grin as wide as the page
  {
    floor: 7,
    palette: { main: "#ff2200", sub: "#ffc0cb", glow: "#ff6a4d", core: "#fff0f0", ink: "#1a1a1a" },
    idle: "rubber",
    aura: "steam",
    head: [
      face("#f6cfa6"),
      { d: poly([[78, 132], [66, 120], [76, 150], [90, 136]]), fill: "#17171a" },
      { d: poly([[222, 132], [236, 118], [228, 152], [212, 138]]), fill: "#17171a" },
      ink("M128 130L166 128M186 128L224 130", 10),
      { d: ellipse(152, 152, 8, 12), fill: INK },
      { d: ellipse(206, 152, 8, 12), fill: INK },
      dot(154, 147, 3, "#fff"),
      dot(208, 147, 3, "#fff"),
      ink("M138 178L158 184M142 190l14 -2M144 170l12 6", 5, "#b3261e"),
      { d: "M142 184Q186 246 232 180Q186 194 142 184z", fill: "#6b1d1d", stroke: INK, sw: 7 },
      { d: "M150 186Q186 200 224 186L220 198Q186 210 154 198z", fill: "#fff" },
      { d: "M84 96Q86 26 150 24Q214 26 216 96z", fill: "#f2d27a", stroke: INK, sw: 8 },
      ink("M86 82Q150 100 214 82", 18, "#e5482d"),
      { d: ellipse(150, 98, 132, 24), fill: "#f2d27a", stroke: INK, sw: 8 },
      ink("M44 98Q150 118 256 98", 3, "#c9a24d"),
    ],
    outfit: [
      { t: "coat", color: "#ff2200", hem: "flat", len: 0.12, open: true },
      { t: "shorts", color: "#2f5be0" },
      { t: "sash", color: "#f2c14e", tails: true },
    ],
    stretch: ["pistol", "bazooka", "whip"],
  },
  // ---------------------------------------------------------------- 8. Asymptote: white spiky hair, a black blindfold, pale and calm
  {
    floor: 8,
    palette: { main: "#00aaff", sub: "#ff2200", glow: "#6cc8ff", core: "#ffffff", ink: "#1b2733", ult: "#800080" },
    idle: "limitless",
    aura: "rings",
    head: [
      ink("M80 142Q34 146 18 186", 12, "#10151f"),
      ink("M82 152Q46 172 44 210", 10, "#10151f"),
      face("#f6ecee"),
      { d: poly([[74, 150], [64, 104], [70, 66], [84, 36], [100, 62], [112, 22], [130, 56], [150, 10], [166, 52], [188, 18], [196, 56], [222, 36], [218, 74], [240, 86], [228, 112], [236, 140], [220, 132], [208, 108], [190, 116], [176, 92], [160, 112], [144, 90], [128, 112], [112, 94], [98, 122], [84, 136]]), fill: "#fafaff", stroke: INK, sw: 7 },
      ink("M110 66L104 98M148 44L142 84M186 52L180 86", 4, "#aac4e8"),
      ink("M70 146L230 132", 42, "#10151f"),
      ink("M96 138L112 136M190 130L206 128", 3, "#00aaff"),
      ink("M226 156q8 8 -2 14", 6),
      ink("M172 202Q196 210 220 192", 8),
    ],
    outfit: [
      { t: "coat", color: "#1b2733", trim: "#2c3e55", hem: "flat", len: 0.4, collar: true },
      { t: "orbs", colors: ["#00aaff", "#ff2200", "#8800cc"] },
    ],
    hover: true,
  },
  // ---------------------------------------------------------------- 9. Saffron Spike: enormous black spikes, a cheerful grin, an orange gi
  {
    floor: 9,
    palette: { main: "#00ccff", sub: "#ffd700", glow: "#33d6ff", core: "#ffffff", ink: "#1a1a1a" },
    idle: "turtle",
    aura: "ki",
    head: [
      face("#f4cba0"),
      { d: poly([[72, 150], [58, 104], [62, 64], [40, 30], [84, 46], [84, 4], [116, 40], [130, -8], [154, 38], [180, -6], [190, 42], [224, 8], [220, 52], [254, 34], [238, 78], [256, 110], [228, 118], [222, 148], [208, 112], [196, 100], [182, 112], [168, 96], [152, 110], [136, 94], [120, 112], [104, 100], [90, 124]]), fill: "#1a1a22", stroke: INK, sw: 7 },
      ink("M100 40L96 80M150 10L148 60M200 12L196 60", 4, "#3a4a8a"),
      ink("M124 130L170 136M184 136L226 126", 12),
      { d: circle(150, 152, 13), fill: "#fff", stroke: INK, sw: 5 },
      { d: circle(204, 152, 13), fill: "#fff", stroke: INK, sw: 5 },
      dot(155, 153, 7),
      dot(209, 153, 7),
      { d: "M146 184Q184 232 228 180Q186 198 146 184z", fill: "#fff", stroke: INK, sw: 7 },
    ],
    outfit: [
      { t: "sleeves", color: "#ff8800" },
      { t: "coat", color: "#ff8800", trim: "#0044ff", hem: "flat", len: 0.2, open: true },
      { t: "sash", color: "#0044ff", tails: true },
      { t: "armband", color: "#0044ff" },
    ],
  },
  // ---------------------------------------------------------------- 10. The Overdue: swept-back blond hair, a gold headband, glowing eyes, a clock above
  {
    floor: 10,
    palette: { main: "#ffd700", sub: "#8800ff", glow: "#b66bff", core: "#fff7cc", ink: "#2a1b3d" },
    idle: "regal",
    aura: "clock",
    head: [
      { d: poly([[78, 100], [44, 92], [16, 122], [36, 128], [10, 164], [40, 162], [30, 196], [62, 172], [84, 150]]), fill: "#f2d15a", stroke: INK, sw: 6 },
      face("#f2e4d2"),
      { d: circle(86, 160, 12), fill: "#f2e4d2", stroke: INK, sw: 7 },
      dot(82, 176, 5, "#ffd700"),
      { d: poly([[78, 150], [66, 106], [74, 70], [96, 40], [126, 24], [160, 20], [196, 32], [224, 56], [238, 92], [226, 92], [214, 72], [196, 60], [176, 70], [156, 60], [136, 72], [118, 64], [100, 86], [92, 118]]), fill: "#f2d15a", stroke: INK, sw: 7 },
      ink("M110 44L104 80M150 30L146 64M190 40L186 70", 4, "#fff2a8"),
      ink("M76 106Q150 90 224 108", 26, INK),
      ink("M76 106Q150 90 224 108", 16, "#ffd700"),
      { d: circle(188, 98, 10), fill: "#00ffaa", stroke: INK, sw: 5 },
      ink("M120 130L170 140M184 140L228 126", 10),
      { d: almond(150, 152, 22, 11), fill: "#fff", stroke: INK, sw: 5 },
      { d: almond(204, 152, 22, 11), fill: "#fff", stroke: INK, sw: 5 },
      dot(154, 152, 8, "#00ffaa"),
      dot(208, 152, 8, "#00ffaa"),
      dot(156, 152, 3.5),
      dot(210, 152, 3.5),
      ink("M170 200Q198 210 224 192", 8),
      { d: "M206 200L212 214L218 196z", fill: "#fff", stroke: INK, sw: 3 },
    ],
    outfit: [
      { t: "cloth", color: "#d4a800", lining: "#8800ff", len: 0.85 },
      { t: "coat", color: "#1b1233", trim: "#ffd700", hem: "flat", len: 0.2, open: true, collar: true },
      { t: "sash", color: "#ffd700" },
      { t: "armband", color: "#ffd700" },
    ],
  },
];

export const BOSS_LOOKS: readonly BossLook[] = looks;
export const bossLook = (floor: number): BossLook | null => looks[floor - 1] ?? null;
// The look behind an image URL (a boss's `imageUrl` is /boss-art/<floor>), or null for everyone else.
export function bossLookOf(url: string | null | undefined): BossLook | null {
  const m = /^\/boss-art\/(\d{1,2})(?:\?.*)?$/.exec(url ?? "");
  return m ? bossLook(Number(m[1])) : null;
}
