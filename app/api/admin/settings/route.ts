import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { requireRole, getCurrentUser } from "@/lib/user-auth";

export const dynamic = "force-dynamic";

interface AppSettings {
  appName?: string;
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
  writeSettings(current);
  return Response.json({ success: true, settings: current });
}
