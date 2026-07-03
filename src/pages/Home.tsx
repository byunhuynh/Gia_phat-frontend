import React, { useEffect, useRef, useState, useCallback } from "react";
import { Chart } from "chart.js/auto";
import { motion, AnimatePresence } from "framer-motion";
import { API_BASE, ROLE_LABELS } from "../constants";
import CustomDatePicker from "../components/ui/CustomDatePicker";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SummaryStats {
  monthly_quantity: number;
  monthly_revenue?: number;
  new_stores: number;
  coverage_rate: number;
  orders_per_day: number;
}

interface ChartData {
  labels: string[];
  values: number[];
}

interface StaffItem {
  id: number;
  full_name: string;
  role: string;
}

type Period = "weekly" | "monthly";
type Metric = "quantity" | "revenue";
type DatePreset = "" | "7days" | "30days" | "thisMonth" | "lastMonth" | "custom";
type RoleView = "" | "sales" | "supervisor" | "regional_director" | "director";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fetchWithAuth = async (url: string) => {
  const token = localStorage.getItem("access_token");
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
};

const getTokenPayload = (): { id: number; role: string } | null => {
  const token = localStorage.getItem("access_token");
  if (!token) return null;
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch {
    return null;
  }
};

const isDark = () => document.documentElement.classList.contains("dark");

const cc = () => ({
  tick: isDark() ? "#94a3b8" : "#64748b",
  grid: isDark() ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
  tooltip: isDark() ? "#1e293b" : "#ffffff",
  ttBorder: isDark() ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.10)",
  ttTitle: isDark() ? "#f1f5f9" : "#0f172a",
  ttBody: isDark() ? "#94a3b8" : "#64748b",
});

const PALETTE = [
  "#f97316",
  "#6366f1",
  "#10b981",
  "#ef4444",
  "#facc15",
  "#06b6d4",
  "#a78bfa",
  "#ec4899",
];

const fmtRevenueTick = (v: number): string => {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}tỷ`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}tr`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return `${v}`;
};

const fmtRevenueFull = (v: number): string =>
  `${v.toLocaleString("vi-VN")}₫`;

const toYMD = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const getPresetDates = (preset: DatePreset): { from: string; to: string } => {
  const today = new Date();
  const todayStr = toYMD(today);
  if (preset === "7days") {
    const d = new Date(today);
    d.setDate(d.getDate() - 6);
    return { from: toYMD(d), to: todayStr };
  }
  if (preset === "30days") {
    const d = new Date(today);
    d.setDate(d.getDate() - 29);
    return { from: toYMD(d), to: todayStr };
  }
  if (preset === "thisMonth") {
    return { from: toYMD(new Date(today.getFullYear(), today.getMonth(), 1)), to: todayStr };
  }
  if (preset === "lastMonth") {
    const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const last = new Date(today.getFullYear(), today.getMonth(), 0);
    return { from: toYMD(first), to: toYMD(last) };
  }
  return { from: "", to: "" };
};

const fmtDateVN = (iso: string): string => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

interface KPICardProps {
  label: string;
  value?: number | null;
  suffix?: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  loading?: boolean;
  isRevenue?: boolean;
}

const KPICard: React.FC<KPICardProps> = ({
  label,
  value,
  suffix = "",
  icon,
  iconBg,
  iconColor,
  loading,
  isRevenue,
}) => (
  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-5 flex flex-col gap-3 shadow-sm hover:-translate-y-0.5 transition-transform duration-200">
    <div className="flex items-center justify-between">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
        {label}
      </p>
      <span
        className={`w-9 h-9 rounded-xl flex items-center justify-center text-base ${iconBg} ${iconColor}`}
      >
        <i className={`fa-solid ${icon}`} />
      </span>
    </div>
    {loading ? (
      <div className="h-8 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
    ) : (
      <p className="text-2xl font-black text-slate-800 dark:text-white tabular-nums leading-none">
        {value !== undefined && value !== null ? (
          isRevenue ? (
            <>
              {value.toLocaleString("vi-VN", { maximumFractionDigits: 0 })}
              <span className="text-sm font-semibold text-slate-400 ml-1">₫</span>
            </>
          ) : (
            <>
              {Number.isInteger(value)
                ? value.toLocaleString("vi-VN")
                : value.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}
              {suffix && (
                <span className="text-sm font-semibold text-slate-400 ml-1">
                  {suffix}
                </span>
              )}
            </>
          )
        ) : "—"}
      </p>
    )}
    <div
      className={`h-1 rounded-full ${loading ? "bg-slate-100 dark:bg-slate-700" : iconBg}`}
    />
  </div>
);

interface ChartCardProps {
  title: string;
  subtitle?: string;
  loading?: boolean;
  empty?: boolean;
  children: React.ReactNode;
  action?: React.ReactNode;
  minH?: string;
}

const ChartCard: React.FC<ChartCardProps> = ({
  title,
  subtitle,
  loading,
  empty,
  children,
  action,
  minH = "h-52",
}) => (
  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-5 shadow-sm flex flex-col">
    <div className="flex items-start justify-between mb-4 flex-shrink-0">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          {title}
        </p>
        {subtitle && (
          <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
    {loading ? (
      <div
        className={`${minH} rounded-xl bg-slate-100 dark:bg-slate-700 animate-pulse flex-1`}
      />
    ) : empty ? (
      <div
        className={`${minH} flex flex-col items-center justify-center gap-2 text-slate-300 dark:text-slate-600 flex-1`}
      >
        <i className="fa-solid fa-chart-bar text-3xl" />
        <p className="text-xs font-black uppercase tracking-widest">
          Chưa có dữ liệu
        </p>
      </div>
    ) : (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        style={{ flex: 1 }}
      >
        {children}
      </motion.div>
    )}
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const HomePage: React.FC = () => {
  // Chart canvas refs
  const volumeRef = useRef<HTMLCanvasElement>(null);
  const brandRef = useRef<HTMLCanvasElement>(null);
  const topRef = useRef<HTMLCanvasElement>(null);
  const categoryRef = useRef<HTMLCanvasElement>(null);
  const checkinRef = useRef<HTMLCanvasElement>(null);
  const staffRef = useRef<HTMLCanvasElement>(null);

  const volumeChart = useRef<Chart | null>(null);
  const brandChart = useRef<Chart | null>(null);
  const topChart = useRef<Chart | null>(null);
  const categoryChart = useRef<Chart | null>(null);
  const checkinChart = useRef<Chart | null>(null);
  const staffChart = useRef<Chart | null>(null);

  // Chart container refs for IntersectionObserver (always in DOM)
  const volumeWrapRef = useRef<HTMLDivElement>(null);
  const brandWrapRef = useRef<HTMLDivElement>(null);
  const topWrapRef = useRef<HTMLDivElement>(null);
  const categoryWrapRef = useRef<HTMLDivElement>(null);
  const checkinWrapRef = useRef<HTMLDivElement>(null);
  const staffWrapRef = useRef<HTMLDivElement>(null);

  // Data state
  const [stats, setStats] = useState<SummaryStats | null>(null);
  const [volumeData, setVolumeData] = useState<ChartData | null>(null);
  const [brandData, setBrandData] = useState<ChartData | null>(null);
  const [topData, setTopData] = useState<ChartData | null>(null);
  const [categoryData, setCategoryData] = useState<ChartData | null>(null);
  const [checkinData, setCheckinData] = useState<ChartData | null>(null);
  const [staffPerfData, setStaffPerfData] = useState<ChartData | null>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [chartsLoading, setChartsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartInView, setChartInView] = useState({
    volume: false, brand: false, top: false,
    category: false, checkin: false, staff: false,
  });

  // Filters
  const [period, setPeriod] = useState<Period>("weekly");
  const [metric, setMetric] = useState<Metric>("quantity");
  const [datePreset, setDatePreset] = useState<DatePreset>("");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [roleView, setRoleView] = useState<RoleView>("");
  const [selectedStaff, setSelectedStaff] = useState<StaffItem | null>(null);
  const [staffList, setStaffList] = useState<StaffItem[]>([]);
  const [staffSearch, setStaffSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const payload = getTokenPayload();
  const currentRole = payload?.role ?? "";
  const isAdmin = currentRole === "admin";
  const canFilter = currentRole !== "sales";

  // Effective date range
  const effectiveDates =
    datePreset && datePreset !== "custom"
      ? getPresetDates(datePreset)
      : { from: customFrom, to: customTo };
  const hasDateFilter = !!(effectiveDates.from || effectiveDates.to);

  const isRevenue = metric === "revenue";
  const metricLabel = isRevenue ? "Doanh thu" : "Sản lượng";

  // ── Fetch staff list ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!canFilter) return;
    fetchWithAuth("/users")
      .then((data: StaffItem[]) =>
        setStaffList(Array.isArray(data) ? data : []),
      )
      .catch(() => {});
  }, [canFilter]);

  // ── Close dropdown on outside click ──────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── IntersectionObserver: trigger chart animation on viewport entry ────────
  useEffect(() => {
    const items: [React.RefObject<HTMLDivElement | null>, keyof typeof chartInView][] = [
      [volumeWrapRef, "volume"],
      [brandWrapRef, "brand"],
      [topWrapRef, "top"],
      [categoryWrapRef, "category"],
      [checkinWrapRef, "checkin"],
      [staffWrapRef, "staff"],
    ];
    const observers = items.map(([ref, key]) => {
      const el = ref.current;
      if (!el) return null;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setChartInView((prev) => ({ ...prev, [key]: true }));
            obs.disconnect();
          }
        },
        { threshold: 0.2 },
      );
      obs.observe(el);
      return obs;
    });
    return () => observers.forEach((o) => o?.disconnect());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Build query ───────────────────────────────────────────────────────────
  const buildQuery = useCallback(
    (extra: Record<string, string> = {}) => {
      const p: Record<string, string> = {};
      if (roleView) p.role_view = roleView;
      if (selectedStaff) p.staff_id = String(selectedStaff.id);
      if (isRevenue) p.metric = "revenue";
      if (effectiveDates.from) p.date_from = effectiveDates.from;
      if (effectiveDates.to) p.date_to = effectiveDates.to;
      Object.assign(p, extra);
      const qs = new URLSearchParams(p).toString();
      return qs ? `?${qs}` : "";
    },
    [roleView, selectedStaff, isRevenue, effectiveDates.from, effectiveDates.to],
  );

  // ── Load dashboard data ───────────────────────────────────────────────────
  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setChartsLoading(true);
    setError(null);
    try {
      const requests: Promise<ChartData | { stats: SummaryStats } | null>[] = [
        fetchWithAuth(`/dashboard/summary${buildQuery()}`),
        fetchWithAuth(`/dashboard/volume${buildQuery({ period })}`),
        fetchWithAuth(`/dashboard/brand-breakdown${buildQuery()}`),
        fetchWithAuth(`/dashboard/top-products${buildQuery()}`),
        fetchWithAuth(`/dashboard/category-breakdown${buildQuery()}`),
        fetchWithAuth(`/dashboard/checkin-trend${buildQuery()}`),
        selectedStaff
          ? Promise.resolve(null)
          : fetchWithAuth(`/dashboard/staff-performance${buildQuery()}`),
      ];

      const [
        summaryRes,
        volumeRes,
        brandRes,
        topRes,
        catRes,
        checkinRes,
        staffRes,
      ] = await Promise.all(requests);

      setStats((summaryRes as { stats: SummaryStats }).stats);
      setVolumeData(volumeRes as ChartData);
      setBrandData(brandRes as ChartData);
      setTopData(topRes as ChartData);
      setCategoryData(catRes as ChartData);
      setCheckinData(checkinRes as ChartData);
      setStaffPerfData(staffRes as ChartData | null);
    } catch {
      setError("Không thể tải dữ liệu. Vui lòng thử lại.");
    } finally {
      setLoading(false);
      setChartsLoading(false);
    }
  }, [period, roleView, selectedStaff, buildQuery]);

  useEffect(() => {
    loadDashboard();
    return () => {
      [
        volumeChart,
        brandChart,
        topChart,
        categoryChart,
        checkinChart,
        staffChart,
      ].forEach((r) => r.current?.destroy());
    };
  }, [loadDashboard]);

  // ── Shared chart formatters ───────────────────────────────────────────────
  const tickFmt = useCallback(
    (v: number | string) =>
      isRevenue ? fmtRevenueTick(Number(v)) : Number(v).toLocaleString("vi-VN"),
    [isRevenue],
  );

  // Biểu đồ dọc: giá trị ở parsed.y
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tooltipFmt = useCallback(
    (ctx: any) => {
      const val = Number(ctx.parsed?.y ?? ctx.raw ?? 0);
      return isRevenue
        ? ` ${fmtRevenueFull(val)}`
        : ` ${val.toLocaleString("vi-VN")}`;
    },
    [isRevenue],
  );

  // Biểu đồ ngang (indexAxis:"y"): giá trị ở parsed.x
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tooltipFmtH = useCallback(
    (ctx: any) => {
      const val = Number(ctx.parsed?.x ?? ctx.raw ?? 0);
      return isRevenue
        ? ` ${fmtRevenueFull(val)}`
        : ` ${val.toLocaleString("vi-VN")}`;
    },
    [isRevenue],
  );

  // ── Chart: Volume ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!volumeData || !volumeRef.current || !chartInView.volume) return;
    const c = cc();
    volumeChart.current?.destroy();
    volumeChart.current = new Chart(volumeRef.current, {
      type: "line",
      data: {
        labels: volumeData.labels,
        datasets: [
          {
            label: metricLabel,
            data: volumeData.values,
            borderColor: isRevenue ? "#10b981" : "#f97316",
            backgroundColor: isRevenue
              ? "rgba(16,185,129,0.08)"
              : "rgba(249,115,22,0.08)",
            borderWidth: 2.5,
            pointRadius: 3,
            pointHoverRadius: 6,
            pointBackgroundColor: isRevenue ? "#10b981" : "#f97316",
            fill: true,
            tension: 0.4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 900,
          easing: "easeInOutCubic" as const,
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: c.tooltip,
            titleColor: c.ttTitle,
            bodyColor: c.ttBody,
            borderColor: c.ttBorder,
            borderWidth: 1,
            padding: 10,
            callbacks: { label: tooltipFmt },
          },
        },
        scales: {
          x: {
            grid: { color: c.grid },
            ticks: { color: c.tick, font: { size: 10 }, maxRotation: 45 },
          },
          y: {
            grid: { color: c.grid },
            ticks: {
              color: c.tick,
              font: { size: 11 },
              callback: tickFmt,
            },
            beginAtZero: true,
          },
        },
      },
    });
  }, [volumeData, isRevenue, metricLabel, tickFmt, tooltipFmt, chartInView.volume]);

  // ── Chart: Brand ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!brandData || !brandRef.current || !chartInView.brand) return;
    if (!brandData.values.some((v: number) => v > 0)) return;
    const c = cc();
    brandChart.current?.destroy();
    brandChart.current = new Chart(brandRef.current, {
      type: "doughnut",
      data: {
        labels: brandData.labels,
        datasets: [
          {
            data: brandData.values,
            backgroundColor: PALETTE,
            borderWidth: 0,
            hoverOffset: 10,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "65%",
        animation: {
          duration: 900,
          easing: "easeInOutQuart" as const,
          animateRotate: true,
          animateScale: true,
        },
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              color: c.tick,
              padding: 12,
              font: { size: 11 },
              boxWidth: 10,
            },
          },
          tooltip: {
            backgroundColor: c.tooltip,
            titleColor: c.ttTitle,
            bodyColor: c.ttBody,
            borderColor: c.ttBorder,
            borderWidth: 1,
            callbacks: {
              label: (ctx) => {
                const val = ctx.raw as number;
                return isRevenue
                  ? ` ${fmtRevenueFull(val)}`
                  : ` ${val.toLocaleString("vi-VN")}`;
              },
            },
          },
        },
      },
    });
  }, [brandData, isRevenue, chartInView.brand]);

  // ── Chart: Top Products ───────────────────────────────────────────────────
  useEffect(() => {
    if (!topData || !topRef.current || !chartInView.top) return;
    const c = cc();
    topChart.current?.destroy();
    topChart.current = new Chart(topRef.current, {
      type: "bar",
      data: {
        labels: topData.labels,
        datasets: [
          {
            label: metricLabel,
            data: topData.values,
            backgroundColor: "rgba(99,102,241,0.7)",
            hoverBackgroundColor: "#6366f1",
            borderRadius: 6,
            borderSkipped: false,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 700,
          easing: "easeOutQuart" as const,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          delay: (ctx: any) => ctx.dataIndex * 80,
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: c.tooltip,
            titleColor: c.ttTitle,
            bodyColor: c.ttBody,
            borderColor: c.ttBorder,
            borderWidth: 1,
            callbacks: { label: tooltipFmtH },
          },
        },
        scales: {
          x: {
            grid: { color: c.grid },
            ticks: { color: c.tick, font: { size: 11 }, callback: tickFmt },
            beginAtZero: true,
          },
          y: {
            grid: { display: false },
            ticks: { color: c.tick, font: { size: 11 }, padding: 4 },
          },
        },
      },
    });
  }, [topData, isRevenue, metricLabel, tickFmt, tooltipFmtH, chartInView.top]);

  // ── Chart: Category ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!categoryData || !categoryRef.current || !chartInView.category) return;
    const c = cc();
    categoryChart.current?.destroy();
    categoryChart.current = new Chart(categoryRef.current, {
      type: "bar",
      data: {
        labels: categoryData.labels,
        datasets: [
          {
            label: metricLabel,
            data: categoryData.values,
            backgroundColor: PALETTE.map((p) => p + "bb"),
            hoverBackgroundColor: PALETTE,
            borderRadius: 8,
            borderSkipped: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 700,
          easing: "easeOutQuart" as const,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          delay: (ctx: any) => ctx.dataIndex * 60,
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: c.tooltip,
            titleColor: c.ttTitle,
            bodyColor: c.ttBody,
            borderColor: c.ttBorder,
            borderWidth: 1,
            callbacks: { label: tooltipFmt },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: c.tick, font: { size: 10 } },
          },
          y: {
            grid: { color: c.grid },
            ticks: { color: c.tick, font: { size: 11 }, callback: tickFmt },
            beginAtZero: true,
          },
        },
      },
    });
  }, [categoryData, isRevenue, metricLabel, tickFmt, tooltipFmt, chartInView.category]);

  // ── Chart: Checkin trend ──────────────────────────────────────────────────
  useEffect(() => {
    if (!checkinData || !checkinRef.current || !chartInView.checkin) return;
    const c = cc();
    checkinChart.current?.destroy();
    checkinChart.current = new Chart(checkinRef.current, {
      type: "line",
      data: {
        labels: checkinData.labels,
        datasets: [
          {
            label: "Check-in",
            data: checkinData.values,
            borderColor: "#10b981",
            backgroundColor: "rgba(16,185,129,0.08)",
            borderWidth: 2.5,
            pointRadius: 3,
            pointHoverRadius: 6,
            pointBackgroundColor: "#10b981",
            fill: true,
            tension: 0.4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 900,
          easing: "easeInOutCubic" as const,
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: c.tooltip,
            titleColor: c.ttTitle,
            bodyColor: c.ttBody,
            borderColor: c.ttBorder,
            borderWidth: 1,
            padding: 10,
          },
        },
        scales: {
          x: {
            grid: { color: c.grid },
            ticks: { color: c.tick, font: { size: 10 }, maxRotation: 45 },
          },
          y: {
            grid: { color: c.grid },
            ticks: { color: c.tick, font: { size: 11 } },
            beginAtZero: true,
          },
        },
      },
    });
  }, [checkinData, chartInView.checkin]);

  // ── Chart: Staff performance ──────────────────────────────────────────────
  useEffect(() => {
    if (!staffPerfData || !staffRef.current || !chartInView.staff) return;
    if (!staffPerfData.labels.length) return;
    const c = cc();
    staffChart.current?.destroy();
    staffChart.current = new Chart(staffRef.current, {
      type: "bar",
      data: {
        labels: staffPerfData.labels,
        datasets: [
          {
            label: metricLabel,
            data: staffPerfData.values,
            backgroundColor: PALETTE.map((p) => p + "cc"),
            hoverBackgroundColor: PALETTE,
            borderRadius: 6,
            borderSkipped: false,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 700,
          easing: "easeOutQuart" as const,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          delay: (ctx: any) => ctx.dataIndex * 80,
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: c.tooltip,
            titleColor: c.ttTitle,
            bodyColor: c.ttBody,
            borderColor: c.ttBorder,
            borderWidth: 1,
            callbacks: { label: tooltipFmtH },
          },
        },
        scales: {
          x: {
            grid: { color: c.grid },
            ticks: { color: c.tick, font: { size: 11 }, callback: tickFmt },
            beginAtZero: true,
          },
          y: {
            grid: { display: false },
            ticks: { color: c.tick, font: { size: 11 } },
          },
        },
      },
    });
  }, [staffPerfData, isRevenue, metricLabel, tickFmt, tooltipFmtH, chartInView.staff]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const filteredStaff = staffList.filter((u: StaffItem) =>
    staffSearch
      ? u.full_name.toLowerCase().includes(staffSearch.toLowerCase()) ||
        (ROLE_LABELS[u.role] ?? u.role)
          .toLowerCase()
          .includes(staffSearch.toLowerCase())
      : true,
  );

  const scopeBadge = selectedStaff
    ? selectedStaff.full_name
    : roleView
      ? (ROLE_LABELS[roleView] ?? roleView)
      : isAdmin
        ? "Toàn hệ thống"
        : "Phạm vi của bạn";

  const noVolumeData = !chartsLoading && !volumeData?.labels.length;
  const noBrandData =
    !chartsLoading && !brandData?.values.some((v: number) => v > 0);
  const noTopData = !chartsLoading && !topData?.labels.length;
  const noCategoryData = !chartsLoading && !categoryData?.labels.length;
  const noCheckinData = !chartsLoading && !checkinData?.labels.length;
  const noStaffData = !chartsLoading && !staffPerfData?.labels.length;

  // Date filter description label
  const dateBadge = hasDateFilter
    ? effectiveDates.from && effectiveDates.to
      ? `${fmtDateVN(effectiveDates.from)} – ${fmtDateVN(effectiveDates.to)}`
      : effectiveDates.from
        ? `Từ ${fmtDateVN(effectiveDates.from)}`
        : `Đến ${fmtDateVN(effectiveDates.to)}`
    : null;

  const clearDateFilter = () => {
    setDatePreset("");
    setCustomFrom("");
    setCustomTo("");
  };

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error && !stats)
    return (
      <div className="flex flex-col items-center justify-center h-60 gap-4">
        <i className="fa-solid fa-triangle-exclamation text-4xl text-rose-400" />
        <p className="text-slate-500 dark:text-slate-400 text-sm font-semibold">
          {error}
        </p>
        <button
          onClick={loadDashboard}
          className="px-5 py-2 rounded-xl bg-nm text-white font-black text-xs uppercase tracking-widest hover:opacity-90 transition"
        >
          Thử lại
        </button>
      </div>
    );

  const s = stats;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-4"
    >
      {/* ══ HEADER ══════════════════════════════════════════════════ */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-xl md:text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tight leading-tight">
            Bảng điều khiển
          </h3>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs font-semibold text-slate-400">
              {ROLE_LABELS[currentRole] ?? currentRole}
            </span>
            <span className="text-slate-200 dark:text-slate-700">•</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase tracking-wide">
              <i className="fa-solid fa-eye text-[9px]" />
              {scopeBadge}
            </span>
            {isRevenue && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-wide">
                <i className="fa-solid fa-coins text-[9px]" />
                Doanh thu
              </span>
            )}
          </div>
        </div>

        <button
          onClick={loadDashboard}
          disabled={loading}
          className="w-10 h-10 md:w-auto md:h-auto md:px-5 md:py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-center gap-2 disabled:opacity-50 transition-all shadow-sm"
        >
          {loading ? (
            <i className="fa-solid fa-spinner animate-spin" />
          ) : (
            <i className="fa-solid fa-arrows-rotate" />
          )}
          <span className="hidden md:inline">
            {loading ? "Đang tải..." : "Làm mới"}
          </span>
        </button>
      </div>

      {/* ══ FILTERS ═════════════════════════════════════════════════ */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 space-y-3">

        {/* Row 1: Period + Metric + Role view */}
        <div className="flex flex-wrap gap-3 items-center">
          {/* Period */}
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 rounded-xl p-1">
            {[
              { v: "weekly" as Period, label: "Theo ngày", icon: "fa-calendar-day" },
              { v: "monthly" as Period, label: "Theo tháng", icon: "fa-calendar-week" },
            ].map(({ v, label, icon }) => (
              <button
                key={v}
                onClick={() => setPeriod(v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all ${
                  period === v
                    ? "bg-nm text-white shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                }`}
              >
                <i className={`fa-solid ${icon} text-[10px]`} />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* Metric toggle */}
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 rounded-xl p-1">
            {[
              { v: "quantity" as Metric, label: "Sản lượng", icon: "fa-boxes-stacked" },
              { v: "revenue" as Metric, label: "Doanh thu", icon: "fa-coins" },
            ].map(({ v, label, icon }) => (
              <button
                key={v}
                onClick={() => setMetric(v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all ${
                  metric === v
                    ? v === "revenue"
                      ? "bg-emerald-500 text-white shadow-sm"
                      : "bg-orange-500 text-white shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                }`}
              >
                <i className={`fa-solid ${icon} text-[10px]`} />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* Role view — only admin */}
          {isAdmin && (
            <div className="flex gap-1 flex-wrap">
              {[
                { v: "" as RoleView, label: "Tất cả", icon: "fa-layer-group" },
                { v: "director" as RoleView, label: "GĐ KD", icon: "fa-user-tie" },
                { v: "regional_director" as RoleView, label: "GĐ KV", icon: "fa-map-location" },
                { v: "supervisor" as RoleView, label: "GS KD", icon: "fa-user-check" },
                { v: "sales" as RoleView, label: "NVBH", icon: "fa-person-biking" },
              ].map(({ v, label, icon }) => (
                <button
                  key={v}
                  onClick={() => {
                    setRoleView(v);
                    setSelectedStaff(null);
                    setStaffSearch("");
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all ${
                    roleView === v && !selectedStaff
                      ? "bg-indigo-500 text-white shadow-sm"
                      : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600"
                  }`}
                >
                  <i className={`fa-solid ${icon} text-[10px]`} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Row 2: Date range */}
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mr-1">
              <i className="fa-solid fa-calendar-range mr-1" />
              Thời gian
            </span>
            {[
              { v: "" as DatePreset, label: "Tất cả" },
              { v: "7days" as DatePreset, label: "7 ngày" },
              { v: "30days" as DatePreset, label: "30 ngày" },
              { v: "thisMonth" as DatePreset, label: "Tháng này" },
              { v: "lastMonth" as DatePreset, label: "Tháng trước" },
              { v: "custom" as DatePreset, label: "Tùy chỉnh", icon: "fa-sliders" },
            ].map(({ v, label, icon }) => (
              <button
                key={v}
                onClick={() => {
                  setDatePreset(v);
                  if (v !== "custom") {
                    setCustomFrom("");
                    setCustomTo("");
                  }
                }}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all ${
                  datePreset === v
                    ? "bg-violet-500 text-white shadow-sm"
                    : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 hover:text-violet-600"
                }`}
              >
                {icon && <i className={`fa-solid ${icon} text-[10px]`} />}
                {label}
              </button>
            ))}
          </div>

          {/* Custom date inputs */}
          <AnimatePresence>
            {datePreset === "custom" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.15 }}
                style={{ overflow: "hidden" }}
              >
                <div className="flex flex-wrap gap-2 items-center pt-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 min-w-[160px]">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">
                        Từ
                      </span>
                      <div className="flex-1">
                        <CustomDatePicker
                          value={customFrom}
                          onChange={setCustomFrom}
                          placeholder="Từ ngày"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 min-w-[160px]">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">
                        Đến
                      </span>
                      <div className="flex-1">
                        <CustomDatePicker
                          value={customTo}
                          onChange={setCustomTo}
                          placeholder="Đến ngày"
                        />
                      </div>
                    </div>
                  </div>
                  {(customFrom || customTo) && (
                    <button
                      onClick={() => { setCustomFrom(""); setCustomTo(""); }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-400 hover:bg-rose-50 hover:text-rose-500 text-[11px] font-black transition-all"
                    >
                      <i className="fa-solid fa-xmark text-[10px]" />
                      Xóa
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Row 3: Staff search */}
        {canFilter && (
          <div className="relative" ref={searchRef}>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[11px]" />
                <input
                  type="text"
                  value={selectedStaff ? "" : staffSearch}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    setStaffSearch(e.target.value);
                    setShowDropdown(true);
                    setSelectedStaff(null);
                  }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder={
                    selectedStaff
                      ? ""
                      : "Tìm nhân viên theo tên hoặc chức vụ..."
                  }
                  className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-nm transition placeholder:text-slate-400"
                />
                {selectedStaff && (
                  <div className="absolute inset-0 flex items-center px-8 pointer-events-none">
                    <span className="inline-flex items-center gap-1.5 bg-nm/10 text-nm text-[11px] font-black px-2.5 py-1 rounded-lg">
                      <i className="fa-solid fa-user text-[9px]" />
                      {selectedStaff.full_name}
                      <span className="text-slate-400 font-semibold">
                        · {ROLE_LABELS[selectedStaff.role] ?? selectedStaff.role}
                      </span>
                    </span>
                  </div>
                )}
              </div>
              {(selectedStaff || staffSearch) && (
                <button
                  onClick={() => {
                    setSelectedStaff(null);
                    setStaffSearch("");
                    setShowDropdown(false);
                  }}
                  className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-500 hover:bg-rose-50 hover:text-rose-500 transition-all text-xs"
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              )}
            </div>

            <AnimatePresence>
              {showDropdown && filteredStaff.length > 0 && !selectedStaff && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.12 }}
                  className="absolute top-full left-0 right-0 mt-1 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden max-h-56 overflow-y-auto"
                >
                  {filteredStaff.slice(0, 20).map((u: StaffItem) => (
                    <button
                      key={u.id}
                      onClick={() => {
                        setSelectedStaff(u);
                        setStaffSearch("");
                        setShowDropdown(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-nm/5 text-left transition-colors"
                    >
                      <div className="w-7 h-7 rounded-lg bg-nm/10 flex items-center justify-center flex-shrink-0">
                        <i className="fa-solid fa-user text-nm text-[10px]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-slate-800 dark:text-slate-200 truncate">
                          {u.full_name}
                        </p>
                        <p className="text-[10px] font-semibold text-slate-400">
                          {ROLE_LABELS[u.role] ?? u.role}
                        </p>
                      </div>
                    </button>
                  ))}
                  {filteredStaff.length > 20 && (
                    <p className="text-center text-[10px] font-semibold text-slate-400 py-2">
                      +{filteredStaff.length - 20} kết quả khác — hãy thu hẹp tìm kiếm
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* ══ ACTIVE FILTER BANNERS ════════════════════════════════════ */}
      <div className="space-y-2">
        {/* Staff filter banner */}
        <AnimatePresence>
          {selectedStaff && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              style={{ overflow: "hidden" }}
            >
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-nm/5 border border-nm/20">
                <div className="w-8 h-8 rounded-xl bg-nm/10 flex items-center justify-center flex-shrink-0">
                  <i className="fa-solid fa-filter text-nm text-[11px]" />
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-nm">
                    Đang lọc theo nhân viên
                  </p>
                  <p className="text-xs font-black text-slate-800 dark:text-white">
                    {selectedStaff.full_name}
                    <span className="ml-2 text-slate-400 font-semibold">
                      {ROLE_LABELS[selectedStaff.role] ?? selectedStaff.role}
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedStaff(null);
                    setStaffSearch("");
                  }}
                  className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-500 hover:bg-rose-50 hover:text-rose-500 text-[11px] font-black uppercase tracking-widest transition-all"
                >
                  <i className="fa-solid fa-xmark mr-1" />
                  Bỏ lọc
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Date filter banner */}
        <AnimatePresence>
          {hasDateFilter && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              style={{ overflow: "hidden" }}
            >
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-violet-500/5 border border-violet-500/20">
                <div className="w-8 h-8 rounded-xl bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                  <i className="fa-solid fa-calendar-range text-violet-500 text-[11px]" />
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-violet-500">
                    Đang lọc theo thời gian
                  </p>
                  <p className="text-xs font-black text-slate-800 dark:text-white">
                    {dateBadge}
                  </p>
                </div>
                <button
                  onClick={clearDateFilter}
                  className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-500 hover:bg-rose-50 hover:text-rose-500 text-[11px] font-black uppercase tracking-widest transition-all"
                >
                  <i className="fa-solid fa-xmark mr-1" />
                  Bỏ lọc
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ══ KPI CARDS ═══════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          label={isRevenue ? "Doanh thu tháng" : "Sản lượng tháng"}
          value={isRevenue ? (s?.monthly_revenue ?? s?.monthly_quantity) : s?.monthly_quantity}
          icon={isRevenue ? "fa-coins" : "fa-boxes-stacked"}
          iconBg={isRevenue ? "bg-emerald-50 dark:bg-emerald-900/20" : "bg-orange-50 dark:bg-orange-900/20"}
          iconColor={isRevenue ? "text-emerald-500" : "text-orange-500"}
          loading={loading}
          isRevenue={isRevenue}
        />
        <KPICard
          label="Điểm bán mới"
          value={s?.new_stores}
          icon="fa-store"
          iconBg="bg-emerald-50 dark:bg-emerald-900/20"
          iconColor="text-emerald-500"
          loading={loading}
        />
        <KPICard
          label="Coverage 7 ngày"
          value={s?.coverage_rate}
          suffix="%"
          icon="fa-location-dot"
          iconBg="bg-indigo-50 dark:bg-indigo-900/20"
          iconColor="text-indigo-500"
          loading={loading}
        />
        <KPICard
          label="Đơn hàng / ngày"
          value={s?.orders_per_day}
          icon="fa-receipt"
          iconBg="bg-amber-50 dark:bg-amber-900/20"
          iconColor="text-amber-500"
          loading={loading}
        />
      </div>

      {/* ══ ROW 2: Volume + Brand ════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2" ref={volumeWrapRef}>
          <ChartCard
            title={`Xu hướng ${metricLabel.toLowerCase()}`}
            subtitle={
              period === "weekly"
                ? "Theo từng ngày · 60 ngày gần nhất"
                : "Theo từng tháng · 24 tháng gần nhất"
            }
            loading={chartsLoading}
            empty={noVolumeData}
            minH="h-56"
          >
            <div className="h-56">
              <canvas ref={volumeRef} />
            </div>
          </ChartCard>
        </div>
        <div className="lg:col-span-1" ref={brandWrapRef}>
          <ChartCard
            title="Cơ cấu Brand"
            subtitle={`Phân bổ ${metricLabel.toLowerCase()}`}
            loading={chartsLoading}
            empty={noBrandData}
            minH="h-56"
          >
            <div className="h-56">
              <canvas ref={brandRef} />
            </div>
          </ChartCard>
        </div>
      </div>

      {/* ══ ROW 3: Category + Checkin ════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div ref={categoryWrapRef}>
          <ChartCard
            title={`${metricLabel} theo danh mục`}
            subtitle="Tổng hợp tất cả đơn hàng"
            loading={chartsLoading}
            empty={noCategoryData}
            minH="h-52"
          >
            <div className="h-52">
              <canvas ref={categoryRef} />
            </div>
          </ChartCard>
        </div>
        <div ref={checkinWrapRef}>
          <ChartCard
            title="Xu hướng Check-in"
            subtitle="30 ngày gần nhất"
            loading={chartsLoading}
            empty={noCheckinData}
            minH="h-52"
          >
            <div className="h-52">
              <canvas ref={checkinRef} />
            </div>
          </ChartCard>
        </div>
      </div>

      {/* ══ ROW 4: Staff performance + Top products ══════════════════ */}
      <div
        className={`grid gap-3 ${selectedStaff ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2"}`}
      >
        {!selectedStaff && (
          <div ref={staffWrapRef}>
            <ChartCard
              title="Hiệu suất nhân viên"
              subtitle={`Top 10 · theo ${metricLabel.toLowerCase()}`}
              loading={chartsLoading}
              empty={noStaffData}
              minH="h-64"
            >
              <div className="h-64">
                <canvas ref={staffRef} />
              </div>
            </ChartCard>
          </div>
        )}
        <div ref={topWrapRef}>
          <ChartCard
            title="Top 5 sản phẩm bán chạy"
            subtitle={`Tính trên toàn bộ đơn hàng · ${metricLabel.toLowerCase()}`}
            loading={chartsLoading}
            empty={noTopData}
            minH="h-64"
          >
            <div className="h-64">
              <canvas ref={topRef} />
            </div>
          </ChartCard>
        </div>
      </div>
    </motion.div>
  );
};

export default HomePage;
