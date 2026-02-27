"use client";

export async function uploadDocument(file: File): Promise<{ url: string; name: string }> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/uploads", {
    method: "POST",
    body: formData
  });

  const data = (await response.json()) as { url?: string; name?: string; error?: unknown };
  if (!response.ok || typeof data.url !== "string") {
    const message = typeof data.error === "string" ? data.error : "File upload failed.";
    throw new Error(message);
  }

  return {
    url: data.url,
    name: typeof data.name === "string" ? data.name : file.name
  };
}
