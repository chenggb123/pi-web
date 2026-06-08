import type { NextConfig } from "next";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { version } = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8")) as { version: string };
let piVersion = "unknown";
try {
  // Walk up from __dirname to find the hoisted node_modules
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    const testPath = join(dir, "node_modules/@earendil-works/pi-coding-agent/package.json");
    if (existsSync(testPath)) {
      piVersion = (JSON.parse(readFileSync(testPath, "utf8")) as { version: string }).version;
      break;
    }
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
} catch { /* package not found, use default */ }

const nextConfig: NextConfig = {
  serverExternalPackages: ["@earendil-works/pi-coding-agent", "@earendil-works/pi-ai"],
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '172.16.*.*'],
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_PI_VERSION: piVersion,
  },
};

export default nextConfig;
