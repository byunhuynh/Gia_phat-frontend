import React, { useState } from "react";
import { useInstallPrompt } from "../../hooks/useInstallPrompt";

const InstallPromptBanner: React.FC = () => {
  const { showBanner, isIOS, handleInstall, handleDismiss } =
    useInstallPrompt();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (!showBanner) return null;

  return (
    <>
      {/* Banner chính */}
      <div
        className="fixed bottom-0 left-0 right-0 z-[9999] animate-slide-up"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-3 mb-3 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200/80 dark:border-slate-700 overflow-hidden">
          {/* Thanh màu cam trên cùng */}
          <div className="h-1 bg-gradient-to-r from-nm-400 to-nm-600" />

          <div className="flex items-center gap-3 px-4 py-3">
            {/* Icon app */}
            <img
              src="/icons/icon-192.png"
              alt="App icon"
              className="w-12 h-12 rounded-xl shadow flex-shrink-0"
            />

            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm leading-tight">
                Thêm vào màn hình chính
              </p>
              <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5 leading-tight">
                Truy cập nhanh hơn
              </p>
            </div>

            {/* Nút cài */}
            {isIOS ? (
              <button
                onClick={() => setShowIOSGuide(true)}
                className="flex-shrink-0 bg-nm-500 hover:bg-nm-600 active:bg-nm-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
              >
                Cách cài
              </button>
            ) : (
              <button
                onClick={handleInstall}
                className="flex-shrink-0 bg-nm-500 hover:bg-nm-600 active:bg-nm-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
              >
                Cài ngay
              </button>
            )}

            {/* Nút đóng */}
            <button
              onClick={handleDismiss}
              className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              aria-label="Đóng"
            >
              <i className="fa-solid fa-xmark text-xs" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal hướng dẫn iOS */}
      {showIOSGuide && (
        <div
          className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setShowIOSGuide(false)}
        >
          <div
            className="w-full max-w-sm mx-3 mb-4 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="h-1 bg-gradient-to-r from-nm-400 to-nm-600" />
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">
                  Thêm vào màn hình chính
                </h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  <i className="fa-solid fa-xmark text-sm" />
                </button>
              </div>

              <div className="space-y-3">
                <Step
                  num={1}
                  icon="fa-arrow-up-from-bracket"
                  text={
                    <>
                      Nhấn nút{" "}
                      <span className="font-semibold text-nm-500">
                        Chia sẻ
                      </span>{" "}
                      <i className="fa-solid fa-arrow-up-from-bracket text-nm-500" />{" "}
                      ở thanh dưới Safari
                    </>
                  }
                />
                <Step
                  num={2}
                  icon="fa-plus-square"
                  text={
                    <>
                      Cuộn xuống và chọn{" "}
                      <span className="font-semibold text-nm-500">
                        "Thêm vào màn hình chính"
                      </span>
                    </>
                  }
                />
                <Step
                  num={3}
                  icon="fa-check"
                  text={
                    <>
                      Nhấn{" "}
                      <span className="font-semibold text-nm-500">
                        "Thêm"
                      </span>{" "}
                      ở góc trên phải để hoàn tất
                    </>
                  }
                />
              </div>

              <button
                onClick={() => {
                  setShowIOSGuide(false);
                  handleDismiss();
                }}
                className="mt-5 w-full bg-nm-500 hover:bg-nm-600 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

interface StepProps {
  num: number;
  icon: string;
  text: React.ReactNode;
}

const Step: React.FC<StepProps> = ({ num, text }) => (
  <div className="flex items-start gap-3">
    <div className="w-6 h-6 rounded-full bg-nm-100 dark:bg-nm-900/40 text-nm-600 dark:text-nm-400 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
      {num}
    </div>
    <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
      {text}
    </p>
  </div>
);

export default InstallPromptBanner;
