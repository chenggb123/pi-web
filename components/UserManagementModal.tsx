"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface UserInfo {
  id: string;
  username: string;
  role: string;
  createdAt: string;
  displayName?: string;
  department?: string;
  position?: string;
  phone?: string;
  avatar?: string;
}

interface RoleInfo {
  id: string;
  label: string;
  permissions: string[];
  is_default: boolean;
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
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [formRole, setFormRole] = useState("user");
  const [formDisplayName, setFormDisplayName] = useState("");
  const [formDepartment, setFormDepartment] = useState("");
  const [formPosition, setFormPosition] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formAvatar, setFormAvatar] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const avatarReaderRef = useRef<FileReader | null>(null);

  // Cleanup FileReader on unmount to prevent memory leak
  useEffect(() => {
    return () => { avatarReaderRef.current?.abort(); };
  }, []);

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

  useEffect(() => { loadUsers(); loadRoles(); }, [loadUsers]);

  const loadRoles = useCallback(() => {
    fetch("/api/admin/roles")
      .then((r) => r.json())
      .then((d: { roles?: RoleInfo[] }) => {
        setRoles(d.roles ?? []);
        // Set default role if adding a new user
        if (mode === "add") {
          const def = (d.roles ?? []).find((r) => r.is_default);
          if (def) setFormRole(def.id);
        }
      })
      .catch(() => {});
  }, [mode]);

  useEffect(() => {
    if (mode === "add" || mode === "edit") usernameRef.current?.focus();
  }, [mode]);

  const handleAdd = useCallback(() => {
    setMode("add");
    setSelectedUser(null);
    setFormUsername("");
    setFormPassword("");
    setFormRole("user");
    setFormDisplayName("");
    setFormDepartment("");
    setFormPosition("");
    setFormPhone("");
    setFormAvatar("");
    setFormError(null);
  }, []);

  const handleEdit = useCallback((user: UserInfo) => {
    setMode("edit");
    setSelectedUser(user);
    setFormUsername(user.username);
    setFormPassword("");
    setFormRole(user.role);
    setFormDisplayName(user.displayName ?? "");
    setFormDepartment(user.department ?? "");
    setFormPosition(user.position ?? "");
    setFormPhone(user.phone ?? "");
    setFormAvatar(user.avatar ?? "");
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
            displayName: formDisplayName.trim(),
            department: formDepartment.trim(),
            position: formPosition.trim(),
            phone: formPhone.trim(),
            avatar: formAvatar,
          }),
        });
        const d = (await res.json()) as { success?: boolean; error?: string };
        if (!res.ok || d.error) {
          setFormError(d.error ?? `HTTP ${res.status}`);
          return;
        }
      } else if (mode === "edit" && selectedUser) {
        // Always send all editable fields (account is locked)
        const body: Record<string, string> = {
          role: formRole,
          displayName: formDisplayName.trim(),
          department: formDepartment.trim(),
          position: formPosition.trim(),
          phone: formPhone.trim(),
          avatar: formAvatar,
        };
        if (formPassword.trim()) body.password = formPassword;
        const res = await fetch("/api/admin/users", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: selectedUser.id, ...body }),
        });
        const d = (await res.json()) as { success?: boolean; error?: string };
        if (!res.ok || d.error) {
          setFormError(d.error ?? `HTTP ${res.status}`);
          setSaving(false);
          return;
        }
      }
      loadUsers();
      setMode("list");
      setSelectedUser(null);
      setFormError(null);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
    } catch (e) {
      setFormError(String(e));
    } finally {
      setSaving(false);
    }
  }, [mode, selectedUser, formUsername, formPassword, formRole, formDisplayName, formDepartment, formPosition, formPhone, formAvatar, loadUsers]);

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
                      background: "rgba(37,99,235,0.12)", color: "rgba(37,99,235,0.8)",
                      fontWeight: 600, textTransform: "uppercase", flexShrink: 0,
                    }}>
                      {roles.find((r) => r.id === user.role)?.label ?? user.role}
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

                {/* Avatar — centered at top */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                  {formAvatar ? (
                    <img src={formAvatar} alt="" style={{ width: 80, height: 80, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--border)", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }} />
                  ) : (
                    <div style={{
                      width: 80, height: 80, borderRadius: "50%",
                      background: formRole === "admin"
                        ? "linear-gradient(135deg, #2563eb, #7c3aed)"
                        : "linear-gradient(135deg, #6b7280, #9ca3af)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#fff", fontSize: 30, fontWeight: 700,
                      textTransform: "uppercase", boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                    }}>
                      {(formDisplayName || formUsername).charAt(0) || "?"}
                    </div>
                  )}
                  <label style={{
                    padding: "4px 12px", background: "var(--bg-hover)", border: "1px solid var(--border)",
                    borderRadius: 5, cursor: "pointer", fontSize: 11, color: "var(--text-muted)",
                    display: "inline-flex", alignItems: "center", gap: 4,
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                    {formAvatar ? "Change photo" : "Upload photo"}
                    <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      avatarReaderRef.current?.abort();
                      const reader = new FileReader();
                      avatarReaderRef.current = reader;
                      reader.onload = () => {
                        setFormAvatar(reader.result as string);
                        avatarReaderRef.current = null;
                      };
                      reader.readAsDataURL(f);
                    }} />
                  </label>
                  {formAvatar && (
                    <button onClick={() => setFormAvatar("")} style={{
                      padding: "2px 0", background: "none", border: "none",
                      cursor: "pointer", fontSize: 11, color: "#ef4444",
                    }}>
                      Remove photo
                    </button>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
                    Account (login) {mode === "edit" && <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>— locked</span>}
                  </label>
                  <input
                    ref={usernameRef}
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
                    placeholder="Login account name"
                    disabled={mode === "edit"}
                    title={mode === "edit" ? "Account name cannot be changed after creation" : ""}
                    style={{ ...inputStyle, fontFamily: "var(--font-mono)", opacity: mode === "edit" ? 0.5 : 1, cursor: mode === "edit" ? "not-allowed" : "text" }}
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
                    onChange={(e) => setFormRole(e.target.value)}
                    style={inputStyle}
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>{r.label}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>Name</label>
                  <input value={formDisplayName} onChange={(e) => setFormDisplayName(e.target.value)} placeholder="Display name" style={inputStyle} />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>Position</label>
                  <input value={formPosition} onChange={(e) => setFormPosition(e.target.value)} placeholder="e.g. Software Engineer" style={inputStyle} />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>Department</label>
                    <input value={formDepartment} onChange={(e) => setFormDepartment(e.target.value)} placeholder="e.g. Engineering" style={inputStyle} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>Phone</label>
                    <input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="e.g. +86 138..." style={inputStyle} />
                  </div>
                </div>

                {formError && (
                  <div style={{ fontSize: 12, color: "#f87171" }}>{formError}</div>
                )}

                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button onClick={handleSave} disabled={saving || savedOk} style={{
                    padding: "7px 16px", background: savedOk ? "#16a34a" : "var(--accent)", border: "none",
                    borderRadius: 5, color: "#fff", cursor: (saving || savedOk) ? "not-allowed" : "pointer",
                    fontSize: 12, fontWeight: 600, transition: "background 0.3s",
                  }}>
                    {saving ? "Saving…" : savedOk ? "✓ Saved" : mode === "add" ? "Create" : "Save Changes"}
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
