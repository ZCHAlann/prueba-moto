// components/platform/ImpersonationBanner.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Indicador compacto (chip) que se muestra en la esquina superior derecha
// mientras hay una impersonación activa. Usa los colores del sistema
// (neutros + brand) para no competir con la UI. Al darle "Volver", termina
// la impersonación con la transición de "pasar página" y redirige al
// dashboard del superadmin.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Loader2, LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useScreenTransition } from "../../context/ScreenTransitionContext";

export function ImpersonationBanner() {
  const { session, stopImpersonation } = useAuth();
  const navigate = useNavigate();
  const { transition } = useScreenTransition();
  const [busy, setBusy] = useState(false);

  if (!session?.impersonating) return null;

  const handleBack = async () => {
    setBusy(true);
    try {
      const ok = await stopImpersonation();
      if (!ok) {
        toast.error("No se pudo terminar la impersonación.");
        return;
      }
      toast.success("Volviste a tu panel de plataforma.");
      transition({
        label: `Volviendo a ${session.impersonatorName ?? "tu panel"}...`,
        navigate: () => navigate("/panel/dashboard", { replace: true }),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed right-4 top-[8.5rem] z-[60] lg:top-[5.5rem]">
      <div className="flex items-center gap-1.5 rounded-full border border-gray-200/80 bg-white/95 py-1 pl-1.5 pr-1 shadow-lg shadow-gray-900/[0.05] backdrop-blur dark:border-white/[0.08] dark:bg-gray-900/95">
        <span
          title={`Impersonando como ${session.impersonatorName ?? "superadmin"}`}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/[0.12] dark:text-brand-400"
        >
          <ShieldCheck className="h-3 w-3" />
        </span>
        <p className="hidden max-w-[160px] truncate text-[11px] font-medium text-gray-600 dark:text-gray-300 md:block">
          Impersonando{" "}
          <span className="font-semibold text-gray-800 dark:text-white">
            {session.companyName || "empresa"}
          </span>
        </p>
        <button
          type="button"
          onClick={handleBack}
          disabled={busy}
          title="Volver a tu panel de plataforma"
          className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-700 transition hover:bg-gray-200 disabled:opacity-60 dark:bg-white/[0.08] dark:text-gray-200 dark:hover:bg-white/[0.14]"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />}
          <span className="hidden sm:inline">Volver</span>
        </button>
      </div>
    </div>
  );
}

