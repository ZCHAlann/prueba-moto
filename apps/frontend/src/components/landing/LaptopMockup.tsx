// src/components/landing/LaptopMockup.tsx
// MacBook-style laptop mockup showing the REAL ApliSmart Motors dashboard
// (sidebar + header + 4 stat cards + weekly bar chart + recent vehicles + alerts).
// Includes: continuous floating animation, scroll parallax, glow halo, and 3D
// tilt on mouse-move. No images, all inline SVGs and divs.

import { forwardRef, useEffect, useRef, useState } from "react";

export interface LaptopMockupProps {
  className?: string;
  parallax?: boolean;
  parallaxStrength?: number;
}

const LaptopMockup = forwardRef<HTMLDivElement, LaptopMockupProps>(function LaptopMockup(
  { className, parallax = true, parallaxStrength = 40 },
  externalRef
) {
  const [offset, setOffset] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  // Scroll parallax
  useEffect(() => {
    if (!parallax) return;
    const handleScroll = () => {
      const y = window.scrollY;
      const max = parallaxStrength;
      const next = Math.max(-max, Math.min(max, -y * 0.06));
      setOffset(next);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [parallax, parallaxStrength]);

  // 3D tilt on mouse-move (reactive parallax)
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = wrapperRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 8; // -4 to 4 deg
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * -6; // -3 to 3 deg
    setTilt({ x, y });
  };
  const handleMouseLeave = () => setTilt({ x: 0, y: 0 });

  // Animated bar heights for the weekly chart
  const barHeights = [
    { h: 55, color: "bg-emerald-500" }, // L
    { h: 70, color: "bg-gray-600" },   // M
    { h: 45, color: "bg-emerald-500" }, // M
    { h: 80, color: "bg-gray-600" },   // J
    { h: 90, color: "bg-emerald-500" }, // V
    { h: 60, color: "bg-emerald-500" }, // S
    { h: 50, color: "bg-gray-600" },   // D
  ];

  return (
    <div
      ref={(node) => {
        wrapperRef.current = node;
        if (typeof externalRef === "function") externalRef(node);
        else if (externalRef) (externalRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`relative w-full max-w-5xl mx-auto ${className ?? ""}`}
      style={{
        transform: parallax ? `translateY(${offset}px)` : undefined,
        perspective: "1500px",
      }}
    >
      {/* Glow halo behind laptop (pulsing) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-20 -z-10 rounded-full bg-emerald-500/30 blur-3xl animate-pulse"
        style={{ animationDuration: "4s" }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-10 -z-10 rounded-full bg-emerald-400/10 blur-2xl"
      />

      {/* Laptop with 3D tilt */}
      <div
        className="relative animate-[float_6s_ease-in-out_infinite]"
        style={{
          transform: `rotateX(${tilt.y}deg) rotateY(${tilt.x}deg)`,
          transformStyle: "preserve-3d",
          transition: "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Laptop screen frame */}
        <div className="relative rounded-[18px] bg-gradient-to-b from-gray-800 to-gray-900 p-2 shadow-2xl shadow-black/50 ring-1 ring-white/10">
          {/* Camera dot */}
          <div className="absolute left-1/2 top-1.5 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-gray-700" />

          {/* Inner screen */}
          <div className="overflow-hidden rounded-[12px] bg-[#0a0f1a] aspect-[16/10]">
            <div className="flex h-full">
              {/* Sidebar */}
              <aside className="flex w-12 flex-col items-center gap-1 border-r border-white/5 bg-[#070b13] py-3">
                {[
                  { icon: "grid", active: false },
                  { icon: "home", active: true },
                  { icon: "box", active: false },
                  { icon: "bolt", active: false },
                  { icon: "doc", active: false },
                  { icon: "list", active: false },
                  { icon: "bell", active: false },
                  { icon: "chart", active: false },
                  { icon: "book", active: false },
                  { icon: "pin", active: false },
                  { icon: "users", active: false },
                ].map((item, i) => (
                  <div
                    key={i}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
                      item.active
                        ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30"
                        : "text-gray-500"
                    }`}
                  >
                    <SidebarIcon name={item.icon} />
                  </div>
                ))}
              </aside>

              {/* Main content */}
              <div className="flex-1 overflow-hidden p-3">
                {/* Header */}
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                    <span>Operación</span>
                    <span>›</span>
                    <span className="text-white">Dashboard</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-12 rounded-full bg-gray-800" />
                    <div className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[8px] font-bold text-emerald-300 ring-1 ring-emerald-500/30">
                      ON
                    </div>
                  </div>
                </div>

                {/* Stat cards */}
                <div className="mb-2 grid grid-cols-4 gap-1.5">
                  <StatCard label="VEHÍCULOS" value="142" delta="+12%" deltaColor="emerald" />
                  <StatCard label="EN RUTA" value="38" delta="+4%" deltaColor="emerald" />
                  <StatCard label="MANTENIM." value="9" delta="-2%" deltaColor="red" />
                  <StatCard label="ALERTAS" value="3" delta="=" deltaColor="gray" />
                </div>

                {/* Chart + Vehicles */}
                <div className="mb-2 grid grid-cols-3 gap-1.5">
                  {/* Chart */}
                  <div className="col-span-2 rounded-lg border border-white/5 bg-[#0d1422] p-2">
                    <div className="mb-1.5 flex items-center justify-between">
                      <div className="text-[9px] font-semibold text-white">OPERACIÓN SEMANAL</div>
                      <div className="flex items-center gap-2 text-[8px] text-gray-500">
                        <span className="flex items-center gap-0.5">
                          <span className="h-1 w-1 rounded-full bg-emerald-500" /> Móvil
                        </span>
                        <span className="flex items-center gap-0.5">
                          <span className="h-1 w-1 rounded-full bg-gray-500" /> Detenido
                        </span>
                      </div>
                    </div>
                    <div className="text-[8px] text-gray-400">Actividad por día</div>
                    <div className="mt-1.5 flex h-12 items-end gap-1">
                      {barHeights.map((bar, i) => (
                        <div
                          key={i}
                          className={`flex-1 rounded-sm ${bar.color} animate-[growUp_1s_ease-out]`}
                          style={{
                            height: `${bar.h}%`,
                            animationDelay: `${i * 80}ms`,
                          }}
                        />
                      ))}
                    </div>
                    <div className="mt-1 flex justify-between text-[7px] text-gray-500">
                      {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
                        <span key={i}>{d}</span>
                      ))}
                    </div>
                  </div>

                  {/* Recent vehicles */}
                  <div className="rounded-lg border border-white/5 bg-[#0d1422] p-2">
                    <div className="mb-1.5 text-[9px] font-semibold text-white">VEHÍCULOS RECIENTES</div>
                    <div className="space-y-1">
                      <VehicleRow name="Hilux 2022" status="En ruta" statusColor="emerald" />
                      <VehicleRow name="Generador Cummins" status="Operativo" statusColor="emerald" />
                      <VehicleRow name="Camión Ford F-150" status="Mant. en 5 días" statusColor="amber" />
                    </div>
                  </div>
                </div>

                {/* Alerts */}
                <div className="rounded-lg border border-white/5 bg-[#0d1422] p-2">
                  <div className="mb-1.5 text-[9px] font-semibold text-white">ALERTAS</div>
                  <div className="space-y-1">
                    <AlertRow text="Batería baja — Generador 2" severity="ALTA" color="red" />
                    <AlertRow text="Mantenimiento próximo — Camión 7" severity="MEDIA" color="amber" />
                    <AlertRow text="Checklist pendiente — Sede Norte" severity="BAJA" color="blue" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Laptop base (bottom bar) */}
        <div className="relative mx-auto h-3 w-[102%] -translate-x-[1%] rounded-b-[20px] bg-gradient-to-b from-gray-700 to-gray-800 shadow-lg">
          <div className="absolute left-1/2 top-0 h-1 w-16 -translate-x-1/2 rounded-b-md bg-gray-900" />
        </div>
      </div>

      {/* CSS keyframes inline */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        @keyframes growUp {
          0% { height: 0; opacity: 0; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
});

export default LaptopMockup;

// ─── Sub-components ───

function StatCard({
  label,
  value,
  delta,
  deltaColor,
}: {
  label: string;
  value: string;
  delta: string;
  deltaColor: "emerald" | "red" | "gray";
}) {
  const deltaClass =
    deltaColor === "emerald"
      ? "text-emerald-400"
      : deltaColor === "red"
        ? "text-red-400"
        : "text-gray-500";
  return (
    <div className="rounded-lg border border-white/5 bg-[#0d1422] p-2 transition hover:border-emerald-500/30">
      <div className="text-[8px] font-medium tracking-wider text-gray-500">{label}</div>
      <div className="mt-0.5 text-2xl font-bold text-white">{value}</div>
      <div className={`text-[8px] font-semibold ${deltaClass}`}>{delta}</div>
    </div>
  );
}

function VehicleRow({
  name,
  status,
  statusColor,
}: {
  name: string;
  status: string;
  statusColor: "emerald" | "amber";
}) {
  const badgeClass =
    statusColor === "emerald"
      ? "bg-emerald-500/20 text-emerald-300 ring-emerald-500/30"
      : "bg-amber-500/20 text-amber-300 ring-amber-500/30";
  return (
    <div className="flex items-center justify-between gap-1 rounded border border-white/5 bg-[#0a0f1a] px-1.5 py-1">
      <div className="flex items-center gap-1">
        <div className="h-4 w-4 rounded bg-gray-800 ring-1 ring-white/10" />
        <span className="text-[8px] text-white">{name}</span>
      </div>
      <span className={`rounded-full px-1 py-0.5 text-[7px] font-semibold ring-1 ${badgeClass}`}>
        {status}
      </span>
    </div>
  );
}

function AlertRow({
  text,
  severity,
  color,
}: {
  text: string;
  severity: string;
  color: "red" | "amber" | "blue";
}) {
  const badgeClass =
    color === "red"
      ? "bg-red-500/20 text-red-300 ring-red-500/30"
      : color === "amber"
        ? "bg-amber-500/20 text-amber-300 ring-amber-500/30"
        : "bg-blue-500/20 text-blue-300 ring-blue-500/30";
  return (
    <div className="flex items-center justify-between gap-1 rounded border border-white/5 bg-[#0a0f1a] px-1.5 py-1">
      <span className="truncate text-[8px] text-gray-300">{text}</span>
      <span className={`rounded px-1 py-0.5 text-[7px] font-bold ring-1 ${badgeClass}`}>
        {severity}
      </span>
    </div>
  );
}

function SidebarIcon({ name }: { name: string }) {
  const common = "h-3.5 w-3.5";
  const icons: Record<string, JSX.Element> = {
    grid: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={common}>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
    home: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={common}>
        <path d="M3 12L12 3l9 9M5 10v10h14V10" />
      </svg>
    ),
    box: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={common}>
        <path d="M21 8l-9-5-9 5 9 5 9-5z" />
        <path d="M3 8v8l9 5 9-5V8M12 13v8" />
      </svg>
    ),
    bolt: (
      <svg viewBox="0 0 24 24" fill="currentColor" className={common}>
        <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
      </svg>
    ),
    doc: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={common}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M9 13h6M9 17h4" />
      </svg>
    ),
    list: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={common}>
        <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
      </svg>
    ),
    bell: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={common}>
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0" />
      </svg>
    ),
    chart: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={common}>
        <path d="M3 3v18h18M7 16l4-4 4 4 5-5" />
      </svg>
    ),
    book: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={common}>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 4.5A2.5 2.5 0 0 1 6.5 7H20v13H6.5A2.5 2.5 0 0 1 4 17.5V4.5z" />
      </svg>
    ),
    pin: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={common}>
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
    users: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={common}>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  };
  return icons[name] ?? null;
}
