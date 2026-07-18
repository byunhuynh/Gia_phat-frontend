import React, { useCallback, useEffect, useState } from "react";
import { apiFetchWithRefresh } from "../services/api";
import { useToast } from "../hooks/useToast";

interface AccountingOrder {
  id: number;
  order_code: string;
  created_at: string;
  staff_name: string;
  store_name: string;
  store_code: string;
  total_amount: number;
  item_count: number;
  total_qty: number;
  is_paid: boolean;
}

const money = (value: number) => `${Number(value || 0).toLocaleString("vi-VN")} ₫`;

const OrderList: React.FC = () => {
  const { showToast } = useToast();
  const [orders, setOrders] = useState<AccountingOrder[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: "1", page_size: "100" });
      if (search.trim()) params.set("search", search.trim());
      const res = await apiFetchWithRefresh(`/admin/orders?${params}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setOrders(json.data || []);
    } catch {
      showToast("Không thể tải danh sách đơn hàng", "danger");
    } finally {
      setLoading(false);
    }
  }, [search, showToast]);

  useEffect(() => {
    const timer = window.setTimeout(fetchOrders, search.trim() ? 350 : 0);
    return () => window.clearTimeout(timer);
  }, [fetchOrders, search]);

  const togglePayment = async (order: AccountingOrder) => {
    if (updatingId !== null) return;
    const next = !order.is_paid;
    setUpdatingId(order.id);
    setOrders((prev) => prev.map((item) => item.id === order.id ? { ...item, is_paid: next } : item));
    try {
      const res = await apiFetchWithRefresh(`/admin/orders/${order.id}/payment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_paid: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOrders((prev) => prev.map((item) => item.id === order.id ? { ...item, is_paid: order.is_paid } : item));
        showToast(json.message || "Không thể cập nhật thanh toán", "danger");
        return;
      }
      showToast(next ? `Đã xác nhận thanh toán ${order.order_code}` : `Đã bỏ xác nhận ${order.order_code}`, "success");
    } catch {
      setOrders((prev) => prev.map((item) => item.id === order.id ? { ...item, is_paid: order.is_paid } : item));
      showToast("Lỗi kết nối", "danger");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-8 bg-slate-50 dark:bg-slate-950">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-800 dark:text-white">Danh sách đơn hàng</h1>
            <p className="text-sm text-slate-400 mt-1">Theo dõi và xác nhận các đơn đã thanh toán.</p>
          </div>
          <div className="relative w-full sm:w-80">
            <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm mã đơn, người tạo..." className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none focus:border-nm font-bold text-sm" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-[10px] uppercase tracking-widest text-slate-400">
                <tr>
                  <th className="p-4 w-16 text-center">Đã thu</th>
                  <th className="p-4 text-left">Mã đơn hàng</th>
                  <th className="p-4 text-left">Ngày tạo</th>
                  <th className="p-4 text-left">Người tạo</th>
                  <th className="p-4 text-left">Điểm bán</th>
                  <th className="p-4 text-center">Sản phẩm</th>
                  <th className="p-4 text-right">Số tiền thanh toán</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr><td colSpan={7} className="p-12 text-center text-slate-400"><i className="fa-solid fa-spinner animate-spin" /></td></tr>
                ) : orders.length === 0 ? (
                  <tr><td colSpan={7} className="p-12 text-center text-slate-400">Không có đơn hàng.</td></tr>
                ) : orders.map((order) => (
                  <tr key={order.id} className={order.is_paid ? "bg-emerald-50/50 dark:bg-emerald-900/10" : "hover:bg-slate-50 dark:hover:bg-slate-800/30"}>
                    <td className="p-4 text-center">
                      <input type="checkbox" checked={order.is_paid} disabled={updatingId === order.id} onChange={() => togglePayment(order)} className="w-5 h-5 accent-emerald-600 cursor-pointer disabled:opacity-50" aria-label={`Thanh toán ${order.order_code}`} />
                    </td>
                    <td className="p-4 font-black text-nm">{order.order_code}</td>
                    <td className="p-4 text-sm text-slate-500">{new Date(order.created_at).toLocaleString("vi-VN")}</td>
                    <td className="p-4 font-bold text-slate-700 dark:text-slate-200">{order.staff_name}</td>
                    <td className="p-4"><div className="font-bold text-slate-700 dark:text-slate-200">{order.store_name}</div><div className="text-xs text-slate-400">{order.store_code}</div></td>
                    <td className="p-4 text-center text-sm font-bold text-slate-500">{order.item_count} mặt hàng · {order.total_qty}</td>
                    <td className="p-4 text-right font-black text-slate-800 dark:text-white">{money(order.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderList;
