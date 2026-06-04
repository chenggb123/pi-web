import { getUsers, findUser, createUser, updateUser, deleteUser, hashPassword, requireRole } from "@/lib/user-auth";

export const dynamic = "force-dynamic";

// GET /api/admin/users — list all users (admin only)
export async function GET(req: Request) {
  const auth = requireRole(req, "admin");
  if (!auth.ok) return auth.response;
  // Return users without password hashes
  const users = getUsers().map(({ passwordHash: _, ...rest }) => rest);
  return Response.json({ users });
}

// POST /api/admin/users — create a new user (admin only)
export async function POST(req: Request) {
  const auth = requireRole(req, "admin");
  if (!auth.ok) return auth.response;

  let body: { username?: string; password?: string; role?: string };
  try {
    body = (await req.json()) as { username?: string; password?: string; role?: string };
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const username = body.username?.trim();
  const password = body.password?.trim();
  const role = body.role === "admin" ? "admin" : "user";

  if (!username || username.length === 0) {
    return Response.json({ error: "Username is required" }, { status: 400 });
  }
  if (!password || password.length === 0) {
    return Response.json({ error: "Password is required" }, { status: 400 });
  }
  if (findUser(username)) {
    return Response.json({ error: `User "${username}" already exists` }, { status: 409 });
  }

  try {
    const passwordHash = await hashPassword(password);
    const user = createUser(username, passwordHash, role);
    const { passwordHash: _, ...safe } = user;
    return Response.json({ success: true, user: safe }, { status: 201 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

// PUT /api/admin/users — update a user (admin only)
export async function PUT(req: Request) {
  const auth = requireRole(req, "admin");
  if (!auth.ok) return auth.response;

  let body: { id?: string; username?: string; password?: string; role?: string };
  try {
    body = (await req.json()) as { id?: string; username?: string; password?: string; role?: string };
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.id) {
    return Response.json({ error: "User ID is required" }, { status: 400 });
  }

  // Prevent admin from changing their own role
  if (body.id === auth.user.id && body.role && body.role !== "admin") {
    return Response.json({ error: "Cannot change your own role" }, { status: 400 });
  }

  const updates: { username?: string; passwordHash?: string; role?: "admin" | "user" } = {};
  if (body.username?.trim()) updates.username = body.username.trim();
  if (body.password?.trim()) {
    updates.passwordHash = await hashPassword(body.password.trim());
  }
  if (body.role === "admin" || body.role === "user") updates.role = body.role;

  const updated = updateUser(body.id, updates);
  if (!updated) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }
  const { passwordHash: _, ...safe } = updated;
  return Response.json({ success: true, user: safe });
}

// DELETE /api/admin/users — delete a user (admin only)
export async function DELETE(req: Request) {
  const auth = requireRole(req, "admin");
  if (!auth.ok) return auth.response;

  let body: { id?: string };
  try {
    body = (await req.json()) as { id?: string };
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.id) {
    return Response.json({ error: "User ID is required" }, { status: 400 });
  }
  if (body.id === auth.user.id) {
    return Response.json({ error: "Cannot delete yourself" }, { status: 400 });
  }

  const ok = deleteUser(body.id);
  if (!ok) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }
  return Response.json({ success: true });
}
