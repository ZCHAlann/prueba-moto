import { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useVehicleCockpit } from "../../../hooks/useVehiculo";

// ─── Analog Gauge Web Component (registrado una vez) ─────────────────────────
function registerAnalogGauge() {
  if (typeof window === "undefined" || customElements.get("analog-gauge")) return;

  const styles = new CSSStyleSheet();
  styles.replaceSync(`
    :host {
      --analog-gauge-segments: 60;
      --analog-gauge-segments-w: 1deg;
      --analog-gauge-start-angle: 270deg;
      --analog-gauge-range: 220deg;
      --analog-gauge-bdw: 9cqi;
      --analog-gauge-bg: #8CF, #6BF, #46E, #24C var(--analog-gauge-range), #0000 0 var(--analog-gauge-range);
      --analog-gauge-mask-circle: radial-gradient(circle at 50% 50%, #0000 calc(50cqi - var(--analog-gauge-bdw, 10cqi)), #000 0);
      --analog-gauge-mask-segment: repeating-conic-gradient(
          from var(--analog-gauge-start-angle, 270deg) at 50% 50%,
          #000 0 var(--analog-gauge-segments-w, 1deg),
          #0000 0 calc((var(--analog-gauge-range, 220deg) / var(--analog-gauge-segments, 60))));
      --analog-gauge-needle-bg: #334;
      --analog-gauge-needle-h: 10cqi;
      --analog-gauge-value-mark-w: 6ch;
      --_w: calc(100cqi/3*2);
      --_vw: calc(100cqi - (2 * var(--analog-gauge-bdw, 9cqi)));
      --_m: calc(100cqi/6);
      aspect-ratio: 1;
      container-type: inline-size;
      font-family: var(--font-outfit, ui-sans-serif, system-ui, sans-serif);
      display: grid;
      grid-template: repeat(3, 1fr) / repeat(3, 1fr);
      inline-size: 100%;
    }
    :host::part(gauge) {
      background: conic-gradient(from var(--analog-gauge-start-angle, 270deg), var(--analog-gauge-bg));
      border-radius: 50%;
      grid-area: 1 / 1 / 4 / 4;
      mask: var(--analog-gauge-mask-circle), var(--analog-gauge-mask-segment, none);
      mask-composite: subtract;
    }
    :host::part(label) {
      font-size: 7.5cqi;
      font-weight: 500;
      grid-area: 3 / 2 / 4 / 3;
      isolation: isolate;
      line-height: 1.2;
      place-self: center center;
      text-align: center;
      color: var(--gauge-text, #334);
    }
    :host::part(label-min), :host::part(label-max) {
      font-size: 5cqi;
      font-weight: 400;
      place-self: center;
      color: var(--gauge-text-muted, rgba(50,50,80,0.45));
    }
    :host::part(label-min) { grid-area: 3 / 1 / 4 / 2; }
    :host::part(label-max) { grid-area: 3 / 3 / 4 / 4; }
    :host::part(value) {
      font-size: 15cqi;
      font-weight: 600;
      grid-area: 3 / 2 / 4 / 3;
      isolation: isolate;
      place-self: start center;
      color: var(--gauge-value, #1a1a18);
    }
    :host::part(needle) {
      align-self: center;
      background: var(--analog-gauge-needle-bg);
      clip-path: polygon(7.5% 50%, 78% 0%, 83% 35%, 83% 65%, 78% 100%);
      grid-area: 2 / 1 / 3 / 3;
      height: var(--analog-gauge-needle-h);
      isolation: isolate;
      mask: radial-gradient(circle at calc(100% - var(--_m)) 50%, #0000 0 2.5cqi, #FFF 2.5cqi);
      rotate: var(--_d, 0deg);
      transform-origin: calc(100% - var(--_m)) 50%;
      width: var(--_w);
    }
    :host::part(value-marks) {
      all: unset;
      aspect-ratio: 1;
      border-radius: 50%;
      box-sizing: border-box;
      grid-area: 1 / 1 / 4 / 4;
      list-style: none;
      place-self: center;
      position: relative;
      width: var(--_vw);
    }
    :host::part(value-mark) {
      --_r: calc((var(--_vw) - var(--analog-gauge-value-mark-w)) / 2);
      --_x: calc(var(--_r) + (var(--_r) * cos(var(--_d))));
      --_y: calc(var(--_r) + (var(--_r) * sin(var(--_d))));
      color: var(--gauge-text-muted, rgba(50,50,80,0.5));
      display: grid;
      font-size: 3cqi;
      font-weight: 400;
      left: var(--_x);
      place-content: center;
      position: absolute;
      top: var(--_y);
      width: var(--analog-gauge-value-mark-w);
    }
  `);

  class AnalogGauge extends HTMLElement {
    static get observedAttributes() { return ["value"]; }
    #root: ShadowRoot;
    #units: Record<string, number | string>;
    #valueEl: HTMLElement | null = null;

    constructor() {
      super();
      this.#root = this.attachShadow({ mode: "open" });
      (this.#root as any).adoptedStyleSheets = [styles];
      const cs = getComputedStyle(this);
      this.#units = {
        defaultMark: 90, defaultNeedle: 270,
        max: parseInt(this.getAttribute("max") || "180"),
        min: parseInt(this.getAttribute("min") || "0"),
        range: parseFloat(cs.getPropertyValue("--analog-gauge-range")) || 220,
        suffix: this.getAttribute("suffix") || "",
        start: parseFloat(cs.getPropertyValue("--analog-gauge-start-angle")) || 270,
        value: parseFloat(this.getAttribute("value") || "0"),
      };
      (this.#units as any).minDegree = (this.#units.start as number) - (this.#units.defaultNeedle as number);
      (this.#units as any).totalRange = this.#units.range;
      this.#root.innerHTML = `
        <div part="gauge"></div>
        ${this.#generateValueMarks()}
        <div part="needle"></div>
        <div part="value"></div>
        <div part="label">${this.getAttribute("label") || ""}</div>
        <div part="label-min">${this.getAttribute("min-label") || ""}</div>
        <div part="label-max">${this.getAttribute("max-label") || ""}</div>`;
      this.#valueEl = this.#root.querySelector('[part="value"]');
      this.#update();
    }
    attributeChangedCallback(name: string, _old: string, val: string) {
      if (name === "value") { (this.#units as any).value = parseFloat(val || "0"); this.#update(); }
    }
    #generateValueMarks(): string {
      const values = this.getAttribute("values");
      if (!values) return "";
      let arr: string[] = [];
      if (/^\s*\d+\s*$/.test(values)) {
        const count = parseInt(values.trim());
        arr = Array.from({ length: count }, (_, i) =>
          String(Math.round((this.#units.min as number) + (i * ((this.#units.max as number) - (this.#units.min as number)) / (count - 1 || 1))))
        );
      } else { arr = values.split(",").map(v => v.trim()); }
      const step = (this.#units.range as number) / (arr.length - 1 || 1);
      return `<ul part="value-marks">${arr.map((v, i) => {
        const deg = (this.#units.start as number) - (this.#units.defaultMark as number) + (i * step);
        return `<li style="--_d:${deg}deg" part="value-mark">${v}</li>`;
      }).join("")}</ul>`;
    }
    #update() {
      const min = this.#units.min as number, max = this.#units.max as number;
      const val = this.#units.value as number;
      const norm = Math.max(min, Math.min(max, val));
      const pct = (norm - min) / (max - min);
      const deg = (this.#units.minDegree as number) + pct * (this.#units.totalRange as number);
      this.style.setProperty("--_d", `${deg}deg`);
      if (this.#valueEl) this.#valueEl.textContent = String(val) + String(this.#units.suffix);
    }
  }
  customElements.define("analog-gauge", AnalogGauge);
}

// ─── Icons ───────────────────────────────────────────────────────────────────
const Icon = {
  fuel: <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M19.77 7.23l.01-.01-3.72-3.72-1.06 1.06 1.83 1.83c-.91.37-1.57 1.26-1.57 2.31 0 1.38 1.12 2.5 2.5 2.5.27 0 .53-.04.77-.11v7.21c0 .55-.45 1-1 1s-1-.45-1-1V14c0-1.1-.9-2-2-2h-1V5c0-1.1-.9-2-2-2H6c-1.1 0-2 .9-2 2v16h10v-7.5h1.5v5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V9c0-.69-.28-1.32-.73-1.77zM18.75 10c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zM8 18v-4.5h4V18H8zm4-6H8V5h4v7z"/></svg>,
  oil: <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M12 2c-5.33 4.55-8 8.48-8 11.8 0 4.98 3.8 8.2 8 8.2s8-3.22 8-8.2c0-3.32-2.67-7.25-8-11.8z"/></svg>,
  power: <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M13 3h-2v10h2V3zm4.83 2.17l-1.42 1.42C17.99 7.86 19 9.81 19 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.19 1.01-4.14 2.58-5.42L6.17 5.17C4.23 6.82 3 9.26 3 12c0 4.97 4.03 9 9 9s9-4.03 9-9c0-2.74-1.23-5.18-3.17-6.83z"/></svg>,
  alert: <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>,
  wrench: <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/></svg>,
  calendar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  openNew: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>,
  oilChange: <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M19.5 12c0-1.93-.61-3.72-1.64-5.18L20 4.69 19.31 4l-2.13 2.13A8.96 8.96 0 0012 4.5C7.31 4.5 3.5 8.31 3.5 13c0 2.28.85 4.36 2.24 5.94L3.5 21.19 4.19 22l2.25-2.25C7.73 21.13 9.79 22 12 22c4.69 0 8.5-3.81 8.5-8.5 0-.51-.05-1.01-.13-1.5H19.5z"/></svg>,
  tire: <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>,
  report: <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>,
  history: <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>,
  user: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  car: <svg viewBox="0 0 120 70" fill="none" stroke="currentColor" strokeWidth="3" className="w-full"><rect x="5" y="22" width="110" height="36" rx="10"/><path d="M20 22 L38 6 L82 6 L100 22"/><circle cx="32" cy="60" r="12"/><circle cx="88" cy="60" r="12"/><circle cx="32" cy="60" r="6"/><circle cx="88" cy="60" r="6"/><rect x="42" y="9" width="36" height="10" rx="2"/><rect x="100" y="30" width="14" height="10" rx="3"/><rect x="6" y="30" width="14" height="10" rx="3"/></svg>,
};

// ─── Leaflet Mini Map ─────────────────────────────────────────────────────────
function MiniMap({ lat, lng, location }: { lat: number; lng: number; location: string }) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    (async () => {
      const L = await import("leaflet");
      await import("leaflet/dist/leaflet.css");
      const map = L.map(divRef.current!, {
        center: [lat, lng], zoom: 14,
        zoomControl: false, attributionControl: false,
        dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
      });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", { maxZoom: 19 }).addTo(map);
      const icon = L.divIcon({
        html: `<div style="width:12px;height:12px;border-radius:50%;background:#12b76a;border:2px solid white;box-shadow:0 0 8px rgba(18,183,106,0.5);"></div>`,
        className: "", iconSize: [12, 12], iconAnchor: [6, 6],
      });
      L.marker([lat, lng], { icon }).addTo(map);
      mapRef.current = map;
    })();
    return () => { mapRef.current?.remove(); mapRef.current = null; };
  }, [lat, lng]);

  return (
    <div className="relative rounded-xl overflow-hidden mt-2.5" style={{ height: 110 }}>
      <div ref={divRef} className="w-full h-full" />
      <div className="absolute bottom-0 left-0 right-0 px-2.5 py-1.5 flex items-center gap-1.5"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.4), transparent)" }}>
        <span className="w-1.5 h-1.5 rounded-full bg-success-500 flex-shrink-0" />
        <span className="text-[10px] font-semibold text-white/80 truncate">{location}</span>
      </div>
    </div>
  );
}

// ─── Priority Badge ───────────────────────────────────────────────────────────
function PriorityBadge({ priority }: { priority: string }) {
  const cfg: Record<string, string> = {
    Emergente:  "bg-rose-500/10 text-rose-600 border-rose-500/20 dark:text-rose-400",
    Alta:       "bg-orange-500/10 text-orange-600 border-orange-500/20 dark:text-orange-400",
    Normal:     "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400",
    Programado: "bg-gray-100 text-gray-500 border-gray-200 dark:bg-white/[0.04] dark:text-gray-400 dark:border-white/[0.06]",
    high:       "bg-rose-500/10 text-rose-600 border-rose-500/20 dark:text-rose-400",
    medium:     "bg-orange-500/10 text-orange-600 border-orange-500/20 dark:text-orange-400",
    low:        "bg-gray-100 text-gray-500 border-gray-200 dark:bg-white/[0.04] dark:text-gray-400 dark:border-white/[0.06]",
  };
  return (
    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border capitalize ${cfg[priority] ?? cfg["Normal"]}`}>
      {priority}
    </span>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    Pendiente:    "bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400",
    "En proceso": "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400",
    Completado:   "bg-success-500/10 text-success-700 border-success-500/20 dark:text-success-400",
  };
  return (
    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${cfg[status] ?? "bg-gray-100 text-gray-500 border-gray-200 dark:bg-white/[0.04] dark:text-gray-400 dark:border-white/[0.06]"}`}>
      {status}
    </span>
  );
}

// ─── Glass Card ───────────────────────────────────────────────────────────────
function GlassCard({ children, className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`
        bg-white/60 border border-white/50 shadow-[0_2px_16px_rgba(0,0,0,0.07),0_0_0_0.5px_rgba(0,0,0,0.04)]
        backdrop-blur-xl backdrop-saturate-150
        dark:bg-gray-dark/70 dark:border-white/[0.07] dark:shadow-[0_2px_16px_rgba(0,0,0,0.3)]
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
}

// ─── Stat Chip (flotante sobre el carro) ──────────────────────────────────────
function StatChip({ icon, label, value, iconClass }: {
  icon: React.ReactNode; label: string; value: string; iconClass: string;
}) {
  return (
    <div className="flex items-center gap-2.5 bg-white/75 dark:bg-gray-900/80 backdrop-blur-xl border border-white/60 dark:border-white/[0.08] rounded-xl px-3.5 py-2.5 shadow-[0_1px_8px_rgba(0,0,0,0.08)]">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${iconClass}`}>
        {icon}
      </div>
      <div>
        <span className="block text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{label}</span>
        <span className="text-[15px] font-semibold text-gray-800 dark:text-white leading-none">{value}</span>
      </div>
    </div>
  );
}

// ─── Action Button ────────────────────────────────────────────────────────────
function ActionBtn({ icon, label, sub, accent = false, onClick }: {
  icon: React.ReactNode; label: string; sub: string; accent?: boolean; onClick?: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      className={`p-3.5 rounded-2xl border text-left transition-colors ${
        accent
          ? "bg-orange-500/8 border-orange-400/25 hover:bg-orange-500/14 dark:bg-orange-500/10 dark:border-orange-500/20 dark:hover:bg-orange-500/18"
          : "bg-black/[0.02] border-black/[0.07] hover:bg-black/[0.05] dark:bg-white/[0.03] dark:border-white/[0.07] dark:hover:bg-white/[0.06]"
      }`}
      whileHover={{ scale: 1.02, y: -1 }}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.15 }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={accent ? "text-orange-500 dark:text-orange-400" : "text-gray-400 dark:text-gray-500"}>{icon}</span>
        <span className={`text-[11px] font-semibold ${accent ? "text-orange-600 dark:text-orange-300" : "text-gray-700 dark:text-gray-300"}`}>{label}</span>
      </div>
      <span className="text-[10px] text-gray-400 dark:text-gray-500">{sub}</span>
    </motion.button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface VehicleCockpitProps {
  assetId: string;
  companyId: string;
}

export default function VehicleCockpit({ assetId, companyId }: VehicleCockpitProps) {
  const { data, loading, error } = useVehicleCockpit(assetId, companyId);
  const gaugeRef = useRef<HTMLElement | null>(null);
  const [gaugeReady, setGaugeReady] = useState(false);

  // Registrar el web component una sola vez
  useEffect(() => {
    registerAnalogGauge();
    setGaugeReady(true);
  }, []);

  // Actualizar la velocidad en el gauge cuando cambie
  const speed = 57; // en producción: data?.asset?.speed ?? 0
  useEffect(() => {
    if (gaugeRef.current) {
      gaugeRef.current.setAttribute("value", String(speed));
    }
  }, [speed, gaugeReady]);

  // ── loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <motion.div className="flex flex-col items-center gap-4"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="w-14 h-14 bg-orange-500/10 border border-orange-500/20 rounded-2xl flex items-center justify-center text-orange-500">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>
          </div>
          <div className="flex gap-1.5">
            {[0, 1, 2].map(i => (
              <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-orange-500"
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 0.7, delay: i * 0.15, repeat: Infinity }} />
            ))}
          </div>
          <p className="text-xs text-gray-400 font-medium">Cargando vehículo…</p>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <GlassCard className="rounded-2xl p-8 text-center max-w-sm mx-4">
          <div className="w-10 h-10 bg-rose-500/10 rounded-xl flex items-center justify-center mx-auto mb-3 text-rose-500">
            {Icon.alert}
          </div>
          <p className="text-sm font-semibold text-gray-800 dark:text-white/80 mb-1">Error al cargar</p>
          <p className="text-xs text-gray-400">{error}</p>
        </GlassCard>
      </div>
    );
  }

  // ── datos ─────────────────────────────────────────────────────────────────
  const asset        = data?.asset;
  const driver       = data?.driver;
  const fuel         = data?.fuel;
  const oilCheck     = data?.oilCheck;
  const oilChange    = data?.oilChange;
  const alerts       = data?.alerts ?? [];
  const maintenances = data?.maintenances ?? [];

  const photoUrl    = asset?.photoUrls?.[0] ?? "";
  const fuelPct     = fuel ? Math.min(Math.round((fuel.totalLiters / 60) * 100), 100) : 100;
  const oilPct      = oilCheck ? (oilCheck.puedeSalir ? 82 : 30) : 82;
  const mileage     = fuel?.lastOdometer ?? 105500;
  const mileageMax  = oilChange?.nextReading ?? 123123;
  const mileagePct  = Math.min(mileage / mileageMax, 1);
  const oilProgressPct = oilChange?.progressPct ?? 82;

  // GPS
  const rawParts = asset?.location?.split(",").map(Number) ?? [];
  const lat      = rawParts.length === 2 && !isNaN(rawParts[0]) ? rawParts[0] : null;
  const lng      = rawParts.length === 2 && !isNaN(rawParts[1]) ? rawParts[1] : null;
  const hasGps   = lat !== null && lng !== null;
  const locationLabel = hasGps
    ? `${lat!.toFixed(4)}, ${lng!.toFixed(4)}`
    : (asset?.location ?? "Sin ubicación");

  // animation variants
  const container = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };
  const fadeUp = { hidden: { opacity: 0, y: 18 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } } };

  return (
    <div className="w-full h-full overflow-auto bg-gray-100/80 dark:bg-gray-950">
      <motion.div
        className="max-w-[1380px] mx-auto p-6 lg:p-7 flex flex-col gap-5"
        initial="hidden" animate="visible" variants={container}
      >

        {/* ── Header ── */}
        <motion.div className="flex items-center justify-between gap-4 flex-wrap" variants={fadeUp}>
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-white tracking-tight leading-none">
                {asset ? `${asset.brand} ${asset.model}` : "—"}
              </h1>
              <p className="text-[13px] text-gray-400 dark:text-gray-500 mt-1">
                {asset?.year && `${asset.year} · `}
                {asset?.fuelType === "electric" ? "Eléctrico" : asset?.fuelType ?? "—"}
                {driver && ` · Conductor: ${driver.firstName} ${driver.lastName}`}
              </p>
            </div>

            {asset?.plate && (
              <span className="font-mono text-[11px] font-medium text-gray-500 dark:text-gray-400 bg-white/70 dark:bg-white/[0.05] border border-black/[0.08] dark:border-white/[0.08] px-3 py-1 rounded-full tracking-widest shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                {asset.plate}
              </span>
            )}

            <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1 rounded-full border ${
              asset?.status === "Operativo"
                ? "bg-success-500/10 text-success-700 border-success-500/20 dark:text-success-400"
                : "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-400"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${asset?.status === "Operativo" ? "bg-success-500" : "bg-amber-500"}`} />
              {asset?.status ?? "Desconocido"}
            </span>

            {alerts.length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1 rounded-full border bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400">
                {Icon.alert}
                {alerts.length} alerta{alerts.length > 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Nav tabs */}
          <div className="flex gap-1 bg-white/60 dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.07] rounded-full p-1 shadow-[0_1px_4px_rgba(0,0,0,0.06)] backdrop-blur-xl">
            {["Panel", "Historial", "Reportes"].map((tab, i) => (
              <button key={tab} className={`px-4 py-1.5 rounded-full text-[12px] font-medium transition-all ${
                i === 0
                  ? "bg-white dark:bg-white/[0.08] text-gray-800 dark:text-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}>
                {tab}
              </button>
            ))}
          </div>
        </motion.div>

        {/* ── Main grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── Columna izquierda ── */}
          <motion.div className="lg:col-span-2 flex flex-col gap-4" variants={fadeUp}>

            {/* Hero card: carro + stats */}
            <GlassCard className="rounded-2xl overflow-hidden">

              {/* Área del carro */}
              <div className="relative" style={{ minHeight: 240 }}>

                {/* Chips flotantes */}
                <div className="absolute top-4 left-4 right-4 flex justify-between z-10 pointer-events-none">
                  <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}>
                    <StatChip
                      icon={Icon.fuel}
                      label={asset?.fuelType === "electric" ? "Batería" : "Combustible"}
                      value={`${fuelPct}%`}
                      iconClass="bg-success-500/12 text-success-600 dark:text-success-400"
                    />
                  </motion.div>
                  <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }}>
                    <StatChip
                      icon={Icon.oil}
                      label="Aceite"
                      value={`${oilPct}%`}
                      iconClass="bg-blue-500/10 text-blue-600 dark:text-blue-400"
                    />
                  </motion.div>
                </div>

                {/* Imagen o silueta del vehículo */}
                <div className="flex items-center justify-center py-12 px-8" style={{ minHeight: 240 }}>
                  {photoUrl ? (
                    <motion.img
                      src={photoUrl}
                      alt={asset?.name}
                      className="max-h-48 w-full object-contain"
                      style={{ filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.15))" }}
                      initial={{ opacity: 0, scale: 0.95, y: 8 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
                    />
                  ) : (
                    <motion.div
                      className="w-full max-w-xs text-gray-300 dark:text-gray-700"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                    >
                      {Icon.car}
                    </motion.div>
                  )}
                </div>
              </div>

              {/* Stats bar inferior */}
              <div className="border-t border-black/[0.06] dark:border-white/[0.06] grid grid-cols-3 divide-x divide-black/[0.06] dark:divide-white/[0.06]">

                {/* Velocímetro */}
                <div className="flex flex-col items-center py-5 gap-1">
                  {gaugeReady && (
                    // @ts-ignore — web component
                    <analog-gauge
                      ref={gaugeRef}
                      value={String(speed)}
                      min="0"
                      max="180"
                      label="Km/h"
                      values="0,60,120,180"
                      style={{
                        width: 86,
                        height: 86,
                        "--gauge-text": "var(--color-gray-700, #344054)",
                        "--gauge-value": "var(--color-gray-900, #101828)",
                        "--gauge-text-muted": "rgba(98,112,128,0.45)",
                        "--analog-gauge-needle-bg": "#344054",
                      } as React.CSSProperties}
                    />
                    // @ts-ignore
                  )}
                  <p className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Velocidad</p>
                </div>

                {/* Botón de encendido */}
                <div className="flex flex-col items-center justify-center py-5 gap-2">
                  <motion.button
                    className="w-14 h-14 bg-success-500/10 border-[1.5px] border-success-500/30 rounded-full flex items-center justify-center text-success-600 dark:text-success-400 hover:bg-success-500/18 transition-colors"
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.94 }}
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.7, type: "spring", stiffness: 300, damping: 14 }}
                  >
                    {Icon.power}
                  </motion.button>
                  <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Encendido</span>
                </div>

                {/* Kilometraje */}
                <div className="flex flex-col items-center py-5 px-5 gap-1.5">
                  <div className="text-center">
                    <motion.span
                      className="block text-xl font-semibold text-gray-900 dark:text-white leading-none tracking-tight"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
                    >
                      {mileage.toLocaleString("es-EC")}
                    </motion.span>
                    <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Kilómetros</span>
                  </div>
                  <div className="w-full h-1.5 bg-black/[0.06] dark:bg-white/[0.06] rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-orange-500 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${mileagePct * 100}%` }}
                      transition={{ delay: 0.9, duration: 0.8, ease: "easeOut" }}
                    />
                  </div>
                  {oilChange && (
                    <p className="text-[9px] text-gray-400 dark:text-gray-500">
                      Próx. cambio: {oilChange.nextReading.toLocaleString("es-EC")} km
                    </p>
                  )}
                  <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Kilometraje</span>
                </div>
              </div>
            </GlassCard>

            {/* Alertas activas */}
            <AnimatePresence>
              {alerts.length > 0 && (
                <motion.div className="flex flex-col gap-2"
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  {alerts.slice(0, 3).map((a, i) => (
                    <motion.div
                      key={a.id}
                      className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 ${
                        a.severity === "high"
                          ? "bg-rose-500/[0.06] border-rose-500/20"
                          : "bg-amber-500/[0.06] border-amber-500/20"
                      }`}
                      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.07 }}
                    >
                      <span className={a.severity === "high" ? "text-rose-500" : "text-amber-500"}>{Icon.alert}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-gray-800 dark:text-white/80 truncate">{a.title}</p>
                        <p className="text-[10px] text-gray-400 capitalize">{a.severity} · {a.type}</p>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Acciones */}
            <GlassCard className="rounded-2xl p-5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-4">Acciones del vehículo</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <ActionBtn icon={Icon.oilChange} label="Cambio aceite" sub="Registrar servicio" accent />
                <ActionBtn icon={Icon.tire}      label="Llantas"       sub="Inspección presión" />
                <ActionBtn icon={Icon.report}    label="Reportar falla" sub="Incidencia técnica" />
                <ActionBtn icon={Icon.history}   label="Historial"     sub="Ver eventos pasados" />
              </div>
            </GlassCard>
          </motion.div>

          {/* ── Columna derecha ── */}
          <motion.div className="flex flex-col gap-4" variants={fadeUp}>

            {/* Cambio de aceite */}
            {oilChange && (
              <GlassCard className="rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-[12px] font-semibold text-gray-800 dark:text-white/80">Cambio de aceite</p>
                  <span className="text-[10px] text-gray-400">
                    {oilChange.reading.toLocaleString("es-EC")} / {oilChange.nextReading.toLocaleString("es-EC")} km
                  </span>
                </div>
                <div className="h-1.5 bg-black/[0.06] dark:bg-white/[0.06] rounded-full overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full ${
                      oilProgressPct > 85 ? "bg-rose-500" :
                      oilProgressPct > 60 ? "bg-amber-500" : "bg-success-500"
                    }`}
                    initial={{ width: 0 }}
                    animate={{ width: `${oilProgressPct}%` }}
                    transition={{ delay: 0.7, duration: 0.8, ease: "easeOut" }}
                  />
                </div>
                <div className="flex justify-between mt-1.5">
                  <span className="text-[10px] text-gray-400">
                    Último: {oilChange.date ? new Date(oilChange.date).toLocaleDateString("es-EC", { day: "2-digit", month: "short" }) : "—"}
                  </span>
                  <span className={`text-[10px] font-bold ${
                    oilProgressPct > 85 ? "text-rose-500" :
                    oilProgressPct > 60 ? "text-amber-500" : "text-success-600 dark:text-success-400"
                  }`}>
                    {oilProgressPct.toFixed(0)}%
                  </span>
                </div>
              </GlassCard>
            )}

            {/* Inspección de aceite */}
            {oilCheck && (
              <GlassCard className="rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-[12px] font-semibold text-gray-800 dark:text-white/80">Inspección de aceite</p>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                    oilCheck.puedeSalir
                      ? "bg-success-500/10 text-success-700 border-success-500/20 dark:text-success-400"
                      : "bg-rose-500/10 text-rose-600 border-rose-500/20 dark:text-rose-400"
                  }`}>
                    {oilCheck.puedeSalir ? "Apto" : "Requiere cambio"}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { label: "Nivel", value: oilCheck.nivel },
                    { label: "Color", value: oilCheck.color },
                    { label: "Confianza", value: oilCheck.confianza },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-black/[0.025] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-2 text-center">
                      <p className="text-[9px] text-gray-400 uppercase font-bold tracking-wide">{label}</p>
                      <p className="text-[11px] font-semibold text-gray-700 dark:text-white/70 mt-0.5 truncate">{value}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-gray-400 mt-2">
                  {new Date(oilCheck.createdAt).toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" })}
                </p>
              </GlassCard>
            )}

            {/* Ubicación */}
            <GlassCard className="rounded-2xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[12px] font-semibold text-gray-800 dark:text-white/80">Ubicación</p>
                  <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider mt-0.5 truncate max-w-[180px]">
                    {locationLabel}
                  </p>
                </div>
                <button className="w-7 h-7 rounded-lg bg-black/[0.04] dark:bg-white/[0.04] border border-black/[0.07] dark:border-white/[0.07] flex items-center justify-center text-gray-400 hover:bg-black/[0.08] dark:hover:bg-white/[0.08] transition-colors flex-shrink-0">
                  {Icon.openNew}
                </button>
              </div>

              {hasGps ? (
                <MiniMap lat={lat!} lng={lng!} location={locationLabel} />
              ) : (
                <div className="w-full rounded-xl mt-2.5 overflow-hidden relative bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.06]" style={{ height: 110 }}>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-8 h-8 bg-success-500/15 border border-success-500/25 rounded-full flex items-center justify-center">
                      <div className="w-2.5 h-2.5 bg-success-500 rounded-full" />
                    </div>
                  </div>
                  <div className="absolute inset-0 opacity-[0.07]"
                    style={{ backgroundImage: "radial-gradient(rgba(0,0,0,0.7) 0.5px, transparent 0.5px)", backgroundSize: "14px 14px" }} />
                  <div className="absolute bottom-0 left-0 right-0 px-3 py-2">
                    <span className="text-[10px] text-gray-400">Sin coordenadas GPS</span>
                  </div>
                </div>
              )}
            </GlassCard>

            {/* Mantenimientos */}
            <GlassCard className="rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[12px] font-semibold text-gray-800 dark:text-white/80">Mantenimientos</p>
                <span className="text-[10px] text-gray-400">{maintenances.length} OT{maintenances.length !== 1 ? "s" : ""}</span>
              </div>

              {maintenances.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 gap-2">
                  <span className="text-gray-300 dark:text-gray-600">{Icon.wrench}</span>
                  <p className="text-xs text-gray-400">Sin mantenimientos registrados</p>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto custom-scrollbar pr-0.5">
                  {maintenances.slice(0, 8).map((m, i) => (
                    <motion.div
                      key={m.id}
                      className="flex items-start gap-2.5 bg-black/[0.025] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.06] rounded-xl px-3 py-2.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition-colors"
                      initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 + i * 0.04 }}
                    >
                      <div className="w-6 h-6 rounded-lg bg-black/[0.04] dark:bg-white/[0.05] flex items-center justify-center flex-shrink-0 mt-0.5 text-gray-400 dark:text-gray-500">
                        {Icon.wrench}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold text-gray-700 dark:text-white/80 truncate">{m.title}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-gray-400">{Icon.calendar}</span>
                          <span className="text-[10px] text-gray-400">
                            {m.dueDate
                              ? new Date(m.dueDate).toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" })
                              : "—"}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <PriorityBadge priority={m.priority} />
                        <StatusBadge status={m.status} />
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </GlassCard>

            {/* Driver */}
            {driver && (
              <GlassCard className="rounded-2xl p-3.5 flex items-center gap-3">
                {driver.photoUrl ? (
                  <img src={driver.photoUrl} alt="" className="w-9 h-9 rounded-full object-cover border border-black/[0.08] dark:border-white/[0.08] flex-shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0 text-blue-500 dark:text-blue-400 text-sm font-semibold">
                    {driver.firstName?.[0]}{driver.lastName?.[0]}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-gray-800 dark:text-white/80 truncate">{driver.firstName} {driver.lastName}</p>
                  <p className="text-[10px] text-gray-400">{driver.phone ?? "Sin teléfono"}</p>
                </div>
                <span className="text-[9px] font-black text-success-700 dark:text-success-400 bg-success-500/10 border border-success-500/20 px-2 py-0.5 rounded-full uppercase flex-shrink-0">
                  Activo
                </span>
              </GlassCard>
            )}

          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}