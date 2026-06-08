import { hasUsers, getCurrentUser, User } from "@/lib/user-auth";
import { homedir } from "os";
import { join } from "path";
import { mkdirSync, existsSync, writeFileSync } from "fs";

export const dynamic = "force-dynamic";

function getUserWorkspace(user: User): string {
  const dir = join(homedir(), "pi-cwd", user.username.toLowerCase());
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Initialize a new user's workspace on first login */
function ensureWorkspaceInit(user: User, workspace: string): void {
  const markerFile = join(workspace, ".pi", ".initialized");
  if (existsSync(markerFile)) return;

  // Create .pi directory and skills subdirectory
  mkdirSync(join(workspace, ".pi", "skills"), { recursive: true });

  const name = user.displayName || user.username;

  // ── AGENTS.md (workspace root) — auto-loaded by pi agent as session context ──
  const agentsLines = [
    `# ${name}'s Workspace`,
    "",
    "## Profile",
    "",
    `- **Account:** ${user.username}`,
  ];
  if (user.displayName) agentsLines.push(`- **Name:** ${user.displayName}`);
  if (user.position) agentsLines.push(`- **Position:** ${user.position}`);
  if (user.department) agentsLines.push(`- **Department:** ${user.department}`);
  if (user.phone) agentsLines.push(`- **Phone:** ${user.phone}`);
  agentsLines.push("");
  agentsLines.push("## Instructions");
  agentsLines.push("");
  agentsLines.push("Add project-specific instructions, conventions, and rules below.");
  agentsLines.push("The agent reads this file as context for every session in this workspace.");
  agentsLines.push("");
  agentsLines.push("## Memory");
  agentsLines.push("");
  agentsLines.push("User memory is managed by pi extensions and stored in [.pi/memory.md](./.pi/memory.md).");
  agentsLines.push("");

  writeFileSync(join(workspace, "AGENTS.md"), agentsLines.join("\n"), "utf-8");

  // ── .pi/memory.md — managed by pi extensions for automatic user memory ──
  const memoryLines = [
    `# ${name}'s Memory`,
    "",
    "> This file is managed by pi extensions. User memories are automatically recorded here.",
    "",
  ];

  writeFileSync(join(workspace, ".pi", "memory.md"), memoryLines.join("\n"), "utf-8");

  // Mark as initialized
  writeFileSync(markerFile, new Date().toISOString(), "utf-8");
}

// GET /api/auth/status — check current authentication status
export async function GET(req: Request) {
  const needsSetup = !hasUsers();
  const user = getCurrentUser(req);
  // Check if WeChat Work login is enabled
  let wechatEnabled = false;
  try {
    const { readFileSync, existsSync } = await import("fs");
    const { getAgentDir } = await import("@earendil-works/pi-coding-agent");
    const { join } = await import("path");
    const settingsPath = join(getAgentDir(), "app-settings.json");
    if (existsSync(settingsPath)) {
      const raw = JSON.parse(readFileSync(settingsPath, "utf8")) as { wechatEnabled?: boolean };
      wechatEnabled = raw.wechatEnabled === true;
    }
  } catch { /* ignore */ }

  if (!user) {
    return Response.json({ authenticated: false, needsSetup, wechatEnabled });
  }

  const workspace = getUserWorkspace(user);

  // Initialize workspace on first login (creates AGENTS.md + .pi/skills/)
  ensureWorkspaceInit(user, workspace);

  // Get user permissions from the role
  const { getUserRole } = await import("@/lib/db");
  const role = getUserRole(user.id);
  const permissions = role?.permissions ?? [];

  return Response.json({
    authenticated: true,
    needsSetup: false,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      permissions,
      displayName: user.displayName,
      department: user.department,
      position: user.position,
      phone: user.phone,
      avatar: user.avatar,
    },
    workspace,
  });
}
