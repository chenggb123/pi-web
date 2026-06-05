import { NextResponse } from "next/server";
import { execSync } from "child_process";
import { writeFileSync, mkdirSync, existsSync, unlinkSync, readdirSync, statSync, renameSync, rmSync } from "fs";
import { join, basename } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { requireRole, getCurrentUser, canManageGlobalSkills } from "@/lib/user-auth";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { homedir } from "os";

export const dynamic = "force-dynamic";

function extractZip(zipPath: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true });

  if (process.platform === "win32") {
    // Windows: use PowerShell Expand-Archive
    const cmd = `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force"`;
    execSync(cmd, { encoding: "utf8", timeout: 30000 });
  } else {
    // Unix: use unzip
    const cmd = `unzip -o "${zipPath.replace(/"/g, '\\"')}" -d "${destDir.replace(/"/g, '\\"')}"`;
    execSync(cmd, { encoding: "utf8", timeout: 30000 });
  }
}

/**
 * Flatten: if destDir contains a single top-level folder, move its contents up one level.
 * This handles the common case where a zip has a root folder like "my-skill/" containing SKILL.md.
 */
function flattenSingleFolder(dir: string): void {
  const entries = readdirSync(dir);
  const topDirs = entries.filter((e) => statSync(join(dir, e)).isDirectory());
  const topFiles = entries.filter((e) => statSync(join(dir, e)).isFile());

  // If there's exactly one folder and no files at root, flatten it
  if (topDirs.length === 1 && topFiles.length === 0) {
    const inner = join(dir, topDirs[0]);
    const innerEntries = readdirSync(inner);
    // Move each entry up
    for (const entry of innerEntries) {
      const src = join(inner, entry);
      const dest = join(dir, entry);
      if (existsSync(dest)) {
        rmSync(dest, { recursive: true, force: true });
      }
      renameSync(src, dest);
    }
    rmSync(inner, { recursive: true, force: true });
  }
}

// POST /api/skills/upload — upload a skill zip file
export async function POST(req: Request) {
  const auth = requireRole(req, "user");
  if (!auth.ok) return auth.response;

  const isAdmin = canManageGlobalSkills(auth.user.id);

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const scope = (formData.get("scope") as string) || "personal";

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (!file.name?.toLowerCase().endsWith(".zip")) {
      return NextResponse.json({ error: "Only .zip files are accepted" }, { status: 400 });
    }

    // Regular users can only upload to personal scope
    const effectiveScope = isAdmin ? (scope === "global" ? "global" : "personal") : "personal";

    // Determine target directory
    let targetDir: string;
    if (effectiveScope === "global") {
      targetDir = join(getAgentDir(), "skills");
    } else {
      const userWorkspace = join(homedir(), "pi-cwd", auth.user.username.toLowerCase());
      mkdirSync(userWorkspace, { recursive: true });
      targetDir = join(userWorkspace, ".pi", "skills");
    }

    // Save zip to temp file
    const tmpDir = join(tmpdir(), "pi-skill-upload");
    mkdirSync(tmpDir, { recursive: true });
    const tmpZip = join(tmpDir, `${randomUUID()}.zip`);
    const extractDir = join(tmpDir, randomUUID());

    try {
      // Write temp zip file
      const buffer = Buffer.from(await file.arrayBuffer());
      writeFileSync(tmpZip, buffer);

      // Extract
      extractZip(tmpZip, extractDir);

      // Flatten single-folder zips
      flattenSingleFolder(extractDir);

      // Validate: at least one SKILL.md should exist somewhere
      function hasSkillMd(dir: string): boolean {
        const items = readdirSync(dir);
        for (const item of items) {
          const full = join(dir, item);
          const st = statSync(full);
          if (st.isFile() && item.toUpperCase() === "SKILL.MD") return true;
          if (st.isDirectory() && hasSkillMd(full)) return true;
        }
        return false;
      }

      if (!hasSkillMd(extractDir)) {
        return NextResponse.json(
          { error: "No SKILL.md found in the uploaded zip. A valid skill must contain a SKILL.md file." },
          { status: 400 },
        );
      }

      // Determine skill folder name from the zip filename
      const skillName = basename(file.name, ".zip").replace(/[^a-zA-Z0-9._-]/g, "-");
      const skillDest = join(targetDir, skillName);

      // If destination exists, remove it first
      if (existsSync(skillDest)) {
        rmSync(skillDest, { recursive: true, force: true });
      }

      // Move extracted content to target
      mkdirSync(targetDir, { recursive: true });
      renameSync(extractDir, skillDest);

      return NextResponse.json({
        success: true,
        scope: effectiveScope,
        path: skillDest,
        name: skillName,
      });
    } finally {
      // Cleanup temp files
      try { if (existsSync(tmpZip)) unlinkSync(tmpZip); } catch { /* ignore */ }
      try { if (existsSync(extractDir)) rmSync(extractDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
