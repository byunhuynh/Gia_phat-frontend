import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { API_BASE } from "../../constants";
import { useToast } from "../../hooks/useToast";

// ─── WebAuthn helpers ────────────────────────────────────────────────────────
function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64urlToBuffer(b64: string): ArrayBuffer {
  const base64 = b64.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf.buffer;
}
// ─────────────────────────────────────────────────────────────────────────────

interface Passkey {
  id: number;
  device_name: string;
  created_at: string | null;
  last_used_at: string | null;
}

interface Props {
  onClose: () => void;
}

const PasskeyModal: React.FC<Props> = ({ onClose }) => {
  const { showToast } = useToast();
  const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");

  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deviceName, setDeviceName] = useState("");
  const [showRegisterForm, setShowRegisterForm] = useState(false);

  const isSupported =
    typeof window !== "undefined" &&
    !!window.PublicKeyCredential &&
    typeof navigator.credentials?.create === "function";

  const fetchPasskeys = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch(`${API_BASE}/webauthn/credentials`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setPasskeys(await res.json());
    } catch {
      showToast("Không thể tải danh sách passkey", "danger");
    } finally {
      setLoadingList(false);
    }
  }, [token]);

  useEffect(() => { fetchPasskeys(); }, [fetchPasskeys]);

  const handleRegister = async () => {
    if (!isSupported) {
      showToast("Thiết bị không hỗ trợ Passkey", "warning");
      return;
    }
    setRegistering(true);
    try {
      // 1. Lấy registration options từ server
      const beginRes = await fetch(`${API_BASE}/webauthn/register/begin`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      if (!beginRes.ok) {
        showToast("Không thể bắt đầu đăng ký passkey", "danger");
        return;
      }
      const options = await beginRes.json();
      const { session_token, ...pubKeyRaw } = options;

      // 2. Chuyển đổi base64url → ArrayBuffer
      const publicKey: PublicKeyCredentialCreationOptions = {
        ...pubKeyRaw,
        challenge: base64urlToBuffer(pubKeyRaw.challenge),
        user: {
          ...pubKeyRaw.user,
          id: base64urlToBuffer(pubKeyRaw.user.id),
        },
        excludeCredentials: pubKeyRaw.excludeCredentials?.map(
          (c: { id: string; type: string; transports?: AuthenticatorTransport[] }) => ({
            ...c,
            id: base64urlToBuffer(c.id),
          })
        ),
      };

      // 3. Yêu cầu tạo credential từ thiết bị
      const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
      if (!credential) {
        showToast("Đăng ký bị hủy", "warning");
        return;
      }

      const resp = credential.response as AuthenticatorAttestationResponse;

      // 4. Gửi kết quả lên server
      const completeRes = await fetch(`${API_BASE}/webauthn/register/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
      });

      if (completeRes.ok) {
        showToast("Đăng ký passkey thành công!", "success");
        setShowRegisterForm(false);
        setDeviceName("");
        fetchPasskeys();
      } else {
        const err = await completeRes.json().catch(() => ({}));
        showToast(err.message || "Đăng ký thất bại", "danger");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        showToast("Đăng ký bị hủy bởi người dùng", "warning");
      } else {
        showToast("Lỗi khi đăng ký passkey", "danger");
      }
    } finally {
      setRegistering(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      const res = await fetch(`${API_BASE}/webauthn/credentials/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setPasskeys((prev) => prev.filter((p) => p.id !== id));
        showToast("Đã xóa passkey", "success");
      } else {
        showToast("Xóa thất bại", "danger");
      }
    } catch {
      showToast("Lỗi kết nối", "danger");
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
  };

  const modalRoot = document.getElementById("modal-root");
  if (!modalRoot) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-md p-0 sm:p-4 select-none">
      <div className="fixed inset-0 cursor-pointer" onClick={onClose} />
      <div className="relative z-10 w-full sm:max-w-md bg-white dark:bg-slate-800 rounded-t-[2rem] sm:rounded-[2.5rem] shadow-2xl overflow-hidden animate-sheet-up sm:animate-fade-in border border-white/20 dark:border-slate-700">

        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-nm-100 dark:bg-nm-900/30 flex items-center justify-center">
              <i className="fa-solid fa-fingerprint text-nm text-sm"></i>
            </div>
            <div>
              <h3 className="font-black text-sm text-slate-800 dark:text-white">Quản lý Passkey</h3>
              <p className="text-xs text-slate-400">Vân tay · Face ID · Mã PIN thiết bị</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Danh sách passkeys */}
          {loadingList ? (
            <div className="flex justify-center py-6">
              <div className="w-6 h-6 border-2 border-nm border-t-transparent rounded-full animate-spin" />
            </div>
          ) : passkeys.length === 0 ? (
            <div className="text-center py-6 space-y-2">
              <i className="fa-solid fa-fingerprint text-4xl text-slate-200 dark:text-slate-700"></i>
              <p className="text-xs text-slate-400 font-semibold">Chưa có passkey nào được đăng ký</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Passkeys đã đăng ký ({passkeys.length})
              </p>
              {passkeys.map((pk) => (
                <div
                  key={pk.id}
                  className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700"
                >
                  <div className="w-9 h-9 rounded-xl bg-nm-100 dark:bg-nm-900/30 flex items-center justify-center flex-shrink-0">
                    <i className="fa-solid fa-fingerprint text-nm text-sm"></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-slate-700 dark:text-slate-200 truncate">{pk.device_name}</p>
                    <p className="text-[10px] text-slate-400">
                      Tạo: {formatDate(pk.created_at)}
                      {pk.last_used_at && (
                        <span className="ml-2">· Dùng: {formatDate(pk.last_used_at)}</span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(pk.id)}
                    disabled={deletingId === pk.id}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors disabled:opacity-50"
                  >
                    {deletingId === pk.id
                      ? <div className="w-3.5 h-3.5 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
                      : <i className="fa-solid fa-trash-can text-xs"></i>
                    }
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Form đăng ký mới */}
          {isSupported && (
            <>
              {showRegisterForm ? (
                <div className="space-y-3 pt-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Đặt tên cho passkey mới
                  </p>
                  <input
                    type="text"
                    autoFocus
                    value={deviceName}
                    onChange={(e) => setDeviceName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleRegister()}
                    placeholder="VD: iPhone 15, MacBook Pro..."
                    maxLength={100}
                    className="w-full px-4 py-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border-2 border-transparent focus:border-nm outline-none font-bold text-sm transition-all"
                  />
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => { setShowRegisterForm(false); setDeviceName(""); }}
                      className="flex-1 py-3 rounded-2xl border-2 border-slate-200 dark:border-slate-700 text-slate-500 font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      onClick={handleRegister}
                      disabled={registering}
                      className="flex-1 py-3 rounded-2xl bg-nm text-white font-bold text-sm hover:bg-nm-hover transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {registering
                        ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /><span>Đang tạo…</span></>
                        : <><i className="fa-solid fa-fingerprint" /><span>Xác thực ngay</span></>
                      }
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowRegisterForm(true)}
                  className="w-full py-3.5 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-bold text-sm hover:border-nm hover:text-nm transition-all flex items-center justify-center gap-2"
                >
                  <i className="fa-solid fa-plus"></i>
                  Thêm passkey mới
                </button>
              )}
            </>
          )}

          {!isSupported && (
            <div className="text-center py-2">
              <p className="text-xs text-slate-400">Trình duyệt này không hỗ trợ Passkey</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    modalRoot,
  );
};

export default PasskeyModal;
