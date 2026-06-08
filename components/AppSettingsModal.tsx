"use client";

import { useState, useEffect, useRef } from "react";

export function AppSettingsModal({ onClose }: { onClose: () => void }) {
  const [appName, setAppName] = useState("");
  const [wechatCorpId, setWechatCorpId] = useState("");
  const [wechatCorpSecret, setWechatCorpSecret] = useState("");
  const [wechatAgentId, setWechatAgentId] = useState("");
  const [wechatEnabled, setWechatEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncState, setSyncState] = useState<{ lastSyncMessage?: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadSettings = () => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d: { appName?: string; wechatCorpId?: string; wechatCorpSecret?: string; wechatAgentId?: string; wechatEnabled?: boolean }) => {
        setAppName(d.appName ?? "Pi Agent Web");
        setWechatCorpId(d.wechatCorpId ?? "");
        setWechatCorpSecret(d.wechatCorpSecret ?? "");
        setWechatAgentId(d.wechatAgentId ?? "");
        setWechatEnabled(d.wechatEnabled ?? false);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSettings();
    // Load sync state
    fetch("/api/admin/wechat-sync")
      .then((r) => r.json())
      .then((d) => { if (d.lastSyncMessage) setSyncState(d); })
      .catch(() => {});
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appName: appName.trim() || "Pi Agent Web",
          wechatCorpId: wechatCorpId.trim(),
          wechatCorpSecret: wechatCorpSecret.trim(),
          wechatAgentId: wechatAgentId.trim(),
          wechatEnabled,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      // Reload sync state after save (initial sync may have triggered)
      loadSettings();
    } catch { /* ignore */ } finally { setSaving(false); }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/wechat-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ corpId: wechatCorpId.trim(), corpSecret: wechatCorpSecret.trim() }),
      });
      const d = (await res.json()) as { ok: boolean; message: string };
      setTestResult(d);
    } catch (e) {
      setTestResult({ ok: false, message: String(e) });
    } finally { setTesting(false); }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/admin/wechat-sync", { method: "POST" });
      const d = (await res.json()) as { success?: boolean; syncState?: { lastSyncMessage: string } };
      if (d.syncState) setSyncState(d.syncState);
    } catch { /* ignore */ } finally { setSyncing(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: 420, maxWidth: "calc(100vw - 32px)", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.18)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Settings</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "2px 6px" }}>×</button>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", maxHeight: "65vh" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>Application Name</label>
            <input
              ref={inputRef}
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              disabled={loading}
              placeholder="Pi Agent Web"
              style={{ padding: "8px 10px", background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", fontSize: 14, outline: "none", fontFamily: "var(--font-mono)", width: "100%", boxSizing: "border-box" }}
            />
          </div>

          {/* ── WeChat Work Integration ── */}
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 12 }}>
              WeChat Work Integration
            </div>

            {/* Enable toggle */}
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 12 }}>
              <button
                type="button"
                onClick={() => setWechatEnabled((v) => !v)}
                style={{
                  width: 40, height: 22, borderRadius: 11, border: "none", padding: 0,
                  cursor: "pointer", background: wechatEnabled ? "var(--accent)" : "var(--border)",
                  position: "relative", transition: "background 0.18s", flexShrink: 0,
                }}
              >
                <span style={{ position: "absolute", top: 3, left: wechatEnabled ? 21 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.22)", transition: "left 0.18s" }} />
              </button>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Enable WeChat Work Login</span>
            </label>

            {wechatEnabled && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>Corp ID</label>
                  <input value={wechatCorpId} onChange={(e) => setWechatCorpId(e.target.value)}
                    placeholder="ww1234567890abcdef"
                    style={{ padding: "7px 9px", background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 5, color: "var(--text)", fontSize: 12, outline: "none", fontFamily: "var(--font-mono)", width: "100%", boxSizing: "border-box" }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>Corp Secret</label>
                  <input type="password" value={wechatCorpSecret} onChange={(e) => setWechatCorpSecret(e.target.value)}
                    placeholder="Secret from self-built app"
                    style={{ padding: "7px 9px", background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 5, color: "var(--text)", fontSize: 12, outline: "none", fontFamily: "var(--font-mono)", width: "100%", boxSizing: "border-box" }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>Agent ID</label>
                  <input value={wechatAgentId} onChange={(e) => setWechatAgentId(e.target.value)}
                    placeholder="App AgentId (e.g. 1000002)"
                    style={{ padding: "7px 9px", background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 5, color: "var(--text)", fontSize: 12, outline: "none", fontFamily: "var(--font-mono)", width: "100%", boxSizing: "border-box" }} />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={handleTestConnection} disabled={testing || !wechatCorpId.trim() || !wechatCorpSecret.trim()}
                    style={{ padding: "6px 12px", fontSize: 12, fontWeight: 500, borderRadius: 5, border: "1px solid var(--border)", cursor: (testing || !wechatCorpId.trim() || !wechatCorpSecret.trim()) ? "not-allowed" : "pointer", background: "none", color: "var(--text-muted)", opacity: (testing || !wechatCorpId.trim() || !wechatCorpSecret.trim()) ? 0.5 : 1 }}>
                    {testing ? "Testing…" : "Test Connection"}
                  </button>
                  <button onClick={handleSyncNow} disabled={syncing || !wechatCorpId.trim() || !wechatCorpSecret.trim()}
                    style={{ padding: "6px 12px", fontSize: 12, fontWeight: 500, borderRadius: 5, border: "1px solid var(--border)", cursor: (syncing || !wechatCorpId.trim() || !wechatCorpSecret.trim()) ? "not-allowed" : "pointer", background: "none", color: "var(--text-muted)", opacity: (syncing || !wechatCorpId.trim() || !wechatCorpSecret.trim()) ? 0.5 : 1 }}>
                    {syncing ? "Syncing…" : "Sync Now"}
                  </button>
                </div>
                {testResult && (
                  <div style={{ fontSize: 11, color: testResult.ok ? "#16a34a" : "#f87171", padding: "4px 0" }}>
                    {testResult.ok ? "✓ " : "✗ "}{testResult.message}
                  </div>
                )}
                {syncState?.lastSyncMessage && (
                  <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                    Last sync: {syncState.lastSyncMessage}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div style={{ borderTop: "1px solid var(--border)", padding: "12px 18px", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={{ padding: "6px 14px", background: "none", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-muted)", cursor: "pointer", fontSize: 13 }}>Cancel</button>
          <button onClick={handleSave} disabled={saving || saved} style={{
            padding: "6px 16px", background: saved ? "#16a34a" : "var(--accent)", border: "none",
            borderRadius: 6, color: "#fff", cursor: (saving || saved) ? "not-allowed" : "pointer",
            fontSize: 13, fontWeight: 600, minWidth: 70,
          }}>
            {saved ? "Saved ✓" : saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
