import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { requireRole, getCurrentUser } from "@/lib/user-auth";

export const dynamic = "force-dynamic";

export interface AppSettings {
  appName?: string;
  wechatCorpId?: string;
  wechatCorpSecret?: string;
  wechatAgentId?: string;
  wechatEnabled?: boolean;
}

function getSettingsPath(): string {
  const d = getAgentDir();
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  return join(d, "app-settings.json");
}

function readSettings(): AppSettings {
  const p = getSettingsPath();
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, "utf8")) as AppSettings; } catch { return {}; }
}

function writeSettings(s: AppSettings): void {
  writeFileSync(getSettingsPath(), JSON.stringify(s, null, 2), "utf8");
}

// GET — anyone can read
export async function GET() {
  return Response.json(readSettings());
}

// PUT — admin only (models:write permission)
export async function PUT(req: Request) {
  const auth = requireRole(req, "models:write");
  if (!auth.ok) return auth.response;

  let body: AppSettings;
  try { body = (await req.json()) as AppSettings; } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const current = readSettings();
  if (body.appName !== undefined) current.appName = body.appName?.trim() || undefined;
  if (body.wechatCorpId !== undefined) current.wechatCorpId = body.wechatCorpId.trim() || undefined;
  if (body.wechatCorpSecret !== undefined) current.wechatCorpSecret = body.wechatCorpSecret.trim() || undefined;
  if (body.wechatAgentId !== undefined) current.wechatAgentId = body.wechatAgentId.trim() || undefined;
  if (body.wechatEnabled !== undefined) current.wechatEnabled = body.wechatEnabled;
  writeSettings(current);
  // Clear WeChat token cache when settings change
  try {
    const { clearTokenCache } = await import("@/lib/wechat-sync");
    clearTokenCache();
  } catch { /* ignore if wechat modules not loaded */ }

  // Trigger initial sync when WeChat is first enabled
  if (body.wechatEnabled && current.wechatCorpId && current.wechatCorpSecret) {
    try {
      const { syncWeChatUsersAsync } = await import("@/lib/wechat-sync");
      syncWeChatUsersAsync(current);
    } catch { /* ignore */ }
  }
  return Response.json({ success: true, settings: current });
}
