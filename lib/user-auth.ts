import { randomBytes, scrypt, timingSafeEqual, createHash } from "crypto";
import * as db from "@/lib/db";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: string;
  createdAt: string;
  displayName: string;
  department: string;
  position: string;
  phone: string;
  avatar: string; // base64 data URL
}

export interface Role {
  id: string;
  label: string;
  permissions: string[];
  is_default: boolean;
}

// ── Password Hashing ───────────────────────────────────────────────────────────

const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_LEN = 32;

function scryptAsync(password: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SCRYPT_SALT_LEN);
  const hash = await scryptAsync(password, salt, SCRYPT_KEYLEN);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (stored.startsWith("sha256:")) {
    const legacyHash = stored.slice(7);
    const submitted = createHash("sha256").update(password).digest("hex");
    if (legacyHash.length !== submitted.length) return false;
    return timingSafeEqual(Buffer.from(legacyHash, "hex"), Buffer.from(submitted, "hex"));
  }
  if (!stored.startsWith("scrypt:")) return false;
  const parts = stored.slice(7).split(":");
  if (parts.length !== 2) return false;
  const salt = Buffer.from(parts[0], "hex");
  const expectedHash = Buffer.from(parts[1], "hex");
  try {
    const actualHash = await scryptAsync(password, salt, SCRYPT_KEYLEN);
    if (actualHash.length !== expectedHash.length) return false;
    return timingSafeEqual(actualHash, expectedHash);
  } catch { return false; }
}

// ── User CRUD ──────────────────────────────────────────────────────────────────

export function hasUsers(): boolean { return db.hasUsers(); }

function toUser(u: db.UserRow): User {
  return {
    id: u.id, username: u.username, passwordHash: u.password_hash, role: u.role_id, createdAt: u.created_at,
    displayName: u.display_name, department: u.department, position: u.position, phone: u.phone, avatar: u.avatar,
  };
}

export function getUsers(): User[] { return db.getAllUsers().map(toUser); }

export function findUser(username: string): User | undefined {
  const u = db.findUserByUsername(username);
  return u ? toUser(u) : undefined;
}

export function findUserById(id: string): User | undefined {
  const u = db.findUserById(id);
  return u ? toUser(u) : undefined;
}

export function createUser(
  username: string, passwordHash: string, role: string,
  opts?: { displayName?: string; department?: string; position?: string; phone?: string; avatar?: string },
): User {
  const u = db.createUser(username, passwordHash, role, {
    display_name: opts?.displayName, department: opts?.department,
    position: opts?.position, phone: opts?.phone, avatar: opts?.avatar,
  });
  return toUser(u);
}

export function updateUser(
  id: string,
  updates: { username?: string; passwordHash?: string; role?: string; displayName?: string; department?: string; position?: string; phone?: string; avatar?: string },
): User | undefined {
  const ok = db.updateUser(id, {
    username: updates.username, password_hash: updates.passwordHash,
    role_id: updates.role, display_name: updates.displayName,
    department: updates.department, position: updates.position,
    phone: updates.phone, avatar: updates.avatar,
  });
  if (!ok) return undefined;
  return findUserById(id);
}

export function deleteUser(id: string): boolean {
  return db.deleteUser(id);
}

// ── Role Management ────────────────────────────────────────────────────────────

export function getAllRoles(): Role[] { return db.getAllRoles(); }

export function saveRole(id: string, label: string, permissions: string[], isDefault: boolean): void {
  db.saveRole(id, label, permissions, isDefault);
}

export function deleteRole(id: string): boolean { return db.deleteRole(id); }

export function getDefaultRoleId(): string { return db.getDefaultRoleId(); }

// ── Permissions ────────────────────────────────────────────────────────────────

export function hasPermission(userId: string, permission: string): boolean {
  return db.hasPermission(userId, permission);
}

export function canManageGlobalSkills(userId: string): boolean {
  return db.hasPermission(userId, "skills:global");
}

export function canManageModels(userId: string): boolean {
  return db.hasPermission(userId, "models:write");
}

export function canManageUsers(userId: string): boolean {
  return db.hasPermission(userId, "users:manage");
}

export function getMaxToolPreset(userId: string): "full" | "default" {
  return db.hasPermission(userId, "agent:full_tools") ? "full" : "default";
}

// ── Session Management ─────────────────────────────────────────────────────────

export function createSession(userId: string): string { return db.createSession(userId); }
export function validateSession(token: string): { userId: string } | null { return db.validateSession(token); }
export function destroySession(token: string): void { db.destroySession(token); }

// ── Cookie Helpers ─────────────────────────────────────────────────────────────

const COOKIE_NAME = "pi-web-session";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function parseCookies(header: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    map[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return map;
}

export function getSessionToken(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  return parseCookies(cookieHeader)[COOKIE_NAME] ?? null;
}

export function makeSessionCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}`;
}

export function makeClearCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0`;
}

// ── Route Helpers ──────────────────────────────────────────────────────────────

export function getCurrentUser(req: Request): User | null {
  const token = getSessionToken(req.headers.get("cookie"));
  if (!token) return null;
  const session = validateSession(token);
  if (!session) return null;
  return findUserById(session.userId) ?? null;
}

export function requireRole(
  req: Request,
  permissionOrRole: string,
): { ok: true; user: User } | { ok: false; response: Response } {
  const token = getSessionToken(req.headers.get("cookie"));
  if (!token) {
    return { ok: false, response: Response.json({ error: "Authentication required" }, { status: 401 }) };
  }
  const session = validateSession(token);
  if (!session) {
    return { ok: false, response: Response.json({ error: "Session expired" }, { status: 401 }) };
  }
  const user = findUserById(session.userId);
  if (!user) {
    return { ok: false, response: Response.json({ error: "User not found" }, { status: 401 }) };
  }

  // Support both legacy role checks ("admin") and new permission checks ("models:write")
  if (permissionOrRole === "admin" || permissionOrRole === "user") {
    // Legacy: check role
    if (permissionOrRole === "user") return { ok: true, user };
    if (user.role !== "admin") {
      return { ok: false, response: Response.json({ error: "Admin access required" }, { status: 403 }) };
    }
  } else {
    // New: check permission
    if (!hasPermission(user.id, permissionOrRole)) {
      return { ok: false, response: Response.json({ error: "Insufficient permissions" }, { status: 403 }) };
    }
  }
  return { ok: true, user };
}

// ── Migration ─────────────────────────────────────────────────────────────────

export async function maybeMigrateFromEnv(): Promise<void> {
  await db.migrateFromJson();
}
