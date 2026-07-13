// apps/frontend/src/pages/Platform/Geolocalizacion/page.tsx
//
// jul 2026 v6 — Placeholder de la página de Geolocalización en el
// panel de plataforma (superadmin). El módulo está en desarrollo:
// no rompe la app, no desloguea, y muestra un mensaje claro al
// superadmin de que el feature está pendiente.

import { useLocation, useNavigate } from "react-router";
import { MapPin, Wrench, ArrowLeft } from "lucide-react";
import { ModulePageHeader } from "@/components/features/modules/ModulePageHeader";
import { useEffect } from "react";

export default function PlatformGeolocationPage() {
  const location = useLocation();
  const navigate = useNavigate();

  // El sidebar de plataforma apuntaba a `/geolocalizacion` (ruta de
  // operacion), que al no tener empresa deja la página en blanco. Este
  // useEffect solo sirve para registro: si el user entra por URL vieja,
  // sigue acá. No redirige (la sección del sidebar ahora apunta a
  // `/platform/geolocalizacion` después de este fix).
  useEffect(() => {
    // no-op: intencionalmente dejamos al user en la página placeholder.
  }, [location.pathname]);

  return (
    <div className="space-y-6">
      <ModulePageHeader
        badge="Panel master"
        title="Geolocalización"
        subtitle="Ubicación operativa y monitoreo de unidades en tiempo real."
        accent="sky"
        action={
          <button type="button"
            onClick={() => navigate("/platform/dashboard")}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 transition hover:border-brand-400 hover:text-brand-600 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200">
            <ArrowLeft size={14} /> Volver al dashboard
          </button>
        }
      />

      <div className="flex flex-col items-center justify-center gap-5 rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center dark:border-white/[0.08] dark:bg-white/[0.02]">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-sky-500/15 to-cyan-500/15 text-sky-500 ring-1 ring-sky-500/20">
          <MapPin size={28} strokeWidth={1.5} />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Trabajando en el desarrollo del módulo
          </h3>
          <p className="mt-1.5 max-w-md text-sm text-gray-500 dark:text-gray-400">
            El panel de geolocalización para el superadmin está en construcción.
            Mientras tanto, podés ver el mapa y el estado de las unidades
            en la página de operación de cada empresa.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <Wrench size={12} /> En desarrollo
        </div>
      </div>
    </div>
  );
}
