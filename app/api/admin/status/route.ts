import { hasUsers, getCurrentUser, User } from "@/lib/user-auth";
import { homedir } from "os";
import { join } from "path";
import { mkdirSync } from "fs";

export const dynamic = "force-dynamic";

function getUserWorkspace(user: User): string {
  const dir = join(homedir(), "pi-cwd", user.username.toLowerCase());
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
      displayName: user.displayName,
      department: user.department,
      position: user.position,
      phone: user.phone,
      avatar: user.avatar,
    },
    workspace: getUserWorkspace(user),
  });
}
