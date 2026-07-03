import React, { useState, useEffect } from "react";
import { User } from "../types";
import { API_BASE, LOGO_URL } from "../constants";
import { useToast } from "../hooks/useToast";

// ─── WebAuthn helpers ────────────────────────────────────────────────────────
function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64urlToBuffer(b64: string): ArrayBuffer {
  const base64 = b64.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf.buffer;
}

function checkPasskeySupport(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.PublicKeyCredential &&
    typeof navigator.credentials?.get === "function"
  );
}

function detectDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  const androidMatch = ua.match(/Android[^;]*;\s*([^)]+)\)/);
  if (androidMatch) {
    const model = androidMatch[1].replace(/Build\/.+$/, "").trim();
    return model || "Android";
  }
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows NT/.test(ua)) return "Windows PC";
  if (/Linux/.test(ua)) return "Linux";
  return "Thiết bị của tôi";
}

async function hasPlatformAuthenticator(): Promise<boolean> {
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}
// ─────────────────────────────────────────────────────────────────────────────

type Phase = "login" | "passkey_prompt" | "passkey_registering";

interface LoginProps {
  onLoginSuccess: (user: User) => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
}

const LoginPage: React.FC<LoginProps> = ({
  onLoginSuccess,
  isDarkMode,
  toggleTheme,
}) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(false);
  const { showToast } = useToast();
  const [lockInfo, setLockInfo] = useState<{
    locked_by?: string;
    locked_at?: string;
  } | null>(null);
  const [autoLockMessage, setAutoLockMessage] = useState<string | null>(null);

  // ── Passkey prompt state ──────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("login");
  const [pendingUser, setPendingUser] = useState<User | null>(null);
  const [deviceName, setDeviceName] = useState("");

  useEffect(() => {
    setPasskeySupported(checkPasskeySupport());
  }, []);

  const clearAlerts = () => {
    setLockInfo(null);
    setAutoLockMessage(null);
  };

  // ── Login bằng mật khẩu ──────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      showToast("Vui lòng điền đầy đủ thông tin", "warning");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        const data = await res.json();
        localStorage.setItem("access_token", data.access_token);
        localStorage.setItem("refresh_token", data.refresh_token);

        const userData: User = {
          id: data.id || "temp",
          username: data.username || username,
          fullName: data.full_name,
          role: data.role,
          avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(data.full_name)}&background=0ea5e9&color=fff`,
        };

        // Kiểm tra có nên hiện prompt đăng ký passkey không
        const skipKey = `wa_skip_${data.username || username}`;
        const alreadySkipped = !!localStorage.getItem(skipKey);
        const supported = checkPasskeySupport();
        const hasPlatform = supported
          ? await hasPlatformAuthenticator()
          : false;

        if (supported && hasPlatform && !alreadySkipped) {
          const detected = detectDeviceName();
          setDeviceName(detected);
          setPendingUser(userData);
          setPhase("passkey_prompt");
        } else {
          showToast(`Chào mừng trở lại, ${data.full_name}!`, "success");
          onLoginSuccess(userData);
        }
      } else {
        const error = await res.json();
        if (error.error === "ACCOUNT_LOCKED") {
          setLockInfo({
            locked_by: error.locked_by,
            locked_at: error.locked_at,
          });
          setAutoLockMessage(null);
          return;
        }
        if (error.error === "TOO_MANY_FAILED_ATTEMPTS" || res.status === 429) {
          setAutoLockMessage(
            error.message ||
              "Quá nhiều lần đăng nhập sai. Vui lòng thử lại sau.",
          );
          setLockInfo(null);
          return;
        }
        showToast(error.message || "Sai tài khoản hoặc mật khẩu", "danger");
      }
    } catch {
      showToast("Không thể kết nối với máy chủ", "danger");
    } finally {
      setLoading(false);
    }
  };

  // ── Đăng ký passkey từ prompt ─────────────────────────────────────────────
  const handlePromptRegister = async () => {
    if (!pendingUser) return;
    setPhase("passkey_registering");
    const token = localStorage.getItem("access_token");
    try {
      const beginRes = await fetch(`${API_BASE}/webauthn/register/begin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      if (!beginRes.ok) throw new Error("begin_failed");

      const options = await beginRes.json();
      const { session_token, ...pubKeyRaw } = options;

      const publicKey: PublicKeyCredentialCreationOptions = {
        ...pubKeyRaw,
        challenge: base64urlToBuffer(pubKeyRaw.challenge),
        user: { ...pubKeyRaw.user, id: base64urlToBuffer(pubKeyRaw.user.id) },
        excludeCredentials: pubKeyRaw.excludeCredentials?.map(
          (c: {
            id: string;
            type: string;
            transports?: AuthenticatorTransport[];
          }) => ({
            ...c,
            id: base64urlToBuffer(c.id),
          }),
        ),
      };

      const credential = (await navigator.credentials.create({
        publicKey,
      })) as PublicKeyCredential | null;
      if (!credential) {
        showToast("Đăng ký bị hủy", "warning");
        setPhase("passkey_prompt");
        return;
      }

      const resp = credential.response as AuthenticatorAttestationResponse;
      const completeRes = await fetch(
        `${API_BASE}/webauthn/register/complete`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            session_token,
            id: credential.id,
            rawId: bufferToBase64url(credential.rawId),
            type: credential.type,
            device_name: deviceName.trim() || "Thiết bị của tôi",
            response: {
              clientDataJSON: bufferToBase64url(resp.clientDataJSON),
              attestationObject: bufferToBase64url(resp.attestationObject),
            },
          }),
        },
      );

      if (completeRes.ok) {
        showToast(
          `Đã bật Passkey cho ${deviceName || "thiết bị này"}! Lần sau đăng nhập không cần mật khẩu.`,
          "success",
        );
      } else {
        showToast("Không thể đăng ký passkey, thử lại sau", "warning");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        showToast("Đăng ký bị hủy", "warning");
      } else {
        showToast("Lỗi khi đăng ký passkey", "warning");
      }
    } finally {
      showToast(`Chào mừng trở lại, ${pendingUser.fullName}!`, "success");
      onLoginSuccess(pendingUser);
    }
  };

  const handleSkip = () => {
    if (!pendingUser) return;
    showToast(`Chào mừng trở lại, ${pendingUser.fullName}!`, "success");
    onLoginSuccess(pendingUser);
  };

  const handleSkipPermanently = () => {
    if (!pendingUser) return;
    localStorage.setItem(`wa_skip_${pendingUser.username}`, "1");
    handleSkip();
  };

  // ── Login bằng Passkey (từ trang login) ──────────────────────────────────
  const handlePasskeyLogin = async () => {
    setPasskeyLoading(true);
    clearAlerts();
    try {
      const beginRes = await fetch(`${API_BASE}/webauthn/authenticate/begin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username || undefined }),
      });
      if (!beginRes.ok) {
        const err = await beginRes.json().catch(() => ({}));
        showToast(
          err.message || "Không thể bắt đầu xác thực Passkey",
          "danger",
        );
        return;
      }

      const options = await beginRes.json();
      const { session_token, ...publicKeyRaw } = options;

      const publicKeyOptions: PublicKeyCredentialRequestOptions = {
        ...publicKeyRaw,
        challenge: base64urlToBuffer(publicKeyRaw.challenge),
        allowCredentials: publicKeyRaw.allowCredentials?.map(
          (c: {
            id: string;
            type: string;
            transports?: AuthenticatorTransport[];
          }) => ({
            ...c,
            id: base64urlToBuffer(c.id),
          }),
        ),
      };

      const credential = (await navigator.credentials.get({
        publicKey: publicKeyOptions,
      })) as PublicKeyCredential | null;
      if (!credential) {
        showToast("Xác thực Passkey bị hủy", "warning");
        return;
      }

      const resp = credential.response as AuthenticatorAssertionResponse;
      const completeRes = await fetch(
        `${API_BASE}/webauthn/authenticate/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_token,
            id: credential.id,
            rawId: bufferToBase64url(credential.rawId),
            type: credential.type,
            response: {
              authenticatorData: bufferToBase64url(resp.authenticatorData),
              clientDataJSON: bufferToBase64url(resp.clientDataJSON),
              signature: bufferToBase64url(resp.signature),
              userHandle: resp.userHandle
                ? bufferToBase64url(resp.userHandle)
                : null,
            },
          }),
        },
      );

      if (completeRes.ok) {
        const data = await completeRes.json();
        localStorage.setItem("access_token", data.access_token);
        localStorage.setItem("refresh_token", data.refresh_token);
        showToast(`Chào mừng trở lại, ${data.full_name}!`, "success");
        onLoginSuccess({
          id: data.id || "temp",
          username: data.username,
          fullName: data.full_name,
          role: data.role,
          avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(data.full_name)}&background=0ea5e9&color=fff`,
        });
      } else {
        const err = await completeRes.json().catch(() => ({}));
        showToast(err.message || "Xác thực Passkey thất bại", "danger");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        showToast("Xác thực bị hủy bởi người dùng", "warning");
      } else {
        showToast("Lỗi khi xác thực Passkey", "danger");
      }
    } finally {
      setPasskeyLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  const isRegistering = phase === "passkey_registering";

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950 relative overflow-hidden">
      {/* Background decor */}
      <div
        className="absolute inset-0 opacity-[0.2] dark:opacity-[0.1] pointer-events-none select-none"
        style={{
          backgroundImage: "radial-gradient(#0ea5e9 2px, transparent 2px)",
          backgroundSize: "32px 32px",
        }}
      />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-nm/10 blur-[150px] rounded-full pointer-events-none" />

      <div className="w-full max-w-[420px] relative z-10 animate-fade-in">
        <div className="relative bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl rounded-[3rem] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.15)] p-10 border border-white dark:border-slate-800">
          {/* THEME TOGGLE */}
          <button
            onClick={toggleTheme}
            className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-white dark:bg-slate-800 text-nm shadow-lg border border-slate-100 dark:border-slate-700 transition-all duration-300 ease-out hover:scale-110 active:scale-95 group overflow-hidden"
          >
            <span className="absolute inset-0 rounded-full bg-nm/30 scale-0 group-active:scale-150 transition-transform duration-500 ease-out" />
            <i
              className={`fa-solid ${isDarkMode ? "fa-sun text-yellow-500" : "fa-moon"} text-sm relative`}
            />
          </button>

          {/* Logo */}
          <div className="text-center mb-10 select-none">
            <img
              src={LOGO_URL}
              alt="Logo"
              className="max-h-24 mx-auto drop-shadow-md"
            />
          </div>

          {/* ── Phase: Login form ───────────────────────────────────────── */}
          {phase === "login" && (
            <>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest select-none">
                    Tài khoản
                  </label>
                  <div className="relative group">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-nm">
                      <i className="fa-solid fa-user-shield" />
                    </span>
                    <input
                      type="text"
                      autoFocus
                      value={username}
                      autoComplete="username webauthn"
                      onChange={(e) => {
                        setUsername(e.target.value);
                        clearAlerts();
                      }}
                      className="w-full pl-12 pr-4 py-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border-2 border-transparent focus:border-nm focus:bg-white dark:focus:bg-slate-800 outline-none font-bold"
                      placeholder="Mã nhân viên"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest select-none">
                    Mật khẩu
                  </label>
                  <div className="relative group">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-nm">
                      <i className="fa-solid fa-key" />
                    </span>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      autoComplete="current-password"
                      onChange={(e) => {
                        setPassword(e.target.value);
                        clearAlerts();
                      }}
                      className="w-full pl-12 pr-12 py-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border-2 border-transparent focus:border-nm outline-none font-bold"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-nm"
                    >
                      <i
                        className={`fa-solid ${showPassword ? "fa-eye-slash" : "fa-eye"}`}
                      />
                    </button>
                  </div>
                </div>

                {lockInfo && (
                  <div className="bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-700 text-rose-600 dark:text-rose-400 p-4 rounded-2xl text-xs space-y-1">
                    <p className="font-bold uppercase tracking-wider">
                      Tài khoản đã bị khóa
                    </p>
                    <p>
                      Người khóa:{" "}
                      <span className="font-semibold">
                        {lockInfo.locked_by || "Hệ thống"}
                      </span>
                    </p>
                    <p>
                      Thời gian:{" "}
                      <span className="font-semibold">
                        {lockInfo.locked_at
                          ? new Date(lockInfo.locked_at).toLocaleString("vi-VN")
                          : ""}
                      </span>
                    </p>
                  </div>
                )}

                {autoLockMessage && (
                  <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-400 p-4 rounded-2xl text-xs space-y-1">
                    <p className="font-bold uppercase tracking-wider flex items-center gap-2">
                      <i className="fa-solid fa-clock" /> Tạm thời bị giới hạn
                    </p>
                    <p>{autoLockMessage}</p>
                  </div>
                )}

                <div className="flex items-center gap-4 px-2 select-none">
                  <button
                    type="button"
                    onClick={() => setRememberMe(!rememberMe)}
                    className={`relative w-12 h-7 rounded-full transition-colors ${rememberMe ? "bg-nm" : "bg-slate-300 dark:bg-slate-700"}`}
                  >
                    <span
                      className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${rememberMe ? "translate-x-5" : "translate-x-0"}`}
                    />
                  </button>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Nhớ trạng thái đăng nhập
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={loading || passkeyLoading}
                  className="w-full py-4 bg-nm text-white rounded-2xl font-black uppercase tracking-widest shadow-xl hover:bg-nm-hover transition-all flex items-center justify-center gap-3 select-none disabled:opacity-60"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <i className="fa-solid fa-arrow-right-to-bracket fa-beat-fade" />
                      <span>Đăng nhập</span>
                    </>
                  )}
                </button>
              </form>

              {passkeySupported && (
                <>
                  <div className="flex items-center gap-3 my-6 select-none">
                    <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      hoặc
                    </span>
                    <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                  </div>
                  <button
                    type="button"
                    onClick={handlePasskeyLogin}
                    disabled={loading || passkeyLoading}
                    className="group w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 select-none border-2 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 bg-white/60 dark:bg-slate-800/60 hover:border-nm hover:text-nm dark:hover:text-nm hover:bg-nm-50/50 dark:hover:bg-nm-900/10 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden"
                  >
                    <span className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
                    {passkeyLoading ? (
                      <>
                        <span className="relative w-6 h-6 flex items-center justify-center">
                          <i className="fa-solid fa-fingerprint text-nm text-lg" />
                          <span className="absolute inset-0 rounded-full border-2 border-nm/40 animate-ping" />
                        </span>
                        <span>Đang xác thực…</span>
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-fingerprint text-lg group-hover:text-nm transition-colors" />
                        <span>Đăng nhập bằng Passkey</span>
                      </>
                    )}
                  </button>
                  <p className="text-center text-[10px] text-slate-400 dark:text-slate-500 mt-3 select-none">
                    Vân tay · Face ID · Mã PIN thiết bị
                  </p>
                </>
              )}
            </>
          )}

          {/* ── Phase: Passkey prompt sau khi login thành công ──────────── */}
          {(phase === "passkey_prompt" || phase === "passkey_registering") && (
            <div className="space-y-6 animate-fade-in">
              {/* Icon */}
              <div className="flex flex-col items-center gap-3 select-none">
                <div className="relative">
                  <div className="w-20 h-20 rounded-3xl bg-nm-100 dark:bg-nm-900/30 flex items-center justify-center">
                    <i className="fa-solid fa-fingerprint text-4xl text-nm"></i>
                  </div>
                  {isRegistering && (
                    <span className="absolute inset-0 rounded-3xl border-4 border-nm/30 animate-ping" />
                  )}
                </div>
                <div className="text-center">
                  <h3 className="font-black text-slate-800 dark:text-white text-base">
                    Đăng nhập nhanh hơn
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Dùng vân tay hoặc Face ID thay mật khẩu
                  </p>
                </div>
              </div>

              {/* Device name input */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest select-none">
                  Tên thiết bị này
                </label>
                <div className="relative group">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-nm">
                    <i className="fa-solid fa-mobile-screen-button" />
                  </span>
                  <input
                    type="text"
                    value={deviceName}
                    onChange={(e) => setDeviceName(e.target.value)}
                    disabled={isRegistering}
                    maxLength={100}
                    className="w-full pl-12 pr-4 py-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border-2 border-transparent focus:border-nm focus:bg-white dark:focus:bg-slate-800 outline-none font-bold disabled:opacity-60"
                    placeholder="Nhập tên thiết bị..."
                  />
                </div>
              </div>

              {/* Buttons */}
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handlePromptRegister}
                  disabled={isRegistering}
                  className="w-full py-4 bg-nm text-white rounded-2xl font-black uppercase tracking-widest shadow-xl hover:bg-nm-hover transition-all flex items-center justify-center gap-3 select-none disabled:opacity-70"
                >
                  {isRegistering ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Đang xác thực…</span>
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-fingerprint" />
                      <span>Bật Passkey</span>
                    </>
                  )}
                </button>

                {!isRegistering && (
                  <>
                    <button
                      type="button"
                      onClick={handleSkip}
                      className="w-full py-3 rounded-2xl border-2 border-slate-200 dark:border-slate-700 text-slate-500 font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors select-none"
                    >
                      Để sau
                    </button>
                    <button
                      type="button"
                      onClick={handleSkipPermanently}
                      className="w-full text-[10px] text-slate-400 hover:text-slate-500 font-semibold transition-colors select-none py-1"
                    >
                      Không nhắc lại trên thiết bị này
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="mt-8 border-t border-slate-200 dark:border-slate-800 pt-6">
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center hover:opacity-80 transition-opacity">
              © 2026 Gia Phat Group Consumer · Powered by Huynh Dat Thanh
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
