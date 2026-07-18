export const API_BASE = "https://api.giaphat.io.vn";

import type { Role } from "../types";
export type { Role };

export const ROLE_HIERARCHY: Record<Role, number> = {
  admin: 0,
  director: 1,
  regional_director: 2,
  supervisor: 3,
  sales: 4,
  accountant: 5,
};

export const ROLE_LABELS: Record<string, string> = {
  accountant: "Kế toán",
  sales: "Nhân viên thị trường",
  supervisor: "Giám sát kinh doanh",
  regional_director: "Giám đốc khu vực",
  director: "Giám đốc kinh doanh",
  admin: "Quản trị hệ thống",
};

export const ROLE_COLORS: Record<string, string> = {
  accountant:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  admin: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  director:
    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  regional_director:
    "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  supervisor:
    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  sales:
    "bg-gold-100 text-gold-700 dark:bg-gold-900/30 dark:text-gold-400",
};

export const LOGO_URL = "/logo.png";
