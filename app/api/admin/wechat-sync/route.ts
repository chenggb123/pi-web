import { requireRole } from "@/lib/user-auth";
import { readSyncState } from "@/lib/db";
import { syncWeChatUsers } from "@/lib/wechat-sync";

export const dynamic = "force-dynamic";

// GET /api/admin/wechat-sync — return sync status
export async function GET(req: Request) {
  const auth = requireRole(req, "users:manage");
  if (!auth.ok) return auth.response;
  return Response.json(readSyncState());
}

// POST /api/admin/wechat-sync — trigger manual sync
export async function POST(req: Request) {
  const auth = requireRole(req, "users:manage");
  if (!auth.ok) return auth.response;

  try {
    // Read settings
    const { existsSync, readFileSync } = await import("fs");
    const { join } = await import("path");
    const { getAgentDir } = await import("@earendil-works/pi-coding-agent");
    const settingsPath = join(getAgentDir(), "app-settings.json");
    if (!existsSync(settingsPath)) {
      return Response.json({ error: "Settings not found" }, { status: 400 });
    }
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
      wechatCorpId?: string; wechatCorpSecret?: string; wechatEnabled?: boolean;
    };

    const state = await syncWeChatUsers(settings);
    return Response.json({ success: true, syncState: state });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
