"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"loading" | "login" | "setup">("loading");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);

  // Check current status on mount
  useEffect(() => {
    fetch("/api/admin/status")
      .then((r) => r.json())
      .then((d: { authenticated?: boolean; needsSetup?: boolean; role?: string }) => {
        if (d.authenticated) {
          router.replace("/");
          return;
        }
        setMode(d.needsSetup ? "setup" : "login");
      })
      .catch(() => setMode("login"));
  }, [router]);

  useEffect(() => {
    if (mode !== "loading") usernameRef.current?.focus();
  }, [mode]);

  const handleSubmit = useCallback(async () => {
    if (!username.trim() || !password.trim()) {
      setError("Username and password are required");
      return;
    }
    if (mode === "setup" && password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password: password,
          setup: mode === "setup",
        }),
      });
      const d = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || d.error) {
        setError(d.error ?? `HTTP ${res.status}`);
        return;
      }
      router.replace("/");
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }, [username, password, confirmPassword, mode, router]);

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        color: "var(--text)",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          width: 380,
          maxWidth: "calc(100vw - 32px)",
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "24px 24px 0",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "var(--text)",
              marginBottom: 6,
            }}
          >
            Pi Agent Web
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {mode === "setup"
              ? "Create your admin account to get started"
              : "Sign in to continue"}
          </div>
        </div>

        {/* Form */}
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
          {mode === "loading" ? (
            <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: "20px 0" }}>
              Checking...
            </div>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11, fontWeight: 500, color: "var(--text-muted)" }}>
                  Username
                </label>
                <input
                  ref={usernameRef}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                  placeholder="Username"
                  autoComplete="username"
                  style={{
                    padding: "8px 10px",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    color: "var(--text)",
                    fontSize: 13,
                    outline: "none",
                    fontFamily: "var(--font-mono)",
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11, fontWeight: 500, color: "var(--text-muted)" }}>
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                  placeholder="Password"
                  autoComplete={mode === "setup" ? "new-password" : "current-password"}
                  style={{
                    padding: "8px 10px",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    color: "var(--text)",
                    fontSize: 13,
                    outline: "none",
                    fontFamily: "var(--font-mono)",
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {mode === "setup" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 500, color: "var(--text-muted)" }}>
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                    placeholder="Re-enter password"
                    autoComplete="new-password"
                    style={{
                      padding: "8px 10px",
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      color: "var(--text)",
                      fontSize: 13,
                      outline: "none",
                      fontFamily: "var(--font-mono)",
                      width: "100%",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              )}

              {error && (
                <div style={{ fontSize: 12, color: "#f87171", padding: "6px 10px", background: "rgba(239,68,68,0.06)", borderRadius: 6, border: "1px solid rgba(239,68,68,0.2)" }}>
                  {error}
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={submitting || !username.trim() || !password.trim()}
                style={{
                  marginTop: 4,
                  padding: "10px 0",
                  background: username.trim() && password.trim() && !submitting ? "var(--accent)" : "var(--bg-panel)",
                  border: "none",
                  borderRadius: 6,
                  color: username.trim() && password.trim() && !submitting ? "#fff" : "var(--text-dim)",
                  cursor: username.trim() && password.trim() && !submitting ? "pointer" : "not-allowed",
                  fontSize: 14,
                  fontWeight: 600,
                  width: "100%",
                }}
              >
                {submitting
                  ? "Please wait…"
                  : mode === "setup"
                    ? "Create Account"
                    : "Sign In"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
