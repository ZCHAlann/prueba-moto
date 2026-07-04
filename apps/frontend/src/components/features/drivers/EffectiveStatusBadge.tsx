import { AlertTriangle } from "lucide-react";

/**
 * Badge de estado EFECTIVO de un conductor (Fase 3.1).
 *
 * - `Activo`           → todo OK, badge verde
 * - `Inactivo (manual)`→ driver.status = 'Inactivo' o user.status = 'inactive',
 *                         badge gris
 * - `Inactivo (sede)`  → site.status = 'Inactiva' en cascada,
 *                         badge ámbar con icono de alerta
 *
 * El `inactiveReason` viene calculado del backend (Fase 1 + 2.1).
 */

type InactiveReason = "user_inactive" | "driver_inactive" | "site_inactive" | null;

interface EffectiveStatusBadgeProps {
  /** Status manual (siempre se muestra como "Activo" o "Inactivo"). */
  status: "Activo" | "Inactivo" | string;
  /** Si está efectivamente activo. Si undefined, se asume = status==='Activo'. */
  effectivelyActive?: boolean;
  /** Razón del bloqueo (si inactivo). */
  inactiveReason?: InactiveReason;
  /** Si true, muestra solo el dot + texto corto. Si false, incluye icono. */
  compact?: boolean;
}

const STYLES = {
  active: {
    cls: "text-emerald-700 dark:text-emerald-400 bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/20",
    dot: "bg-emerald-400",
    label: "Activo",
  },
  inactive_manual: {
    cls: "text-gray-500 dark:text-gray-400 bg-gray-100 border-gray-200 dark:bg-white/[0.05] dark:border-white/[0.06]",
    dot: "bg-gray-400",
    label: "Inactivo",
  },
  inactive_site: {
    cls: "text-amber-700 dark:text-amber-400 bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20",
    dot: "bg-amber-400",
    label: "Inactivo · sede",
  },
  inactive_user: {
    cls: "text-rose-700 dark:text-rose-400 bg-rose-50 border-rose-200 dark:bg-rose-500/10 dark:border-rose-500/20",
    dot: "bg-rose-400",
    label: "Inactivo · cuenta",
  },
} as const;

function pickStyle(
  status: string,
  effectivelyActive: boolean | undefined,
  inactiveReason: InactiveReason | undefined,
): keyof typeof STYLES {
  const isActive = effectivelyActive ?? status === "Activo";
  if (isActive) return "active";
  if (inactiveReason === "site_inactive") return "inactive_site";
  if (inactiveReason === "user_inactive") return "inactive_user";
  return "inactive_manual";
}

export function EffectiveStatusBadge({
  status,
  effectivelyActive,
  inactiveReason,
  compact = false,
}: EffectiveStatusBadgeProps) {
  const key = pickStyle(status, effectivelyActive, inactiveReason);
  const cfg = STYLES[key];

  const isInactive = key !== "active";
  const showAlertIcon = !compact && inactiveReason === "site_inactive";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-semibold ${cfg.cls}`}
      title={
        isInactive && inactiveReason === "site_inactive"
          ? "Inactivo porque su sede está desactivada. Cambia el estado manual cuando se reactive la sede."
          : isInactive && inactiveReason === "user_inactive"
            ? "La cuenta de usuario está desactivada."
            : undefined
      }
    >
      {showAlertIcon ? (
        <AlertTriangle size={11} />
      ) : (
        <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      )}
      {cfg.label}
    </span>
  );
}
