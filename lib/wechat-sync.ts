/**
 * 企业微信通讯录同步引擎
 */

import * as db from "@/lib/db";
import { getAccessToken, listDepartments, listUsersByDept, clearTokenCache } from "@/lib/wechat-work";
import type { AppSettings } from "@/app/api/admin/settings/route";

let isSyncing = false;

export async function syncWeChatUsers(settings: AppSettings): Promise<db.WechatSyncState> {
  if (!settings.wechatEnabled || !settings.wechatCorpId || !settings.wechatCorpSecret) {
    return {
      lastSyncAt: new Date().toISOString(),
      lastSyncStatus: "error",
      lastSyncMessage: "WeChat Work is not configured or disabled",
      syncCountCreated: 0,
      syncCountUpdated: 0,
      syncCountDeactivated: 0,
    };
  }

  if (isSyncing) {
    return { ...db.readSyncState(), lastSyncMessage: "Sync already in progress" };
  }

  isSyncing = true;
  let created = 0;
  let updated = 0;
  let deactivated = 0;

  try {
    // Get access token
    const token = await getAccessToken(settings.wechatCorpId, settings.wechatCorpSecret);

    // Get all departments and their users
    const departments = await listDepartments(token);
    const allWechatUsers = new Map<string, { name: string; department?: string; position?: string; phone?: string; avatar?: string }>();

    for (const dept of departments) {
      try {
        const users = await listUsersByDept(token, dept.id, true);
        for (const u of users) {
          if (u.status !== 0 && u.status !== undefined) continue; // skip disabled
          const deptName = u.department?.length
            ? departments.find((d) => d.id === u.department[0])?.name ?? ""
            : "";
          allWechatUsers.set(u.userid, {
            name: u.name,
            department: deptName,
            position: u.position ?? "",
            phone: u.mobile ?? "",
            avatar: u.avatar ?? "",
          });
        }
      } catch {
        // Some departments may not have user list permission
      }
    }

    // Sync: create or update local users
    const localUsers = db.getAllUsers();
    const wechatUserIds = new Set(allWechatUsers.keys());

    for (const [wechatUserId, profile] of allWechatUsers) {
      const existing = localUsers.find((u) => u.wechat_user_id === wechatUserId);
      if (existing) {
        if (existing.deactivated) {
          db.updateUser(existing.id, { deactivated: false });
        }
        db.updateUser(existing.id, {
          display_name: profile.name || existing.display_name,
          department: profile.department || existing.department,
          position: profile.position || existing.position,
          phone: profile.phone || existing.phone,
          avatar: profile.avatar || existing.avatar,
        });
        updated++;
      } else {
        const defaultRole = db.getDefaultRoleId();
        db.createUser(wechatUserId, "", defaultRole, {
          display_name: profile.name || wechatUserId,
          department: profile.department,
          position: profile.position,
          phone: profile.phone,
          avatar: profile.avatar,
          wechat_user_id: wechatUserId,
        });
        created++;
      }
    }

    // Deactivate users removed from WeChat scope
    for (const u of localUsers) {
      if (u.wechat_user_id && !wechatUserIds.has(u.wechat_user_id) && !u.deactivated) {
        db.updateUser(u.id, { deactivated: true });
        deactivated++;
      }
    }

    const state: db.WechatSyncState = {
      lastSyncAt: new Date().toISOString(),
      lastSyncStatus: "success",
      lastSyncMessage: `Synced ${allWechatUsers.size} users: ${created} created, ${updated} updated, ${deactivated} deactivated`,
      syncCountCreated: created,
      syncCountUpdated: updated,
      syncCountDeactivated: deactivated,
    };
    db.writeSyncState(state);
    return state;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const state: db.WechatSyncState = {
      lastSyncAt: new Date().toISOString(),
      lastSyncStatus: "error",
      lastSyncMessage: msg,
      syncCountCreated: created,
      syncCountUpdated: updated,
      syncCountDeactivated: deactivated,
    };
    db.writeSyncState(state);
    return state;
  } finally {
    isSyncing = false;
  }
}

/** Fire-and-forget sync: does not throw, logs to console */
export function syncWeChatUsersAsync(settings: AppSettings): void {
  syncWeChatUsers(settings).then((state) => {
    if (state.lastSyncStatus === "error") {
      console.error("[wechat-sync]", state.lastSyncMessage);
    } else {
      console.log("[wechat-sync]", state.lastSyncMessage);
    }
  }).catch((e) => {
    console.error("[wechat-sync] Unexpected error:", e);
  });
}

/** Check if sync is due (last sync > 24 hours ago) */
export function isSyncDue(): boolean {
  const state = db.readSyncState();
  if (!state.lastSyncAt) return true;
  const lastSync = new Date(state.lastSyncAt).getTime();
  return Date.now() - lastSync > 24 * 60 * 60 * 1000;
}

/** Invalidate token cache when settings change */
export { clearTokenCache } from "@/lib/wechat-work";
