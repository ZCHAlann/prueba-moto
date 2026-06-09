import { useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { usePermissions } from "../../../hooks/usePermissions";
import { useOilCheck } from "../../../hooks/useOilCheck";
import OilCheckCapture from "../components/OilCheckCapture";
import OilCheckHistory from "../components/OilCheckHistory";

type Tab = "captura" | "historial";

export default function VerificacionAceitePage() {
  const { session } = useAuth();
  const { can } = usePermissions();
  const [activeTab, setActiveTab] = useState<Tab>("captura");

  const canSeeHistory = can("mantenimiento", "oil", "ver");
  const oilCheck = useOilCheck(session?.companyId ?? "");

  return (
    <div className="flex flex-col w-full h-full min-h-0 bg-white dark:bg-transparent">
      {canSeeHistory && (
        <div className="flex items-center gap-1 px-4 lg:px-6 pt-4 bg-white dark:bg-transparent border-b border-gray-200 dark:border-white/10 flex-shrink-0">
          <TabButton
            active={activeTab === "captura"}
            onClick={() => setActiveTab("captura")}
            icon="camera"
            label="Nueva verificación"
          />
          <TabButton
            active={activeTab === "historial"}
            onClick={() => setActiveTab("historial")}
            icon="history"
            label="Historial"
          />
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "captura"
          ? <OilCheckCapture oilCheck={oilCheck} />
          : <OilCheckHistory oilCheck={oilCheck} />
        }
      </div>
    </div>
  );
}

// ─── Tab Button ───────────────────────────────────────────────────────────────

function CameraIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="12 8 12 12 14 14" />
      <path d="M3.05 11a9 9 0 1 0 .5-4" />
      <polyline points="3 3 3 7 7 7" />
    </svg>
  );
}

function TabButton({
  active, onClick, icon, label,
}: {
  active: boolean;
  onClick: () => void;
  icon: "camera" | "history";
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-2 px-3 lg:px-4 py-2.5 text-sm font-medium
        border-b-2 transition-all duration-150 cursor-pointer rounded-t-md
        ${active
          ? "border-amber-600 text-amber-800 bg-amber-50 dark:border-amber-400 dark:text-amber-300 dark:bg-amber-400/[0.08]"
          : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-white/40 dark:hover:text-white/70 dark:hover:bg-white/5"
        }
      `}
    >
      {icon === "camera" ? <CameraIcon /> : <HistoryIcon />}
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{active ? label : label.split(" ")[0]}</span>
    </button>
  );
}