import React, { useState, useEffect } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { User } from "../../types";
import { ROLE_LABELS, ROLE_COLORS, LOGO_URL } from "../../constants";
import NotificationSidebar from "../common/NotificationSidebar";
import UserMenuPortal from "../common/UserMenuPortal";
import ChangePasswordModal from "../common/ChangePasswordModal";
import PasskeyModal from "../common/PasskeyModal";

interface LayoutProps {
  user: User | null;
  onLogout: () => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
}

const DashboardLayout: React.FC<LayoutProps> = ({
  user,
  onLogout,
  isDarkMode,
  toggleTheme,
}) => {
  const [isSidebarOpen, setSidebarOpen] = useState(window.innerWidth > 1024);
  const [isRightSidebarOpen, setRightSidebarOpen] = useState(
    window.innerWidth > 1440,
  );
  const [userMenuAnchor, setUserMenuAnchor] = useState<DOMRect | null>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isPasskeyOpen, setIsPasskeyOpen] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 1024) {
        setSidebarOpen(false);
      }
      if (window.innerWidth <= 1440) {
        setRightSidebarOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const menuItems = [
    { path: "/", label: "Bảng điều khiển", icon: "fa-chart-pie" },
    { path: "/routes", label: "Tuyến & Điểm bán", icon: "fa-map-location-dot" },
    { path: "/orders", label: "Lên đơn hàng", icon: "fa-cart-plus" },
    {
      path: "/reports",
      label: "Báo cáo doanh số",
      icon: "fa-file-invoice-dollar",
    },
    {
      path: "/products",
      label: "Sản phẩm",
      icon: "fa-boxes-stacked",
      roles: ["admin"],
    },
    { path: "/staff", label: "Đội ngũ Sales", icon: "fa-users-gear" },
    {
      path: "/admin",
      label: "Quản trị hệ thống",
      icon: "fa-shield-halved",
      roles: ["admin"],
    },
  ];

  const handleNavItemClick = () => {
    if (window.innerWidth <= 1024) {
      setSidebarOpen(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      {/* Overlay cho Left Sidebar */}
      {isSidebarOpen && window.innerWidth <= 1024 && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[45] animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Overlay cho Right Sidebar */}
      {isRightSidebarOpen && window.innerWidth <= 1440 && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-[35] animate-fade-in"
          onClick={() => setRightSidebarOpen(false)}
        />
      )}

      {/* LEFT SIDEBAR */}
      <aside
        className={`fixed lg:relative inset-y-0 left-0 z-50 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 sidebar-transition transform flex flex-col shadow-2xl lg:shadow-none select-none ${
          isSidebarOpen ? "w-72 translate-x-0" : "w-0 -translate-x-full lg:w-0"
        }`}
      >
        <div
          className={`h-24 flex items-center justify-center border-b border-slate-100 dark:border-slate-800 px-6 overflow-hidden ${!isSidebarOpen && "opacity-0 invisible"}`}
        >
          <img src={LOGO_URL} alt="Gia Phát Group" className="max-h-16" />
        </div>

        <nav
          className={`flex-1 overflow-y-auto py-6 px-4 overflow-hidden ${!isSidebarOpen && "opacity-0 invisible"}`}
        >
          <div className="flex flex-col gap-2">
            {menuItems
              .filter((item) => {
                // ==========================================
                // Kiểm tra role trước khi hiển thị menu
                // Nếu item không có roles => hiển thị cho tất cả
                // ==========================================
                if (!item.roles) return true;
                return item.roles.includes(user?.role || "");
              })
              .map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={handleNavItemClick}
                  className={`flex items-center gap-4 px-4 py-3.5 rounded-xl font-bold transition-all duration-200 whitespace-nowrap ${
                    location.pathname === item.path
                      ? "bg-nm text-white shadow-lg shadow-nm/30"
                      : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  <i
                    className={`fa-solid ${item.icon} text-lg w-6 text-center`}
                  ></i>
                  <span>{item.label}</span>
                </Link>
              ))}
          </div>
        </nav>

        <div
          className={`p-4 border-t border-slate-100 dark:border-slate-800 overflow-hidden ${!isSidebarOpen && "opacity-0 invisible"}`}
        >
          <button
            onClick={onLogout}
            className="flex items-center justify-center gap-3 w-full py-3 rounded-xl border-2 border-rose-100 dark:border-rose-900/30 text-rose-600 font-bold hover:bg-rose-50 dark:hover:bg-rose-900/10 transition-colors"
          >
            <i className="fa-solid fa-power-off"></i>
            <span>Đăng xuất</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="h-20 flex items-center justify-between px-6 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 z-30 select-none">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!isSidebarOpen)}
              className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-nm hover:scale-105 active:scale-95 transition-all shadow-sm"
              title={isSidebarOpen ? "Đóng Menu" : "Mở Menu"}
            >
              <i
                className={`fa-solid ${isSidebarOpen ? "fa-bars-staggered" : "fa-bars"} text-xl`}
              ></i>
            </button>
            <h2 className="hidden md:block font-black uppercase text-slate-400 text-xs tracking-widest">
              Sạch - Thơm - Lành
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="p-2.5 rounded-full bg-slate-100 dark:bg-slate-800 text-nm hover:rotate-12 transition-all"
            >
              <i
                className={`fa-solid ${isDarkMode ? "fa-sun" : "fa-moon"} text-xl`}
              ></i>
            </button>

            <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 mx-2 hidden sm:block"></div>

            <button
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                setRightSidebarOpen(!isRightSidebarOpen);
              }}
              className={`p-2.5 rounded-xl transition-all relative ${isRightSidebarOpen ? "bg-nm text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}`}
            >
              <i className="fa-solid fa-bell text-xl"></i>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center border-2 border-white dark:border-slate-900">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>

            <div
              onClick={(e: React.MouseEvent) => {
                const rect = (
                  e.currentTarget as HTMLElement
                ).getBoundingClientRect();
                setUserMenuAnchor(rect);
                setIsUserMenuOpen(true);
              }}
              className="flex items-center gap-3 ml-2 group cursor-pointer"
            >
              <div className="text-right hidden sm:block">
                <p className="text-sm font-bold truncate max-w-[120px]">
                  {user?.fullName}
                </p>
                <span
                  className={`text-[9px] uppercase font-black px-2 py-0.5 rounded-full ${ROLE_COLORS[user?.role || "sales"]}`}
                >
                  {ROLE_LABELS[user?.role || "sales"]}
                </span>
              </div>
              <img
                src={user?.avatar}
                className="w-10 h-10 rounded-xl border-2 border-nm p-0.5 shadow-sm group-hover:scale-110 transition-transform"
              />
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 scroll-smooth bg-slate-50 dark:bg-slate-950/50">
          <div className="max-w-[1600px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
      <NotificationSidebar
        isOpen={isRightSidebarOpen}
        onClose={() => setRightSidebarOpen(false)}
        onUnreadCountChange={setUnreadCount}
        onOpenChangePassword={() => setIsChangePasswordOpen(true)}
      />
      {isChangePasswordOpen && (
        <ChangePasswordModal onClose={() => setIsChangePasswordOpen(false)} />
      )}
      {isPasskeyOpen && (
        <PasskeyModal onClose={() => setIsPasskeyOpen(false)} />
      )}
      {isUserMenuOpen && userMenuAnchor && (
        <UserMenuPortal
          anchorRect={userMenuAnchor}
          onClose={() => setIsUserMenuOpen(false)}
          onEditProfile={() => {
            navigate("/staff", { state: { editSelf: true } });
          }}
          onManagePasskeys={() => setIsPasskeyOpen(true)}
          onLogout={onLogout}
        />
      )}
    </div>
  );
};

export default DashboardLayout;
