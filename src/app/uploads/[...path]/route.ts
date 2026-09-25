import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  ".csv": "text/csv", ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".jpeg": "image/jpeg", ".jpg": "image/jpeg", ".pdf": "application/pdf",
  ".png": "image/png", ".txt": "text/plain", ".webp": "image/webp",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
};

export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  const segments = (await context.params).path;
  if (!segments.length || segments.some((segment) => !/^[A-Za-z0-9._-]+$/.test(segment) || segment === "." || segment === "..")) {
    return new Response("Not found", { status: 404 });
  }
  const filename = segments[segments.length - 1];
  const contentType = CONTENT_TYPES[path.extname(filename).toLowerCase()];
  if (!contentType) return new Response("Not found", { status: 404 });
  try {
    const root = await realpath(path.join(process.cwd(), "public", "uploads"));
    const file = await realpath(path.join(root, ...segments));
    if (!file.startsWith(root + path.sep)) return new Response("Not found", { status: 404 });
    const info = await stat(file);
    if (!info.isFile() || info.size > 10 * 1024 * 1024) return new Response("Not found", { status: 404 });
    // Uploads are public by design. Read persistent files at request time rather
    // than relying on Next.js's startup inventory of the public directory.
    return new Response(new Uint8Array(await readFile(file)), { headers: {
      "Content-Type": contentType, "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="${filename}"`, "Cache-Control": "no-store"
    } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
