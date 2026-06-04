"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface UserInfo {
  id: string;
  username: string;
  role: "admin" | "user";
  createdAt: string;
}

type Mode = "list" | "add" | "edit";

export function UserManagementModal({
  currentUserId,
  onClose,
}: {
  currentUserId: string;
  onClose: () => void;
}) {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("list");
  const [selectedUser, setSelectedUser] = useState<UserInfo | null>(null);
  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState<"admin" | "user">("user");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const usernameRef = useRef<HTMLInputElement>(null);

  const loadUsers = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((d: { users?: UserInfo[]; error?: string }) => {
        if (d.error) { setError(d.error); return; }
        setUsers(d.users ?? []);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  useEffect(() => {
    if (mode === "add" || mode === "edit") usernameRef.current?.focus();
  }, [mode]);

  const handleAdd = useCallback(() => {
    setMode("add");
    setSelectedUser(null);
    setFormUsername("");
    setFormPassword("");
    setFormRole("user");
    setFormError(null);
  }, []);

  const handleEdit = useCallback((user: UserInfo) => {
    setMode("edit");
    setSelectedUser(user);
    setFormUsername(user.username);
    setFormPassword("");
    setFormRole(user.role);
    setFormError(null);
  }, []);

  const handleCancel = useCallback(() => {
    setMode("list");
    setSelectedUser(null);
    setFormError(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!formUsername.trim()) {
      setFormError("Username is required");
      return;
    }
    if (mode === "add" && !formPassword.trim()) {
      setFormError("Password is required");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (mode === "add") {
        const res = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: formUsername.trim(),
            password: formPassword,
            role: formRole,
          }),
        });
        const d = (await res.json()) as { success?: boolean; error?: string };
        if (!res.ok || d.error) {
          setFormError(d.error ?? `HTTP ${res.status}`);
          return;
        }
      } else if (mode === "edit" && selectedUser) {
        const body: Record<string, string> = {};
        if (formUsername.trim() !== selectedUser.username) body.username = formUsername.trim();
        if (formPassword.trim()) body.password = formPassword;
        if (formRole !== selectedUser.role) body.role = formRole;
        if (Object.keys(body).length > 0) {
          const res = await fetch("/api/admin/users", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: selectedUser.id, ...body }),
          });
          const d = (await res.json()) as { success?: boolean; error?: string };
          if (!res.ok || d.error) {
            setFormError(d.error ?? `HTTP ${res.status}`);
            return;
          }
        }
      }
      loadUsers();
      setMode("list");
      setSelectedUser(null);
    } catch (e) {
      setFormError(String(e));
    } finally {
      setSaving(false);
    }
  }, [mode, selectedUser, formUsername, formPassword, formRole, loadUsers]);

  const handleDelete = useCallback(async (userId: string) => {
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: userId }),
      });
      const d = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || d.error) {
        setError(d.error ?? `HTTP ${res.status}`);
        return;
      }
      setDeleteConfirm(null);
      loadUsers();
    } catch (e) {
      setError(String(e));
    }
  }, [loadUsers]);

  const inputStyle: React.CSSProperties = {
    padding: "6px 9px",
    background: "var(--bg-panel)",
    border: "1px solid var(--border)",
    borderRadius: 5,
    color: "var(--text)",
    fontSize: 12,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1050,
        background: "rgba(0,0,0,0.35)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: 700, height: "70vh", maxWidth: "calc(100vw - 32px)",
        background: "var(--bg)", border: "1px solid var(--border)",
        borderRadius: 10, display: "flex", flexDirection: "column",
        boxShadow: "0 8px 32px rgba(0,0,0,0.18)", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 18px", borderBottom: "1px solid var(--border)", flexShrink: 0,
        }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
            User Management
          </span>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: "var(--text-muted)",
            cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "2px 6px",
          }}>
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Left sidebar: user list */}
          <div style={{
            width: 210, borderRight: "1px solid var(--border)",
            display: "flex", flexDirection: "column", flexShrink: 0,
            background: "var(--bg-panel)",
          }}>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 6px" }}>
              {loading ? (
                <div style={{ padding: "10px 8px", fontSize: 12, color: "var(--text-muted)" }}>Loading…</div>
              ) : error ? (
                <div style={{ padding: "10px 8px", fontSize: 11, color: "#f87171" }}>{error}</div>
              ) : users.length === 0 ? (
                <div style={{ padding: "10px 8px", fontSize: 11, color: "var(--text-dim)" }}>No users</div>
              ) : (
                users.map((user) => (
                  <div
                    key={user.id}
                    onClick={() => handleEdit(user)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "8px", borderRadius: 5, cursor: "pointer",
                      background: selectedUser?.id === user.id ? "var(--bg-selected)" : "none",
                    }}
                    onMouseEnter={(e) => {
                      if (selectedUser?.id !== user.id) e.currentTarget.style.background = "var(--bg-hover)";
                    }}
                    onMouseLeave={(e) => {
                      if (selectedUser?.id !== user.id) e.currentTarget.style.background = "none";
                    }}
                  >
                    <span style={{
                      flex: 1, fontSize: 12, fontWeight: 500, color: "var(--text)",
                      fontFamily: "var(--font-mono)", overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {user.username}
                    </span>
                    <span style={{
                      fontSize: 9, padding: "1px 6px", borderRadius: 3,
                      background: user.role === "admin" ? "rgba(37,99,235,0.12)" : "rgba(120,120,120,0.12)",
                      color: user.role === "admin" ? "rgba(37,99,235,0.8)" : "var(--text-dim)",
                      fontWeight: 600, textTransform: "uppercase", flexShrink: 0,
                    }}>
                      {user.role}
                    </span>
                  </div>
                ))
              )}
            </div>
            {/* Add user button */}
            <div style={{ padding: "8px 6px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
              <button onClick={handleAdd} style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                width: "100%", padding: "6px 0", background: "none",
                border: "1px dashed var(--border)", borderRadius: 5,
                color: "var(--text-muted)", cursor: "pointer", fontSize: 12,
              }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; }}
              >
                + Add user
              </button>
            </div>
          </div>

          {/* Right panel */}
          <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
            {mode === "list" ? (
              <div style={{
                height: "100%", display: "flex", alignItems: "center",
                justifyContent: "center", color: "var(--text-dim)", fontSize: 13,
              }}>
                {users.length > 0 ? "Select a user to edit or add a new one" : "Add your first user"}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
                  {mode === "add" ? "Add User" : `Edit: ${selectedUser?.username}`}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>Username</label>
                  <input
                    ref={usernameRef}
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
                    placeholder="Username"
                    style={{ ...inputStyle, fontFamily: "var(--font-mono)" }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
                    {mode === "add" ? "Password" : "New Password (leave blank to keep unchanged)"}
                  </label>
                  <input
                    type="password"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
                    placeholder={mode === "add" ? "Password" : "Leave blank to keep current"}
                    autoComplete="new-password"
                    style={{ ...inputStyle, fontFamily: "var(--font-mono)" }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>Role</label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as "admin" | "user")}
                    style={inputStyle}
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                {formError && (
                  <div style={{ fontSize: 12, color: "#f87171" }}>{formError}</div>
                )}

                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button onClick={handleSave} disabled={saving} style={{
                    padding: "7px 16px", background: "var(--accent)", border: "none",
                    borderRadius: 5, color: "#fff", cursor: saving ? "not-allowed" : "pointer",
                    fontSize: 12, fontWeight: 600,
                  }}>
                    {saving ? "Saving…" : mode === "add" ? "Create" : "Save Changes"}
                  </button>
                  <button onClick={handleCancel} style={{
                    padding: "7px 14px", background: "none",
                    border: "1px solid var(--border)", borderRadius: 5,
                    color: "var(--text-muted)", cursor: "pointer", fontSize: 12,
                  }}>
                    Cancel
                  </button>

                  {/* Delete button — only for edit mode */}
                  {mode === "edit" && selectedUser && (
                    <div style={{ marginLeft: "auto" }}>
                      {deleteConfirm === selectedUser.id ? (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => handleDelete(selectedUser.id)} style={{
                            padding: "7px 14px", background: "#ef4444", border: "none",
                            borderRadius: 5, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600,
                          }}>
                            Confirm Delete
                          </button>
                          <button onClick={() => setDeleteConfirm(null)} style={{
                            padding: "7px 14px", background: "none",
                            border: "1px solid var(--border)", borderRadius: 5,
                            color: "var(--text-muted)", cursor: "pointer", fontSize: 12,
                          }}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(selectedUser.id)}
                          disabled={selectedUser.id === currentUserId}
                          title={selectedUser.id === currentUserId ? "Cannot delete yourself" : undefined}
                          style={{
                            padding: "7px 14px", background: "none",
                            border: "1px solid rgba(239,68,68,0.3)", borderRadius: 5,
                            color: selectedUser.id === currentUserId ? "var(--text-dim)" : "#ef4444",
                            cursor: selectedUser.id === currentUserId ? "not-allowed" : "pointer",
                            fontSize: 12, opacity: selectedUser.id === currentUserId ? 0.4 : 1,
                          }}
                        >
                          Delete User
                        </button>
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
