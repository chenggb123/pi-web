import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { getAccessToken, getUserInfoByCode, getUserDetail } from "@/lib/wechat-work";
import { findOrCreateWechatUser, createSession, makeSessionCookie } from "@/lib/user-auth";
import { getPendingState, setPendingState, deletePendingState } from "@/lib/wechat-oauth-state";

export const dynamic = "force-dynamic";

function readWechatSettings(): { corpId: string; corpSecret: string } | null {
  try {
    const agentDir = getAgentDir();
    const settingsPath = join(agentDir, "app-settings.json");
    if (!existsSync(settingsPath)) return null;
    const raw = JSON.parse(readFileSync(settingsPath, "utf8")) as {
      wechatEnabled?: boolean; wechatCorpId?: string; wechatCorpSecret?: string;
    };
    if (!raw.wechatEnabled || !raw.wechatCorpId || !raw.wechatCorpSecret) return null;
    return { corpId: raw.wechatCorpId, corpSecret: raw.wechatCorpSecret };
  } catch {
    return null;
  }
}

// GET /api/auth/callback/wechat?code=xxx&state=xxx
// Called by WeChat Work after user scans QR code and authorizes.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return new Response("Missing code or state parameter", { status: 400 });
  }

  // Validate state
  const pending = getPendingState(state);
  if (!pending) {
    return new Response("Login session expired. Please refresh the login page and try again.", { status: 400 });
  }

  const settings = readWechatSettings();
  if (!settings) {
    return new Response("WeChat Work is not configured.", { status: 500 });
  }

  try {
    // Get access token
    const accessToken = await getAccessToken(settings.corpId, settings.corpSecret);

    // Exchange code for user identity
    const userInfo = await getUserInfoByCode(accessToken, code);
    if (!userInfo.UserId) {
      return new Response(
        `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Login Failed</title><style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f5f5f5}.card{background:#fff;padding:32px;border-radius:12px;box-shadow:0 2px 16px rgba(0,0,0,.1);text-align:center;max-width:360px}.card h2{color:#ef4444;margin:0 0 8px}.card p{color:#666;font-size:14px;margin:0}</style></head><body><div class="card"><h2>Login Failed</h2><p>Unable to authenticate. Your WeChat Work account is not a member of this enterprise app.</p></div></body></html>`,
        { headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }

    // Get full user profile
    let profile: { name?: string; department?: string; position?: string; phone?: string; avatar?: string } = {};
    try {
      const detail = await getUserDetail(accessToken, userInfo.UserId);
      profile = {
        name: detail.name,
        position: detail.position,
        phone: detail.mobile,
        avatar: detail.avatar,
      };
    } catch {
      // User info not available, use empty profile
    }

    // Find or create local user
    const user = findOrCreateWechatUser(userInfo.UserId, profile);

    // Check if user is deactivated
    if (user.deactivated) {
      return new Response(
        `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Account Deactivated</title><style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f5f5f5}.card{background:#fff;padding:32px;border-radius:12px;box-shadow:0 2px 16px rgba(0,0,0,.1);text-align:center;max-width:360px}.card h2{color:#ef4444;margin:0 0 8px}.card p{color:#666;font-size:14px;margin:0}</style></head><body><div class="card"><h2>Account Deactivated</h2><p>Your account has been deactivated. Please contact your administrator.</p></div></body></html>`,
        { headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }

    // Create session
    const token = createSession(user.id);

    // Store session token for the polling desktop browser
    // Delete old pending entry and create new one with session
    deletePendingState(state);
    setPendingState(state, { state, createdAt: Date.now(), sessionToken: token });

    // Trigger opportunistic sync
    try {
      const { syncWeChatUsersAsync } = await import("@/lib/wechat-sync");
      const { readFileSync: rfs, existsSync: es } = await import("fs");
      const { getAgentDir: gad } = await import("@earendil-works/pi-coding-agent");
      const { join: j } = await import("path");
      const sp = j(gad(), "app-settings.json");
      if (es(sp)) {
        const raw = JSON.parse(rfs(sp, "utf8")) as { wechatCorpId?: string; wechatCorpSecret?: string; wechatEnabled?: boolean };
        if (raw.wechatEnabled) {
          syncWeChatUsersAsync(raw as { wechatEnabled: boolean; wechatCorpId?: string; wechatCorpSecret?: string });
        }
      }
    } catch { /* ignore */ }

    // Return a success page for the phone browser
    return new Response(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Login Successful</title><style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f5f5f5}.card{background:#fff;padding:32px;border-radius:12px;box-shadow:0 2px 16px rgba(0,0,0,.1);text-align:center;max-width:360px}.card svg{margin-bottom:16px}.card h2{color:#16a34a;margin:0 0 8px}.card p{color:#666;font-size:14px;margin:0}</style></head><body><div class="card"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg><h2>Login Successful</h2><p>You can now close this page and return to your desktop browser.</p></div></body></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Error</title><style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}.card{background:#fff;padding:32px;border-radius:12px;box-shadow:0 2px 16px rgba(0,0,0,.1);text-align:center;max-width:360px}.card h2{color:#ef4444}</style></head><body><div class="card"><h2>Login Error</h2><p>${msg}</p></div></body></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}
