import { getSessionToken, destroySession, makeClearCookie } from "@/lib/user-auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const token = getSessionToken(req.headers.get("cookie"));
  if (token) destroySession(token);
  return Response.json(
    { success: true },
    { status: 200, headers: { "Set-Cookie": makeClearCookie() } },
  );
}
