import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useLayoutEffect,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  RouteItem,
  StoreItem,
  CheckInRecord,
  User,
  GlobalCheckInRecord,
  Vehicle,
} from "../types";
import { useLocation } from "react-router-dom";
import { API_BASE, LOGO_URL, ROLE_HIERARCHY, ROLE_LABELS } from "../constants";
import { apiFetchWithRefresh } from "../services/api";
import { useToast } from "../hooks/useToast";
import { createPortal } from "react-dom";
import CustomDatePicker from "../components/ui/CustomDatePicker";
import { getUserAvatar } from "../utils/avatar";
import Dropdown from "../components/ui/Dropdown";

interface RoutesStoresPageProps {
  currentUser: User;
}

interface LocationItem {
  name: string;
  code: number;
  codename: string;
  division_type: string;
}

// Chuẩn hóa tên tỉnh: bỏ tiền tố "Tỉnh"/"Thành phố" để nhất quán với dữ liệu lưu trong DB
const normalizeProvinceName = (name: string) =>
  (name || "").replace(/^(Tỉnh|Thành phố)\s+/i, "").trim();

const FIXED_ROUTE_PROVINCE = "Trà Vinh";

interface TrashedRoute extends RouteItem {
  deleted_at: string;
  deleted_by_name?: string;
  deleted_reason?: string;
}

interface TrashedStore extends StoreItem {
  deleted_at: string;
  deleted_by_name?: string;
  deleted_reason?: string;
  route_name?: string;
  route_code?: string;
  route_id?: number;
}

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

// ─── CheckIn metadata type ───────────────────────────────────
interface CheckInMeta {
  lat: number | null;
  lng: number | null;
  checkin_time: string;
  gps_error: boolean;
  time_error: boolean;
}

// ─── Camera Modal ────────────────────────────────────────────
const CheckInCameraModal: React.FC<{
  store: StoreItem;
  currentUser: User;
  onClose: () => void;
  onConfirm: (photoBlob: Blob | null, meta: CheckInMeta) => void;
}> = ({ store, currentUser, onClose, onConfirm }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Giữ ref stream để không phụ thuộc vào state cycle
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [timeError, setTimeError] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  // Cache ảnh logo/QR đã load để vẽ lên canvas
  const logoImgRef = useRef<HTMLImageElement | null>(null);
  const qrImgRef = useRef<HTMLImageElement | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  // Sync giờ server
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    const fetchServerTime = async () => {
      try {
        const fetchStart = Date.now();
        const res = await fetch(`${API_BASE}/server-time`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        const fetchEnd = Date.now();
        const latency = (fetchEnd - fetchStart) / 2;
        const serverMs = data.timestamp * 1000 + latency;
        const drift = serverMs - fetchEnd;
        setNow(new Date(serverMs));
        setTimeError(false);
        interval = setInterval(() => {
          setNow(new Date(Date.now() + drift));
        }, 1000);
      } catch {
        setTimeError(true);
      }
    };
    fetchServerTime();
    return () => {
      if (interval) clearInterval(interval);
    };
  }, []);

  // GPS
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsError(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGpsError(true),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  // QR URL + preload ảnh QR vào ref
  useEffect(() => {
    if (!gps) return;
    const mapsUrl = `https://www.google.com/maps?q=${gps.lat},${gps.lng}`;
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(mapsUrl)}&bgcolor=ffffff&color=000000&margin=4`;
    setQrDataUrl(url);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      qrImgRef.current = img;
    };
    img.src = url;
  }, [gps]);

  // Preload logo vào ref
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      logoImgRef.current = img;
    };
    img.src = LOGO_URL;
  }, []);

  // Khởi động camera — chỉ selfie (user), không flip
  const startCamera = useCallback(async () => {
    // Dừng stream cũ nếu có
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
    setCameraError(false);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = s;
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        await videoRef.current.play().catch(() => {});
      }
      setCameraReady(true);
    } catch {
      setCameraError(true);
    }
  }, []);

  // Khởi động lần đầu
  useEffect(() => {
    startCamera();
    return () => {
      // Cleanup khi unmount
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [startCamera]);

  // Chụp ảnh: vẽ video + logo + QR + text stamp lên canvas cùng tỉ lệ preview
  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !cameraReady) return;
    setIsCapturing(true);

    // Lấy kích thước thực của video stream
    const vW = video.videoWidth || 640;
    const vH = video.videoHeight || 480;

    // Canvas vuông góc với video — không transform, giữ đúng tỉ lệ
    canvas.width = vW;
    canvas.height = vH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setIsCapturing(false);
      return;
    }

    // Vẽ frame video
    ctx.drawImage(video, 0, 0, vW, vH);

    // Thông số layout tỉ lệ theo chiều rộng video
    const pad = Math.round(vW * 0.03);
    const lineH = Math.round(vW * 0.038); // chiều cao 1 dòng text
    const fontSize = Math.round(vW * 0.032);

    // Helper vẽ text có outline trắng
    const stamp = (
      text: string,
      x: number,
      y: number,
      align: CanvasTextAlign = "left",
      size = fontSize,
    ) => {
      ctx.save();
      ctx.font = `900 ${size}px sans-serif`;
      ctx.textAlign = align;
      ctx.textBaseline = "bottom";
      ctx.lineWidth = Math.max(2, size * 0.18);
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineJoin = "round";
      ctx.strokeText(text, x, y);
      ctx.fillStyle = "#0f172a";
      ctx.fillText(text, x, y);
      ctx.restore();
    };

    // GPS text (bottom-left, sát đáy)
    const gpsFontSize = Math.round(fontSize * 0.75);
    const gpsLineH = Math.round(gpsFontSize * 2); // khoảng cách để QR không đè GPS
    const gpsText = gps
      ? `${Math.abs(gps.lat).toFixed(5)}°${gps.lat >= 0 ? "N" : "S"}  ${Math.abs(gps.lng).toFixed(5)}°${gps.lng >= 0 ? "E" : "W"}`
      : gpsError
        ? "GPS N/A"
        : "Đang định vị...";
    stamp(gpsText, pad, vH - pad, "left", gpsFontSize);

    // ── QR code (bottom-left, bên trên GPS text) ───────────────
    const qrSize = Math.round(vW * 0.18);
    if (qrImgRef.current) {
      const qrBottom = vH - pad - gpsLineH;
      ctx.fillStyle = "white";
      ctx.fillRect(pad - 3, qrBottom - qrSize - 3, qrSize + 6, qrSize + 6);
      ctx.drawImage(qrImgRef.current, pad, qrBottom - qrSize, qrSize, qrSize);
    }

    // ── Logo (top-right) ──────────────────────────────────────
    const logoH = Math.round(vW * 0.12);
    if (logoImgRef.current) {
      const ratio =
        logoImgRef.current.naturalWidth / logoImgRef.current.naturalHeight;
      const logoW = Math.round(logoH * ratio);
      ctx.drawImage(logoImgRef.current, vW - pad - logoW, pad, logoW, logoH);
    }

    // ── Info text (bottom-right) ───────────────────────────────
    const rightX = vW - pad;
    const dateStr = now
      ? now.toLocaleDateString("vi-VN", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })
      : "";
    const timeStr = now
      ? now.toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      : "";

    // Vẽ từ dưới lên
    let textY = vH - pad;
    stamp(timeError ? "Lỗi giờ" : timeStr, rightX, textY, "right");
    textY -= lineH;
    stamp(dateStr, rightX, textY, "right");
    textY -= lineH;
    stamp(store.name, rightX, textY, "right");
    textY -= lineH;
    stamp(currentUser.fullName, rightX, textY, "right");

    canvas.toBlob(
      (blob) => {
        if (blob) {
          setCapturedBlob(blob);
          setCapturedPreview(URL.createObjectURL(blob));
        }
        setIsCapturing(false);
      },
      "image/jpeg",
      0.9,
    );
  }, [
    cameraReady,
    gps,
    gpsError,
    now,
    timeError,
    currentUser.fullName,
    store.name,
  ]);

  // Chụp lại: xóa preview và khởi động lại camera
  const retake = useCallback(() => {
    if (capturedPreview) URL.revokeObjectURL(capturedPreview);
    setCapturedBlob(null);
    setCapturedPreview(null);
    startCamera();
  }, [capturedPreview, startCamera]);

  const handleConfirm = () => {
    onConfirm(capturedBlob, {
      lat: gps?.lat ?? null,
      lng: gps?.lng ?? null,
      checkin_time: now ? now.toISOString() : new Date().toISOString(),
      gps_error: gpsError,
      time_error: timeError,
    });
  };

  const formatCoords = (lat: number, lng: number) =>
    `${Math.abs(lat).toFixed(5)}°${lat >= 0 ? "N" : "S"}  ${Math.abs(lng).toFixed(5)}°${lng >= 0 ? "E" : "W"}`;
  const formatDate = (d: Date) =>
    d.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  const formatTime = (d: Date) =>
    d.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

  const stampStyle = (size: number = 10): React.CSSProperties => ({
    fontSize: `clamp(${size - 2}px, ${size * 0.3}vw, ${size}px)`,
    fontWeight: 900,
    color: "#0f172a",
    lineHeight: 1.4,
    textShadow:
      "-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff, -1.5px 0 0 #fff, 1.5px 0 0 #fff, 0 -1.5px 0 #fff, 0 1.5px 0 #fff",
  });

  return (
    <div className="flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <div className="p-6 pb-4 flex justify-between items-center border-b border-slate-100 dark:border-slate-700 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-nm/10 rounded-xl flex items-center justify-center text-nm">
            <i className="fa-solid fa-camera"></i>
          </div>
          <div>
            <h3 className="text-base font-black uppercase tracking-tight text-slate-800 dark:text-white">
              Check-in
            </h3>
            <p className="text-[10px] font-bold text-nm truncate max-w-[200px]">
              {store.name}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-slate-300 hover:text-slate-500 transition-colors"
        >
          <i className="fa-solid fa-circle-xmark text-2xl"></i>
        </button>
      </div>

      {/* Camera / Preview area */}
      <div className="relative bg-black overflow-hidden flex-1 aspect-[9/16]">
        {/* Canvas ẩn để render stamp */}
        <canvas ref={canvasRef} className="hidden" />

        {capturedPreview ? (
          // ── Hiển thị ảnh đã chụp ──
          <>
            <img
              src={capturedPreview}
              alt="captured"
              className="absolute inset-0 w-full h-full object-contain bg-black"
            />
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-emerald-500/90 backdrop-blur text-white text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-full shadow-lg flex items-center gap-2 whitespace-nowrap">
              <i className="fa-solid fa-circle-check"></i> Ảnh đã chụp
            </div>
          </>
        ) : cameraError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900 text-slate-400">
            <i className="fa-solid fa-camera-slash text-4xl"></i>
            <p className="text-xs font-bold uppercase tracking-widest">
              Không thể truy cập camera
            </p>
            <button
              onClick={startCamera}
              className="mt-2 px-4 py-2 bg-nm/20 text-nm rounded-xl text-xs font-black uppercase"
            >
              Thử lại
            </button>
          </div>
        ) : (
          // ── Live camera view ──
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />

            {/* Grid overlay */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
                backgroundSize: "33.33% 33.33%",
              }}
            />

            <div className="absolute inset-6 pointer-events-none">
              {/* Bracket corners */}
              {[
                "top-0 left-0 border-t-2 border-l-2",
                "top-0 right-0 border-t-2 border-r-2",
                "bottom-0 left-0 border-b-2 border-l-2",
                "bottom-0 right-0 border-b-2 border-r-2",
              ].map((cls, i) => (
                <div key={i} className={`absolute w-6 h-6 border-nm ${cls}`} />
              ))}

              {/* LIVE badge */}
              <div className="absolute top-1 left-1 flex items-center gap-1.5 bg-black/40 backdrop-blur px-2 py-1 rounded-md">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span>
                <span className="text-[8px] font-black text-white uppercase tracking-widest">
                  Live
                </span>
              </div>

              {/* Logo top-right */}
              <div className="absolute top-1 right-1">
                <img
                  src={LOGO_URL}
                  alt="Logo"
                  className="object-contain"
                  style={{
                    height: "clamp(40px, 6vw, 70px)",
                    filter:
                      "drop-shadow(0 1px 4px rgba(0,0,0,0.9)) drop-shadow(0 0 3px rgba(0,0,0,0.8))",
                  }}
                />
              </div>

              {/* GPS + QR bottom-left */}
              <div className="absolute bottom-1 left-1 flex flex-col items-start gap-[3px]">
                <div
                  style={{
                    width: "clamp(44px, 11vw, 64px)",
                    height: "clamp(44px, 11vw, 64px)",
                    background: "white",
                    borderRadius: "4px",
                    padding: "2px",
                    boxShadow: "0 1px 6px rgba(0,0,0,0.5)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: "3px",
                  }}
                >
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt="QR"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "2px",
                      }}
                    >
                      <i
                        className="fa-solid fa-location-dot"
                        style={{
                          fontSize: "clamp(10px, 2.5vw, 16px)",
                          color: "#6b7280",
                        }}
                      ></i>
                      <span
                        style={{
                          fontSize: "5px",
                          color: "#9ca3af",
                          fontWeight: 700,
                        }}
                      >
                        {gpsError ? "N/A" : "..."}
                      </span>
                    </div>
                  )}
                </div>
                <span style={stampStyle(8)}>
                  <i
                    className="fa-solid fa-location-crosshairs mr-1"
                    style={{ fontSize: "clamp(5px, 1.2vw, 7px)" }}
                  ></i>
                  {gps
                    ? formatCoords(gps.lat, gps.lng)
                    : gpsError
                      ? "GPS N/A"
                      : "Đang định vị..."}
                </span>
              </div>

              {/* Info bottom-right */}
              <div className="absolute bottom-1 right-1 flex flex-col items-end gap-[3px]">
                <span style={stampStyle(11)}>
                  <i
                    className="fa-solid fa-user mr-1"
                    style={{ fontSize: "clamp(6px, 1.8vw, 9px)" }}
                  ></i>
                  {currentUser.fullName}
                </span>
                <span style={stampStyle(11)}>
                  <i
                    className="fa-solid fa-store mr-1"
                    style={{ fontSize: "clamp(6px, 1.8vw, 9px)" }}
                  ></i>
                  {store.name}
                </span>
                <span style={stampStyle(10)}>
                  <i
                    className="fa-solid fa-calendar-day mr-1"
                    style={{ fontSize: "clamp(5px, 1.5vw, 8px)" }}
                  ></i>
                  {now ? formatDate(now) : "──/──/────"}
                </span>
                <span style={stampStyle(10)}>
                  <i
                    className="fa-solid fa-clock mr-1"
                    style={{ fontSize: "clamp(5px, 1.5vw, 8px)" }}
                  ></i>
                  {timeError ? (
                    <span style={{ color: "#ef4444" }}>Lỗi giờ</span>
                  ) : now ? (
                    formatTime(now)
                  ) : (
                    <span style={{ opacity: 0.5 }}>Đang đồng bộ...</span>
                  )}
                </span>
              </div>
            </div>

            {/* Nút chụp */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-auto">
              <button
                onClick={capturePhoto}
                disabled={isCapturing || !cameraReady}
                className="w-20 h-20 rounded-full bg-white border-4 border-nm shadow-2xl shadow-nm/40 flex items-center justify-center transition-all active:scale-90 disabled:opacity-50"
              >
                {isCapturing ? (
                  <i className="fa-solid fa-spinner animate-spin text-nm text-2xl"></i>
                ) : (
                  <i className="fa-solid fa-camera text-nm text-2xl"></i>
                )}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-5 space-y-3 bg-white dark:bg-slate-800 shrink-0 border-t border-slate-100 dark:border-slate-700">
        <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl">
          <i className="fa-solid fa-location-dot text-nm"></i>
          <div>
            <p className="text-xs font-black text-slate-700 dark:text-white">
              {store.name}
            </p>
            <p className="text-[10px] text-slate-400 font-medium truncate max-w-[260px]">
              {store.address}
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          {capturedPreview ? (
            <>
              <button
                onClick={retake}
                className="flex-1 py-4 bg-slate-100 dark:bg-slate-700 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] text-slate-400 transition-all active:scale-95"
              >
                <i className="fa-solid fa-rotate-left mr-2"></i>Chụp lại
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 py-4 bg-nm text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-xl shadow-nm/20 transition-all active:scale-95"
              >
                <i className="fa-solid fa-user-check mr-2"></i>Xác nhận
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onClose}
                className="flex-1 py-4 bg-slate-100 dark:bg-slate-700 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] text-slate-400 transition-all active:scale-95"
              >
                Hủy
              </button>
              <button
                disabled
                className="flex-1 py-4 bg-nm/30 text-white/60 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] cursor-not-allowed"
              >
                <i className="fa-solid fa-camera mr-2"></i>Chụp ảnh trước
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const RoutesStoresPage: React.FC<RoutesStoresPageProps> = ({ currentUser }) => {
  const { showToast } = useToast();
  const location = useLocation();

  // State quản lý View
  const [viewMode, setViewMode] = useState<"me" | "team" | "history">("me");
  const [selectedRoute, setSelectedRoute] = useState<RouteItem | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // State dữ liệu
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [globalCheckIns, setGlobalCheckIns] = useState<GlobalCheckInRecord[]>(
    [],
  );
  const [allAccessibleUsers, setAllAccessibleUsers] = useState<User[]>([]);
  const [subordinates, setSubordinates] = useState<User[]>([]);
  const [provinces, setProvinces] = useState<LocationItem[]>([]);
  const [historyFilters, setHistoryFilters] = useState({
    route_id: "",
    staff_id: "",
    date_from: "",
    date_to: "",
    page: 1,
    page_size: 20,
  });

  const [totalPages, setTotalPages] = useState(1);

  // State UI/Loading
  const [loading, setLoading] = useState(false);
  const [loadingStores, setLoadingStores] = useState(false);
  const [loadingGlobal, setLoadingGlobal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedStaffFilter, setSelectedStaffFilter] = useState<
    string | number
  >("all");

  // Modals
  const [isRouteModalOpen, setIsRouteModalOpen] = useState(false);
  const [isStoreModalOpen, setIsStoreModalOpen] = useState(false);
  const [viewingCheckInStore, setViewingCheckInStore] =
    useState<StoreItem | null>(null);
  const [confirmingCheckInStore, setConfirmingCheckInStore] =
    useState<StoreItem | null>(null);
  const [storeCheckInHistory, setStoreCheckInHistory] = useState<
    { id: number; checkin_time: string; photo_url?: string }[]
  >([]);
  const [loadingStoreHistory, setLoadingStoreHistory] = useState(false);
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);

  // Soft-delete states
  const [confirmingDeleteRoute, setConfirmingDeleteRoute] =
    useState<RouteItem | null>(null);
  const [confirmingDeleteStore, setConfirmingDeleteStore] =
    useState<StoreItem | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deletingItem, setDeletingItem] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [trashedRoutes, setTrashedRoutes] = useState<TrashedRoute[]>([]);
  const [trashedStores, setTrashedStores] = useState<TrashedStore[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [trashTab, setTrashTab] = useState<"routes" | "stores">("routes");
  const [restoreStoreBlockedBy, setRestoreStoreBlockedBy] = useState<{
    store: TrashedStore;
    route: TrashedRoute;
  } | null>(null);

  // Edit store phone / rename route
  const [editingStorePhone, setEditingStorePhone] = useState<StoreItem | null>(
    null,
  );
  const [editPhoneValue, setEditPhoneValue] = useState("");
  const [editingRouteName, setEditingRouteName] = useState<RouteItem | null>(
    null,
  );
  const [editRouteNameValue, setEditRouteNameValue] = useState("");
  const [editVehicleIdValue, setEditVehicleIdValue] = useState<string | number>(
    "",
  );
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  const [districts, setDistricts] = useState<LocationItem[]>([]);
  const [wards, setWards] = useState<LocationItem[]>([]);

  const [selectedDistrictCode, setSelectedDistrictCode] = useState<
    number | null
  >(null);

  // Form States
  const [routeForm, setRouteForm] = useState({
    name: "",
    code: "",
    province_name: FIXED_ROUTE_PROVINCE,
    vehicle_id: "" as string | number,
    staff_id: "" as string | number,
  });

  const [storeForm, setStoreForm] = useState({
    name: "",
    code: "",
    province: "",
    district: "",
    ward: "",
    address_detail: "",
    phone: "",
  });

  const [checkInNote, setCheckInNote] = useState("");

  // Fetch dữ liệu tỉnh thành
  const fetchProvinces = useCallback(async () => {
    try {
      const res = await fetch("https://provinces.open-api.vn/api/?depth=1");
      if (res.ok) setProvinces(await res.json());
    } catch (err) {
      console.error("Lỗi tải tỉnh thành:", err);
    }
  }, []);

  // Load quận theo tên tỉnh
  const loadDistrictsByProvinceName = async (provinceName: string) => {
    try {
      let provinceList = provinces;
      if (provinceList.length === 0) {
        const res = await fetch("https://provinces.open-api.vn/api/?depth=1");
        if (res.ok) {
          provinceList = await res.json();
          setProvinces(provinceList);
        }
      }

      const province = provinceList.find(
        (p: LocationItem) =>
          normalizeProvinceName(p.name).toLowerCase() ===
          normalizeProvinceName(provinceName).toLowerCase(),
      );
      if (!province) return;

      const res = await fetch(
        `https://provinces.open-api.vn/api/p/${province.code}?depth=2`,
      );

      if (res.ok) {
        const data = await res.json();
        setDistricts(data.districts || []);
        setWards([]); // reset phường
      }
    } catch (err) {
      console.error("Lỗi load quận:", err);
    }
  };

  // Load phường theo quận
  const loadWardsByDistrict = async (districtCode: number) => {
    try {
      const res = await fetch(
        `https://provinces.open-api.vn/api/d/${districtCode}?depth=2`,
      );

      if (res.ok) {
        const data = await res.json();
        setWards(data.wards || []);
      }
    } catch (err) {
      console.error("Lỗi load phường:", err);
    }
  };

  // Fetch dữ liệu nhân viên
  const fetchUsers = useCallback(async () => {
    const token =
      localStorage.getItem("access_token") ||
      sessionStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_BASE}/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const allUsers: User[] = await res.json();
        setAllAccessibleUsers(allUsers);
        // Lấy toàn bộ cấp dưới nhiều tầng
        const allSubs = getAllSubordinates(currentUser.id, allUsers);
        setSubordinates(allSubs);
      }
    } catch (err) {
      console.error(err);
    }
  }, [currentUser.id]);

  // ==========================================
  // Hàm lấy tên cấp trên trực tiếp của nhân viên
  // ==========================================
  const getManagerName = (staff: User) => {
    if (!staff.manager_id) return null;

    const manager = allAccessibleUsers.find((u) => u.id === staff.manager_id);

    return manager ? manager.fullName : null;
  };

  // ==========================================
  // Hàm lấy toàn bộ cấp dưới kèm level phân cấp
  // level = tầng trong cây tổ chức
  // ==========================================
  const getAllSubordinates = (
    managerId: number,
    users: User[],
    level = 1,
  ): (User & { level: number })[] => {
    const directSubs = users
      .filter((u) => u.manager_id === managerId)
      .map((u) => ({
        ...u,
        level,
      }));

    let allSubs: (User & { level: number })[] = [...directSubs];

    directSubs.forEach((sub) => {
      const childSubs = getAllSubordinates(sub.id as number, users, level + 1);
      allSubs = [...allSubs, ...childSubs];
    });

    return allSubs;
  };

  // Fetch danh sách tuyến
  const fetchRoutes = useCallback(async () => {
    setLoading(true);
    const token =
      localStorage.getItem("access_token") ||
      sessionStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_BASE}/my-routes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        // Map user_id từ backend sang staff_id của frontend interface
        const mappedData = data.map((r: any) => ({
          ...r,
          staff_id: r.user_id ?? r.staff_id,
        }));

        setRoutes(mappedData);
      }
    } catch {
      showToast("Lỗi tải danh sách tuyến", "danger");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const fetchVehicles = useCallback(async () => {
    try {
      const res = await apiFetchWithRefresh("/vehicles");
      if (res.ok) setVehicles(await res.json());
    } catch {
      showToast("Lỗi tải danh sách xe", "danger");
    }
  }, [showToast]);

  // Hàm helper để lấy tên nhân viên phụ trách
  const getStaffName = (staffId: string | number) => {
    if (staffId == currentUser.id) return currentUser.fullName;
    const staff = allAccessibleUsers.find((u) => u.id == staffId);
    return staff ? staff.fullName : "N/A";
  };

  // Fetch danh sách điểm bán theo tuyến
  const fetchStores = async (routeId: number) => {
    setLoadingStores(true);
    const token =
      localStorage.getItem("access_token") ||
      sessionStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_BASE}/stores?route_id=${routeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setStores(await res.json());
    } catch {
      showToast("Lỗi tải danh sách điểm bán", "danger");
    } finally {
      setLoadingStores(false);
    }
  };

  // Xóa tạm tuyến
  const handleDeleteRoute = async () => {
    if (!confirmingDeleteRoute) return;
    setDeletingItem(true);
    try {
      const res = await apiFetchWithRefresh(
        `/routes/${confirmingDeleteRoute.id}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: deleteReason.trim() }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(json.message || "Lỗi xóa tuyến", "danger");
        return;
      }
      showToast(json.message || "Đã xóa tuyến vào thùng rác", "success");
      setRoutes((prev) =>
        prev.filter((r) => r.id !== confirmingDeleteRoute.id),
      );
      setDeleteReason("");
      setConfirmingDeleteRoute(null);
    } catch {
      showToast("Lỗi kết nối", "danger");
    } finally {
      setDeletingItem(false);
    }
  };

  // Xóa tạm điểm bán
  const handleDeleteStore = async () => {
    if (!confirmingDeleteStore) return;
    setDeletingItem(true);
    try {
      const res = await apiFetchWithRefresh(
        `/stores/${confirmingDeleteStore.id}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: deleteReason.trim() }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(json.message || "Lỗi xóa điểm bán", "danger");
        return;
      }
      showToast(json.message || "Đã xóa điểm bán vào thùng rác", "success");
      setStores((prev) =>
        prev.filter((s) => s.id !== confirmingDeleteStore.id),
      );
      setDeleteReason("");
      setConfirmingDeleteStore(null);
    } catch {
      showToast("Lỗi kết nối", "danger");
    } finally {
      setDeletingItem(false);
    }
  };

  // Tải thùng rác (routes + stores)
  const fetchTrash = useCallback(async () => {
    setTrashLoading(true);
    try {
      const [routesRes, storesRes] = await Promise.all([
        apiFetchWithRefresh("/trash/routes"),
        apiFetchWithRefresh("/trash/stores"),
      ]);
      if (routesRes.ok) setTrashedRoutes(await routesRes.json());
      if (storesRes.ok) setTrashedStores(await storesRes.json());
    } catch {
      showToast("Lỗi tải thùng rác", "danger");
    } finally {
      setTrashLoading(false);
    }
  }, [showToast]);

  // Khôi phục tuyến
  const handleRestoreRoute = async (id: number) => {
    setRestoringId(id);
    try {
      const res = await apiFetchWithRefresh(`/routes/${id}/restore`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(json.message || "Lỗi khôi phục", "danger");
        return;
      }
      showToast(json.message || "Đã khôi phục tuyến", "success");
      setTrashedRoutes((prev) => prev.filter((r) => r.id !== id));
      fetchRoutes();
    } catch {
      showToast("Lỗi kết nối", "danger");
    } finally {
      setRestoringId(null);
    }
  };

  // Khôi phục điểm bán (thực sự gọi API)
  const doRestoreStore = async (store: TrashedStore) => {
    setRestoringId(store.id);
    try {
      const res = await apiFetchWithRefresh(`/stores/${store.id}/restore`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(json.message || "Lỗi khôi phục", "danger");
        return;
      }
      showToast(json.message || "Đã khôi phục điểm bán", "success");
      setTrashedStores((prev) => prev.filter((s) => s.id !== store.id));
    } catch {
      showToast("Lỗi kết nối", "danger");
    } finally {
      setRestoringId(null);
    }
  };

  // Khôi phục điểm bán + khôi phục tuyến cha (chỉ tuyến, không cascade stores khác)
  const handleRestoreRouteAndStore = async (
    route: TrashedRoute,
    store: TrashedStore,
  ) => {
    setRestoreStoreBlockedBy(null);
    setRestoringId(store.id);
    try {
      const res = await apiFetchWithRefresh(`/stores/${store.id}/restore`, {
        method: "POST",
        body: JSON.stringify({ restore_route: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(json.message || "Lỗi khôi phục", "danger");
        return;
      }
      showToast(
        json.message || `Đã khôi phục «${store.name}» và tuyến «${route.name}»`,
        "success",
      );
      setTrashedStores((prev) => prev.filter((s) => s.id !== store.id));
      if (json.route_restored) {
        setTrashedRoutes((prev) => prev.filter((r) => r.id !== route.id));
        fetchRoutes();
      }
    } catch {
      showToast("Lỗi kết nối", "danger");
    } finally {
      setRestoringId(null);
    }
  };

  // Khôi phục điểm bán — kiểm tra tuyến có còn trong thùng rác không
  const handleRestoreStore = (store: TrashedStore) => {
    if (store.route_id) {
      const trashedRoute = trashedRoutes.find((r) => r.id === store.route_id);
      if (trashedRoute) {
        setRestoreStoreBlockedBy({ store, route: trashedRoute });
        return;
      }
    }
    doRestoreStore(store);
  };
  const regenerateRouteCode = () => {
    if (!routeForm.province_name) return;

    const newCode = generateRouteCodeFromProvince(routeForm.province_name);

    setRouteForm({
      ...routeForm,
      code: newCode,
    });
  };
  const fetchGlobalHistory = useCallback(async () => {
    setLoadingGlobal(true);

    const token =
      localStorage.getItem("access_token") ||
      sessionStorage.getItem("access_token");

    const params = new URLSearchParams();

    Object.entries(historyFilters).forEach(([key, value]) => {
      if (value) params.append(key, String(value));
    });

    try {
      const res = await fetch(
        `${API_BASE}/reports/global-checkins?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (res.ok) {
        const json = await res.json();
        setGlobalCheckIns(json.data);
        setTotalPages(json.total_pages);
      }
    } catch {
      showToast("Lỗi tải lịch sử check-in", "danger");
    } finally {
      setLoadingGlobal(false);
    }
  }, [historyFilters]);

  useEffect(() => {
    fetchRoutes();
    fetchVehicles();
    fetchUsers();
    fetchProvinces();
    if (viewMode === "history") fetchGlobalHistory();
  }, [
    fetchRoutes,
    fetchVehicles,
    fetchUsers,
    fetchGlobalHistory,
    viewMode,
    fetchProvinces,
  ]);

  // Auto-select tuyến khi điều hướng từ thông báo
  useEffect(() => {
    const highlightRouteId = (
      location.state as { highlightRouteId?: number } | null
    )?.highlightRouteId;
    if (!highlightRouteId || routes.length === 0) return;

    const target = routes.find((r: RouteItem) => r.id === highlightRouteId);
    if (target) {
      setSelectedRoute(target);
      fetchStores(target.id);
      // Xóa state để không trigger lại khi re-render
      window.history.replaceState({}, "");
    }
  }, [routes, location.state]); // eslint-disable-line react-hooks/exhaustive-deps

  // Click outside for custom dropdowns

  // Lọc tuyến theo chế độ xem
  const filteredRoutes = useMemo(() => {
    if (viewMode === "team" && selectedStaffFilter !== "all") {
      return routes.filter(
        (r) => Number(r.staff_id) === Number(selectedStaffFilter),
      );
    }
    return routes;
  }, [viewMode, selectedStaffFilter, routes]);

  // Lọc điểm bán theo tìm kiếm
  const filteredStores = useMemo(() => {
    return stores.filter(
      (s) =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.code && s.code.toLowerCase().includes(searchTerm.toLowerCase())),
    );
  }, [stores, searchTerm]);

  const handleRouteClick = (route: RouteItem) => {
    setSelectedRoute(route);
    fetchStores(route.id);
  };

  const handleConfirmCheckIn = async (
    photoBlob: Blob | null,
    meta: CheckInMeta,
  ) => {
    if (!confirmingCheckInStore) return;
    const token =
      localStorage.getItem("access_token") ||
      sessionStorage.getItem("access_token");
    try {
      // Bước 1: Tạo store-visit với metadata GPS + time
      const res = await fetch(`${API_BASE}/store-visits`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          store_id: confirmingCheckInStore.id,
          checkin_time: meta.checkin_time,
          lat: meta.lat,
          lng: meta.lng,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        showToast(err.message || "Lỗi check-in", "danger");
        return;
      }

      const visit = await res.json(); // { id, store_id, ... }

      // Bước 2: Upload ảnh nếu có
      if (photoBlob && visit.id) {
        const formData = new FormData();
        formData.append(
          "image",
          photoBlob,
          `checkin_${visit.id}_${Date.now()}.jpg`,
        );
        await fetch(`${API_BASE}/store-visits/${visit.id}/upload-photo`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        // Không block check-in nếu upload ảnh lỗi
      }

      showToast("Check-in thành công!", "success");
      setConfirmingCheckInStore(null);
    } catch {
      showToast("Lỗi kết nối server", "danger");
    }
  };

  // Fetch lịch sử check-in của tôi tại một cửa hàng
  const fetchStoreCheckInHistory = useCallback(async (storeId: number) => {
    const token =
      localStorage.getItem("access_token") ||
      sessionStorage.getItem("access_token");
    setLoadingStoreHistory(true);
    try {
      const res = await fetch(`${API_BASE}/stores/${storeId}/my-checkins`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setStoreCheckInHistory(await res.json());
    } catch {
      // ignore
    } finally {
      setLoadingStoreHistory(false);
    }
  }, []);

  useEffect(() => {
    if (viewingCheckInStore) {
      setStoreCheckInHistory([]);
      fetchStoreCheckInHistory(viewingCheckInStore.id);
    }
  }, [viewingCheckInStore, fetchStoreCheckInHistory]);

  const generateRouteCodeFromProvince = (provinceName: string) => {
    if (!provinceName) return "";

    // 1️⃣ Bỏ chữ "Tỉnh", "Thành phố"
    const cleaned = provinceName
      .replace(/^Tỉnh\s+/i, "")
      .replace(/^Thành phố\s+/i, "")
      .trim();

    // 2️⃣ Lấy chữ cái đầu mỗi từ
    const words = cleaned.split(" ");
    const prefix = words
      .map((w) => w[0])
      .join("")
      .toUpperCase();

    // 3️⃣ Random 4 số
    const random = Math.floor(1000 + Math.random() * 9000);

    return `${prefix}_${random}`;
  };

  const generateStoreCode = (
    province: string,
    district: string,
    ward: string,
  ) => {
    if (!province || !district || !ward) return "";

    const clean = (text: string) => {
      return text
        .replace(/^Tỉnh\s+/i, "")
        .replace(/^Thành phố\s+/i, "")
        .replace(/^Quận\s+/i, "")
        .replace(/^Huyện\s+/i, "")
        .replace(/^Phường\s+/i, "")
        .replace(/^Xã\s+/i, "")
        .replace(/^Thị trấn\s+/i, "")
        .trim();
    };

    const getPrefix = (text: string) =>
      clean(text)
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase();

    const provincePrefix = getPrefix(province);
    const districtPrefix = getPrefix(district);
    const wardPrefix = getPrefix(ward);

    const random = Math.floor(1000 + Math.random() * 9000);

    return `${provincePrefix}_${districtPrefix}_${wardPrefix}_${random}`;
  };

  const handleUpdateStorePhone = async () => {
    if (!editingStorePhone) return;
    if (editPhoneValue) {
      if (!/^0[1-9][0-9]{8}$/.test(editPhoneValue)) {
        showToast(
          "Số điện thoại không đúng định dạng (VD: 0912345678)",
          "warning",
        );
        return;
      }
    }
    setSubmitting(true);
    try {
      const res = await apiFetchWithRefresh(`/stores/${editingStorePhone.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: editPhoneValue }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(json.message || "Lỗi cập nhật số điện thoại", "danger");
        return;
      }
      showToast("Đã cập nhật số điện thoại", "success");
      setStores((prev) =>
        prev.map((s) =>
          s.id === editingStorePhone.id ? { ...s, phone: editPhoneValue } : s,
        ),
      );
      setEditingStorePhone(null);
    } catch {
      showToast("Lỗi kết nối", "danger");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateRoute = async () => {
    if (!editingRouteName) return;
    if (!editRouteNameValue.trim()) {
      showToast("Vui lòng nhập tên tuyến", "warning");
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetchWithRefresh(`/routes/${editingRouteName.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          route_name: editRouteNameValue.trim(),
          vehicle_id: editVehicleIdValue || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(json.message || "Lỗi cập nhật tuyến", "danger");
        return;
      }
      showToast("Đã cập nhật tuyến", "success");
      const updated = {
        name: json.route_name || editRouteNameValue.trim(),
        vehicle_id: json.vehicle_id || null,
        vehicle_code: json.vehicle_code || null,
        vehicle_plate: json.vehicle_plate || null,
      };
      setRoutes((prev) =>
        prev.map((r) =>
          r.id === editingRouteName.id ? { ...r, ...updated } : r,
        ),
      );
      if (selectedRoute?.id === editingRouteName.id)
        setSelectedRoute((prev) => (prev ? { ...prev, ...updated } : prev));
      setEditingRouteName(null);
      setEditVehicleIdValue("");
    } catch {
      showToast("Lỗi kết nối", "danger");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !routeForm.name ||
      !routeForm.code ||
      !routeForm.province_name ||
      !routeForm.staff_id
    ) {
      showToast("Vui lòng điền đầy đủ thông tin", "warning");
      return;
    }
    setSubmitting(true);
    const token =
      localStorage.getItem("access_token") ||
      sessionStorage.getItem("access_token");
    try {
      const payload = {
        route_code: routeForm.code.toUpperCase(),
        route_name: routeForm.name,
        province_name: routeForm.province_name,
        vehicle_id: routeForm.vehicle_id || null,
        user_id: routeForm.staff_id,
      };

      const res = await fetch(`${API_BASE}/routes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        showToast("Tạo tuyến thành công!", "success");
        setIsRouteModalOpen(false);
        setRouteForm({
          name: "",
          code: generateRouteCodeFromProvince(FIXED_ROUTE_PROVINCE),
          province_name: FIXED_ROUTE_PROVINCE,
          vehicle_id: "",
          staff_id: currentUser.id,
        });
        fetchRoutes();
      } else {
        const err = await res.json();
        showToast(err.message || "Lỗi tạo tuyến", "danger");
      }
    } catch {
      showToast("Lỗi kết nối", "danger");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoute) return;
    if (
      !storeForm.name ||
      !storeForm.code ||
      !storeForm.province ||
      !storeForm.district ||
      !storeForm.ward ||
      !storeForm.address_detail
    ) {
      showToast("Vui lòng điền đủ thông tin địa chỉ", "warning");
      return;
    }
    // Validate phone nếu có nhập
    if (storeForm.phone) {
      const phoneRegex = /^0[1-9][0-9]{8}$/;

      if (!phoneRegex.test(storeForm.phone)) {
        showToast("Số điện thoại phải nhập đúng định dạng và đủ số", "warning");
        return;
      }
    }

    setSubmitting(true);
    const token =
      localStorage.getItem("access_token") ||
      sessionStorage.getItem("access_token");
    try {
      const payload = {
        route_id: selectedRoute.id,
        store_code: storeForm.code.toUpperCase(),
        name: storeForm.name,
        province: storeForm.province,
        district: storeForm.district,
        ward: storeForm.ward,
        address_detail: storeForm.address_detail,
        phone: storeForm.phone,
      };

      const res = await fetch(`${API_BASE}/stores`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        showToast("Thêm điểm bán thành công!", "success");
        setIsStoreModalOpen(false);
        setStoreForm({
          name: "",
          code: "",
          province: "",
          district: "",
          ward: "",
          address_detail: "",
          phone: "",
        });
        fetchStores(selectedRoute.id);
      } else {
        const err = await res.json();
        showToast(err.message || "Lỗi thêm điểm bán", "danger");
      }
    } catch {
      showToast("Lỗi kết nối", "danger");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="space-y-6 sm:space-y-8 animate-fade-in w-full overflow-hidden">
        {/* HEADER SECTION */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              {selectedRoute && (
                <button
                  onClick={() => setSelectedRoute(null)}
                  className="w-10 h-10 flex items-center justify-center rounded-xl bg-nm/10 text-nm hover:bg-nm hover:text-white transition-all shadow-sm"
                >
                  <i className="fa-solid fa-chevron-left"></i>
                </button>
              )}
              <h1 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tight">
                {selectedRoute
                  ? `Lộ trình: ${selectedRoute.name}`
                  : viewMode === "team"
                    ? "Giám sát Đội nhóm"
                    : viewMode === "history"
                      ? "Lịch sử viếng thăm"
                      : "Tuyến đường của tôi"}
              </h1>
            </div>
            {!selectedRoute && (
              <p className="hidden sm:block text-xs sm:text-sm font-semibold text-slate-400">
                {viewMode === "team"
                  ? "Theo dõi hiệu suất nhân viên cấp dưới trực tiếp"
                  : viewMode === "history"
                    ? "Tổng hợp lịch sử Check-in toàn hệ thống"
                    : `Quản lý ${filteredRoutes.length} tuyến đường chính của bạn`}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 w-full lg:w-auto overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 scrollbar-hide">
            {!selectedRoute && (
              <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shrink-0">
                <button
                  onClick={() => setViewMode("me")}
                  className={`flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === "me" ? "bg-NM dark:bg-slate-700 text-nm shadow-md" : "text-slate-400"}`}
                >
                  CỦA TÔI
                </button>
                {ROLE_HIERARCHY[currentUser.role] < ROLE_HIERARCHY["sales"] && (
                  <button
                    onClick={() => setViewMode("team")}
                    className={`flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === "team" ? "bg-NM dark:bg-slate-700 text-nm shadow-md" : "text-slate-400"}`}
                  >
                    ĐỘI NHÓM
                  </button>
                )}
                <button
                  onClick={() => setViewMode("history")}
                  className={`flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === "history" ? "bg-NM dark:bg-slate-700 text-nm shadow-md" : "text-slate-400"}`}
                >
                  LỊCH SỬ
                </button>
              </div>
            )}

            <div className="flex gap-2 shrink-0">
              {!selectedRoute && viewMode !== "history" && (
                <button
                  onClick={() => {
                    setRouteForm({
                      name: "",
                      code: generateRouteCodeFromProvince(FIXED_ROUTE_PROVINCE),
                      province_name: FIXED_ROUTE_PROVINCE,
                      vehicle_id: "",
                      staff_id: currentUser.id,
                    });

                    setIsRouteModalOpen(true);
                  }}
                  className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center bg-nm text-white rounded-2xl shadow-lg shadow-nm/20 hover:scale-110 active:scale-95 transition-all"
                  title="Tạo tuyến mới"
                >
                  <i className="fa-solid fa-plus text-sm sm:text-base"></i>
                </button>
              )}

              {selectedRoute && (
                <button
                  onClick={() => {
                    setIsStoreModalOpen(true);

                    if (selectedRoute?.province_name) {
                      loadDistrictsByProvinceName(selectedRoute.province_name);

                      setStoreForm({
                        name: "",
                        code: "",
                        province: selectedRoute.province_name,
                        district: "",
                        ward: "",
                        address_detail: "",
                        phone: "",
                      });
                    }
                  }}
                  className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center bg-nm/10 text-nm rounded-2xl hover:bg-nm hover:text-white transition-all shadow-sm"
                  title="Thêm điểm bán"
                >
                  <i className="fa-solid fa-plus text-sm sm:text-base"></i>
                </button>
              )}

              {viewMode === "history" && (
                <button
                  onClick={fetchGlobalHistory}
                  disabled={loadingGlobal}
                  className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center bg-nm/10 text-nm rounded-2xl hover:bg-nm hover:text-white transition-all disabled:opacity-50"
                  title="Làm mới"
                >
                  <i
                    className={`fa-solid fa-arrows-rotate ${loadingGlobal ? "animate-spin" : ""}`}
                  ></i>
                </button>
              )}

              {ROLE_HIERARCHY[currentUser.role] <= ROLE_HIERARCHY["regional_director"] &&
                viewMode !== "history" && (
                  <button
                    onClick={() => {
                      setShowTrash(true);
                      fetchTrash();
                    }}
                    className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center bg-rose-50 dark:bg-rose-900/20 text-rose-400 rounded-2xl hover:bg-rose-500 hover:text-white transition-all shadow-sm"
                    title="Thùng rác"
                  >
                    <i className="fa-solid fa-trash text-sm sm:text-base"></i>
                  </button>
                )}
            </div>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {!selectedRoute ? (
            viewMode === "history" ? (
              <motion.div
                key="history-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
                  {/* ================= FILTER BAR ================= */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex gap-3 p-4 sm:p-6 border-b border-slate-100 dark:border-slate-700">
                    {/* ================= ROUTE DROPDOWN ================= */}
                    <div className="w-full lg:w-64">
                      <Dropdown
                        value={historyFilters.route_id}
                        onChange={(val) =>
                          setHistoryFilters({
                            ...historyFilters,
                            route_id: val as string,
                            page: 1,
                          })
                        }
                        options={[
                          { label: "Tất cả tuyến", value: "" },
                          ...routes.map((r) => ({
                            label: r.name,
                            value: String(r.id),
                          })),
                        ]}
                        placeholder="Tất cả tuyến"
                        searchable
                      />
                    </div>

                    {/* ================= STAFF DROPDOWN ================= */}
                    <div className="w-full lg:w-64">
                      <Dropdown
                        value={historyFilters.staff_id}
                        onChange={(val) =>
                          setHistoryFilters({
                            ...historyFilters,
                            staff_id: val as string,
                            page: 1,
                          })
                        }
                        options={[
                          { label: "Tất cả nhân viên", value: "" },
                          ...allAccessibleUsers.map((u) => ({
                            label: u.fullName,
                            value: String(u.id),
                          })),
                        ]}
                        placeholder="Tất cả nhân viên"
                        searchable
                      />
                    </div>

                    {/* DATE FROM */}
                    <div className="w-full lg:w-48">
                      <CustomDatePicker
                        value={historyFilters.date_from}
                        onChange={(date) =>
                          setHistoryFilters({
                            ...historyFilters,
                            date_from: date,
                            page: 1,
                          })
                        }
                        placeholder="Từ ngày"
                      />
                    </div>

                    {/* DATE TO */}
                    <div className="w-full lg:w-48">
                      <CustomDatePicker
                        value={historyFilters.date_to}
                        onChange={(date) =>
                          setHistoryFilters({
                            ...historyFilters,
                            date_to: date,
                            page: 1,
                          })
                        }
                        placeholder="Đến ngày"
                      />
                    </div>
                  </div>

                  {/* ================= TABLE ================= */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-900/50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          <th className="px-6 py-4">Thời gian</th>
                          <th className="px-6 py-4">Nhân viên</th>
                          <th className="px-6 py-4">Tuyến</th>
                          <th className="px-6 py-4">Cửa hàng</th>
                          <th className="px-6 py-4">Mã CH</th>
                          <th className="px-6 py-4">Ảnh</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                        {loadingGlobal ? (
                          <tr>
                            <td colSpan={6} className="py-20 text-center">
                              <i className="fa-solid fa-spinner animate-spin text-nm text-2xl"></i>
                            </td>
                          </tr>
                        ) : globalCheckIns.length > 0 ? (
                          globalCheckIns.map((ci) => (
                            <tr
                              key={ci.id}
                              className="hover:bg-nm/5 transition-colors"
                            >
                              <td className="px-6 py-4 text-xs font-bold text-slate-500">
                                {new Date(ci.checkin_time).toLocaleString(
                                  "vi-VN",
                                )}
                              </td>
                              <td className="px-6 py-4 font-black text-slate-800 dark:text-white">
                                {ci.staffFullName}
                              </td>
                              <td className="px-6 py-4 text-xs font-bold text-slate-500">
                                {ci.routeName}
                              </td>
                              <td className="px-6 py-4 font-bold text-nm">
                                {ci.storeName}
                              </td>
                              <td className="px-6 py-4 text-xs font-black text-slate-400 uppercase">
                                {ci.storeCode}
                              </td>
                              <td className="px-6 py-4">
                                {ci.photo_url ? (
                                  <button
                                    onClick={() =>
                                      setViewingPhoto(
                                        `${API_BASE}${ci.photo_url}`,
                                      )
                                    }
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-nm/10 hover:bg-nm hover:text-white text-nm rounded-xl text-[10px] font-black uppercase tracking-wide transition-all"
                                  >
                                    <i className="fa-solid fa-camera"></i>
                                    Xem
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-slate-300 font-bold">
                                    —
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td
                              colSpan={6}
                              className="py-24 text-center text-slate-300 font-black uppercase text-xs"
                            >
                              Không có dữ liệu
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {/* MOBILE CARD VIEW */}
                  <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-700">
                    {loadingGlobal ? (
                      <div className="py-16 text-center">
                        <i className="fa-solid fa-spinner animate-spin text-nm text-2xl"></i>
                      </div>
                    ) : globalCheckIns.length > 0 ? (
                      globalCheckIns.map((ci) => (
                        <div
                          key={ci.id}
                          className="p-5 space-y-3 bg-white dark:bg-slate-800"
                        >
                          <div className="flex justify-between">
                            <span className="text-[10px] font-black text-slate-400 uppercase">
                              Thời gian
                            </span>
                            <span className="text-xs font-bold text-slate-600">
                              {new Date(ci.checkin_time).toLocaleString(
                                "vi-VN",
                              )}
                            </span>
                          </div>

                          <div className="flex justify-between">
                            <span className="text-[10px] font-black text-slate-400 uppercase">
                              Nhân viên
                            </span>
                            <span className="font-black text-slate-800 dark:text-white">
                              {ci.staffFullName}
                            </span>
                          </div>

                          <div className="flex justify-between">
                            <span className="text-[10px] font-black text-slate-400 uppercase">
                              Tuyến
                            </span>
                            <span className="text-xs font-bold text-slate-600">
                              {ci.routeName}
                            </span>
                          </div>

                          <div className="flex justify-between">
                            <span className="text-[10px] font-black text-slate-400 uppercase">
                              Cửa hàng
                            </span>
                            <span className="font-bold text-nm">
                              {ci.storeName}
                            </span>
                          </div>

                          <div className="flex justify-between">
                            <span className="text-[10px] font-black text-slate-400 uppercase">
                              Mã CH
                            </span>
                            <span className="text-[10px] font-black text-slate-400 uppercase">
                              {ci.storeCode}
                            </span>
                          </div>

                          {ci.photo_url && (
                            <button
                              onClick={() =>
                                setViewingPhoto(`${API_BASE}${ci.photo_url}`)
                              }
                              className="w-full flex items-center justify-center gap-2 py-2.5 bg-nm/10 hover:bg-nm hover:text-white text-nm rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                            >
                              <i className="fa-solid fa-camera"></i>
                              Xem ảnh check-in
                            </button>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="py-20 text-center text-slate-300 font-black uppercase text-xs">
                        Không có dữ liệu
                      </div>
                    )}
                  </div>

                  {/* ================= PAGINATION ================= */}
                  {totalPages > 1 && (
                    <div className="flex flex-wrap justify-center gap-2 p-4 border-t border-slate-100 dark:border-slate-700">
                      {Array.from({ length: totalPages }).map((_, i) => (
                        <button
                          key={i}
                          onClick={() =>
                            setHistoryFilters({
                              ...historyFilters,
                              page: i + 1,
                            })
                          }
                          className={`px-4 py-2 rounded-xl text-sm font-black transition-all ${
                            historyFilters.page === i + 1
                              ? "bg-nm text-white shadow-lg"
                              : "bg-slate-100 dark:bg-slate-700 text-slate-500"
                          }`}
                        >
                          {i + 1}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="list-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                {viewMode === "team" && (
                  <div className="flex items-center gap-3 overflow-x-auto pb-4 scrollbar-hide">
                    <button
                      onClick={() => setSelectedStaffFilter("all")}
                      className={`shrink-0 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${selectedStaffFilter === "all" ? "bg-nm border-nm text-white shadow-xl shadow-nm/30" : "bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-400"}`}
                    >
                      Tất cả nhân sự
                    </button>
                    {[
                      currentUser,
                      ...subordinates.filter(
                        (s: User) => Number(s.id) !== Number(currentUser.id),
                      ),
                    ].map((staff) => (
                      <button
                        key={staff.id}
                        onClick={() => setSelectedStaffFilter(staff.id)}
                        className={`shrink-0 flex items-center gap-3 pl-2 pr-6 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${
                          Number(selectedStaffFilter) === Number(staff.id)
                            ? "bg-nm border-nm text-white shadow-xl shadow-nm/30"
                            : "bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-500"
                        }`}
                      >
                        <img
                          src={getUserAvatar(staff.fullName, staff.avatar)}
                          onError={(e) => {
                            e.currentTarget.src = getUserAvatar(staff.fullName);
                          }}
                          className="w-8 h-8 rounded-xl object-cover"
                          alt={staff.fullName}
                        />

                        <div className="flex flex-col items-start leading-tight">
                          <span>
                            {Number(staff.id) === Number(currentUser.id)
                              ? "Tôi"
                              : staff.fullName}
                          </span>

                          {staff.manager_id && (
                            <span className="text-[9px] font-semibold opacity-60 normal-case">
                              ↳ {getManagerName(staff)}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredRoutes.length > 0 ? (
                    filteredRoutes.map((route, i) => (
                      <motion.div
                        key={route.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        onClick={() => handleRouteClick(route)}
                        className="
bg-white dark:bg-slate-800
border border-transparent dark:border-slate-700
rounded-[2.5rem] p-6
shadow-sm
hover:-translate-y-1
transition-all duration-300
cursor-pointer
group relative
"
                      >
                        <div className="flex items-start justify-between mb-6">
                          <div className="flex items-center gap-4">
                            <div className="w-14 h-14 bg-nm/10 rounded-[1.25rem] text-nm group-hover:bg-nm group-hover:text-white transition-all flex items-center justify-center">
                              <i className="fa-solid fa-location-dot text-2xl"></i>
                            </div>
                            <div>
                              <h3 className="font-black text-slate-800 dark:text-white leading-tight mb-1">
                                {route.name}
                              </h3>
                              <span className="text-[10px] font-black text-nm uppercase tracking-widest">
                                {route.code}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {ROLE_HIERARCHY[currentUser.role] <=
                              ROLE_HIERARCHY["sales"] && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditRouteNameValue(route.name);
                                  setEditVehicleIdValue(route.vehicle_id || "");
                                  setEditingRouteName(route);
                                }}
                                className="w-8 h-8 bg-slate-50 dark:bg-slate-700 text-slate-400 hover:bg-nm/10 hover:text-nm rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                                title="Chỉnh sửa tuyến"
                              >
                                <i className="fa-solid fa-pen text-xs"></i>
                              </button>
                            )}
                            {ROLE_HIERARCHY[currentUser.role] <=
                              ROLE_HIERARCHY["director"] && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmingDeleteRoute(route);
                                }}
                                className="w-8 h-8 bg-rose-50 dark:bg-rose-900/20 text-rose-300 hover:bg-rose-500 hover:text-white rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                                title="Xóa tuyến"
                              >
                                <i className="fa-solid fa-trash text-xs"></i>
                              </button>
                            )}
                            <div className="w-10 h-10 bg-slate-50 dark:bg-slate-700 rounded-xl flex items-center justify-center group-hover:bg-nm/10 transition-colors">
                              <i className="fa-solid fa-arrow-right text-slate-300 group-hover:text-nm"></i>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4 pt-4 border-t border-slate-50 dark:border-slate-700">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-black text-slate-400 uppercase">
                              Tỉnh thành
                            </span>
                            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                              {route.province_name}
                            </span>
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-black text-slate-400 uppercase">
                              Phụ trách
                            </span>
                            <span className="text-xs font-bold text-nm">
                              {getStaffName(route.staff_id)}
                            </span>
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-black text-slate-400 uppercase">
                              Biển số xe
                            </span>
                            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                              {route.vehicle_plate || "—"}
                            </span>
                          </div>

                          {/* 🔥 SỐ ĐIỂM BÁN */}
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-black text-slate-400 uppercase">
                              Điểm bán
                            </span>
                            <span className="text-xs font-black text-emerald-500">
                              {route.store_count ?? 0}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    ))
                  ) : (
                    <div className="col-span-full py-24 text-center flex flex-col items-center justify-center opacity-30">
                      <i className="fa-solid fa-route text-6xl mb-6"></i>
                      <h3 className="text-xl font-black uppercase tracking-tight">
                        Trống danh sách tuyến
                      </h3>
                    </div>
                  )}
                </div>
              </motion.div>
            )
          ) : (
            <motion.div
              key="detail-view"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-sm">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                    Mã tuyến
                  </p>
                  <p className="text-2xl font-black text-nm">
                    {selectedRoute.code}
                  </p>
                </div>
                <div className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-sm">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                    Điểm bán
                  </p>
                  <p className="text-2xl font-black text-slate-800 dark:text-white">
                    {stores.length}
                  </p>
                </div>
                <div className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-sm">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                    Vị trí
                  </p>
                  <p className="text-sm font-black text-slate-600 dark:text-slate-300 truncate">
                    {selectedRoute.province_name}
                  </p>
                </div>
                <div className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-sm">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                    Trạng thái
                  </p>
                  <span className="px-3 py-1 bg-emerald-100 text-emerald-600 rounded-lg text-[10px] font-black uppercase">
                    Đang vận hành
                  </span>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-[3rem] border border-slate-100 dark:border-slate-700 overflow-hidden shadow-sm">
                <div className="p-8 border-b border-slate-50 dark:border-slate-700 flex flex-wrap items-center justify-between gap-6">
                  <h3 className="font-black text-slate-800 dark:text-white flex items-center gap-3 text-lg uppercase tracking-tight">
                    <div className="w-10 h-10 bg-nm/10 rounded-2xl flex items-center justify-center text-nm">
                      <i className="fa-solid fa-store"></i>
                    </div>
                    Điểm bán trên tuyến ({filteredStores.length})
                  </h3>
                  <div className="relative w-full sm:w-96 group">
                    <i className="fa-solid fa-magnifying-glass absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-nm transition-colors"></i>
                    <input
                      type="text"
                      placeholder="Tìm tên hoặc địa chỉ..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-14 pr-6 py-4 w-full text-base bg-slate-50 dark:bg-slate-900/50 border-2 border-transparent rounded-[1.5rem] focus:ring-0 focus:border-nm focus:bg-white transition-all outline-none font-bold"
                    />
                  </div>
                </div>

                <div className="hidden md:block">
                  {loadingStores ? (
                    <div className="py-20 text-center">
                      <i className="fa-solid fa-spinner animate-spin text-nm text-2xl"></i>
                    </div>
                  ) : filteredStores.length === 0 ? (
                    <div className="py-24 text-center text-slate-300 font-black uppercase text-xs tracking-widest">
                      Không có điểm bán nào
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-50 dark:divide-slate-700/50">
                      {filteredStores.map((store: StoreItem, i: number) => (
                        <div
                          key={store.id}
                          className="group flex items-center gap-5 px-8 py-4 hover:bg-nm/[0.03] dark:hover:bg-nm/[0.06] transition-all"
                        >
                          {/* STT */}
                          <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-700/60 group-hover:bg-nm/10 text-slate-400 group-hover:text-nm flex items-center justify-center transition-all shrink-0 text-xs font-black">
                            {i + 1}
                          </div>

                          {/* Icon store */}
                          <div className="w-10 h-10 rounded-2xl bg-nm/8 group-hover:bg-nm/15 text-nm/60 group-hover:text-nm flex items-center justify-center transition-all shrink-0">
                            <i className="fa-solid fa-store text-sm"></i>
                          </div>

                          {/* Tên + Mã */}
                          <div className="w-52 shrink-0">
                            <p className="font-black text-slate-800 dark:text-white text-sm leading-snug">
                              {store.name}
                            </p>
                            <span className="inline-block mt-1 text-[9px] font-black text-nm uppercase tracking-widest border border-nm/30 rounded px-1.5 py-0.5 bg-nm/5">
                              {store.code}
                            </span>
                          </div>

                          {/* Địa chỉ + SĐT */}
                          <div className="flex-1 min-w-0 space-y-1">
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-start gap-2">
                              <i className="fa-solid fa-location-dot text-nm/40 mt-0.5 shrink-0 text-[10px]"></i>
                              <span className="line-clamp-1">
                                {store.address}
                              </span>
                            </p>
                            {store.phone && (
                              <p className="text-xs text-slate-400 dark:text-slate-500 font-semibold flex items-center gap-2">
                                <i className="fa-solid fa-phone text-nm/40 shrink-0 text-[10px]"></i>
                                {store.phone}
                              </p>
                            )}
                            {!store.phone && (
                              <p className="text-[10px] text-slate-300 dark:text-slate-600 font-medium flex items-center gap-2">
                                <i className="fa-solid fa-phone text-[10px]"></i>
                                Chưa có số điện thoại
                              </p>
                            )}
                          </div>

                          {/* Thao tác */}
                          <div className="flex items-center gap-2 shrink-0">
                            {ROLE_HIERARCHY[currentUser.role] <=
                              ROLE_HIERARCHY["sales"] && (
                              <button
                                onClick={() => {
                                  setEditPhoneValue(store.phone ?? "");
                                  setEditingStorePhone(store);
                                }}
                                className="h-9 w-9 flex items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-700 text-slate-400 hover:bg-nm/10 hover:text-nm opacity-0 group-hover:opacity-100 transition-all"
                                title="Cập nhật số điện thoại"
                              >
                                <i className="fa-solid fa-pen text-xs"></i>
                              </button>
                            )}
                            {ROLE_HIERARCHY[currentUser.role] <=
                              ROLE_HIERARCHY["regional_director"] && (
                              <button
                                onClick={() => setConfirmingDeleteStore(store)}
                                className="h-9 w-9 flex items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-900/20 text-rose-300 hover:bg-rose-500 hover:text-white opacity-0 group-hover:opacity-100 transition-all"
                                title="Xóa điểm bán"
                              >
                                <i className="fa-solid fa-trash text-xs"></i>
                              </button>
                            )}
                            <button
                              onClick={() => setViewingCheckInStore(store)}
                              className="h-9 px-4 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-400 hover:bg-nm/10 hover:text-nm transition-all flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide"
                            >
                              <i className="fa-solid fa-clock-rotate-left text-xs"></i>
                              Lịch sử
                            </button>
                            <button
                              onClick={() => setConfirmingCheckInStore(store)}
                              className="h-9 px-5 rounded-xl bg-nm text-white shadow-md shadow-nm/25 hover:bg-nm-hover transition-all flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide active:scale-95"
                            >
                              <i className="fa-solid fa-user-check text-xs"></i>
                              Check-in
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-700">
                  {loadingStores ? (
                    <div className="py-16 text-center">
                      <i className="fa-solid fa-spinner animate-spin text-nm text-2xl"></i>
                    </div>
                  ) : filteredStores.length === 0 ? (
                    <div className="py-16 text-center text-slate-300 font-black uppercase text-xs tracking-widest">
                      Không có điểm bán nào
                    </div>
                  ) : (
                    filteredStores.map((store: StoreItem) => (
                      <div key={store.id} className="flex gap-0 group">
                        {/* Accent bar */}
                        <div className="w-1 bg-nm/20 group-hover:bg-nm transition-colors shrink-0 rounded-r" />
                        <div className="flex-1 p-4 space-y-3">
                          {/* Header row */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-3 min-w-0">
                              <div className="w-9 h-9 rounded-xl bg-nm/10 flex items-center justify-center text-nm shrink-0 mt-0.5">
                                <i className="fa-solid fa-store text-sm"></i>
                              </div>
                              <div className="min-w-0">
                                <h4 className="font-black text-slate-800 dark:text-white text-sm leading-snug">
                                  {store.name}
                                </h4>
                                <span className="inline-block mt-1 text-[9px] font-black text-nm uppercase tracking-widest border border-nm/30 rounded px-1.5 py-0.5 bg-nm/5">
                                  {store.code}
                                </span>
                              </div>
                            </div>
                          </div>
                          {/* Address */}
                          <p className="text-[11px] text-slate-400 font-medium flex items-start gap-1.5 pl-0.5">
                            <i className="fa-solid fa-location-dot mt-0.5 text-nm/40 shrink-0 text-[10px]"></i>
                            <span>{store.address}</span>
                          </p>
                          {/* Actions */}
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => setConfirmingCheckInStore(store)}
                              className="flex-1 flex items-center justify-center gap-2 bg-nm text-white font-black py-3 rounded-xl text-[11px] uppercase tracking-wider shadow-md shadow-nm/25 active:scale-95 transition-all"
                            >
                              <i className="fa-solid fa-user-check"></i>{" "}
                              Check-in
                            </button>
                            <button
                              onClick={() => setViewingCheckInStore(store)}
                              className="flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-black px-4 py-3 rounded-xl text-[11px] uppercase tracking-wider active:scale-95 transition-all"
                            >
                              <i className="fa-solid fa-clock-rotate-left"></i>
                            </button>
                            {ROLE_HIERARCHY[currentUser.role] <=
                              ROLE_HIERARCHY["sales"] && (
                              <button
                                onClick={() => {
                                  setEditPhoneValue(store.phone ?? "");
                                  setEditingStorePhone(store);
                                }}
                                className="flex items-center justify-center bg-slate-100 dark:bg-slate-700 text-slate-400 font-black px-4 py-3 rounded-xl text-[11px] uppercase tracking-wider active:scale-95 transition-all hover:bg-nm/10 hover:text-nm"
                                title="Cập nhật số điện thoại"
                              >
                                <i className="fa-solid fa-pen"></i>
                              </button>
                            )}
                            {ROLE_HIERARCHY[currentUser.role] <=
                              ROLE_HIERARCHY["regional_director"] && (
                              <button
                                onClick={() => setConfirmingDeleteStore(store)}
                                className="flex items-center justify-center bg-rose-50 dark:bg-rose-900/20 text-rose-400 font-black px-4 py-3 rounded-xl text-[11px] uppercase tracking-wider active:scale-95 transition-all hover:bg-rose-500 hover:text-white"
                              >
                                <i className="fa-solid fa-trash"></i>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isRouteModalOpen && (
            <ModalWrapper onClose={() => setIsRouteModalOpen(false)}>
              <div className="p-8 pb-4 flex justify-between items-center border-b border-slate-50 dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0 sticky top-0 z-10">
                <h3 className="text-xl font-black uppercase tracking-tight text-nm flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-nm/10 flex items-center justify-center">
                    <i className="fa-solid fa-route text-sm"></i>
                  </div>
                  Tạo tuyến đường mới
                </h3>
                <button
                  onClick={() => setIsRouteModalOpen(false)}
                  className="text-slate-300 hover:text-slate-500 transition-transform"
                >
                  <i className="fa-solid fa-circle-xmark text-2xl"></i>
                </button>
              </div>
              <form
                onSubmit={handleCreateRoute}
                className="flex-1 overflow-y-auto p-8 space-y-6 scrollbar-hide"
              >
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                    Tên tuyến đường *
                  </label>
                  <div className="relative group">
                    <span className="absolute inset-y-0 left-0 w-12 flex items-center justify-center text-slate-300 group-focus-within:text-nm transition-colors pointer-events-none">
                      <i className="fa-solid fa-signature text-sm"></i>
                    </span>
                    <input
                      required
                      type="text"
                      value={routeForm.name}
                      onChange={(e) =>
                        setRouteForm({ ...routeForm, name: e.target.value })
                      }
                      placeholder="VD: Tuyến Châu Thành"
                      className="w-full pl-12 pr-5 py-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border-2 border-transparent focus:border-nm focus:bg-white dark:focus:bg-slate-800 font-bold outline-none text-base transition-all shadow-inner"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                      Mã tuyến (tự động tạo)
                    </label>

                    <div className="relative group">
                      {/* Icon bên trái */}
                      <span className="absolute inset-y-0 left-0 w-12 flex items-center justify-center text-slate-300">
                        <i className="fa-solid fa-id-card-clip text-sm"></i>
                      </span>

                      {/* Input */}
                      <input
                        type="text"
                        value={routeForm.code}
                        disabled
                        placeholder="Chọn tỉnh để tạo mã"
                        className="
  w-full pl-12 pr-14 py-4 rounded-2xl
  bg-slate-100 dark:bg-slate-800
  border border-slate-200 dark:border-slate-600
  text-slate-600 dark:text-slate-300
  font-bold text-sm
  cursor-not-allowed
"
                      />

                      {/* Icon đổi mã */}
                      {routeForm.province_name && (
                        <button
                          type="button"
                          onClick={regenerateRouteCode}
                          className="absolute inset-y-0 right-0 w-12 flex items-center justify-center 
                   text-slate-400 hover:text-nm transition-all 
                   active:scale-90"
                          title="Tạo mã mới"
                        >
                          <i className="fa-solid fa-arrows-rotate text-sm"></i>
                        </button>
                      )}
                    </div>

                    <p className="text-[10px] text-slate-400 font-semibold ml-1">
                      Mã sẽ được tạo dựa trên tỉnh thành đã chọn
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                      Tỉnh thành *
                    </label>

                    <Dropdown
                      value={routeForm.province_name}
                      disabled
                      onChange={() => undefined}
                      options={[
                        {
                          label: FIXED_ROUTE_PROVINCE,
                          value: FIXED_ROUTE_PROVINCE,
                        },
                      ]}
                      placeholder={FIXED_ROUTE_PROVINCE}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                    Xe phụ trách
                  </label>
                  <Dropdown
                    value={routeForm.vehicle_id}
                    onChange={(value) =>
                      setRouteForm({ ...routeForm, vehicle_id: value })
                    }
                    options={[
                      { label: "Không gán xe", value: "" },
                      ...vehicles.map((vehicle) => ({
                        label: `${vehicle.code} · ${vehicle.plate_number}`,
                        value: vehicle.id,
                      })),
                    ]}
                    placeholder="Chọn xe trong danh sách"
                    searchable
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                    Nhân viên phụ trách *
                  </label>

                  <Dropdown
                    value={routeForm.staff_id}
                    onChange={(val) =>
                      setRouteForm({
                        ...routeForm,
                        staff_id: val,
                      })
                    }
                    options={[
                      {
                        label: `Chính tôi (${currentUser.fullName})`,
                        value: currentUser.id,
                      },
                      ...subordinates.map((s) => ({
                        label: `${s.fullName} (${ROLE_LABELS[s.role]})`,
                        value: s.id,
                      })),
                    ]}
                    placeholder="Chọn nhân viên"
                  />
                </div>

                <div className="flex gap-4 pt-6 shrink-0 sticky bottom-0 bg-white dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsRouteModalOpen(false)}
                    className="flex-1 py-4 bg-slate-100 dark:bg-slate-700 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] text-slate-400 transition-all active:scale-95"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-2 px-10 py-4 bg-nm text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-2xl shadow-nm/30 hover:bg-nm-hover transition-all disabled:opacity-50 active:scale-95"
                  >
                    {submitting ? (
                      <i className="fa-solid fa-spinner animate-spin"></i>
                    ) : (
                      "XÁC NHẬN TẠO"
                    )}
                  </button>
                </div>
              </form>
            </ModalWrapper>
          )}

          {isStoreModalOpen && (
            <ModalWrapper onClose={() => setIsStoreModalOpen(false)}>
              <div className="p-8 pb-4 flex justify-between items-center border-b border-slate-50 dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0 sticky top-0 z-10">
                <h3 className="text-xl font-black uppercase tracking-tight text-nm flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-nm/10 flex items-center justify-center">
                    <i className="fa-solid fa-store text-sm"></i>
                  </div>
                  Thêm điểm bán mới
                </h3>
                <button
                  onClick={() => setIsStoreModalOpen(false)}
                  className="text-slate-300 hover:text-slate-500 transition-transform"
                >
                  <i className="fa-solid fa-circle-xmark text-2xl"></i>
                </button>
              </div>
              <form
                onSubmit={handleCreateStore}
                className="flex-1 overflow-y-auto p-8 space-y-6 scrollbar-hide"
              >
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                    Tên cửa hàng *
                  </label>
                  <div className="relative group">
                    <span className="absolute inset-y-0 left-0 w-12 flex items-center justify-center text-slate-300 group-focus-within:text-nm transition-colors pointer-events-none">
                      <i className="fa-solid fa-shop text-sm"></i>
                    </span>
                    <input
                      required
                      type="text"
                      value={storeForm.name}
                      onChange={(e) =>
                        setStoreForm({ ...storeForm, name: e.target.value })
                      }
                      placeholder="VD: Tạp hóa Hoa Lan"
                      className="w-full pl-12 pr-5 py-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border-2 border-transparent focus:border-nm focus:bg-white dark:focus:bg-slate-800 font-bold outline-none text-base transition-all shadow-inner"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                      Mã cửa hàng *
                    </label>
                    <div className="relative group">
                      <span className="absolute inset-y-0 left-0 w-12 flex items-center justify-center text-slate-300 group-focus-within:text-nm transition-colors pointer-events-none">
                        <i className="fa-solid fa-barcode text-sm"></i>
                      </span>
                      <input
                        type="text"
                        value={storeForm.code}
                        disabled
                        placeholder="Chọn đủ quận, phường để tạo mã"
                        className="
  w-full pl-12 pr-14 py-4 rounded-2xl
  bg-slate-100 dark:bg-slate-800
  border border-slate-200 dark:border-slate-600
  text-slate-600 dark:text-slate-300
  font-bold text-sm
  cursor-not-allowed
"
                      />
                      {storeForm.province &&
                        storeForm.district &&
                        storeForm.ward && (
                          <button
                            type="button"
                            onClick={() => {
                              const newCode = generateStoreCode(
                                selectedRoute?.province_name || "",
                                storeForm.district,
                                storeForm.ward,
                              );

                              setStoreForm({
                                ...storeForm,
                                code: newCode,
                              });
                            }}
                            className="absolute inset-y-0 right-0 w-12 flex items-center justify-center 
               text-slate-400 hover:text-nm transition-all 
               active:scale-90"
                            title="Tạo mã mới"
                          >
                            <i className="fa-solid fa-arrows-rotate text-sm"></i>
                          </button>
                        )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                      Số điện thoại
                    </label>
                    <div className="relative group">
                      <span className="absolute inset-y-0 left-0 w-12 flex items-center justify-center text-slate-300 group-focus-within:text-nm transition-colors pointer-events-none">
                        <i className="fa-solid fa-phone text-sm"></i>
                      </span>
                      <input
                        type="tel"
                        inputMode="numeric"
                        maxLength={10}
                        value={storeForm.phone}
                        onChange={(e) => {
                          // Chỉ giữ lại số
                          let value = e.target.value.replace(/\D/g, "");

                          // Giới hạn 10 số
                          if (value.length > 10) return;

                          setStoreForm({ ...storeForm, phone: value });
                        }}
                        placeholder="0xxxxxxxxx"
                        className="w-full pl-12 pr-5 py-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border-2 border-transparent focus:border-nm focus:bg-white dark:focus:bg-slate-800 font-bold outline-none text-base transition-all shadow-inner"
                      />
                    </div>
                  </div>
                </div>

                {/* Phân cấp địa chỉ + nhân viên phụ trách */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                      Tỉnh *
                    </label>
                    <input
                      type="text"
                      value={selectedRoute?.province_name || ""}
                      disabled
                      className="
  w-full px-4 py-3 rounded-xl
  bg-slate-100 dark:bg-slate-800
  border border-slate-200 dark:border-slate-600
  text-slate-600 dark:text-slate-300
  font-bold text-base
  cursor-not-allowed
"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                      Nhân viên phụ trách
                    </label>
                    <input
                      type="text"
                      value={
                        selectedRoute
                          ? getStaffName(selectedRoute.staff_id)
                          : ""
                      }
                      disabled
                      className="
  w-full px-4 py-3 rounded-xl
  bg-slate-100 dark:bg-slate-800
  border border-slate-200 dark:border-slate-600
  text-slate-600 dark:text-slate-300
  font-bold text-base
  cursor-not-allowed
"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                        Quận *
                      </label>

                      <Dropdown
                        value={storeForm.district}
                        onChange={(val) => {
                          const selected = districts.find(
                            (d) => d.name === val,
                          );

                          setStoreForm({
                            ...storeForm,
                            district: val as string,
                            ward: "",
                            code: "",
                          });

                          if (selected) loadWardsByDistrict(selected.code);
                        }}
                        options={districts.map((d) => ({
                          label: d.name,
                          value: d.name,
                        }))}
                        placeholder="Chọn quận/huyện"
                        searchable
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                        Phường *
                      </label>

                      <Dropdown
                        value={storeForm.ward}
                        onChange={(val) => {
                          const newCode = generateStoreCode(
                            selectedRoute?.province_name || "",
                            storeForm.district,
                            val as string,
                          );

                          setStoreForm({
                            ...storeForm,
                            ward: val as string,
                            code: newCode,
                          });
                        }}
                        options={wards.map((w) => ({
                          label: w.name,
                          value: w.name,
                        }))}
                        placeholder="Chọn phường/xã"
                        searchable
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                    Địa chỉ chi tiết *
                  </label>
                  <div className="relative group">
                    <span className="absolute inset-y-0 left-0 w-12 flex pt-4 justify-center text-slate-300 group-focus-within:text-nm transition-colors pointer-events-none">
                      <i className="fa-solid fa-map-pin text-sm"></i>
                    </span>
                    <textarea
                      required
                      rows={2}
                      value={storeForm.address_detail}
                      onChange={(e) =>
                        setStoreForm({
                          ...storeForm,
                          address_detail: e.target.value,
                        })
                      }
                      placeholder="Số nhà, tên đường..."
                      className="w-full pl-12 pr-5 py-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border-2 border-transparent focus:border-nm focus:bg-white dark:focus:bg-slate-800 font-bold outline-none text-base transition-all shadow-inner resize-none"
                    />
                  </div>
                </div>

                <div className="flex gap-4 pt-6 shrink-0 sticky bottom-0 bg-white dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsStoreModalOpen(false)}
                    className="flex-1 py-4 bg-slate-100 dark:bg-slate-700 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] text-slate-400 transition-all active:scale-95"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-2 px-10 py-4 bg-nm text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-2xl shadow-nm/30 hover:bg-nm-hover transition-all disabled:opacity-50 active:scale-95"
                  >
                    {submitting ? (
                      <i className="fa-solid fa-spinner animate-spin"></i>
                    ) : (
                      "LƯU ĐIỂM BÁN"
                    )}
                  </button>
                </div>
              </form>
            </ModalWrapper>
          )}

          {confirmingCheckInStore && (
            <ModalWrapper
              onClose={() => {
                setConfirmingCheckInStore(null);
              }}
            >
              <CheckInCameraModal
                store={confirmingCheckInStore}
                currentUser={currentUser}
                onClose={() => {
                  setConfirmingCheckInStore(null);
                }}
                onConfirm={handleConfirmCheckIn}
              />
            </ModalWrapper>
          )}

          {confirmingDeleteRoute && (
            <ModalWrapper
              onClose={() => {
                if (!deletingItem) {
                  setConfirmingDeleteRoute(null);
                  setDeleteReason("");
                }
              }}
            >
              <div className="p-8 space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-rose-100 dark:bg-rose-900/30 rounded-2xl flex items-center justify-center text-rose-500 shrink-0">
                    <i className="fa-solid fa-trash-can text-2xl"></i>
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-800 dark:text-white">
                      Xóa tuyến đường?
                    </h3>
                    <p className="text-sm font-semibold text-rose-500 mt-0.5">
                      {confirmingDeleteRoute.name}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                  Tuyến sẽ được <strong>xóa tạm thời</strong>. Tất cả điểm bán
                  trên tuyến sẽ bị ẩn theo. Bạn có thể liên hệ admin để khôi
                  phục.
                </p>
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Lý do xóa <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    value={deleteReason}
                    onChange={(e) => setDeleteReason(e.target.value)}
                    placeholder="Nhập lý do xóa tuyến này..."
                    rows={3}
                    disabled={deletingItem}
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-sm text-slate-800 dark:text-white placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-rose-400 transition disabled:opacity-50"
                  />
                </div>
                <div className="flex gap-4">
                  <button
                    onClick={() => {
                      setConfirmingDeleteRoute(null);
                      setDeleteReason("");
                    }}
                    disabled={deletingItem}
                    className="flex-1 py-4 bg-slate-100 dark:bg-slate-700 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] text-slate-400 transition-all active:scale-95 disabled:opacity-50"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={handleDeleteRoute}
                    disabled={deletingItem || !deleteReason.trim()}
                    className="flex-1 py-4 bg-rose-500 text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-lg shadow-rose-500/30 hover:bg-rose-600 transition-all disabled:opacity-50 active:scale-95"
                  >
                    {deletingItem ? (
                      <i className="fa-solid fa-spinner animate-spin"></i>
                    ) : (
                      "Xóa tuyến"
                    )}
                  </button>
                </div>
              </div>
            </ModalWrapper>
          )}

          {confirmingDeleteStore && (
            <ModalWrapper
              onClose={() => {
                if (!deletingItem) {
                  setConfirmingDeleteStore(null);
                  setDeleteReason("");
                }
              }}
            >
              <div className="p-8 space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-rose-100 dark:bg-rose-900/30 rounded-2xl flex items-center justify-center text-rose-500 shrink-0">
                    <i className="fa-solid fa-trash-can text-2xl"></i>
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-800 dark:text-white">
                      Xóa điểm bán?
                    </h3>
                    <p className="text-sm font-semibold text-rose-500 mt-0.5">
                      {confirmingDeleteStore.name}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                  Điểm bán sẽ được <strong>xóa tạm thời</strong>. Bạn có thể
                  khôi phục từ <strong>Thùng rác</strong> bất cứ lúc nào.
                </p>
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Lý do xóa <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    value={deleteReason}
                    onChange={(e) => setDeleteReason(e.target.value)}
                    placeholder="Nhập lý do xóa điểm bán này..."
                    rows={3}
                    disabled={deletingItem}
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-sm text-slate-800 dark:text-white placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-rose-400 transition disabled:opacity-50"
                  />
                </div>
                <div className="flex gap-4">
                  <button
                    onClick={() => {
                      setConfirmingDeleteStore(null);
                      setDeleteReason("");
                    }}
                    disabled={deletingItem}
                    className="flex-1 py-4 bg-slate-100 dark:bg-slate-700 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] text-slate-400 transition-all active:scale-95 disabled:opacity-50"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={handleDeleteStore}
                    disabled={deletingItem || !deleteReason.trim()}
                    className="flex-1 py-4 bg-rose-500 text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-lg shadow-rose-500/30 hover:bg-rose-600 transition-all disabled:opacity-50 active:scale-95"
                  >
                    {deletingItem ? (
                      <i className="fa-solid fa-spinner animate-spin"></i>
                    ) : (
                      "Xóa điểm bán"
                    )}
                  </button>
                </div>
              </div>
            </ModalWrapper>
          )}

          {showTrash && (
            <ModalWrapper onClose={() => setShowTrash(false)}>
              <div className="p-6 pb-4 flex justify-between items-center border-b border-slate-50 dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0">
                <h3 className="text-xl font-black uppercase tracking-tight text-rose-500 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center">
                    <i className="fa-solid fa-trash text-sm text-rose-400"></i>
                  </div>
                  Thùng rác
                </h3>
                <button
                  onClick={() => setShowTrash(false)}
                  className="text-slate-300 hover:text-slate-500 transition-colors"
                >
                  <i className="fa-solid fa-circle-xmark text-2xl"></i>
                </button>
              </div>

              {/* Tabs */}
              <div className="flex gap-2 p-4 border-b border-slate-50 dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0">
                <button
                  onClick={() => setTrashTab("routes")}
                  className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${trashTab === "routes" ? "bg-nm text-white shadow-md" : "bg-slate-100 dark:bg-slate-700 text-slate-400"}`}
                >
                  Tuyến ({trashedRoutes.length})
                </button>
                <button
                  onClick={() => setTrashTab("stores")}
                  className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${trashTab === "stores" ? "bg-nm text-white shadow-md" : "bg-slate-100 dark:bg-slate-700 text-slate-400"}`}
                >
                  Điểm bán ({trashedStores.length})
                </button>
              </div>

              <div className="flex-1 overflow-y-auto min-h-[300px]">
                {trashLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <i className="fa-solid fa-spinner animate-spin text-nm text-2xl"></i>
                  </div>
                ) : trashTab === "routes" ? (
                  trashedRoutes.length === 0 ? (
                    <div className="py-16 text-center flex flex-col items-center gap-3">
                      <i className="fa-solid fa-trash text-slate-200 dark:text-slate-600 text-4xl"></i>
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
                        Không có tuyến đã xóa
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-50 dark:divide-slate-700">
                      {trashedRoutes.map((route) => (
                        <div
                          key={route.id}
                          className="flex items-center gap-4 px-6 py-4 hover:bg-rose-50/50 dark:hover:bg-rose-900/10 transition-colors"
                        >
                          <div className="w-10 h-10 bg-rose-100 dark:bg-rose-900/20 rounded-xl flex items-center justify-center text-rose-400 shrink-0">
                            <i className="fa-solid fa-route text-sm"></i>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-black text-slate-700 dark:text-slate-200 text-sm truncate">
                              {route.name}
                            </p>
                            <p className="text-[10px] text-slate-400 font-semibold uppercase">
                              {route.code} · {route.province_name}
                            </p>
                            {route.deleted_at && (
                              <p className="text-[10px] text-rose-400 font-semibold mt-0.5">
                                Xóa lúc{" "}
                                {new Date(route.deleted_at).toLocaleString(
                                  "vi-VN",
                                )}
                                {route.deleted_by_name &&
                                  ` · ${route.deleted_by_name}`}
                              </p>
                            )}
                            {route.deleted_reason && (
                              <p className="text-[10px] text-amber-500 dark:text-amber-400 font-medium mt-0.5 italic">
                                Lý do: {route.deleted_reason}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => handleRestoreRoute(route.id)}
                            disabled={restoringId === route.id}
                            className="shrink-0 h-9 px-4 bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 hover:bg-emerald-500 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
                          >
                            {restoringId === route.id ? (
                              <i className="fa-solid fa-spinner animate-spin"></i>
                            ) : (
                              "Khôi phục"
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  )
                ) : trashedStores.length === 0 ? (
                  <div className="py-16 text-center flex flex-col items-center gap-3">
                    <i className="fa-solid fa-trash text-slate-200 dark:text-slate-600 text-4xl"></i>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
                      Không có điểm bán đã xóa
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-50 dark:divide-slate-700">
                    {trashedStores.map((store) => (
                      <div
                        key={store.id}
                        className="flex items-center gap-4 px-6 py-4 hover:bg-rose-50/50 dark:hover:bg-rose-900/10 transition-colors"
                      >
                        <div className="w-10 h-10 bg-rose-100 dark:bg-rose-900/20 rounded-xl flex items-center justify-center text-rose-400 shrink-0">
                          <i className="fa-solid fa-store text-sm"></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-slate-700 dark:text-slate-200 text-sm truncate">
                            {store.name}
                          </p>
                          <p className="text-[10px] text-slate-400 font-semibold uppercase">
                            {store.code}
                          </p>
                          {store.route_name && (
                            <p className="text-[10px] text-slate-400 font-medium">
                              Tuyến: {store.route_name}
                            </p>
                          )}
                          {store.deleted_at && (
                            <p className="text-[10px] text-rose-400 font-semibold mt-0.5">
                              Xóa lúc{" "}
                              {new Date(store.deleted_at).toLocaleString(
                                "vi-VN",
                              )}
                              {store.deleted_by_name &&
                                ` · ${store.deleted_by_name}`}
                            </p>
                          )}
                          {store.deleted_reason && (
                            <p className="text-[10px] text-amber-500 dark:text-amber-400 font-medium mt-0.5 italic">
                              Lý do: {store.deleted_reason}
                            </p>
                          )}
                          {store.route_id &&
                            trashedRoutes.some(
                              (r) => r.id === store.route_id,
                            ) && (
                              <p className="text-[10px] text-orange-500 font-bold mt-0.5">
                                <i className="fa-solid fa-triangle-exclamation mr-1"></i>
                                Tuyến chưa được khôi phục
                              </p>
                            )}
                        </div>
                        <button
                          onClick={() => handleRestoreStore(store)}
                          disabled={restoringId === store.id}
                          className="shrink-0 h-9 px-4 bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 hover:bg-emerald-500 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
                        >
                          {restoringId === store.id ? (
                            <i className="fa-solid fa-spinner animate-spin"></i>
                          ) : (
                            "Khôi phục"
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ModalWrapper>
          )}

          {restoreStoreBlockedBy && (
            <ModalWrapper onClose={() => setRestoreStoreBlockedBy(null)}>
              {/* ── Header ── */}
              <div className="relative overflow-hidden rounded-t-[2.5rem] md:rounded-t-[3.5rem] bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 dark:from-slate-900 dark:via-slate-800 dark:to-amber-950 px-6 pt-6 pb-8 border-b border-amber-100 dark:border-white/[0.06]">
                <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-amber-300/20 dark:bg-amber-500/10 blur-3xl pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-36 h-36 rounded-full bg-orange-300/15 dark:bg-orange-600/10 blur-2xl pointer-events-none" />

                {/* Title row */}
                <div className="relative flex items-start gap-3 mb-6">
                  <div className="w-11 h-11 rounded-2xl bg-amber-100 dark:bg-amber-500/20 border border-amber-300/60 dark:border-amber-400/30 flex items-center justify-center shrink-0 mt-0.5">
                    <i className="fa-solid fa-triangle-exclamation text-amber-600 dark:text-amber-400"></i>
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.25em] text-amber-600/60 dark:text-amber-400/60 mb-0.5">
                      Xác nhận khôi phục
                    </p>
                    <h3 className="text-slate-800 dark:text-white font-black text-[17px] leading-snug">
                      Tuyến liên kết đang
                      <br />
                      trong thùng rác
                    </h3>
                  </div>
                </div>

                {/* Hierarchy cards — store first, route below */}
                <div className="relative flex flex-col">
                  {/* Store — requested */}
                  <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-400/[0.07] border border-emerald-200 dark:border-emerald-400/20 rounded-2xl px-4 py-3">
                    <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-500/20 border border-emerald-200 dark:border-emerald-500/20 flex items-center justify-center shrink-0">
                      <i className="fa-solid fa-store text-emerald-600 dark:text-emerald-400 text-xs"></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-700 dark:text-white/90 font-bold text-sm truncate leading-tight">
                        {restoreStoreBlockedBy.store.name}
                      </p>
                      <p className="text-[10px] text-slate-400 dark:text-white/35 font-semibold uppercase tracking-wider">
                        {restoreStoreBlockedBy.store.code}
                      </p>
                    </div>
                    <span className="shrink-0 text-[9px] font-black uppercase tracking-widest bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-400/25 rounded-full px-2.5 py-1">
                      Điểm bán
                    </span>
                  </div>

                  {/* Connector — upward link */}
                  <div className="flex items-center pl-4 py-0.5">
                    <div className="flex flex-col items-center w-8 gap-0.5 py-0.5">
                      <span className="w-0.5 h-2 bg-slate-300 dark:bg-white/20 rounded-full" />
                      <i className="fa-solid fa-arrow-up text-amber-500 dark:text-amber-400 text-[9px]" />
                      <span className="w-0.5 h-2 bg-slate-300 dark:bg-white/20 rounded-full" />
                    </div>
                    <p className="text-[9px] font-bold text-amber-600/70 dark:text-amber-400/60 uppercase tracking-wider ml-1">
                      thuộc tuyến
                    </p>
                  </div>

                  {/* Route — in trash */}
                  <div className="flex items-center gap-3 bg-white/70 dark:bg-white/[0.06] border border-rose-200/80 dark:border-rose-400/20 rounded-2xl px-4 py-3">
                    <div className="w-8 h-8 rounded-xl bg-rose-100 dark:bg-rose-500/20 border border-rose-200 dark:border-rose-500/20 flex items-center justify-center shrink-0">
                      <i className="fa-solid fa-route text-rose-500 dark:text-rose-400 text-xs"></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-700 dark:text-white/90 font-bold text-sm truncate leading-tight">
                        {restoreStoreBlockedBy.route.name}
                      </p>
                      <p className="text-[10px] text-slate-400 dark:text-white/35 font-semibold uppercase tracking-wider">
                        {restoreStoreBlockedBy.route.code}
                      </p>
                    </div>
                    <span className="shrink-0 text-[9px] font-black uppercase tracking-widest bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-400/25 rounded-full px-2.5 py-1">
                      <i className="fa-solid fa-trash-can mr-1" />
                      Thùng rác
                    </span>
                  </div>
                </div>
              </div>

              {/* ── Body ── */}
              <div className="px-6 pt-5 pb-6 flex flex-col gap-4">
                {/* Info callout */}
                <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-500/10 border border-amber-200/70 dark:border-amber-400/20 rounded-2xl px-4 py-3">
                  <i className="fa-solid fa-circle-info text-amber-500 dark:text-amber-400 text-sm mt-0.5 shrink-0" />
                  <p className="text-[12px] text-slate-600 dark:text-slate-300 leading-relaxed">
                    Tuyến{" "}
                    <span className="font-bold text-slate-800 dark:text-white">
                      «{restoreStoreBlockedBy.route.name}»
                    </span>{" "}
                    vẫn đang trong thùng rác. Xác nhận sẽ khôi phục{" "}
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      điểm bán này
                    </span>{" "}
                    và{" "}
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      tuyến liên kết
                    </span>{" "}
                    — các điểm bán khác trên tuyến vẫn giữ nguyên trong thùng
                    rác.
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    onClick={() =>
                      handleRestoreRouteAndStore(
                        restoreStoreBlockedBy.route,
                        restoreStoreBlockedBy.store,
                      )
                    }
                    disabled={restoringId !== null}
                    className="w-full h-12 bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-white rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {restoringId !== null ? (
                      <i className="fa-solid fa-spinner animate-spin" />
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <i className="fa-solid fa-rotate-left" />
                        Xác nhận khôi phục
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setRestoreStoreBlockedBy(null)}
                    disabled={restoringId !== null}
                    className="w-full h-10 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-colors disabled:opacity-40"
                  >
                    Hủy bỏ
                  </button>
                </div>
              </div>
            </ModalWrapper>
          )}

          {/* ── Modal đổi tên tuyến ── */}
          <AnimatePresence>
            {editingRouteName && (
              <ModalWrapper
                onClose={() => {
                  if (!submitting) setEditingRouteName(null);
                }}
              >
                <div className="p-8 pb-4 flex justify-between items-center border-b border-slate-50 dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0">
                  <h3 className="text-xl font-black uppercase tracking-tight text-nm flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-nm/10 flex items-center justify-center">
                      <i className="fa-solid fa-pen text-sm"></i>
                    </div>
                    Chỉnh sửa tuyến
                  </h3>
                  <button
                    onClick={() => setEditingRouteName(null)}
                    disabled={submitting}
                    className="text-slate-300 hover:text-slate-500 transition-colors disabled:opacity-40"
                  >
                    <i className="fa-solid fa-circle-xmark text-2xl"></i>
                  </button>
                </div>
                <div className="p-8 space-y-6">
                  <p className="text-xs text-slate-400 font-semibold">
                    Tuyến hiện tại:{" "}
                    <span className="font-black text-slate-700 dark:text-white">
                      {editingRouteName.name}
                    </span>
                  </p>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                      Tên tuyến *
                    </label>
                    <div className="relative group">
                      <span className="absolute inset-y-0 left-0 w-12 flex items-center justify-center text-slate-300 group-focus-within:text-nm transition-colors pointer-events-none">
                        <i className="fa-solid fa-signature text-sm"></i>
                      </span>
                      <input
                        type="text"
                        value={editRouteNameValue}
                        onChange={(e) => setEditRouteNameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleUpdateRoute();
                        }}
                        placeholder="Nhập tên tuyến mới"
                        disabled={submitting}
                        className="w-full pl-12 pr-5 py-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border-2 border-transparent focus:border-nm focus:bg-white dark:focus:bg-slate-800 font-bold outline-none text-base transition-all shadow-inner disabled:opacity-50"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                      Xe phụ trách
                    </label>
                    <Dropdown
                      value={editVehicleIdValue}
                      disabled={submitting}
                      onChange={setEditVehicleIdValue}
                      options={[
                        { label: "Không gán xe", value: "" },
                        ...vehicles.map((vehicle) => ({
                          label: `${vehicle.code} · ${vehicle.plate_number}`,
                          value: vehicle.id,
                        })),
                      ]}
                      placeholder="Chọn xe trong danh sách"
                      searchable
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => {
                        setEditingRouteName(null);
                        setEditVehicleIdValue("");
                      }}
                      disabled={submitting}
                      className="flex-1 py-4 bg-slate-100 dark:bg-slate-700 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] text-slate-400 transition-all active:scale-95 disabled:opacity-50"
                    >
                      Hủy
                    </button>
                    <button
                      onClick={handleUpdateRoute}
                      disabled={submitting || !editRouteNameValue.trim()}
                      className="flex-1 py-4 bg-nm text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-lg shadow-nm/25 hover:bg-nm-hover transition-all active:scale-95 disabled:opacity-50"
                    >
                      {submitting ? (
                        <i className="fa-solid fa-spinner animate-spin"></i>
                      ) : (
                        "Lưu"
                      )}
                    </button>
                  </div>
                </div>
              </ModalWrapper>
            )}
          </AnimatePresence>

          {/* ── Modal cập nhật SĐT điểm bán ── */}
          <AnimatePresence>
            {editingStorePhone && (
              <ModalWrapper
                onClose={() => {
                  if (!submitting) setEditingStorePhone(null);
                }}
              >
                <div className="p-8 pb-4 flex justify-between items-center border-b border-slate-50 dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0">
                  <h3 className="text-xl font-black uppercase tracking-tight text-nm flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-nm/10 flex items-center justify-center">
                      <i className="fa-solid fa-phone text-sm"></i>
                    </div>
                    Cập nhật số điện thoại
                  </h3>
                  <button
                    onClick={() => setEditingStorePhone(null)}
                    disabled={submitting}
                    className="text-slate-300 hover:text-slate-500 transition-colors disabled:opacity-40"
                  >
                    <i className="fa-solid fa-circle-xmark text-2xl"></i>
                  </button>
                </div>
                <div className="p-8 space-y-6">
                  <p className="text-xs text-slate-400 font-semibold">
                    Điểm bán:{" "}
                    <span className="font-black text-slate-700 dark:text-white">
                      {editingStorePhone.name}
                    </span>
                  </p>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                      Số điện thoại
                    </label>
                    <div className="relative group">
                      <span className="absolute inset-y-0 left-0 w-12 flex items-center justify-center text-slate-300 group-focus-within:text-nm transition-colors pointer-events-none">
                        <i className="fa-solid fa-phone text-sm"></i>
                      </span>
                      <input
                        type="tel"
                        value={editPhoneValue}
                        onChange={(e) => setEditPhoneValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleUpdateStorePhone();
                        }}
                        placeholder="VD: 0912345678 (để trống để xóa)"
                        disabled={submitting}
                        className="w-full pl-12 pr-5 py-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border-2 border-transparent focus:border-nm focus:bg-white dark:focus:bg-slate-800 font-bold outline-none text-base transition-all shadow-inner disabled:opacity-50"
                      />
                    </div>
                    <p className="text-[10px] text-slate-400 ml-1">
                      Để trống để xóa số điện thoại hiện tại.
                    </p>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setEditingStorePhone(null)}
                      disabled={submitting}
                      className="flex-1 py-4 bg-slate-100 dark:bg-slate-700 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] text-slate-400 transition-all active:scale-95 disabled:opacity-50"
                    >
                      Hủy
                    </button>
                    <button
                      onClick={handleUpdateStorePhone}
                      disabled={submitting}
                      className="flex-1 py-4 bg-nm text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-lg shadow-nm/25 hover:bg-nm-hover transition-all active:scale-95 disabled:opacity-50"
                    >
                      {submitting ? (
                        <i className="fa-solid fa-spinner animate-spin"></i>
                      ) : (
                        "Lưu số"
                      )}
                    </button>
                  </div>
                </div>
              </ModalWrapper>
            )}
          </AnimatePresence>

          {viewingCheckInStore && (
            <ModalWrapper onClose={() => setViewingCheckInStore(null)}>
              <div className="p-6 pb-4 flex justify-between items-center border-b border-slate-50 dark:border-slate-700">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-nm/10 rounded-xl flex items-center justify-center text-nm">
                    <i className="fa-solid fa-clock-rotate-left"></i>
                  </div>
                  <div>
                    <h3 className="text-base font-black uppercase tracking-tight">
                      {viewingCheckInStore.name}
                    </h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                      Lịch sử check-in của tôi
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setViewingCheckInStore(null)}
                  className="text-slate-300 hover:text-slate-500 transition-colors"
                >
                  <i className="fa-solid fa-circle-xmark text-2xl"></i>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto min-h-[260px]">
                {loadingStoreHistory ? (
                  <div className="flex items-center justify-center py-16">
                    <i className="fa-solid fa-spinner animate-spin text-nm text-2xl"></i>
                  </div>
                ) : storeCheckInHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <i className="fa-solid fa-calendar-xmark text-slate-200 text-4xl"></i>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
                      Chưa có lần viếng thăm nào
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-50 dark:divide-slate-700">
                    {storeCheckInHistory.map(
                      (record: {
                        id: number;
                        checkin_time: string;
                        photo_url?: string;
                      }) => (
                        <div
                          key={record.id}
                          className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-nm/10 rounded-lg flex items-center justify-center text-nm text-xs">
                              <i className="fa-solid fa-check"></i>
                            </div>
                            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                              {new Date(record.checkin_time).toLocaleString(
                                "vi-VN",
                              )}
                            </span>
                          </div>
                          {record.photo_url ? (
                            <button
                              onClick={() =>
                                setViewingPhoto(
                                  `${API_BASE}${record.photo_url}`,
                                )
                              }
                              className="flex items-center gap-2 px-3 py-1.5 bg-nm/10 hover:bg-nm hover:text-white text-nm rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                            >
                              <i className="fa-solid fa-camera"></i>
                              Xem ảnh
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-300 font-bold uppercase">
                              Không có ảnh
                            </span>
                          )}
                        </div>
                      ),
                    )}
                  </div>
                )}
              </div>
            </ModalWrapper>
          )}
        </AnimatePresence>
      </div>
      {/* Photo Lightbox — đặt ngoài AnimatePresence để tránh xung đột ReactPortal */}
      {viewingPhoto &&
        createPortal(
          <div
            className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md"
            onClick={() => setViewingPhoto(null)}
          >
            <button
              className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors z-10"
              onClick={() => setViewingPhoto(null)}
            >
              <i className="fa-solid fa-circle-xmark text-3xl"></i>
            </button>
            <div
              className="relative max-w-2xl w-full bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-2xl overflow-hidden border border-white/20 dark:border-slate-700"
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              <img
                src={viewingPhoto}
                alt="Ảnh check-in"
                className="w-full max-h-[80vh] object-contain"
                onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                  const target = e.currentTarget;
                  target.style.display = "none";
                  const parent = target.parentElement;
                  if (parent && !parent.querySelector(".img-error-msg")) {
                    const msg = document.createElement("div");
                    msg.className = "img-error-msg";
                    msg.style.cssText =
                      "padding:2rem;text-align:center;color:#94a3b8;font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em";
                    msg.innerHTML =
                      '<i class="fa-solid fa-image-slash" style="font-size:2rem;display:block;margin-bottom:0.5rem"></i>Không thể tải ảnh';
                    parent.appendChild(msg);
                  }
                }}
              />
            </div>
          </div>,
          document.getElementById("modal-root") || document.body,
        )}
    </>
  );
};

export default RoutesStoresPage;
