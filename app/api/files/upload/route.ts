import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { getCurrentUser } from "@/lib/user-auth";

export const dynamic = "force-dynamic";

// POST /api/files/upload
// Body: { files: [{ name: string, data: string (base64) }], cwd?: string }
// Saves files to <cwd>/.pi-uploads/ and returns their paths
export async function POST(req: Request) {
  const user = getCurrentUser(req);
  if (!user) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: { files?: { name: string; data: string }[]; cwd?: string };
  try {
    body = (await req.json()) as { files?: { name: string; data: string }[]; cwd?: string };
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.files?.length) {
    return Response.json({ error: "files array is required" }, { status: 400 });
  }
  if (!body.cwd) {
    return Response.json({ error: "cwd is required" }, { status: 400 });
  }

  const uploadDir = join(body.cwd, ".pi-uploads");
  try {
    mkdirSync(uploadDir, { recursive: true });
  } catch (e) {
    return Response.json({ error: `Failed to create upload directory: ${e}` }, { status: 500 });
  }

  const results: { name: string; path: string }[] = [];

  for (const file of body.files) {
    // Sanitize filename — remove path traversal
    const safeName = file.name.replace(/[/\\:*?"<>|]/g, "_");
    const filePath = join(uploadDir, safeName);

    try {
      const buffer = Buffer.from(file.data, "base64");
      writeFileSync(filePath, buffer);
      results.push({ name: safeName, path: filePath });
    } catch (e) {
      return Response.json({ error: `Failed to save "${safeName}": ${e}` }, { status: 500 });
    }
  }

  return Response.json({ success: true, files: results, uploadDir });
}
