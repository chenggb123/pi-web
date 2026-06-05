import { NextResponse } from "next/server";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { DefaultResourceLoader, getAgentDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { requireRole, getCurrentUser, canManageGlobalSkills } from "@/lib/user-auth";

export const dynamic = "force-dynamic";

// GET /api/skills?cwd=<path>
// Uses DefaultResourceLoader (same logic as AgentSession startup) so settings.json
// skill paths, package skills, and .agents/skills directories are all included.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cwd = searchParams.get("cwd");
  if (!cwd) return NextResponse.json({ error: "cwd required" }, { status: 400 });

  try {
    const loader = new DefaultResourceLoader({ cwd, agentDir: getAgentDir() });
    await loader.reload();
    const { skills, diagnostics } = loader.getSkills();
    return NextResponse.json({ skills, diagnostics });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// PATCH /api/skills — toggle disable-model-invocation on a SKILL.md file
export async function PATCH(req: Request) {
  // Any authenticated user can toggle skills, but only on their scope
  const auth = requireRole(req, "user");
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json() as { filePath: string; disableModelInvocation: boolean };

    // Non-admin users cannot modify global skills
    if (!canManageGlobalSkills(auth.user.id)) {
      const agentDir = getAgentDir();
      if (body.filePath) {
        const normalizedAgent = agentDir.replace(/[/\\]$/, "") + "/";
        const normalizedPath = body.filePath.replace(/\\/g, "/");
        const isGlobal = normalizedPath.startsWith(normalizedAgent) || normalizedPath === agentDir;
        if (isGlobal) {
          return NextResponse.json(
            { error: "Cannot modify global skill. Only project-scoped skills can be edited." },
            { status: 403 },
          );
        }
      }
    }
    const { filePath, disableModelInvocation } = body;
    if (!filePath) return NextResponse.json({ error: "filePath required" }, { status: 400 });
    if (!existsSync(filePath)) return NextResponse.json({ error: "file not found" }, { status: 404 });

    const content = readFileSync(filePath, "utf8");
    const key = "disable-model-invocation";

    // Use parseFrontmatter to check current value, then do a surgical line edit
    // to preserve the original YAML formatting of all other fields.
    const { frontmatter } = parseFrontmatter<Record<string, unknown>>(content);
    const alreadySet = Boolean(frontmatter[key]);

    let updated = content;
    if (disableModelInvocation && !alreadySet) {
      // Add key after the opening --- line
      updated = content.replace(/^---\r?\n/, `---\n${key}: true\n`);
      // If no frontmatter exists, create one
      if (updated === content) updated = `---\n${key}: true\n---\n${content}`;
    } else if (!disableModelInvocation && alreadySet) {
      // Remove the key line entirely
      updated = content.replace(new RegExp(`^${key}\\s*:.*\\r?\\n`, "m"), "");
    }

    writeFileSync(filePath, updated, "utf8");
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
