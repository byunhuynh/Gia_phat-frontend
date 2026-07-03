import React from "react";
import { createPortal } from "react-dom";

interface UserMenuPortalProps {
  anchorRect: DOMRect;
  onClose: () => void;
  onEditProfile: () => void;
  onManagePasskeys: () => void;
  onLogout: () => void;
}

const UserMenuPortal: React.FC<UserMenuPortalProps> = ({
  anchorRect,
  onClose,
  onEditProfile,
  onManagePasskeys,
  onLogout,
}) => {
  const modalRoot = document.getElementById("modal-root");
  if (!modalRoot) return null;

  const menuWidth = 190;
  const menuHeight = 155;

  let left = anchorRect.right - menuWidth;
  if (left < 10) left = 10;
  if (left + menuWidth > window.innerWidth - 10)
    left = window.innerWidth - menuWidth - 10;

  const spaceBelow = window.innerHeight - anchorRect.bottom;
  let top = anchorRect.bottom + 6;
  if (spaceBelow < menuHeight) {
    top = anchorRect.top - menuHeight - 6;
  }

  const menuStyle: React.CSSProperties = {
    position: "fixed",
    top,
    left,
    width: menuWidth,
    zIndex: 10000,
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999]" onClick={onClose}>
      <div
        style={menuStyle}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-100 dark:border-slate-700 overflow-hidden animate-fade-in"
      >
        <div className="p-1.5 space-y-1">
          {/* ===============================
              Nút Sửa hồ sơ
          =============================== */}
          <button
            onClick={() => {
              onEditProfile();
              onClose();
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg transition-colors"
          >
            <i className="fa-solid fa-user-pen text-nm w-4"></i>
            Sửa hồ sơ
          </button>

          {/* ===============================
              Nút Passkey
          =============================== */}
          <button
            onClick={() => {
              onManagePasskeys();
              onClose();
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg transition-colors"
          >
            <i className="fa-solid fa-fingerprint text-nm w-4"></i>
            Passkey
          </button>

          <div className="h-px bg-slate-100 dark:bg-slate-700 my-1"></div>

          {/* ===============================
              Nút Đăng xuất
          =============================== */}
          <button
            onClick={() => {
              onLogout();
              onClose();
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-[11px] font-black text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
          >
            <i className="fa-solid fa-power-off w-4"></i>
            Đăng xuất
          </button>
        </div>
      </div>
    </div>,
    modalRoot,
  );
};

export default UserMenuPortal;
