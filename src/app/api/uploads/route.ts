import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }

  if (file.size <= 0 || file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "File size must be between 1 byte and 10MB." }, { status: 400 });
  }

  const now = new Date();
  const folder = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads", folder);
  await mkdir(uploadDir, { recursive: true });

  const ext = path.extname(file.name || "").toLowerCase();
  const base = path.basename(file.name || "document", ext);
  const filename = `${Date.now()}-${randomUUID()}-${sanitizeName(base)}${sanitizeName(ext || ".bin")}`;
  const absolutePath = path.join(uploadDir, filename);

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  await writeFile(absolutePath, bytes);

  const publicUrl = `/uploads/${folder}/${filename}`;
  return NextResponse.json({
    url: publicUrl,
    name: file.name,
    size: file.size,
    contentType: file.type
  });
}
