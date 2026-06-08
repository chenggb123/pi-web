/**
 * 企业微信 OAuth pending state 管理
 * 用于跨设备登录：桌面端轮询 + 手机扫码回调
 */

interface PendingOAuthState {
  state: string;
  createdAt: number;
  sessionToken: string | null;
}

declare global {
  var __wechatPendingStates: Map<string, PendingOAuthState> | undefined;
}

function getMap(): Map<string, PendingOAuthState> {
  if (!globalThis.__wechatPendingStates) {
    globalThis.__wechatPendingStates = new Map();
    // Clean up expired states every 60s
    setInterval(() => {
      const now = Date.now();
      for (const [key, value] of globalThis.__wechatPendingStates!) {
        if (now - value.createdAt > 5 * 60 * 1000) {
          globalThis.__wechatPendingStates!.delete(key);
        }
      }
    }, 60000);
  }
  return globalThis.__wechatPendingStates;
}

export function getPendingState(state: string): PendingOAuthState | undefined {
  return getMap().get(state);
}

export function setPendingState(state: string, data: PendingOAuthState): void {
  getMap().set(state, data);
}

export function deletePendingState(state: string): void {
  getMap().delete(state);
}
