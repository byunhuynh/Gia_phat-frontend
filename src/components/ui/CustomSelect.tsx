import React, { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

// 🔥 Mở rộng Option để hỗ trợ image + subtext
interface Option {
  id: string;
  name: string;
  subtext?: string; // mô tả phụ (VD: SKU, spec...)
  image?: string; // url hình ảnh preview
}

interface CustomSelectProps {
  label: string;
  options: Option[];
  value: string;
  onChange: (id: string) => void;
  icon?: string;
  allowCreate?: boolean;
  onCreateOption?: (name: string) => Promise<Option | void>;
}

const CustomSelectComponent: React.FC<CustomSelectProps> = ({
  label,
  options,
  value,
  onChange,
  icon = "fa-list-ul",
  allowCreate = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = useMemo(() => {
    if (value === undefined || value === null || value === "") return undefined;

    const stringValue = String(value);

    if (stringValue.startsWith("__new__")) {
      return {
        id: stringValue,
        name: stringValue.replace("__new__", ""),
      };
    }

    return options.find((opt) => String(opt.id) === stringValue);
  }, [options, value]);

  const filteredOptions = useMemo(() => {
    return options.filter((opt) =>
      opt.name.toLowerCase().includes(search.toLowerCase()),
    );
  }, [options, search]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCreate = () => {
    const tempId = `__new__${search.trim()}`;
    onChange(tempId);
    setIsOpen(false);
    setSearch("");
  };

  return (
    <div className="space-y-2 relative" ref={containerRef}>
      {/* LABEL */}
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
        {label}
      </label>

      {/* SELECT BUTTON */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`
          relative group
          w-full pl-14 pr-12 py-4
          rounded-2xl
          bg-slate-50 dark:bg-slate-700
          border-2 border-transparent
          cursor-pointer
          font-bold text-sm
          flex items-center
          transition-all duration-200

          ${
            isOpen
              ? "border-nm shadow-[0_0_0_3px_rgba(59,130,246,0.15)]"
              : "hover:border-slate-200 dark:hover:border-slate-600"
          }
        `}
      >
        {/* ICON LEFT */}
        <i
          className={`
            fa-solid ${icon}
            absolute left-5 top-1/2 -translate-y-1/2
            text-slate-300
            transition-colors duration-200
            ${isOpen ? "text-nm" : ""}
            pointer-events-none
          `}
        ></i>

        {/* SELECTED TEXT */}
        <div className="flex items-center gap-3 flex-1">
          {selectedOption?.image && (
            <div className="w-8 h-8 rounded-lg overflow-hidden bg-slate-100 flex-shrink-0">
              <img
                src={selectedOption.image}
                alt={selectedOption.name}
                className="w-full h-full object-contain bg-white"
              />
            </div>
          )}

          <div
            className={`flex-1 ${
              selectedOption
                ? "text-slate-900 dark:text-white"
                : "text-slate-400 dark:text-slate-500"
            }`}
          >
            {selectedOption ? selectedOption.name : `-- Chọn ${label} --`}
          </div>
        </div>

        {/* ARROW */}
        <i
          className={`
            fa-solid fa-chevron-down
            absolute right-5 top-1/2 -translate-y-1/2
            text-slate-400
            transition-all duration-200
            ${isOpen ? "rotate-180 text-nm" : ""}
            pointer-events-none
          `}
        ></i>
      </div>

      {/* DROPDOWN */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="absolute z-[60] left-0 right-0 mt-2 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-700 overflow-hidden"
          >
            {/* SEARCH */}
            <div className="p-3 border-b border-slate-100 dark:border-slate-700">
              <input
                type="text"
                placeholder={`Tìm ${label}...`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="
                  w-full px-3 py-2 rounded-xl
                  bg-slate-50 dark:bg-slate-700
                  text-sm font-bold
                  outline-none
                  placeholder:text-slate-400
                  dark:placeholder:text-slate-500
                "
                autoFocus
              />
            </div>

            {/* OPTIONS */}
            <div className="max-h-60 overflow-y-auto">
              {filteredOptions.map((option) => (
                <div
                  key={option.id}
                  onClick={() => {
                    onChange(option.id);
                    setIsOpen(false);
                  }}
                  className={`
      px-6 py-4 text-sm font-bold cursor-pointer transition-colors
      flex items-center gap-3
      ${
        String(value) === String(option.id)
          ? "bg-nm text-white"
          : "hover:bg-nm/5 text-slate-700 dark:text-slate-300 hover:text-nm"
      }
    `}
                >
                  {/* IMAGE */}
                  {option.image && (
                    <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0">
                      <img
                        src={option.image}
                        alt={option.name}
                        className="w-full h-full object-contain bg-white"
                      />
                    </div>
                  )}

                  {/* TEXT */}
                  <div className="flex-1">
                    <div>{option.name}</div>

                    {option.subtext && (
                      <div
                        className={`text-[10px] ${
                          String(value) === String(option.id)
                            ? "text-white/80"
                            : "text-slate-400"
                        }`}
                      >
                        {option.subtext}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* CREATE OPTION */}
              {allowCreate && search && filteredOptions.length === 0 && (
                <div
                  onClick={handleCreate}
                  className="px-6 py-4 text-sm font-black text-nm bg-nm/5 hover:bg-nm/10 cursor-pointer border-t"
                >
                  ➕ Tạo mới: "{search}"
                </div>
              )}

              {filteredOptions.length === 0 && (!allowCreate || !search) && (
                <div className="px-6 py-4 text-sm text-slate-400 text-center">
                  Không tìm thấy kết quả
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default React.memo(CustomSelectComponent);
