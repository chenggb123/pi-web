import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { buildOAuthUrl } from "@/lib/wechat-work";
import { setPendingState } from "@/lib/wechat-oauth-state";
import QRCode from "qrcode";

export const dynamic = "force-dynamic";

// ── Read settings ──────────────────────────────────────────────────────────────

function readWechatSettings(): { enabled: boolean; corpId: string; corpSecret: string; agentId: string } | null {
  try {
    const agentDir = getAgentDir();
    const settingsPath = join(agentDir, "app-settings.json");
    if (!existsSync(settingsPath)) return null;
    const raw = JSON.parse(readFileSync(settingsPath, "utf8")) as {
      wechatEnabled?: boolean; wechatCorpId?: string; wechatCorpSecret?: string; wechatAgentId?: string;
    };
    if (!raw.wechatEnabled || !raw.wechatCorpId || !raw.wechatCorpSecret) return null;
    return { enabled: true, corpId: raw.wechatCorpId, corpSecret: raw.wechatCorpSecret, agentId: raw.wechatAgentId ?? "" };
  } catch {
    return null;
  }
}

// ── GET handler ────────────────────────────────────────────────────────────────

// GET /api/auth/login/wechat — returns OAuth URL and QR code data URL
export async function GET(req: Request) {
  const settings = readWechatSettings();
  if (!settings) {
    return Response.json({ enabled: false });
  }

  try {
    // Build callback URL from the request
    const url = new URL(req.url);
    const baseUrl = `${url.protocol}//${url.host}`;
    const redirectUri = `${baseUrl}/api/auth/callback/wechat`;

    // Generate state and store pending entry
    const state = crypto.randomUUID();
    setPendingState(state, { state, createdAt: Date.now(), sessionToken: null });

    // Build OAuth URL
    const authUrl = buildOAuthUrl(settings.corpId, redirectUri, state, settings.agentId || undefined);

    // Generate QR code as data URL
    const qrDataUrl = await QRCode.toDataURL(authUrl, {
      width: 256,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });

    return Response.json({ enabled: true, authUrl, qrDataUrl, state });
  } catch (e) {
    return Response.json({ enabled: true, error: String(e) }, { status: 500 });
  }
}
