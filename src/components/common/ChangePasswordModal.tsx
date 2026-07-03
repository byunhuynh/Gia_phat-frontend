import React, { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { API_BASE } from "../../constants";
import { useToast } from "../../hooks/useToast";

const calcStrength = (pw: string) => {
  if (!pw) return { score: 0, label: "", color: "" };
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[a-z]/.test(pw)) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const levels = [
    { label: "Rất yếu", color: "bg-rose-500" },
    { label: "Yếu", color: "bg-orange-500" },
    { label: "Trung bình", color: "bg-amber-500" },
    { label: "Mạnh", color: "bg-emerald-500" },
    { label: "Rất mạnh", color: "bg-green-600" },
  ];
  return { score: s, ...levels[s - 1] };
};

interface Props {
  onClose: () => void;
}

const ChangePasswordModal: React.FC<Props> = ({ onClose }) => {
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const strength = useMemo(() => calcStrength(newPw), [newPw]);
  const mismatch = confirmPw.length > 0 && confirmPw !== newPw;

  const token =
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access_token");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) {
      showToast("Mật khẩu xác nhận không khớp", "warning");
      return;
    }
    setLoading(true);
    try {
      const meRes = await fetch(`${API_BASE}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!meRes.ok) throw new Error();
      const me = await meRes.json();

      const res = await fetch(`${API_BASE}/users/${me.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ old_password: oldPw, password: newPw }),
      });

      if (res.ok) {
        showToast("Đổi mật khẩu thành công!", "success");
        onClose();
      } else {
        const err = await res.json();
        if (err.message === "OLD_PASSWORD_INCORRECT") {
          showToast("Mật khẩu hiện tại không đúng", "danger");
        } else if (err.message === "WEAK_PASSWORD") {
          showToast(
            "Mật khẩu quá yếu. Cần 8+ ký tự, chữ hoa, số, ký tự đặc biệt",
            "warning",
          );
        } else {
          showToast("Đổi mật khẩu thất bại", "danger");
        }
      }
    } catch {
      showToast("Lỗi kết nối", "danger");
    } finally {
      setLoading(false);
    }
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
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <i className="fa-solid fa-key text-amber-600 dark:text-amber-400 text-sm"></i>
            </div>
            <div>
              <h3 className="font-black text-sm text-slate-800 dark:text-white">
                Đổi mật khẩu
              </h3>
              <p className="text-xs text-slate-400">Bảo mật tài khoản của bạn</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Mật khẩu hiện tại */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Mật khẩu hiện tại
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300">
                <i className="fa-solid fa-lock-open text-sm"></i>
              </span>
              <input
                type={showOld ? "text" : "password"}
                value={oldPw}
                onChange={(e) => setOldPw(e.target.value)}
                required
                autoFocus
                className="w-full pl-11 pr-12 py-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border-2 border-transparent focus:border-nm focus:bg-white dark:focus:bg-slate-800 font-bold outline-none text-sm transition-all"
                placeholder="Nhập mật khẩu hiện tại"
              />
              <button
                type="button"
                onClick={() => setShowOld((v) => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-nm"
              >
                <i className={`fa-solid ${showOld ? "fa-eye-slash" : "fa-eye"} text-sm`}></i>
              </button>
            </div>
          </div>

          {/* Mật khẩu mới */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Mật khẩu mới
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300">
                <i className="fa-solid fa-key text-sm"></i>
              </span>
              <input
                type={showNew ? "text" : "password"}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                required
                className="w-full pl-11 pr-12 py-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border-2 border-transparent focus:border-nm focus:bg-white dark:focus:bg-slate-800 font-bold outline-none text-sm transition-all"
                placeholder="Tối thiểu 8 ký tự"
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-nm"
              >
                <i
                  className={`fa-solid ${showNew ? "fa-eye-slash" : "fa-eye"} text-sm`}
                ></i>
              </button>
            </div>
            {newPw && (
              <div className="space-y-1 pt-0.5">
                <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${strength.color}`}
                    style={{ width: `${(strength.score / 5) * 100}%` }}
                  />
                </div>
                <p
                  className={`text-[10px] font-bold ${
                    strength.score >= 4
                      ? "text-emerald-500"
                      : strength.score >= 3
                        ? "text-amber-500"
                        : "text-rose-500"
                  }`}
                >
                  Độ mạnh: {strength.label}
                </p>
              </div>
            )}
          </div>

          {/* Xác nhận mật khẩu */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Xác nhận mật khẩu mới
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300">
                <i className="fa-solid fa-shield-halved text-sm"></i>
              </span>
              <input
                type={showConfirm ? "text" : "password"}
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                required
                className={`w-full pl-11 pr-12 py-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border-2 font-bold outline-none text-sm transition-all ${
                  mismatch
                    ? "border-rose-400 focus:border-rose-500"
                    : "border-transparent focus:border-nm focus:bg-white dark:focus:bg-slate-800"
                }`}
                placeholder="Nhập lại mật khẩu mới"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-nm"
              >
                <i className={`fa-solid ${showConfirm ? "fa-eye-slash" : "fa-eye"} text-sm`}></i>
              </button>
            </div>
            {mismatch && (
              <p className="text-[10px] text-rose-500 font-semibold">
                Mật khẩu không khớp
              </p>
            )}
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3.5 rounded-2xl border-2 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={loading || mismatch}
              className="flex-1 py-3.5 rounded-2xl bg-nm text-white font-bold text-sm hover:bg-nm-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading && (
                <i className="fa-solid fa-spinner fa-spin text-sm"></i>
              )}
              Xác nhận
            </button>
          </div>
        </form>
      </div>
    </div>,
    modalRoot,
  );
};

export default ChangePasswordModal;
