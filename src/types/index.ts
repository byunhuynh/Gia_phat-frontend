export type Role =
  | "sales"
  | "supervisor"
  | "regional_director"
  | "director"
  | "admin";

export interface User {
  id: number | string;
  username: string;
  fullName: string;
  role: Role;
  phone?: string;
  email?: string;
  avatar?: string;
  status?: "active" | "inactive";
  // Added manager_id to track organizational hierarchy as used in UsersPage
  manager_id?: number | string;
  manager_name?: string;
  province?: string;
  district?: string;
}

export interface RouteItem {
  id: number;
  code: string;
  name: string;
  province_name: string;
  vehicle_plate?: string | null;
  staff_id: number;
  staffFullName?: string; // New field for assigned staff's full name
  store_count?: number;
}

export interface StoreItem {
  id: number;
  code: string;
  name: string;
  address: string;
  phone?: string;
  lat?: number;
  lng?: number;
}

export interface CheckInRecord {
  id: number;
  store_id: number;
  user_id: number;
  checkin_time: string; // ISO string format
  staffFullName: string; // Name of the user who checked in
  photo_url?: string;
}

export interface GlobalCheckInRecord extends CheckInRecord {
  storeName: string;
  storeCode: string;
  routeName: string;
}

export interface Product {
  id: number;
  name: string;
  price: number;
  sku?: string;
  image_url?: string;
}

export interface ProductCategory {
  id: number;
  name: string;
  description?: string;
  products: Product[];
}

export interface SalesReport {
  product_name: string;
  product_image?: string;
  category: string;
  qty: number;
  amount: number;
  is_promo?: boolean;
  date: string;
  sold_by: string;
  order_code?: string;
  store_name?: string;
}

// ==================================================
// NOTIFICATION SYSTEM
// ==================================================
export type NotificationType =
  | "new_store"
  | "new_product"
  | "new_order"
  | "new_checkin"
  | "new_user"
  | "user_locked"
  | "user_unlocked"
  | "store_deleted"
  | "store_restored"
  | "store_coords_updated"
  | "order_deleted"
  | "order_restored"
  | "route_deleted"
  | "route_restored"
  | "first_login";

export interface AppNotification {
  id: number;
  type: NotificationType;
  title: string;
  message: string;
  entity_type?: "route" | "store" | "product" | "order" | "user" | null;
  entity_id?: number | null;
  is_read: boolean;
  actor_name?: string | null;
  created_at: string;
}

export interface NotificationsResponse {
  data: AppNotification[];
  total: number;
  unread_count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export type ToastType = "success" | "danger" | "warning" | "info";

// 🔥 Interface Toast nâng cấp hỗ trợ action
// Chức năng: cho phép hiển thị nút hành động (ví dụ: Hoàn tác)
export interface Toast {
  id: number;
  message: string;
  type: ToastType;
  actionLabel?: string;
  onAction?: () => void;
}

export interface SpaService {
  id: number;
  name: string;
  price: number;
  duration: number;
  description: string;
}

export interface ServiceCategory {
  id: number;
  name: string;
  services: SpaService[];
}

export interface Appointment {
  id: number;
  customerName: string;
  serviceName: string;
  therapistName: string;
  startTime: string;
  status: "pending" | "confirmed" | "completed" | "cancelled";
  price: number;
  province_name?: string; // Added for location filtering
}
