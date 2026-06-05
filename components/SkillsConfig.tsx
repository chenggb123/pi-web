"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { SkillSearchResult } from "@/app/api/skills/search/route";

interface Skill {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  disableModelInvocation: boolean;
  sourceInfo: {
    source?: string;
    scope?: string;
  };
}

type TabKey = "global" | "personal";

function shortenPath(p: string): string {
  return p.replace(/^\/(?:Users|home)\/[^/]+/, "~");
}

function sourceLabel(skill: Skill): string {
  const src = skill.sourceInfo?.source;
  const scope = skill.sourceInfo?.scope;
  if (scope === "user" || src === "user") return "global";
  if (scope === "project" || src === "project") return "project";
  return "path";
}

function Toggle({
  enabled,
  loading,
  onToggle,
}: {
  enabled: boolean;
  loading: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={loading}
      title={
        enabled
          ? "Visible in model prompt — click to disable"
          : "Hidden from model prompt — click to enable"
      }
      style={{
        flexShrink: 0,
        width: 40,
        height: 22,
        borderRadius: 11,
        border: "none",
        padding: 0,
        cursor: loading ? "wait" : "pointer",
        background: enabled ? "var(--accent)" : "var(--border)",
        position: "relative",
        transition: "background 0.18s",
        outline: "none",
        opacity: loading ? 0.4 : 1,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: enabled ? 21 : 3,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "var(--bg)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.22)",
          transition: "left 0.18s cubic-bezier(.4,0,.2,1)",
        }}
      />
    </button>
  );
}

function SkillDetail({
  skill,
  cwd,
  onToggle,
  toggling,
  saveError,
  canModify,
}: {
  skill: Skill;
  cwd: string;
  onToggle: (skill: Skill) => void;
  toggling: boolean;
  saveError: string | null;
  canModify: boolean;
}) {
  const label = sourceLabel(skill);
  const enabled = !skill.disableModelInvocation;

  function displayPath(p: string): string {
    if (label === "project" && p.startsWith(cwd)) {
      const rel = p.slice(cwd.length).replace(/^[/\\]/, "");
      return `./${rel}`;
    }
    return shortenPath(p);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Path + tag + toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span
          style={{
            fontSize: 10,
            padding: "1px 5px",
            borderRadius: 3,
            flexShrink: 0,
            background:
              label === "project"
                ? "rgba(99,102,241,0.12)"
                : "rgba(120,120,120,0.12)",
            color:
              label === "project" ? "rgba(99,102,241,0.8)" : "var(--text-dim)",
          }}
        >
          {label === "global" ? "global" : "personal"}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-dim)",
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {displayPath(skill.filePath)}
        </span>
        <Toggle
          enabled={enabled}
          loading={toggling || !canModify}
          onToggle={() => { if (canModify) onToggle(skill); }}
        />
        {!canModify && (
          <span style={{ fontSize: 10, color: "var(--text-dim)", flexShrink: 0 }}>
            read-only
          </span>
        )}
        {saveError && (
          <span style={{ fontSize: 12, color: "#f87171", flexShrink: 0 }}>
            {saveError}
          </span>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>
          Name
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--text)" }}>
          {skill.name}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>
          Description
        </span>
        <span style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.6 }}>
          {skill.description}
        </span>
      </div>
    </div>
  );
}

function AddSkillPanel({
  cwd,
  onInstalled,
  canInstallGlobal,
  activeTab,
}: {
  cwd: string;
  onInstalled: () => void;
  canInstallGlobal: boolean;
  activeTab: TabKey;
}) {
  const [addMode, setAddMode] = useState<"search" | "upload">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SkillSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [installedPkgs, setInstalledPkgs] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadScope, setUploadScope] = useState<"global" | "personal">(
    activeTab === "global" && canInstallGlobal ? "global" : "personal",
  );
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadOk, setUploadOk] = useState(false);

  // Scope follows active tab; regular users can only do personal
  const scope: "global" | "project" =
    activeTab === "global" && canInstallGlobal ? "global" : "project";

  useEffect(() => {
    inputRef.current?.focus();
  }, [addMode]);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setSearching(true);
    setSearchError(null);
    setResults([]);
    try {
      const res = await fetch("/api/skills/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q.trim() }),
      });
      const d = (await res.json()) as { results?: SkillSearchResult[]; error?: string };
      if (d.error) { setSearchError(d.error); return; }
      setResults(d.results ?? []);
      if ((d.results ?? []).length === 0) setSearchError("No skills found");
    } catch (e) {
      setSearchError(String(e));
    } finally {
      setSearching(false);
    }
  }, []);

  const install = useCallback(
    async (pkg: string) => {
      setInstalling(pkg);
      setInstallError(null);
      try {
        const res = await fetch("/api/skills/install", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ package: pkg, scope, cwd }),
        });
        const d = (await res.json()) as { success?: boolean; error?: string };
        if (!res.ok || d.error) {
          setInstallError(d.error ?? `HTTP ${res.status}`);
          return;
        }
        setInstalledPkgs((prev) => new Set(prev).add(pkg));
        onInstalled();
      } catch (e) {
        setInstallError(String(e));
      } finally {
        setInstalling(null);
      }
    },
    [onInstalled, scope, cwd],
  );

  const installPath =
    scope === "global"
      ? "~/.pi/agent/skills/"
      : `${shortenPath(cwd)}/.pi/skills/`;

  const handleUpload = useCallback(async () => {
    if (!uploadFile) return;
    setUploading(true);
    setUploadError(null);
    setUploadOk(false);
    try {
      const fd = new FormData();
      fd.append("file", uploadFile);
      fd.append("scope", uploadScope);
      const res = await fetch("/api/skills/upload", {
        method: "POST",
        body: fd,
      });
      const d = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || d.error) {
        setUploadError(d.error ?? `HTTP ${res.status}`);
        return;
      }
      setUploadOk(true);
      setUploadFile(null);
      onInstalled();
    } catch (e) {
      setUploadError(String(e));
    } finally {
      setUploading(false);
    }
  }, [uploadFile, uploadScope, onInstalled]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
          Add Skill
        </div>

        {/* Sub-mode toggle: Search / Upload */}
        <div style={{ display: "flex", borderRadius: 5, border: "1px solid var(--border)", overflow: "hidden", fontSize: 12, alignSelf: "flex-start" }}>
          {(["search", "upload"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setAddMode(m); setUploadError(null); setUploadOk(false); }}
              style={{
                padding: "4px 14px",
                border: "none",
                cursor: "pointer",
                background: addMode === m ? "var(--bg-selected)" : "none",
                color: addMode === m ? "var(--text)" : "var(--text-dim)",
                fontWeight: addMode === m ? 600 : 400,
                borderRight: m === "search" ? "1px solid var(--border)" : "none",
                textTransform: "capitalize",
              }}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Scope indicator */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                fontSize: 10,
                padding: "2px 8px",
                borderRadius: 3,
                fontWeight: 600,
                textTransform: "uppercase",
                background: scope === "global" ? "rgba(120,120,120,0.12)" : "rgba(99,102,241,0.12)",
                color: scope === "global" ? "var(--text-dim)" : "rgba(99,102,241,0.8)",
              }}
            >
              {addMode === "upload" ? (uploadScope === "global" ? "Global" : "Personal") : (scope === "global" ? "Global" : "Personal")}
            </span>
            <span style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
              → {addMode === "upload" ? (uploadScope === "global" ? "~/.pi/agent/skills/" : `${shortenPath(cwd)}/.pi/skills/`) : installPath}
            </span>
          </div>
          {/* Hint when scope is forced */}
          {activeTab === "global" && !canInstallGlobal && (
            <div style={{ fontSize: 11, color: "var(--text-dim)", fontStyle: "italic", padding: "2px 0" }}>
              Skills install to your personal workspace (global install requires admin permission)
            </div>
          )}
        </div>

        {/* ========= SEARCH MODE ========= */}
        {addMode === "search" && (
          <>
            {/* Search row */}
            <div style={{ display: "flex", gap: 8 }}>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") search(query); }}
                placeholder="e.g. react, testing, deploy"
                style={{
                  flex: 1, padding: "7px 10px", fontSize: 13,
                  background: "var(--bg-panel)", border: "1px solid var(--border)",
                  borderRadius: 6, color: "var(--text)", outline: "none",
                }}
              />
              <button
                onClick={() => search(query)}
                disabled={searching || !query.trim()}
                style={{
                  padding: "7px 16px", fontSize: 13, borderRadius: 6, border: "none",
                  background: "var(--accent)", color: "#fff",
                  cursor: searching || !query.trim() ? "not-allowed" : "pointer",
                  opacity: searching || !query.trim() ? 0.5 : 1, flexShrink: 0,
                }}
              >
                {searching ? "Searching…" : "Search"}
              </button>
            </div>

            {searchError && <div style={{ fontSize: 12, color: "#f87171" }}>{searchError}</div>}
            {installError && <div style={{ fontSize: 12, color: "#f87171", wordBreak: "break-word" }}>{installError}</div>}
          </>
        )}

        {/* ========= UPLOAD MODE ========= */}
        {addMode === "upload" && (
          <>
            {/* Scope selector — admin only */}
            {canInstallGlobal && (
              <div style={{ display: "flex", borderRadius: 5, border: "1px solid var(--border)", overflow: "hidden", fontSize: 12, alignSelf: "flex-start" }}>
                {(["global", "personal"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setUploadScope(s)}
                    style={{
                      padding: "4px 14px", border: "none", cursor: "pointer",
                      background: uploadScope === s ? "var(--bg-selected)" : "none",
                      color: uploadScope === s ? "var(--text)" : "var(--text-dim)",
                      fontWeight: uploadScope === s ? 600 : 400,
                      borderRight: s === "global" ? "1px solid var(--border)" : "none",
                      textTransform: "capitalize",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* File input drop zone */}
            <label
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                gap: 10, padding: "28px 20px",
                border: `2px dashed ${uploadFile ? "var(--accent)" : "var(--border)"}`,
                borderRadius: 8, cursor: "pointer",
                background: uploadFile ? "rgba(37,99,235,0.04)" : "var(--bg-panel)",
                transition: "border-color 0.15s, background 0.15s",
              }}
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = "var(--accent)"; }}
              onDragLeave={(e) => { e.currentTarget.style.borderColor = uploadFile ? "var(--accent)" : "var(--border)"; }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.style.borderColor = uploadFile ? "var(--accent)" : "var(--border)";
                const f = e.dataTransfer.files?.[0];
                if (f?.name?.toLowerCase().endsWith(".zip")) { setUploadFile(f); setUploadOk(false); }
              }}
            >
              {uploadFile ? (
                <>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>{uploadFile.name}</span>
                  <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{(uploadFile.size / 1024).toFixed(1)} KB — Click to change</span>
                </>
              ) : (
                <>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Drop a .zip skill file here or click to browse</span>
                  <span style={{ fontSize: 11, color: "var(--text-dim)" }}>Must contain a SKILL.md file</span>
                </>
              )}
              <input
                type="file"
                accept=".zip"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) { setUploadFile(f); setUploadOk(false); }
                }}
              />
            </label>

            {/* Upload button */}
            {uploadFile && (
              <button
                onClick={handleUpload}
                disabled={uploading || uploadOk}
                style={{
                  padding: "8px 20px", fontSize: 13, fontWeight: 600,
                  borderRadius: 6, border: "none",
                  background: uploadOk ? "#16a34a" : "var(--accent)",
                  color: "#fff", cursor: (uploading || uploadOk) ? "not-allowed" : "pointer",
                  alignSelf: "flex-start", transition: "background 0.3s",
                }}
              >
                {uploading ? "Uploading…" : uploadOk ? "✓ Uploaded" : "Upload Skill"}
              </button>
            )}

            {uploadError && <div style={{ fontSize: 12, color: "#f87171", wordBreak: "break-word" }}>{uploadError}</div>}
          </>
        )}
      </div>

      {/* ========= SEARCH RESULTS ========= */}
      {addMode === "search" && results.length > 0 && (
        <div style={{ flex: 1, overflowY: "auto" }}>
          {results.map((r) => {
            const isInstalled = installedPkgs.has(r.package);
            const isInstalling = installing === r.package;
            const atIdx = r.package.indexOf("@");
            const repopart = atIdx > -1 ? r.package.slice(0, atIdx) : r.package;
            const skillpart = atIdx > -1 ? r.package.slice(atIdx + 1) : null;
            return (
              <div
                key={r.package}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "12px 0", borderBottom: "1px solid var(--border)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 3 }}>
                    {skillpart ?? repopart}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-dim)" }}>{repopart}</span>
                    <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>{r.installs}</span>
                    {r.url && (
                      <a href={r.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>skills.sh ↗</a>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => !isInstalled && !isInstalling && install(r.package)}
                  disabled={isInstalled || isInstalling || installing !== null}
                  style={{
                    flexShrink: 0, padding: "5px 14px", fontSize: 12, fontWeight: 500, borderRadius: 5,
                    border: "1px solid var(--border)",
                    cursor: isInstalled || isInstalling || installing !== null ? "not-allowed" : "pointer",
                    background: isInstalled ? "rgba(34,197,94,0.1)" : "none",
                    color: isInstalled ? "#16a34a" : isInstalling ? "var(--accent)" : "var(--text-muted)",
                    transition: "color 0.12s",
                  }}
                >
                  {isInstalled ? "✓ Installed" : isInstalling ? "Installing…" : "Install"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {addMode === "search" && !searchError && !searching && results.length === 0 && (
        <div style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.8 }}>
          Search{" "}
          <a href="https://skills.sh" target="_blank" rel="noreferrer" style={{ color: "var(--accent)", textDecoration: "none" }}>skills.sh</a>
          {" "}to discover and install skills for your agent.
        </div>
      )}
    </div>
  );
}

export function SkillsConfig({
  cwd,
  onClose,
  userRole,
}: {
  cwd: string;
  onClose: () => void;
  userRole?: string;
}) {
  const canManageGlobal = userRole === "admin"; // has "skills:global" permission
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("personal");
  const [selected, setSelected] = useState<string | null>(null);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [addMode, setAddMode] = useState(false);

  const loadSkills = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/skills?cwd=${encodeURIComponent(cwd)}`)
      .then((r) => r.json())
      .then((d: { skills?: Skill[]; error?: string }) => {
        if (d.error) { setError(d.error); return; }
        setSkills(d.skills ?? []);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [cwd]);

  useEffect(() => { loadSkills(); }, [cwd]); // eslint-disable-line react-hooks/exhaustive-deps

  // Split skills into global vs personal
  const globalSkills = skills.filter((s) => sourceLabel(s) === "global");
  const personalSkills = skills.filter((s) => sourceLabel(s) === "project");

  const activeSkills = activeTab === "global" ? globalSkills : personalSkills;

  // Can the current user modify skills in the active tab?
  const canModifyActive = activeTab === "personal" || canManageGlobal;

  // Reset selection when switching tabs
  const switchTab = useCallback((tab: TabKey) => {
    setActiveTab(tab);
    setAddMode(false);
    setSelected(null);
    setSaveError(null);
  }, []);

  // Select first skill when tab skills change
  useEffect(() => {
    if (!addMode && activeSkills.length > 0) {
      setSelected((prev) => {
        if (prev && activeSkills.some((s) => s.filePath === prev)) return prev;
        return activeSkills[0].filePath;
      });
    } else if (activeSkills.length === 0) {
      setSelected(null);
    }
  }, [activeTab, activeSkills.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = useCallback(async (skill: Skill) => {
    const next = !skill.disableModelInvocation;
    setToggling((s) => new Set(s).add(skill.filePath));
    setSaveError(null);
    try {
      const res = await fetch("/api/skills", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: skill.filePath, disableModelInvocation: next }),
      });
      const d = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || d.error) {
        setSaveError(d.error ?? `HTTP ${res.status}`);
        return;
      }
      setSkills((prev) =>
        prev.map((s) =>
          s.filePath === skill.filePath ? { ...s, disableModelInvocation: next } : s,
        ),
      );
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setToggling((s) => { const n = new Set(s); n.delete(skill.filePath); return n; });
    }
  }, []);

  const selectedSkill = activeSkills.find((s) => s.filePath === selected) ?? null;

  // Tab button style helper
  const tabStyle = (tab: TabKey): React.CSSProperties => ({
    padding: "7px 18px",
    border: "none",
    borderBottom: activeTab === tab ? "2px solid var(--accent)" : "2px solid transparent",
    background: "none",
    color: activeTab === tab ? "var(--accent)" : "var(--text-muted)",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: activeTab === tab ? 600 : 400,
    transition: "color 0.12s, border-color 0.12s",
  });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: 860,
          height: "78vh",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 18px 0",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
              Skills
            </span>
            <code style={{
              fontSize: 11,
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)",
              maxWidth: 280,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {shortenPath(cwd)}
            </code>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "2px 6px" }}
          >
            ×
          </button>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 0, padding: "0 18px", borderBottom: "1px solid var(--border)", flexShrink: 0, background: "var(--bg-panel)" }}>
          <button onClick={() => switchTab("global")} style={tabStyle("global")}>
            Global
            <span style={{ fontSize: 10, color: "var(--text-dim)", marginLeft: 4 }}>
              ({globalSkills.length})
            </span>
          </button>
          <button onClick={() => switchTab("personal")} style={tabStyle("personal")}>
            Personal
            <span style={{ fontSize: 10, color: "var(--text-dim)", marginLeft: 4 }}>
              ({personalSkills.length})
            </span>
          </button>
          {/* Permission indicator */}
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "center", fontSize: 11, color: "var(--text-dim)", paddingRight: 4 }}>
            {activeTab === "global" && !canManageGlobal && "🔒 View-only"}
            {activeTab === "global" && canManageGlobal && "🔓 Admin"}
            {activeTab === "personal" && "🔓 Editable"}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Left: skill list */}
          <div style={{
            width: 210,
            borderRight: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            flexShrink: 0,
            background: "var(--bg-panel)",
          }}>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 6px" }}>
              {loading ? (
                <div style={{ padding: "10px 8px", fontSize: 12, color: "var(--text-muted)" }}>Loading…</div>
              ) : error ? (
                <div style={{ padding: "10px 8px", fontSize: 11, color: "#f87171" }}>{error}</div>
              ) : activeSkills.length === 0 ? (
                <div style={{ padding: "10px 8px", fontSize: 11, color: "var(--text-dim)" }}>
                  {activeTab === "global" ? "No global skills" : "No personal skills"}
                </div>
              ) : (
                activeSkills.map((skill) => {
                  const isSelected = !addMode && selected === skill.filePath;
                  const disabled = skill.disableModelInvocation;
                  return (
                    <div
                      key={skill.filePath}
                      onClick={() => { setSelected(skill.filePath); setAddMode(false); }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        padding: "8px 8px",
                        borderRadius: 5,
                        cursor: "pointer",
                        background: isSelected ? "var(--bg-selected)" : "none",
                      }}
                      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "var(--bg-hover)"; }}
                      onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "none"; }}
                    >
                      <span style={{
                        flexShrink: 0,
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: disabled ? "var(--border)" : "var(--accent)",
                        boxShadow: disabled ? "none" : "0 0 4px var(--accent)",
                        transition: "background 0.15s, box-shadow 0.15s",
                      }} />
                      <span style={{
                        fontSize: 12,
                        fontWeight: isSelected ? 600 : 400,
                        color: disabled ? "var(--text-dim)" : "var(--text)",
                        fontFamily: "var(--font-mono)",
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}>
                        {skill.name}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
            {/* Add skill button */}
            <div style={{ padding: "8px 6px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
              <div
                onClick={() => setAddMode(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "7px 8px",
                  borderRadius: 5,
                  cursor: "pointer",
                  background: addMode ? "var(--bg-selected)" : "none",
                  color: addMode ? "var(--accent)" : "var(--text-dim)",
                  fontSize: 12,
                }}
                onMouseEnter={(e) => { if (!addMode) e.currentTarget.style.background = "var(--bg-hover)"; }}
                onMouseLeave={(e) => { if (!addMode) e.currentTarget.style.background = "none"; }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add skill
              </div>
            </div>
          </div>

          {/* Right: detail or add panel */}
          <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
            {addMode ? (
              <AddSkillPanel
                cwd={cwd}
                onInstalled={() => { loadSkills(); }}
                canInstallGlobal={canManageGlobal}
                activeTab={activeTab}
              />
            ) : loading ? null : selectedSkill ? (
              <SkillDetail
                key={selectedSkill.filePath}
                skill={selectedSkill}
                cwd={cwd}
                onToggle={toggle}
                toggling={toggling.has(selectedSkill.filePath)}
                saveError={saveError}
                canModify={canModifyActive}
              />
            ) : (
              <div style={{
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-dim)",
                fontSize: 13,
              }}>
                {activeSkills.length === 0 ? "Add your first skill" : "Select a skill"}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          padding: "10px 18px",
          borderTop: "1px solid var(--border)",
          flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            style={{
              padding: "6px 14px",
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: 6,
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
