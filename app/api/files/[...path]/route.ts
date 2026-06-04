import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import mammoth from "mammoth";
import { listAllSessions } from "@/lib/session-reader";

const IGNORED_NAMES = new Set([
  "node_modules", ".git", ".next", "dist", "build", "__pycache__",
  ".turbo", ".cache", "coverage", ".pytest_cache", ".mypy_cache",
  "target", "vendor", ".DS_Store", ".git",
]);

const IGNORED_SUFFIXES = [".pyc"];

const TEXT_PREVIEW_MAX_BYTES = 256 * 1024;
const IMAGE_PREVIEW_MAX_BYTES = 10 * 1024 * 1024;

const IMAGE_EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  avif: "image/avif",
};

const AUDIO_EXT_TO_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  weba: "audio/webm",
  webm: "audio/webm",
};

function getExt(filePath: string): string {
  const ext = path.basename(filePath).toLowerCase().split(".").pop() ?? "";
  return ext;
}

function getImageMime(filePath: string): string | null {
  return IMAGE_EXT_TO_MIME[getExt(filePath)] ?? null;
}

function getAudioMime(filePath: string): string | null {
  return AUDIO_EXT_TO_MIME[getExt(filePath)] ?? null;
}

// ── Office file text extraction (ZIP/XML) ──────────────────────────────────────

const OFFICE_EXTS = new Set(["docx", "xlsx", "pptx"]);
const OFFICE_MAX_BYTES = 10 * 1024 * 1024; // 10MB max

function tryExtractOfficeContent(
  filePath: string,
  stat: fs.Stats,
  dark?: boolean,
): Promise<{ content: string; language: string } | null> | { content: string; language: string } | null {
  const ext = getExt(filePath);
  if (!OFFICE_EXTS.has(ext)) return null;
  if (stat.size > OFFICE_MAX_BYTES) return null;

  // Use mammoth for Word — produces rich HTML (async, returns Promise)
  if (ext === "docx") {
    return mammoth.convertToHtml({ path: filePath }).then((result) => {
      const html = result.value.trim();
      if (html) return { content: wrapOfficeHtml(html, dark), language: "html" };
      // Fallback: XML text extraction
      try {
        const buf = fs.readFileSync(filePath);
        const entries = readZipEntries(buf);
        const xml = findZipEntry(entries, "word/document.xml");
        if (xml) {
          const text = extractDocxText(xml);
          if (text.trim()) return { content: text, language: "text" };
        }
      } catch { /* ignore */ }
      return null;
    }).catch(() => null);
  }

  // Excel: build HTML table (sync)
  if (ext === "xlsx") {
    try {
      const buf = fs.readFileSync(filePath);
      const entries = readZipEntries(buf);
      const strings = findZipEntry(entries, "xl/sharedStrings.xml");
      const shared = strings ? parseSharedStrings(strings) : [];
      const sheet = findZipEntry(entries, "xl/worksheets/sheet1.xml");
      if (sheet) {
        const html = buildSheetHtml(sheet, shared);
        if (html) return { content: wrapOfficeHtml(html, dark), language: "html" };
      }
    } catch { /* ignore */ }
    return null;
  }

  // PowerPoint: text extraction per slide (sync)
  if (ext === "pptx") {
    try {
      const buf = fs.readFileSync(filePath);
      const entries = readZipEntries(buf);
      const parts: string[] = [];
      for (let i = 1; i <= 50; i++) {
        const slide = findZipEntry(entries, `ppt/slides/slide${i}.xml`);
        if (!slide) break;
        parts.push(`<h3>Slide ${i}</h3><p>${escapeHtml(extractXmlText(slide))}</p>`);
      }
      if (parts.length) return { content: wrapOfficeHtml(parts.join("<hr>"), dark), language: "html" };
    } catch { /* ignore */ }
    return null;
  }

  return null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function wrapOfficeHtml(body: string, dark?: boolean): string {
  const isDark = dark ?? false;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  body { margin: 16px 20px; background: ${isDark ? "#1a1a1a" : "#fff"}; color: ${isDark ? "#e8e8e8" : "#1a1a1a"}; }
  .office-preview { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.7; max-width: 800px; }
  .office-preview table { border-collapse: collapse; width: 100%; margin: 8px 0; }
  .office-preview th, .office-preview td { border: 1px solid ${isDark ? "#444" : "#ccc"}; padding: 6px 10px; text-align: left; font-size: 13px; }
  .office-preview th { background: ${isDark ? "#2a2a2a" : "#f5f5f5"}; font-weight: 600; }
  .office-preview h1, .office-preview h2, .office-preview h3, .office-preview h4 { color: ${isDark ? "#f0f0f0" : "#1a1a1a"}; }
  .office-preview h3 { margin: 16px 0 4px; font-size: 16px; }
  .office-preview hr { border: none; border-top: 2px solid ${isDark ? "#333" : "#e0e0e0"}; margin: 16px 0; }
  .office-preview p { margin: 4px 0; }
  .office-preview ul, .office-preview ol { padding-left: 24px; }
  .office-preview a { color: ${isDark ? "#60a5fa" : "#2563eb"}; }
  img { max-width: 100%; }
  </style></head><body><div class="office-preview">${body}</div></body></html>`;
}

function buildSheetHtml(xml: string, shared: string[]): string {
  const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g;
  const maxCols = 26;
  let html = "<table>";
  let rowMatch;
  let rowIdx = 0;
  while ((rowMatch = rowRe.exec(xml)) !== null && rowIdx < 500) {
    const rowXml = rowMatch[1];
    const cells: string[] = [];
    let hasContent = false;
    const cellRe = /<c[^>]*>([\s\S]*?)<\/c>/g;
    let cellMatch;
    while ((cellMatch = cellRe.exec(rowXml)) !== null) {
      const cellXml = cellMatch[1];
      const cellFull = cellMatch[0];
      let val = "";
      if (/t="s"/.test(cellFull)) {
        const vMatch = /<v>([^<]*)<\/v>/.exec(cellXml);
        if (vMatch) val = shared[parseInt(vMatch[1])] ?? "";
      } else if (/t="inlineStr"/.test(cellFull)) {
        const tMatch = /<t[^>]*>([^<]*)<\/t>/.exec(cellXml);
        if (tMatch) val = tMatch[1];
      } else {
        const vMatch = /<v>([^<]*)<\/v>/.exec(cellXml);
        if (vMatch) val = vMatch[1];
      }
      cells.push(val);
      if (val.trim()) hasContent = true;
    }
    if (hasContent) {
      html += "<tr>" + cells.slice(0, maxCols).map((c) => `<td>${escapeHtml(c)}</td>`).join("") + "</tr>";
    }
    rowIdx++;
  }
  html += "</table>";
  return html;
}

// Minimal ZIP reader — extracts entry name → decompressed Buffer
function readZipEntries(buf: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  // Find EOCD signature (0x06054b50) from the end
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) return entries;

  const cdOffset = buf.readUInt32LE(eocdOffset + 16);
  const cdSize = buf.readUInt32LE(eocdOffset + 12);

  let pos = cdOffset;
  const end = cdOffset + cdSize;
  while (pos < end) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) break;
    const compMethod = buf.readUInt16LE(pos + 10);
    const uncompSize = buf.readUInt32LE(pos + 24);
    const compSize = buf.readUInt32LE(pos + 20);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localOffset = buf.readUInt32LE(pos + 42);
    const name = buf.toString("utf8", pos + 46, pos + 46 + nameLen).toLowerCase();

    // Read local file header
    const lnameLen = buf.readUInt16LE(localOffset + 26);
    const lextraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lnameLen + lextraLen;

    if (compMethod === 0) {
      // Stored (no compression)
      entries.set(name, buf.subarray(dataStart, dataStart + uncompSize));
    } else if (compMethod === 8) {
      // Deflated
      try {
        const raw = buf.subarray(dataStart, dataStart + compSize);
        const decompressed = zlib.inflateRawSync(raw);
        entries.set(name, Buffer.from(decompressed));
      } catch {
        // skip unreadable entries
      }
    }
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function findZipEntry(entries: Map<string, Buffer>, name: string): string | null {
  for (const [key, buf] of entries) {
    if (key === name || key.endsWith("/" + name)) {
      return buf.toString("utf8");
    }
  }
  return null;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x?[0-9a-fA-F]+;/g, " ")
    .replace(/&[a-zA-Z]+;/g, " ");
}

// Word (.docx): extract paragraphs preserving structure
function extractDocxText(xml: string): string {
  const paragraphs: string[] = [];
  // Split by paragraph tags
  const pRe = /<w:p[ >][\s\S]*?<\/w:p>/g;
  let pMatch;
  while ((pMatch = pRe.exec(xml)) !== null) {
    const pXml = pMatch[0];
    const runs: string[] = [];
    // Extract text from runs within the paragraph
    const tRe = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
    let tMatch;
    while ((tMatch = tRe.exec(pXml)) !== null) {
      runs.push(decodeXmlEntities(tMatch[1]));
    }
    // Handle line breaks
    const hasBreak = /<w:br\b/.test(pXml);
    const text = runs.join("");
    if (text.trim()) {
      paragraphs.push(text + (hasBreak ? "\n" : ""));
    } else if (hasBreak) {
      paragraphs.push("");
    }
  }
  return paragraphs.join("\n").trim();
}

// Generic XML text extract (for pptx, etc.)
function extractXmlText(xml: string): string {
  return xml
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x?\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  const re = /<t[^>]*>([^<]*)<\/t>/g;
  let match;
  while ((match = re.exec(xml)) !== null) {
    strings.push(match[1]);
  }
  return strings;
}

function extractSheetText(xml: string, shared: string[]): string {
  const rows: string[] = [];
  const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch;
  while ((rowMatch = rowRe.exec(xml)) !== null) {
    const rowXml = rowMatch[1];
    const cells: string[] = [];
    // Match all cell elements
    const cellRe = /<c[^>]*>([\s\S]*?)<\/c>/g;
    let cellMatch;
    while ((cellMatch = cellRe.exec(rowXml)) !== null) {
      const cellXml = cellMatch[1];
      const cellFull = cellMatch[0];
      const hasS = /t="s"/.test(cellFull);
      const hasInline = /t="inlineStr"/.test(cellFull);
      const vMatch = /<v>([^<]*)<\/v>/.exec(cellXml);
      const tMatch = /<t[^>]*>([^<]*)<\/t>/.exec(cellXml);

      if (hasS && vMatch) {
        const idx = parseInt(vMatch[1]);
        cells.push(shared[idx] ?? "");
      } else if (hasInline && tMatch) {
        cells.push(tMatch[1]);
      } else if (vMatch) {
        cells.push(vMatch[1]);
      }
    }
    if (cells.some((c) => c.trim())) {
      rows.push(cells.join("\t"));
    }
  }
  return rows.join("\n");
}

// ── Language detection ──────────────────────────────────────────────────────────

const EXT_TO_LANGUAGE: Record<string, string> = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
  mjs: "javascript", cjs: "javascript", py: "python", rb: "ruby",
  go: "go", rs: "rust", java: "java", kt: "kotlin", swift: "swift",
  c: "c", cpp: "cpp", h: "c", hpp: "cpp", cs: "csharp",
  html: "html", htm: "html", css: "css", scss: "css", less: "css",
  json: "json", jsonl: "json", yaml: "yaml", yml: "yaml",
  toml: "toml", xml: "xml", md: "markdown", mdx: "markdown",
  sh: "bash", bash: "bash", zsh: "bash", fish: "bash",
  sql: "sql", graphql: "graphql", gql: "graphql",
  dockerfile: "dockerfile", tf: "hcl", hcl: "hcl",
  env: "bash", gitignore: "bash", txt: "text",
};

function getLanguage(filePath: string): string {
  const base = path.basename(filePath).toLowerCase();
  // Special full-name matches
  if (base === "dockerfile" || base.startsWith("dockerfile.")) return "dockerfile";
  if (base === ".env" || base.startsWith(".env.")) return "bash";
  if (base === "makefile" || base === "gnumakefile") return "makefile";
  const ext = base.split(".").pop() ?? "";
  return EXT_TO_LANGUAGE[ext] ?? "text";
}

// Short-TTL cache for the allowed-roots set. Without this, every file list/read
// request re-scans every pi session on disk just to check access. 5s is short
// enough that newly-created cwds appear promptly; stored on globalThis so it
// survives Next.js hot-reload.
declare global {
  var __piAllowedRootsCache: { roots: Set<string>; expiresAt: number } | undefined;
}

const ALLOWED_ROOTS_TTL_MS = 5_000;
const WINDOWS_ABSOLUTE_RE = /^[a-zA-Z]:[\\/]/;

function normalizeSlashes(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function isWindowsAbsolutePath(filePath: string): boolean {
  return WINDOWS_ABSOLUTE_RE.test(filePath) || filePath.startsWith("\\\\") || filePath.startsWith("//");
}

function filePathFromSegments(segments: string[]): string {
  const joined = segments.join("/");
  const slashJoined = normalizeSlashes(joined);
  if (isWindowsAbsolutePath(slashJoined)) return slashJoined;
  return "/" + joined.replace(/^\/+/, "");
}

async function getAllowedRoots(): Promise<Set<string>> {
  const now = Date.now();
  const cached = globalThis.__piAllowedRootsCache;
  if (cached && cached.expiresAt > now) return cached.roots;

  const sessions = await listAllSessions();
  const roots = new Set<string>();
  for (const s of sessions) {
    if (s.cwd) roots.add(s.cwd);
  }
  // Also allow ~/pi-cwd-* directories created by the default-cwd endpoint
  const home = (await import("os")).homedir();
  const { readdirSync } = await import("fs");
  try {
    for (const name of readdirSync(home)) {
      if (/^pi-cwd-\d{8}$/.test(name)) {
        roots.add(path.join(home, name));
      }
    }
  } catch {
    // ignore if home is unreadable
  }

  globalThis.__piAllowedRootsCache = { roots, expiresAt: now + ALLOWED_ROOTS_TTL_MS };
  return roots;
}

function isPathAllowed(target: string, allowedRoots: Set<string>): boolean {
  for (const root of allowedRoots) {
    const useWindowsRules = isWindowsAbsolutePath(target) || isWindowsAbsolutePath(root);
    const resolver = useWindowsRules ? path.win32 : path;
    const sep = useWindowsRules ? "\\" : path.sep;
    const normalized = resolver.resolve(target);
    const normalizedRoot = resolver.resolve(root);
    const comparable = useWindowsRules ? normalized.toLowerCase() : normalized;
    const comparableRoot = useWindowsRules ? normalizedRoot.toLowerCase() : normalizedRoot;
    const rootWithSep = comparableRoot.endsWith(sep) ? comparableRoot : comparableRoot + sep;
    if (comparable === comparableRoot || comparable.startsWith(rootWithSep)) {
      return true;
    }
  }
  return false;
}

function createFileBodyStream(filePath: string, range?: { start: number; end: number }): ReadableStream<Uint8Array> {
  const fileStream = fs.createReadStream(filePath, range);
  let closed = false;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      fileStream.on("data", (chunk: Buffer) => {
        if (closed) return;
        try {
          controller.enqueue(new Uint8Array(chunk));
        } catch {
          closed = true;
          fileStream.destroy();
        }
      });
      fileStream.once("end", () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // The browser may cancel media probes before the file stream ends.
        }
      });
      fileStream.once("error", (error) => {
        if (closed) return;
        closed = true;
        try {
          controller.error(error);
        } catch {
          // The response was already abandoned by the client.
        }
      });
    },
    cancel() {
      closed = true;
      fileStream.destroy();
    },
  });
}

function streamFile(filePath: string, stat: fs.Stats, contentType: string, rangeHeader: string | null): Response {
  const headers = {
    "Content-Type": contentType,
    "Cache-Control": "no-cache",
    "Accept-Ranges": "bytes",
  };

  if (!rangeHeader) {
    return new Response(createFileBodyStream(filePath), {
      headers: {
        ...headers,
        "Content-Length": String(stat.size),
      },
    });
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match) {
    return new Response(null, {
      status: 416,
      headers: {
        ...headers,
        "Content-Range": `bytes */${stat.size}`,
      },
    });
  }

  let start = match[1] ? Number(match[1]) : 0;
  let end = match[2] ? Number(match[2]) : stat.size - 1;
  if (!match[1] && match[2]) {
    const suffixLength = Number(match[2]);
    start = Math.max(stat.size - suffixLength, 0);
    end = stat.size - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= stat.size) {
    return new Response(null, {
      status: 416,
      headers: {
        ...headers,
        "Content-Range": `bytes */${stat.size}`,
      },
    });
  }

  end = Math.min(end, stat.size - 1);
  const chunkSize = end - start + 1;
  return new Response(createFileBodyStream(filePath, { start, end }), {
    status: 206,
    headers: {
      ...headers,
      "Content-Length": String(chunkSize),
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: segments } = await params;
    const filePath = filePathFromSegments(segments);
    const type = request.nextUrl.searchParams.get("type") ?? "list";

    const allowedRoots = await getAllowedRoots();
    if (!isPathAllowed(filePath, allowedRoots)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (type === "read") {
      if (!stat.isFile()) {
        return NextResponse.json({ error: "Not a file" }, { status: 400 });
      }
      const imageMime = getImageMime(filePath);
      if (imageMime) {
        if (stat.size > IMAGE_PREVIEW_MAX_BYTES) {
          return NextResponse.json({ error: "Image too large (>10MB)" }, { status: 413 });
        }
        return streamFile(filePath, stat, imageMime, request.headers.get("range"));
      }
      const audioMime = getAudioMime(filePath);
      if (audioMime) {
        return streamFile(filePath, stat, audioMime, request.headers.get("range"));
      }

      // PDF: serve raw for browser-native iframe preview
      if (getExt(filePath) === "pdf") {
        return streamFile(filePath, stat, "application/pdf", request.headers.get("range"));
      }

      // Office files: extract content (HTML for docx/xlsx, text for pptx)
      const dark = request.nextUrl.searchParams.get("dark") === "1";
      const officeContent = await Promise.resolve(tryExtractOfficeContent(filePath, stat, dark));
      if (officeContent !== null) {
        return NextResponse.json({ content: officeContent.content, language: officeContent.language, size: stat.size });
      }

      if (stat.size > TEXT_PREVIEW_MAX_BYTES) {
        return NextResponse.json({ error: "File too large for preview (>256KB)" }, { status: 413 });
      }
      const content = fs.readFileSync(filePath, "utf-8");
      const language = getLanguage(filePath);
      return NextResponse.json({ content, language, size: stat.size });
    }

    if (type === "watch") {
      if (!stat.isFile()) {
        return NextResponse.json({ error: "Not a file" }, { status: 400 });
      }
      let watcher: fs.FSWatcher | null = null;
      const stream = new ReadableStream({
        start(controller) {
          const send = (eventName: string, data: Record<string, unknown>) => {
            const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
            try {
              controller.enqueue(new TextEncoder().encode(payload));
            } catch {
              // client disconnected
            }
          };
          // Send initial ping so client knows connection is live
          send("connected", { filePath });
          try {
            watcher = fs.watch(filePath, () => {
              try {
                const s = fs.statSync(filePath);
                send("change", { mtime: s.mtime.toISOString(), size: s.size });
              } catch {
                send("change", { mtime: new Date().toISOString(), size: 0 });
              }
            });
            watcher.on("error", () => {
              try { controller.close(); } catch { /* ignore */ }
            });
          } catch {
            send("error", { message: "Failed to watch file" });
            controller.close();
          }
        },
        cancel() {
          try { watcher?.close(); } catch { /* ignore */ }
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    // type === "list"
    if (!stat.isDirectory()) {
      return NextResponse.json({ error: "Not a directory" }, { status: 400 });
    }

    const names = fs.readdirSync(filePath);
    const entries = names
      .filter((name) => !IGNORED_NAMES.has(name) && !IGNORED_SUFFIXES.some((s) => name.endsWith(s)))
      .map((name) => {
        const full = path.join(filePath, name);
        try {
          const s = fs.statSync(full);
          return {
            name,
            isDir: s.isDirectory(),
            size: s.isFile() ? s.size : 0,
            modified: s.mtime.toISOString(),
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => {
        // Dirs first, then files, both alphabetically
        if (a!.isDir !== b!.isDir) return a!.isDir ? -1 : 1;
        return a!.name.localeCompare(b!.name);
      });

    return NextResponse.json({ entries, path: filePath });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE /api/files/[...path] — delete a file or empty directory
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  const filePath = filePathFromSegments(segments);

  try {
    const allowedRoots = await getAllowedRoots();
    if (!isPathAllowed(filePath, allowedRoots)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(filePath);
      if (entries.length > 0) {
        return NextResponse.json({ error: "Directory is not empty" }, { status: 400 });
      }
      fs.rmdirSync(filePath);
    } else {
      fs.unlinkSync(filePath);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
