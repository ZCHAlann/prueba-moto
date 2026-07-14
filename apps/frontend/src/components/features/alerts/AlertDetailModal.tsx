// components/features/alerts/AlertDetailModal.tsx
//
// jul 2026 v9 — Modal de detalle de alerta.
//
// Se abre al:
//   1. Click en una tarjeta del feed de Alertas.
//   2. Llegar a /alertas?id=<alertId> vía deep-link (notificación del bell).
//
// Muestra toda la info que ya expone el backend (GET /alerts/:id):
// título, tipo, severidad, estado, fecha límite, vehículo, notas,
// fecha de creación y última actualización.

import { Bell, CarFront, Calendar, Tag, AlertTriangle, FileText, Clock, UserCircle2 } from "lucide-react";
import type { ApiAlert, AlertSeverity, AlertStatus, AlertType } from "../../hooks/useAlerts";
import { ModalShell } from "../../ui/modal/ModalShell";

const SEVERITY_BADGE: Record<AlertSeverity, string> = {
  Alta:  "border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300",
  Media: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  Baja:  "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
};

const STATUS_BADGE: Record<AlertStatus, string> = {
  Abierta:         "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300",
  "En seguimiento": "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300",
  Cerrada:         "border-gray-300 bg-gray-50 text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-400",
};

const TYPE_BADGE: Record<AlertType, string> = {
  Vencimiento:   "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300",
  Mantenimiento: "border-cyan-300 bg-cyan-50 text-cyan-700 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-300",
  Manual:        "border-gray-300 bg-gray-50 text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-400",
};

function fmtDateTime(s?: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("es-EC", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtDate(s?: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("es-EC", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function dueInfo(dueDate: string) {
  if (!dueDate) return { label: "—", cls: "" };
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const diffMs = due.getTime() - today.getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (days < 0) {
    return { label: `Vencida hace ${Math.abs(days)} día${Math.abs(days) === 1 ? "" : "s"}`, cls: "text-error-500 font-semibold" };
  }
  if (days === 0) return { label: "Vence hoy", cls: "text-amber-500 font-semibold" };
  if (days === 1) return { label: "Vence mañana", cls: "text-amber-500" };
  if (days <= 7) return { label: `Vence en ${days} días`, cls: "text-amber-500" };
  return { label: `Vence en ${days} días`, cls: "text-gray-500 dark:text-gray-400" };
}

export function AlertDetailModal({
  alert, onClose,
}: {
  alert: ApiAlert;
  onClose: () => void;
}) {
  const due = dueInfo(alert.dueDate);
  const hasVehicle = !!(alert.assetPlate || alert.assetName);

  return (
    <ModalShell
      onClose={onClose}
      title={alert.title}
      icon={Bell}
      maxWidthClass="max-w-xl"
    >
      <div className="space-y-4">
        {/* Badges principales */}
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold ${SEVERITY_BADGE[alert.severity]}`}>
            <AlertTriangle size={12} />
            {alert.severity}
          </span>
          <span className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold ${STATUS_BADGE[alert.status]}`}>
            {alert.status}
          </span>
          <span className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold ${TYPE_BADGE[alert.type]}`}>
            <Tag size={12} />
            {alert.type}
          </span>
        </div>

        {/* Grid de metadata */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Vehículo */}
          <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-50/60 dark:bg-white/[0.02] p-3">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
              <CarFront size={12} />
              Vehículo
            </div>
            <div className="mt-1.5">
              {hasVehicle ? (
                <>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                    {alert.assetPlate || alert.assetName}
                  </p>
                  {alert.assetName && alert.assetPlate && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">{alert.assetName}</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-400 dark:text-gray-500 italic">Sin vehículo asociado</p>
              )}
            </div>
          </div>

          {/* Fecha límite */}
          <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-50/60 dark:bg-white/[0.02] p-3">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
              <Calendar size={12} />
              Fecha límite
            </div>
            <div className="mt-1.5">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                {fmtDate(alert.dueDate)}
              </p>
              <p className={`text-xs ${due.cls}`}>{due.label}</p>
            </div>
          </div>
        </div>

        {/* Notas */}
        <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-50/60 dark:bg-white/[0.02] p-3">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
            <FileText size={12} />
            Notas
          </div>
          <div className="mt-1.5">
            {alert.notes ? (
              <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{alert.notes}</p>
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-500 italic">Sin notas</p>
            )}
          </div>
        </div>

        {/* Trazabilidad */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-50/60 dark:bg-white/[0.02] p-3">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
              <UserCircle2 size={12} />
              Creada
            </div>
            <p className="mt-1.5 text-sm text-gray-700 dark:text-gray-300">
              {fmtDateTime(alert.createdAt)}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-50/60 dark:bg-white/[0.02] p-3">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
              <Clock size={12} />
              Última actualización
            </div>
            <p className="mt-1.5 text-sm text-gray-700 dark:text-gray-300">
              {fmtDateTime(alert.updatedAt)}
            </p>
          </div>
        </div>

        {/* ID interno (útil para debug y soporte) */}
        <p className="text-center text-[10px] text-gray-300 dark:text-gray-600">
          ID: {alert.id}
        </p>
      </div>
    </ModalShell>
  );
}
