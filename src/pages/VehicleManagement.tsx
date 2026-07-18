import React, { useCallback, useEffect, useState } from "react";
import { apiFetchWithRefresh } from "../services/api";
import { Vehicle } from "../types";
import { useToast } from "../hooks/useToast";

const VehicleManagement: React.FC = () => {
  const { showToast } = useToast();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [plateNumber, setPlateNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetchWithRefresh("/vehicles");
      if (!res.ok) throw new Error();
      setVehicles(await res.json());
    } catch {
      showToast("Không thể tải danh sách xe", "danger");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchVehicles();
  }, [fetchVehicles]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    const plate = plateNumber.trim().toUpperCase();
    if (!plate || submitting) return;

    setSubmitting(true);
    try {
      const res = await apiFetchWithRefresh("/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plate_number: plate }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(json.message || "Không thể tạo xe", "danger");
        return;
      }
      setVehicles((prev) => [...prev, json].sort((a, b) => a.code.localeCompare(b.code)));
      setPlateNumber("");
      showToast(`Đã tạo xe ${json.code}`, "success");
    } catch {
      showToast("Lỗi kết nối", "danger");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-8 bg-slate-50 dark:bg-slate-950">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-800 dark:text-white">Quản lý xe</h1>
          <p className="text-sm text-slate-400 mt-1">Tạo xe để nhân viên lựa chọn khi lập tuyến.</p>
        </div>

        <form onSubmit={handleCreate} className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-7 shadow-sm border border-slate-100 dark:border-slate-800">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Biển số xe *</label>
          <div className="flex flex-col sm:flex-row gap-3 mt-2">
            <div className="relative flex-1">
              <i className="fa-solid fa-car absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" />
              <input
                value={plateNumber}
                onChange={(event) => setPlateNumber(event.target.value.toUpperCase())}
                placeholder="VD: 84A-123.45"
                maxLength={20}
                className="w-full pl-14 pr-5 py-4 rounded-2xl bg-slate-50 dark:bg-slate-800 font-bold outline-none border-2 border-transparent focus:border-nm"
              />
            </div>
            <button disabled={!plateNumber.trim() || submitting} className="px-7 py-4 rounded-2xl bg-nm text-white font-black disabled:opacity-50">
              {submitting ? <i className="fa-solid fa-spinner animate-spin" /> : "Tạo xe"}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-3">Mã quản lý xe được hệ thống tự động tạo.</p>
        </form>

        <div className="bg-white dark:bg-slate-900 rounded-3xl overflow-hidden shadow-sm border border-slate-100 dark:border-slate-800">
          <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 font-black">Danh sách xe ({vehicles.length})</div>
          {loading ? (
            <div className="p-10 text-center text-slate-400"><i className="fa-solid fa-spinner animate-spin" /></div>
          ) : vehicles.length === 0 ? (
            <div className="p-10 text-center text-slate-400">Chưa có xe nào.</div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {vehicles.map((vehicle) => (
                <div key={vehicle.id} className="px-6 py-5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-2xl bg-nm/10 text-nm flex items-center justify-center"><i className="fa-solid fa-truck" /></div>
                    <div>
                      <div className="font-black text-slate-800 dark:text-white">{vehicle.plate_number}</div>
                      <div className="text-xs text-slate-400">Biển số xe</div>
                    </div>
                  </div>
                  <span className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-black text-nm">{vehicle.code}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VehicleManagement;
