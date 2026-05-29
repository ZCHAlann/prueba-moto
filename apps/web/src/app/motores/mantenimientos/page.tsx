"use client";

import { useState, useMemo } from "react";
import { useAssets } from "../../../hooks/useAssets";
import { useMaintenances } from "@/hooks/useMaintenances";
import { ModulePageHeader } from "@/features/modules/module-page-header";
import type { ApiMaintenance, MaintenancePriority, MaintenanceStatus } from "@/hooks/useMaintenances";
import type { Asset } from "@/types/activo";

// ─── Icons ───────────────────────────────────────────────────────────────────

function IconEngine({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="8" width="4" height="8" rx="1" />
      <path d="M7 12h3l2-4h4l2 4h1" />
      <rect x="17" y="8" width="4" height="8" rx="1" />
      <path d="M7 10H5M7 14H5M17 10h2M17 14h2" />
    </svg>
  );
}

function IconWrench({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function IconCalendar({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function IconUser({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}

function IconPlus({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconEdit({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function IconTrash({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function IconCheck({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconX({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconChevronDown({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function IconAlert({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

function daysUntil(dateStr: string): number {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - TODAY.getTime()) / (1000 * 60 * 60 * 24));
}

function fmtDate(dateStr: string): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" });
}

const PRIORITY_STYLES: Record<MaintenancePriority, { bg: string; text: string; border: string; label: string }> = {
  Emergente:   { bg: "bg-red-50",    text: "text-red-700",    border: "border-red-200",    label: "Emergente" },
  Alta:        { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", label: "Alta" },
  Normal:      { bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-200",   label: "Normal" },
  Programado:  { bg: "bg-gray-100",  text: "text-gray-600",   border: "border-gray-200",   label: "Programado" },
};

const STATUS_STYLES: Record<MaintenanceStatus, { bg: string; text: string; dot: string }> = {
  Pendiente:   { bg: "bg-amber-50",  text: "text-amber-700",  dot: "bg-amber-400" },
  "En proceso": { bg: "bg-blue-50",  text: "text-blue-700",   dot: "bg-blue-400" },
  Completado:  { bg: "bg-green-50",  text: "text-green-700",  dot: "bg-green-400" },
};

const PRIORITY_ORDER: Record<MaintenancePriority, number> = {
  Emergente: 0, Alta: 1, Normal: 2, Programado: 3,
};

// ─── Modal ───────────────────────────────────────────────────────────────────

type ModalMode = "create" | "edit";

type FormState = {
  assetId: string;
  title: string;
  kind: string;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  scheduledDate: string;
  dueDate: string;
  responsible: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  assetId: "",
  title: "",
  kind: "Preventivo",
  priority: "Normal",
  status: "Pendiente",
  scheduledDate: "",
  dueDate: "",
  responsible: "",
  notes: "",
};

function MaintenanceModal({
  mode,
  initial,
  motors,
  onClose,
  onSubmit,
}: {
  mode: ModalMode;
  initial: FormState;
  motors: Asset[];
  onClose: () => void;
  onSubmit: (form: FormState) => Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);

  const set = (key: keyof FormState, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async () => {
    if (!form.assetId || !form.title || !form.dueDate) return;
    setSaving(true);
    await onSubmit(form);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden border border-neutral-200 dark:border-neutral-800">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 dark:border-neutral-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-950 flex items-center justify-center text-orange-600">
              <IconWrench size={15} />
            </div>
            <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
              {mode === "create" ? "Nuevo mantenimiento" : "Editar mantenimiento"}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <IconX size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Motor */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Motor</label>
            <div className="relative">
              <select
                value={form.assetId}
                onChange={(e) => set("assetId", e.target.value)}
                className="w-full appearance-none bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3.5 py-2.5 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400"
              >
                <option value="">Seleccionar motor...</option>
                {motors.map((m) => (
                  <option key={m.id} value={m.id}>{m.name} — {m.code}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">
                <IconChevronDown size={14} />
              </div>
            </div>
          </div>

          {/* Título */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Título del trabajo</label>
            <input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Ej: Cambio de rodamientos"
              className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3.5 py-2.5 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400"
            />
          </div>

          {/* Kind + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Tipo</label>
              <div className="relative">
                <select
                  value={form.kind}
                  onChange={(e) => set("kind", e.target.value)}
                  className="w-full appearance-none bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3.5 py-2.5 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400"
                >
                  <option>Preventivo</option>
                  <option>Correctivo</option>
                  <option>Predictivo</option>
                  <option>Emergencia</option>
                </select>
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">
                  <IconChevronDown size={14} />
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Prioridad</label>
              <div className="relative">
                <select
                  value={form.priority}
                  onChange={(e) => set("priority", e.target.value as MaintenancePriority)}
                  className="w-full appearance-none bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3.5 py-2.5 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400"
                >
                  <option>Normal</option>
                  <option>Alta</option>
                  <option>Emergente</option>
                  <option>Programado</option>
                </select>
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">
                  <IconChevronDown size={14} />
                </div>
              </div>
            </div>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Estado</label>
            <div className="relative">
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value as MaintenanceStatus)}
                className="w-full appearance-none bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3.5 py-2.5 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400"
              >
                <option>Pendiente</option>
                <option>En proceso</option>
                <option>Completado</option>
              </select>
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">
                <IconChevronDown size={14} />
              </div>
            </div>
          </div>

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Fecha programada</label>
              <input
                type="date"
                value={form.scheduledDate}
                onChange={(e) => set("scheduledDate", e.target.value)}
                className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3.5 py-2.5 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Fecha límite</label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => set("dueDate", e.target.value)}
                className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3.5 py-2.5 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400"
              />
            </div>
          </div>

          {/* Responsable */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Responsable</label>
            <input
              value={form.responsible}
              onChange={(e) => set("responsible", e.target.value)}
              placeholder="Técnico asignado"
              className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3.5 py-2.5 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400"
            />
          </div>

          {/* Notas */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Notas</label>
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={3}
              placeholder="Observaciones adicionales..."
              className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3.5 py-2.5 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !form.assetId || !form.title || !form.dueDate}
            className="px-5 py-2 rounded-xl text-sm font-medium bg-orange-500 hover:bg-orange-600 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            ) : (
              <IconCheck size={14} />
            )}
            {mode === "create" ? "Crear mantenimiento" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete confirmation ──────────────────────────────────────────────────────

function DeleteConfirm({ title, onConfirm, onCancel }: { title: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 border border-neutral-200 dark:border-neutral-800">
        <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950 flex items-center justify-center text-red-500 mb-4">
          <IconAlert size={18} />
        </div>
        <p className="font-semibold text-neutral-900 dark:text-neutral-100 mb-1">Eliminar mantenimiento</p>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-5">
          ¿Seguro que deseas eliminar <span className="font-medium text-neutral-700 dark:text-neutral-300">{title}</span>? Esta acción no se puede deshacer.
        </p>
        <div className="flex gap-2.5 justify-end">
          <button onClick={onCancel} className="px-4 py-2 rounded-xl text-sm text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
            Cancelar
          </button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-xl text-sm font-medium bg-red-500 hover:bg-red-600 text-white transition-colors">
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl px-5 py-4">
      <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-semibold ${accent ?? "text-neutral-900 dark:text-neutral-100"}`}>{value}</p>
    </div>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function MaintenanceRow({
  item,
  motorName,
  onEdit,
  onDelete,
  onComplete,
}: {
  item: ApiMaintenance;
  motorName: string;
  onEdit: () => void;
  onDelete: () => void;
  onComplete: () => void;
}) {
  const days = daysUntil(item.dueDate);
  const pStyle = PRIORITY_STYLES[item.priority];
  const sStyle = STATUS_STYLES[item.status];
  const isOverdue = days < 0 && item.status !== "Completado";
  const isSoon = days >= 0 && days <= 3 && item.status !== "Completado";

  return (
    <tr className="group border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
      {/* Motor */}
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-950 flex items-center justify-center text-orange-500 flex-shrink-0">
            <IconEngine size={14} />
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 leading-tight">{motorName}</p>
            <p className="text-xs text-neutral-400 dark:text-neutral-500">{item.assetId}</p>
          </div>
        </div>
      </td>

      {/* Trabajo */}
      <td className="px-5 py-4">
        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{item.title}</p>
        <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">{item.kind}</p>
      </td>

      {/* Responsable */}
      <td className="px-5 py-4">
        <div className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
          <IconUser size={13} />
          <span className="text-xs">{item.responsible || "—"}</span>
        </div>
      </td>

      {/* Fecha */}
      <td className="px-5 py-4">
        <div className="flex items-center gap-1.5">
          <IconCalendar size={13} />
          <div>
            <p className={`text-xs font-medium ${isOverdue ? "text-red-600 dark:text-red-400" : isSoon ? "text-amber-600 dark:text-amber-400" : "text-neutral-700 dark:text-neutral-300"}`}>
              {fmtDate(item.dueDate)}
            </p>
            <p className={`text-xs ${isOverdue ? "text-red-400" : isSoon ? "text-amber-400" : "text-neutral-400"}`}>
              {isOverdue ? `${Math.abs(days)}d atrasado` : days === 0 ? "Hoy" : `en ${days}d`}
            </p>
          </div>
        </div>
      </td>

      {/* Prioridad */}
      <td className="px-5 py-4">
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border ${pStyle.bg} ${pStyle.text} ${pStyle.border}`}>
          {item.priority === "Emergente" && (
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          )}
          {pStyle.label}
        </span>
      </td>

      {/* Estado */}
      <td className="px-5 py-4">
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg ${sStyle.bg} ${sStyle.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${sStyle.dot}`} />
          {item.status}
        </span>
      </td>

      {/* Acciones */}
      <td className="px-5 py-4">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {item.status !== "Completado" && (
            <button
              onClick={onComplete}
              title="Marcar como completado"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-green-600 hover:bg-green-50 dark:hover:bg-green-950 transition-colors"
            >
              <IconCheck size={14} />
            </button>
          )}
          <button
            onClick={onEdit}
            title="Editar"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <IconEdit size={14} />
          </button>
          <button
            onClick={onDelete}
            title="Eliminar"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
          >
            <IconTrash size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type FilterStatus = "Todos" | MaintenanceStatus;
type FilterPriority = "Todas" | MaintenancePriority;

export default function MotorMaintenancesRoute() {
  const { assets, loading: loadingAssets } = useAssets();
  const { maintenances, loading: loadingMaint, createMaintenance, updateMaintenance, deleteMaintenance, completeMaintenance } = useMaintenances();

  const motors = useMemo(() => assets.filter((a) => a.assetType === "Motor"), [assets]);
  const motorIds = useMemo(() => new Set(motors.map((m) => m.id)), [motors]);
  const motorMap = useMemo(() => new Map(motors.map((m) => [m.id, m])), [motors]);

  const motorMaintenances = useMemo(
    () => maintenances.filter((m) => motorIds.has(m.assetId)),
    [maintenances, motorIds]
  );

  // Filters
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("Todos");
  const [filterPriority, setFilterPriority] = useState<FilterPriority>("Todas");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return motorMaintenances
      .filter((m) => filterStatus === "Todos" || m.status === filterStatus)
      .filter((m) => filterPriority === "Todas" || m.priority === filterPriority)
      .filter((m) => {
        if (!search) return true;
        const q = search.toLowerCase();
        const motor = motorMap.get(m.assetId);
        return (
          m.title.toLowerCase().includes(q) ||
          motor?.name.toLowerCase().includes(q) ||
          m.responsible.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  }, [motorMaintenances, filterStatus, filterPriority, search, motorMap]);

  // Stats
  const stats = useMemo(() => ({
    total: motorMaintenances.length,
    emergentes: motorMaintenances.filter((m) => m.priority === "Emergente").length,
    enProceso: motorMaintenances.filter((m) => m.status === "En proceso").length,
    atrasados: motorMaintenances.filter((m) => daysUntil(m.dueDate) < 0 && m.status !== "Completado").length,
  }), [motorMaintenances]);

  // Modal state
  const [modal, setModal] = useState<{ mode: ModalMode; form: FormState; id?: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiMaintenance | null>(null);

  const openCreate = () =>
    setModal({ mode: "create", form: { ...EMPTY_FORM } });

  const openEdit = (item: ApiMaintenance) =>
    setModal({
      mode: "edit",
      id: item.id,
      form: {
        assetId: item.assetId,
        title: item.title,
        kind: item.kind,
        priority: item.priority,
        status: item.status,
        scheduledDate: item.scheduledDate,
        dueDate: item.dueDate,
        responsible: item.responsible,
        notes: item.notes,
      },
    });

  const handleSubmit = async (form: FormState) => {
    if (modal?.mode === "create") {
      await createMaintenance({
        assetId: form.assetId,
        title: form.title,
        kind: form.kind as ApiMaintenance["kind"],
        priority: form.priority,
        status: form.status,
        scheduledDate: form.scheduledDate,
        dueDate: form.dueDate,
        completedDate: null,
        responsible: form.responsible,
        photoNames: [],
        notes: form.notes,
      });
    } else if (modal?.mode === "edit" && modal.id) {
      await updateMaintenance(modal.id, {
        assetId: form.assetId,
        title: form.title,
        kind: form.kind as ApiMaintenance["kind"],
        priority: form.priority,
        status: form.status,
        scheduledDate: form.scheduledDate,
        dueDate: form.dueDate,
        responsible: form.responsible,
        notes: form.notes,
      });
    }
    setModal(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteMaintenance(deleteTarget.id);
    setDeleteTarget(null);
  };

  const handleComplete = async (item: ApiMaintenance) => {
    await completeMaintenance(item.id, new Date().toISOString().split("T")[0]);
  };

  const loading = loadingAssets || loadingMaint;

  return (
    <div className="space-y-6">
      <ModulePageHeader
        badge="Motores"
        title="Mantenimientos de motor"
        subtitle="Vista consolidada de trabajos técnicos para motores registrados en ApliSmart Motors."
        accent="orange"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Emergentes" value={stats.emergentes} accent="text-red-600 dark:text-red-400" />
        <StatCard label="En proceso" value={stats.enProceso} accent="text-blue-600 dark:text-blue-400" />
        <StatCard label="Atrasados" value={stats.atrasados} accent="text-amber-600 dark:text-amber-400" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por motor, trabajo o técnico..."
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400"
          />
        </div>

        {/* Status filter */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
          className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
        >
          <option value="Todos">Todos los estados</option>
          <option>Pendiente</option>
          <option>En proceso</option>
          <option>Completado</option>
        </select>

        {/* Priority filter */}
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value as FilterPriority)}
          className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
        >
          <option value="Todas">Todas las prioridades</option>
          <option>Emergente</option>
          <option>Alta</option>
          <option>Normal</option>
          <option>Programado</option>
        </select>

        {/* New button */}
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-xl transition-colors"
        >
          <IconPlus size={15} />
          Nuevo
        </button>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-neutral-400 gap-3">
            <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <span className="text-sm">Cargando mantenimientos...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-neutral-400 gap-3">
            <div className="w-12 h-12 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
              <IconWrench size={20} />
            </div>
            <p className="text-sm">No hay mantenimientos que coincidan</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Motor</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Trabajo</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Responsable</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Fecha límite</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Prioridad</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Estado</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <MaintenanceRow
                    key={item.id}
                    item={item}
                    motorName={motorMap.get(item.assetId)?.name ?? item.assetId}
                    onEdit={() => openEdit(item)}
                    onDelete={() => setDeleteTarget(item)}
                    onComplete={() => handleComplete(item)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {modal && (
        <MaintenanceModal
          mode={modal.mode}
          initial={modal.form}
          motors={motors}
          onClose={() => setModal(null)}
          onSubmit={handleSubmit}
        />
      )}
      {deleteTarget && (
        <DeleteConfirm
          title={deleteTarget.title}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}