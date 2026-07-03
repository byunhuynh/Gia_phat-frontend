import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetchWithRefresh } from "../services/api";
import { useToast } from "../hooks/useToast";
import { User, RouteItem, StoreItem } from "../types";
import { API_BASE } from "../constants";
import CustomDatePicker from "../components/ui/CustomDatePicker";
import { getUserAvatar } from "../utils/avatar";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminStore {
  id: number;
  store_code: string;
  name: string;
  address: string;
  phone?: string;
  latitude?: number | null;
  longitude?: number | null;
  created_at: string;
  route_id: number;
  route_name: string;
  route_code: string;
  staff_name: string;
}

interface AdminOrder {
  id: number;
  order_code: string;
  total_amount: number;
  created_at: string;
  store_id: number;
  store_name: string;
  store_code: string;
  user_id: number;
  staff_name: string;
  item_count: number;
  total_qty: number;
}

interface OrderItem {
  id: number;
  product_name: string;
  product_sku: string;
  product_image?: string;
  category_name: string;
  quantity: number;
  price: number;
  amount: number;
  unit_type: string;
  base_unit: string;
  case_unit?: string;
  is_promo: boolean;
}

interface OrderDetail extends AdminOrder {
  store_address?: string;
  items: OrderItem[];
}

interface OverviewStats {
  total_stores: number;
  stores_with_coords: number;
  stores_no_coords: number;
  total_orders: number;
  total_order_value: number;
  total_staff: number;
  total_routes: number;
  trashed_stores: number;
  trashed_orders: number;
  trashed_routes: number;
}

interface TrashedStore {
  id: number;
  store_code: string;
  name: string;
  address: string;
  deleted_at: string;
  deleted_by_name: string;
  deleted_reason?: string;
  route_id?: number;
  route_name: string;
  route_code: string;
  staff_name: string;
}

interface TrashedOrder {
  id: number;
  order_code: string;
  total_amount: number;
  created_at: string;
  deleted_at: string;
  store_name: string;
  store_code: string;
  staff_name: string;
  deleted_by_name: string;
  item_count: number;
}

interface TrashedRoute {
  id: number;
  code: string;
  name: string;
  province_name: string;
  staff_name: string;
  deleted_at: string;
  deleted_by_name: string;
  deleted_reason: string;
}

interface PageInfo {
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (iso: string) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const fmtDateShort = (iso: string) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("vi-VN");
};

const fmtMoney = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "tr";
  return n.toLocaleString("vi-VN") + "đ";
};

// ─── Bottom-sheet Modal ───────────────────────────────────────────────────────

const BottomModal: React.FC<{
  children: React.ReactNode;
  onClose: () => void;
  maxWidth?: string;
}> = ({ children, onClose, maxWidth = "max-w-xl" }) => {
  const root = document.getElementById("modal-root");
  if (!root) return null;
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-md p-0 sm:p-4 select-none">
      <div className="fixed inset-0 cursor-pointer" onClick={onClose} />
      <div
        className={`relative z-10 w-full ${maxWidth} bg-white dark:bg-slate-800 rounded-t-[2rem] rounded-b-none sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[92dvh] sm:max-h-[88dvh] overflow-hidden animate-sheet-up sm:animate-fade-in border border-white/20 dark:border-slate-700`}
      >
        {children}
      </div>
    </div>,
    root,
  );
};

// ─── Confirm Force Delete (xóa vĩnh viễn khỏi thùng rác) ────────────────────

const ConfirmForceDelete: React.FC<{
  label: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}> = ({ label, onConfirm, onCancel, loading }) => (
  <BottomModal onClose={onCancel} maxWidth="max-w-sm">
    <div className="p-6 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 shrink-0">
          <i className="fa-solid fa-triangle-exclamation text-xl" />
        </div>
        <div>
          <h3 className="font-black text-slate-800 dark:text-white text-base uppercase tracking-tight">
            Xóa vĩnh viễn
          </h3>
          <p className="text-red-500 text-xs font-semibold">
            Dữ liệu sẽ mất hoàn toàn, không thể khôi phục
          </p>
        </div>
      </div>
      <p className="text-slate-600 dark:text-slate-300 text-sm font-semibold bg-red-50 dark:bg-red-900/20 rounded-2xl p-4 leading-relaxed border border-red-100 dark:border-red-800/40">
        {label}
      </p>
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 py-3 rounded-2xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-black text-sm uppercase tracking-wider hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
        >
          Hủy
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className="flex-1 py-3 rounded-2xl bg-red-600 text-white font-black text-sm uppercase tracking-wider hover:bg-red-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <i className="fa-solid fa-circle-xmark" />
          )}
          Xóa vĩnh viễn
        </button>
      </div>
    </div>
  </BottomModal>
);

// ─── Confirm Delete ───────────────────────────────────────────────────────────

const ConfirmDelete: React.FC<{
  label: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}> = ({ label, onConfirm, onCancel, loading }) => (
  <BottomModal onClose={onCancel} maxWidth="max-w-sm">
    <div className="p-6 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center text-rose-500 shrink-0">
          <i className="fa-solid fa-trash-can text-xl" />
        </div>
        <div>
          <h3 className="font-black text-slate-800 dark:text-white text-base uppercase tracking-tight">
            Xác nhận xóa
          </h3>
          <p className="text-slate-400 text-xs font-semibold">
            Dữ liệu sẽ vào thùng rác và có thể khôi phục lại
          </p>
        </div>
      </div>
      <p className="text-slate-600 dark:text-slate-300 text-sm font-semibold bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-4 leading-relaxed">
        {label}
      </p>
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 py-3 rounded-2xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-black text-sm uppercase tracking-wider hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
        >
          Hủy
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className="flex-1 py-3 rounded-2xl bg-rose-600 text-white font-black text-sm uppercase tracking-wider hover:bg-rose-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <i className="fa-solid fa-trash-can" />
          )}
          Xóa
        </button>
      </div>
    </div>
  </BottomModal>
);

// ─── Coords Modal ─────────────────────────────────────────────────────────────

const CoordModal: React.FC<{
  store: AdminStore;
  onSave: (lat: number | null, lng: number | null) => void;
  onClose: () => void;
  loading?: boolean;
}> = ({ store, onSave, onClose, loading }) => {
  const [lat, setLat] = useState(store.latitude?.toString() ?? "");
  const [lng, setLng] = useState(store.longitude?.toString() ?? "");

  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  const latValid = lat === "" || (!isNaN(latNum) && latNum >= -90 && latNum <= 90);
  const lngValid = lng === "" || (!isNaN(lngNum) && lngNum >= -180 && lngNum <= 180);

  const mapsUrl =
    lat && lng && !isNaN(latNum) && !isNaN(lngNum)
      ? `https://www.google.com/maps?q=${lat},${lng}`
      : null;

  return (
    <BottomModal onClose={onClose}>
      {/* Handle bar */}
      <div className="flex justify-center pt-3 pb-1 sm:hidden">
        <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 px-6 pt-4 pb-3 border-b border-slate-100 dark:border-slate-700">
        <div className="w-10 h-10 rounded-2xl bg-nm/10 dark:bg-nm/20 flex items-center justify-center text-nm shrink-0">
          <i className="fa-solid fa-location-dot" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-black text-slate-800 dark:text-white text-base uppercase tracking-tight">
            Cài đặt tọa độ GPS
          </h3>
          <p className="text-slate-400 text-xs font-semibold truncate">
            {store.name} · <span className="font-mono">{store.store_code}</span>
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
        >
          <i className="fa-solid fa-xmark text-sm" />
        </button>
      </div>

      <div className="p-6 flex flex-col gap-4">
        {/* Inputs */}
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              {
                key: "lat",
                label: "Latitude",
                val: lat,
                set: setLat,
                valid: latValid,
                hint: "-90 đến 90",
                ph: "10.7769",
              },
              {
                key: "lng",
                label: "Longitude",
                val: lng,
                set: setLng,
                valid: lngValid,
                hint: "-180 đến 180",
                ph: "106.6951",
              },
            ] as const
          ).map(({ key, label, val, set, valid, hint, ph }) => (
            <div key={key} className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                {label}
              </label>
              <input
                type="number"
                step="any"
                value={val}
                onChange={(e) => set(e.target.value)}
                placeholder={ph}
                className={`w-full px-4 py-3 rounded-2xl border-2 text-sm font-bold bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white transition-all focus:outline-none ${
                  valid
                    ? "border-transparent focus:border-nm"
                    : "border-rose-400 focus:border-rose-500"
                }`}
              />
              {!valid && (
                <p className="text-[10px] font-bold text-rose-500">{hint}</p>
              )}
            </div>
          ))}
        </div>

        {/* Map link */}
        {mapsUrl && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs font-black text-nm hover:underline uppercase tracking-wide"
          >
            <i className="fa-solid fa-map-location-dot" />
            Xem trên Google Maps
          </a>
        )}

        {/* Hint */}
        <p className="text-[11px] text-slate-400 dark:text-slate-500 font-semibold bg-slate-50 dark:bg-slate-900/50 rounded-2xl px-4 py-3 leading-relaxed">
          <i className="fa-solid fa-circle-info mr-1.5 text-nm/60" />
          Để trống cả hai ô sẽ xóa tọa độ đã lưu.
        </p>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-3.5 rounded-2xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-black text-sm uppercase tracking-wider hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            Hủy
          </button>
          <button
            disabled={!latValid || !lngValid || loading}
            onClick={() =>
              onSave(
                lat === "" ? null : parseFloat(lat),
                lng === "" ? null : parseFloat(lng),
              )
            }
            className="flex-1 py-3.5 rounded-2xl bg-nm text-white font-black text-sm uppercase tracking-wider hover:brightness-110 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <i className="fa-solid fa-floppy-disk" />
            )}
            Lưu
          </button>
        </div>
      </div>
    </BottomModal>
  );
};

// ─── Order Detail Sheet ───────────────────────────────────────────────────────

const OrderDetailSheet: React.FC<{
  orderId: number;
  onClose: () => void;
  onDelete: (order: OrderDetail) => void;
}> = ({ orderId, onClose, onDelete }) => {
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await apiFetchWithRefresh(`/admin/orders/${orderId}/detail`);
        if (res.ok) setDetail(await res.json());
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [orderId]);

  return (
    <BottomModal onClose={onClose} maxWidth="max-w-lg">
      {/* Handle */}
      <div className="flex justify-center pt-3 pb-1 sm:hidden">
        <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
      </div>

      {loading || !detail ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <span className="w-8 h-8 border-2 border-slate-200 border-t-nm rounded-full animate-spin" />
          <p className="text-slate-400 text-xs font-black uppercase tracking-widest">
            Đang tải...
          </p>
        </div>
      ) : (
        <>
          {/* Header band */}
          <div className="bg-nm/10 dark:bg-nm/5 px-6 py-4 border-b border-nm/20">
            <p className="text-[10px] font-black uppercase tracking-widest text-nm mb-1 flex items-center gap-1.5">
              <i className="fa-solid fa-file-invoice" />
              {detail.order_code}
            </p>
            <h2 className="font-black text-slate-800 dark:text-white text-lg leading-tight">
              {detail.store_name}
            </h2>
            {detail.store_address && (
              <p className="text-xs text-slate-400 font-semibold mt-0.5 truncate">
                {detail.store_address}
              </p>
            )}
          </div>

          {/* Scrollable body */}
          <div className="overflow-y-auto flex-1">
            <div className="px-6 py-4 space-y-0">
              {/* Meta rows */}
              {[
                { label: "Nhân viên", value: detail.staff_name, icon: "fa-user" },
                {
                  label: "Mã điểm bán",
                  value: detail.store_code,
                  icon: "fa-store",
                  mono: true,
                },
                {
                  label: "Thời gian",
                  value: fmtDate(detail.created_at),
                  icon: "fa-clock",
                },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between py-3 border-b border-slate-50 dark:border-slate-700/60"
                >
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {row.label}
                  </span>
                  <span
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-700 text-xs font-black text-slate-700 dark:text-slate-200 ${row.mono ? "font-mono" : ""}`}
                  >
                    <i className={`fa-solid ${row.icon} text-[10px] text-nm`} />
                    {row.value}
                  </span>
                </div>
              ))}

              {/* Items header */}
              <div className="pt-4 pb-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Sản phẩm trong đơn ({detail.items.length})
                </p>
              </div>

              {/* Items */}
              <div className="space-y-2">
                {detail.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-700/40"
                  >
                    {/* Image */}
                    <div className="w-14 h-14 shrink-0 rounded-xl overflow-hidden bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-600 flex items-center justify-center">
                      {item.product_image ? (
                        <img
                          src={`${API_BASE}${item.product_image}`}
                          alt={item.product_name}
                          className="w-full h-full object-contain"
                          onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      ) : (
                        <i className="fa-solid fa-image text-slate-300 text-xl" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-black text-slate-800 dark:text-white text-sm leading-tight truncate">
                          {item.product_name}
                        </p>
                        {item.is_promo && (
                          <span className="shrink-0 text-[9px] font-black text-green-600 bg-green-100 dark:bg-green-900/40 px-2 py-0.5 rounded-lg uppercase tracking-wide flex items-center gap-1">
                            <i className="fa-solid fa-gift" /> KM
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mt-0.5 block">
                        {item.category_name}
                      </span>
                    </div>

                    {/* Qty + amount */}
                    <div className="shrink-0 text-right">
                      <p className="font-black text-nm text-sm">
                        {item.is_promo ? (
                          <span className="text-green-500">Free</span>
                        ) : (
                          fmtMoney(item.amount)
                        )}
                      </p>
                      <p className="text-[10px] font-bold text-blue-500 mt-0.5">
                        SL: {item.quantity} {item.unit_type === "case" ? item.case_unit : item.base_unit}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Total */}
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                <div className="p-5 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                      Tổng cộng
                    </span>
                    <p className="text-[10px] text-emerald-500 font-semibold mt-0.5">
                      {detail.total_qty} sản phẩm
                    </p>
                  </div>
                  <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                    {detail.total_amount > 0
                      ? detail.total_amount.toLocaleString("vi-VN") + "đ"
                      : "Khuyến mãi"}
                  </span>
                </div>
              </div>

              {/* Delete button */}
              <div className="pt-4 pb-2">
                <button
                  onClick={() => onDelete(detail)}
                  className="w-full py-3.5 rounded-2xl border-2 border-rose-200 dark:border-rose-800 text-rose-500 font-black text-sm uppercase tracking-wider hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors flex items-center justify-center gap-2"
                >
                  <i className="fa-solid fa-trash-can" />
                  Xóa đơn hàng này
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </BottomModal>
  );
};

// ─── Dropdown Portal ──────────────────────────────────────────────────────────

interface DropdownOption {
  value: string;
  label: string;
  icon?: string;
}

const DropdownPortal: React.FC<{
  options: DropdownOption[];
  value: string;
  onSelect: (v: string) => void;
  anchorRect: DOMRect;
  onClose: () => void;
}> = ({ options, value, onSelect, anchorRect, onClose }) => {
  const root = document.getElementById("modal-root");
  if (!root) return null;

  const menuWidth = Math.max(anchorRect.width, 180);
  let left = anchorRect.left;
  if (left + menuWidth > window.innerWidth - 8) left = window.innerWidth - menuWidth - 8;
  const spaceBelow = window.innerHeight - anchorRect.bottom;
  const menuHeight = options.length * 44 + 12;
  const top =
    spaceBelow >= menuHeight
      ? anchorRect.bottom + 4
      : anchorRect.top - menuHeight - 4;

  return createPortal(
    <div className="fixed inset-0 z-[10002]" onClick={onClose}>
      <div
        style={{ position: "fixed", top, left, width: menuWidth, zIndex: 10003 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-700 overflow-hidden animate-slide-up"
      >
        <div className="p-1.5 space-y-0.5">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                onSelect(opt.value);
                onClose();
              }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-xs font-black rounded-xl transition-colors ${
                value === opt.value
                  ? "bg-nm text-white"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-nm"
              }`}
            >
              {opt.icon && (
                <i className={`fa-solid ${opt.icon} w-4 text-center text-[10px]`} />
              )}
              {opt.label}
              {value === opt.value && (
                <i className="fa-solid fa-check ml-auto text-[10px]" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>,
    root,
  );
};

// ─── Stat Card ────────────────────────────────────────────────────────────────

const StatCard: React.FC<{
  icon: string;
  label: string;
  value: string | number;
  color: string;
  sub?: string;
}> = ({ icon, label, value, color, sub }) => (
  <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-100 dark:border-slate-700 flex flex-col gap-2 hover:shadow-card transition-shadow">
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm shrink-0 ${color}`}>
      <i className={`fa-solid ${icon}`} />
    </div>
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 leading-none">
        {label}
      </p>
      <p className="text-xl font-black text-slate-800 dark:text-white mt-1 leading-none">
        {value}
      </p>
      {sub && (
        <p className="text-[10px] font-bold text-slate-400 mt-0.5">{sub}</p>
      )}
    </div>
  </div>
);

// ─── Pagination ───────────────────────────────────────────────────────────────

const Pagination: React.FC<{ info: PageInfo; onPage: (p: number) => void }> = ({
  info,
  onPage,
}) => {
  if (info.total_pages <= 1) return null;
  return (
    <div className="flex items-center justify-between pt-3">
      <p className="text-[11px] font-bold text-slate-400">
        {(info.page - 1) * info.page_size + 1}–
        {Math.min(info.page * info.page_size, info.total)}{" "}
        <span className="text-slate-300">/</span> {info.total}
      </p>
      <div className="flex gap-1.5 items-center">
        <button
          disabled={info.page <= 1}
          onClick={() => onPage(info.page - 1)}
          className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm disabled:opacity-40 hover:bg-nm/10 hover:text-nm transition-colors flex items-center justify-center"
        >
          <i className="fa-solid fa-chevron-left text-xs" />
        </button>
        <span className="text-xs font-black text-slate-600 dark:text-slate-300 min-w-[3rem] text-center">
          {info.page} / {info.total_pages}
        </span>
        <button
          disabled={info.page >= info.total_pages}
          onClick={() => onPage(info.page + 1)}
          className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm disabled:opacity-40 hover:bg-nm/10 hover:text-nm transition-colors flex items-center justify-center"
        >
          <i className="fa-solid fa-chevron-right text-xs" />
        </button>
      </div>
    </div>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────

const AdminPanel: React.FC<{ currentUser: User | null }> = ({ currentUser }) => {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<"stores" | "orders" | "trash" | "routes">("stores");

  // Overview
  const [stats, setStats] = useState<OverviewStats | null>(null);

  // ── Stores ──────────────────────────────────────────────────────────────────
  const [stores, setStores] = useState<AdminStore[]>([]);
  const [storePg, setStorePg] = useState<PageInfo>({
    total: 0, page: 1, page_size: 20, total_pages: 1,
  });
  const [storeSearch, setStoreSearch] = useState("");
  const [storeCoordFilter, setStoreCoordFilter] = useState<"" | "yes" | "no">("");
  const [storesLoading, setStoresLoading] = useState(false);
  const [coordModal, setCoordModal] = useState<AdminStore | null>(null);
  const [coordSaving, setCoordSaving] = useState(false);
  const [deleteStore, setDeleteStore] = useState<AdminStore | null>(null);
  const [deletingStore, setDeletingStore] = useState(false);

  // Coord filter dropdown
  const [coordDropOpen, setCoordDropOpen] = useState(false);
  const coordDropRef = useRef<HTMLButtonElement>(null);
  const [coordDropRect, setCoordDropRect] = useState<DOMRect | null>(null);

  // ── Orders ──────────────────────────────────────────────────────────────────
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [orderPg, setOrderPg] = useState<PageInfo>({
    total: 0, page: 1, page_size: 20, total_pages: 1,
  });
  const [orderSearch, setOrderSearch] = useState("");
  const [orderDateFrom, setOrderDateFrom] = useState("");
  const [orderDateTo, setOrderDateTo] = useState("");
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [detailOrderId, setDetailOrderId] = useState<number | null>(null);
  const [deleteOrder, setDeleteOrder] = useState<AdminOrder | OrderDetail | null>(null);
  const [deletingOrder, setDeletingOrder] = useState(false);

  // ── Trash ────────────────────────────────────────────────────────────────────
  const [trashTab, setTrashTab] = useState<"stores" | "orders" | "routes">("stores");
  const [trashedStores, setTrashedStores] = useState<TrashedStore[]>([]);
  const [trashedStorePg, setTrashedStorePg] = useState<PageInfo>({ total: 0, page: 1, page_size: 20, total_pages: 1 });
  const [trashedOrders, setTrashedOrders] = useState<TrashedOrder[]>([]);
  const [trashedOrderPg, setTrashedOrderPg] = useState<PageInfo>({ total: 0, page: 1, page_size: 20, total_pages: 1 });
  const [trashedRoutes, setTrashedRoutes] = useState<TrashedRoute[]>([]);
  const [trashedRoutePg, setTrashedRoutePg] = useState<PageInfo>({ total: 0, page: 1, page_size: 20, total_pages: 1 });
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashSearch, setTrashSearch] = useState("");
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [restoreStoreBlockedBy, setRestoreStoreBlockedBy] = useState<{ store: TrashedStore; route: TrashedRoute } | null>(null);
  const [forceDeleteItem, setForceDeleteItem] = useState<{ type: "store" | "order" | "route"; id: number; label: string } | null>(null);
  const [forceDeleting, setForceDeleting] = useState(false);
  const trashSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const storeSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const orderSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Admin Routes & Stores view ──────────────────────────────────────────────
  const [adminAllRoutes, setAdminAllRoutes] = useState<RouteItem[]>([]);
  const [adminStaffList, setAdminStaffList] = useState<User[]>([]);
  const [selectedAdminStaff, setSelectedAdminStaff] = useState<"all" | number>("all");
  const [adminSelectedRoute, setAdminSelectedRoute] = useState<RouteItem | null>(null);
  const [adminRouteStores, setAdminRouteStores] = useState<StoreItem[]>([]);
  const [adminRoutesLoading, setAdminRoutesLoading] = useState(false);
  const [adminRouteStoresLoading, setAdminRouteStoresLoading] = useState(false);
  const [adminRouteStoreSearch, setAdminRouteStoreSearch] = useState("");
  const [adminRouteSearch, setAdminRouteSearch] = useState("");
  const [adminStaffSearch, setAdminStaffSearch] = useState("");
  const [adminStaffSheetOpen, setAdminStaffSheetOpen] = useState(false);

  // ── Fetch Overview ───────────────────────────────────────────────────────────
  const fetchOverview = useCallback(async () => {
    try {
      const res = await apiFetchWithRefresh("/admin/overview");
      if (res.ok) setStats(await res.json());
    } catch { /* ignore */ }
  }, []);

  // ── Fetch Stores ─────────────────────────────────────────────────────────────
  const fetchStores = useCallback(
    async (page = 1, search = storeSearch, coordFilter = storeCoordFilter) => {
      setStoresLoading(true);
      try {
        const p = new URLSearchParams({ page: String(page), page_size: "20" });
        if (search) p.set("search", search);
        if (coordFilter) p.set("has_coords", coordFilter);
        const res = await apiFetchWithRefresh(`/admin/stores?${p}`);
        if (!res.ok) throw new Error();
        const json = await res.json();
        setStores(json.data);
        setStorePg({ total: json.total, page: json.page, page_size: json.page_size, total_pages: json.total_pages });
      } catch {
        showToast("Không thể tải danh sách điểm bán", "danger");
      } finally {
        setStoresLoading(false);
      }
    },
    [storeSearch, storeCoordFilter, showToast],
  );

  // ── Fetch Orders ──────────────────────────────────────────────────────────
  const fetchOrders = useCallback(
    async (
      page = 1,
      search = orderSearch,
      dateFrom = orderDateFrom,
      dateTo = orderDateTo,
    ) => {
      setOrdersLoading(true);
      try {
        const p = new URLSearchParams({ page: String(page), page_size: "20" });
        if (search) p.set("search", search);
        if (dateFrom) p.set("date_from", dateFrom);
        if (dateTo) p.set("date_to", dateTo);
        const res = await apiFetchWithRefresh(`/admin/orders?${p}`);
        if (!res.ok) throw new Error();
        const json = await res.json();
        setOrders(json.data);
        setOrderPg({ total: json.total, page: json.page, page_size: json.page_size, total_pages: json.total_pages });
      } catch {
        showToast("Không thể tải danh sách đơn hàng", "danger");
      } finally {
        setOrdersLoading(false);
      }
    },
    [orderSearch, orderDateFrom, orderDateTo, showToast],
  );

  // ── Fetch Trash ───────────────────────────────────────────────────────────
  const fetchTrash = useCallback(
    async (tab = trashTab, page = 1, search = trashSearch) => {
      setTrashLoading(true);
      try {
        const p = new URLSearchParams({ page: String(page), page_size: "20" });
        if (search) p.set("search", search);
        const path = tab === "stores"
          ? `/admin/trash/stores?${p}`
          : tab === "orders"
          ? `/admin/trash/orders?${p}`
          : `/admin/trash/routes?${p}`;
        const res = await apiFetchWithRefresh(path);
        if (!res.ok) throw new Error();
        const json = await res.json();
        if (tab === "stores") {
          setTrashedStores(json.data);
          setTrashedStorePg({ total: json.total, page: json.page, page_size: json.page_size, total_pages: json.total_pages });
        } else if (tab === "orders") {
          setTrashedOrders(json.data);
          setTrashedOrderPg({ total: json.total, page: json.page, page_size: json.page_size, total_pages: json.total_pages });
        } else {
          setTrashedRoutes(json.data);
          setTrashedRoutePg({ total: json.total, page: json.page, page_size: json.page_size, total_pages: json.total_pages });
        }
      } catch {
        showToast("Không thể tải thùng rác", "danger");
      } finally {
        setTrashLoading(false);
      }
    },
    [trashTab, trashSearch, showToast],
  );

  // ── Restore store ─────────────────────────────────────────────────────────
  const doRestoreStore = async (store: TrashedStore) => {
    setRestoringId(store.id);
    try {
      const res = await apiFetchWithRefresh(`/admin/stores/${store.id}/restore`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) { showToast(json.message || "Lỗi khôi phục", "danger"); return; }
      showToast(json.message, "success");
      fetchTrash("stores", trashedStorePg.page, trashSearch);
      fetchOverview();
    } catch {
      showToast("Lỗi kết nối", "danger");
    } finally {
      setRestoringId(null);
    }
  };

  const handleRestoreRouteAndStore = async (route: TrashedRoute, store: TrashedStore) => {
    setRestoreStoreBlockedBy(null);
    setRestoringId(store.id);
    try {
      // Backend cần hỗ trợ: restore store + tự khôi phục route cha nếu đang trong thùng rác
      // (không cascade toàn bộ stores khác trên tuyến)
      const res = await apiFetchWithRefresh(`/admin/stores/${store.id}/restore`, {
        method: "POST",
        body: JSON.stringify({ restore_route: true }),
      });
      const json = await res.json();
      if (!res.ok) { showToast(json.message || "Lỗi khôi phục", "danger"); return; }
      showToast(json.message || `Đã khôi phục điểm bán «${store.name}» và tuyến «${route.name}»`, "success");
      fetchTrash("routes", trashedRoutePg.page, trashSearch);
      fetchTrash("stores", trashedStorePg.page, trashSearch);
      fetchOverview();
    } catch {
      showToast("Lỗi kết nối", "danger");
    } finally {
      setRestoringId(null);
    }
  };

  const handleRestoreStore = async (store: TrashedStore) => {
    if (!store.route_id) {
      doRestoreStore(store);
      return;
    }

    // Fast path: already loaded in local state
    const localRoute = trashedRoutes.find(r => r.id === store.route_id);
    if (localRoute) {
      setRestoreStoreBlockedBy({ store, route: localRoute });
      return;
    }

    // Slow path: route not yet loaded — check API
    setRestoringId(store.id);
    let blockedByRoute: TrashedRoute | null = null;
    try {
      const p = new URLSearchParams({ page: "1", page_size: "50", search: store.route_code });
      const res = await apiFetchWithRefresh(`/admin/trash/routes?${p}`);
      if (res.ok) {
        const json = await res.json();
        blockedByRoute = (json.data as TrashedRoute[]).find(r => r.id === store.route_id) ?? null;
        if (blockedByRoute) {
          setTrashedRoutes(prev =>
            prev.some(r => r.id === blockedByRoute!.id) ? prev : [...prev, blockedByRoute!]
          );
        }
      }
    } catch {
      // If the check fails, fall through to direct restore
    } finally {
      setRestoringId(null);
    }

    if (blockedByRoute) {
      setRestoreStoreBlockedBy({ store, route: blockedByRoute });
    } else {
      doRestoreStore(store);
    }
  };

  // ── Restore order ─────────────────────────────────────────────────────────
  const handleRestoreOrder = async (id: number, code: string) => {
    setRestoringId(id);
    try {
      const res = await apiFetchWithRefresh(`/admin/orders/${id}/restore`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) { showToast(json.message || "Lỗi khôi phục", "danger"); return; }
      showToast(json.message, "success");
      fetchTrash("orders", trashedOrderPg.page, trashSearch);
      fetchOverview();
    } catch {
      showToast("Lỗi kết nối", "danger");
    } finally {
      setRestoringId(null);
    }
  };

  // ── Restore route ──────────────────────────────────────────────────────────
  const handleRestoreRoute = async (id: number) => {
    setRestoringId(id);
    try {
      const res = await apiFetchWithRefresh(`/admin/routes/${id}/restore`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) { showToast(json.message || "Lỗi khôi phục", "danger"); return; }
      showToast(json.message, "success");
      fetchTrash("routes", trashedRoutePg.page, trashSearch);
      fetchOverview();
    } catch {
      showToast("Lỗi kết nối", "danger");
    } finally {
      setRestoringId(null);
    }
  };

  // ── Force delete from trash ────────────────────────────────────────────────
  const handleForceDelete = async () => {
    if (!forceDeleteItem) return;
    setForceDeleting(true);
    const { type, id } = forceDeleteItem;
    const path = type === "store"
      ? `/admin/trash/stores/${id}`
      : type === "order"
      ? `/admin/trash/orders/${id}`
      : `/admin/trash/routes/${id}`;
    try {
      const res = await apiFetchWithRefresh(path, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) { showToast(json.message || "Lỗi xóa vĩnh viễn", "danger"); return; }
      showToast(json.message, "success");
      setForceDeleteItem(null);
      fetchTrash(trashTab, 1, trashSearch);
      fetchOverview();
    } catch {
      showToast("Lỗi kết nối", "danger");
    } finally {
      setForceDeleting(false);
    }
  };

  const handleTrashSearch = (val: string) => {
    setTrashSearch(val);
    if (trashSearchTimer.current) clearTimeout(trashSearchTimer.current);
    trashSearchTimer.current = setTimeout(() => fetchTrash(trashTab, 1, val), 400);
  };

  useEffect(() => { fetchOverview(); }, [fetchOverview]);
  useEffect(() => {
    if (activeTab === "stores") fetchStores(1, storeSearch, storeCoordFilter);
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activeTab === "orders") fetchOrders(1, orderSearch, orderDateFrom, orderDateTo);
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activeTab === "trash") fetchTrash(trashTab, 1, trashSearch);
  }, [activeTab, trashTab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activeTab === "routes") {
      fetchAdminRoutes();
      fetchAdminStaff();
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStoreSearch = (val: string) => {
    setStoreSearch(val);
    if (storeSearchTimer.current) clearTimeout(storeSearchTimer.current);
    storeSearchTimer.current = setTimeout(() => fetchStores(1, val, storeCoordFilter), 400);
  };

  const handleOrderSearch = (val: string) => {
    setOrderSearch(val);
    if (orderSearchTimer.current) clearTimeout(orderSearchTimer.current);
    orderSearchTimer.current = setTimeout(() => fetchOrders(1, val, orderDateFrom, orderDateTo), 400);
  };

  // ── Save coords ───────────────────────────────────────────────────────────
  const handleSaveCoords = async (lat: number | null, lng: number | null) => {
    if (!coordModal) return;
    setCoordSaving(true);
    try {
      const res = await apiFetchWithRefresh(`/admin/stores/${coordModal.id}/coordinates`, {
        method: "PATCH",
        body: JSON.stringify({ latitude: lat, longitude: lng }),
      });
      const json = await res.json();
      if (!res.ok) { showToast(json.message || "Lỗi cập nhật tọa độ", "danger"); return; }
      showToast(`Đã cập nhật tọa độ cho «${coordModal.name}»`, "success");
      setCoordModal(null);
      fetchStores(storePg.page, storeSearch, storeCoordFilter);
      fetchOverview();
    } catch {
      showToast("Lỗi kết nối", "danger");
    } finally {
      setCoordSaving(false);
    }
  };

  // ── Delete store ──────────────────────────────────────────────────────────
  const handleDeleteStore = async () => {
    if (!deleteStore) return;
    setDeletingStore(true);
    try {
      const res = await apiFetchWithRefresh(`/admin/stores/${deleteStore.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) { showToast(json.message || "Lỗi xóa điểm bán", "danger"); return; }
      showToast(json.message, "success");
      setDeleteStore(null);
      fetchStores(storePg.page, storeSearch, storeCoordFilter);
      fetchOverview();
    } catch {
      showToast("Lỗi kết nối", "danger");
    } finally {
      setDeletingStore(false);
    }
  };

  // ── Delete order ──────────────────────────────────────────────────────────
  const handleDeleteOrder = async () => {
    if (!deleteOrder) return;
    setDeletingOrder(true);
    try {
      const res = await apiFetchWithRefresh(`/admin/orders/${deleteOrder.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) { showToast(json.message || "Lỗi xóa đơn hàng", "danger"); return; }
      showToast(json.message, "success");
      setDeleteOrder(null);
      setDetailOrderId(null);
      fetchOrders(orderPg.page, orderSearch, orderDateFrom, orderDateTo);
      fetchOverview();
    } catch {
      showToast("Lỗi kết nối", "danger");
    } finally {
      setDeletingOrder(false);
    }
  };

  // ── Fetch Admin Routes ────────────────────────────────────────────────────
  const fetchAdminRoutes = useCallback(async () => {
    setAdminRoutesLoading(true);
    try {
      const res = await apiFetchWithRefresh("/admin/routes");
      if (!res.ok) throw new Error();
      const data = await res.json();
      const mapped: RouteItem[] = data.map((r: any) => ({
        ...r,
        staff_id: r.user_id ?? r.staff_id,
      }));
      setAdminAllRoutes(mapped);
    } catch {
      showToast("Không thể tải danh sách tuyến", "danger");
    } finally {
      setAdminRoutesLoading(false);
    }
  }, [showToast]);

  const fetchAdminStaff = useCallback(async () => {
    try {
      const res = await apiFetchWithRefresh("/users");
      if (res.ok) setAdminStaffList(await res.json());
    } catch { /* ignore */ }
  }, []);

  const fetchAdminRouteStores = useCallback(async (routeId: number) => {
    setAdminRouteStoresLoading(true);
    try {
      const res = await apiFetchWithRefresh(`/stores?route_id=${routeId}`);
      if (res.ok) setAdminRouteStores(await res.json());
    } catch {
      showToast("Không thể tải danh sách điểm bán", "danger");
    } finally {
      setAdminRouteStoresLoading(false);
    }
  }, [showToast]);

  // Coord dropdown options
  const coordFilterOpts: DropdownOption[] = [
    { value: "", label: "Tất cả", icon: "fa-store" },
    { value: "yes", label: "Đã có GPS", icon: "fa-circle-check" },
    { value: "no", label: "Chưa có GPS", icon: "fa-circle-exclamation" },
  ];
  const coordFilterLabel =
    coordFilterOpts.find((o) => o.value === storeCoordFilter)?.label ?? "Tất cả";

  const filteredAdminRoutes = selectedAdminStaff === "all"
    ? adminAllRoutes
    : adminAllRoutes.filter((r) => Number(r.staff_id) === Number(selectedAdminStaff));

  const searchFilteredRoutes = adminRouteSearch
    ? filteredAdminRoutes.filter((r) =>
        r.name.toLowerCase().includes(adminRouteSearch.toLowerCase()) ||
        r.code.toLowerCase().includes(adminRouteSearch.toLowerCase())
      )
    : filteredAdminRoutes;

  const filteredStaffList = adminStaffSearch
    ? adminStaffList.filter((s) =>
        s.fullName.toLowerCase().includes(adminStaffSearch.toLowerCase())
      )
    : adminStaffList;

  const filteredAdminStores = adminRouteStores.filter((s) =>
    !adminRouteStoreSearch ||
    s.name.toLowerCase().includes(adminRouteStoreSearch.toLowerCase()) ||
    s.address.toLowerCase().includes(adminRouteStoreSearch.toLowerCase()),
  );

  // ─── Guard ─────────────────────────────────────────────────────────────────
  if (currentUser?.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-500 dark:text-slate-400">
        <i className="fa-solid fa-shield-halved text-4xl" />
        <p className="font-black uppercase tracking-wider text-sm">
          Không có quyền truy cập
        </p>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5 p-4 md:p-6 max-w-7xl mx-auto w-full select-none animate-fade-in">

      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-nm/10 dark:bg-nm/20 flex items-center justify-center">
          <i className="fa-solid fa-shield-halved text-nm text-xl" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tight leading-tight">
            Quản trị hệ thống
          </h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            Điểm bán · Tọa độ GPS · Đơn hàng
          </p>
        </div>
      </div>

      {/* Overview Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <StatCard icon="fa-store" label="Tổng điểm bán" value={stats.total_stores}
            color="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" />
          <StatCard icon="fa-circle-check" label="Đã có GPS" value={stats.stores_with_coords}
            color="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
            sub={`${stats.total_stores ? Math.round((stats.stores_with_coords / stats.total_stores) * 100) : 0}%`} />
          <StatCard icon="fa-circle-exclamation" label="Chưa có GPS" value={stats.stores_no_coords}
            color="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" />
          <StatCard icon="fa-file-invoice" label="Tổng đơn hàng" value={stats.total_orders}
            color="bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400" />
          <StatCard
            icon="fa-coins" label="Giá trị"
            value={stats.total_order_value >= 1e9
              ? `${(stats.total_order_value / 1e9).toFixed(1)}B`
              : stats.total_order_value >= 1e6
                ? `${(stats.total_order_value / 1e6).toFixed(0)}M`
                : stats.total_order_value.toLocaleString("vi-VN")}
            color="bg-nm/10 dark:bg-nm/20 text-nm" sub="VND" />
          <StatCard icon="fa-users" label="Nhân viên" value={stats.total_staff}
            color="bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400" />
          <StatCard icon="fa-map-location-dot" label="Tuyến đường" value={stats.total_routes}
            color="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400" />
          {(stats.trashed_stores > 0 || stats.trashed_orders > 0) && (
            <button
              onClick={() => setActiveTab("trash")}
              className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-rose-100 dark:border-rose-900/40 flex flex-col gap-2 hover:border-rose-300 transition-colors group"
            >
              <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-900/30 flex items-center justify-center text-sm text-rose-500 group-hover:bg-rose-100 transition-colors">
                <i className="fa-solid fa-trash-can" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 leading-none">Thùng rác</p>
                <p className="text-xl font-black text-rose-500 mt-1 leading-none">
                  {stats.trashed_stores + stats.trashed_orders}
                </p>
                <p className="text-[10px] font-bold text-slate-400 mt-0.5">mục bị xóa</p>
              </div>
            </button>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1.5 bg-slate-100 dark:bg-slate-800/80 rounded-2xl p-1 w-full sm:w-fit overflow-x-auto scrollbar-hide">
        {(
          [
            { key: "stores" as const, label: "Điểm bán", icon: "fa-store" },
            { key: "orders" as const, label: "Đơn hàng", icon: "fa-file-invoice" },
            { key: "routes" as const, label: "Tuyến đường", icon: "fa-route" },
          ]
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`shrink-0 flex items-center justify-center gap-1.5 px-4 sm:px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === t.key
                ? "bg-white dark:bg-slate-700 text-nm shadow-sm"
                : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            }`}
          >
            <i className={`fa-solid ${t.icon}`} />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
        {/* Trash tab — show only when there are deleted items */}
        {stats && (stats.trashed_stores > 0 || stats.trashed_orders > 0) && (
          <button
            onClick={() => setActiveTab("trash")}
            className={`shrink-0 flex items-center justify-center gap-1.5 px-4 sm:px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === "trash"
                ? "bg-white dark:bg-slate-700 text-rose-500 shadow-sm"
                : "text-slate-400 hover:text-rose-500 dark:hover:text-rose-400"
            }`}
          >
            <i className="fa-solid fa-trash-can" />
            <span className="hidden sm:inline">Thùng rác</span>
            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center leading-none">
              {stats.trashed_stores + stats.trashed_orders}
            </span>
          </button>
        )}
      </div>

      {/* ─── TAB: STORES ─────────────────────────────────────────────────────── */}
      {activeTab === "stores" && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
          {/* Toolbar */}
          <div className="flex flex-wrap gap-2.5 p-4 border-b border-slate-100 dark:border-slate-700">
            {/* Search */}
            <div className="flex-1 min-w-44 relative">
              <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]" />
              <input
                type="text"
                value={storeSearch}
                onChange={(e) => handleStoreSearch(e.target.value)}
                placeholder="Tìm tên, mã, địa chỉ..."
                className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-white focus:outline-none focus:border-nm"
              />
            </div>

            {/* Coord filter dropdown */}
            <button
              ref={coordDropRef}
              onClick={() => {
                const rect = coordDropRef.current?.getBoundingClientRect();
                if (rect) { setCoordDropRect(rect); setCoordDropOpen(true); }
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-black uppercase tracking-wider transition-all ${
                storeCoordFilter
                  ? "border-nm bg-nm/5 text-nm"
                  : "border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400"
              }`}
            >
              <i className="fa-solid fa-location-dot text-[10px]" />
              {coordFilterLabel}
              <i className="fa-solid fa-chevron-down text-[9px] opacity-60" />
            </button>

            {storeCoordFilter && (
              <button
                onClick={() => { setStoreCoordFilter(""); fetchStores(1, storeSearch, ""); }}
                className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-400 text-xs font-black hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              >
                <i className="fa-solid fa-xmark" />
              </button>
            )}

            <button
              onClick={() => fetchStores(1, storeSearch, storeCoordFilter)}
              className="px-4 py-2 rounded-xl bg-nm text-white text-xs font-black uppercase tracking-wider hover:brightness-110 transition-all flex items-center gap-2"
            >
              <i className="fa-solid fa-rotate text-[10px]" />
              Tải lại
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            {storesLoading ? (
              <div className="flex items-center justify-center py-16 gap-3">
                <span className="w-6 h-6 border-2 border-slate-200 border-t-nm rounded-full animate-spin" />
                <p className="text-slate-400 text-xs font-black uppercase tracking-widest">Đang tải...</p>
              </div>
            ) : stores.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400">
                <i className="fa-solid fa-store-slash text-4xl text-slate-200 dark:text-slate-700" />
                <p className="text-xs font-black uppercase tracking-widest">Không có điểm bán</p>
              </div>
            ) : (
              <>
                {/* Mobile card list */}
                <div className="md:hidden divide-y divide-slate-50 dark:divide-slate-700/50">
                  {stores.map((s) => (
                    <div key={s.id} className="p-4 space-y-2.5">
                      <div className="flex items-start gap-2 justify-between">
                        <div className="min-w-0">
                          <p className="font-black text-sm text-slate-800 dark:text-white leading-tight">{s.name}</p>
                          <p className="text-[10px] font-mono font-bold text-slate-400 mt-0.5">{s.store_code}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button onClick={() => setCoordModal(s)}
                            className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                            <i className="fa-solid fa-location-dot text-xs" />
                          </button>
                          <button onClick={() => setDeleteStore(s)}
                            className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-900/20 text-rose-500 dark:text-rose-400 flex items-center justify-center">
                            <i className="fa-solid fa-trash-can text-xs" />
                          </button>
                        </div>
                      </div>
                      {s.address && (
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{s.address}</p>
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-[10px] font-black text-slate-600 dark:text-slate-300">{s.route_name}</p>
                          <p className="text-[10px] font-semibold text-slate-400">{s.staff_name}</p>
                        </div>
                        <div className="flex flex-col items-end gap-0.5">
                          {s.latitude != null && s.longitude != null ? (
                            <a href={`https://www.google.com/maps?q=${s.latitude},${s.longitude}`}
                              target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-600 dark:text-emerald-400">
                              <i className="fa-solid fa-circle-check" /> GPS ✓
                            </a>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-500">
                              <i className="fa-solid fa-circle-exclamation" /> Chưa có GPS
                            </span>
                          )}
                          <span className="text-[10px] font-bold text-slate-400">{fmtDateShort(s.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Desktop table */}
                <table className="hidden md:table w-full">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-700">
                      {["Mã / Tên", "Địa chỉ", "Tuyến / NV", "GPS", "Ngày tạo", ""].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stores.map((s) => (
                      <tr key={s.id} className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50/80 dark:hover:bg-slate-900/30 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-black text-sm text-slate-800 dark:text-white">{s.name}</p>
                          <p className="text-[10px] font-mono font-bold text-slate-400">{s.store_code}</p>
                        </td>
                        <td className="px-4 py-3 max-w-[200px]">
                          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 truncate">{s.address || "—"}</p>
                          {s.phone && <p className="text-[10px] text-slate-400">{s.phone}</p>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="text-xs font-black text-slate-700 dark:text-slate-200">{s.route_name}</p>
                          <p className="text-[10px] font-semibold text-slate-400">{s.staff_name}</p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {s.latitude != null && s.longitude != null ? (
                            <a href={`https://www.google.com/maps?q=${s.latitude},${s.longitude}`}
                              target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-[10px] font-black text-emerald-600 dark:text-emerald-400 hover:underline">
                              <i className="fa-solid fa-circle-check" />
                              {s.latitude.toFixed(4)}, {s.longitude.toFixed(4)}
                            </a>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-amber-500">
                              <i className="fa-solid fa-circle-exclamation" />
                              Chưa có
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-[10px] font-bold text-slate-400">
                          {fmtDateShort(s.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 justify-end">
                            <button onClick={() => setCoordModal(s)} title="Cài đặt tọa độ"
                              className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors flex items-center justify-center">
                              <i className="fa-solid fa-location-dot text-xs" />
                            </button>
                            <button onClick={() => setDeleteStore(s)} title="Xóa điểm bán"
                              className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-900/20 text-rose-500 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors flex items-center justify-center">
                              <i className="fa-solid fa-trash-can text-xs" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>

          <div className="px-4 pb-4">
            <Pagination info={storePg} onPage={(p) => fetchStores(p, storeSearch, storeCoordFilter)} />
          </div>
        </div>
      )}

      {/* ─── TAB: ORDERS ─────────────────────────────────────────────────────── */}
      {activeTab === "orders" && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
          {/* Toolbar */}
          <div className="flex flex-wrap gap-2.5 p-4 border-b border-slate-100 dark:border-slate-700">
            <div className="flex-1 min-w-44 relative">
              <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]" />
              <input
                type="text"
                value={orderSearch}
                onChange={(e) => handleOrderSearch(e.target.value)}
                placeholder="Tìm mã đơn, cửa hàng, nhân viên..."
                className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-white focus:outline-none focus:border-nm"
              />
            </div>

            {/* Date filters */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="flex-1 sm:w-36 sm:flex-none">
                <CustomDatePicker
                  value={orderDateFrom}
                  onChange={(date) => { setOrderDateFrom(date); fetchOrders(1, orderSearch, date, orderDateTo); }}
                  placeholder="Từ ngày"
                />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex-shrink-0">—</span>
              <div className="flex-1 sm:w-36 sm:flex-none">
                <CustomDatePicker
                  value={orderDateTo}
                  onChange={(date) => { setOrderDateTo(date); fetchOrders(1, orderSearch, orderDateFrom, date); }}
                  placeholder="Đến ngày"
                />
              </div>
            </div>

            {(orderDateFrom || orderDateTo || orderSearch) && (
              <button
                onClick={() => { setOrderSearch(""); setOrderDateFrom(""); setOrderDateTo(""); fetchOrders(1, "", "", ""); }}
                className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-400 text-xs font-black hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors flex items-center gap-1.5"
              >
                <i className="fa-solid fa-xmark" /> Xóa lọc
              </button>
            )}

            <button onClick={() => fetchOrders(1, orderSearch, orderDateFrom, orderDateTo)}
              className="px-4 py-2 rounded-xl bg-nm text-white text-xs font-black uppercase tracking-wider hover:brightness-110 transition-all flex items-center gap-2">
              <i className="fa-solid fa-rotate text-[10px]" />
              Tải lại
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            {ordersLoading ? (
              <div className="flex items-center justify-center py-16 gap-3">
                <span className="w-6 h-6 border-2 border-slate-200 border-t-nm rounded-full animate-spin" />
                <p className="text-slate-400 text-xs font-black uppercase tracking-widest">Đang tải...</p>
              </div>
            ) : orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400">
                <i className="fa-solid fa-file-circle-xmark text-4xl text-slate-200 dark:text-slate-700" />
                <p className="text-xs font-black uppercase tracking-widest">Không có đơn hàng</p>
              </div>
            ) : (
              <>
                {/* Mobile card list */}
                <div className="md:hidden divide-y divide-slate-50 dark:divide-slate-700/50">
                  {orders.map((o) => (
                    <div
                      key={o.id}
                      onClick={() => setDetailOrderId(o.id)}
                      className="p-4 space-y-2 cursor-pointer active:bg-nm/5"
                    >
                      <div className="flex items-start gap-2 justify-between">
                        <div className="min-w-0">
                          <span className="font-mono font-black text-xs text-nm">{o.order_code}</span>
                          <p className="font-black text-sm text-slate-800 dark:text-white mt-0.5 leading-tight">{o.store_name}</p>
                          <p className="text-[10px] font-mono font-bold text-slate-400">{o.store_code}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <p className="font-black text-sm text-nm">
                            {o.total_amount > 0 ? fmtMoney(o.total_amount) : <span className="text-slate-400 font-semibold text-xs">KM</span>}
                          </p>
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteOrder(o); }}
                            className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-900/20 text-rose-500 dark:text-rose-400 flex items-center justify-center"
                          >
                            <i className="fa-solid fa-trash-can text-xs" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[10px]">
                        <span className="font-semibold text-slate-400">{o.staff_name}</span>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-black uppercase">
                            {o.item_count} sp · {o.total_qty}
                          </span>
                          <span className="font-bold text-slate-400">{fmtDate(o.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Desktop table */}
                <table className="hidden md:table w-full">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-700">
                      {["Mã đơn", "Điểm bán", "Nhân viên", "SP / SL", "Giá trị", "Thời gian", ""].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr
                        key={o.id}
                        onClick={() => setDetailOrderId(o.id)}
                        className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-nm/5 dark:hover:bg-nm/5 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-mono font-black text-xs text-nm">{o.order_code}</span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-black text-sm text-slate-800 dark:text-white">{o.store_name}</p>
                          <p className="text-[10px] font-mono font-bold text-slate-400">{o.store_code}</p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs font-semibold text-slate-600 dark:text-slate-300">
                          {o.staff_name}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-black uppercase">
                            {o.item_count} sp · {o.total_qty}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-black text-sm text-nm">
                          {o.total_amount > 0
                            ? fmtMoney(o.total_amount)
                            : <span className="text-slate-400 font-semibold text-xs">KM</span>
                          }
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-[10px] font-bold text-slate-400">
                          {fmtDate(o.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteOrder(o); }}
                            title="Xóa đơn hàng"
                            className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-900/20 text-rose-500 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors flex items-center justify-center"
                          >
                            <i className="fa-solid fa-trash-can text-xs" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>

          <div className="px-4 pb-4">
            <Pagination info={orderPg} onPage={(p) => fetchOrders(p, orderSearch, orderDateFrom, orderDateTo)} />
          </div>
        </div>
      )}

      {/* ─── TAB: TRASH ──────────────────────────────────────────────────────── */}
      {activeTab === "trash" && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
          {/* Toolbar */}
          <div className="flex flex-wrap gap-2.5 p-4 border-b border-slate-100 dark:border-slate-700">
            {/* Sub-tabs */}
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-900/50 rounded-xl p-0.5">
              <button
                onClick={() => setTrashTab("stores")}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-[10px] text-xs font-black uppercase tracking-wider transition-all ${
                  trashTab === "stores"
                    ? "bg-white dark:bg-slate-700 text-rose-500 shadow-sm"
                    : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                }`}
              >
                <i className="fa-solid fa-store text-[10px]" />
                Điểm bán
                {stats && stats.trashed_stores > 0 && (
                  <span className="min-w-[16px] h-4 px-1 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-500 text-[9px] font-black flex items-center justify-center">
                    {stats.trashed_stores}
                  </span>
                )}
              </button>
              <button
                onClick={() => setTrashTab("orders")}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-[10px] text-xs font-black uppercase tracking-wider transition-all ${
                  trashTab === "orders"
                    ? "bg-white dark:bg-slate-700 text-rose-500 shadow-sm"
                    : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                }`}
              >
                <i className="fa-solid fa-file-invoice text-[10px]" />
                Đơn hàng
                {stats && stats.trashed_orders > 0 && (
                  <span className="min-w-[16px] h-4 px-1 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-500 text-[9px] font-black flex items-center justify-center">
                    {stats.trashed_orders}
                  </span>
                )}
              </button>
              <button
                onClick={() => setTrashTab("routes")}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-[10px] text-xs font-black uppercase tracking-wider transition-all ${
                  trashTab === "routes"
                    ? "bg-white dark:bg-slate-700 text-rose-500 shadow-sm"
                    : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                }`}
              >
                <i className="fa-solid fa-route text-[10px]" />
                Tuyến
                {stats && stats.trashed_routes > 0 && (
                  <span className="min-w-[16px] h-4 px-1 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-500 text-[9px] font-black flex items-center justify-center">
                    {stats.trashed_routes}
                  </span>
                )}
              </button>
            </div>

            {/* Search */}
            <div className="flex-1 min-w-44 relative">
              <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]" />
              <input
                type="text"
                value={trashSearch}
                onChange={(e) => handleTrashSearch(e.target.value)}
                placeholder={trashTab === "stores" ? "Tìm tên, mã điểm bán..." : trashTab === "orders" ? "Tìm mã đơn, cửa hàng..." : "Tìm tên, mã tuyến..."}
                className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-white focus:outline-none focus:border-rose-400"
              />
            </div>

            <button
              onClick={() => fetchTrash(trashTab, 1, trashSearch)}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 text-xs font-black uppercase tracking-wider hover:bg-slate-200 dark:hover:bg-slate-600 transition-all flex items-center gap-2"
            >
              <i className="fa-solid fa-rotate text-[10px]" />
              Tải lại
            </button>
          </div>

          {/* Info banner */}
          <div className="mx-4 mt-4 px-4 py-3 rounded-2xl bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800/40 flex items-start gap-3">
            <i className="fa-solid fa-circle-info text-rose-400 mt-0.5 text-sm shrink-0" />
            <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 leading-relaxed">
              Các mục trong thùng rác có thể được khôi phục. Điểm bán bị xóa sẽ kéo theo toàn bộ đơn hàng của nó.
            </p>
          </div>

          {/* Table */}
          <div className="overflow-x-auto mt-4">
            {trashLoading ? (
              <div className="flex items-center justify-center py-16 gap-3">
                <span className="w-6 h-6 border-2 border-slate-200 border-t-rose-500 rounded-full animate-spin" />
                <p className="text-slate-400 text-xs font-black uppercase tracking-widest">Đang tải...</p>
              </div>
            ) : trashTab === "routes" ? (
              trashedRoutes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400">
                  <i className="fa-solid fa-route text-4xl text-slate-200 dark:text-slate-700" />
                  <p className="text-xs font-black uppercase tracking-widest">Không có tuyến nào bị xóa</p>
                </div>
              ) : (
                <>
                  {/* Mobile cards */}
                  <div className="md:hidden divide-y divide-slate-50 dark:divide-slate-700/50">
                    {trashedRoutes.map((r) => (
                      <div key={r.id} className="p-4 space-y-2">
                        <div className="flex items-start gap-2 justify-between">
                          <div className="min-w-0">
                            <p className="font-black text-sm text-slate-700 dark:text-slate-200 leading-tight">{r.name}</p>
                            <p className="text-[10px] font-mono font-bold text-slate-400">{r.code}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => handleRestoreRoute(r.id)}
                              disabled={restoringId === r.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 disabled:opacity-50 text-[10px] font-black uppercase tracking-wide whitespace-nowrap"
                            >
                              {restoringId === r.id ? (
                                <span className="w-3 h-3 border-2 border-emerald-400/40 border-t-emerald-500 rounded-full animate-spin" />
                              ) : (
                                <i className="fa-solid fa-rotate-left" />
                              )}
                              Khôi phục
                            </button>
                            <button
                              onClick={() => setForceDeleteItem({ type: "route", id: r.id, label: `Tuyến «${r.name}» (${r.code}) sẽ bị xóa vĩnh viễn.` })}
                              className="w-7 h-7 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-500 flex items-center justify-center text-xs"
                              title="Xóa vĩnh viễn"
                            >
                              <i className="fa-solid fa-circle-xmark" />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[10px]">
                          <div>
                            <p className="font-semibold text-slate-400">{r.province_name} · {r.staff_name}</p>
                            {r.deleted_reason && (
                              <p className="text-slate-400 italic mt-0.5">"{r.deleted_reason}"</p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-rose-400">{fmtDate(r.deleted_at)}</p>
                            <p className="text-slate-400">bởi {r.deleted_by_name}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Desktop table */}
                  <table className="hidden md:table w-full">
                    <thead>
                      <tr className="bg-rose-50/60 dark:bg-rose-900/10 border-b border-rose-100 dark:border-rose-800/30">
                        {["Mã tuyến", "Tên tuyến", "Tỉnh/TP", "Nhân viên", "Lý do xóa", "Xóa lúc", "Xóa bởi", ""].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {trashedRoutes.map((r) => (
                        <tr key={r.id} className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-rose-50/40 dark:hover:bg-rose-900/10 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="font-mono font-black text-xs text-slate-400 line-through">{r.code}</span>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-black text-sm text-slate-700 dark:text-slate-200">{r.name}</p>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs font-semibold text-slate-500 dark:text-slate-400">
                            {r.province_name || "—"}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs font-semibold text-slate-500 dark:text-slate-400">
                            {r.staff_name}
                          </td>
                          <td className="px-4 py-3 max-w-[200px]">
                            <p className="text-xs text-slate-400 italic truncate" title={r.deleted_reason}>
                              {r.deleted_reason || "—"}
                            </p>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-[10px] font-bold text-rose-400">
                            {fmtDate(r.deleted_at)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs font-semibold text-slate-500 dark:text-slate-400">
                            {r.deleted_by_name}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleRestoreRoute(r.id)}
                                disabled={restoringId === r.id}
                                title="Khôi phục tuyến"
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 disabled:opacity-50 transition-colors text-[10px] font-black uppercase tracking-wide whitespace-nowrap"
                              >
                                {restoringId === r.id ? (
                                  <span className="w-3 h-3 border-2 border-emerald-400/40 border-t-emerald-500 rounded-full animate-spin" />
                                ) : (
                                  <i className="fa-solid fa-rotate-left" />
                                )}
                                Khôi phục
                              </button>
                              <button
                                onClick={() => setForceDeleteItem({ type: "route", id: r.id, label: `Tuyến «${r.name}» (${r.code}) sẽ bị xóa vĩnh viễn.` })}
                                title="Xóa vĩnh viễn"
                                className="w-7 h-7 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors flex items-center justify-center text-xs"
                              >
                                <i className="fa-solid fa-circle-xmark" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )
            ) : trashTab === "stores" ? (
              trashedStores.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400">
                  <i className="fa-solid fa-store-slash text-4xl text-slate-200 dark:text-slate-700" />
                  <p className="text-xs font-black uppercase tracking-widest">Không có điểm bán nào bị xóa</p>
                </div>
              ) : (
                <>
                  {/* Mobile cards */}
                  <div className="md:hidden divide-y divide-slate-50 dark:divide-slate-700/50">
                    {trashedStores.map((s) => (
                      <div key={s.id} className="p-4 space-y-2">
                        <div className="flex items-start gap-2 justify-between">
                          <div className="min-w-0">
                            <p className="font-black text-sm text-slate-500 dark:text-slate-400 line-through leading-tight">{s.name}</p>
                            <p className="text-[10px] font-mono font-bold text-slate-400 mt-0.5">{s.store_code}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => handleRestoreStore(s)}
                              disabled={restoringId === s.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 disabled:opacity-50 text-[10px] font-black uppercase tracking-wide whitespace-nowrap"
                            >
                              {restoringId === s.id ? (
                                <span className="w-3 h-3 border-2 border-emerald-400/40 border-t-emerald-500 rounded-full animate-spin" />
                              ) : (
                                <i className="fa-solid fa-rotate-left" />
                              )}
                              Khôi phục
                            </button>
                            <button
                              onClick={() => setForceDeleteItem({ type: "store", id: s.id, label: `Điểm bán «${s.name}» (${s.store_code}) và toàn bộ đơn hàng của nó sẽ bị xóa vĩnh viễn.` })}
                              className="w-7 h-7 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-500 flex items-center justify-center text-xs"
                              title="Xóa vĩnh viễn"
                            >
                              <i className="fa-solid fa-circle-xmark" />
                            </button>
                          </div>
                        </div>
                        {s.address && <p className="text-xs font-semibold text-slate-400">{s.address}</p>}
                        {s.deleted_reason && (
                          <p className="text-[10px] text-amber-500 italic">Lý do: {s.deleted_reason}</p>
                        )}
                        {s.route_id && trashedRoutes.some(r => r.id === s.route_id) && (
                          <p className="text-[10px] text-orange-500 font-bold">
                            <i className="fa-solid fa-triangle-exclamation mr-1" />Tuyến chưa được khôi phục
                          </p>
                        )}
                        <div className="flex items-center justify-between gap-2 text-[10px]">
                          <span className="font-semibold text-slate-400">{s.route_name} · {s.staff_name}</span>
                          <div className="text-right">
                            <p className="font-bold text-rose-400">{fmtDate(s.deleted_at)}</p>
                            <p className="text-slate-400">bởi {s.deleted_by_name}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Desktop table */}
                  <table className="hidden md:table w-full">
                    <thead>
                      <tr className="bg-rose-50/60 dark:bg-rose-900/10 border-b border-rose-100 dark:border-rose-800/30">
                        {["Mã / Tên", "Địa chỉ", "Tuyến / NV", "Lý do xóa", "Xóa lúc", "Xóa bởi", ""].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {trashedStores.map((s) => (
                        <tr key={s.id} className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-rose-50/40 dark:hover:bg-rose-900/10 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-black text-sm text-slate-500 dark:text-slate-400 line-through">{s.name}</p>
                            <p className="text-[10px] font-mono font-bold text-slate-400">{s.store_code}</p>
                          </td>
                          <td className="px-4 py-3 max-w-[180px]">
                            <p className="text-xs font-semibold text-slate-400 truncate">{s.address || "—"}</p>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <p className="text-xs font-black text-slate-500 dark:text-slate-400">{s.route_name}</p>
                            <p className="text-[10px] font-semibold text-slate-400">{s.staff_name}</p>
                            {s.route_id && trashedRoutes.some(r => r.id === s.route_id) && (
                              <p className="text-[9px] text-orange-500 font-black mt-0.5">
                                <i className="fa-solid fa-triangle-exclamation mr-1" />Tuyến chưa khôi phục
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 max-w-[160px]">
                            <p className="text-[10px] text-amber-500 italic truncate" title={s.deleted_reason}>
                              {s.deleted_reason || "—"}
                            </p>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-[10px] font-bold text-rose-400">
                            {fmtDate(s.deleted_at)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs font-semibold text-slate-500 dark:text-slate-400">
                            {s.deleted_by_name}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleRestoreStore(s)}
                                disabled={restoringId === s.id}
                                title="Khôi phục điểm bán"
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 disabled:opacity-50 transition-colors text-[10px] font-black uppercase tracking-wide whitespace-nowrap"
                              >
                                {restoringId === s.id ? (
                                  <span className="w-3 h-3 border-2 border-emerald-400/40 border-t-emerald-500 rounded-full animate-spin" />
                                ) : (
                                  <i className="fa-solid fa-rotate-left" />
                                )}
                                Khôi phục
                              </button>
                              <button
                                onClick={() => setForceDeleteItem({ type: "store", id: s.id, label: `Điểm bán «${s.name}» (${s.store_code}) và toàn bộ đơn hàng của nó sẽ bị xóa vĩnh viễn.` })}
                                title="Xóa vĩnh viễn"
                                className="w-7 h-7 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors flex items-center justify-center text-xs"
                              >
                                <i className="fa-solid fa-circle-xmark" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )
            ) : (
              trashedOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400">
                  <i className="fa-solid fa-file-circle-xmark text-4xl text-slate-200 dark:text-slate-700" />
                  <p className="text-xs font-black uppercase tracking-widest">Không có đơn hàng nào bị xóa</p>
                </div>
              ) : (
                <>
                  {/* Mobile cards */}
                  <div className="md:hidden divide-y divide-slate-50 dark:divide-slate-700/50">
                    {trashedOrders.map((o) => (
                      <div key={o.id} className="p-4 space-y-2">
                        <div className="flex items-start gap-2 justify-between">
                          <div className="min-w-0">
                            <span className="font-mono font-black text-xs text-slate-400 line-through">{o.order_code}</span>
                            <p className="font-black text-sm text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">{o.store_name}</p>
                            <p className="text-[10px] font-mono font-bold text-slate-400">{o.store_code}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => handleRestoreOrder(o.id, o.order_code)}
                              disabled={restoringId === o.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 disabled:opacity-50 text-[10px] font-black uppercase tracking-wide whitespace-nowrap"
                            >
                              {restoringId === o.id ? (
                                <span className="w-3 h-3 border-2 border-emerald-400/40 border-t-emerald-500 rounded-full animate-spin" />
                              ) : (
                                <i className="fa-solid fa-rotate-left" />
                              )}
                              Khôi phục
                            </button>
                            <button
                              onClick={() => setForceDeleteItem({ type: "order", id: o.id, label: `Đơn hàng «${o.order_code}» của ${o.store_name} sẽ bị xóa vĩnh viễn.` })}
                              className="w-7 h-7 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-500 flex items-center justify-center text-xs"
                              title="Xóa vĩnh viễn"
                            >
                              <i className="fa-solid fa-circle-xmark" />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[10px]">
                          <div>
                            <p className="font-semibold text-slate-400">{o.staff_name}</p>
                            <p className="font-black text-slate-600 dark:text-slate-300 mt-0.5">
                              {o.total_amount > 0 ? fmtMoney(o.total_amount) : "KM"}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-rose-400">{fmtDate(o.deleted_at)}</p>
                            <p className="text-slate-400">bởi {o.deleted_by_name}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Desktop table */}
                  <table className="hidden md:table w-full">
                    <thead>
                      <tr className="bg-rose-50/60 dark:bg-rose-900/10 border-b border-rose-100 dark:border-rose-800/30">
                        {["Mã đơn", "Điểm bán", "Nhân viên", "Giá trị", "Xóa lúc", "Xóa bởi", ""].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {trashedOrders.map((o) => (
                        <tr key={o.id} className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-rose-50/40 dark:hover:bg-rose-900/10 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="font-mono font-black text-xs text-slate-400 line-through">{o.order_code}</span>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-black text-sm text-slate-500 dark:text-slate-400">{o.store_name}</p>
                            <p className="text-[10px] font-mono font-bold text-slate-400">{o.store_code}</p>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs font-semibold text-slate-500 dark:text-slate-400">
                            {o.staff_name}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap font-black text-sm text-slate-400">
                            {o.total_amount > 0
                              ? fmtMoney(o.total_amount)
                              : <span className="font-semibold text-xs">KM</span>
                            }
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-[10px] font-bold text-rose-400">
                            {fmtDate(o.deleted_at)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs font-semibold text-slate-500 dark:text-slate-400">
                            {o.deleted_by_name}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleRestoreOrder(o.id, o.order_code)}
                                disabled={restoringId === o.id}
                                title="Khôi phục đơn hàng"
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 disabled:opacity-50 transition-colors text-[10px] font-black uppercase tracking-wide whitespace-nowrap"
                              >
                                {restoringId === o.id ? (
                                  <span className="w-3 h-3 border-2 border-emerald-400/40 border-t-emerald-500 rounded-full animate-spin" />
                                ) : (
                                  <i className="fa-solid fa-rotate-left" />
                                )}
                                Khôi phục
                              </button>
                              <button
                                onClick={() => setForceDeleteItem({ type: "order", id: o.id, label: `Đơn hàng «${o.order_code}» của ${o.store_name} sẽ bị xóa vĩnh viễn.` })}
                                title="Xóa vĩnh viễn"
                                className="w-7 h-7 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors flex items-center justify-center text-xs"
                              >
                                <i className="fa-solid fa-circle-xmark" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )
            )}
          </div>

          <div className="px-4 pb-4 mt-2">
            {trashTab === "stores" ? (
              <Pagination info={trashedStorePg} onPage={(p) => fetchTrash("stores", p, trashSearch)} />
            ) : trashTab === "orders" ? (
              <Pagination info={trashedOrderPg} onPage={(p) => fetchTrash("orders", p, trashSearch)} />
            ) : (
              <Pagination info={trashedRoutePg} onPage={(p) => fetchTrash("routes", p, trashSearch)} />
            )}
          </div>
        </div>
      )}

      {/* ─── TAB: ROUTES ─────────────────────────────────────────────────────── */}
      {activeTab === "routes" && (
        <div className="space-y-4">
          {adminSelectedRoute ? (
            /* ── Chi tiết tuyến đã chọn ── */
            <>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setAdminSelectedRoute(null);
                    setAdminRouteStores([]);
                    setAdminRouteStoreSearch("");
                  }}
                  className="w-10 h-10 flex items-center justify-center rounded-xl bg-nm/10 text-nm hover:bg-nm hover:text-white transition-all"
                >
                  <i className="fa-solid fa-chevron-left" />
                </button>
                <div>
                  <h2 className="font-black text-slate-800 dark:text-white text-lg uppercase tracking-tight leading-tight">
                    {adminSelectedRoute.name}
                  </h2>
                  <p className="text-[10px] font-black text-nm uppercase tracking-widest">
                    {adminSelectedRoute.code}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-slate-800 p-5 rounded-[1.5rem] border border-slate-100 dark:border-slate-700">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Mã tuyến</p>
                  <p className="text-xl font-black text-nm">{adminSelectedRoute.code}</p>
                </div>
                <div className="bg-white dark:bg-slate-800 p-5 rounded-[1.5rem] border border-slate-100 dark:border-slate-700">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Điểm bán</p>
                  <p className="text-xl font-black text-slate-800 dark:text-white">
                    {adminRouteStoresLoading ? "..." : adminRouteStores.length}
                  </p>
                </div>
                <div className="bg-white dark:bg-slate-800 p-5 rounded-[1.5rem] border border-slate-100 dark:border-slate-700 col-span-2 sm:col-span-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Tỉnh thành</p>
                  <p className="text-sm font-black text-slate-600 dark:text-slate-300 truncate">
                    {adminSelectedRoute.province_name}
                  </p>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-[2rem] border border-slate-100 dark:border-slate-700 overflow-hidden">
                <div className="p-5 border-b border-slate-50 dark:border-slate-700 flex flex-wrap items-center justify-between gap-4">
                  <h3 className="font-black text-slate-800 dark:text-white flex items-center gap-3 uppercase tracking-tight">
                    <div className="w-9 h-9 bg-nm/10 rounded-xl flex items-center justify-center text-nm">
                      <i className="fa-solid fa-store" />
                    </div>
                    Điểm bán trên tuyến
                  </h3>
                  <div className="relative w-full sm:w-72">
                    <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 text-[10px]" />
                    <input
                      type="text"
                      placeholder="Tìm tên hoặc địa chỉ..."
                      value={adminRouteStoreSearch}
                      onChange={(e) => setAdminRouteStoreSearch(e.target.value)}
                      className="pl-10 pr-4 py-2.5 w-full text-sm bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-600 rounded-xl focus:outline-none focus:border-nm font-medium text-slate-800 dark:text-white transition-colors"
                    />
                  </div>
                </div>

                {adminRouteStoresLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <span className="w-6 h-6 border-2 border-slate-200 border-t-nm rounded-full animate-spin" />
                  </div>
                ) : filteredAdminStores.length === 0 ? (
                  <div className="py-16 text-center text-slate-300 font-black uppercase text-xs tracking-widest">
                    Không có điểm bán nào
                  </div>
                ) : (
                  <>
                    <div className="hidden md:block divide-y divide-slate-50 dark:divide-slate-700/50">
                      {filteredAdminStores.map((store, i) => (
                        <div
                          key={store.id}
                          className="flex items-center gap-4 px-6 py-3.5 hover:bg-nm/[0.03] dark:hover:bg-nm/[0.06] transition-all"
                        >
                          <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-700/60 text-slate-400 flex items-center justify-center text-xs font-black shrink-0">
                            {i + 1}
                          </div>
                          <div className="w-10 h-10 rounded-2xl bg-nm/8 text-nm/60 flex items-center justify-center shrink-0">
                            <i className="fa-solid fa-store text-sm" />
                          </div>
                          <div className="w-52 shrink-0">
                            <p className="font-black text-slate-800 dark:text-white text-sm leading-snug">{store.name}</p>
                            <span className="inline-block mt-0.5 text-[9px] font-black text-nm uppercase tracking-widest border border-nm/30 rounded px-1.5 py-0.5 bg-nm/5">
                              {store.code}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0 space-y-0.5">
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-start gap-1.5">
                              <i className="fa-solid fa-location-dot text-nm/40 mt-0.5 shrink-0 text-[10px]" />
                              <span className="line-clamp-1">{store.address}</span>
                            </p>
                            {store.phone && (
                              <p className="text-xs text-slate-400 font-semibold flex items-center gap-1.5">
                                <i className="fa-solid fa-phone text-nm/40 text-[10px]" />
                                {store.phone}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-700">
                      {filteredAdminStores.map((store) => (
                        <div key={store.id} className="flex gap-0 group">
                          <div className="w-1 bg-nm/20 group-hover:bg-nm transition-colors shrink-0 rounded-r" />
                          <div className="flex-1 p-4 space-y-2">
                            <div className="flex items-start gap-3">
                              <div className="w-9 h-9 rounded-xl bg-nm/10 flex items-center justify-center text-nm shrink-0">
                                <i className="fa-solid fa-store text-sm" />
                              </div>
                              <div>
                                <h4 className="font-black text-slate-800 dark:text-white text-sm">{store.name}</h4>
                                <span className="inline-block mt-0.5 text-[9px] font-black text-nm uppercase tracking-widest border border-nm/30 rounded px-1.5 py-0.5 bg-nm/5">
                                  {store.code}
                                </span>
                              </div>
                            </div>
                            <p className="text-[11px] text-slate-400 flex items-start gap-1.5">
                              <i className="fa-solid fa-location-dot mt-0.5 text-nm/40 text-[10px]" />
                              {store.address}
                            </p>
                            {store.phone && (
                              <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                                <i className="fa-solid fa-phone text-nm/40 text-[10px]" />
                                {store.phone}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            /* ── Danh sách: sidebar nhân viên + lưới tuyến ── */
            <div className="flex gap-3 overflow-hidden" style={{ height: "calc(100vh - 330px)", minHeight: "520px" }}>

              {/* ── LEFT: Staff sidebar (desktop only) ── */}
              <div className="hidden md:flex w-60 xl:w-68 shrink-0 flex-col bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden shadow-sm">
                <div className="p-3.5 border-b border-slate-100 dark:border-slate-700 shrink-0">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2.5">Nhân viên</p>
                  <div className="relative">
                    <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-[9px]" />
                    <input
                      type="text"
                      placeholder="Tìm nhân viên..."
                      value={adminStaffSearch}
                      onChange={(e) => setAdminStaffSearch(e.target.value)}
                      className="pl-8 pr-3 py-2 w-full text-xs bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-600 rounded-xl focus:outline-none focus:border-nm font-medium text-slate-800 dark:text-white transition-colors"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {/* Tất cả */}
                  <button
                    onClick={() => { setSelectedAdminStaff("all"); setAdminRouteSearch(""); }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 transition-all border-l-[3px] ${
                      selectedAdminStaff === "all"
                        ? "border-nm bg-nm/[0.06] dark:bg-nm/[0.12]"
                        : "border-transparent hover:bg-slate-50 dark:hover:bg-slate-700/40"
                    }`}
                  >
                    <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center shrink-0">
                      <i className="fa-solid fa-users text-slate-400 text-[11px]" />
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <p className={`text-xs font-black truncate ${selectedAdminStaff === "all" ? "text-nm" : "text-slate-700 dark:text-slate-200"}`}>
                        Tất cả
                      </p>
                      <p className="text-[9px] text-slate-400">
                        {adminAllRoutes.length} tuyến · {adminAllRoutes.reduce((s, r) => s + (r.store_count ?? 0), 0)} điểm
                      </p>
                    </div>
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-lg shrink-0 ${
                      selectedAdminStaff === "all" ? "bg-nm text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-400"
                    }`}>
                      {adminAllRoutes.length}
                    </span>
                  </button>

                  <div className="mx-3.5 border-t border-slate-100 dark:border-slate-700/60" />

                  {filteredStaffList
                    .filter((staff) => adminAllRoutes.some((r) => Number(r.staff_id) === Number(staff.id)))
                    .map((staff) => {
                      const staffRoutes = adminAllRoutes.filter((r) => Number(r.staff_id) === Number(staff.id));
                      const routeCount = staffRoutes.length;
                      const storeCount = staffRoutes.reduce((s, r) => s + (r.store_count ?? 0), 0);
                      const isSelected = Number(selectedAdminStaff) === Number(staff.id);
                      return (
                        <button
                          key={staff.id}
                          onClick={() => { setSelectedAdminStaff(Number(staff.id)); setAdminRouteSearch(""); }}
                          className={`w-full flex items-center gap-3 px-3.5 py-2.5 transition-all border-l-[3px] ${
                            isSelected
                              ? "border-nm bg-nm/[0.06] dark:bg-nm/[0.12]"
                              : "border-transparent hover:bg-slate-50 dark:hover:bg-slate-700/40"
                          }`}
                        >
                          <img
                            src={getUserAvatar(staff.fullName, staff.avatar)}
                            onError={(e) => { e.currentTarget.src = getUserAvatar(staff.fullName); }}
                            className="w-8 h-8 rounded-xl object-cover shrink-0"
                            alt={staff.fullName}
                          />
                          <div className="flex-1 text-left min-w-0">
                            <p className={`text-xs font-black truncate ${isSelected ? "text-nm" : "text-slate-700 dark:text-slate-200"}`}>
                              {staff.fullName}
                            </p>
                            <p className="text-[9px] text-slate-400">{routeCount} tuyến · {storeCount} điểm</p>
                          </div>
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-lg shrink-0 ${
                            isSelected ? "bg-nm text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-400"
                          }`}>
                            {routeCount}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>

              {/* ── RIGHT: Routes panel ── */}
              <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

                {/* Mobile: bottom sheet trigger */}
                <button
                  onClick={() => setAdminStaffSheetOpen(true)}
                  className="md:hidden w-full flex items-center gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 mb-3 shadow-sm active:scale-[0.98] transition-transform shrink-0"
                >
                  {selectedAdminStaff === "all" ? (
                    <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center shrink-0">
                      <i className="fa-solid fa-users text-slate-400 text-sm" />
                    </div>
                  ) : (() => {
                    const _staff = adminStaffList.find((s) => Number(s.id) === Number(selectedAdminStaff));
                    return _staff ? (
                      <img
                        src={getUserAvatar(_staff.fullName, _staff.avatar)}
                        onError={(e) => { e.currentTarget.src = getUserAvatar(_staff.fullName); }}
                        className="w-9 h-9 rounded-xl object-cover shrink-0"
                        alt={_staff.fullName}
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center shrink-0">
                        <i className="fa-solid fa-user text-slate-400 text-sm" />
                      </div>
                    );
                  })()}
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Nhân viên phụ trách</p>
                    <p className="text-sm font-black text-slate-800 dark:text-white truncate">
                      {selectedAdminStaff === "all"
                        ? "Tất cả nhân viên"
                        : adminStaffList.find((s) => Number(s.id) === Number(selectedAdminStaff))?.fullName ?? ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <p className="text-[10px] font-black text-nm leading-tight">{filteredAdminRoutes.length} tuyến</p>
                      <p className="text-[9px] text-slate-400 leading-tight">
                        {filteredAdminRoutes.reduce((s, r) => s + (r.store_count ?? 0), 0)} điểm
                      </p>
                    </div>
                    <i className="fa-solid fa-chevron-down text-slate-300 text-xs" />
                  </div>
                </button>

                {/* Mobile: staff bottom sheet via portal */}
                {createPortal(
                  <AnimatePresence>
                    {adminStaffSheetOpen && (
                      <>
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          onClick={() => { setAdminStaffSheetOpen(false); setAdminStaffSearch(""); }}
                          className="fixed inset-0 bg-black/50 z-[200] md:hidden"
                        />
                        <motion.div
                          initial={{ y: "100%" }}
                          animate={{ y: 0 }}
                          exit={{ y: "100%" }}
                          transition={{ type: "spring", damping: 32, stiffness: 320 }}
                          className="fixed bottom-0 left-0 right-0 z-[201] md:hidden bg-white dark:bg-slate-900 rounded-t-[1.75rem] overflow-hidden shadow-2xl"
                          style={{ maxHeight: "78vh" }}
                        >
                          <div className="flex justify-center pt-3 pb-2">
                            <div className="w-9 h-1 rounded-full bg-slate-200 dark:bg-slate-700" />
                          </div>
                          <div className="px-5 pb-3 flex items-center justify-between">
                            <div>
                              <p className="font-black text-slate-800 dark:text-white">Chọn nhân viên</p>
                              <p className="text-[10px] text-slate-400">
                                {adminStaffList.filter((s) => adminAllRoutes.some((r) => Number(r.staff_id) === Number(s.id))).length} nhân viên có tuyến
                              </p>
                            </div>
                            <button
                              onClick={() => { setAdminStaffSheetOpen(false); setAdminStaffSearch(""); }}
                              className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center active:scale-95 transition-transform"
                            >
                              <i className="fa-solid fa-xmark text-slate-500 text-sm" />
                            </button>
                          </div>
                          <div className="px-5 pb-3">
                            <div className="relative">
                              <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 text-xs" />
                              <input
                                type="text"
                                placeholder="Tìm nhân viên..."
                                value={adminStaffSearch}
                                onChange={(e) => setAdminStaffSearch(e.target.value)}
                                className="pl-10 pr-4 py-3 w-full text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none focus:border-nm font-medium text-slate-800 dark:text-white transition-colors"
                              />
                            </div>
                          </div>
                          <div className="overflow-y-auto" style={{ maxHeight: "calc(78vh - 170px)" }}>
                            <button
                              onClick={() => { setSelectedAdminStaff("all"); setAdminRouteSearch(""); setAdminStaffSheetOpen(false); setAdminStaffSearch(""); }}
                              className={`w-full flex items-center gap-4 px-5 py-3.5 border-l-[3px] transition-colors ${
                                selectedAdminStaff === "all"
                                  ? "border-nm bg-nm/[0.06] dark:bg-nm/[0.12]"
                                  : "border-transparent active:bg-slate-50 dark:active:bg-slate-800/50"
                              }`}
                            >
                              <div className="w-11 h-11 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                                <i className="fa-solid fa-users text-slate-400 text-base" />
                              </div>
                              <div className="flex-1 text-left">
                                <p className={`font-black ${selectedAdminStaff === "all" ? "text-nm" : "text-slate-800 dark:text-white"}`}>
                                  Tất cả nhân viên
                                </p>
                                <p className="text-xs text-slate-400">
                                  {adminAllRoutes.length} tuyến · {adminAllRoutes.reduce((s, r) => s + (r.store_count ?? 0), 0)} điểm bán
                                </p>
                              </div>
                              {selectedAdminStaff === "all" && (
                                <div className="w-6 h-6 rounded-lg bg-nm flex items-center justify-center shrink-0">
                                  <i className="fa-solid fa-check text-white text-xs" />
                                </div>
                              )}
                            </button>
                            <div className="mx-5 border-t border-slate-100 dark:border-slate-800" />
                            {filteredStaffList
                              .filter((staff) => adminAllRoutes.some((r) => Number(r.staff_id) === Number(staff.id)))
                              .map((staff) => {
                                const staffRoutes = adminAllRoutes.filter((r) => Number(r.staff_id) === Number(staff.id));
                                const routeCount = staffRoutes.length;
                                const storeCount = staffRoutes.reduce((s, r) => s + (r.store_count ?? 0), 0);
                                const isSelected = Number(selectedAdminStaff) === Number(staff.id);
                                return (
                                  <button
                                    key={staff.id}
                                    onClick={() => { setSelectedAdminStaff(Number(staff.id)); setAdminRouteSearch(""); setAdminStaffSheetOpen(false); setAdminStaffSearch(""); }}
                                    className={`w-full flex items-center gap-4 px-5 py-3.5 border-l-[3px] transition-colors ${
                                      isSelected
                                        ? "border-nm bg-nm/[0.06] dark:bg-nm/[0.12]"
                                        : "border-transparent active:bg-slate-50 dark:active:bg-slate-800/50"
                                    }`}
                                  >
                                    <img
                                      src={getUserAvatar(staff.fullName, staff.avatar)}
                                      onError={(e) => { e.currentTarget.src = getUserAvatar(staff.fullName); }}
                                      className="w-11 h-11 rounded-2xl object-cover shrink-0"
                                      alt={staff.fullName}
                                    />
                                    <div className="flex-1 text-left">
                                      <p className={`font-black ${isSelected ? "text-nm" : "text-slate-800 dark:text-white"}`}>
                                        {staff.fullName}
                                      </p>
                                      <p className="text-xs text-slate-400">{routeCount} tuyến · {storeCount} điểm bán</p>
                                    </div>
                                    {isSelected ? (
                                      <div className="w-6 h-6 rounded-lg bg-nm flex items-center justify-center shrink-0">
                                        <i className="fa-solid fa-check text-white text-xs" />
                                      </div>
                                    ) : (
                                      <span className="text-xs font-black text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg shrink-0">
                                        {routeCount}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            <div style={{ height: "env(safe-area-inset-bottom, 16px)" }} />
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>,
                  document.body
                )}

                {/* Header: label + route search */}
                <div className="flex items-center gap-3 mb-3 shrink-0">
                  <div className="flex-1 min-w-0 flex items-center gap-2.5">
                    {selectedAdminStaff !== "all" && (() => {
                      const staff = adminStaffList.find((s) => Number(s.id) === Number(selectedAdminStaff));
                      return staff ? (
                        <img
                          src={getUserAvatar(staff.fullName, staff.avatar)}
                          onError={(e) => { e.currentTarget.src = getUserAvatar(staff.fullName); }}
                          className="w-8 h-8 rounded-xl object-cover shrink-0 hidden md:block"
                          alt={staff.fullName}
                        />
                      ) : null;
                    })()}
                    <div className="min-w-0">
                      <p className="font-black text-slate-800 dark:text-white text-sm truncate">
                        {selectedAdminStaff === "all"
                          ? "Tất cả tuyến đường"
                          : adminStaffList.find((s) => Number(s.id) === Number(selectedAdminStaff))?.fullName ?? ""}
                      </p>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                        {searchFilteredRoutes.length} tuyến{adminRouteSearch ? " · đã lọc" : ""}
                      </p>
                    </div>
                  </div>
                  <div className="relative w-48 shrink-0">
                    <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-[9px]" />
                    <input
                      type="text"
                      placeholder="Tìm mã, tên tuyến..."
                      value={adminRouteSearch}
                      onChange={(e) => setAdminRouteSearch(e.target.value)}
                      className="pl-8 pr-7 py-2 w-full text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl focus:outline-none focus:border-nm font-medium text-slate-800 dark:text-white transition-colors"
                    />
                    {adminRouteSearch && (
                      <button
                        onClick={() => setAdminRouteSearch("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors"
                      >
                        <i className="fa-solid fa-xmark text-[10px]" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Route cards grid — scrollable */}
                <div className="flex-1 overflow-y-auto pr-0.5">
                  {adminRoutesLoading ? (
                    <div className="flex items-center justify-center py-16 gap-3">
                      <span className="w-6 h-6 border-2 border-slate-200 border-t-nm rounded-full animate-spin" />
                      <p className="text-slate-400 text-xs font-black uppercase tracking-widest">Đang tải...</p>
                    </div>
                  ) : searchFilteredRoutes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 gap-3 opacity-30">
                      <i className="fa-solid fa-route text-5xl" />
                      <p className="text-xs font-black uppercase tracking-widest">
                        {adminRouteSearch ? "Không tìm thấy tuyến nào" : "Không có tuyến nào"}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pb-2">
                      {searchFilteredRoutes.map((route) => {
                        const staffObj = adminStaffList.find((u) => Number(u.id) === Number(route.staff_id));
                        const staffName = staffObj?.fullName ?? route.staffFullName ?? "—";
                        return (
                          <motion.div
                            key={route.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.15 }}
                            onClick={() => { setAdminSelectedRoute(route); fetchAdminRouteStores(route.id); }}
                            className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl p-4 hover:-translate-y-0.5 hover:shadow-md hover:border-nm/20 dark:hover:border-nm/30 transition-all duration-200 cursor-pointer group"
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-9 h-9 bg-nm/10 rounded-xl text-nm group-hover:bg-nm group-hover:text-white transition-all flex items-center justify-center shrink-0">
                                  <i className="fa-solid fa-route text-sm" />
                                </div>
                                <div className="min-w-0">
                                  <h3 className="font-black text-slate-800 dark:text-white text-sm leading-snug line-clamp-1">
                                    {route.name}
                                  </h3>
                                  <span className="text-[9px] font-black text-nm uppercase tracking-widest">
                                    {route.code}
                                  </span>
                                </div>
                              </div>
                              <i className="fa-solid fa-chevron-right text-slate-200 dark:text-slate-600 group-hover:text-nm text-[10px] transition-colors shrink-0 mt-1 ml-2" />
                            </div>
                            <div className="space-y-1.5 pt-3 border-t border-slate-50 dark:border-slate-700">
                              <div className="flex justify-between items-center">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wide">Tỉnh thành</span>
                                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 truncate max-w-[55%] text-right">
                                  {route.province_name}
                                </span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wide">Điểm bán</span>
                                <span className="text-[11px] font-black text-emerald-500">{route.store_count ?? 0} điểm</span>
                              </div>
                              {selectedAdminStaff === "all" && (
                                <div className="flex items-center justify-end gap-1.5 pt-1.5 border-t border-slate-50 dark:border-slate-700/50">
                                  {staffObj ? (
                                    <img
                                      src={getUserAvatar(staffObj.fullName, staffObj.avatar)}
                                      onError={(e) => { e.currentTarget.src = getUserAvatar(staffObj.fullName); }}
                                      className="w-4 h-4 rounded-md object-cover shrink-0"
                                      alt={staffName}
                                    />
                                  ) : null}
                                  <span className="text-[10px] font-bold text-nm truncate max-w-[140px]">{staffName}</span>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Modals ─────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {coordDropOpen && coordDropRect && (
          <DropdownPortal
            options={coordFilterOpts}
            value={storeCoordFilter}
            anchorRect={coordDropRect}
            onClose={() => setCoordDropOpen(false)}
            onSelect={(v) => {
              const val = v as "" | "yes" | "no";
              setStoreCoordFilter(val);
              fetchStores(1, storeSearch, val);
            }}
          />
        )}

        {coordModal && (
          <CoordModal
            store={coordModal}
            onSave={handleSaveCoords}
            onClose={() => setCoordModal(null)}
            loading={coordSaving}
          />
        )}

        {deleteStore && (
          <ConfirmDelete
            label={`Xóa điểm bán «${deleteStore.name}» (${deleteStore.store_code})? Toàn bộ đơn hàng liên quan cũng sẽ bị xóa.`}
            onConfirm={handleDeleteStore}
            onCancel={() => setDeleteStore(null)}
            loading={deletingStore}
          />
        )}

        {detailOrderId && !deleteOrder && (
          <OrderDetailSheet
            orderId={detailOrderId}
            onClose={() => setDetailOrderId(null)}
            onDelete={(o) => { setDeleteOrder(o); }}
          />
        )}

        {deleteOrder && (
          <ConfirmDelete
            label={`Xóa đơn hàng ${deleteOrder.order_code} của «${deleteOrder.store_name}» (${fmtDate(deleteOrder.created_at)})?`}
            onConfirm={handleDeleteOrder}
            onCancel={() => setDeleteOrder(null)}
            loading={deletingOrder}
          />
        )}
        {forceDeleteItem && (
          <ConfirmForceDelete
            label={forceDeleteItem.label}
            onConfirm={handleForceDelete}
            onCancel={() => setForceDeleteItem(null)}
            loading={forceDeleting}
          />
        )}
        {restoreStoreBlockedBy && (
          <BottomModal onClose={() => setRestoreStoreBlockedBy(null)} maxWidth="max-w-md">
            {/* Header */}
            <div className="relative overflow-hidden rounded-t-[2rem] bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 dark:from-slate-900 dark:via-slate-800 dark:to-amber-950 px-5 pt-5 pb-6 border-b border-amber-100 dark:border-white/[0.06]">
              <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-amber-300/20 dark:bg-amber-500/10 blur-3xl pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-28 h-28 rounded-full bg-orange-300/15 dark:bg-orange-600/10 blur-2xl pointer-events-none" />
              <div className="relative flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-500/20 border border-amber-300/60 dark:border-amber-400/30 flex items-center justify-center shrink-0 mt-0.5">
                  <i className="fa-solid fa-triangle-exclamation text-amber-600 dark:text-amber-400 text-sm" />
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.25em] text-amber-600/60 dark:text-amber-400/60 mb-0.5">Xác nhận khôi phục</p>
                  <h3 className="text-slate-800 dark:text-white font-black text-base leading-snug">Tuyến liên kết đang trong thùng rác</h3>
                </div>
              </div>
              {/* Relationship diagram */}
              <div className="relative flex flex-col gap-0.5">
                {/* Store — requested */}
                <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-400/[0.07] border border-emerald-200 dark:border-emerald-400/20 rounded-xl px-3 py-2.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 border border-emerald-200 dark:border-emerald-500/20 flex items-center justify-center shrink-0">
                    <i className="fa-solid fa-store text-emerald-600 dark:text-emerald-400 text-[10px]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-700 dark:text-white/90 font-bold text-xs truncate">{restoreStoreBlockedBy.store.name}</p>
                    <p className="text-[9px] text-slate-400 dark:text-white/35 font-semibold uppercase tracking-wider">{restoreStoreBlockedBy.store.store_code}</p>
                  </div>
                  <span className="shrink-0 text-[8px] font-black uppercase tracking-widest bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-400/25 rounded-full px-2 py-0.5">Điểm bán</span>
                </div>
                {/* Connector — upward link */}
                <div className="flex items-center gap-1.5 pl-3">
                  <div className="flex flex-col items-center w-7 shrink-0 gap-0.5 py-0.5">
                    <span className="w-0.5 h-2 bg-slate-300 dark:bg-white/20 rounded-full" />
                    <i className="fa-solid fa-arrow-up text-amber-500 dark:text-amber-400 text-[8px]" />
                    <span className="w-0.5 h-2 bg-slate-300 dark:bg-white/20 rounded-full" />
                  </div>
                  <p className="text-[9px] font-bold text-amber-600/70 dark:text-amber-400/60 uppercase tracking-wider">thuộc tuyến</p>
                </div>
                {/* Route — in trash */}
                <div className="flex items-center gap-3 bg-white/70 dark:bg-white/[0.06] border border-rose-200/80 dark:border-rose-400/20 rounded-xl px-3 py-2.5">
                  <div className="w-7 h-7 rounded-lg bg-rose-100 dark:bg-rose-500/20 border border-rose-200 dark:border-rose-500/20 flex items-center justify-center shrink-0">
                    <i className="fa-solid fa-route text-rose-500 dark:text-rose-400 text-[10px]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-700 dark:text-white/90 font-bold text-xs truncate">{restoreStoreBlockedBy.route.name}</p>
                    <p className="text-[9px] text-slate-400 dark:text-white/35 font-semibold uppercase tracking-wider">{restoreStoreBlockedBy.route.code}</p>
                  </div>
                  <span className="shrink-0 text-[8px] font-black uppercase tracking-widest bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-400/25 rounded-full px-2 py-0.5">
                    <i className="fa-solid fa-trash-can mr-1" />
                    Thùng rác
                  </span>
                </div>
              </div>
            </div>
            {/* Body */}
            <div className="px-5 pt-4 pb-5 flex flex-col gap-3.5">
              {/* Info callout */}
              <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-500/10 border border-amber-200/70 dark:border-amber-400/20 rounded-2xl px-4 py-3">
                <i className="fa-solid fa-circle-info text-amber-500 dark:text-amber-400 text-sm mt-0.5 shrink-0" />
                <p className="text-[12px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  Tuyến <span className="font-bold text-slate-800 dark:text-white">«{restoreStoreBlockedBy.route.name}»</span> vẫn đang trong thùng rác.{" "}
                  Xác nhận sẽ khôi phục <span className="font-bold text-emerald-600 dark:text-emerald-400">điểm bán này</span> và <span className="font-bold text-emerald-600 dark:text-emerald-400">tuyến liên kết</span> — các điểm bán khác trên tuyến vẫn giữ nguyên trong thùng rác.
                </p>
              </div>
              <div className="flex flex-col gap-2 pt-0.5">
                <button
                  onClick={() => handleRestoreRouteAndStore(restoreStoreBlockedBy.route, restoreStoreBlockedBy.store)}
                  disabled={restoringId !== null}
                  className="w-full h-11 bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-white rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:pointer-events-none"
                >
                  {restoringId !== null
                    ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" />
                    : <span className="flex items-center justify-center gap-2"><i className="fa-solid fa-rotate-left" />Xác nhận khôi phục</span>}
                </button>
                <button
                  onClick={() => setRestoreStoreBlockedBy(null)}
                  disabled={restoringId !== null}
                  className="w-full h-9 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-colors disabled:opacity-40"
                >
                  Hủy bỏ
                </button>
              </div>
            </div>
          </BottomModal>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminPanel;
