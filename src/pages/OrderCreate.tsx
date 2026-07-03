import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { API_BASE } from "../constants";
import { useToast } from "../hooks/useToast";
import { useLocation } from "react-router-dom";

const BYPASS_CHECKIN_ROLES = new Set(["regional_director", "director", "admin"]);

const getUserRole = (): string => {
  const token =
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access_token");
  if (!token) return "sales";
  try {
    return JSON.parse(atob(token.split(".")[1])).role ?? "sales";
  } catch {
    return "sales";
  }
};

interface OrderItem {
  id: string;
  productName: string;
  qtyCases: number;
  qtyUnits: number;
  pricePerUnit: number;
  unitsPerCase: number;
  isPromo?: boolean;
}

// ─── Unified Store Command Palette ──────────────────────────────────────────
type StorePickerTheme = keyof typeof PICKER_THEMES;

interface StorePickerProps {
  stores: any[];
  loading?: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
  searchable?: boolean;
  query?: string;
  onQueryChange?: (q: string) => void;
  emptyMessage?: string;
  theme?: StorePickerTheme;
}

const PICKER_THEMES = {
  brand: {
    cardGradient: "from-nm-600 to-nm-400",
    cardShadow: "shadow-nm-400/30",
    cardSubtext: "text-nm-100",
    cardCodeBg: "bg-white/20",
    searchBg: "bg-nm-50 dark:bg-nm-900/20",
    searchBorder: "border-nm-200 dark:border-nm-800",
    searchFocusBorder: "focus:border-nm-500",
    searchFocusBg: "focus:bg-white dark:focus:bg-gray-700",
    spinner: "text-nm-400",
    searchIcon: "group-focus-within:text-nm-500",
    groupAccents: [
      "bg-nm-50 dark:bg-nm-900/20 text-nm-700 dark:text-nm-300 border-nm-200 dark:border-nm-800",
      "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
      "bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800",
      "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
      "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800",
    ],
    groupBars: ["bg-nm-400", "bg-amber-400", "bg-rose-400", "bg-red-400", "bg-yellow-400"],
    rowHover: "hover:bg-nm-50/60 dark:hover:bg-nm-900/20",
    rowFocusBg: "bg-nm-50 dark:bg-nm-900/30",
    rowFocusText: "text-nm-700 dark:text-nm-300",
    rowArrowBg: "bg-nm-100 dark:bg-nm-800/60",
    rowArrowIcon: "text-nm-500",
  },
  indigo: {
    cardGradient: "from-indigo-600 to-violet-600",
    cardShadow: "shadow-indigo-500/25",
    cardSubtext: "text-indigo-200",
    cardCodeBg: "bg-white/20",
    searchBg: "bg-indigo-50 dark:bg-indigo-900/20",
    searchBorder: "border-indigo-200 dark:border-indigo-800",
    searchFocusBorder: "focus:border-indigo-500",
    searchFocusBg: "focus:bg-white dark:focus:bg-gray-700",
    spinner: "text-indigo-400",
    searchIcon: "group-focus-within:text-indigo-500",
    groupAccents: [
      "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800",
      "bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800",
      "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
      "bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800",
      "bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800",
    ],
    groupBars: ["bg-indigo-400", "bg-violet-400", "bg-blue-400", "bg-cyan-400", "bg-teal-400"],
    rowHover: "hover:bg-gray-50 dark:hover:bg-gray-700/40",
    rowFocusBg: "bg-indigo-50 dark:bg-indigo-900/30",
    rowFocusText: "text-indigo-700 dark:text-indigo-300",
    rowArrowBg: "bg-indigo-100 dark:bg-indigo-800",
    rowArrowIcon: "text-indigo-500",
  },
};

const StorePicker: React.FC<StorePickerProps> = ({
  stores,
  loading = false,
  selectedId,
  onSelect,
  searchable = false,
  query = "",
  onQueryChange,
  emptyMessage = "Không tìm thấy điểm bán",
  theme = "brand",
}) => {
  const t = PICKER_THEMES[theme];
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const [expandedRoutes, setExpandedRoutes] = useState<Set<string>>(new Set());

  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    stores.forEach((s) => {
      const key = s.route_name || "Khác";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    });
    return Array.from(map.entries());
  }, [stores]);

  const selectedStore = useMemo(
    () => stores.find((s) => s.id.toString() === selectedId),
    [stores, selectedId],
  );

  useEffect(() => {
    if (focusedIdx < 0 || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${focusedIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [focusedIdx]);

  useEffect(() => { setFocusedIdx(-1); }, [stores]);

  useEffect(() => {
    if (searchable && !query.trim() && stores.length > 0) {
      setExpandedRoutes(new Set(stores.map((s: any) => s.route_name || "Khác")));
    }
  }, [searchable, query, stores.length]);

  const isBrowseMode = searchable && !query.trim();

  const toggleRoute = (routeName: string) => {
    setExpandedRoutes((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(routeName)) next.delete(routeName);
      else next.add(routeName);
      return next;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIdx((i) => Math.min(i + 1, stores.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && focusedIdx >= 0) {
      e.preventDefault();
      const item = stores[focusedIdx];
      if (item) onSelect(item.id.toString());
    } else if (e.key === "Escape" && searchable && onQueryChange) {
      onQueryChange("");
      onSelect("");
    }
  };

  return (
    <div className="space-y-3">
      {/* ── Selected store card ── */}
      <AnimatePresence mode="wait">
        {selectedStore ? (
          <motion.div
            key="card"
            initial={{ opacity: 0, scale: 0.97, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -4 }}
            transition={{ duration: 0.18 }}
            className={`relative flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r ${t.cardGradient} text-white shadow-lg ${t.cardShadow} overflow-hidden`}
          >
            <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-white/10 pointer-events-none" />
            <div className="absolute -right-1 -bottom-6 w-14 h-14 rounded-full bg-white/10 pointer-events-none" />
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <i className="fa-solid fa-store text-white text-base"></i>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-base leading-tight truncate">{selectedStore.name}</p>
              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                {selectedStore.code && (
                  <span className={`text-[10px] font-black ${t.cardCodeBg} px-2 py-0.5 rounded-lg uppercase tracking-widest`}>
                    {selectedStore.code}
                  </span>
                )}
                {selectedStore.route_name && (
                  <span className={`text-[10px] ${t.cardSubtext} truncate`}>
                    <i className="fa-solid fa-route mr-1 text-[9px]"></i>
                    {selectedStore.route_name}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => { onSelect(""); setTimeout(() => inputRef.current?.focus(), 50); }}
              className="flex-shrink-0 w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition-all active:scale-90"
              title="Đổi điểm bán"
            >
              <i className="fa-solid fa-pen text-white text-xs"></i>
            </button>
          </motion.div>
        ) : (
          <motion.div key="input-area" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {searchable ? (
              /* Search input — offline mode */
              <div className="space-y-2">
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
                    {loading
                      ? <i className={`fa-solid fa-spinner animate-spin ${t.spinner}`}></i>
                      : <i className={`fa-solid fa-magnifying-glass text-gray-400 ${t.searchIcon} transition-colors`}></i>
                    }
                  </div>
                  <input
                    ref={inputRef}
                    type="text"
                    autoFocus
                    placeholder="Tìm tên, mã điểm bán, tuyến, người phụ trách..."
                    value={query}
                    onChange={(e) => onQueryChange?.(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className={`w-full pl-11 pr-10 h-14 ${t.searchBg} border-2 ${t.searchBorder} rounded-2xl text-sm font-semibold dark:text-white ${t.searchFocusBorder} ${t.searchFocusBg} outline-none transition-all placeholder:text-gray-400 placeholder:font-normal`}
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => { onQueryChange?.(""); inputRef.current?.focus(); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-400 transition-all"
                    >
                      <i className="fa-solid fa-xmark text-sm"></i>
                    </button>
                  )}
                </div>
                {/* Hint tags */}
                {!query && (
                  <div className="flex flex-wrap gap-1.5 px-1">
                    {[
                      { icon: "fa-store", label: "Tên điểm bán" },
                      { icon: "fa-barcode", label: "Mã điểm bán" },
                      { icon: "fa-route", label: "Tên tuyến" },
                      { icon: "fa-user", label: "Người phụ trách" },
                    ].map((tag) => (
                      <span key={tag.label} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-[10px] font-bold text-gray-500 dark:text-gray-400">
                        <i className={`fa-solid ${tag.icon} text-[9px]`}></i>
                        {tag.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Static header — check-in mode */
              stores.length > 0 && !loading && (
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    {stores.length} điểm bán đã check-in · {grouped.length} tuyến
                  </span>
                  <span className="text-[9px] text-gray-300 dark:text-gray-600 uppercase tracking-widest hidden sm:block">
                    ↑↓ điều hướng · Enter chọn
                  </span>
                </div>
              )
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Results panel ── */}
      <AnimatePresence mode="wait">
        {!selectedId && (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
          >
            {/* Count bar */}
            {!loading && stores.length > 0 && (
              <div className="flex items-center justify-between px-1 mb-2">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  {isBrowseMode
                    ? `Phạm vi trực tiếp · ${stores.length} điểm bán · ${grouped.length} tuyến`
                    : `${stores.length} kết quả · ${grouped.length} tuyến${stores.length === 100 ? " · hiển thị 100 đầu tiên" : ""}`
                  }
                </span>
                <span className="text-[9px] text-gray-300 dark:text-gray-600 uppercase tracking-widest hidden sm:block">
                  ↑↓ · Enter chọn
                </span>
              </div>
            )}

            <div
              ref={listRef}
              onKeyDown={!searchable ? handleKeyDown : undefined}
              tabIndex={!searchable ? 0 : -1}
              className="max-h-72 overflow-y-auto rounded-2xl border-2 border-gray-100 dark:border-gray-700 custom-scrollbar bg-white dark:bg-gray-800 outline-none"
            >
              {loading ? (
                <div className="p-3 space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-2 py-2.5 animate-pulse">
                      <div className="w-1 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex-shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 rounded-lg bg-gray-100 dark:bg-gray-700" style={{ width: `${50 + (i % 4) * 12}%` }} />
                        <div className="h-2.5 rounded-lg bg-gray-50 dark:bg-gray-700/50 w-2/5" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : stores.length === 0 ? (
                <div className="py-14 flex flex-col items-center justify-center opacity-30">
                  <i className={`fa-solid ${searchable ? "fa-store-slash" : "fa-calendar-xmark"} text-3xl mb-3 text-gray-400`}></i>
                  <p className="text-xs font-black uppercase tracking-widest text-gray-400 text-center px-6">
                    {searchable && query ? `Không tìm thấy "${query}"` : emptyMessage}
                  </p>
                </div>
              ) : (
                (() => {
                  let globalIdx = 0;
                  return grouped.map(([routeName, routeStores], gIdx) => {
                    const accent = t.groupAccents[gIdx % t.groupAccents.length];
                    const bar = t.groupBars[gIdx % t.groupBars.length];
                    const startIdx = globalIdx;
                    globalIdx += routeStores.length;
                    const staffName = routeStores[0]?.staff_name;
                    const isExpanded = !isBrowseMode || expandedRoutes.has(routeName);
                    return (
                      <div key={routeName} className="relative">
                        <div
                          className={`sticky top-0 z-10 flex items-center gap-2 px-4 py-2 border-b backdrop-blur-sm ${accent}${isBrowseMode ? " cursor-pointer select-none" : ""}`}
                          onClick={isBrowseMode ? () => toggleRoute(routeName) : undefined}
                        >
                          <i className="fa-solid fa-route text-[11px] flex-shrink-0"></i>
                          <span className="text-[11px] font-black uppercase tracking-widest truncate flex-1 min-w-0">
                            {routeName}
                          </span>
                          {staffName && (
                            <span className="text-[10px] font-semibold opacity-70 truncate max-w-[120px] flex-shrink-0 flex items-center gap-1">
                              <i className="fa-solid fa-user text-[9px]"></i>
                              {staffName}
                            </span>
                          )}
                          <span className="text-[10px] font-black opacity-60 tabular-nums flex-shrink-0">
                            {routeStores.length}
                          </span>
                          {isBrowseMode && (
                            <i className={`fa-solid fa-chevron-${isExpanded ? "down" : "right"} text-[9px] flex-shrink-0 opacity-60`}></i>
                          )}
                        </div>
                        {isExpanded && routeStores.map((s: any, i: number) => {
                          const itemIdx = startIdx + i;
                          const isFocused = focusedIdx === itemIdx;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              data-idx={itemIdx}
                              onClick={() => onSelect(s.id.toString())}
                              onMouseEnter={() => setFocusedIdx(itemIdx)}
                              className={`w-full text-left flex items-center gap-3 px-4 py-3 transition-all border-b border-gray-50/70 dark:border-gray-700/40 last:border-0 ${
                                isFocused ? t.rowFocusBg : t.rowHover
                              }`}
                            >
                              <div className={`w-1 h-8 rounded-full flex-shrink-0 transition-opacity ${bar} ${isFocused ? "opacity-100" : "opacity-20"}`} />
                              <div className="flex-1 min-w-0">
                                <p className={`font-bold text-sm truncate transition-colors ${isFocused ? t.rowFocusText : "text-gray-900 dark:text-white"}`}>
                                  {s.name}
                                </p>
                                {(s.code || s.address) && (
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {s.code && (
                                      <span className="text-[10px] font-black text-gray-400 font-mono bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded leading-none">
                                        {s.code}
                                      </span>
                                    )}
                                    {s.address && (
                                      <span className="text-[10px] text-gray-400 truncate">{s.address}</span>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-100 ${
                                isFocused ? t.rowArrowBg : "opacity-0 scale-75"
                              }`}>
                                <i className={`fa-solid fa-arrow-right ${t.rowArrowIcon} text-[10px]`}></i>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    );
                  });
                })()
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const OrderCreatePage: React.FC = () => {
  const { showToast } = useToast();

  const token =
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access_token");

  const location = useLocation();

  const isPrivileged = BYPASS_CHECKIN_ROLES.has(getUserRole());

  // Chế độ ngoại tuyến: tìm kiếm tất cả điểm bán (chỉ dành cho regional_director+)
  const [offlineMode, setOfflineMode] = useState(false);
  const [storeSearchQuery, setStoreSearchQuery] = useState("");
  const [storeSearchResults, setStoreSearchResults] = useState<any[]>([]);
  const [loadingStoreSearch, setLoadingStoreSearch] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchAllStores = useCallback(
    async (q: string) => {
      if (!token) return;
      setLoadingStoreSearch(true);
      try {
        const res = await fetch(
          `${API_BASE}/stores/search?q=${encodeURIComponent(q.trim())}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (res.ok) setStoreSearchResults(await res.json());
      } catch {
        // silent
      } finally {
        setLoadingStoreSearch(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (!offlineMode) return;
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    const delay = storeSearchQuery.trim() ? 350 : 0;
    searchDebounceRef.current = setTimeout(() => searchAllStores(storeSearchQuery), delay);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [storeSearchQuery, offlineMode, searchAllStores]);

  // Khi bật/tắt offline mode
  useEffect(() => {
    setSelectedStoreId("");
    if (offlineMode) {
      setStoreSearchQuery("");
      searchAllStores("");
    } else {
      setStoreSearchResults([]);
    }
  }, [offlineMode]);

  useEffect(() => {
    if (token) {
      fetchCheckedInStores();
    }
  }, [location.pathname]);

  const [stores, setStores] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [loadingStores, setLoadingStores] = useState(false);

  const fetchCheckedInStores = async () => {
    try {
      const res = await fetch(`${API_BASE}/my-checkedin-stores-today`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) return;

      const data = await res.json();

      const normalizedStores = (data.stores || []).map((s: any) => ({
        id: s.store_id,
        name: s.store_name,
        route_id: s.route_id,
        route_name: s.route_name,
      }));

      setStores(normalizedStores);
    } catch {
      showToast("Lỗi tải điểm bán đã check-in", "danger");
    }
  };

  useEffect(() => {
    if (!token) return;

    fetchCheckedInStores();
    fetchProducts();
    fetchCategories();
    fetchBrands();
    fetchOrdersToday();
  }, [token]);

  const fetchProducts = async () => {
    try {
      const res = await fetch(`${API_BASE}/products`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) setProducts(await res.json());
    } catch {
      showToast("Lỗi tải sản phẩm", "danger");
    }
  };

  const fetchCategories = async () => {
    const res = await fetch(`${API_BASE}/product-categories`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      const data = await res.json();
      setCategories([
        { id: "all", name: "Tất cả" },
        ...data.map((c) => ({
          id: c.id,
          name: c.name,
        })),
      ]);
    }
  };

  const fetchBrands = async () => {
    const res = await fetch(`${API_BASE}/brands`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      const data = await res.json();
      setBrands([{ id: "all", name: "Tất cả" }, ...data]);
    }
  };

  const [reports, setReports] = useState<any[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);

  const fetchOrdersToday = async () => {
    try {
      setLoadingReports(true);

      const res = await fetch(`${API_BASE}/my-orders-today`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) return;

      const data = await res.json();

      setReports(data.orders || []);
    } catch {
      showToast("Lỗi tải lịch sử đơn hôm nay", "danger");
    } finally {
      setLoadingReports(false);
    }
  };

  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [currentOrder, setCurrentOrder] = useState<OrderItem[]>([]);
  const [searchProduct, setSearchProduct] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterBrand, setFilterBrand] = useState("all");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [qtyCases, setQtyCases] = useState("0");
  const [qtyUnits, setQtyUnits] = useState("0");
  // 🔥 commit: state chọn sản phẩm khuyến mãi
  const [isPromo, setIsPromo] = useState(false);
  // state lưu id đơn hàng đang xem chi tiết

  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  // Hàm bật / tắt hiển thị chi tiết đơn hàng

  // 🔥 State lưu backup giỏ hàng để hoàn tác
  // Chức năng: lưu tạm dữ liệu trước khi xóa để có thể khôi phục
  const [cartBackup, setCartBackup] = useState<OrderItem[] | null>(null);
  const [undoTimeout, setUndoTimeout] = useState<NodeJS.Timeout | null>(null);

  // 🔥 Hàm build URL hình ảnh sản phẩm
  const buildImageUrl = (path?: string) => {
    if (!path) return null;
    return path.startsWith("http")
      ? path
      : `${API_BASE.replace(/\/$/, "")}${path}`;
  };

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchSearch = p.name
        ?.toLowerCase()
        .includes(searchProduct.toLowerCase());

      const matchCat =
        filterCategory === "all" ||
        Number(p.category_id) === Number(filterCategory);

      const matchBrand =
        filterBrand === "all" || Number(p.brand_id) === Number(filterBrand);

      return matchSearch && matchCat && matchBrand;
    });
  }, [products, searchProduct, filterCategory, filterBrand]);

  const orderTotal = useMemo(() => {
    return currentOrder.reduce((sum, item) => {
      const totalUnits = item.qtyCases * item.unitsPerCase + item.qtyUnits;
      return sum + totalUnits * item.pricePerUnit;
    }, 0);
  }, [currentOrder]);

  // 🔥 Hàm thêm sản phẩm vào giỏ hàng
  // Chức năng: thêm sản phẩm mới hoặc cộng dồn số lượng nếu đã tồn tại
  const handleAddItem = () => {
    const product = products.find((p) => p.id.toString() === selectedProductId);

    if (!product) {
      showToast("Vui lòng chọn sản phẩm", "warning");
      return;
    }

    const cases = Math.max(0, parseInt(qtyCases) || 0);
    const units = Math.max(0, parseInt(qtyUnits) || 0);

    if (cases === 0 && units === 0) {
      showToast("Vui lòng nhập số lượng", "warning");
      return;
    }

    const existingItemIndex = currentOrder.findIndex(
      (item) => item.id === product.id.toString() && !!item.isPromo === isPromo,
    );

    if (existingItemIndex > -1) {
      const updatedOrder = [...currentOrder];
      updatedOrder[existingItemIndex].qtyCases += cases;
      updatedOrder[existingItemIndex].qtyUnits += units;
      setCurrentOrder(updatedOrder);

      showToast(
        `Đã cộng dồn ${product.name} (${cases} thùng, ${units} lẻ)`,
        "success",
      );
    } else {
      setCurrentOrder([
        ...currentOrder,
        {
          id: product.id.toString(),
          productName: product.name,
          qtyCases: cases,
          qtyUnits: units,
          pricePerUnit: isPromo ? 0 : product.price_base || 0,
          isPromo: isPromo,
          unitsPerCase: product.units_per_case || 1,
        },
      ]);

      showToast(
        `Đã thêm ${product.name} (${cases} thùng, ${units} lẻ)`,
        "success",
      );
    }

    setSelectedProductId("");
    setQtyCases("0");
    setQtyUnits("0");
    setIsPromo(false);
  };

  // 🔥 Hàm xóa sản phẩm khỏi giỏ hàng
  // 🔥 Hàm xóa 1 sản phẩm có hỗ trợ hoàn tác
  // Chức năng: xóa sản phẩm và cho phép khôi phục lại
  const handleRemoveItem = (id: string) => {
    const index = currentOrder.findIndex((item) => item.id === id);
    if (index === -1) return;

    const removedItem = currentOrder[index];

    // Backup toàn bộ giỏ hiện tại
    const backup = [...currentOrder];

    // Xóa sản phẩm
    const updatedOrder = currentOrder.filter((item) => item.id !== id);
    setCurrentOrder(updatedOrder);

    // Toast có nút hoàn tác
    showToast(`Đã xóa ${removedItem.productName}`, "warning", {
      actionLabel: "Hoàn tác",
      onAction: () => {
        setCurrentOrder(backup);
        showToast("Đã khôi phục sản phẩm", "success");
      },
    });
  };

  // 🔥 Hàm hoàn tác xóa giỏ hàng
  // Chức năng: khôi phục lại dữ liệu giỏ hàng từ backup
  const handleUndoClearCart = () => {
    if (!cartBackup) return;

    setCurrentOrder(cartBackup);
    setCartBackup(null);

    if (undoTimeout) {
      clearTimeout(undoTimeout);
      setUndoTimeout(null);
    }

    showToast("Đã khôi phục giỏ hàng", "success");
  };

  // 🔥 Hàm xóa toàn bộ giỏ hàng có hỗ trợ hoàn tác
  // Chức năng: xóa giỏ hàng và cho phép hoàn tác trong 5 giây
  const handleClearCart = () => {
    if (currentOrder.length === 0) return;

    const backup = [...currentOrder];

    setCurrentOrder([]);

    showToast("Đã xóa giỏ hàng", "warning", {
      actionLabel: "Hoàn tác",
      onAction: () => {
        setCurrentOrder(backup);
        showToast("Đã khôi phục giỏ hàng", "success");
      },
    });
  };

  const handleSubmitOrder = async () => {
    if (!selectedStoreId && currentOrder.length === 0) {
      showToast("Vui lòng chọn cửa hàng và thêm sản phẩm", "warning");
      return;
    }
    if (!selectedStoreId) {
      showToast("Vui lòng chọn cửa hàng trước khi gửi đơn", "warning");
      return;
    }
    if (currentOrder.length === 0) {
      showToast("Vui lòng thêm ít nhất một sản phẩm vào đơn hàng", "warning");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          store_id: Number(selectedStoreId),
          items: currentOrder.map((i) => ({
            product_id: Number(i.id),
            quantity: i.qtyCases * i.unitsPerCase + i.qtyUnits,
            is_promo: i.isPromo || false,
          })),
        }),
      });

      if (res.ok) {
        showToast("Tạo đơn thành công", "success");
        setCurrentOrder([]);
        fetchOrdersToday();
      } else {
        const errData = await res.json().catch(() => null);
        const errMsg = errData?.detail || errData?.message || `Lỗi ${res.status}`;
        showToast(`Tạo đơn thất bại: ${errMsg}`, "danger");
      }
    } catch {
      showToast("Lỗi kết nối, vui lòng thử lại", "danger");
    }
  };

  const handleQtyChange = (
    setter: React.Dispatch<React.SetStateAction<string>>,
    value: string,
  ) => {
    if (value === "") {
      setter("");
      return;
    }
    const val = parseInt(value);
    if (isNaN(val) || val < 0) {
      setter("0");
    } else {
      setter(val.toString());
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 pb-20 md:pb-0">
      <div className="xl:col-span-8 space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-gray-800 p-6 md:p-10 rounded-[2.5rem] border border-gray-100 dark:border-gray-700 shadow-xl"
        >
          <div className="mb-10">
            <div className="flex items-center gap-4 mb-6">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner ${offlineMode ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600" : "bg-nm-100 dark:bg-nm-900/30 text-nm-600"}`}>
                <i className={`text-xl fa-solid ${offlineMode ? "fa-globe" : "fa-store"}`}></i>
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-black dark:text-white uppercase tracking-tight">
                  Bước 1: Chọn Điểm Bán
                </h3>
                {offlineMode && (
                  <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">
                    Đơn ngoại tuyến · không cần check-in
                  </span>
                )}
              </div>
              {isPrivileged && (
                <button
                  type="button"
                  onClick={() => setOfflineMode((v) => !v)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all border-2 ${
                    offlineMode
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-500/30"
                      : "bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:border-indigo-300"
                  }`}
                >
                  <i className={`fa-solid ${offlineMode ? "fa-toggle-on" : "fa-toggle-off"}`}></i>
                  {offlineMode ? "Đang ngoại tuyến" : "Đặt sỉ / ngoại tuyến"}
                </button>
              )}
            </div>

            {offlineMode ? (
              <StorePicker
                stores={storeSearchResults}
                loading={loadingStoreSearch}
                selectedId={selectedStoreId}
                onSelect={setSelectedStoreId}
                searchable
                query={storeSearchQuery}
                onQueryChange={setStoreSearchQuery}
                theme="indigo"
              />
            ) : (
              <StorePicker
                stores={stores}
                loading={loadingStores}
                selectedId={selectedStoreId}
                onSelect={setSelectedStoreId}
                emptyMessage="Chưa check-in điểm bán nào hôm nay"
                theme="brand"
              />
            )}
          </div>

          <div className="mb-10">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-nm-100 dark:bg-nm-900/30 rounded-2xl flex items-center justify-center text-nm-600 shadow-inner">
                <i className="fa-solid fa-cart-plus text-xl"></i>
              </div>
              <h3 className="text-xl font-black dark:text-white uppercase tracking-tight">
                Bước 2: Thêm Sản Phẩm
              </h3>
            </div>

            {/* ── Bộ lọc ── */}
            <div className="space-y-3 mb-5">
              {/* Tìm kiếm */}
              <div className="relative">
                <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"></i>
                <input
                  type="text"
                  placeholder="Tìm sản phẩm..."
                  value={searchProduct}
                  onChange={(e) => setSearchProduct(e.target.value)}
                  className="w-full pl-11 pr-4 h-12 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-2xl text-sm focus:ring-2 focus:ring-nm-500 outline-none font-bold dark:text-white"
                />
              </div>

              {/* Category chips */}
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setFilterCategory(cat.id.toString())}
                    className={`px-4 py-1.5 rounded-full text-[11px] font-black transition-all ${
                      filterCategory === cat.id.toString()
                        ? "bg-nm-500 text-white shadow-md shadow-nm-300/40"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>

              {/* Brand chips */}
              {brands.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {brands.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setFilterBrand(b.id.toString())}
                      className={`px-4 py-1.5 rounded-full text-[11px] font-black transition-all ${
                        filterBrand === b.id.toString()
                          ? "bg-blue-500 text-white shadow-md shadow-blue-300/40"
                          : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
                      }`}
                    >
                      {b.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── Lưới sản phẩm ── */}
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">
              {filteredProducts.length} sản phẩm
            </p>
            <div className="max-h-72 overflow-y-auto rounded-2xl pr-1 mb-5 custom-scrollbar">
              {filteredProducts.length === 0 ? (
                <div className="py-10 flex flex-col items-center justify-center opacity-30">
                  <i className="fa-solid fa-box-open text-4xl mb-3"></i>
                  <p className="text-xs font-black uppercase tracking-widest">Không có sản phẩm</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {filteredProducts.map((product) => {
                    const isSelected = selectedProductId === product.id.toString();
                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => {
                          setSelectedProductId(isSelected ? "" : product.id.toString());
                          setQtyCases("0");
                          setQtyUnits("0");
                          setIsPromo(false);
                        }}
                        className={`relative text-left p-3 rounded-2xl border-2 transition-all active:scale-95 ${
                          isSelected
                            ? "border-nm-500 bg-nm-50 dark:bg-nm-900/20 shadow-md shadow-nm-200/50"
                            : "border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30 hover:border-nm-200 dark:hover:border-nm-700"
                        }`}
                      >
                        {/* Checkmark khi đã chọn */}
                        {isSelected && (
                          <div className="absolute top-2 right-2 w-5 h-5 bg-nm-500 rounded-full flex items-center justify-center z-10">
                            <i className="fa-solid fa-check text-white text-[8px]"></i>
                          </div>
                        )}
                        {/* Ảnh */}
                        <div className="w-full aspect-square rounded-xl overflow-hidden bg-white mb-2 flex items-center justify-center">
                          {product.image_url ? (
                            <img
                              src={buildImageUrl(product.image_url) || ""}
                              alt={product.name}
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <i className="fa-solid fa-image text-gray-200 text-2xl"></i>
                          )}
                        </div>
                        {/* Tên */}
                        <p className="font-bold text-xs text-gray-900 dark:text-white leading-tight line-clamp-2 mb-1">
                          {product.name}
                        </p>
                        {product.spec && (
                          <p className="text-[10px] text-gray-400 truncate">{product.spec}</p>
                        )}
                        {/* Giá */}
                        <p className="text-[11px] font-black text-nm-600 mt-1.5">
                          {product.price_base ? product.price_base.toLocaleString() + "đ" : "—"}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Panel nhập số lượng (hiện khi chọn SP) ── */}
            <AnimatePresence>
              {selectedProductId && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className={`p-4 rounded-2xl border-2 space-y-3 ${
                    isPromo
                      ? "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700"
                      : "bg-nm-50 dark:bg-nm-900/20 border-nm-200 dark:border-nm-800"
                  }`}
                >
                  {/* Tên sản phẩm đang chọn */}
                  <div className="flex items-center gap-2">
                    <i className={`fa-solid fa-circle-check text-sm ${isPromo ? "text-green-500" : "text-nm-500"}`}></i>
                    <p className="text-xs font-black text-gray-700 dark:text-gray-200 truncate flex-1">
                      {products.find((p) => p.id.toString() === selectedProductId)?.name}
                    </p>
                  </div>

                  <div className="flex gap-3 items-end">
                    {/* Số Thùng */}
                    <div className="flex-1 space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        Số Thùng
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={qtyCases}
                        onChange={(e) => handleQtyChange(setQtyCases, e.target.value)}
                        className={`w-full px-3 h-12 border-2 rounded-xl focus:ring-0 dark:text-white outline-none transition-all font-black text-center text-base ${
                          isPromo
                            ? "bg-white dark:bg-gray-800 border-green-300 focus:border-green-500"
                            : "bg-white dark:bg-gray-800 border-nm-200 focus:border-nm-500"
                        }`}
                      />
                    </div>

                    {/* Số Lẻ */}
                    <div className="flex-1 space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        Số Lẻ
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={qtyUnits}
                        onChange={(e) => handleQtyChange(setQtyUnits, e.target.value)}
                        className={`w-full px-3 h-12 border-2 rounded-xl focus:ring-0 dark:text-white outline-none transition-all font-black text-center text-base ${
                          isPromo
                            ? "bg-white dark:bg-gray-800 border-green-300 focus:border-green-500"
                            : "bg-white dark:bg-gray-800 border-nm-200 focus:border-nm-500"
                        }`}
                      />
                    </div>

                    {/* KM toggle */}
                    <div className="flex flex-col items-center gap-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase">KM</label>
                      <button
                        type="button"
                        onClick={() => setIsPromo((v: boolean) => !v)}
                        className={`w-12 h-12 rounded-xl border-2 flex items-center justify-center transition-all ${
                          isPromo
                            ? "bg-green-500 border-green-500 text-white shadow-lg shadow-green-500/30"
                            : "bg-white dark:bg-gray-800 border-nm-200 dark:border-gray-600 text-gray-400"
                        }`}
                      >
                        <i className="fa-solid fa-gift text-lg"></i>
                      </button>
                    </div>

                    {/* Nút THÊM */}
                    <button
                      onClick={handleAddItem}
                      disabled={
                        (qtyCases === "0" && qtyUnits === "0") ||
                        (qtyCases === "" && qtyUnits === "")
                      }
                      className={`flex-1 h-12 text-white font-black rounded-xl transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed uppercase text-xs tracking-widest shadow-lg ${
                        isPromo
                          ? "bg-green-600 hover:bg-green-700 shadow-green-500/30"
                          : "bg-nm-600 hover:bg-nm-700 shadow-nm-500/30"
                      }`}
                    >
                      {isPromo ? "THÊM KM" : "THÊM"}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="border-t border-gray-50 dark:border-gray-700 pt-10">
            <div className="flex items-center justify-between mb-8">
              <h4 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-3">
                <div className="w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center text-gray-400">
                  <i className="fa-solid fa-list-check"></i>
                </div>
                Danh sách mặt hàng ({currentOrder.length})
              </h4>
              {currentOrder.length > 0 && (
                <button
                  onClick={handleClearCart}
                  className="text-[10px] font-black text-red-500 uppercase tracking-widest hover:underline"
                >
                  Xóa tất cả
                </button>
              )}
            </div>

            <div className="space-y-4">
              {currentOrder.length > 0 ? (
                currentOrder.map((item) => {
                  const itemTotal =
                    (item.qtyCases * item.unitsPerCase + item.qtyUnits) *
                    item.pricePerUnit;
                  return (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex items-center justify-between p-6 bg-gray-50 dark:bg-gray-700/30 rounded-[2rem] group border-2 border-transparent hover:border-nm-200 transition-all"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-4">
                          <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                            {products.find((p) => p.id.toString() === item.id)
                              ?.image_url ? (
                              <img
                                src={
                                  buildImageUrl(
                                    products.find(
                                      (p) => p.id.toString() === item.id,
                                    )?.image_url,
                                  ) || ""
                                }
                                alt={item.productName}
                                className="w-full h-full object-contain bg-white"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <i className="fa-solid fa-image text-gray-300"></i>
                              </div>
                            )}
                          </div>

                          <div>
                            <p className="font-black text-gray-900 dark:text-white text-base mb-1.5">
                              {item.productName}
                            </p>

                            <div className="flex flex-wrap gap-4">
                              <span className="text-[10px] font-black text-nm-600 bg-nm-100 dark:bg-nm-900/30 px-3 py-1 rounded-xl uppercase tracking-widest">
                                Thùng: {item.qtyCases} | Lẻ: {item.qtyUnits}
                              </span>
                              <span className="text-[10px] font-bold text-gray-400 uppercase self-center">
                                Giá: {item.pricePerUnit.toLocaleString()}đ
                              </span>
                              {item.isPromo && (
                                <span className="text-[10px] font-black text-green-600 bg-green-100 px-3 py-1 rounded-xl uppercase">
                                  KM
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="text-right mr-8">
                        <p className="font-black text-gray-900 dark:text-white text-lg">
                          {itemTotal.toLocaleString()}đ
                        </p>
                      </div>
                      <button
                        onClick={() => handleRemoveItem(item.id)}
                        className="w-12 h-12 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-2xl transition-all active:scale-90"
                      >
                        <i className="fa-solid fa-trash-can text-lg"></i>
                      </button>
                    </motion.div>
                  );
                })
              ) : (
                <div className="py-20 flex flex-col items-center justify-center opacity-20">
                  <i className="fa-solid fa-basket-shopping text-6xl mb-6"></i>
                  <p className="text-sm font-black uppercase tracking-widest">
                    Giỏ hàng đang trống
                  </p>
                </div>
              )}
            </div>

            <div className="mt-12 p-8 md:p-10 bg-nm-600 rounded-[3rem] shadow-2xl shadow-nm-500/40 text-white flex flex-col md:flex-row items-center justify-between gap-10">
              <div className="text-center md:text-left">
                <p className="text-[11px] font-black uppercase tracking-[0.3em] opacity-80 mb-3">
                  Tổng giá trị đơn hàng
                </p>
                <h3 className="text-5xl font-black tracking-tighter">
                  {orderTotal.toLocaleString()}đ
                </h3>
              </div>
              <button
                onClick={handleSubmitOrder}
                disabled={currentOrder.length === 0 || !selectedStoreId}
                className="w-full md:w-auto px-16 h-20 bg-white text-nm-600 font-black rounded-[2rem] hover:bg-nm-50 transition-all active:scale-95 disabled:opacity-50 uppercase tracking-[0.2em] text-base shadow-xl"
              >
                Gửi Đơn Hàng
              </button>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="xl:col-span-4 space-y-6">
        {!selectedOrder ? (
          // ================= DANH SÁCH ĐƠN =================
          <div className="bg-white dark:bg-gray-800 rounded-[3rem] border border-gray-100 dark:border-gray-700 overflow-hidden shadow-sm flex flex-col h-full max-h-[900px]">
            <div className="p-10 border-b border-gray-50 dark:border-gray-700">
              <div className="flex items-center gap-4 mb-3">
                <div className="w-12 h-12 bg-nm-50 dark:bg-nm-900/20 rounded-2xl flex items-center justify-center text-nm-600 shadow-inner">
                  <i className="fa-solid fa-clipboard-list text-xl"></i>
                </div>
                <h3 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight">
                  Lịch sử hôm nay
                </h3>
              </div>
              <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em]">
                Đã ghi nhận {reports.length} đơn
              </p>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-5">
              {reports.length > 0 ? (
                reports.map((order) => (
                  <motion.div
                    key={order.id}
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-gray-50/50 dark:bg-gray-700/30 p-8 rounded-[2.5rem] border border-gray-50 dark:border-gray-700 hover:border-nm-100 transition-all group"
                  >
                    <div className="flex justify-between items-start mb-5">
                      <div className="flex-1 min-w-0 mr-4">
                        <span className="text-[9px] font-black text-nm-600 px-3 py-1 bg-nm-50 dark:bg-nm-900/20 rounded-xl uppercase mb-3 inline-block tracking-widest">
                          {order.id}
                        </span>
                        <h4 className="font-black text-gray-900 dark:text-white truncate text-base">
                          {order.store_name}
                        </h4>
                      </div>

                      <div className="text-right">
                        <p className="font-black text-nm-600 text-lg">
                          {order.total_amount?.toLocaleString()}đ
                        </p>
                        <p className="text-[9px] text-gray-400 font-bold uppercase mt-1.5">
                          {new Date(order.created_at).toLocaleTimeString(
                            "vi-VN",
                            {
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Ảnh preview sản phẩm */}
                    {order.items && order.items.length > 0 && (
                      <div className="flex items-center gap-1.5 mb-4">
                        {order.items.slice(0, 5).map((item: any, idx: number) => (
                          <div
                            key={idx}
                            className="relative w-9 h-9 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 flex-shrink-0 border border-gray-200 dark:border-gray-600"
                          >
                            {item.image_url ? (
                              <img
                                src={buildImageUrl(item.image_url) || ""}
                                alt={item.product_name}
                                className="w-full h-full object-contain bg-white"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <i className="fa-solid fa-image text-gray-300 text-[10px]"></i>
                              </div>
                            )}
                            {item.is_promo && (
                              <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-tl-md flex items-center justify-center">
                                <i className="fa-solid fa-gift text-white text-[7px]"></i>
                              </div>
                            )}
                          </div>
                        ))}
                        {order.items.length > 5 && (
                          <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-700 flex-shrink-0 flex items-center justify-center border border-gray-200 dark:border-gray-600">
                            <span className="text-[10px] font-black text-gray-400">+{order.items.length - 5}</span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-600">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        {order.total_items} sản phẩm
                      </span>

                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="text-[11px] font-black text-nm-600 uppercase tracking-widest hover:underline flex items-center gap-2"
                      >
                        Chi tiết
                        <i className="fa-solid fa-arrow-right text-[10px]"></i>
                      </button>
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="py-24 text-center flex flex-col items-center justify-center">
                  <p className="text-gray-400 font-black uppercase text-[10px] tracking-[0.3em]">
                    Danh sách trống
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          // ================= CHI TIẾT ĐƠN =================
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white dark:bg-gray-800 rounded-[3rem] border border-gray-100 dark:border-gray-700 shadow-sm"
          >
            {/* HEADER */}
            <div className="p-8 border-b border-gray-100 dark:border-gray-700 flex items-center gap-4">
              <button
                onClick={() => setSelectedOrder(null)}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-nm-100 text-nm-600 hover:bg-nm-600 hover:text-white transition-all"
              >
                <i className="fa-solid fa-chevron-left"></i>
              </button>

              <div>
                <h3 className="font-black text-lg text-gray-900 dark:text-white">
                  Đơn hàng #{selectedOrder.id}
                </h3>
                <p className="text-xs text-gray-400">
                  {selectedOrder.store_name}
                </p>
              </div>
            </div>

            {/* DANH SÁCH SẢN PHẨM */}
            <div className="p-8 space-y-4">
              {selectedOrder.items?.map((item: any) => (
                <div
                  key={item.product_id}
                  className={`p-3 rounded-2xl border-2 flex items-center gap-3 ${
                    item.is_promo
                      ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700"
                      : "bg-gray-50 dark:bg-gray-700 border-transparent"
                  }`}
                >
                  {/* Ảnh sản phẩm */}
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-white flex-shrink-0 border border-gray-100 dark:border-gray-600 flex items-center justify-center">
                    {item.image_url ? (
                      <img
                        src={buildImageUrl(item.image_url) || ""}
                        alt={item.product_name}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <i className="fa-solid fa-image text-gray-300"></i>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-gray-900 dark:text-white text-xs truncate flex-1">
                        {item.product_name}
                      </span>
                      {item.is_promo && (
                        <span className="flex-shrink-0 text-[9px] font-black text-green-600 bg-green-100 dark:bg-green-900/40 px-2 py-0.5 rounded-lg uppercase tracking-wide flex items-center gap-1">
                          <i className="fa-solid fa-gift"></i> KM
                        </span>
                      )}
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-gray-400">
                        {item.is_promo ? (
                          <span className="text-green-600 font-bold">0đ (KM)</span>
                        ) : (
                          <span>{(item.price ?? 0).toLocaleString()}đ × {item.quantity}</span>
                        )}
                      </span>
                      <span className="text-xs font-black text-nm-600">
                        {item.is_promo ? "—" : `${((item.price ?? 0) * item.quantity).toLocaleString()}đ`}
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              <div className="pt-6 border-t text-right">
                <p className="text-sm text-gray-400">Tổng tiền</p>
                <p className="text-2xl font-black text-nm-600">
                  {selectedOrder.total_amount?.toLocaleString()}đ
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default OrderCreatePage;
