import {
  hasUsers,
  findUser,
  createUser,
  createSession,
  makeSessionCookie,
  verifyPassword,
  hashPassword,
  maybeMigrateFromEnv,
} from "@/lib/user-auth";

export const dynamic = "force-dynamic";

// POST /api/auth/login — login or first-run setup
// Body: { username, password, setup?: boolean }
export async function POST(req: Request) {
  await maybeMigrateFromEnv();

  let body: { username?: string; password?: string; setup?: boolean };
  try {
    body = (await req.json()) as { username?: string; password?: string; setup?: boolean };
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const username = body.username?.trim();
  const password = body.password?.trim();

  if (!username || !password) {
    return Response.json({ error: "Username and password are required" }, { status: 400 });
  }

  // First-run setup mode
  if (body.setup) {
    if (hasUsers()) {
      return Response.json({ error: "Setup already completed" }, { status: 400 });
    }
    if (password.length < 4) {
      return Response.json({ error: "Password must be at least 4 characters" }, { status: 400 });
    }
    try {
      const passwordHash = await hashPassword(password);
      const user = createUser(username, passwordHash, "admin");
      const token = createSession(user.id);
      return Response.json(
        { success: true },
        { status: 200, headers: { "Set-Cookie": makeSessionCookie(token) } },
      );
    } catch (e) {
      return Response.json({ error: String(e) }, { status: 500 });
    }
  }

  // Normal login
  if (!hasUsers()) {
    return Response.json({ error: "No users configured. Use setup mode." }, { status: 400 });
  }

  const user = findUser(username);
  if (!user) {
    return Response.json({ error: "Invalid username or password" }, { status: 401 });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return Response.json({ error: "Invalid username or password" }, { status: 401 });
  }

  const token = createSession(user.id);
  return Response.json(
    { success: true },
    { status: 200, headers: { "Set-Cookie": makeSessionCookie(token) } },
  );
}
