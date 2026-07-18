import React, { useState, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { createPortal } from "react-dom";

import { ToastProvider, useToast } from "./contexts/ToastContext";
import { AuthProvider } from "./contexts/AuthContext";
import { useAuth } from "./hooks/useAuth";

import LoginPage from "./pages/Login";
import DashboardLayout from "./components/layout/Layout";
import HomePage from "./pages/Home";
import UsersPage from "./pages/Users";
import RoutesStoresPage from "./pages/RoutesStores";
import OrderCreatePage from "./pages/OrderCreate";
import ReportsPage from "./pages/Reports";
import ProductManagement from "./pages/ProductManagement";
import VehicleManagement from "./pages/VehicleManagement";
import OrderList from "./pages/OrderList";
import AdminPanel from "./pages/AdminPanel";
import ProtectedRoute from "./components/common/ProtectedRoute";
import InstallPromptBanner from "./components/common/InstallPromptBanner";

// ─── Toast Renderer ───────────────────────────────────────────────────────────
const ToastRenderer: React.FC = () => {
  const { toasts, removeToast } = useToast();
  const modalRoot = document.getElementById("modal-root");
  if (!modalRoot) return null;

  const iconMap: Record<string, string> = {
    success: "fa-circle-check",
    danger: "fa-circle-xmark",
    warning: "fa-triangle-exclamation",
    info: "fa-circle-info",
  };

  const colorMap: Record<string, string> = {
    success: "bg-emerald-600 border-emerald-400",
    danger: "bg-rose-600 border-rose-400",
    warning: "bg-amber-600 border-amber-400",
    info: "bg-blue-600 border-blue-400",
  };

  return createPortal(
    <div className="fixed top-4 right-4 z-[10001] flex flex-col gap-2 pointer-events-none select-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-center gap-3 p-4 rounded-xl shadow-2xl border-l-4 text-white animate-fade-in ${colorMap[toast.type] ?? colorMap.info}`}
        >
          <i className={`fa-solid ${iconMap[toast.type] ?? iconMap.info}`} />
          <span className="font-semibold flex-1">{toast.message}</span>

          {toast.actionLabel && toast.onAction && (
            <button
              onClick={() => {
                toast.onAction?.();
                removeToast(toast.id);
              }}
              className="underline font-bold hover:opacity-80"
            >
              {toast.actionLabel}
            </button>
          )}

          <button
            onClick={() => removeToast(toast.id)}
            className="ml-2 hover:opacity-75"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
      ))}
    </div>,
    modalRoot,
  );
};

// ─── Inner App (needs contexts in scope) ─────────────────────────────────────
const AppInner: React.FC = () => {
  const { user, loading, setUser, fetchProfile, handleLogout } = useAuth();
  const { showToast } = useToast();

  const [isDarkMode, setIsDarkMode] = useState(
    localStorage.getItem("theme") === "dark",
  );

  const toggleTheme = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    localStorage.setItem("theme", next ? "dark" : "light");
    document.documentElement.classList.toggle("dark", next);
  };

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);
    const token = localStorage.getItem("access_token");
    if (token) fetchProfile();
    else {
      // mark loading done (handled inside fetchProfile otherwise)
      void fetchProfile();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onLogout = () => {
    handleLogout();
    showToast("Đã đăng xuất khỏi hệ thống", "info");
  };

  // Wire forceLogout toast — AuthContext already clears tokens/user before calling this
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__forceLogout = () => {
      showToast("Tài khoản đã đăng nhập ở thiết bị khác", "danger");
    };
  }, [showToast]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-50 dark:bg-slate-900 select-none">
        <div className="w-16 h-16 border-4 border-nm border-t-transparent rounded-full animate-spin mb-4" />
        <h5 className="text-nm font-lobster text-2xl">Gia Phát Group</h5>
        <p className="text-slate-500 text-sm mt-2 font-bold uppercase tracking-widest">
          Đang tải dữ liệu...
        </p>
      </div>
    );
  }

  return (
    <>
      <Routes>
        <Route
          path="/login"
          element={
            user ? (
              <Navigate to="/" replace />
            ) : (
              <LoginPage
                onLoginSuccess={setUser}
                isDarkMode={isDarkMode}
                toggleTheme={toggleTheme}
              />
            )
          }
        />

        <Route
          element={
            user ? (
              <DashboardLayout
                user={user}
                onLogout={onLogout}
                isDarkMode={isDarkMode}
                toggleTheme={toggleTheme}
              />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        >
          <Route path="/" element={<HomePage />} />
          <Route path="/routes" element={<RoutesStoresPage currentUser={user!} />} />
          <Route path="/orders" element={<OrderCreatePage />} />
          <Route
            path="/order-list"
            element={
              <ProtectedRoute user={user} allowedRoles={["admin", "accountant"]}>
                <OrderList />
              </ProtectedRoute>
            }
          />
          <Route path="/reports" element={<ReportsPage currentUser={user!} />} />
          <Route
            path="/staff"
            element={<UsersPage currentUser={user!} isDarkMode={isDarkMode} />}
          />
          <Route
            path="/products"
            element={
              <ProtectedRoute user={user} allowedRoles={["admin"]}>
                <ProductManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/vehicles"
            element={
              <ProtectedRoute user={user} allowedRoles={["admin"]}>
                <VehicleManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute user={user} allowedRoles={["admin"]}>
                <AdminPanel currentUser={user} />
              </ProtectedRoute>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <ToastRenderer />
      <InstallPromptBanner />
    </>
  );
};

// ─── Root App with Providers ──────────────────────────────────────────────────
const App: React.FC = () => {
  const handleForceLogout = () => {
    const fn = (window as unknown as Record<string, unknown>).__forceLogout;
    if (typeof fn === "function") fn();
  };

  return (
    <ToastProvider>
      <AuthProvider onForceLogout={handleForceLogout}>
        <AppInner />
      </AuthProvider>
    </ToastProvider>
  );
};

export default App;
