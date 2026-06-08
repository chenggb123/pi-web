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
  const [appName, setAppName] = useState("Pi Agent Web");
  const usernameRef = useRef<HTMLInputElement>(null);

  // WeChat Work QR code login
  const [wechatEnabled, setWechatEnabled] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrState, setQrState] = useState<string | null>(null);
  const [qrPolling, setQrPolling] = useState(false);
  const [qrExpired, setQrExpired] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d: { appName?: string }) => { if (d.appName) setAppName(d.appName); })
      .catch(() => {});
  }, []);

  // Check current status on mount
  useEffect(() => {
    fetch("/api/admin/status")
      .then((r) => r.json())
      .then((d: { authenticated?: boolean; needsSetup?: boolean; wechatEnabled?: boolean; role?: string }) => {
        if (d.authenticated) {
          router.replace("/");
          return;
        }
        setMode(d.needsSetup ? "setup" : "login");
        if (d.wechatEnabled) {
          setWechatEnabled(true);
          loadWechatQR();
        }
      })
      .catch(() => setMode("login"));
  }, [router]);

  // Load WeChat QR code
  const loadWechatQR = useCallback(() => {
    setQrExpired(false);
    fetch("/api/auth/login/wechat")
      .then((r) => r.json())
      .then((d: { enabled?: boolean; qrDataUrl?: string; state?: string; error?: string }) => {
        if (d.enabled && d.qrDataUrl) {
          setQrDataUrl(d.qrDataUrl);
          setQrState(d.state ?? null);
          startPolling(d.state ?? null);
        } else {
          setWechatEnabled(false);
        }
      })
      .catch(() => setWechatEnabled(false));
  }, []);

  // Start polling for login completion
  const startPolling = useCallback((state: string | null) => {
    if (!state) return;
    // Clear any existing poll
    if (pollRef.current) clearInterval(pollRef.current);
    setQrPolling(true);
    let attempts = 0;
    pollRef.current = setInterval(() => {
      attempts++;
      fetch(`/api/auth/login/wechat/poll?state=${encodeURIComponent(state)}`)
        .then((r) => r.json())
        .then((d: { ready?: boolean; expired?: boolean }) => {
          if (d.ready) {
            // Login successful! Cookie is set by the poll response.
            stopPolling();
            router.replace("/");
          } else if (d.expired) {
            stopPolling();
            setQrExpired(true);
          }
        })
        .catch(() => { /* retry */ });
      // Timeout after 5 minutes
      if (attempts >= 150) {
        stopPolling();
        setQrExpired(true);
      }
    }, 2000);
  }, [router]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setQrPolling(false);
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

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
            {appName}
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
                  Account
                </label>
                <input
                  ref={usernameRef}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                  placeholder="Account name"
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

              {/* ── WeChat Work Login ── */}
              {wechatEnabled && mode !== "setup" && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                    <span style={{ fontSize: 11, color: "var(--text-dim)", flexShrink: 0 }}>or</span>
                    <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                  </div>
                  <button
                    onClick={() => { setQrModalOpen(true); if (!qrDataUrl) loadWechatQR(); }}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      width: "100%", padding: "10px 0",
                      background: "none", border: "1px solid var(--border)", borderRadius: 6,
                      color: "var(--text-muted)", cursor: "pointer", fontSize: 13, fontWeight: 500,
                      transition: "background 0.12s, border-color 0.12s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--bg-hover)";
                      e.currentTarget.style.borderColor = "#07C160";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "none";
                      e.currentTarget.style.borderColor = "var(--border)";
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="#07C160">
                      <path d="M8.5 3a5.5 5.5 0 0 0-2.7.66A9.03 9.03 0 0 0 7.73 9c0 5.16 4.3 9.37 9.54 9.37.63 0 1.24-.05 1.85-.17A8.5 8.5 0 1 0 8.5 3z"/>
                      <path d="M21.5 14a8.5 8.5 0 0 1-8.5 8.5c-.63 0-1.24-.05-1.85-.17A9.03 9.03 0 0 0 13 21c5.16 0 9.37-4.3 9.37-9.54 0-.63-.05-1.24-.17-1.85A8.5 8.5 0 0 1 21.5 14z"/>
                    </svg>
                    Login with WeChat Work
                  </button>

                  {/* QR Code Modal */}
                  {qrModalOpen && (
                    <div
                      style={{
                        position: "fixed", inset: 0, zIndex: 2000,
                        background: "rgba(0,0,0,0.45)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                      onClick={(e) => { if (e.target === e.currentTarget) { setQrModalOpen(false); stopPolling(); } }}
                    >
                      <div style={{
                        width: 300, background: "var(--bg)", border: "1px solid var(--border)",
                        borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
                        overflow: "hidden",
                      }}>
                        {/* Modal header */}
                        <div style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "14px 18px", borderBottom: "1px solid var(--border)",
                        }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>WeChat Work Login</span>
                          <button
                            onClick={() => { setQrModalOpen(false); stopPolling(); }}
                            style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "2px 6px" }}
                          >×</button>
                        </div>
                        {/* QR code area */}
                        <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
                          {qrExpired ? (
                            <div style={{
                              width: 200, height: 200, borderRadius: 8,
                              background: "var(--bg-panel)", border: "1px solid var(--border)",
                              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10,
                            }}>
                              <span style={{ fontSize: 12, color: "var(--text-dim)" }}>QR code expired</span>
                              <button onClick={loadWechatQR} style={{
                                padding: "5px 16px", fontSize: 12, fontWeight: 500,
                                borderRadius: 5, border: "1px solid var(--accent)",
                                background: "none", color: "var(--accent)", cursor: "pointer",
                              }}>
                                Refresh
                              </button>
                            </div>
                          ) : qrDataUrl ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={qrDataUrl}
                                alt="WeChat Work QR Code"
                                style={{ width: 200, height: 200, borderRadius: 8, border: "1px solid var(--border)" }}
                              />
                              {qrPolling && (
                                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-dim)" }}>
                                  <span style={{
                                    width: 12, height: 12, borderRadius: "50%",
                                    border: "2px solid var(--border)", borderTopColor: "var(--accent)",
                                    animation: "spin 0.8s linear infinite",
                                    display: "inline-block",
                                  }} />
                                  Waiting for scan…
                                </div>
                              )}
                            </>
                          ) : (
                            <div style={{
                              width: 200, height: 200, borderRadius: 8,
                              background: "var(--bg-panel)", border: "1px solid var(--border)",
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                              <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Loading…</span>
                            </div>
                          )}
                          <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
                            Scan with WeChat Work app to log in
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
