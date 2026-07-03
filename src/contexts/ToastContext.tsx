import React, { createContext, useContext, useState, useCallback } from "react";
import { Toast, ToastType } from "../types";

interface ToastContextType {
  showToast: (
    message: string,
    type?: ToastType,
    options?: { actionLabel?: string; onAction?: () => void },
  ) => void;
  toasts: Toast[];
  removeToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = (): ToastContextType => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (
      message: string,
      type: ToastType = "info",
      options?: { actionLabel?: string; onAction?: () => void },
    ) => {
      const id = Date.now();
      setToasts((prev) => [
        ...prev,
        {
          id,
          message,
          type,
          actionLabel: options?.actionLabel,
          onAction: options?.onAction,
        },
      ]);
      setTimeout(() => removeToast(id), 5000);
    },
    [removeToast],
  );

  return (
    <ToastContext.Provider value={{ showToast, toasts, removeToast }}>
      {children}
    </ToastContext.Provider>
  );
};

export default ToastContext;
