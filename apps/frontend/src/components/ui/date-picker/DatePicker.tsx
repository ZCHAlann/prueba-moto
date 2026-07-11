"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { CalendarRange, ChevronLeft, ChevronRight, X } from "lucide-react";

// ─── Utils ────────────────────────────────────────────────────────────────────

const MONTHS_ES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

const DAYS_ES = ["Lu","Ma","Mi","Ju","Vi","Sa","Do"];

function toYMD(d: Date) {
  return d.toISOString().slice(0, 10);
}

function parseYMD(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

/** Returns the weekday index (0 = Mon … 6 = Sun) for the 1st of the month */
function firstWeekday(year: number, month: number) {
  const raw = new Date(year, month, 1).getDay(); // 0=Sun
  return (raw + 6) % 7; // shift so 0 = Mon
}

function formatDisplay(ymd: string) {
  const d = parseYMD(ymd);
  if (!d) return "";
  return d.toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Calendar popup ───────────────────────────────────────────────────────────

type CalendarProps = {
  value: string;
  minDate?: string;
  maxDate?: string;
  onChange: (ymd: string) => void;
  onClose: () => void;
  style: React.CSSProperties;
};

function CalendarPopup({ value, minDate, maxDate, onChange, onClose, style }: CalendarProps) {
  const initial  = parseYMD(value) ?? new Date();
  const [view, setView] = useState({ year: initial.getFullYear(), month: initial.getMonth() });
  const [hovered, setHovered] = useState<string | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const today = toYMD(new Date());

  function prevMonth() {
    setView((v) => {
      const d = new Date(v.year, v.month - 1, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }
  function nextMonth() {
    setView((v) => {
      const d = new Date(v.year, v.month + 1, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  function selectYear(y: number) {
    setView((v) => ({ ...v, year: y }));
    setPickingYear(false);
  }

  const [pickingYear, setPickingYear] = useState(false);

  // Build grid
  const totalDays = daysInMonth(view.year, view.month);
  const startDay  = firstWeekday(view.year, view.month);
  const cells: (number | null)[] = [
    ...Array(startDay).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  // pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  function cellYMD(day: number) {
    return `${view.year}-${String(view.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function isDisabled(day: number) {
    const ymd = cellYMD(day);
    if (minDate && ymd < minDate) return true;
    if (maxDate && ymd > maxDate) return true;
    return false;
  }

  // Year picker list
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 20 }, (_, i) => currentYear - 10 + i);

  return createPortal(
    <div
      ref={popupRef}
      style={{ ...style, position: "fixed", zIndex: 99999 }}
      className="date-picker-popup"
      onMouseDown={(e) => e.stopPropagation()}
    >
        <style>{`
        .date-picker-popup {
          background: var(--dp-bg, #18181b);
          border: 1px solid var(--dp-border, rgba(255,255,255,0.08));
          border-radius: 20px;
          padding: 20px;
          width: 296px;
          box-shadow: 0 24px 48px rgba(0,0,0,0.35);
          font-family: inherit;
          animation: dp-in 0.15s ease;
        }
        /* Light theme: se aplica cuando NO hay .dark en <html> */
        :root:not(.dark) .date-picker-popup,
        html:not(.dark) .date-picker-popup {
          --dp-bg: #ffffff;
          --dp-border: rgba(0,0,0,0.08);
          --dp-text: #111;
          --dp-muted: #888;
          --dp-cell-hover: rgba(99,102,241,0.08);
          --dp-selected-bg: #6366f1;
          --dp-selected-text: #fff;
          --dp-today-border: #6366f1;
          --dp-disabled: #ccc;
          --dp-header-btn: rgba(0,0,0,0.05);
          --dp-header-btn-hover: rgba(0,0,0,0.10);
          box-shadow: 0 24px 48px rgba(0,0,0,0.12);
        }
        /* Dark theme: cuando <html> tiene la clase .dark */
        :root.dark .date-picker-popup,
        html.dark .date-picker-popup,
        .dark .date-picker-popup {
          --dp-text: #f4f4f5;
          --dp-muted: #71717a;
          --dp-cell-hover: rgba(129,140,248,0.15);
          --dp-selected-bg: #6366f1;
          --dp-selected-text: #fff;
          --dp-today-border: #818cf8;
          --dp-disabled: #3f3f46;
          --dp-header-btn: rgba(255,255,255,0.06);
          --dp-header-btn-hover: rgba(255,255,255,0.12);
        }
        @keyframes dp-in {
          from { opacity: 0; transform: translateY(6px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .dp-nav-btn {
          background: var(--dp-header-btn);
          border: none;
          border-radius: 10px;
          width: 32px; height: 32px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          color: var(--dp-text);
          transition: background 0.15s;
        }
        .dp-nav-btn:hover { background: var(--dp-header-btn-hover); }
        .dp-month-btn {
          background: none; border: none;
          font-size: 14px; font-weight: 600;
          color: var(--dp-text);
          cursor: pointer;
          padding: 4px 8px; border-radius: 8px;
          transition: background 0.15s;
          font-family: inherit;
        }
        .dp-month-btn:hover { background: var(--dp-header-btn-hover); }
        .dp-day-name {
          text-align: center;
          font-size: 11px; font-weight: 600;
          color: var(--dp-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 6px 0;
        }
        .dp-cell {
          aspect-ratio: 1;
          display: flex; align-items: center; justify-content: center;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 500;
          color: var(--dp-text);
          cursor: pointer;
          transition: background 0.1s, color 0.1s, transform 0.1s;
          position: relative;
          user-select: none;
          border: 1.5px solid transparent;
        }
        .dp-cell:hover:not(.dp-cell--disabled):not(.dp-cell--selected) {
          background: var(--dp-cell-hover);
          transform: scale(1.08);
        }
        .dp-cell--today { border-color: var(--dp-today-border); }
        .dp-cell--selected {
          background: var(--dp-selected-bg) !important;
          color: var(--dp-selected-text) !important;
          border-color: transparent !important;
          transform: scale(1.08);
        }
        .dp-cell--hovered:not(.dp-cell--selected):not(.dp-cell--disabled) {
          background: var(--dp-cell-hover);
        }
        .dp-cell--disabled {
          color: var(--dp-disabled);
          cursor: not-allowed;
        }
        .dp-cell--empty { cursor: default; }
        .dp-year-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 6px;
          margin-top: 8px;
          max-height: 180px;
          overflow-y: auto;
        }
        .dp-year-btn {
          background: none;
          border: 1px solid transparent;
          border-radius: 8px;
          padding: 6px 0;
          font-size: 13px;
          font-weight: 500;
          color: var(--dp-text);
          cursor: pointer;
          font-family: inherit;
          transition: background 0.12s;
        }
        .dp-year-btn:hover { background: var(--dp-cell-hover); }
        .dp-year-btn--current {
          background: var(--dp-selected-bg);
          color: var(--dp-selected-text);
        }
        .dp-today-btn {
          margin-top: 14px;
          width: 100%;
          background: var(--dp-header-btn);
          border: none;
          border-radius: 10px;
          padding: 8px 0;
          font-size: 13px;
          font-weight: 600;
          color: var(--dp-text);
          cursor: pointer;
          font-family: inherit;
          transition: background 0.15s;
        }
        .dp-today-btn:hover { background: var(--dp-header-btn-hover); }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <button className="dp-nav-btn" onClick={prevMonth} aria-label="Mes anterior">
          <ChevronLeft size={16} />
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button className="dp-month-btn" onClick={() => setPickingYear((v) => !v)}>
            {MONTHS_ES[view.month]} {view.year}
          </button>
        </div>

        <button className="dp-nav-btn" onClick={nextMonth} aria-label="Mes siguiente">
          <ChevronRight size={16} />
        </button>
      </div>

      {pickingYear ? (
        /* Year picker */
        <div className="dp-year-grid">
          {years.map((y) => (
            <button
              key={y}
              className={`dp-year-btn${y === view.year ? " dp-year-btn--current" : ""}`}
              onClick={() => selectYear(y)}
            >
              {y}
            </button>
          ))}
        </div>
      ) : (
        <>
          {/* Day names */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 4 }}>
            {DAYS_ES.map((d) => (
              <div key={d} className="dp-day-name">{d}</div>
            ))}
          </div>

          {/* Cells */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {cells.map((day, i) => {
              if (!day) return <div key={`e-${i}`} className="dp-cell dp-cell--empty" />;
              const ymd      = cellYMD(day);
              const selected = ymd === value;
              const isToday  = ymd === today;
              const disabled = isDisabled(day);
              const isHov    = hovered === ymd;
              return (
                <div
                  key={ymd}
                  className={[
                    "dp-cell",
                    selected  ? "dp-cell--selected"  : "",
                    isToday   ? "dp-cell--today"      : "",
                    disabled  ? "dp-cell--disabled"   : "",
                    isHov && !selected && !disabled ? "dp-cell--hovered" : "",
                  ].join(" ")}
                  onClick={() => { if (!disabled) { onChange(ymd); onClose(); } }}
                  onMouseEnter={() => setHovered(ymd)}
                  onMouseLeave={() => setHovered(null)}
                  role="button"
                  aria-label={ymd}
                  aria-pressed={selected}
                  tabIndex={disabled ? -1 : 0}
                  onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
                    if (e.key === "Enter" || e.key === " ") { if (!disabled) { onChange(ymd); onClose(); } }
                  }}
                >
                  {day}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Ir a hoy */}
      <button
        className="dp-today-btn"
        onClick={() => {
          const t = new Date();
          setView({ year: t.getFullYear(), month: t.getMonth() });
          setPickingYear(false);
        }}
      >
        Hoy
      </button>
    </div>,
    document.body
  );
}

// ─── DatePicker component ─────────────────────────────────────────────────────

export type DatePickerProps = {
  value: string;
  onChange: (ymd: string) => void;
  label?: string;
  placeholder?: string;
  minDate?: string;
  maxDate?: string;
  className?: string;
  /**
   * Si true, el picker se renderiza en formato compacto (altura 32px,
   * padding reducido, ancho "auto" en vez de 100%). Útil cuando va
   * inline con otros controles en una fila (ej. filtros de reportes).
   * Default: false (formato extendido, ancho 100%).
   */
  compact?: boolean;
};

export function DatePicker({
  value, onChange, label, placeholder = "Seleccionar fecha",
  minDate, maxDate, className = "",
  compact = false,
}: DatePickerProps) {
  const [open, setOpen]   = useState(false);
  const [pos, setPos]     = useState<React.CSSProperties>({});
  const triggerRef        = useRef<HTMLDivElement>(null);

  const calcPos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect        = triggerRef.current.getBoundingClientRect();
    const popupHeight = 340;
    const spaceBelow  = window.innerHeight - rect.bottom;
    const openUp      = spaceBelow < popupHeight + 8;

    if (openUp) {
      setPos({ bottom: window.innerHeight - rect.top + 6, left: rect.left });
    } else {
      setPos({ top: rect.bottom + 6, left: rect.left });
    }
  }, []);

  const handleOpen = () => {
    calcPos();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  return (
    <div
      className={`date-picker-root ${className}`}
      style={{
        position: "relative",
        display: "block",
        // jul 2026 v5 — modo `compact`: ancho automático para que el
        // picker se acomode al contenido (ideal cuando va en row con
        // otros controles). Sin `compact`, conserva el 100% legacy.
        width: compact ? "auto" : "100%",
      }}
    >
      <style>{`
        .dp-trigger {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          height: ${compact ? 32 : 40}px;
          padding: 0 ${compact ? 10 : 14}px;
          border-radius: ${compact ? 8 : 12}px;
          border: 1px solid;
          cursor: pointer;
          font-size: ${compact ? 12 : 14}px;
          font-weight: 500;
          font-family: inherit;
          transition: border-color 0.15s, background 0.15s;
          white-space: nowrap;
          min-width: ${compact ? 130 : 180}px;
        }
        /* Light theme */
        :root:not(.dark) .dp-trigger,
        html:not(.dark) .dp-trigger {
          background: #ffffff;
          border-color: rgba(0,0,0,0.12);
          color: #111;
        }
        :root:not(.dark) .dp-trigger:hover,
        html:not(.dark) .dp-trigger:hover { border-color: rgba(99,102,241,0.5); }
        :root:not(.dark) .dp-trigger.dp-open,
        html:not(.dark) .dp-trigger.dp-open { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.12); }
        :root:not(.dark) .dp-trigger-placeholder,
        html:not(.dark) .dp-trigger-placeholder { color: #aaa; }
        :root:not(.dark) .dp-clear-btn,
        html:not(.dark) .dp-clear-btn { color: #aaa; }

        /* Dark theme */
        :root.dark .dp-trigger,
        html.dark .dp-trigger,
        .dark .dp-trigger {
          background: rgba(255,255,255,0.04);
          border-color: rgba(255,255,255,0.08);
          color: #f4f4f5;
        }
        :root.dark .dp-trigger:hover,
        html.dark .dp-trigger:hover,
        .dark .dp-trigger:hover { border-color: rgba(129,140,248,0.4); }
        :root.dark .dp-trigger.dp-open,
        html.dark .dp-trigger.dp-open,
        .dark .dp-trigger.dp-open { border-color: #818cf8; box-shadow: 0 0 0 3px rgba(129,140,248,0.15); }
        :root.dark .dp-trigger-placeholder,
        html.dark .dp-trigger-placeholder,
        .dark .dp-trigger-placeholder { color: #52525b; }
        :root.dark .dp-clear-btn,
        html.dark .dp-clear-btn,
        .dark .dp-clear-btn { color: #52525b; }
        :root.dark .dp-clear-btn:hover,
        html.dark .dp-clear-btn:hover,
        .dark .dp-clear-btn:hover { color: #e24b4a; }

        .dp-trigger-icon { opacity: 0.5; flex-shrink: 0; }
        .dp-trigger-text { flex: 1; }
        .dp-clear-btn {
          background: none; border: none; cursor: pointer;
          display: flex; align-items: center;
          padding: 0; border-radius: 4px;
          transition: color 0.12s;
        }
        .dp-label {
          display: block;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #71717a;
          margin-bottom: 6px;
        }
      `}</style>

      {label && <span className="dp-label">{label}</span>}

      <div
        ref={triggerRef}
        className={`dp-trigger${open ? " dp-open" : ""}`}
        onClick={handleOpen}
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-expanded={open}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleOpen(); }}
      >
        <CalendarRange size={15} className="dp-trigger-icon" />
        <span className={`dp-trigger-text${!value ? " dp-trigger-placeholder" : ""}`}>
          {value ? formatDisplay(value) : placeholder}
        </span>
        {value && (
          <button
            className="dp-clear-btn"
            onClick={(e) => { e.stopPropagation(); onChange(""); }}
            aria-label="Limpiar fecha"
            tabIndex={-1}
          >
            <X size={13} />
          </button>
        )}
      </div>

      {open && (
        <CalendarPopup
          value={value}
          minDate={minDate}
          maxDate={maxDate}
          onChange={onChange}
          onClose={() => setOpen(false)}
          style={pos}
        />
      )}
    </div>
  );
}