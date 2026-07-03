import React, { useState, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { API_BASE } from "../constants";
import { useToast } from "../hooks/useToast";
import { SalesReport, User } from "../types";
import CustomDatePicker from "../components/ui/CustomDatePicker";

type Scope = "self" | "direct" | "all";

const ALL_SCOPES: { value: Scope; label: string; icon: string }[] = [
  { value: "self", label: "Của tôi", icon: "fa-user" },
  { value: "direct", label: "Cấp trực tiếp", icon: "fa-users" },
  { value: "all", label: "Toàn bộ cấp dưới", icon: "fa-sitemap" },
];

const ROLES_WITH_SUBORDINATES: string[] = ["supervisor", "regional_director", "director", "admin"];

// Dùng local date thay vì toISOString() để tránh lệch múi giờ UTC+7
const fmtLocal = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const getDefaultRange = () => {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: fmtLocal(from), to: fmtLocal(now) };
};

interface OrderGroup {
  key: string;
  order_code?: string;
  store_name?: string;
  sold_by: string;
  date: string;
  items: SalesReport[];
  totalAmount: number;
  totalQty: number;
}

interface Props { currentUser?: User | null; }

const ReportsPage: React.FC<Props> = ({ currentUser }) => {
  const hasSubordinates = ROLES_WITH_SUBORDINATES.includes(currentUser?.role ?? "");
  const visibleScopes = hasSubordinates ? ALL_SCOPES : ALL_SCOPES.slice(0, 1);

  const [reports, setReports] = useState<SalesReport[]>([]);
  const [serverTotals, setServerTotals] = useState({ amount: 0, qty: 0, orders: 0 });
  const [loading, setLoading] = useState(false);
  const [scope, setScope] = useState<Scope>(hasSubordinates ? "all" : "self");
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<OrderGroup | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const { showToast } = useToast();

  const defaultRange = getDefaultRange();
  const [fromDate, setFromDate] = useState(defaultRange.from);
  const [toDate, setToDate] = useState(defaultRange.to);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem("access_token");
    const params = new URLSearchParams({ scope, date_from: fromDate, date_to: toDate });
    try {
      const res = await fetch(`${API_BASE}/reports/sales-by-subordinates?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setReports(Array.isArray(data) ? data : (data.data ?? []));
        if (!Array.isArray(data)) {
          setServerTotals({
            amount: data.total_amount ?? 0,
            qty: data.total_qty ?? 0,
            orders: data.total_orders ?? 0,
          });
        }
      } else {
        showToast("Lỗi tải báo cáo", "danger");
      }
    } catch {
      showToast("Lỗi tải báo cáo", "danger");
    } finally {
      setLoading(false);
    }
  }, [scope, fromDate, toDate, showToast]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const applyPreset = (preset: "today" | "week" | "month") => {
    const now = new Date();
    if (preset === "today") {
      const t = fmtLocal(now);
      setFromDate(t);
      setToDate(t);
    } else if (preset === "week") {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay() + 1);
      setFromDate(fmtLocal(startOfWeek));
      setToDate(fmtLocal(now));
    } else {
      setFromDate(fmtLocal(new Date(now.getFullYear(), now.getMonth(), 1)));
      setToDate(fmtLocal(now));
    }
  };

  const filtered = reports.filter((r) =>
    search
      ? r.sold_by.toLowerCase().includes(search.toLowerCase()) ||
        (r.store_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (r.order_code ?? "").toLowerCase().includes(search.toLowerCase())
      : true
  );

  // ── Nhóm theo order_code ──────────────────────────────────────
  const groupedOrders = useMemo<OrderGroup[]>(() => {
    const map = new Map<string, OrderGroup>();
    filtered.forEach((r, i) => {
      const key = r.order_code ?? `__row_${i}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          order_code: r.order_code,
          store_name: r.store_name,
          sold_by: r.sold_by,
          date: r.date,
          items: [],
          totalAmount: 0,
          totalQty: 0,
        });
      }
      const g = map.get(key)!;
      g.items.push(r);
      g.totalAmount += r.amount;
      g.totalQty += r.qty;
    });
    return Array.from(map.values());
  }, [filtered]);


  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // ── Detail view (mobile) ──────────────────────────────────────
  if (selectedOrder) {
    const order = selectedOrder;
    return (
      <motion.div
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0 }}
        className="space-y-4"
      >
        {/* Back header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedOrder(null)}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-nm/10 hover:text-nm transition-all"
          >
            <i className="fa-solid fa-chevron-left" />
          </button>
          <div>
            <h3 className="font-black text-slate-800 dark:text-white text-base">Chi tiết đơn hàng</h3>
            <p className="text-xs text-slate-400 font-semibold">
              {new Date(order.date).toLocaleDateString("vi-VN", {
                weekday: "long", day: "2-digit", month: "2-digit", year: "numeric",
              })}
            </p>
          </div>
        </div>

        {/* Order info card */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 overflow-hidden shadow-sm">
          {/* Top band */}
          <div className="bg-nm/10 dark:bg-nm/5 px-6 py-4 border-b border-nm/20">
            {order.order_code && (
              <p className="text-[10px] font-black uppercase tracking-widest text-nm mb-1 flex items-center gap-1.5">
                <i className="fa-solid fa-file-invoice" />
                {order.order_code}
              </p>
            )}
            <h2 className="font-black text-slate-800 dark:text-white text-lg leading-tight">
              {order.store_name ?? "—"}
            </h2>
          </div>

          <div className="p-6 space-y-0">
            {/* NV */}
            <div className="flex items-center justify-between py-3 border-b border-slate-50 dark:border-slate-700">
              <span className="text-xs font-black uppercase tracking-widest text-slate-400">Nhân viên</span>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-700 text-xs font-black text-slate-700 dark:text-slate-200">
                <i className="fa-solid fa-user text-[10px] text-nm" />
                {order.sold_by}
              </span>
            </div>

            {/* Date */}
            <div className="flex items-center justify-between py-3 border-b border-slate-50 dark:border-slate-700">
              <span className="text-xs font-black uppercase tracking-widest text-slate-400">Ngày giao dịch</span>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                {new Date(order.date).toLocaleDateString("vi-VN")}
              </span>
            </div>

            {/* Items list header */}
            <div className="pt-4 pb-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Sản phẩm trong đơn ({order.items.length})
              </p>
            </div>

            {/* Items */}
            <div className="space-y-2">
              {order.items.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-700/40"
                >
                  {/* Product image */}
                  <div className="w-14 h-14 flex-shrink-0 rounded-xl overflow-hidden bg-white border border-slate-100 dark:border-slate-600 flex items-center justify-center">
                    {item.product_image ? (
                      <img
                        src={`${API_BASE}${item.product_image}`}
                        alt={item.product_name}
                        className="w-full h-full object-contain"
                        onError={(e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.display = "none"; }}
                      />
                    ) : (
                      <i className="fa-solid fa-image text-slate-300 text-xl" />
                    )}
                  </div>
                  {/* Product info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-black text-slate-800 dark:text-white text-sm leading-tight truncate">
                        {item.product_name}
                      </p>
                      {item.is_promo && (
                        <span className="flex-shrink-0 text-[9px] font-black text-green-600 bg-green-100 dark:bg-green-900/40 px-2 py-0.5 rounded-lg uppercase tracking-wide flex items-center gap-1">
                          <i className="fa-solid fa-gift" /> KM
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mt-0.5 block">
                      {item.category}
                    </span>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="font-black text-nm text-sm">
                      {item.amount >= 1_000_000
                        ? (item.amount / 1_000_000).toFixed(1) + "tr"
                        : item.amount.toLocaleString("vi-VN") + "đ"}
                    </p>
                    <p className="text-[10px] font-bold text-blue-500 mt-0.5">SL: {item.qty}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-700">
            <div className="p-5 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-xs font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                  Tổng cộng
                </span>
                <p className="text-[10px] text-emerald-500 font-semibold mt-0.5">
                  {order.totalQty.toLocaleString("vi-VN")} sản phẩm
                </p>
              </div>
              <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                {order.totalAmount.toLocaleString("vi-VN")}đ
              </span>
            </div>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-center justify-between select-none">
        <div>
          <h3 className="text-xl md:text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tight leading-tight">
            Báo cáo doanh số
          </h3>
          <p className="text-slate-500 font-semibold text-xs md:text-sm">
            Lịch sử đơn hàng đa cấp bậc
          </p>
        </div>
        <button
          onClick={fetchReports}
          disabled={loading}
          className="w-10 h-10 md:w-auto md:h-auto md:px-5 md:py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? (
            <i className="fa-solid fa-spinner animate-spin" />
          ) : (
            <i className="fa-solid fa-arrows-rotate" />
          )}
          <span className="hidden md:inline">{loading ? "Đang tải..." : "Làm mới"}</span>
        </button>
      </div>

      {/* ── Filters ── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 space-y-3">

        {/* Scope */}
        {visibleScopes.length > 1 && (
          <div className={`grid grid-cols-${visibleScopes.length} gap-2`}>
            {visibleScopes.map((s) => (
              <button
                key={s.value}
                onClick={() => setScope(s.value)}
                className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${
                  scope === s.value
                    ? "bg-nm text-white shadow-md"
                    : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
                }`}
              >
                <i className={`fa-solid ${s.icon} text-[10px]`} />
                <span className="hidden sm:inline">{s.label}</span>
                <span className="sm:hidden">
                  {s.value === "self" ? "Tôi" : s.value === "direct" ? "Trực tiếp" : "Tất cả"}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Date pickers */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="w-full sm:w-44">
            <CustomDatePicker value={fromDate} onChange={setFromDate} placeholder="Từ ngày" />
          </div>
          <span className="hidden sm:block text-slate-400 font-bold text-sm flex-shrink-0">—</span>
          <div className="w-full sm:w-44">
            <CustomDatePicker value={toDate} onChange={setToDate} placeholder="Đến ngày" />
          </div>
        </div>

        {/* Presets */}
        <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {[
            { key: "today" as const, label: "Hôm nay" },
            { key: "week" as const, label: "Tuần này" },
            { key: "month" as const, label: "Tháng này" },
          ].map((p) => (
            <button
              key={p.key}
              onClick={() => applyPreset(p.key)}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-nm/10 hover:text-nm transition-all"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full">
          <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm nhân viên, cửa hàng, mã đơn..."
            className="w-full pl-7 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-xs font-semibold focus:outline-none focus:border-nm"
          />
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-3 gap-2 md:gap-4">
        {[
          {
            label: "Doanh thu",
            value: serverTotals.amount >= 1_000_000
              ? (serverTotals.amount / 1_000_000).toFixed(1) + "tr"
              : serverTotals.amount.toLocaleString("vi-VN") + "đ",
            fullValue: serverTotals.amount.toLocaleString("vi-VN") + "đ",
            icon: "fa-sack-dollar",
            color: "text-emerald-500",
            bg: "bg-emerald-50 dark:bg-emerald-900/20",
          },
          {
            label: "Sản lượng",
            value: serverTotals.qty.toLocaleString("vi-VN"),
            fullValue: serverTotals.qty.toLocaleString("vi-VN"),
            icon: "fa-boxes-stacked",
            color: "text-blue-500",
            bg: "bg-blue-50 dark:bg-blue-900/20",
          },
          {
            label: "Đơn hàng",
            value: serverTotals.orders.toLocaleString("vi-VN"),
            fullValue: serverTotals.orders.toLocaleString("vi-VN"),
            icon: "fa-receipt",
            color: "text-nm",
            bg: "bg-nm-50 dark:bg-nm-900/20",
          },
        ].map((card) => (
          <div
            key={card.label}
            className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-3 md:p-5"
          >
            <div className={`w-8 h-8 md:w-11 md:h-11 rounded-xl ${card.bg} flex items-center justify-center mb-2`}>
              <i className={`fa-solid ${card.icon} ${card.color} text-sm md:text-base`} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 select-none truncate">
              {card.label}
            </p>
            <p className={`text-sm md:text-xl font-black ${card.color} mt-0.5 truncate`} title={card.fullValue}>
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* ── List ── */}
      <div className="space-y-2">
        {loading ? (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-16 text-center">
            <i className="fa-solid fa-spinner animate-spin text-nm text-2xl block mb-3" />
            <p className="text-slate-400 font-bold text-sm">Đang tải báo cáo...</p>
          </div>
        ) : groupedOrders.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-16 text-center">
            <i className="fa-solid fa-chart-bar text-5xl text-slate-200 dark:text-slate-600 block mb-3" />
            <p className="text-slate-400 font-black uppercase tracking-widest text-xs">Không có dữ liệu</p>
          </div>
        ) : (
          <>
            {/* ── Mobile: order card list ── */}
            <div className="md:hidden space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">
                {groupedOrders.length} đơn hàng
              </p>
              <AnimatePresence>
                {groupedOrders.map((g, i) => (
                  <motion.button
                    key={g.key}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.02 }}
                    onClick={() => setSelectedOrder(g)}
                    className="w-full text-left bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 hover:border-nm/30 transition-all active:scale-[0.98]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Store name */}
                        <p className="font-black text-slate-800 dark:text-white text-sm leading-tight truncate">
                          {g.store_name ?? "—"}
                        </p>
                        {/* Badges */}
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          {g.order_code && (
                            <span className="text-[10px] font-black text-nm bg-nm/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <i className="fa-solid fa-file-invoice text-[9px]" />
                              {g.order_code}
                            </span>
                          )}
                          <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                            <i className="fa-solid fa-user text-[9px]" />
                            {g.sold_by}
                          </span>
                        </div>
                        {/* Date + item count */}
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="text-[10px] text-slate-400 font-semibold">
                            {new Date(g.date).toLocaleDateString("vi-VN")}
                          </span>
                          <span className="text-[10px] font-black text-blue-500 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-lg">
                            {g.items.length} sản phẩm · SL: {g.totalQty}
                          </span>
                        </div>
                      </div>

                      <div className="flex-shrink-0 flex flex-col items-end gap-1">
                        <span className="font-black text-nm text-base">
                          {g.totalAmount >= 1_000_000
                            ? (g.totalAmount / 1_000_000).toFixed(1) + "tr"
                            : g.totalAmount.toLocaleString("vi-VN") + "đ"}
                        </span>
                        <i className="fa-solid fa-chevron-right text-slate-300 text-xs" />
                      </div>
                    </div>
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>

            {/* ── Desktop: expandable grouped table ── */}
            <div className="hidden md:block bg-white dark:bg-slate-800 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-slate-900/50 select-none">
                      <th className="px-6 py-5 w-8" />
                      <th className="px-6 py-5">Đơn hàng</th>
                      <th className="px-6 py-5">Cửa hàng</th>
                      <th className="px-6 py-5">NV Bán hàng</th>
                      <th className="px-6 py-5">Sản phẩm</th>
                      <th className="px-6 py-5">Tổng SL</th>
                      <th className="px-6 py-5">Tổng tiền</th>
                      <th className="px-6 py-5 text-right">Ngày</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedOrders.map((g) => {
                      const isExpanded = expandedKeys.has(g.key);
                      return (
                        <React.Fragment key={g.key}>
                          {/* Order header row */}
                          <tr
                            className="border-t border-slate-50 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors cursor-pointer"
                            onClick={() => toggleExpand(g.key)}
                          >
                            {/* Expand toggle */}
                            <td className="px-6 py-4">
                              <span className={`w-6 h-6 rounded-lg flex items-center justify-center bg-slate-100 dark:bg-slate-700 text-slate-500 transition-transform ${isExpanded ? "rotate-90" : ""}`}>
                                <i className="fa-solid fa-chevron-right text-[10px]" />
                              </span>
                            </td>
                            <td className="px-6 py-4 select-none">
                              {g.order_code ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-nm/10 text-xs font-black text-nm">
                                  <i className="fa-solid fa-file-invoice text-[10px]" />
                                  {g.order_code}
                                </span>
                              ) : <span className="text-slate-300 text-xs">—</span>}
                            </td>
                            <td className="px-6 py-4 font-bold text-slate-800 dark:text-white select-none">
                              {g.store_name ? (
                                <span className="flex items-center gap-1.5">
                                  <i className="fa-solid fa-store text-[10px] text-nm" />
                                  {g.store_name}
                                </span>
                              ) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-6 py-4 select-none">
                              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-xs font-black text-slate-600 dark:text-slate-300">
                                <i className="fa-solid fa-user text-[10px]" />
                                {g.sold_by}
                              </span>
                            </td>
                            <td className="px-6 py-4 select-none">
                              <span className="text-xs font-black text-blue-500 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded-lg">
                                {g.items.length} sản phẩm
                              </span>
                            </td>
                            <td className="px-6 py-4 font-bold text-slate-600 dark:text-slate-300 select-none">
                              {g.totalQty.toLocaleString("vi-VN")}
                            </td>
                            <td className="px-6 py-4 font-black text-nm select-none">
                              {g.totalAmount.toLocaleString("vi-VN")}đ
                            </td>
                            <td className="px-6 py-4 text-right text-xs text-slate-400 font-semibold select-none">
                              {new Date(g.date).toLocaleDateString("vi-VN")}
                            </td>
                          </tr>

                          {/* Expanded: product sub-rows */}
                          {isExpanded && g.items.map((item, idx) => (
                            <tr
                              key={idx}
                              className="bg-slate-50/70 dark:bg-slate-700/20 border-t border-slate-100 dark:border-slate-700/50"
                            >
                              {/* indent */}
                              <td className="px-6 py-3" />
                              <td className="px-6 py-3" colSpan={2}>
                                <div className="flex items-center gap-3 pl-4 border-l-2 border-nm/30">
                                  {/* Product image */}
                                  <div className="w-10 h-10 flex-shrink-0 rounded-lg overflow-hidden bg-white border border-slate-100 dark:border-slate-600 flex items-center justify-center">
                                    {item.product_image ? (
                                      <img
                                        src={`${API_BASE}${item.product_image}`}
                                        alt={item.product_name}
                                        className="w-full h-full object-contain"
                                        onError={(e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.display = "none"; }}
                                      />
                                    ) : (
                                      <i className="fa-solid fa-image text-slate-300 text-sm" />
                                    )}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-1.5">
                                      <p className="font-bold text-slate-700 dark:text-slate-200 text-sm">
                                        {item.product_name}
                                      </p>
                                      {item.is_promo && (
                                        <span className="flex-shrink-0 text-[9px] font-black text-green-600 bg-green-100 dark:bg-green-900/40 px-2 py-0.5 rounded-lg uppercase tracking-wide flex items-center gap-1">
                                          <i className="fa-solid fa-gift" /> KM
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                      {item.category}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-3" />
                              <td className="px-6 py-3" />
                              <td className="px-6 py-3 text-sm font-bold text-slate-600 dark:text-slate-300 select-none">
                                {item.qty.toLocaleString("vi-VN")}
                              </td>
                              <td className="px-6 py-3 font-black text-nm/80 select-none text-sm">
                                {item.amount.toLocaleString("vi-VN")}đ
                              </td>
                              <td className="px-6 py-3" />
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-8 py-3 border-t border-slate-100 dark:border-slate-700 text-xs font-black text-slate-400 uppercase tracking-widest select-none">
                Tổng {serverTotals.orders.toLocaleString("vi-VN")} đơn hàng · hiển thị {groupedOrders.length} đơn · {filtered.length} dòng sản phẩm
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ReportsPage;
