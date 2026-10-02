// Turns a photo of a drawing into a game sprite: paper → transparent, ink kept,
// cropped tight to the figure. Runs in the browser.

export type Sprite = { normal: HTMLCanvasElement; hurt: HTMLCanvasElement; aspect: number };

const MAX_SIDE = 512;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // Vercel Blob images: needed to read pixels from the canvas
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Couldn't load ${url}`));
    img.src = url;
  });
}

function tinted(src: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

export async function loadSprite(url: string): Promise<Sprite> {
  const img = await loadImage(url);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const work = document.createElement("canvas");
  work.width = w;
  work.height = h;
  const ctx = work.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;

  // Paper brightness = 90th percentile luminance, so shadows/off-white paper still vanish.
  const hist = new Uint32Array(256);
  const lum = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < px.length; i += 4, p++) {
    const l = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
    lum[p] = l;
    hist[l]++;
  }
  let paper = 255;
  for (let acc = 0, l = 255; l >= 0; l--) {
    acc += hist[l];
    if (acc >= w * h * 0.1) {
      paper = l;
      break;
    }
  }

  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let p = 0; p < lum.length; p++) {
    const i = p * 4;
    const a = Math.max(0, Math.min(1, (paper - 28 - lum[p]) / 70));
    px[i + 3] = Math.round(a * 255);
    if (a > 0.25) {
      // Deepen faint ink a little so pencil lines read on screen.
      px[i] = Math.round(px[i] * 0.75);
      px[i + 1] = Math.round(px[i + 1] * 0.75);
      px[i + 2] = Math.round(px[i + 2] * 0.75);
      const x = p % w, y = (p / w) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  ctx.putImageData(data, 0, 0);

  if (maxX < 0) {
    // Nothing detected (blank or very low-contrast photo): use the whole image.
    minX = 0; minY = 0; maxX = w - 1; maxY = h - 1;
  }
  const pad = 4;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);

  const normal = document.createElement("canvas");
  normal.width = maxX - minX + 1;
  normal.height = maxY - minY + 1;
  normal.getContext("2d")!.drawImage(work, minX, minY, normal.width, normal.height, 0, 0, normal.width, normal.height);
  return { normal, hurt: tinted(normal, "rgba(229,72,45,.85)"), aspect: normal.width / normal.height };
}
