import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

// ── JSON-based storage (lightweight, no native deps) ───────────────────────────

function readJson<T>(filename: string, fallback: T): T {
  const d = getAgentDir();
  const p = join(d, filename);
  if (!existsSync(p)) return fallback;
  try { return JSON.parse(readFileSync(p, "utf8")) as T; } catch { return fallback; }
}

function writeJson<T>(filename: string, data: T): void {
  const d = getAgentDir();
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  writeFileSync(join(d, filename), JSON.stringify(data, null, 2), "utf8");
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface Role {
  id: string; label: string; permissions: string[]; is_default: boolean;
}
export interface UserRow {
  id: string; username: string; password_hash: string; role_id: string; created_at: string;
}
interface SessionEntry { token: string; user_id: string; expires: number; }

interface RolesData { roles: Role[]; defaultRole: string; }
interface UsersData { users: UserRow[]; }
interface SessionsData { sessions: SessionEntry[]; }

// ── Init ───────────────────────────────────────────────────────────────────────

let initialized = false;
function ensureInit(): void {
  if (initialized) return;
  initialized = true;

  const roles = readJson<RolesData>("roles.json", { roles: [], defaultRole: "user" });
  if (roles.roles.length === 0) {
    roles.roles = [
      { id: "admin", label: "Administrator", permissions: ["models:write","skills:write","skills:global","users:manage","agent:full_tools","files:delete"], is_default: true },
      { id: "user", label: "User", permissions: ["skills:write"], is_default: false },
    ];
    roles.defaultRole = "user";
    writeJson("roles.json", roles);
  }

  // Migrate old users.json if needed
  const usersPath = join(getAgentDir(), "users.json");
  if (existsSync(usersPath)) {
    try {
      const old = JSON.parse(readFileSync(usersPath, "utf8")) as { users: Array<{ id: string; username: string; passwordHash: string; role: string; createdAt: string }> };
      if (old.users?.length) {
        const newUsers: UserRow[] = old.users.map((u) => ({
          id: u.id, username: u.username, password_hash: u.passwordHash,
          role_id: u.role === "admin" ? "admin" : "user", created_at: u.createdAt,
        }));
        writeJson("users_db.json", { users: newUsers });
        // Don't delete old file, just stop using it
      }
    } catch { /* ignore */ }
  }
}

// ── Role operations ────────────────────────────────────────────────────────────

function getAllRoles(): Role[] {
  ensureInit();
  return readJson<RolesData>("roles.json", { roles: [], defaultRole: "user" }).roles;
}

function saveRole(id: string, label: string, permissions: string[], isDefault: boolean): void {
  ensureInit();
  const data = readJson<RolesData>("roles.json", { roles: [], defaultRole: "user" });
  const idx = data.roles.findIndex((r) => r.id === id);
  const role: Role = { id, label, permissions, is_default: isDefault };
  if (idx >= 0) data.roles[idx] = role; else data.roles.push(role);
  if (isDefault) data.roles.forEach((r) => { if (r.id !== id) r.is_default = false; });
  data.defaultRole = isDefault ? id : data.defaultRole;
  writeJson("roles.json", data);
}

function deleteRole(id: string): boolean {
  ensureInit();
  const data = readJson<RolesData>("roles.json", { roles: [], defaultRole: "user" });
  if (data.roles.length <= 1) return false;
  data.roles = data.roles.filter((r) => r.id !== id);
  if (data.defaultRole === id) data.defaultRole = data.roles[0].id;
  // Reassign users of deleted role
  const usersData = readJson<UsersData>("users_db.json", { users: [] });
  for (const u of usersData.users) {
    if (u.role_id === id) u.role_id = data.defaultRole;
  }
  writeJson("users_db.json", usersData);
  writeJson("roles.json", data);
  return true;
}

function getUserRole(userId: string): Role | null {
  ensureInit();
  const roles = getAllRoles();
  const users = readJson<UsersData>("users_db.json", { users: [] });
  const user = users.users.find((u) => u.id === userId);
  if (!user) return null;
  return roles.find((r) => r.id === user.role_id) ?? null;
}

function hasPermission(userId: string, permission: string): boolean {
  const role = getUserRole(userId);
  if (!role) return false;
  return role.permissions.includes(permission);
}

function getDefaultRoleId(): string {
  ensureInit();
  return readJson<RolesData>("roles.json", { roles: [], defaultRole: "user" }).defaultRole;
}

// ── User operations ────────────────────────────────────────────────────────────

function getAllUsers(): UserRow[] {
  ensureInit();
  return readJson<UsersData>("users_db.json", { users: [] }).users;
}

function findUserByUsername(username: string): UserRow | undefined {
  return getAllUsers().find((u) => u.username === username);
}

function findUserById(id: string): UserRow | undefined {
  return getAllUsers().find((u) => u.id === id);
}

function createUser(username: string, password_hash: string, role_id: string): UserRow {
  ensureInit();
  const data = readJson<UsersData>("users_db.json", { users: [] });
  const user: UserRow = { id: crypto.randomUUID(), username, password_hash, role_id, created_at: new Date().toISOString() };
  data.users.push(user);
  writeJson("users_db.json", data);
  return user;
}

function updateUser(id: string, updates: { username?: string; password_hash?: string; role_id?: string }): boolean {
  ensureInit();
  const data = readJson<UsersData>("users_db.json", { users: [] });
  const user = data.users.find((u) => u.id === id);
  if (!user) return false;
  if (updates.username) user.username = updates.username;
  if (updates.password_hash) user.password_hash = updates.password_hash;
  if (updates.role_id) user.role_id = updates.role_id;
  writeJson("users_db.json", data);
  return true;
}

function deleteUser(id: string): boolean {
  const data = readJson<UsersData>("users_db.json", { users: [] });
  const idx = data.users.findIndex((u) => u.id === id);
  if (idx < 0) return false;
  data.users.splice(idx, 1);
  writeJson("users_db.json", data);
  // Also clean up sessions
  const sdata = readJson<SessionsData>("sessions.json", { sessions: [] });
  sdata.sessions = sdata.sessions.filter((s) => s.user_id !== id);
  writeJson("sessions.json", sdata);
  return true;
}

function hasUsers(): boolean {
  ensureInit();
  return getAllUsers().length > 0;
}

// ── Session operations ─────────────────────────────────────────────────────────

function createSession(userId: string): string {
  const data = readJson<SessionsData>("sessions.json", { sessions: [] });
  const token = crypto.randomUUID();
  const expires = Date.now() + 24 * 60 * 60 * 1000;
  data.sessions = data.sessions.filter((s) => s.expires > Date.now());
  data.sessions.push({ token, user_id: userId, expires });
  writeJson("sessions.json", data);
  return token;
}

function validateSession(token: string): { userId: string } | null {
  const data = readJson<SessionsData>("sessions.json", { sessions: [] });
  const s = data.sessions.find((s) => s.token === token);
  if (!s || s.expires < Date.now()) return null;
  return { userId: s.user_id };
}

function destroySession(token: string): void {
  const data = readJson<SessionsData>("sessions.json", { sessions: [] });
  data.sessions = data.sessions.filter((s) => s.token !== token);
  writeJson("sessions.json", data);
}

// Legacy env migration
async function migrateFromJson(): Promise<void> {
  ensureInit();
  if (hasUsers()) return;
  const envPwd = process.env.PI_WEB_ADMIN_PASSWORD;
  if (envPwd?.trim()) {
    const { createHash } = await import("crypto");
    const hash = `sha256:${createHash("sha256").update(envPwd.trim()).digest("hex")}`;
    createUser("admin", hash, "admin");
  }
}

export {
  getAllRoles, saveRole, deleteRole, getUserRole, hasPermission, getDefaultRoleId,
  getAllUsers, findUserByUsername, findUserById, createUser, updateUser, deleteUser, hasUsers,
  createSession, validateSession, destroySession, migrateFromJson,
};
