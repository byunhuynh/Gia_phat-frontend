import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "pwa_install_dismissed_until";

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Đã cài rồi → không hiện
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (isStandalone) return;

    // Đã bị dismiss chưa hết hạn → không hiện
    const until = localStorage.getItem(DISMISSED_KEY);
    if (until && Date.now() < Number(until)) return;

    // Kiểm tra iOS Safari
    const ua = navigator.userAgent;
    const isIOSDevice = /iphone|ipad|ipod/i.test(ua);
    const isIOSSafari =
      isIOSDevice && /safari/i.test(ua) && !/chrome|crios|fxios/i.test(ua);

    if (isIOSSafari) {
      setIsIOS(true);
      setShowBanner(true);
      return;
    }

    // Android/Chrome: bắt beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setShowBanner(false));

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setShowBanner(false);
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    // Ẩn trong 7 ngày
    localStorage.setItem(
      DISMISSED_KEY,
      String(Date.now() + 7 * 24 * 60 * 60 * 1000),
    );
  };

  return { showBanner, isIOS, handleInstall, handleDismiss };
}
