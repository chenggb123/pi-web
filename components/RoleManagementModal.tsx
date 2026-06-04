"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface Role {
  id: string;
  label: string;
  permissions: string[];
  is_default: boolean;
}

const ALL_PERMISSIONS = [
  { key: "models:write", label: "Models Config", desc: "管理 Model 配置和 API Keys" },
  { key: "skills:write", label: "Skills Config", desc: "安装和启用/禁用 Skills" },
  { key: "skills:global", label: "Global Skills", desc: "管理全局 Skills" },
  { key: "users:manage", label: "User Management", desc: "管理用户和角色" },
  { key: "agent:full_tools", label: "Full Tool Preset", desc: "使用全部 7 个 Agent 工具" },
  { key: "files:delete", label: "Delete Files", desc: "删除工作空间中的文件" },
];

export function RoleManagementModal({ onClose }: { onClose: () => void }) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editId, setEditId] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editPerms, setEditPerms] = useState<Set<string>>(new Set());
  const [editDefault, setEditDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [mode, setMode] = useState<"list" | "add" | "edit">("list");
  const idRef = useRef<HTMLInputElement>(null);

  const loadRoles = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/admin/roles")
      .then((r) => r.json())
      .then((d: { roles?: Role[]; error?: string }) => {
        if (d.error) { setError(d.error); return; }
        setRoles(d.roles ?? []);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadRoles(); }, [loadRoles]);

  const startAdd = () => {
    setMode("add");
    setSelectedId(null);
    setEditId("");
    setEditLabel("");
    setEditPerms(new Set());
    setEditDefault(false);
    setTimeout(() => idRef.current?.focus(), 50);
  };

  const startEdit = (role: Role) => {
    setMode("edit");
    setSelectedId(role.id);
    setEditId(role.id);
    setEditLabel(role.label);
    setEditPerms(new Set(role.permissions));
    setEditDefault(role.is_default);
    setTimeout(() => idRef.current?.focus(), 50);
  };

  const handleSave = async () => {
    if (!editId.trim() || !editLabel.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/roles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editId.trim(),
          label: editLabel.trim(),
          permissions: Array.from(editPerms),
          isDefault: editDefault,
        }),
      });
      const d = (await res.json()) as { success?: boolean; error?: string };
      if (d.error) { setError(d.error); return; }
      loadRoles();
      setMode("list");
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch("/api/admin/roles", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const d = (await res.json()) as { success?: boolean; error?: string };
      if (d.error) { setError(d.error); return; }
      setDeleteConfirm(null);
      loadRoles();
      if (selectedId === id) { setMode("list"); setSelectedId(null); }
    } catch (e) {
      setError(String(e));
    }
  };

  const togglePerm = (key: string) => {
    setEditPerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const inputStyle: React.CSSProperties = {
    padding: "6px 9px", background: "var(--bg-panel)", border: "1px solid var(--border)",
    borderRadius: 5, color: "var(--text)", fontSize: 12, outline: "none",
    width: "100%", boxSizing: "border-box",
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1050, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: 760, height: "70vh", maxWidth: "calc(100vw - 32px)", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, display: "flex", flexDirection: "column", boxShadow: "0 8px 32px rgba(0,0,0,0.18)", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Role Permissions</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "2px 6px" }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Left: role list */}
          <div style={{ width: 200, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", flexShrink: 0, background: "var(--bg-panel)" }}>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 6px" }}>
              {loading ? <div style={{ padding: "10px 8px", fontSize: 12, color: "var(--text-muted)" }}>Loading…</div>
                : error ? <div style={{ padding: "10px 8px", fontSize: 11, color: "#f87171" }}>{error}</div>
                  : roles.map((r) => (
                    <div key={r.id} onClick={() => startEdit(r)} style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "8px", borderRadius: 5, cursor: "pointer",
                      background: selectedId === r.id ? "var(--bg-selected)" : "none",
                    }}
                      onMouseEnter={(e) => { if (selectedId !== r.id) e.currentTarget.style.background = "var(--bg-hover)"; }}
                      onMouseLeave={(e) => { if (selectedId !== r.id) e.currentTarget.style.background = "none"; }}
                    >
                      <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
                      <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>{r.id}</span>
                      {r.is_default && <span style={{ fontSize: 9, color: "var(--accent)", fontWeight: 600 }}>default</span>}
                    </div>
                  ))}
            </div>
            <div style={{ padding: "8px 6px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
              <button onClick={startAdd} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, width: "100%", padding: "6px 0", background: "none", border: "1px dashed var(--border)", borderRadius: 5, color: "var(--text-muted)", cursor: "pointer", fontSize: 12 }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; }}
              >+ Add role</button>
            </div>
          </div>

          {/* Right: edit panel */}
          <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
            {mode === "list" ? (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)", fontSize: 13 }}>
                Select a role to edit
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
                  {mode === "add" ? "New Role" : `Edit: ${editLabel || editId}`}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>Role ID</label>
                  <input ref={idRef} value={editId} onChange={(e) => setEditId(e.target.value)} placeholder="e.g. developer"
                    style={{ ...inputStyle, fontFamily: "var(--font-mono)" }} disabled={mode === "edit"} />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>Display Name</label>
                  <input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} placeholder="e.g. Developer"
                    style={inputStyle} />
                </div>

                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: "var(--text-muted)" }}>
                    <input type="checkbox" checked={editDefault} onChange={(e) => setEditDefault(e.target.checked)}
                      style={{ width: 13, height: 13, accentColor: "var(--accent)", cursor: "pointer" }} />
                    Default role for new users
                  </label>
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Permissions</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {ALL_PERMISSIONS.map((perm) => (
                      <label key={perm.key} style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
                        background: editPerms.has(perm.key) ? "var(--bg-selected)" : "var(--bg-panel)",
                        border: `1px solid ${editPerms.has(perm.key) ? "var(--accent)" : "var(--border)"}`,
                        borderRadius: 6, cursor: "pointer", transition: "border-color 0.12s",
                      }}>
                        <input type="checkbox" checked={editPerms.has(perm.key)} onChange={() => togglePerm(perm.key)}
                          style={{ width: 13, height: 13, accentColor: "var(--accent)", cursor: "pointer", flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>{perm.label}</div>
                          <div style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{perm.desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={handleSave} disabled={saving} style={{ padding: "7px 16px", background: "var(--accent)", border: "none", borderRadius: 5, color: "#fff", cursor: saving ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600 }}>
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button onClick={() => { setMode("list"); setSelectedId(null); }} style={{ padding: "7px 14px", background: "none", border: "1px solid var(--border)", borderRadius: 5, color: "var(--text-muted)", cursor: "pointer", fontSize: 12 }}>Cancel</button>

                  {mode === "edit" && (
                    <div style={{ marginLeft: "auto" }}>
                      {deleteConfirm === editId ? (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => handleDelete(editId)} style={{ padding: "7px 14px", background: "#ef4444", border: "none", borderRadius: 5, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Confirm</button>
                          <button onClick={() => setDeleteConfirm(null)} style={{ padding: "7px 14px", background: "none", border: "1px solid var(--border)", borderRadius: 5, color: "var(--text-muted)", cursor: "pointer", fontSize: 12 }}>Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => setDeleteConfirm(editId)} style={{ padding: "7px 14px", background: "none", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 5, color: "#ef4444", cursor: "pointer", fontSize: 12 }}>Delete Role</button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
