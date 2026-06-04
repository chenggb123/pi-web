"use client";

import { useState, useEffect, useRef } from "react";

export function AppSettingsModal({ onClose }: { onClose: () => void }) {
  const [appName, setAppName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d: { appName?: string }) => {
        setAppName(d.appName ?? "Pi Agent Web");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appName: appName.trim() || "Pi Agent Web" }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch { /* ignore */ } finally { setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: 420, maxWidth: "calc(100vw - 32px)", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.18)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Settings</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "2px 6px" }}>×</button>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>Application Name</label>
            <input
              ref={inputRef}
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              disabled={loading}
              placeholder="Pi Agent Web"
              style={{
                padding: "8px 10px", background: "var(--bg-panel)", border: "1px solid var(--border)",
                borderRadius: 6, color: "var(--text)", fontSize: 14, outline: "none",
                fontFamily: "var(--font-mono)", width: "100%", boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5 }}>
            Changes the app name shown in the login page, sidebar title, and chat welcome screen.
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
