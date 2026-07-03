import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
} from "react";

interface Option {
  label: string;
  value: string | number;
}

interface DropdownProps {
  value: string | number | "";
  onChange: (value: string | number) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  className?: string;
}

const Dropdown: React.FC<DropdownProps> = ({
  value,
  onChange,
  options,
  placeholder = "Chọn...",
  disabled = false,
  searchable = false,
  className = "",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  // Auto open direction
  useLayoutEffect(() => {
    if (isOpen && dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setOpenUp(spaceBelow < 250);
    }
  }, [isOpen]);

  // Click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filteredOptions = useMemo(() => {
    if (!searchable) return options;
    return options.filter((o) =>
      o.label.toLowerCase().includes(search.toLowerCase()),
    );
  }, [options, search, searchable]);

  return (
    <div ref={dropdownRef} className={`relative w-full space-y-2 ${className}`}>
      {/* Trigger */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`
          w-full px-4 py-3 rounded-2xl border-2 transition-all 
          flex justify-between items-center text-xs sm:text-sm font-bold relative shadow-inner

          ${
            disabled
              ? `
    bg-slate-100 dark:bg-white/5
    border-slate-200 dark:border-white/10
    text-slate-500 dark:text-white/60
    cursor-not-allowed
  `
              : isOpen
                ? `
                bg-white 
                dark:bg-slate-800
                border-nm 
                text-slate-800 
                dark:text-white
                cursor-pointer
              `
                : `
                bg-slate-50 
                dark:bg-slate-900
                border-transparent
                text-slate-600 
                dark:text-slate-300
                cursor-pointer
                hover:border-slate-200 
                dark:hover:border-slate-700
              `
          }
        `}
      >
        <span className={selected ? "" : "text-white/40"}>
          {selected ? selected.label : placeholder}
        </span>

        <i
          className={`fa-solid fa-chevron-down text-[10px] transition-transform ${
            disabled
              ? "text-slate-300 dark:text-slate-600"
              : isOpen
                ? "rotate-180 text-nm"
                : "text-slate-300"
          }`}
        />
      </div>

      {/* Dropdown List */}
      {isOpen && !disabled && (
        <div
          className={`
            absolute left-0 w-full 
            bg-white dark:bg-slate-800 
            rounded-2xl shadow-2xl z-[120] 
            border border-slate-100 dark:border-slate-700 
            py-2 overflow-hidden animate-fade-in
            ${openUp ? "bottom-full mb-3" : "top-full mt-3"}
          `}
        >
          {searchable && (
            <div className="px-4 py-3 border-b border-slate-50 dark:border-slate-700 flex items-center gap-2">
              <i className="fa-solid fa-magnifying-glass text-xs text-slate-300"></i>
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm kiếm..."
                className="w-full bg-transparent border-0 text-xs font-bold 
                text-slate-700 dark:text-slate-200 
                placeholder:text-slate-400 outline-none"
              />
            </div>
          )}

          <div className="max-h-60 overflow-y-auto">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <div
                  key={option.value}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                    setSearch("");
                  }}
                  className="px-6 py-3 text-xs font-bold 
                  text-slate-700 dark:text-slate-200
                  hover:bg-nm/5 hover:text-nm 
                  cursor-pointer transition-colors 
                  border-b last:border-0 
                  border-slate-50 dark:border-slate-700/50"
                >
                  {option.label}
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-xs font-black text-slate-300 uppercase">
                Không tìm thấy
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dropdown;
