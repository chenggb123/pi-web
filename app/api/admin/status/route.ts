import { hasUsers, getCurrentUser } from "@/lib/user-auth";
import { homedir } from "os";
import { join } from "path";
import { mkdirSync } from "fs";

export const dynamic = "force-dynamic";

function getUserWorkspace(username: string): string {
  const dir = join(homedir(), "pi-cwd", username.toLowerCase());
  mkdirSync(dir, { recursive: true });
  return dir;
}

// GET /api/auth/status — check current authentication status
export async function GET(req: Request) {
  const needsSetup = !hasUsers();
  const user = getCurrentUser(req);

  if (!user) {
    return Response.json({ authenticated: false, needsSetup });
  }

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
    },
    workspace: getUserWorkspace(user.username),
  });
}
