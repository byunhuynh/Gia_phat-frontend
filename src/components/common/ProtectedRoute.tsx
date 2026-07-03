import React from "react";
import { Navigate } from "react-router-dom";
import { User } from "../../types";

interface ProtectedRouteProps {
  user: User | null;
  allowedRoles: string[];
  children: React.ReactNode;
}

// ==========================================
// Component kiểm tra quyền truy cập theo role
// Nếu không đủ quyền => tự động redirect về trang chủ
// ==========================================
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  user,
  allowedRoles,
  children,
}) => {
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
