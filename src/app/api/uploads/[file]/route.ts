import { readFile } from "fs/promises";
import path from "path";

const MIME: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

// Uploaded drawings live outside /public so they work after `next build` too.
export async function GET(_req: Request, ctx: RouteContext<"/api/uploads/[file]">) {
  const { file } = await ctx.params;
  if (!/^[\w-]+\.(jpg|png|webp|gif)$/.test(file)) return new Response("Not found", { status: 404 });
  try {
    const data = await readFile(path.join(process.cwd(), "uploads", file));
    return new Response(data, {
      headers: { "Content-Type": MIME[file.split(".").pop()!], "Cache-Control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
