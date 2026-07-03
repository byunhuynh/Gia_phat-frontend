import React, { useState, useRef, useLayoutEffect, useEffect } from "react";
import { motion } from "framer-motion";
import { createPortal } from "react-dom";

interface Props {
  value: string;
  onChange: (date: string) => void;
  placeholder?: string;
}

const CustomDatePicker: React.FC<Props> = ({
  value,
  onChange,
  placeholder = "Chọn ngày",
}) => {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);

  const triggerRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  const [position, setPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const selectedDate = value ? new Date(value) : today;

  const [currentMonth, setCurrentMonth] = useState(selectedDate.getMonth());
  const [currentYear, setCurrentYear] = useState(selectedDate.getFullYear());

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  const firstDay = new Date(currentYear, currentMonth, 1).getDay();

  /* ======================================================
     TÍNH VỊ TRÍ CALENDAR (FIX OVERFLOW TAB)
  ====================================================== */
  useLayoutEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();

      const estimatedHeight = 320; // chiều cao gần đúng calendar
      const spaceBelow = window.innerHeight - rect.bottom;
      const shouldOpenUp = spaceBelow < estimatedHeight;

      setOpenUp(shouldOpenUp);

      setPosition({
        top: shouldOpenUp ? rect.top - estimatedHeight - 8 : rect.bottom + 8,
        left: rect.left,
        width: rect.width,
      });
    }
  }, [open]);

  /* ======================================================
     CLICK OUTSIDE (FIX PORTAL)
  ====================================================== */
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        calendarRef.current &&
        !calendarRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  /* ======================================================
     FORMAT DATE
  ====================================================== */
  const formatDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  /* ======================================================
     ĐỔI THÁNG
  ====================================================== */
  const changeMonth = (offset: number) => {
    let newMonth = currentMonth + offset;
    let newYear = currentYear;

    if (newMonth < 0) {
      newMonth = 11;
      newYear--;
    } else if (newMonth > 11) {
      newMonth = 0;
      newYear++;
    }

    setCurrentMonth(newMonth);
    setCurrentYear(newYear);
  };

  const monthLabel = new Date(currentYear, currentMonth).toLocaleString(
    "vi-VN",
    {
      month: "long",
      year: "numeric",
    },
  );

  return (
    <>
      {/* INPUT */}
      <div className="relative w-full" ref={triggerRef}>
        <div
          onClick={() => setOpen((prev) => !prev)}
          className={`w-full px-4 py-3 rounded-xl border-2 text-xs font-bold flex items-center justify-between cursor-pointer transition-all text-slate-700 dark:text-slate-200
          ${
            open
              ? "bg-white dark:bg-slate-800 border-nm"
              : "bg-slate-50 dark:bg-slate-900 border-transparent hover:border-slate-200 dark:hover:border-slate-600"
          }`}
        >
          <div className="flex items-center gap-2">
            <i className="fa-solid fa-calendar-days text-nm text-xs"></i>
            <span>
              {value
                ? new Date(value + "T00:00:00").toLocaleDateString("vi-VN")
                : placeholder}
            </span>
          </div>

          <i
            className={`fa-solid fa-chevron-down text-[10px] transition-transform ${
              open ? "rotate-180 text-nm" : ""
            }`}
          />
        </div>
      </div>

      {/* CALENDAR PORTAL */}
      {open &&
        createPortal(
          <motion.div
            ref={calendarRef}
            initial={{ opacity: 0, y: openUp ? -10 : 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              position: "fixed",
              top: position.top,
              left: position.left,
              width: Math.max(position.width, 280),
              zIndex: 9999,
            }}
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-4"
          >
            {/* HEADER */}
            <div className="flex justify-between items-center mb-4">
              <button
                onClick={() => changeMonth(-1)}
                className="w-8 h-8 rounded-lg hover:bg-nm/10 flex items-center justify-center"
              >
                <i className="fa-solid fa-chevron-left text-xs"></i>
              </button>

              <span className="text-xs font-black uppercase tracking-wider">
                {monthLabel}
              </span>

              <button
                onClick={() => changeMonth(1)}
                className="w-8 h-8 rounded-lg hover:bg-nm/10 flex items-center justify-center"
              >
                <i className="fa-solid fa-chevron-right text-xs"></i>
              </button>
            </div>

            {/* DAY HEADER */}
            <div className="grid grid-cols-7 text-center text-[10px] font-black text-slate-400 mb-2">
              {["CN", "T2", "T3", "T4", "T5", "T6", "T7"].map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>

            {/* DAYS */}
            <div className="grid grid-cols-7 gap-1 text-center">
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}

              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateObj = new Date(currentYear, currentMonth, day);
                dateObj.setHours(0, 0, 0, 0);

                const isSelected = value && formatDate(dateObj) === value;

                const isToday = dateObj.getTime() === today.getTime();

                return (
                  <div
                    key={day}
                    onClick={() => {
                      onChange(formatDate(dateObj));
                      setOpen(false);
                    }}
                    className={`py-2 rounded-lg text-xs font-bold cursor-pointer transition-all text-slate-700 dark:text-slate-200
                    ${
                      isSelected
                        ? "bg-nm text-white dark:text-white"
                        : isToday
                          ? "border border-nm text-nm"
                          : "hover:bg-nm/10"
                    }`}
                  >
                    {day}
                  </div>
                );
              })}
            </div>
          </motion.div>,
          document.body,
        )}
    </>
  );
};

export default CustomDatePicker;
