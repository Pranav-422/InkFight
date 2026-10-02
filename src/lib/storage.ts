import "server-only";
import { put } from "@vercel/blob";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

// On Vercel the filesystem is read-only/ephemeral, so drawings go to Vercel Blob.
// Locally (no token) they go to ./uploads and are served by /api/uploads/[file].
export async function saveDrawing(bytes: Buffer, ext: string, contentType: string): Promise<string> {
  const filename = `${randomUUID()}.${ext}`;
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
