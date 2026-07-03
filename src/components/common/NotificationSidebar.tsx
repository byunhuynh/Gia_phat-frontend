import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { AppNotification, NotificationsResponse } from "../../types";
import { API_BASE } from "../../constants";

interface NotificationSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onUnreadCountChange?: (count: number) => void;
  onOpenChangePassword?: () => void;
}

function getNotifIcon(type: AppNotification["type"]): {
  icon: string;
  bg: string;
  text: string;
} {
  switch (type) {
    case "new_store":
      return { icon: "fa-store", bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-600 dark:text-emerald-400" };
    case "new_product":
      return { icon: "fa-boxes-stacked", bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-600 dark:text-blue-400" };
    case "new_order":
      return { icon: "fa-cart-plus", bg: "bg-nm/10", text: "text-nm" };
    case "new_checkin":
      return { icon: "fa-location-dot", bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-600 dark:text-purple-400" };
    case "new_user":
      return { icon: "fa-user-plus", bg: "bg-indigo-100 dark:bg-indigo-900/30", text: "text-indigo-600 dark:text-indigo-400" };
    case "user_locked":
      return { icon: "fa-lock", bg: "bg-rose-100 dark:bg-rose-900/30", text: "text-rose-600 dark:text-rose-400" };
    case "user_unlocked":
      return { icon: "fa-lock-open", bg: "bg-slate-100 dark:bg-slate-700", text: "text-slate-500 dark:text-slate-400" };
    case "first_login":
      return { icon: "fa-key", bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-600 dark:text-amber-400" };
    default:
      return { icon: "fa-bell", bg: "bg-slate-100 dark:bg-slate-700", text: "text-slate-500" };
  }
}

function timeAgo(isoStr: string): string {
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (diff < 60) return "Vừa xong";
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} ngày trước`;
  return new Date(isoStr).toLocaleDateString("vi-VN");
}

// ==================================================
// Sub-component: tin nhắn có thể mở rộng
// Dùng state riêng + ref đo overflow thực tế thay vì đếm ký tự
// ==================================================
function NotifMessage({ message }: { message: string }) {
  const [expanded, setExpanded] = useState<boolean>(false);
  const [overflows, setOverflows] = useState<boolean>(false);
  const pRef = useRef<HTMLParagraphElement>(null);

  // Đo sau khi DOM render với line-clamp-2: scrollHeight > clientHeight = bị cắt
  useEffect(() => {
    const el = pRef.current;
    if (!el) return;
    setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, []);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((v: boolean) => !v);
  };

  return (
    <div className="mt-0.5">
      <p
        ref={pRef}
        className={`text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed break-words ${
          expanded ? "whitespace-pre-line" : "line-clamp-2"
        }`}
      >
        {message}
      </p>
      {(overflows || expanded) && (
        <button
          type="button"
          onClick={toggle}
          className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold text-nm hover:text-nm/70 transition-colors"
        >
          <i className={`fa-solid fa-chevron-${expanded ? "up" : "down"} text-[8px]`}></i>
          {expanded ? "Thu gọn" : "Xem thêm"}
        </button>
      )}
    </div>
  );
}

// ==================================================
// Các loại thông báo có thể click để điều hướng
// ==================================================
const NAVIGABLE_TYPES: AppNotification["type"][] = ["new_route", "new_store"];
const CHANGE_PASSWORD_TYPES: AppNotification["type"][] = ["first_login"];

const NotificationSidebar: React.FC<NotificationSidebarProps> = ({
  isOpen,
  onClose,
  onUnreadCountChange,
  onOpenChangePassword,
}) => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");

  const fetchNotifications = useCallback(
    async (pageNum = 1, currentFilter = filter, append = false) => {
      if (!token) return;
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(pageNum),
          page_size: "20",
          ...(currentFilter === "unread" ? { unread_only: "true" } : {}),
        });
        const res = await fetch(`${API_BASE}/notifications?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data: NotificationsResponse = await res.json();
        setNotifications((prev: AppNotification[]) =>
          append ? [...prev, ...data.data] : data.data
        );
        setUnreadCount(data.unread_count);
        setTotalPages(data.total_pages);
        onUnreadCountChange?.(data.unread_count);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    },
    [token, filter, onUnreadCountChange]
  );

  useEffect(() => {
    fetchNotifications(1, filter, false);
    const interval = setInterval(() => fetchNotifications(1, filter, false), 30_000);
    return () => clearInterval(interval);
  }, [fetchNotifications, filter]);

  useEffect(() => {
    setPage(1);
    fetchNotifications(1, filter, false);
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const markRead = async (id: number) => {
    if (!token) return;
    try {
      await fetch(`${API_BASE}/notifications/${id}/read`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((prev: AppNotification[]) =>
        prev.map((n: AppNotification) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((c: number) => Math.max(0, c - 1));
      onUnreadCountChange?.(Math.max(0, unreadCount - 1));
    } catch {
      // ignore
    }
  };

  const markAllRead = async () => {
    if (!token) return;
    try {
      await fetch(`${API_BASE}/notifications/read-all`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((prev: AppNotification[]) =>
        prev.map((n: AppNotification) => ({ ...n, is_read: true }))
      );
      setUnreadCount(0);
      onUnreadCountChange?.(0);
    } catch {
      // ignore
    }
  };

  const deleteNotif = async (id: number) => {
    if (!token) return;
    try {
      await fetch(`${API_BASE}/notifications/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const deleted = notifications.find((n: AppNotification) => n.id === id);
      setNotifications((prev: AppNotification[]) =>
        prev.filter((n: AppNotification) => n.id !== id)
      );
      if (deleted && !deleted.is_read) {
        const newCount = Math.max(0, unreadCount - 1);
        setUnreadCount(newCount);
        onUnreadCountChange?.(newCount);
      }
    } catch {
      // ignore
    }
  };

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchNotifications(nextPage, filter, true);
  };

  const handleNotifClick = (notif: AppNotification) => {
    if (!notif.is_read) markRead(notif.id);
    if (
      NAVIGABLE_TYPES.includes(notif.type) &&
      notif.entity_type === "route" &&
      notif.entity_id
    ) {
      navigate("/routes", { state: { highlightRouteId: notif.entity_id } });
      onClose();
    } else if (CHANGE_PASSWORD_TYPES.includes(notif.type)) {
      onOpenChangePassword?.();
      onClose();
    }
  };

  return (
    <aside
      onClick={(e: React.MouseEvent) => e.stopPropagation()}
      className={`fixed lg:relative inset-y-0 right-0 z-40 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 sidebar-transition transform flex flex-col shadow-2xl lg:shadow-none select-none ${
        isOpen ? "w-80 translate-x-0" : "w-0 translate-x-full lg:w-0"
      }`}
    >
      {/* HEADER */}
      <div
        className={`h-20 flex items-center justify-between px-5 border-b border-slate-100 dark:border-slate-800 overflow-hidden shrink-0 ${
          !isOpen && "opacity-0 invisible"
        }`}
      >
        <div className="flex items-center gap-2.5">
          <h4 className="font-black uppercase tracking-widest text-sm text-slate-800 dark:text-white flex items-center gap-2">
            <i className="fa-solid fa-bolt-lightning text-nm"></i>
            Thông báo
          </h4>
          {unreadCount > 0 && (
            <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              title="Đánh dấu tất cả đã đọc"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-nm hover:bg-nm/10 transition-colors"
            >
              <i className="fa-solid fa-check-double text-sm"></i>
            </button>
          )}
          <button
            onClick={() => fetchNotifications(1, filter, false)}
            title="Làm mới"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-nm hover:bg-nm/10 transition-colors"
          >
            <i className={`fa-solid fa-rotate-right text-sm ${loading ? "animate-spin" : ""}`}></i>
          </button>
          <button
            onClick={onClose}
            className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-nm transition-colors"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>

      {/* FILTER TABS */}
      <div
        className={`flex gap-1 px-4 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0 overflow-hidden ${
          !isOpen && "opacity-0 invisible"
        }`}
      >
        {(["all", "unread"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filter === f
                ? "bg-nm text-white shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            {f === "all" ? "Tất cả" : "Chưa đọc"}
          </button>
        ))}
      </div>

      {/* NOTIFICATION LIST */}
      <div className={`flex-1 overflow-y-auto ${!isOpen && "opacity-0 invisible"}`}>
        {loading && notifications.length === 0 ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-700 shrink-0"></div>
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-3/4"></div>
                  <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-full"></div>
                  <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded w-1/3"></div>
                </div>
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
              <i className="fa-regular fa-bell text-2xl text-slate-400"></i>
            </div>
            <p className="font-bold text-slate-600 dark:text-slate-300 text-sm">
              {filter === "unread" ? "Không có thông báo mới" : "Chưa có thông báo"}
            </p>
            <p className="text-xs text-slate-400 mt-1">Các hoạt động sẽ hiển thị ở đây</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {notifications.map((notif: AppNotification) => {
              const style = getNotifIcon(notif.type);
              const isNavigable = NAVIGABLE_TYPES.includes(notif.type);
              const isChangePw = CHANGE_PASSWORD_TYPES.includes(notif.type);
              const isClickable = isNavigable || isChangePw;
              return (
                <div
                  key={notif.id}
                  className={`group relative flex gap-3 px-4 py-3.5 transition-colors ${
                    !notif.is_read
                      ? "bg-nm/[0.03] dark:bg-nm/5 hover:bg-nm/[0.06] dark:hover:bg-nm/10"
                      : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  } ${isClickable ? "cursor-pointer" : ""}`}
                  onClick={() => {
                    if (isClickable) handleNotifClick(notif);
                    else if (!notif.is_read) markRead(notif.id);
                  }}
                >
                  {/* Thanh chỉ báo chưa đọc bên trái */}
                  {!notif.is_read && (
                    <div className="absolute left-0 top-3 bottom-3 w-0.5 rounded-r-full bg-nm" />
                  )}

                  {/* Icon */}
                  <div
                    className={`w-10 h-10 rounded-xl ${style.bg} flex items-center justify-center shrink-0 mt-0.5`}
                  >
                    <i className={`fa-solid ${style.icon} text-sm ${style.text}`}></i>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <p
                        className={`text-xs leading-snug ${
                          !notif.is_read
                            ? "font-bold text-slate-800 dark:text-white"
                            : "font-medium text-slate-600 dark:text-slate-300"
                        }`}
                      >
                        {notif.title}
                      </p>
                      {!notif.is_read && (
                        <span className="w-2 h-2 rounded-full bg-nm shrink-0 mt-1" />
                      )}
                    </div>

                    {/* Tin nhắn có thể mở rộng — state nằm trong sub-component */}
                    <NotifMessage message={notif.message} />

                    <div className="flex items-center justify-between mt-1">
                      <p className="text-[10px] text-slate-400 dark:text-slate-500">
                        {timeAgo(notif.created_at)}
                      </p>
                      {isNavigable && (
                        <span className="text-[10px] text-nm/60 font-medium flex items-center gap-0.5">
                          Xem chi tiết
                          <i className="fa-solid fa-arrow-right text-[8px]"></i>
                        </span>
                      )}
                      {isChangePw && (
                        <span className="text-[10px] text-amber-500/80 font-medium flex items-center gap-0.5">
                          Đổi mật khẩu ngay
                          <i className="fa-solid fa-arrow-right text-[8px]"></i>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Nút xóa (hiện khi hover) */}
                  <button
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      deleteNotif(notif.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-md text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all"
                    title="Xóa thông báo"
                  >
                    <i className="fa-solid fa-xmark text-[10px]"></i>
                  </button>
                </div>
              );
            })}

            {page < totalPages && (
              <div className="p-4">
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="w-full py-2 rounded-xl text-xs font-bold text-nm border-2 border-nm/20 hover:bg-nm/10 transition-colors disabled:opacity-50"
                >
                  {loading && <i className="fa-solid fa-spinner fa-spin mr-1"></i>}
                  Xem thêm
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};

export default NotificationSidebar;
