import { randomBytes, scrypt, timingSafeEqual, randomUUID, createHash } from "crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  username: string;
  passwordHash: string; // "scrypt:<salt_hex>:<hash_hex>" or "sha256:<hash_hex>" (legacy)
  role: "admin" | "user";
  createdAt: string;
}

interface UsersJson {
  users: User[];
}

export type Role = "admin" | "user";

// ── Configuration ───────────────────────────────────────────────────────────────

const COOKIE_NAME = "pi-web-session";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getUsersPath(): string {
  return join(getAgentDir(), "users.json");
}

// ── User Storage ───────────────────────────────────────────────────────────────

function readUsersJson(): UsersJson {
  const path = getUsersPath();
  if (!existsSync(path)) return { users: [] };
  try {
    const data = JSON.parse(readFileSync(path, "utf8")) as UsersJson;
    return { users: data.users ?? [] };
  } catch {
    return { users: [] };
  }
}

function writeUsersJson(data: UsersJson): void {
  const path = getUsersPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
}

// ── Password Hashing (scrypt) ──────────────────────────────────────────────────

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
  // Legacy: SHA-256 hashes from old admin-auth
  if (stored.startsWith("sha256:")) {
    const legacyHash = stored.slice(7);
    const submitted = createHash("sha256").update(password).digest("hex");
    if (legacyHash.length !== submitted.length) return false;
    return timingSafeEqual(Buffer.from(legacyHash, "hex"), Buffer.from(submitted, "hex"));
  }

  // scrypt format: "scrypt:<salt_hex>:<hash_hex>"
  if (!stored.startsWith("scrypt:")) return false;
  const parts = stored.slice(7).split(":");
  if (parts.length !== 2) return false;
  const salt = Buffer.from(parts[0], "hex");
  const expectedHash = Buffer.from(parts[1], "hex");
  try {
    const actualHash = await scryptAsync(password, salt, SCRYPT_KEYLEN);
    if (actualHash.length !== expectedHash.length) return false;
    return timingSafeEqual(actualHash, expectedHash);
  } catch {
    return false;
  }
}

// ── User CRUD ──────────────────────────────────────────────────────────────────

export function hasUsers(): boolean {
  return readUsersJson().users.length > 0;
}

export function getUsers(): User[] {
  return readUsersJson().users;
}

export function findUser(username: string): User | undefined {
  return getUsers().find((u) => u.username === username);
}

export function findUserById(id: string): User | undefined {
  return getUsers().find((u) => u.id === id);
}

export function createUser(username: string, passwordHash: string, role: Role): User {
  const data = readUsersJson();
  const user: User = {
    id: randomUUID(),
    username,
    passwordHash,
    role,
    createdAt: new Date().toISOString(),
  };
  data.users.push(user);
  writeUsersJson(data);
  return user;
}

export function updateUser(
  id: string,
  updates: { username?: string; passwordHash?: string; role?: Role },
): User | undefined {
  const data = readUsersJson();
  const idx = data.users.findIndex((u) => u.id === id);
  if (idx === -1) return undefined;
  data.users[idx] = { ...data.users[idx], ...updates };
  writeUsersJson(data);
  return data.users[idx];
}

export function deleteUser(id: string): boolean {
  const data = readUsersJson();
  const idx = data.users.findIndex((u) => u.id === id);
  if (idx === -1) return false;
  data.users.splice(idx, 1);
  writeUsersJson(data);
  return true;
}

// ── Backward compatibility: auto-migrate from PI_WEB_ADMIN_PASSWORD ────────────

export async function maybeMigrateFromEnv(): Promise<void> {
  if (hasUsers()) return;
  const envPwd = process.env.PI_WEB_ADMIN_PASSWORD;
  if (!envPwd || envPwd.trim().length === 0) return;
  // Create admin user from env password using legacy SHA-256 format
  const legacyHash = `sha256:${createHash("sha256").update(envPwd.trim()).digest("hex")}`;
  createUser("admin", legacyHash, "admin");
  console.log("[user-auth] Migrated PI_WEB_ADMIN_PASSWORD → admin user");
}

// ── Session Store (globalThis survives Next.js HMR) ────────────────────────────

interface SessionEntry {
  userId: string;
  expires: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __piUserSessions: Map<string, SessionEntry> | undefined;
}

function getSessionStore(): Map<string, SessionEntry> {
  if (!globalThis.__piUserSessions) {
    globalThis.__piUserSessions = new Map();
  }
  return globalThis.__piUserSessions;
}

export function createSession(userId: string): string {
  const token = randomUUID();
  const store = getSessionStore();
  store.set(token, { userId, expires: Date.now() + SESSION_TTL_MS });
  // Lazy cleanup
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.expires < now) store.delete(k);
  }
  return token;
}

export function validateSession(token: string): { userId: string } | null {
  const store = getSessionStore();
  const entry = store.get(token);
  if (!entry || entry.expires < Date.now()) {
    store.delete(token);
    return null;
  }
  return { userId: entry.userId };
}

export function destroySession(token: string): void {
  getSessionStore().delete(token);
}

// ── Cookie Helpers ─────────────────────────────────────────────────────────────

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

// ── Permission Helpers ─────────────────────────────────────────────────────────

export function getMaxToolPreset(user: User): "full" | "default" {
  return user.role === "admin" ? "full" : "default";
}

export function canManageGlobalSkills(user: User): boolean {
  return user.role === "admin";
}

export function canManageModels(user: User): boolean {
  return user.role === "admin";
}

export function canManageUsers(user: User): boolean {
  return user.role === "admin";
}

// ── Route Helpers ──────────────────────────────────────────────────────────────

/** Get the current user from request cookies, or null if not authenticated. */
export function getCurrentUser(req: Request): User | null {
  const token = getSessionToken(req.headers.get("cookie"));
  if (!token) return null;
  const session = validateSession(token);
  if (!session) return null;
  return findUserById(session.userId) ?? null;
}

/**
 * Check that the request has a valid session with the required role.
 * Returns either ok or a 401/403 Response.
 */
export function requireRole(
  req: Request,
  role: Role,
): { ok: true; user: User } | { ok: false; response: Response } {
  const token = getSessionToken(req.headers.get("cookie"));
  if (!token) {
    return {
      ok: false,
      response: Response.json({ error: "Authentication required" }, { status: 401 }),
    };
  }
  const session = validateSession(token);
  if (!session) {
    return {
      ok: false,
      response: Response.json({ error: "Session expired or invalid" }, { status: 401 }),
    };
  }
  const user = findUserById(session.userId);
  if (!user) {
    return {
      ok: false,
      response: Response.json({ error: "User not found" }, { status: 401 }),
    };
  }
  if (role === "admin" && user.role !== "admin") {
    return {
      ok: false,
      response: Response.json({ error: "Admin access required" }, { status: 403 }),
    };
  }
  return { ok: true, user };
}
