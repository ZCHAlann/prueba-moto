import { useRef, useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useMotorAssets } from "../../../hooks/useMotorAssets";
import type { UseOilCheckReturn, OilCheckResult } from "../../../hooks/useOilCheck";
import { sanitizeString } from "../../../lib/form-validation";

type Step = "vehicle" | "photo" | "analyzing" | "result";
type Vehicle = { id: string; plate: string; model: string };

const PAGE_SIZE = 7;

const TIPS = [
  { icon: <IconClock />,  text: "Motor apagado al menos 5 min" },
  { icon: <IconLevel />,  text: "Vehículo en superficie nivelada" },
  { icon: <IconSun />,    text: "Buena iluminación, sin reflejos" },
  { icon: <IconEye />,    text: "La varilla bien visible en cuadro" },
];

function nivelColor(nivel: string) {
  const n = nivel?.toLowerCase();
  if (n?.includes("normal") || n?.includes("bueno") || n?.includes("ok"))
    return {
      text: "text-emerald-700 dark:text-emerald-300",
      bg:   "bg-emerald-50 border-emerald-200 dark:bg-emerald-400/10 dark:border-emerald-400/20",
    };
  if (n?.includes("bajo") || n?.includes("regular"))
    return {
      text: "text-amber-700 dark:text-amber-300",
      bg:   "bg-amber-50 border-amber-200 dark:bg-amber-400/10 dark:border-amber-400/20",
    };
  return {
    text: "text-red-700 dark:text-red-300",
    bg:   "bg-red-50 border-red-200 dark:bg-red-400/10 dark:border-red-400/20",
  };
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function IconCamera({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}
function IconRefresh({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}
function IconBrain({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
    </svg>
  );
}
function IconDroplet({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
    </svg>
  );
}
function IconChevronRight({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
function IconX({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
function IconCircleCheck({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="9 12 11 14 15 10" />
    </svg>
  );
}
function IconCircleX({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}
function IconAlert({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
function IconPlus({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function IconSearch({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
function IconChevronLeft({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}
function IconClock() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
function IconLevel() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}
function IconSun() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}
function IconEye() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// ─── Vehicle Selector ─────────────────────────────────────────────────────────

function VehicleSelector({
  vehicles, loading, error, onSelect,
}: {
  vehicles: Vehicle[];
  loading: boolean;
  error: string | null;
  onSelect: (v: Vehicle) => void;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage]     = useState(0);

  const filtered = vehicles.filter(
    (v) =>
      v.plate.toLowerCase().includes(search.toLowerCase()) ||
      v.model.toLowerCase().includes(search.toLowerCase()),
  );
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged      = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  function handleSearch(val: string) { setSearch(val); setPage(0); }

  return (
    <>
      <p className="text-gray-500 dark:text-white/40 text-xs font-semibold uppercase tracking-widest mb-3">
        Selecciona el vehículo
      </p>

      <div className="relative mb-3">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-white/30 pointer-events-none">
          <IconSearch size={14} />
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Buscar por placa o modelo..."
          className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-gray-100 dark:bg-white/[0.04] border border-gray-200 dark:border-white/10 text-gray-700 dark:text-white/80 text-sm placeholder:text-gray-400 dark:placeholder:text-white/25 outline-none focus:border-amber-400/60 transition-all duration-150"
        />
        {search && (
          <button onClick={() => handleSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/60 transition-colors cursor-pointer">
            <IconX size={12} />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2 flex-1">
        {paged.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-400 dark:text-white/25">
            {loading ? (
              <div className="w-6 h-6 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
            ) : error ? (
              <p className="text-xs text-red-500">{error}</p>
            ) : search ? (
              <><IconSearch size={24} /><p className="text-xs mt-2">Sin resultados para "{search}"</p></>
            ) : (
              <><IconSearch size={24} /><p className="text-xs mt-2">No hay vehículos registrados</p></>
            )}
          </div>
        ) : (
          paged.map((v) => (
            <button key={v.id} onClick={() => onSelect(v)}
              className="flex items-center gap-4 px-4 py-3.5 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.03] hover:bg-amber-50 dark:hover:bg-white/[0.06] hover:border-amber-300 dark:hover:border-amber-400/30 transition-all duration-150 text-left cursor-pointer">
              <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-amber-600 dark:text-amber-300 font-mono font-semibold text-sm">{v.plate}</p>
                <p className="text-gray-500 dark:text-white/40 text-xs mt-0.5 truncate">{v.model}</p>
              </div>
              <span className="text-gray-400 dark:text-white/20"><IconChevronRight size={14} /></span>
            </button>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200 dark:border-white/[0.08]">
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/70 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-xs cursor-pointer">
            <IconChevronLeft size={12} />Anterior
          </button>
          <span className="text-gray-400 dark:text-white/25 text-xs">
            {page + 1} / {totalPages}
            <span className="text-gray-300 dark:text-white/15 ml-1">({filtered.length} vehículos)</span>
          </span>
          <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/70 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-xs cursor-pointer">
            Siguiente<IconChevronRight size={12} />
          </button>
        </div>
      )}
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type Props = { oilCheck: UseOilCheckReturn };

export default function OilCheckCapture({ oilCheck }: Props) {
  const { session } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { analyze, analyzing, analyzeError, clearAnalyzeError } = oilCheck;

  const { motors, loading: vehiclesLoading, error: vehiclesError } = useMotorAssets();
  const vehicles: Vehicle[] = motors.map((m) => ({
    id: String(m.id),
    plate: m.plate,
    model: `${m.brand} ${m.model}`.trim(),
  }));

  const [step, setStep]             = useState<Step>("vehicle");
  const [vehicle, setVehicle]       = useState<Vehicle | null>(null);
  const [photoUrl, setPhotoUrl]     = useState<string | null>(null);
  const [photoFile, setPhotoFile]   = useState<File | null>(null);
  const [result, setResult]         = useState<OilCheckResult | null>(null);
  const [localError, setLocalError] = useState("");

  function handleVehicleSelect(v: Vehicle) { setVehicle(v); setStep("photo"); }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    clearAnalyzeError();
    setLocalError("");
    setPhotoFile(file);
    setPhotoUrl(URL.createObjectURL(file));
    if (step === "vehicle") setStep("photo");
  }

  async function handleAnalyze() {
    if (!photoFile || !vehicle || !session) return;
    setLocalError("");
    clearAnalyzeError();
    setStep("analyzing");
    try {
      const res = await analyze({
        photo:        photoFile,
        assetId:      vehicle.id,
        technicianId: session.id,
        companyId:    session.companyId ?? "",
      });
      setResult(res);
      setStep("result");
    } catch {
      setStep("photo");
      setLocalError(analyzeError || "Error al analizar la foto. Intenta nuevamente.");
    }
  }

  function handleReset() {
    setStep("vehicle");
    setVehicle(null);
    setPhotoUrl(null);
    setPhotoFile(null);
    setResult(null);
    setLocalError("");
    clearAnalyzeError();
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const steps: Step[] = ["vehicle", "photo", "analyzing", "result"];
  const currentIdx    = steps.indexOf(step);

  // ─── Left Panel ─────────────────────────────────────────────────────────────
  const LeftPanel = (
    <div className="flex flex-col h-full border-b border-gray-200 dark:border-white/[0.08] lg:border-b-0 lg:border-r p-4 lg:p-6 bg-gray-50 dark:bg-transparent">

      <div className="mb-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-400/10 border border-amber-300 dark:border-amber-400/20 mb-1.5">
          <span className="text-amber-600 dark:text-amber-400"><IconDroplet size={12} /></span>
          <span className="text-amber-700 dark:text-amber-400 text-xs font-semibold tracking-widest uppercase">
            Verificación de aceite
          </span>
        </div>
        <h1 className="text-lg lg:text-2xl font-bold text-gray-800 dark:text-white leading-tight">
          Captura el nivel de aceite
        </h1>
        {session && (
          <p className="text-gray-400 dark:text-white/35 text-xs mt-1">{session.name} · {session.roleLabel}</p>
        )}
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2 mb-3">
        {steps.map((s, idx) => (
          <div key={s} className={`h-1.5 rounded-full transition-all duration-300 ${
            idx === currentIdx ? "bg-amber-500 dark:bg-amber-400 w-8" :
            idx  < currentIdx ? "bg-amber-300 dark:bg-amber-400/40 w-5" :
                                "bg-gray-200 dark:bg-white/10 w-5"
          }`} />
        ))}
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        {!photoUrl && (
          <button onClick={() => fileInputRef.current?.click()}
            className="flex-1 min-h-[260px] lg:min-h-0 rounded-2xl border-2 border-dashed border-gray-300 dark:border-white/15 hover:border-amber-400 dark:hover:border-amber-400/50 bg-white dark:bg-white/[0.02] hover:bg-amber-50 dark:hover:bg-amber-400/[0.04] flex flex-col items-center justify-center gap-6 px-6 py-8 transition-all duration-200 cursor-pointer group">
            <div className="relative flex items-center justify-center w-28 h-28 flex-shrink-0">
              <div className="absolute w-28 h-28 rounded-full bg-amber-100 dark:bg-amber-400/[0.08] group-hover:bg-amber-200 dark:group-hover:bg-amber-400/[0.14] transition-colors duration-200" />
              <div className="absolute w-16 h-16 rounded-full bg-amber-200 dark:bg-amber-400/[0.12] group-hover:bg-amber-300 dark:group-hover:bg-amber-400/[0.20] transition-colors duration-200" />
              <span className="relative z-10 text-amber-500 dark:text-amber-400/80 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors duration-200">
                <IconCamera size={36} />
              </span>
            </div>
            <div className="text-center flex-shrink-0">
              <p className="text-gray-700 dark:text-white/70 text-sm font-semibold">Toca para fotografiar</p>
              <p className="text-gray-400 dark:text-white/30 text-xs mt-1.5">JPG · PNG · WebP · HEIC &nbsp;·&nbsp; máx. 10 MB</p>
            </div>
          </button>
        )}

        {photoUrl && step !== "result" && (
          <div className="flex-1 min-h-[220px] lg:min-h-0 relative rounded-2xl overflow-hidden border border-amber-400/30">
            <img src={photoUrl} alt="Foto para análisis" className="w-full h-full object-cover" />
            {step === "photo" && (
              <button onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/60 text-white text-xs font-medium border border-white/20 hover:bg-black/80 transition-colors cursor-pointer">
                <IconRefresh size={13} />Cambiar foto
              </button>
            )}
          </div>
        )}

        {step === "result" && result && photoUrl && (
          <div className="flex-1 min-h-[220px] lg:min-h-0 relative rounded-2xl overflow-hidden border border-gray-200 dark:border-white/10">
            <img src={photoUrl} alt="Foto analizada" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <div className="flex items-center gap-2">
                <span className={`text-lg font-bold ${nivelColor(result.nivel).text}`}>{result.nivel}</span>
                <span className="text-white/40 text-sm">·</span>
                <span className="text-white/60 text-sm">{result.color}</span>
              </div>
              <p className="text-white/50 text-xs mt-1 line-clamp-2">{sanitizeString(result.accion_recomendada).slice(0, 500)}</p>
            </div>
          </div>
        )}
      </div>

      <input ref={fileInputRef} type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        className="hidden" onChange={handleFileChange} />
    </div>
  );

  // ─── Right Panel ─────────────────────────────────────────────────────────────
  const RightPanel = (
    <div className="flex flex-col h-full p-5 lg:p-8 overflow-y-auto bg-white dark:bg-transparent">

      {!vehicle ? (
        <VehicleSelector vehicles={vehicles} loading={vehiclesLoading}
          error={vehiclesError} onSelect={handleVehicleSelect} />
      ) : (
        <>
          {/* Active vehicle chip */}
          <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/10 mb-5">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
              <div>
                <p className="text-amber-600 dark:text-amber-300 font-mono font-semibold text-sm">{vehicle.plate}</p>
                <p className="text-gray-500 dark:text-white/35 text-xs">{vehicle.model}</p>
              </div>
            </div>
            <button onClick={handleReset}
              className="text-gray-400 dark:text-white/25 hover:text-gray-600 dark:hover:text-white/60 text-xs transition-colors cursor-pointer flex items-center gap-1">
              <IconX size={11} />Cambiar
            </button>
          </div>

          {/* Step tabs */}
          <div className="flex items-center gap-0 mb-5 border border-gray-200 dark:border-white/[0.08] rounded-xl overflow-hidden">
            {([
              { key: "photo",     label: "Foto",      Icon: IconCamera       },
              { key: "analyzing", label: "Análisis",  Icon: IconBrain        },
              { key: "result",    label: "Resultado",  Icon: IconCircleCheck  },
            ] as { key: Step; label: string; Icon: React.FC<{ size?: number }> }[]).map((s, i, arr) => {
              const idx      = steps.indexOf(s.key);
              const isDone   = idx < currentIdx;
              const isActive = idx === currentIdx;
              return (
                <div key={s.key}
                  className={`flex-1 flex flex-col items-center gap-1 py-3 ${i < arr.length - 1 ? "border-r border-gray-200 dark:border-white/[0.08]" : ""} ${isActive ? "bg-amber-50 dark:bg-amber-400/[0.08]" : isDone ? "bg-gray-50 dark:bg-white/[0.03]" : ""}`}>
                  <span className={isActive ? "text-amber-600 dark:text-amber-400" : isDone ? "text-emerald-500 dark:text-emerald-400" : "text-gray-300 dark:text-white/20"}>
                    <s.Icon size={16} />
                  </span>
                  <span className={`text-xs font-medium ${isActive ? "text-amber-700 dark:text-amber-300" : isDone ? "text-gray-500 dark:text-white/50" : "text-gray-300 dark:text-white/20"}`}>
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Error */}
          {(localError || analyzeError) && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-400/10 border border-red-200 dark:border-red-400/20 mb-4">
              <span className="text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5"><IconAlert size={14} /></span>
              <p className="text-red-600 dark:text-red-300 text-xs leading-relaxed">{localError || analyzeError}</p>
            </div>
          )}

          {step === "photo" && !photoUrl && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 py-8">
              <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-400/10 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <IconCamera size={20} />
              </div>
              <p className="text-gray-400 dark:text-white/40 text-sm text-center">Toma la foto desde el panel izquierdo</p>
            </div>
          )}

          {step === "photo" && photoUrl && (
            <>
              <p className="text-gray-400 dark:text-white/35 text-xs font-semibold uppercase tracking-widest mb-3">
                Consejos para la foto
              </p>
              <div className="flex flex-col gap-2 mb-5">
                {TIPS.map((tip) => (
                  <div key={tip.text} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.08]">
                    <span className="text-amber-500 dark:text-amber-400/60 flex-shrink-0">{tip.icon}</span>
                    <span className="text-gray-600 dark:text-white/50 text-xs">{tip.text}</span>
                  </div>
                ))}
              </div>
              <button onClick={handleAnalyze} disabled={analyzing}
                className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 dark:bg-amber-400 dark:hover:bg-amber-300 active:scale-[.98] text-white dark:text-zinc-950 font-semibold text-sm transition-all duration-150 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
                <IconBrain size={16} />Analizar con IA
              </button>
            </>
          )}

          {step === "analyzing" && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 py-8">
              <div className="relative w-14 h-14">
                <div className="absolute inset-0 rounded-full border-2 border-amber-200 dark:border-amber-400/20" />
                <div className="absolute inset-0 rounded-full border-2 border-amber-500 dark:border-amber-400 border-t-transparent animate-spin" />
                <div className="absolute inset-3 rounded-full bg-amber-100 dark:bg-amber-400/10 flex items-center justify-center text-amber-600 dark:text-amber-400">
                  <IconBrain size={14} />
                </div>
              </div>
              <div className="text-center">
                <p className="text-gray-800 dark:text-white font-medium text-sm">Analizando imagen...</p>
                <p className="text-gray-400 dark:text-white/35 text-xs mt-1">La IA evalúa nivel y estado del aceite</p>
              </div>
            </div>
          )}

          {step === "result" && result && (
            <>
              <p className="text-gray-400 dark:text-white/35 text-xs font-semibold uppercase tracking-widest mb-3">
                Resultado del análisis
              </p>

              <div className="grid grid-cols-2 gap-2 mb-3">
                {[
                  { label: "Nivel", value: result.nivel },
                  { label: "Color", value: result.color },
                ].map(({ label, value }) => (
                  <div key={label} className={`px-4 py-3.5 rounded-xl border ${nivelColor(result.nivel).bg}`}>
                    <p className="text-gray-400 dark:text-white/35 text-xs uppercase tracking-widest mb-1">{label}</p>
                    <p className={`text-lg font-semibold ${nivelColor(result.nivel).text}`}>{value}</p>
                  </div>
                ))}
              </div>

              <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border mb-3 ${result.puede_salir ? "bg-emerald-50 dark:bg-emerald-400/[0.08] border-emerald-200 dark:border-emerald-400/20" : "bg-red-50 dark:bg-red-400/[0.08] border-red-200 dark:border-red-400/20"}`}>
                <span className={result.puede_salir ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                  {result.puede_salir ? <IconCircleCheck size={20} /> : <IconCircleX size={20} />}
                </span>
                <div>
                  <p className="text-gray-400 dark:text-white/40 text-xs uppercase tracking-widest">Estado de salida</p>
                  <p className={`text-sm font-semibold mt-0.5 ${result.puede_salir ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>
                    {result.puede_salir ? "Puede salir" : "No debe salir"}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-gray-50 dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] mb-3">
                <span className="text-gray-400 dark:text-white/35 text-xs">Confianza del análisis</span>
                <span className="text-gray-700 dark:text-white/70 text-xs font-semibold">{result.confianza}</span>
              </div>

              {result.observaciones && (
                <div className="px-4 py-3 rounded-xl bg-gray-50 dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] mb-3">
                  <p className="text-gray-400 dark:text-white/30 text-xs font-semibold uppercase tracking-widest mb-1.5">Observaciones</p>
                  <p className="text-gray-600 dark:text-white/60 text-xs leading-relaxed">{sanitizeString(result.observaciones).slice(0, 1000)}</p>
                </div>
              )}

              <div className="px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-400/[0.06] border border-amber-200 dark:border-amber-400/15 mb-5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-amber-500 dark:text-amber-400/60"><IconBrain size={12} /></span>
                  <p className="text-amber-600 dark:text-amber-400/60 text-xs font-semibold uppercase tracking-widest">Acción recomendada</p>
                </div>
                <p className="text-gray-600 dark:text-white/60 text-xs leading-relaxed">{sanitizeString(result.accion_recomendada).slice(0, 1000)}</p>
              </div>

              <button onClick={handleReset}
                className="w-full py-3 rounded-xl border border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/[0.05] text-gray-600 dark:text-white/50 hover:text-gray-800 dark:hover:text-white text-sm font-medium transition-all duration-150 cursor-pointer flex items-center justify-center gap-2">
                <IconPlus size={14} />Nueva verificación
              </button>
            </>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className="w-full h-full flex flex-col lg:grid lg:grid-cols-2 overflow-y-auto lg:overflow-hidden bg-gray-50 dark:bg-[transparent]">
      <div className="h-[420px] lg:h-full flex-shrink-0 lg:flex-shrink">
        {LeftPanel}
      </div>
      <div className="flex-1 lg:h-full overflow-y-auto">
        {RightPanel}
      </div>
    </div>
  );
}