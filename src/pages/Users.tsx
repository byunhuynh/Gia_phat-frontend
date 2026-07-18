import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useLayoutEffect,
} from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { User, Role } from "../types";
import { fetchProvinces, LocationItem } from "../utils/location";
import {
  API_BASE,
  ROLE_LABELS,
  ROLE_COLORS,
  ROLE_HIERARCHY,
} from "../constants";
import { useToast } from "../hooks/useToast";

interface UsersPageProps {
  isDarkMode: boolean;
  currentUser: User | null;
}

const calculatePasswordStrength = (password: string) => {
  let score = 0;

  if (!password) return { score: 0, label: "", color: "" };

  if (password.length >= 8) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const levels = [
    { label: "Rất yếu", color: "bg-rose-500" },
    { label: "Yếu", color: "bg-orange-500" },
    { label: "Trung bình", color: "bg-amber-500" },
    { label: "Mạnh", color: "bg-emerald-500" },
    { label: "Rất mạnh", color: "bg-green-600" },
  ];

  return {
    score,
    label: levels[score - 1]?.label || "",
    color: levels[score - 1]?.color || "",
  };
};

const ModalPortal = ({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) => {
  const modalRoot = document.getElementById("modal-root");
  if (!modalRoot) return null;
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-md p-0 sm:p-4 select-none">
      <div className="fixed inset-0 cursor-pointer" onClick={onClose}></div>
      <div className="relative z-10 w-full sm:max-w-xl bg-white dark:bg-slate-800 rounded-t-[2rem] rounded-b-none sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[92dvh] sm:max-h-[90dvh] overflow-hidden animate-sheet-up sm:animate-fade-in border border-white/20 dark:border-slate-700">
        {children}
      </div>
    </div>,
    modalRoot,
  );
};

const ROLE_PREFIX: Record<Role, string> = {
  accountant: "KT",
  admin: "ADM",
  director: "RSM",
  regional_director: "ASM",
  supervisor: "SS",
  sales: "SALE",
};

const ActionMenuPortal = ({
  anchorRect,
  onClose,
  user,
  currentUser,
  onToggleLock,
  onEdit,
}: {
  anchorRect: DOMRect;
  onClose: () => void;
  user: User;
  currentUser: User | null;
  onToggleLock: (user: User) => void;
  onEdit: (user: User) => void;
}) => {
  const modalRoot = document.getElementById("modal-root");
  if (!modalRoot) return null;

  const isLocked = user.status === "inactive";
  const isSelf = user.id === currentUser?.id;

  const menuWidth = 180;
  const menuHeight = 160; // Ước tính chiều cao menu

  let left = anchorRect.left - menuWidth + anchorRect.width;
  if (left < 10) left = 10;
  if (left + menuWidth > window.innerWidth - 10)
    left = window.innerWidth - menuWidth - 10;

  // Tính toán vị trí top/bottom
  const spaceBelow = window.innerHeight - anchorRect.bottom;
  let top = anchorRect.bottom + 4;
  if (spaceBelow < menuHeight) {
    top = anchorRect.top - menuHeight - 4;
  }

  const menuStyle: React.CSSProperties = {
    position: "fixed",
    top: top,
    left: left,
    width: menuWidth,
    zIndex: 10000,
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999]" onClick={onClose}>
      <div
        style={menuStyle}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-100 dark:border-slate-700 overflow-hidden animate-fade-in"
      >
        <div className="p-1.5 space-y-1">
          <button
            onClick={() => {
              onEdit(user);
              onClose();
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg transition-colors"
          >
            <i className="fa-solid fa-user-pen text-nm w-4"></i> Sửa hồ sơ
          </button>

          <div className="h-px bg-slate-50 dark:bg-slate-700 my-1"></div>
          <button
            disabled={isSelf}
            onClick={() => {
              if (!isSelf) {
                onToggleLock(user);
                onClose();
              }
            }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-[11px] font-black rounded-lg transition-colors
    ${
      isSelf
        ? "text-slate-300 cursor-not-allowed"
        : isLocked
          ? "text-emerald-500 hover:bg-emerald-50"
          : "text-rose-500 hover:bg-rose-50"
    }`}
          >
            <i
              className={`fa-solid ${isLocked ? "fa-unlock" : "fa-lock"} w-4`}
            />
            {isLocked ? "Mở khóa" : "Tạm khóa"}
          </button>
        </div>
      </div>
    </div>,
    modalRoot,
  );
};

const UsersPage: React.FC<UsersPageProps> = ({ currentUser }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const location = useLocation();

  const [activeMenuUser, setActiveMenuUser] = useState<User | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  const { showToast } = useToast();
  const [provinces, setProvinces] = useState<LocationItem[]>([]);
  const [districts, setDistricts] = useState<LocationItem[]>([]);
  const [districtSearch, setDistrictSearch] = useState("");
  const [isDistrictDropdownOpen, setIsDistrictDropdownOpen] = useState(false);

  const districtDropdownRef = useRef<HTMLDivElement>(null);

  const isSelf = Boolean(
    editingUser && currentUser && editingUser.id === currentUser.id,
  );

  const [formData, setFormData] = useState({
    username: "",
    password: "",
    old_password: "",
    full_name: "",
    phone: "",
    email: "",
    role: "" as Role | "",
    manager_id: "" as string | number,
    province: "",
    district: "",
  });
  const passwordStrength = useMemo(
    () => calculatePasswordStrength(formData.password),
    [formData.password],
  );

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchProvinces();
        setProvinces(data);
      } catch {
        showToast("Không tải được danh sách tỉnh", "danger");
      }
    };

    load();
  }, []);

  const [showPassword, setShowPassword] = useState(false);
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const [roleOpenUp, setRoleOpenUp] = useState(false);
  const [isManagerDropdownOpen, setIsManagerDropdownOpen] = useState(false);
  const [managerOpenUp, setManagerOpenUp] = useState(false);

  const roleDropdownRef = useRef<HTMLDivElement>(null);
  const managerDropdownRef = useRef<HTMLDivElement>(null);

  const [isProvinceDropdownOpen, setIsProvinceDropdownOpen] = useState(false);
  const [provinceSearch, setProvinceSearch] = useState("");
  const [provinceOpenUp, setProvinceOpenUp] = useState(false);
  const [generatingCode, setGeneratingCode] = useState(false);

  // Commit: lấy manager nhanh bằng userMap
  const userMap = useMemo(() => {
    const map = new Map<number, User>();
    users.forEach((u) => map.set(u.id, u));
    return map;
  }, [users]);

  const selectedManager = formData.manager_id
    ? userMap.get(Number(formData.manager_id))
    : undefined;

  const lockProvinceBySupervisor =
    formData.role === "sales" && selectedManager?.role === "supervisor";

  const [usernameStatus, setUsernameStatus] = useState<
    "idle" | "checking" | "available" | "exists"
  >("idle");

  // role được phép nhập tay
  const CAN_MANUAL_EDIT_ROLES: Role[] = ["director", "regional_director"];

  const canManualEdit =
    !editingUser &&
    formData.role &&
    CAN_MANUAL_EDIT_ROLES.includes(formData.role as Role);

  // tất cả role đều generate, nhưng không cho generate khi đang sửa
  const canGenerateCode = Boolean(
    !editingUser && formData.role && formData.district,
  );

  const provinceDropdownRef = useRef<HTMLDivElement>(null);
  // Commit: ref kiểm soát request generate username để tránh race condition

  const generateRef = useRef(0);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const token =
      localStorage.getItem("access_token") ||
      sessionStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_BASE}/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setUsers(await res.json());
    } catch {
      showToast("Lỗi tải nhân sự", "danger");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  // Logic tính toán hướng mở cho dropdown
  const calculateDropdownDirection = (
    ref: React.RefObject<HTMLDivElement>,
    setOpenUp: (val: boolean) => void,
  ) => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setOpenUp(spaceBelow < 250);
    }
  };

  const filteredDistricts = useMemo(() => {
    return districts.filter((d) =>
      d.name.toLowerCase().includes(districtSearch.toLowerCase()),
    );
  }, [districts, districtSearch]);

  useLayoutEffect(() => {
    if (isRoleDropdownOpen)
      calculateDropdownDirection(roleDropdownRef, setRoleOpenUp);
  }, [isRoleDropdownOpen]);

  useLayoutEffect(() => {
    if (isManagerDropdownOpen)
      calculateDropdownDirection(managerDropdownRef, setManagerOpenUp);
  }, [isManagerDropdownOpen]);

  useLayoutEffect(() => {
    if (isProvinceDropdownOpen)
      calculateDropdownDirection(provinceDropdownRef, setProvinceOpenUp);
  }, [isProvinceDropdownOpen]);

  useEffect(() => {
    fetchUsers();
    const handleClickOutside = (e: MouseEvent) => {
      if (
        roleDropdownRef.current &&
        !roleDropdownRef.current.contains(e.target as Node)
      )
        setIsRoleDropdownOpen(false);
      if (
        managerDropdownRef.current &&
        !managerDropdownRef.current.contains(e.target as Node)
      )
        setIsManagerDropdownOpen(false);

      if (
        provinceDropdownRef.current &&
        !provinceDropdownRef.current.contains(e.target as Node)
      )
        setIsProvinceDropdownOpen(false);

      if (
        districtDropdownRef.current &&
        !districtDropdownRef.current.contains(e.target as Node)
      )
        setIsDistrictDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [fetchUsers]);

  const fetchDistricts = async (provinceCode: string) => {
    try {
      const res = await fetch(
        `https://provinces.open-api.vn/api/p/${provinceCode}?depth=2`,
      );

      const data = await res.json();

      setDistricts(data.districts || []);
    } catch {
      showToast("Không tải được danh sách huyện", "danger");
    }
  };

  // ==================================================
  // Nếu điều hướng từ header → mở sửa hồ sơ chính mình
  // ==================================================
  useEffect(() => {
    if (location.state?.editSelf && currentUser && users.length > 0) {
      const self = users.find((u) => u.id === currentUser.id) ?? currentUser;
      handleEditClick(self);
    }
  }, [location.state, currentUser, users]);
  const handleToggleLock = async (user: User) => {
    const token =
      localStorage.getItem("access_token") ||
      sessionStorage.getItem("access_token");

    try {
      const res = await fetch(`${API_BASE}/users/${user.id}/toggle-lock`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const error = await res.json();
        showToast(error.message || "Không thể cập nhật trạng thái", "danger");
        return;
      }

      const data = await res.json();

      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, status: data.status } : u)),
      );

      showToast("Cập nhật trạng thái thành công", "success");
    } catch {
      showToast("Mất kết nối server", "danger");
    }
  };

  const checkUsername = async (username: string) => {
    if (!username) {
      setUsernameStatus("idle");
      return;
    }

    const token =
      localStorage.getItem("access_token") ||
      sessionStorage.getItem("access_token");

    try {
      setUsernameStatus("checking");

      const res = await fetch(
        `${API_BASE}/users/check-username?username=${username}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!res.ok) {
        setUsernameStatus("idle");
        return;
      }

      const data = await res.json();

      if (data.exists) {
        setUsernameStatus("exists");
        showToast("Mã nhân viên đã tồn tại", "warning");
      } else {
        setUsernameStatus("available");
      }
    } catch {
      setUsernameStatus("idle");
    }
  };

  // Commit: generate username duy nhất và tránh race condition khi user đổi nhanh district/role
  const generateUniqueUsername = async (role: Role, district: string) => {
    const requestId = ++generateRef.current;

    const base = generateUsername(role, district);

    const token =
      localStorage.getItem("access_token") ||
      sessionStorage.getItem("access_token");

    try {
      const res = await fetch(
        `${API_BASE}/users/generate-username?base=${base}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!res.ok) return base;

      const data = await res.json();

      // Nếu request cũ → bỏ
      if (requestId !== generateRef.current) return base;

      return data.username;
    } catch {
      return base;
    }
  };

  // Commit: auto generate username khi chưa có username (tránh overwrite)
  useEffect(() => {
    if (editingUser) return;

    const run = async () => {
      if (formData.role && formData.district && !formData.username) {
        const username = await generateUniqueUsername(
          formData.role as Role,
          formData.district,
        );

        setFormData((prev) => ({
          ...prev,
          username,
        }));
      }
    };

    run();
  }, [formData.role, formData.district, editingUser]);

  useEffect(() => {
    if (!formData.username) {
      setUsernameStatus("idle");
      return;
    }

    // không check khi đang edit username cũ
    if (editingUser && formData.username === editingUser.username) {
      setUsernameStatus("available");
      return;
    }

    const timer = setTimeout(() => {
      checkUsername(formData.username);
    }, 500);

    return () => clearTimeout(timer);
  }, [formData.username, editingUser]);

  const handleOpenMenu = (e: React.MouseEvent, user: User) => {
    setMenuAnchor((e.currentTarget as HTMLElement).getBoundingClientRect());
    setActiveMenuUser(user);
  };

  const handleEditClick = (user: User) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      password: "",
      full_name: user.fullName,
      phone: user.phone || "",
      email: user.email || "",
      role: user.role,
      old_password: "",
      manager_id: user.manager_id || "",
      province: user.province || "",
      district: user.district || "",
    });
    setIsRoleDropdownOpen(false);
    setIsManagerDropdownOpen(false);
    setShowModal(true);
  };

  // Commit: lọc tỉnh theo quyền user và supervisor (fix lỗi undefined province)
  const availableProvinces = useMemo(() => {
    if (!currentUser) return provinces;

    const normalize = (v?: string) => (v || "").trim().toLowerCase();

    if (lockProvinceBySupervisor && selectedManager?.province) {
      return provinces.filter(
        (p) => normalize(p.name) === normalize(selectedManager.province),
      );
    }

    if (currentUser.role === "supervisor" && currentUser.province) {
      return provinces.filter(
        (p) => normalize(p.name) === normalize(currentUser.province),
      );
    }

    return provinces;
  }, [provinces, currentUser, lockProvinceBySupervisor, selectedManager]);

  // ✅ ADD filteredProvinces RIGHT HERE:
  const filteredProvinces = useMemo(() => {
    return availableProvinces.filter((p) =>
      p.name.toLowerCase().includes(provinceSearch.toLowerCase()),
    );
  }, [availableProvinces, provinceSearch]);

  const removeVietnameseTones = (str: string) => {
    return str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D");
  };

  const normalizeDistrict = (name: string) => {
    let lower = name.toLowerCase().trim();

    // 🔥 bỏ dấu tiếng Việt
    lower = removeVietnameseTones(lower);

    // quận số
    const qNum = lower.match(/^quan\s*(\d+)/);
    if (qNum) return `q${qNum[1]}`;

    // huyện số
    const hNum = lower.match(/^huyen\s*(\d+)/);
    if (hNum) return `h${hNum[1]}`;

    const clean = lower
      .replace(/^quan\s+/i, "")
      .replace(/^huyen\s+/i, "")
      .replace(/^thanh pho\s+/i, "")
      .trim();

    const words = clean.split(" ");

    if (words.length === 1) return words[0].slice(0, 2);

    return words.map((w) => w[0]).join("");
  };

  const generateUsername = (role: Role, district: string) => {
    const code = normalizeDistrict(district);

    const prefix = ROLE_PREFIX[role];

    return `${prefix}_${code}`.toLowerCase();
  };

  // ==================================================
  // Hàm lấy mã nhân viên từ backend để hiển thị preview
  // ==================================================

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingUser(null);
    setFormData({
      username: "",
      password: "",
      full_name: "",
      phone: "",
      email: "",
      role: "",
      manager_id: "",
      old_password: "",
      province: "",
      district: "",
    });
  };

  const groupedUsers = useMemo(() => {
    const roles: Role[] = [
      "admin",
      "accountant",
      "director",
      "regional_director",
      "supervisor",
      "sales",
    ];
    return roles
      .map((role) => ({ role, items: users.filter((u) => u.role === role) }))
      .filter((g) => g.items.length > 0);
  }, [users]);

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (usernameStatus === "exists") {
      showToast("Mã nhân viên đã tồn tại", "danger");
      return;
    }

    if (
      !formData.username ||
      (!editingUser && !formData.password) ||
      !formData.role ||
      !formData.full_name ||
      !formData.phone ||
      !formData.province ||
      !formData.district
    ) {
      showToast("Vui lòng điền đủ thông tin (*)", "warning");
      return;
    }
    if (isSelf && formData.password && !formData.old_password) {
      showToast("Vui lòng nhập mật khẩu cũ", "warning");
      return;
    }

    setSubmitting(true);
    const token =
      localStorage.getItem("access_token") ||
      sessionStorage.getItem("access_token");

    try {
      const url = editingUser
        ? `${API_BASE}/users/${editingUser.id}`
        : `${API_BASE}/users`;
      const method = editingUser ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: formData.username.toLowerCase().trim(),
          ...(formData.password && { password: formData.password }),
          ...(isSelf &&
            formData.password && { old_password: formData.old_password }),
          full_name: formData.full_name,
          phone: formData.phone,
          email: formData.email || null,
          province: formData.province,
          district: formData.district,
          ...(!isSelf && { role: formData.role }),
          ...(!isSelf && { manager_id: formData.manager_id || null }),
        }),
      });

      if (res.ok) {
        showToast(
          editingUser ? "Cập nhật thành công!" : "Tạo nhân sự thành công!",
          "success",
        );
        handleCloseModal();
        fetchUsers();
      } else {
        const error = await res.json();
        showToast(error.message || "Lỗi xử lý yêu cầu", "danger");
      }
    } catch {
      showToast("Mất kết nối server", "danger");
    } finally {
      setSubmitting(false);
    }
  };

  const availableRoles = useMemo(() => {
    if (!currentUser) return [];
    const myRank = ROLE_HIERARCHY[currentUser.role];
    return (Object.keys(ROLE_HIERARCHY) as Role[]).filter(
      (role) =>
        ROLE_HIERARCHY[role] > myRank &&
        (role !== "accountant" || currentUser.role === "admin"),
    );
  }, [currentUser]);

  const availableManagers = useMemo(() => {
    if (!currentUser || !formData.role) return [];
    const newUserRank = ROLE_HIERARCHY[formData.role as Role];
    return users.filter((u) => {
      if (formData.role === "accountant") return u.role === "admin";
      const managerRank = ROLE_HIERARCHY[u.role];
      return managerRank < newUserRank && u.id !== editingUser?.id;
    });
  }, [users, formData.role, currentUser, editingUser]);

  // Commit: disable dropdown manager khi chỉ có 1 lựa chọn
  const isManagerDisabled = isSelf || availableManagers.length <= 1;

  useEffect(() => {
    if (availableManagers.length === 1) {
      setFormData((prev) => ({
        ...prev,
        manager_id: availableManagers[0].id,
      }));
    }
  }, [availableManagers]);

  // Commit: tự động gán tỉnh theo supervisor khi tạo SALE + load district đúng tỉnh
  useEffect(() => {
    if (!selectedManager) return;
    if (formData.role !== "sales") return;
    if (selectedManager.role !== "supervisor") return;
    if (provinces.length === 0) return;

    const normalizeProvince = (name: string) =>
      name
        .replace(/^Tỉnh\s+/i, "")
        .replace(/^Thành phố\s+/i, "")
        .trim()
        .toLowerCase();

    const provinceName = normalizeProvince(selectedManager.province);

    const provinceObj = provinces.find(
      (p) => normalizeProvince(p.name) === provinceName,
    );

    if (!provinceObj) return;

    setFormData((prev) => ({
      ...prev,
      province: selectedManager.province,
    }));

    fetchDistricts(provinceObj.code);
  }, [selectedManager, formData.role, provinces]);

  return (
    <div className="space-y-6 sm:space-y-12 animate-fade-in pb-24 w-full px-1">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h3 className="text-xl sm:text-3xl font-black text-slate-800 dark:text-white uppercase tracking-tight">
            Cơ cấu tổ chức
          </h3>
          <p className="text-slate-400 font-bold text-[10px] sm:text-base">
            Quản lý đội ngũ nhân sự đa cấp bậc
          </p>
        </div>
        <button
          onClick={() => {
            setEditingUser(null);
            setFormData({
              username: "",
              password: "",
              old_password: "",
              full_name: "",
              phone: "",
              email: "",
              role: "",
              manager_id: currentUser?.id || "",
              province:
                currentUser?.role === "supervisor" ? currentUser.province : "",
              district: "",
            });
            setShowModal(true);
          }}
          className="w-full md:w-auto px-7 py-4 bg-nm text-white rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-nm/20 hover:scale-[1.03] active:scale-95 transition-all flex items-center justify-center gap-3 text-xs"
        >
          <i className="fa-solid fa-plus text-sm"></i> Thêm nhân sự mới
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 bg-white dark:bg-slate-800 rounded-[3rem] border-2 border-dashed border-slate-100 dark:border-slate-700">
          <div className="w-10 h-10 border-4 border-nm border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-8 items-start">
          {groupedUsers.map((group) => (
            <div key={group.role} className="space-y-4">
              <div className="flex items-center gap-3 px-2 select-none">
                <div
                  className={`w-6 h-6 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center text-white text-[10px] sm:text-xs shadow-lg ${ROLE_COLORS[group.role]?.split(" ")[0]}`}
                >
                  <i className="fa-solid fa-user-shield"></i>
                </div>
                <h4 className="font-black text-[10px] sm:text-sm uppercase tracking-widest text-slate-400 dark:text-slate-500 whitespace-nowrap">
                  {ROLE_LABELS[group.role]} ({group.items.length})
                </h4>
                <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800/50"></div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {group.items.map((u) => (
                  <div
                    key={u.id}
                    className="bg-white dark:bg-slate-800 p-5 sm:p-6 rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-xl hover:border-nm/20 transition-all group relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 p-4 opacity-[0.02] dark:opacity-[0.05] pointer-events-none group-hover:scale-125 transition-transform duration-700">
                      <i className="fa-solid fa-id-card text-6xl"></i>
                    </div>

                    <div className="flex items-center gap-4 relative z-10">
                      <div className="relative shrink-0">
                        <img
                          src={
                            u.avatar ||
                            `https://ui-avatars.com/api/?name=${encodeURIComponent(u.fullName)}&background=0ea5e9&color=fff`
                          }
                          className={`w-12 h-12 sm:w-16 sm:h-16 rounded-2xl object-cover border-2 transition-all duration-500 ${u.status === "inactive" ? "grayscale opacity-50 border-transparent" : "border-white dark:border-slate-700 group-hover:border-nm"}`}
                        />
                        {u.status === "inactive" && (
                          <div className="absolute -top-1 -right-1 z-20 bg-rose-500 text-white w-4 h-4 rounded-full flex items-center justify-center border-2 border-white dark:border-slate-800 shadow-lg">
                            <i className="fa-solid fa-lock text-[8px]"></i>
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p
                          className={`font-black truncate text-sm sm:text-lg tracking-tight ${u.status === "inactive" ? "text-slate-400 line-through" : "text-slate-800 dark:text-white"}`}
                        >
                          {u.fullName}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-2 mt-0.5">
                          <span className="text-[10px] font-bold text-nm/80">
                            @{u.username}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400 opacity-50">
                            •
                          </span>
                          <span className="text-[10px] font-bold text-slate-400">
                            {u.phone || "N/A"}
                          </span>
                        </div>
                        <p className="text-[9px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-widest mt-1">
                          QL: {u.manager_name || "Ban Giám Đốc"}
                        </p>
                      </div>

                      <button
                        onClick={(e) => handleOpenMenu(e, u)}
                        className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 text-slate-300 hover:text-nm hover:bg-white dark:hover:bg-slate-700 shadow-sm transition-all"
                      >
                        <i className="fa-solid fa-ellipsis-vertical text-base"></i>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeMenuUser && menuAnchor && (
        <ActionMenuPortal
          anchorRect={menuAnchor}
          user={activeMenuUser}
          currentUser={currentUser}
          onClose={() => {
            setActiveMenuUser(null);
            setMenuAnchor(null);
          }}
          onToggleLock={handleToggleLock}
          onEdit={handleEditClick}
        />
      )}

      {showModal && (
        <ModalPortal onClose={handleCloseModal}>
          <div className="p-6 sm:p-10 border-b border-slate-50 dark:border-slate-700 flex justify-between items-center bg-white dark:bg-slate-800 shrink-0 sticky top-0 z-10">
            <h3 className="text-base sm:text-2xl font-black uppercase text-nm flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-nm/10 flex items-center justify-center">
                <i
                  className={`fa-solid ${editingUser ? "fa-user-pen text-sm" : "fa-user-plus text-sm"}`}
                ></i>
              </div>
              {editingUser ? "Cập nhật hồ sơ" : "Thiết lập nhân sự"}
            </h3>
            <button
              onClick={handleCloseModal}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-300 hover:text-slate-500 transition-colors"
            >
              <i className="fa-solid fa-xmark text-xl"></i>
            </button>
          </div>

          <form
            onSubmit={handleSaveUser}
            className="flex-1 overflow-y-auto p-6 sm:p-10 space-y-8 scrollbar-hide bg-white dark:bg-slate-800"
          >
            <div className="space-y-6">
              <p className="text-[11px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-[0.3em] ml-1">
                Cơ bản
              </p>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                  Họ và tên nhân viên *
                </label>
                <div className="relative group">
                  <span className="absolute inset-y-0 left-0 w-12 flex items-center justify-center text-slate-300 group-focus-within:text-nm transition-colors pointer-events-none">
                    <i className="fa-solid fa-signature text-sm"></i>
                  </span>
                  <input
                    required
                    type="text"
                    value={formData.full_name}
                    onChange={(e) =>
                      setFormData({ ...formData, full_name: e.target.value })
                    }
                    className="w-full pl-12 pr-5 py-4 rounded-2xl sm:rounded-[1.5rem] bg-slate-50 dark:bg-slate-900 border-2 border-transparent focus:border-nm focus:bg-white dark:focus:bg-slate-800 font-bold outline-none text-xs sm:text-sm transition-all shadow-inner"
                    placeholder="Nhập đầy đủ họ và tên..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                    Số điện thoại *
                  </label>
                  <div className="relative group">
                    <span className="absolute inset-y-0 left-0 w-12 flex items-center justify-center text-slate-300 group-focus-within:text-nm transition-colors pointer-events-none">
                      <i className="fa-solid fa-mobile-retro text-sm"></i>
                    </span>
                    <input
                      required
                      type="tel"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          phone: e.target.value.replace(/\D/g, "").slice(0, 10),
                        })
                      }
                      className="w-full pl-12 pr-5 py-4 rounded-2xl sm:rounded-[1.5rem] bg-slate-50 dark:bg-slate-900 border-2 border-transparent focus:border-nm focus:bg-white dark:focus:bg-slate-800 font-bold outline-none text-xs sm:text-sm transition-all shadow-inner"
                      placeholder="09xx..."
                    />
                  </div>
                </div>

                <div className="space-y-2 relative" ref={roleDropdownRef}>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                    Chức vụ hệ thống *
                  </label>
                  <div
                    onClick={() =>
                      !isSelf && setIsRoleDropdownOpen(!isRoleDropdownOpen)
                    }
                    className={`w-full pl-12 pr-5 py-4 rounded-2xl sm:rounded-[1.5rem] border-2 transition-all flex justify-between items-center text-xs sm:text-sm font-bold relative shadow-inner
                      ${
                        isSelf
                          ? "bg-slate-100 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-400 cursor-not-allowed"
                          : "bg-slate-50 dark:bg-slate-900 border-transparent cursor-pointer hover:border-slate-200"
                      }`}
                  >
                    <span className="absolute inset-y-0 left-0 w-12 flex items-center justify-center text-slate-300 pointer-events-none">
                      <i className="fa-solid fa-user-tie text-sm"></i>
                    </span>
                    <span className={formData.role ? "" : "text-slate-400"}>
                      {formData.role
                        ? ROLE_LABELS[formData.role]
                        : "Chọn chức vụ"}
                    </span>
                    <i
                      className={`fa-solid fa-chevron-down text-[10px] text-slate-300 transition-transform ${isRoleDropdownOpen ? "rotate-180 text-nm" : ""}`}
                    ></i>
                  </div>
                  {!isSelf && isRoleDropdownOpen && (
                    <div
                      className={`absolute left-0 w-full mt-3 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl z-[120] border border-slate-100 dark:border-slate-700 py-2 overflow-hidden animate-fade-in ${roleOpenUp ? "bottom-full mb-3" : "top-full"}`}
                    >
                      {availableRoles.map((role) => (
                        <div
                          key={role}
                          // Commit: generate username unique khi đổi role
                          onClick={async () => {
                            const selectedRole = role as Role;

                            let username = formData.username;

                            if (!editingUser && formData.district) {
                              username = await generateUniqueUsername(
                                selectedRole,
                                formData.district,
                              );
                            }

                            setFormData((prev) => ({
                              ...prev,
                              role: selectedRole,
                              username,
                            }));

                            setIsRoleDropdownOpen(false);
                          }}
                          className="px-6 py-4 text-xs font-bold hover:bg-nm/5 hover:text-nm cursor-pointer transition-colors border-b last:border-0 border-slate-50 dark:border-slate-700/50"
                        >
                          {ROLE_LABELS[role]}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2 relative" ref={provinceDropdownRef}>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                    Khu vực nhà phân phối *
                  </label>

                  <div
                    onClick={() =>
                      !lockProvinceBySupervisor &&
                      currentUser?.role !== "supervisor" &&
                      !isSelf &&
                      setIsProvinceDropdownOpen(!isProvinceDropdownOpen)
                    }
                    className={`w-full pl-12 pr-5 py-4 rounded-2xl sm:rounded-[1.5rem] border-2 transition-all flex justify-between items-center text-xs sm:text-sm font-bold relative shadow-inner
${
  currentUser?.role === "supervisor" || lockProvinceBySupervisor || isSelf
    ? "bg-slate-100 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-400 cursor-not-allowed"
    : "bg-slate-50 dark:bg-slate-900 border-transparent cursor-pointer hover:border-slate-200"
}`}
                  >
                    <span className="absolute inset-y-0 left-0 w-12 flex items-center justify-center text-slate-300">
                      <i className="fa-solid fa-location-dot text-sm"></i>
                    </span>

                    <span className={formData.province ? "" : "text-slate-400"}>
                      {formData.province || "Chọn tỉnh phụ trách"}
                    </span>

                    <i
                      className={`fa-solid fa-chevron-down text-[10px] text-slate-300 transition-transform ${
                        isProvinceDropdownOpen ? "rotate-180 text-nm" : ""
                      }`}
                    />
                  </div>

                  {isProvinceDropdownOpen && (
                    <div
                      className={`absolute left-0 w-full mt-3 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl z-[120] border border-slate-100 dark:border-slate-700 py-2 overflow-hidden animate-fade-in ${
                        provinceOpenUp ? "bottom-full mb-3" : "top-full"
                      }`}
                    >
                      {/* SEARCH */}
                      <div className="px-3 pb-2">
                        <input
                          type="text"
                          placeholder="Tìm tỉnh..."
                          value={provinceSearch}
                          onChange={(e) => setProvinceSearch(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-slate-700 outline-none"
                        />
                      </div>

                      {/* LIST */}
                      <div className="max-h-56 overflow-y-auto">
                        {filteredProvinces.map((p) => (
                          <div
                            key={p.code}
                            // Commit: reset username và district khi đổi province
                            onClick={async () => {
                              const newProvince = p.name
                                .replace(/^Tỉnh\s+/i, "")
                                .replace(/^Thành phố\s+/i, "")
                                .trim();

                              setFormData((prev) => ({
                                ...prev,
                                province: newProvince,
                                district: "",
                                username: editingUser ? prev.username : "",
                              }));

                              await fetchDistricts(p.code);

                              setProvinceSearch("");
                              setIsProvinceDropdownOpen(false);
                            }}
                            className="px-6 py-3 text-xs font-bold hover:bg-nm/5 hover:text-nm cursor-pointer border-b last:border-0 border-slate-50 dark:border-slate-700/50"
                          >
                            {p.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-2 relative" ref={districtDropdownRef}>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                    Quận / Huyện *
                  </label>

                  <div
                    onClick={() =>
                      formData.province &&
                      districts.length > 0 &&
                      setIsDistrictDropdownOpen(!isDistrictDropdownOpen)
                    }
                    className="w-full pl-12 pr-5 py-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border-2 border-transparent hover:border-slate-200 dark:hover:border-slate-700 cursor-pointer flex justify-between items-center text-xs font-bold relative shadow-inner"
                  >
                    <span className="absolute inset-y-0 left-0 w-12 flex items-center justify-center text-slate-300">
                      <i className="fa-solid fa-map text-sm"></i>
                    </span>

                    <span className={formData.district ? "" : "text-slate-400"}>
                      {formData.district || "Chọn quận/huyện"}
                    </span>

                    <i
                      className={`fa-solid fa-chevron-down text-[10px] text-slate-300 transition-transform ${
                        isDistrictDropdownOpen ? "rotate-180 text-nm" : ""
                      }`}
                    />
                  </div>

                  {isDistrictDropdownOpen && (
                    <div className="absolute left-0 w-full mt-3 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl z-[120] border border-slate-100 dark:border-slate-700 py-2 overflow-hidden animate-fade-in">
                      {/* SEARCH */}
                      <div className="px-3 pb-2">
                        <input
                          type="text"
                          placeholder="Tìm huyện..."
                          value={districtSearch}
                          onChange={(e) => setDistrictSearch(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none"
                        />
                      </div>

                      {/* LIST */}
                      <div className="max-h-56 overflow-y-auto">
                        {filteredDistricts.map((d) => (
                          <div
                            key={d.code}
                            // Commit: generate username unique khi chọn district
                            onClick={async () => {
                              const newDistrict = d.name;

                              let username = formData.username;

                              if (!editingUser && formData.role && newDistrict) {
                                username = await generateUniqueUsername(
                                  formData.role as Role,
                                  newDistrict,
                                );
                              }

                              setFormData((prev) => ({
                                ...prev,
                                district: newDistrict,
                                username,
                              }));

                              setDistrictSearch("");
                              setIsDistrictDropdownOpen(false);
                            }}
                            className="px-6 py-3 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-nm/5 hover:text-nm cursor-pointer border-b last:border-0 border-slate-50 dark:border-slate-700/50"
                          >
                            {d.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2 relative" ref={managerDropdownRef}>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                  Người quản lý trực tiếp
                </label>
                <div
                  onClick={() =>
                    !isManagerDisabled &&
                    setIsManagerDropdownOpen(!isManagerDropdownOpen)
                  }
                  className={`w-full pl-12 pr-5 py-4 rounded-2xl sm:rounded-[1.5rem] border-2 transition-all flex justify-between items-center text-xs sm:text-sm font-bold relative shadow-inner
                    ${
                      isManagerDisabled
                        ? "bg-slate-100 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-400 cursor-not-allowed"
                        : "bg-slate-50 dark:bg-slate-900 border-transparent cursor-pointer hover:border-slate-200"
                    }`}
                >
                  <span className="absolute inset-y-0 left-0 w-12 flex items-center justify-center text-slate-300 pointer-events-none">
                    <i className="fa-solid fa-sitemap text-sm"></i>
                  </span>
                  <span className={formData.manager_id ? "" : "text-slate-400"}>
                    {formData.manager_id
                      ? (users.find((u) => String(u.id) === String(formData.manager_id))?.fullName
                          ?? editingUser?.manager_name)
                      : "Ban Giám Đốc (Mặc định)"}
                  </span>
                  <i
                    className={`fa-solid fa-chevron-down text-[10px] text-slate-300 transition-transform ${isManagerDropdownOpen ? "rotate-180 text-nm" : ""}`}
                  ></i>
                </div>
                {!isManagerDisabled && isManagerDropdownOpen && (
                  <div
                    className={`absolute left-0 w-full mt-3 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl z-[120] border border-slate-100 dark:border-slate-700 py-2 overflow-hidden animate-fade-in ${managerOpenUp ? "bottom-full mb-3" : "top-full"}`}
                  >
                    <div className="max-h-56 overflow-y-auto">
                      <div
                        onClick={() => {
                          setFormData({ ...formData, manager_id: "" });
                          setIsManagerDropdownOpen(false);
                        }}
                        className="px-6 py-4 text-xs font-black text-nm hover:bg-nm/5 cursor-pointer border-b border-slate-50 dark:border-slate-700/50"
                      >
                        Ban Giám Đốc
                      </div>
                      {availableManagers.map((u) => (
                        <div
                          key={u.id}
                          onClick={() => {
                            setFormData({ ...formData, manager_id: u.id });
                            setIsManagerDropdownOpen(false);
                          }}
                          className="px-6 py-4 text-xs font-bold hover:bg-nm/5 hover:text-nm cursor-pointer border-b last:border-0 border-slate-50 dark:border-slate-700/50"
                        >
                          {u.fullName}{" "}
                          <span className="opacity-40 ml-2 text-[9px] uppercase tracking-tighter">
                            ({ROLE_LABELS[u.role]})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-6">
              <p className="text-[11px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-[0.3em] ml-1">
                Xác thực hệ thống
              </p>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                  Mã nhân viên *
                </label>

                <div className="relative group">
                  <span className="absolute inset-y-0 left-0 w-12 flex items-center justify-center text-slate-300 pointer-events-none">
                    <i className="fa-solid fa-id-card-clip text-sm"></i>
                  </span>

                  <input
                    type="text"
                    value={formData.username}
                    disabled={!canManualEdit}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        username: e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9_]/g, ""),
                      })
                    }
                    className={`w-full pl-12 pr-12 py-4 rounded-2xl sm:rounded-[1.5rem] font-bold text-xs sm:text-sm outline-none transition-all
${
  canManualEdit
    ? "bg-slate-50 dark:bg-slate-900 border-2 border-transparent focus:border-nm"
    : "bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 cursor-not-allowed"
}`}
                    placeholder={canManualEdit ? "Nhập mã nhân viên..." : ""}
                  />

                  {/* RIGHT ICON */}
                  <div className="absolute inset-y-0 right-0 w-12 flex items-center justify-center">
                    {usernameStatus === "checking" && (
                      <i className="fa-solid fa-circle-notch animate-spin text-slate-400"></i>
                    )}

                    {usernameStatus === "available" && (
                      <i className="fa-solid fa-circle-check text-emerald-500"></i>
                    )}

                    {usernameStatus === "exists" && (
                      <i className="fa-solid fa-circle-xmark text-rose-500"></i>
                    )}

                    {usernameStatus === "idle" && canGenerateCode && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (formData.role && formData.district) {
                            const username = await generateUniqueUsername(
                              formData.role as Role,
                              formData.district,
                            );

                            setFormData((prev) => ({
                              ...prev,
                              username,
                            }));
                          }
                        }}
                        className="text-slate-300 hover:text-nm"
                      >
                        <i className="fa-solid fa-bolt text-sm"></i>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {isSelf && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                    Xác thực mật khẩu cũ *
                  </label>
                  <div className="relative group">
                    <span className="absolute inset-y-0 left-0 w-12 flex items-center justify-center text-slate-300 group-focus-within:text-nm transition-colors pointer-events-none">
                      <i className="fa-solid fa-shield-halved text-sm"></i>
                    </span>
                    <input
                      required={!!formData.password}
                      type="password"
                      value={formData.old_password}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          old_password: e.target.value,
                        })
                      }
                      className="w-full pl-12 pr-5 py-4 rounded-2xl sm:rounded-[1.5rem] bg-slate-50 dark:bg-slate-900 border-2 border-transparent focus:border-nm focus:bg-white dark:focus:bg-slate-800 font-bold outline-none text-xs sm:text-sm transition-all shadow-inner"
                      placeholder="Nhập mật khẩu hiện tại..."
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                  {editingUser
                    ? "Mật khẩu mới (Tùy chọn)"
                    : "Mật khẩu truy cập *"}
                </label>
                <div className="relative group">
                  <span className="absolute inset-y-0 left-0 w-12 flex items-center justify-center text-slate-300 group-focus-within:text-nm transition-colors pointer-events-none">
                    <i className="fa-solid fa-key text-sm"></i>
                  </span>
                  <input
                    required={!editingUser}
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    className="w-full pl-12 pr-14 py-4 rounded-2xl sm:rounded-[1.5rem] bg-slate-50 dark:bg-slate-900 border-2 border-transparent focus:border-nm focus:bg-white dark:focus:bg-slate-800 font-bold outline-none text-xs sm:text-sm transition-all shadow-inner"
                    placeholder={
                      editingUser
                        ? "Bỏ trống nếu không muốn đổi..."
                        : "••••••••"
                    }
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 w-14 flex items-center justify-center text-slate-300 hover:text-nm transition-colors"
                  >
                    <i
                      className={`fa-solid ${showPassword ? "fa-eye-slash" : "fa-eye"} text-sm`}
                    ></i>
                  </button>
                </div>

                {formData.password && (
                  <div className="mt-3 space-y-2">
                    {/* Thanh progress */}
                    <div className="h-2 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${passwordStrength.color}`}
                        style={{
                          width: `${(passwordStrength.score / 5) * 100}%`,
                        }}
                      />
                    </div>

                    {/* Text */}
                    <p
                      className={`text-[10px] font-bold ${
                        passwordStrength.score >= 4
                          ? "text-emerald-500"
                          : passwordStrength.score >= 3
                            ? "text-amber-500"
                            : "text-rose-500"
                      }`}
                    >
                      Độ mạnh mật khẩu: {passwordStrength.label}
                    </p>
                    <ul className="text-[9px] text-slate-400 space-y-1">
                      <li
                        className={
                          formData.password.length >= 8
                            ? "text-emerald-500"
                            : ""
                        }
                      >
                        ✔ Ít nhất 8 ký tự
                      </li>
                      <li
                        className={
                          /[A-Z]/.test(formData.password)
                            ? "text-emerald-500"
                            : ""
                        }
                      >
                        ✔ Có chữ hoa
                      </li>
                      <li
                        className={
                          /[a-z]/.test(formData.password)
                            ? "text-emerald-500"
                            : ""
                        }
                      >
                        ✔ Có chữ thường
                      </li>
                      <li
                        className={
                          /\d/.test(formData.password) ? "text-emerald-500" : ""
                        }
                      >
                        ✔ Có số
                      </li>
                      <li
                        className={
                          /[^A-Za-z0-9]/.test(formData.password)
                            ? "text-emerald-500"
                            : ""
                        }
                      >
                        ✔ Có ký tự đặc biệt
                      </li>
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </form>

          <div className="p-6 sm:p-10 border-t border-slate-50 dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0 sticky bottom-0 z-10 flex gap-4">
            <button
              type="button"
              onClick={handleCloseModal}
              className="flex-1 py-4 bg-slate-50 dark:bg-slate-700 rounded-2xl sm:rounded-[1.5rem] font-black uppercase text-[10px] tracking-[0.2em] text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600 transition-all active:scale-95"
            >
              Hủy bỏ
            </button>
            <button
              onClick={handleSaveUser}
              disabled={submitting}
              className="flex-1 py-4 bg-nm text-white rounded-2xl sm:rounded-[1.5rem] font-black uppercase text-[10px] tracking-[0.2em] shadow-2xl shadow-nm/30 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {submitting ? (
                <i className="fa-solid fa-circle-notch animate-spin"></i>
              ) : (
                <i
                  className={`fa-solid ${editingUser ? "fa-check-circle" : "fa-plus-circle"}`}
                ></i>
              )}
              <span>{editingUser ? "Lưu thay đổi" : "Tạo tài khoản"}</span>
            </button>
          </div>
        </ModalPortal>
      )}
    </div>
  );
};

export default UsersPage;
