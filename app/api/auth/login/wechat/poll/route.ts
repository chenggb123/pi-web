import { getPendingState, deletePendingState } from "@/lib/wechat-oauth-state";
import { makeSessionCookie } from "@/lib/user-auth";

export const dynamic = "force-dynamic";

// GET /api/auth/login/wechat/poll?state=xxx
// Called by the desktop browser every 2 seconds to check if the user has completed
// the WeChat Work QR code scan on their phone.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const state = url.searchParams.get("state");

  if (!state) {
    return Response.json({ ready: false, error: "Missing state" }, { status: 400 });
  }

  const pending = getPendingState(state);
  if (!pending) {
    // State expired or already consumed
    return Response.json({ ready: false, expired: true });
  }

  if (pending.sessionToken) {
    // Login completed! Return the session cookie and clean up
    const cookie = makeSessionCookie(pending.sessionToken);
    deletePendingState(state);
    return Response.json(
      { ready: true },
      { status: 200, headers: { "Set-Cookie": cookie } },
    );
  }

  // Still waiting
  return Response.json({ ready: false });
}
