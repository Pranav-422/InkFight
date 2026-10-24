import "server-only";
import { del, put } from "@vercel/blob";
import { randomUUID } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";

// On Vercel the filesystem is read-only/ephemeral, so drawings go to Vercel Blob.
// Locally (no token) they go to ./uploads and are served by /api/uploads/[file].
// prefix "cut-" marks a cut-out figure (not a raw photo), see the admin re-cut tool.
export async function saveDrawing(bytes: Buffer, ext: string, contentType: string, prefix = ""): Promise<string> {
  const filename = `${prefix}${randomUUID()}.${ext}`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`drawings/${filename}`, bytes, { access: "public", contentType });
    return blob.url;
  }
  if (process.env.VERCEL) throw new Error("BLOB_READ_WRITE_TOKEN is missing: connect a Blob store to this Vercel project.");
  const dir = path.join(process.cwd(), "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), bytes);
  return `/api/uploads/${filename}`;
}

// Remove a drawing's file when its fighter is deleted. Starter art in /public is never touched.
export async function deleteDrawing(url: string) {
  try {
    if (url.includes(".blob.vercel-storage.com/") && process.env.BLOB_READ_WRITE_TOKEN) await del(url);
    else if (/^\/api\/uploads\/[\w-]+\.(jpg|png|webp|gif)$/.test(url)) await unlink(path.join(process.cwd(), "uploads", url.split("/").pop()!));
  } catch (err) {
    console.warn("[storage] couldn't delete", url, err); // the fighter is gone either way
  }
}
