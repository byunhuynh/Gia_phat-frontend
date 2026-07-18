import { API_BASE } from "../constants";
import React, { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Product, Category, Brand } from "../types";
import CustomSelect from "../components/ui/CustomSelect";
import { createPortal } from "react-dom";

import { useToast } from "../hooks/useToast";

const ModalWrapper = ({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) => {
  const modalRoot = document.getElementById("modal-root");
  if (!modalRoot) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md select-none">
      <div className="fixed inset-0" onClick={onClose}></div>

      <motion.div
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="relative z-10 w-full max-w-xl bg-white dark:bg-slate-800 rounded-[2.5rem] md:rounded-[3.5rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-white/20 dark:border-slate-700"
      >
        {children}
      </motion.div>
    </div>,
    modalRoot,
  );
};

const ProductManagement: React.FC = () => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<
    "products" | "categories" | "brands"
  >("products");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageVersion, setImageVersion] = useState(() => Date.now());

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [confirmingProduct, setConfirmingProduct] = useState<Product | null>(
    null,
  );
  const [togglingStatus, setTogglingStatus] = useState(false);

  const statusOptions = [
    { id: "active", name: "Đang hoạt động" },
    { id: "inactive", name: "Ngừng kinh doanh" },
  ];

  const token =
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access_token");

  const fetchProducts = async () => {
    const res = await authFetch(`${API_BASE}/products`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      setProducts(await res.json());
    }
  };

  const fetchBrands = async () => {
    const res = await authFetch(`${API_BASE}/brands`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      setBrands(await res.json());
    }
  };

  const authFetch = async (url: string, options: RequestInit = {}) => {
    const token =
      localStorage.getItem("access_token") ||
      sessionStorage.getItem("access_token");

    let res = await fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });

    if (res.status === 401) {
      const refreshToken =
        localStorage.getItem("refresh_token") ||
        sessionStorage.getItem("refresh_token");

      const refreshRes = await fetch(`${API_BASE}/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!refreshRes.ok) {
        window.location.href = "/login";
        throw new Error("Unauthorized");
      }

      const data = await refreshRes.json();
      localStorage.setItem("access_token", data.access_token);

      res = await fetch(url, {
        ...options,
        headers: {
          ...(options.headers || {}),
          Authorization: `Bearer ${data.access_token}`,
        },
      });
    }

    return res;
  };

  const fetchCategories = async () => {
    const res = await authFetch(`${API_BASE}/product-categories`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      setCategories(await res.json());
    }
  };

  // Chặn cuộn trang khi modal mở
  useEffect(() => {
    fetchProducts();
    fetchBrands();
    fetchCategories();
  }, []);

  const baseUnitOptions = useMemo(() => {
    const units = new Map<string, string>();

    ["Chai", "Túi", "Hộp", "Can"].forEach((unit) =>
      units.set(unit.toLocaleLowerCase("vi-VN"), unit),
    );
    products.forEach((product) => {
      const unit = product.base_unit?.trim();
      if (unit) units.set(unit.toLocaleLowerCase("vi-VN"), unit);
    });

    return Array.from(units.values())
      .sort((a, b) => a.localeCompare(b, "vi"))
      .map((unit) => ({ id: unit, name: unit }));
  }, [products]);

  const [formData, setFormData] = useState({
    sku: "",
    name: "",
    brand_id: "",
    category_id: "",
    base_unit: "",
    case_unit: "Thùng", // 🔥 mặc định luôn
    units_per_case: "",
    price_base: "",
    price_case: "",
    weight: "",
    volume: "",
    barcode: "",
    status: "active",
  });

  const buildImageUrl = (path?: string) => {
    if (!path) return null;
    const baseUrl = path.startsWith("http")
      ? path
      : `${API_BASE.replace(/\/$/, "")}${path}`;
    const separator = baseUrl.includes("?") ? "&" : "?";
    return `${baseUrl}${separator}v=${imageVersion}`;
  };

  const handleOpenModal = (item: Product | null = null) => {
    if (item) {
      setEditingItem(item);
      setImagePreview(
        item.image_url ? buildImageUrl(item.image_url) || null : null,
      );
      setImageFile(null);

      setFormData({
        sku: item.sku || "",
        name: item.name || "",
        brand_id: item.brand_id?.toString() || "",
        category_id: item.category_id?.toString() || "",
        base_unit: item.base_unit || "",
        case_unit: item.case_unit || "Thùng",
        units_per_case: item.units_per_case?.toString() || "",
        price_base: item.price_base?.toString() || "",
        price_case: item.price_case?.toString() || "",
        weight: item.weight?.toString() || "",
        volume: item.volume?.toString() || "",
        barcode: item.barcode || "",
        status: item.status || "active",
      });
    } else {
      setImagePreview(null);
      setImageFile(null);
      setEditingItem(null);
      setFormData({
        sku: "",
        name: "",
        brand_id: "",
        category_id: "",
        base_unit: "",
        case_unit: "Thùng",
        units_per_case: "",
        price_base: "",
        price_case: "",
        weight: "",
        volume: "",
        barcode: "",
        status: "active",
      });
    }

    setIsModalOpen(true);
  };

  const handlePriceChange = (value: string) => {
    if (value === "") {
      setFormData({ ...formData, price_base: "" });
      return;
    }

    const val = parseInt(value);
    if (isNaN(val) || val < 0) {
      setFormData({ ...formData, price_base: "0" });
    } else {
      setFormData({ ...formData, price_base: val.toString() });
    }
  };

  const handleToggleProductStatus = async () => {
    if (!confirmingProduct) return;

    const newStatus =
      confirmingProduct.status === "active" ? "inactive" : "active";

    try {
      setTogglingStatus(true);

      const res = await authFetch(
        `${API_BASE}/products/${confirmingProduct.sku}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...confirmingProduct,
            status: newStatus,
          }),
        },
      );

      if (!res.ok) {
        showToast("Không thể cập nhật trạng thái", "danger");
        return;
      }

      await fetchProducts();

      showToast(
        newStatus === "inactive" ? "Đã khóa sản phẩm" : "Đã mở lại sản phẩm",
        "success",
      );

      setConfirmingProduct(null);
    } catch {
      showToast("Có lỗi xảy ra", "danger");
    } finally {
      setTogglingStatus(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmitting) return;

    setIsSubmitting(true);
    setUploadProgress(0);

    try {
      let categoryId = String(formData.category_id || "");
      let brandId = String(formData.brand_id || "");
      const baseUnit = String(formData.base_unit || "")
        .replace(/^__new__/, "")
        .trim();

      if (!baseUnit) {
        showToast("Vui lòng chọn hoặc tạo đơn vị bán lẻ", "warning");
        return;
      }

      // ===== CREATE CATEGORY =====
      if (categoryId.startsWith("__new__")) {
        const name = categoryId.replace("__new__", "").trim();

        const res = await authFetch(`${API_BASE}/product-categories`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });

        if (!res.ok) throw new Error("Category error");

        const newCategory = await res.json();
        setCategories((prev) => [...prev, newCategory]);
        categoryId = newCategory.id.toString();
      }

      // ===== CREATE BRAND =====
      if (brandId.startsWith("__new__")) {
        const name = brandId.replace("__new__", "").trim();

        const res = await authFetch(`${API_BASE}/brands`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });

        if (!res.ok) throw new Error("Brand error");

        const newBrand = await res.json();
        setBrands((prev) => [...prev, newBrand]);
        brandId = newBrand.id.toString();
      }

      // ===== CREATE PRODUCT =====
      const payload = {
        sku: formData.sku.toUpperCase(),
        name: formData.name,
        brand_id: Number(brandId),
        category_id: Number(categoryId),
        base_unit: baseUnit,
        case_unit: "Thùng",
        units_per_case: formData.units_per_case
          ? Number(formData.units_per_case)
          : null,
        price_base: Number(formData.price_base),
        price_case: formData.price_case ? Number(formData.price_case) : null,
        weight: formData.weight ? Number(formData.weight) : null,
        volume: formData.volume ? Number(formData.volume) : null,
        barcode: formData.barcode || null,
        status: formData.status || "active",
      };

      const url = editingItem
        ? `${API_BASE}/products/${editingItem.sku}`
        : `${API_BASE}/products`;

      const method = editingItem ? "PUT" : "POST";

      const res = await authFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        if (res.status === 409) {
          showToast("Mã sản phẩm đã tồn tại, vui lòng dùng mã khác", "danger");
          return;
        }
        throw new Error("Product error");
      }

      const result = await res.json();
      const finalSku = editingItem ? editingItem.sku : result.sku;

      // ===== UPLOAD IMAGE WITH PROGRESS =====
      if (imageFile) {
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          const formDataUpload = new FormData();
          formDataUpload.append("image", imageFile);

          xhr.open("POST", `${API_BASE}/products/${finalSku}/upload-image`);

          const token =
            localStorage.getItem("access_token") ||
            sessionStorage.getItem("access_token");

          xhr.setRequestHeader("Authorization", `Bearer ${token}`);

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const percent = Math.round((event.loaded / event.total) * 100);
              setUploadProgress(percent);
            }
          };

          xhr.onload = () => {
            if (xhr.status === 200) resolve();
            else reject();
          };

          xhr.onerror = reject;
          xhr.send(formDataUpload);
        });
      }

      await fetchProducts();

      showToast(
        editingItem
          ? "Cập nhật sản phẩm thành công"
          : "Thêm sản phẩm thành công",
        "success",
      );

      setIsModalOpen(false);
      setImageFile(null);
      setImagePreview(null);
    } catch (error) {
      console.error(error);
      showToast("Có lỗi xảy ra", "danger");
    } finally {
      setIsSubmitting(false);
      setUploadProgress(0);
    }
  };

  // ===== HELPER FORMAT MONEY =====
  const formatCurrency = (value: string) => {
    if (!value) return "";
    const number = Number(value.replace(/\D/g, ""));
    if (!number) return "";
    return number.toLocaleString("vi-VN");
  };

  const parseCurrency = (value: string) => {
    return value.replace(/\D/g, "");
  };

  // ===== AUTO CALC PRICE =====
  const handlePriceBaseChange = (value: string) => {
    const raw = parseCurrency(value);
    const units = Number(formData.units_per_case);

    setFormData((prev) => ({
      ...prev,
      price_base: raw,
      price_case:
        units > 0 && raw ? (Number(raw) * units).toString() : prev.price_case,
    }));
  };

  const handlePriceCaseChange = (value: string) => {
    const raw = parseCurrency(value);
    const units = Number(formData.units_per_case);

    setFormData((prev) => ({
      ...prev,
      price_case: raw,
      price_base:
        units > 0 && raw
          ? Math.floor(Number(raw) / units).toString()
          : prev.price_base,
    }));
  };

  const handleUnitsChange = (value: string) => {
    const units = Number(value);

    setFormData((prev) => ({
      ...prev,
      units_per_case: value,
      price_case:
        units > 0 && prev.price_base
          ? (Number(prev.price_base) * units).toString()
          : prev.price_case,
    }));
  };

  const filteredItems = useMemo(() => {
    const searchLower = searchTerm.toLowerCase();

    if (activeTab === "products") {
      return products.filter((p) => {
        const brandName =
          brands.find((b) => Number(b.id) === Number(p.brand_id))?.name || "";

        const categoryName =
          categories.find((c) => Number(c.id) === Number(p.category_id))
            ?.name || "";

        return (
          p.name.toLowerCase().includes(searchLower) ||
          p.sku.toLowerCase().includes(searchLower) ||
          brandName.toLowerCase().includes(searchLower) ||
          categoryName.toLowerCase().includes(searchLower)
        );
      });
    }

    if (activeTab === "categories") {
      return categories.filter((c) =>
        c.name.toLowerCase().includes(searchLower),
      );
    }

    return brands.filter((b) => b.name.toLowerCase().includes(searchLower));
  }, [activeTab, products, categories, brands, searchTerm]);

  return (
    <div className="space-y-6 pb-24 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3">
            <div className="w-10 h-10 bg-nm/10 rounded-2xl flex items-center justify-center text-nm">
              <i className="fa-solid fa-boxes-stacked"></i>
            </div>
            Danh Mục Hàng Hóa
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mt-1">
            Hệ thống đang quản lý {products.length} mã SKU hoạt động
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center justify-center gap-3 px-8 py-4 bg-nm text-white rounded-[1.5rem] font-black text-sm hover:bg-nm-hover transition-all shadow-xl shadow-nm/20 active:scale-95 uppercase tracking-widest"
        >
          <i className="fa-solid fa-plus text-lg"></i> Thêm mới
        </button>
      </div>

      <div className="flex p-1.5 bg-slate-100 dark:bg-slate-800/50 rounded-[1.5rem] w-full md:w-fit overflow-x-auto scrollbar-hide border border-slate-200 dark:border-slate-700">
        {(["products", "categories", "brands"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              setSearchTerm("");
            }}
            className={`whitespace-nowrap flex-1 md:flex-none px-8 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? "bg-white dark:bg-slate-700 text-nm shadow-md" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
          >
            {tab === "products"
              ? "Sản phẩm"
              : tab === "categories"
                ? "Danh mục"
                : "Nhãn hiệu"}
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 overflow-hidden shadow-sm">
        <div className="p-6 md:p-8 border-b border-slate-50 dark:border-slate-700">
          <div className="relative w-full max-w-md group">
            <i className="fa-solid fa-magnifying-glass absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-nm transition-colors"></i>
            <input
              type="text"
              placeholder={`Tìm mã hoặc tên ${activeTab === "products" ? "sản phẩm" : activeTab === "categories" ? "danh mục" : "nhãn hiệu"}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-14 pr-6 py-4 w-full text-sm bg-slate-50 dark:bg-slate-900 border-2 border-transparent rounded-[1.5rem] focus:ring-0 focus:border-nm focus:bg-white dark:focus:bg-slate-800 dark:text-white transition-all outline-none font-bold shadow-inner"
            />
          </div>
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50/50 dark:bg-slate-900/50 text-slate-400 uppercase text-[10px] font-black tracking-widest">
              {activeTab === "products" ? (
                <tr>
                  <th className="px-10 py-6 text-center">Mã SKU</th>
                  <th className="px-10 py-6">Sản phẩm</th>
                  <th className="px-10 py-6">Danh mục/Hãng</th>
                  <th className="px-10 py-6 text-right">Giá bán</th>
                  <th className="px-10 py-6 text-right">Thao tác</th>
                </tr>
              ) : (
                <tr>
                  <th className="px-10 py-6">ID Hệ thống</th>
                  <th className="px-10 py-6">Tên phân loại</th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
              {activeTab === "products"
                ? (filteredItems as Product[]).map((product) => (
                    <tr
                      key={product.sku}
                      className="hover:bg-nm/5 transition-all group"
                    >
                      <td className="px-10 py-6 text-center font-mono font-black text-nm">
                        {product.sku}
                      </td>
                      <td className="px-10 py-6">
                        <div className="flex items-center gap-4">
                          <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-100">
                            {product.image_url ? (
                              <img
                                src={buildImageUrl(product.image_url) || ""}
                                alt={product.name}
                                className="w-full h-full object-contain bg-white"
                              />
                            ) : (
                              <i className="fa-solid fa-image text-slate-300 text-lg flex items-center justify-center h-full"></i>
                            )}
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <div className="font-black text-slate-900 dark:text-white text-base leading-tight">
                                {product.name}
                              </div>

                              {product.status === "inactive" && (
                                <span className="text-[9px] px-2 py-1 bg-rose-100 text-rose-600 rounded-lg font-black uppercase">
                                  Đã khóa
                                </span>
                              )}
                            </div>

                            <div className="text-[10px] text-slate-400 font-black uppercase tracking-tighter">
                              {product.case_unit || "-"}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-10 py-6">
                        <div className="text-slate-700 dark:text-slate-300 font-bold">
                          {
                            categories.find(
                              (c) =>
                                Number(c.id) === Number(product.category_id),
                            )?.name
                          }
                        </div>
                        <div className="text-[10px] text-nm/70 font-black uppercase tracking-widest">
                          {
                            brands.find(
                              (b) => Number(b.id) === Number(product.brand_id),
                            )?.name
                          }
                        </div>
                      </td>
                      <td className="px-10 py-6 font-black text-slate-900 dark:text-white text-right text-base">
                        {Number(product.price_base).toLocaleString("vi-VN")}đ
                      </td>
                      <td className="px-10 py-6 text-right">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleOpenModal(product)}
                            className="w-10 h-10 flex items-center justify-center text-blue-600 bg-blue-50 dark:bg-blue-900/20 rounded-xl hover:scale-110 active:scale-95 transition-all"
                          >
                            <i className="fa-solid fa-pen-to-square"></i>
                          </button>
                          <button
                            onClick={() => setConfirmingProduct(product)}
                            className={`w-10 h-10 flex items-center justify-center rounded-xl hover:scale-110 active:scale-95 transition-all ${
                              product.status === "active"
                                ? "text-amber-600 bg-amber-50"
                                : "text-emerald-600 bg-emerald-50"
                            }`}
                          >
                            <i
                              className={`fa-solid ${
                                product.status === "active"
                                  ? "fa-lock"
                                  : "fa-lock-open"
                              }`}
                            ></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                : filteredItems.map((item: any) => (
                    <tr key={item.id} className="hover:bg-nm/5 transition-all">
                      <td className="px-10 py-6 font-mono font-black text-slate-300 dark:text-slate-600">
                        {item.id}
                      </td>
                      <td className="px-10 py-6 font-black text-slate-900 dark:text-white">
                        {item.name}
                      </td>
                    </tr>
                  ))}
              {filteredItems.length === 0 && (
                <tr>
                  <td
                    colSpan={activeTab === "products" ? 5 : 2}
                    className="py-20"
                  >
                    <div className="flex flex-col items-center justify-center text-center text-slate-400">
                      <i className="fa-solid fa-folder-open text-5xl mb-6 opacity-40"></i>
                      <span className="font-black uppercase tracking-widest text-xs">
                        Không tìm thấy kết quả
                      </span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="md:hidden divide-y divide-slate-50 dark:divide-slate-700">
          {activeTab === "products"
            ? (filteredItems as Product[]).map((product) => (
                <div key={product.sku} className="p-6 space-y-5">
                  <div className="w-full flex justify-center mb-4">
                    <div className="w-24 h-24 rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-700">
                      {product.image_url ? (
                        <img
                          src={buildImageUrl(product.image_url) || ""}
                          alt={product.name}
                          className="w-full h-full object-contain bg-white"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <i className="fa-solid fa-image text-2xl text-slate-300"></i>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-[10px] font-black text-nm px-3 py-1 bg-nm/10 rounded-lg uppercase tracking-tighter">
                          {product.sku}
                        </span>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          {
                            brands.find(
                              (b) => Number(b.id) === Number(product.brand_id),
                            )?.name
                          }
                        </span>
                      </div>
                      <h4 className="font-black text-slate-900 dark:text-white text-lg leading-tight mb-2">
                        {product.name}
                      </h4>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                        {
                          categories.find(
                            (c) => Number(c.id) === Number(product.category_id),
                          )?.name
                        }{" "}
                        •{product.case_unit || "-"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-nm text-lg">
                        {Number(product.price_base).toLocaleString("vi-VN")}đ
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <button
                      onClick={() => handleOpenModal(product)}
                      className="flex-1 flex items-center justify-center gap-3 py-4 bg-slate-50 dark:bg-slate-700 text-blue-600 rounded-[1.25rem] text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all shadow-sm"
                    >
                      <i className="fa-solid fa-edit text-sm"></i> SỬA
                    </button>
                    <button
                      onClick={() => setConfirmingProduct(product)}
                      className={`w-16 flex items-center justify-center py-4 rounded-[1.25rem] active:scale-95 transition-all shadow-sm ${
                        product.status === "active"
                          ? "bg-amber-50 text-amber-600"
                          : "bg-emerald-50 text-emerald-600"
                      }`}
                    >
                      <i
                        className={`fa-solid ${
                          product.status === "active"
                            ? "fa-lock"
                            : "fa-lock-open"
                        } text-lg`}
                      ></i>
                    </button>
                  </div>
                </div>
              ))
            : filteredItems.map((item: any) => (
                <div
                  key={item.id}
                  className="p-6 flex items-center justify-between"
                >
                  <div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                      {item.id}
                    </span>
                    <h4 className="font-black text-slate-900 dark:text-white text-base">
                      {item.name}
                    </h4>
                  </div>
                  <div className="flex gap-2"></div>
                </div>
              ))}
        </div>
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <ModalWrapper onClose={() => setIsModalOpen(false)}>
            {/* ===== HEADER ===== */}
            <div className="p-8 pb-4 flex justify-between items-center border-b border-slate-50 dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0 sticky top-0 z-10">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight text-nm">
                  {editingItem ? "Cập nhật sản phẩm" : "Thêm sản phẩm mới"}
                </h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                  Điền thông tin chi tiết vào hệ thống
                </p>
              </div>

              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-300 hover:text-slate-500 transition-transform"
              >
                <i className="fa-solid fa-circle-xmark text-2xl"></i>
              </button>
            </div>

            {/* ===== BODY ===== */}
            <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-hide">
              <form onSubmit={handleSubmit} className="space-y-8">
                {/* ===== BASIC INFO ===== */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* SKU */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                      Mã SKU *
                    </label>

                    <div className="relative group">
                      <i
                        className="
          fa-solid fa-barcode
          absolute left-5 top-1/2 -translate-y-1/2
          text-slate-300
          group-focus-within:text-nm
          transition-colors duration-200
        "
                      ></i>

                      <input
                        required
                        placeholder="VD: SP001, 1001..."
                        value={formData.sku}
                        disabled={!!editingItem}
                        onChange={(e) =>
                          setFormData({ ...formData, sku: e.target.value })
                        }
                        className="
          w-full pl-14 pr-4 py-4 rounded-2xl
          bg-slate-50 dark:bg-slate-700
          border-2 border-transparent
          focus:border-nm
          font-bold outline-none shadow-inner
          transition-all duration-200

          placeholder:text-slate-400
          dark:placeholder:text-slate-500

          group-focus-within:shadow-[0_0_0_3px_rgba(59,130,246,0.15)]

          disabled:opacity-60
          disabled:cursor-not-allowed
        "
                      />
                    </div>
                  </div>

                  {/* NAME */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                      Tên sản phẩm *
                    </label>

                    <div className="relative group">
                      <i
                        className="
          fa-solid fa-box
          absolute left-5 top-1/2 -translate-y-1/2
          text-slate-300
          group-focus-within:text-nm
          transition-colors duration-200
        "
                      ></i>

                      <input
                        required
                        placeholder="Nhập tên đầy đủ của sản phẩm..."
                        value={formData.name}
                        onChange={(e) =>
                          setFormData({ ...formData, name: e.target.value })
                        }
                        className="
          w-full pl-14 pr-4 py-4 rounded-2xl
          bg-slate-50 dark:bg-slate-700
          border-2 border-transparent
          focus:border-nm
          font-bold outline-none shadow-inner
          transition-all duration-200

          placeholder:text-slate-400
          dark:placeholder:text-slate-500

          group-focus-within:shadow-[0_0_0_3px_rgba(59,130,246,0.15)]
        "
                      />
                    </div>
                  </div>
                </div>

                {/* ===== IMAGE ===== */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    Hình ảnh sản phẩm
                  </label>

                  <div className="flex items-center gap-6">
                    {/* Preview */}
                    <div className="w-28 h-28 rounded-2xl bg-slate-100 dark:bg-slate-700 overflow-hidden flex items-center justify-center">
                      {imagePreview ? (
                        <img
                          src={imagePreview}
                          alt="preview"
                          className="w-full h-full object-contain bg-white"
                        />
                      ) : (
                        <i className="fa-solid fa-image text-3xl text-slate-300"></i>
                      )}
                    </div>

                    {/* Upload */}
                    <label className="cursor-pointer px-6 py-3 bg-slate-100 dark:bg-slate-700 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-200 transition-all">
                      Chọn ảnh
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(e) => {
                          if (!e.target.files) return;

                          const file = e.target.files[0];
                          setImageFile(file);
                          setImagePreview(URL.createObjectURL(file));
                        }}
                      />
                    </label>
                  </div>
                </div>

                {/* ===== CATEGORY & BRAND ===== */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <CustomSelect
                    label="Nhóm hàng"
                    options={categories}
                    value={formData.category_id}
                    allowCreate
                    onChange={(id) =>
                      setFormData({ ...formData, category_id: id })
                    }
                  />

                  <CustomSelect
                    label="Thương hiệu"
                    options={brands}
                    value={formData.brand_id}
                    allowCreate
                    onChange={(id) =>
                      setFormData({ ...formData, brand_id: id })
                    }
                  />
                </div>

                {/* ===== UNIT INFO ===== */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* BASE UNIT */}
                  <CustomSelect
                    label="Đơn vị bán lẻ *"
                    options={baseUnitOptions}
                    value={formData.base_unit}
                    icon="fa-scale-balanced"
                    allowCreate
                    onChange={(id) =>
                      setFormData({ ...formData, base_unit: id })
                    }
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {/* PRICE BASE */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                      Giá lẻ (VNĐ) *
                    </label>

                    <div className="relative group">
                      <i
                        className="
          fa-solid fa-dong-sign
          absolute left-5 top-1/2 -translate-y-1/2
          text-slate-300
          group-focus-within:text-nm
          transition-colors duration-200
        "
                      ></i>

                      <input
                        required
                        placeholder="Nhập giá bán lẻ..."
                        value={formatCurrency(formData.price_base)}
                        onChange={(e) => handlePriceBaseChange(e.target.value)}
                        className="
          w-full pl-14 pr-4 py-4 rounded-2xl
          bg-slate-50 dark:bg-slate-700
          border-2 border-transparent
          focus:border-nm
          font-bold outline-none shadow-inner
          text-right
          transition-all duration-200

          placeholder:text-slate-400
          dark:placeholder:text-slate-500

          group-focus-within:shadow-[0_0_0_3px_rgba(59,130,246,0.15)]
        "
                      />
                    </div>
                  </div>

                  {/* UNITS */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                      Số lượng / thùng
                    </label>

                    <div className="relative group">
                      <i
                        className="
          fa-solid fa-boxes-stacked
          absolute left-5 top-1/2 -translate-y-1/2
          text-slate-300
          group-focus-within:text-nm
          transition-colors duration-200
        "
                      ></i>

                      <input
                        type="number"
                        min="0"
                        placeholder="VD: 24"
                        value={formData.units_per_case}
                        onChange={(e) => handleUnitsChange(e.target.value)}
                        className="
          w-full pl-14 pr-4 py-4 rounded-2xl
          bg-slate-50 dark:bg-slate-700
          border-2 border-transparent
          focus:border-nm
          font-bold outline-none shadow-inner
          text-right
          transition-all duration-200

          placeholder:text-slate-400
          dark:placeholder:text-slate-500

          group-focus-within:shadow-[0_0_0_3px_rgba(59,130,246,0.15)]
        "
                      />
                    </div>
                  </div>

                  {/* PRICE CASE */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                      Giá thùng (VNĐ)
                    </label>

                    <div className="relative group">
                      <i
                        className="
          fa-solid fa-warehouse
          absolute left-5 top-1/2 -translate-y-1/2
          text-slate-300
          group-focus-within:text-nm
          transition-colors duration-200
        "
                      ></i>

                      <input
                        placeholder="Tự động tính nếu có SL/thùng"
                        value={formatCurrency(formData.price_case)}
                        onChange={(e) => handlePriceCaseChange(e.target.value)}
                        className="
          w-full pl-14 pr-4 py-4 rounded-2xl
          bg-slate-50 dark:bg-slate-700
          border-2 border-transparent
          focus:border-nm
          font-bold outline-none shadow-inner
          text-right
          transition-all duration-200

          placeholder:text-slate-400
          dark:placeholder:text-slate-500

          group-focus-within:shadow-[0_0_0_3px_rgba(59,130,246,0.15)]
        "
                      />
                    </div>
                  </div>
                </div>

                {/* ===== PACKAGING ===== */}
                {/* ===== PACKAGING ===== */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {/* WEIGHT */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                      Trọng lượng (kg)
                    </label>

                    <div className="relative group">
                      <i
                        className="
          fa-solid fa-weight-scale
          absolute left-5 top-1/2 -translate-y-1/2
          text-slate-300
          group-focus-within:text-nm
          transition-colors duration-200
        "
                      ></i>

                      <input
                        type="number"
                        step="0.01"
                        placeholder="VD: 0.5"
                        value={formData.weight}
                        onChange={(e) =>
                          setFormData({ ...formData, weight: e.target.value })
                        }
                        className="
          w-full pl-14 pr-4 py-4 rounded-2xl
          bg-slate-50 dark:bg-slate-700
          border-2 border-transparent
          focus:border-nm
          font-bold outline-none shadow-inner
          transition-all duration-200

          placeholder:text-slate-400
          dark:placeholder:text-slate-500

          group-focus-within:shadow-[0_0_0_3px_rgba(59,130,246,0.15)]
        "
                      />
                    </div>
                  </div>

                  {/* VOLUME */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                      Thể tích (m³)
                    </label>

                    <div className="relative group">
                      <i
                        className="
          fa-solid fa-cube
          absolute left-5 top-1/2 -translate-y-1/2
          text-slate-300
          group-focus-within:text-nm
          transition-colors duration-200
        "
                      ></i>

                      <input
                        type="number"
                        step="0.001"
                        placeholder="VD: 0.002"
                        value={formData.volume}
                        onChange={(e) =>
                          setFormData({ ...formData, volume: e.target.value })
                        }
                        className="
          w-full pl-14 pr-4 py-4 rounded-2xl
          bg-slate-50 dark:bg-slate-700
          border-2 border-transparent
          focus:border-nm
          font-bold outline-none shadow-inner
          transition-all duration-200

          placeholder:text-slate-400
          dark:placeholder:text-slate-500

          group-focus-within:shadow-[0_0_0_3px_rgba(59,130,246,0.15)]
        "
                      />
                    </div>
                  </div>

                  {/* BARCODE */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                      Mã vạch
                    </label>

                    <div className="relative group">
                      <i
                        className="
          fa-solid fa-barcode
          absolute left-5 top-1/2 -translate-y-1/2
          text-slate-300
          group-focus-within:text-nm
          transition-colors duration-200
        "
                      ></i>

                      <input
                        placeholder="EAN, UPC..."
                        value={formData.barcode}
                        onChange={(e) =>
                          setFormData({ ...formData, barcode: e.target.value })
                        }
                        className="
          w-full pl-14 pr-4 py-4 rounded-2xl
          bg-slate-50 dark:bg-slate-700
          border-2 border-transparent
          focus:border-nm
          font-bold outline-none shadow-inner
          transition-all duration-200

          placeholder:text-slate-400
          dark:placeholder:text-slate-500

          group-focus-within:shadow-[0_0_0_3px_rgba(59,130,246,0.15)]
        "
                      />
                    </div>
                  </div>
                </div>

                {/* ===== STATUS ===== */}
                <CustomSelect
                  label="Trạng thái"
                  options={statusOptions}
                  value={formData.status}
                  icon="fa-toggle-on"
                  onChange={(id) => setFormData({ ...formData, status: id })}
                />

                {uploadProgress > 0 && uploadProgress < 100 && (
                  <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-nm transition-all"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                )}

                {/* ===== FOOTER ===== */}
                <div className="flex gap-4 pt-6">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 py-4 bg-slate-100 dark:bg-slate-700 rounded-2xl font-black text-xs uppercase text-slate-400 active:scale-95"
                  >
                    Hủy
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 py-4 bg-nm text-white rounded-2xl font-black text-xs uppercase shadow-2xl shadow-nm/30 active:scale-95 disabled:opacity-60"
                  >
                    {isSubmitting ? "Đang xử lý..." : "Lưu"}
                  </button>
                </div>
              </form>
            </div>
          </ModalWrapper>
        )}

        {confirmingProduct && (
          <ModalWrapper onClose={() => setConfirmingProduct(null)}>
            <div className="p-10 text-center">
              <div
                className={`w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto mb-6 text-4xl shadow-inner ${
                  confirmingProduct.status === "active"
                    ? "bg-amber-100 text-amber-600"
                    : "bg-emerald-100 text-emerald-600"
                }`}
              >
                <i
                  className={`fa-solid ${
                    confirmingProduct.status === "active"
                      ? "fa-lock"
                      : "fa-lock-open"
                  }`}
                ></i>
              </div>

              <h3 className="text-2xl font-black dark:text-white uppercase tracking-tight mb-2">
                {confirmingProduct.status === "active"
                  ? "Khóa sản phẩm?"
                  : "Mở lại sản phẩm?"}
              </h3>

              <p className="text-sm text-slate-500 font-medium mb-8">
                Bạn đang thao tác với sản phẩm:
                <br />
                <span className="text-nm font-black">
                  {confirmingProduct.name}
                </span>
              </p>

              <div className="flex gap-4">
                <button
                  onClick={() => setConfirmingProduct(null)}
                  className="flex-1 py-4 bg-slate-100 dark:bg-slate-700 rounded-2xl font-black uppercase text-xs tracking-widest text-slate-400 transition-all active:scale-95"
                >
                  HỦY
                </button>

                <button
                  onClick={handleToggleProductStatus}
                  disabled={togglingStatus}
                  className={`flex-1 py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl transition-all active:scale-95 ${
                    confirmingProduct.status === "active"
                      ? "bg-amber-500 text-white shadow-amber-500/30"
                      : "bg-emerald-500 text-white shadow-emerald-500/30"
                  }`}
                >
                  {togglingStatus ? (
                    <i className="fa-solid fa-spinner animate-spin"></i>
                  ) : confirmingProduct.status === "active" ? (
                    "XÁC NHẬN KHÓA"
                  ) : (
                    "XÁC NHẬN MỞ"
                  )}
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ProductManagement;
