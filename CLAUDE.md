# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server on port 30141
npm run build        # Production build (--webpack, not Turbopack)
npm run start        # Production start on port 30141
npm run lint         # ESLint (eslint-config-next)
npm run release      # Bump patch version, build, and publish to npm
```

**Typecheck**: `node_modules/.bin/tsc --noEmit`
**Never run `next build` during dev** — it pollutes `.next/` and breaks `npm run dev`.

## Architecture

This is a Next.js 16 web UI for the [pi coding agent](https://github.com/badlogic/pi-mono). It runs the `@earendil-works/pi-coding-agent` **in-process** inside the Next.js server — the agent session is created, subscribed to, and commanded directly from API route handlers.

```
Browser                Next.js Server              AgentSession (in-process)
  │                        │                               │
  ├─ GET /api/sessions ────▶ reads ~/.pi/agent/sessions/   │
  ├─ GET /api/sessions/[id] reads .jsonl file directly     │
  │                        │                               │
  ├─ send message ─────────▶ POST /api/agent/[id]          │
  │                        │   startRpcSession() ─────────▶│ createAgentSession()
  │                        │   session.send(cmd) ─────────▶│ session.prompt()
  │                        │                               │
  ├─ SSE connect ──────────▶ GET /api/agent/[id]/events    │
  │                        │   session.onEvent() ◀─────────│ session.subscribe()
  │◀── data: {...} ─────────│                               │
```

**Session browsing** (read-only) reads `.jsonl` files directly via `lib/session-reader.ts` — no AgentSession created.
**Sending a message** triggers `startRpcSession()` in `lib/rpc-manager.ts`, which creates an AgentSession in-process.

The `serverExternalPackages` in `next.config.ts` marks both `@earendil-works/pi-coding-agent` and `@earendil-works/pi-ai` as external (they use Node.js APIs incompatible with bundling).

## Key Design Decisions

### AgentSession lifecycle (`lib/rpc-manager.ts`)
- One `AgentSessionWrapper` per session id, keyed in `globalThis.__piSessions`
- `globalThis` survives Next.js hot-reload; plain module-level Map does not
- Idle timeout: 10 minutes. Concurrent `startRpcSession()` calls share a single start Promise via `globalThis.__piStartLocks`

### Fork destroys the wrapper immediately
`AgentSession.fork()` mutates the wrapper's inner state in-place — after fork, `inner.sessionId` is the *new* session's id. If the wrapper stays alive in the registry under the old id, the next request gets the already-forked state and subsequent forks produce a corrupt `parentSession` chain. **Fix**: `send("fork")` captures `newSessionId`, then calls `this.destroy()` before returning.

### Two kinds of branching
- **Fork** (Fork button on user message): creates a new independent `.jsonl` file. Shown as a child in the sidebar tree via `parentSession` header field.
- **In-session branch** (Continue button / BranchNavigator): calls `navigate_tree` within the same file. Multiple entries share the same `parentId`. Switching between them fetches `/api/sessions/[id]/context?leafId=`.

### ToolCall field normalization (`lib/normalize.ts`)
Pi stores toolCall blocks as `{type:"toolCall", id, name, arguments}` but `ToolCallContent` uses `{toolCallId, toolName, input}`. `normalizeToolCalls()` handles this — called in both `session-reader.ts` (file load) and `useAgentSession.handleAgentEvent()` (streaming).

### SSE reconnect on page refresh
On `ChatWindow` mount, `GET /api/agent/[id]` is called. If `state.isStreaming === true`, SSE is reconnected automatically.

### Session files can be fully rewritten
`parentSession` in the header is display metadata only — has zero effect on chat content. Safe to `writeFileSync` the entire file.

## Session File Format

Location: `~/.pi/agent/sessions/<encoded-cwd>/<timestamp>_<uuid>.jsonl`

```jsonl
{"type":"session","version":3,"id":"<uuid>","timestamp":"...","cwd":"/path","parentSession":"/abs/path/to/parent.jsonl"}
{"type":"model_change","id":"<8hex>","parentId":null,"provider":"zenmux","modelId":"claude-sonnet-4-6","timestamp":"..."}
{"type":"message","id":"<8hex>","parentId":"<8hex>","message":{"role":"user","content":"..."}}
{"type":"message","id":"<8hex>","parentId":"<8hex>","message":{"role":"assistant","content":[...],...}}
{"type":"message","id":"<8hex>","parentId":"<8hex>","message":{"role":"toolResult","toolCallId":"...","content":[...]}}
{"type":"compaction","id":"<8hex>","parentId":"<8hex>","summary":"...","firstKeptEntryId":"<8hex>","tokensBefore":N}
{"type":"session_info","id":"...","parentId":"...","name":"user-defined name"}
```

`entryIds[]` in `SessionContext` is a parallel array to `messages[]` — maps each displayed message back to its `.jsonl` entry id, used for fork and navigate_tree calls.

## CSS Variables (`app/globals.css`)

```
--bg --bg-panel --bg-hover --bg-selected --border
--text --text-muted --text-dim
--accent --user-bg --tool-bg
--font-mono
```

Theme is toggled by adding/removing the `dark` class on `<html>`, persisted in `localStorage("pi-theme")`, with a View Transition API animation.

## Data Directories
- Sessions: `~/.pi/agent/sessions/`
- Models config: `~/.pi/agent/models.json`
- Default model setting: `~/.pi/agent/settings.json`
- Custom home dir via env: `PI_CODING_AGENT_DIR`
