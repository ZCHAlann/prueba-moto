"use client";

// ─────────────────────────────────────────────────────────────────────────────
// pages/Reports/components/CanvasModulePanel.tsx
//
// Panel izquierdo del lienzo. Muestra los módulos que el dueño agregó
// manualmente (board.panelModules), uno por chip, arrastrables vía HTML5
// Drag and Drop nativo.
//
// Comportamiento:
//   - Colapsado por defecto (rail angosto, solo íconos, CENTRADOS).
//   - Se expande automáticamente con hover (mouseenter), se colapsa al
//     salir el mouse (con pequeño delay para no parpadear).
//   - Cada chip, cuando el panel está expandido, muestra un botón "x" en
//     hover para quitarlo directo del panel — abre un ConfirmDialog en
//     vez de borrar al toque (sin window.confirm nativo).
//   - El botón "+" abre el modal completo para agregar/quitar varios a la vez.
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, GripVertical, Wrench, Fuel, Truck, Users, ClipboardList, Bell, AirVent, Shield, MapPin, FileText, LayoutGrid, Check } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "./ConfirmDialog";

export type ModuloKey =
  | "mantenimiento" | "combustible" | "flotas" | "conductores"
  | "checklists" | "alertas" | "ac" | "seguros" | "peajes" | "asignaciones";

type ModuloDef = {
  key: ModuloKey;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
  group: "Operación" | "Control";
};

const MODULES: ModuloDef[] = [
  { key: "mantenimiento", label: "Mantenimiento", icon: Wrench,        color: "#f59e0b", group: "Operación" },
  { key: "combustible",   label: "Combustible",   icon: Fuel,          color: "#f97316", group: "Operación" },
  { key: "flotas",        label: "Flotas",        icon: Truck,         color: "#3b82f6", group: "Operación" },
  { key: "conductores",   label: "Conductores",   icon: Users,         color: "#8b5cf6", group: "Operación" },
  { key: "checklists",    label: "Checklists",    icon: ClipboardList, color: "#06b6d4", group: "Control" },
  { key: "alertas",       label: "Alertas",       icon: Bell,          color: "#f43f5e", group: "Control" },
  { key: "ac",            label: "A/C",           icon: AirVent,       color: "#14b8a6", group: "Control" },
  { key: "seguros",       label: "Seguros",       icon: Shield,        color: "#6366f1", group: "Control" },
  { key: "peajes",        label: "Peajes",        icon: MapPin,        color: "#d946ef", group: "Control" },
  { key: "asignaciones",  label: "Asignaciones",  icon: FileText,      color: "#10b981", group: "Control" },
];

const MODULE_BY_KEY = new Map(MODULES.map((m) => [m.key, m]));

const COLLAPSED_W = 56;  // px, rail solo-íconos
const EXPANDED_W  = 240; // px, panel completo
const CLOSE_DELAY = 150; // ms

export function CanvasModulePanel({
  panelModules,
  onChangePanel,
}: {
  panelModules: string[];
  onChangePanel: (next: string[]) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expanded, setExpanded]     = useState(false);
  const [pendingRemove, setPendingRemove] = useState<ModuloDef | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const inPanel = new Set(panelModules);
  const active = panelModules
    .map((k) => MODULE_BY_KEY.get(k as ModuloKey))
    .filter((x): x is ModuloDef => !!x);

  function handleDragStart(e: React.DragEvent, key: string) {
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("application/x-canvas-module", key);
    e.dataTransfer.setData("text/plain", key);
  }

  function confirmRemove() {
    if (!pendingRemove) return;
    onChangePanel(panelModules.filter((k) => k !== pendingRemove.key));
    toast.success(`"${pendingRemove.label}" quitado del panel.`);
    setPendingRemove(null);
  }

  function openNow() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setExpanded(true);
  }

  function closeWithDelay() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setExpanded(false), CLOSE_DELAY);
  }

  return (
    <aside
      onMouseEnter={openNow}
      onMouseLeave={closeWithDelay}
      style={{ width: expanded ? EXPANDED_W : COLLAPSED_W }}
      className="relative z-10 flex h-full shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-gray-50/40 shadow-[2px_0_8px_rgba(0,0,0,0.02)] transition-[width] duration-200 ease-out dark:border-white/[0.06] dark:bg-white/[0.02]"
    >
      {/* Header */}
      <div
        className={`flex h-11 shrink-0 items-center border-b border-gray-200 dark:border-white/[0.06] ${
          expanded ? "justify-between gap-2 px-3" : "justify-center px-0"
        }`}
      >
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          <LayoutGrid size={14} className="shrink-0" />
          {expanded && <span className="whitespace-nowrap">Módulos</span>}
        </div>
        {expanded && (
          <button
            onClick={() => setPickerOpen(true)}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/[0.04]"
            title="Agregar / quitar módulos"
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      {/* Lista de chips arrastrables */}
      <ul
        className={`flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden p-2.5 ${
          expanded ? "" : "flex flex-col items-center px-0"
        }`}
      >
        {active.length === 0 ? (
          expanded ? (
            <li className="rounded-lg border border-dashed border-gray-200 p-3 text-center text-[11px] text-gray-400 dark:border-white/[0.06]">
              Tocá <strong>+</strong> para agregar módulos al panel.
            </li>
          ) : (
            <li className="flex justify-center pt-2 text-gray-300 dark:text-gray-600">
              <LayoutGrid size={16} />
            </li>
          )
        ) : (
          active.map((m) => (
            <li key={m.key} className={expanded ? "" : "flex w-full justify-center"}>
              <div
                draggable
                onDragStart={(e) => handleDragStart(e, m.key)}
                title={m.label}
                className={`group flex cursor-grab items-center rounded-xl border border-gray-200 bg-white transition hover:border-gray-300 hover:shadow-sm active:cursor-grabbing dark:border-white/[0.06] dark:bg-white/[0.03] dark:hover:border-white/20 ${
                  expanded ? "w-full gap-2 p-2" : "h-10 w-10 justify-center p-0"
                }`}
              >
                {expanded && (
                  <GripVertical size={12} className="shrink-0 text-gray-300 dark:text-gray-600" />
                )}
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: `${m.color}1A`, color: m.color }}
                >
                  <m.icon size={13} />
                </span>
                {expanded && (
                  <>
                    <span className="flex-1 truncate text-[12px] font-bold text-gray-800 dark:text-white">
                      {m.label}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingRemove(m);
                      }}
                      title="Quitar del panel"
                      className="shrink-0 rounded-md p-1 text-gray-300 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 dark:text-gray-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                    >
                      <X size={12} />
                    </button>
                  </>
                )}
              </div>
            </li>
          ))
        )}
      </ul>

      {/* Picker modal */}
      <AnimatePresence>
        {pickerOpen && (
          <ModulePicker
            inPanel={inPanel}
            onClose={() => setPickerOpen(false)}
            onSubmit={(next) => {
              onChangePanel(next);
              setPickerOpen(false);
              toast.success("Panel actualizado.");
            }}
          />
        )}
      </AnimatePresence>

      {/* Confirmación de quitar un módulo individual */}
      <AnimatePresence>
        {pendingRemove && (
          <ConfirmDialog
            title={`¿Quitar "${pendingRemove.label}" del panel?`}
            description="Los widgets que ya armaste en el lienzo con este módulo no se borran, solo desaparece el chip del panel."
            confirmLabel="Quitar"
            tone="danger"
            onCancel={() => setPendingRemove(null)}
            onConfirm={confirmRemove}
          />
        )}
      </AnimatePresence>
    </aside>
  );
}

// ─── ModulePicker ──────────────────────────────────────────────────────────

function ModulePicker({
  inPanel,
  onClose,
  onSubmit,
}: {
  inPanel: Set<string>;
  onClose: () => void;
  onSubmit: (nextKeys: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(inPanel));

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const grupos = {
    Operación: MODULES.filter((m) => m.group === "Operación"),
    Control:   MODULES.filter((m) => m.group === "Control"),
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-3 sm:p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0d1320]"
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 dark:border-white/[0.06]">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Panel</p>
              <h2 className="text-base font-bold text-gray-800 dark:text-white">Elegí los módulos</h2>
            </div>
            <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.06] dark:hover:text-white">
              <X size={15} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {(["Operación", "Control"] as const).map((g) => (
              <div key={g}>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">{g}</p>
                <div className="grid grid-cols-2 gap-2">
                  {grupos[g].map((m) => {
                    const active = selected.has(m.key);
                    return (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => toggle(m.key)}
                        className={`flex items-center gap-2 rounded-xl border p-2.5 text-left transition ${
                          active
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                            : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200"
                        }`}
                      >
                        <span
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                          style={{ background: `${m.color}1A`, color: m.color }}
                        >
                          <m.icon size={13} />
                        </span>
                        <span className="flex-1 truncate text-xs font-bold">{m.label}</span>
                        {active && <Check size={13} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50/60 px-5 py-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
            <button onClick={onClose} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.04]">
              Cancelar
            </button>
            <button
              onClick={() => onSubmit(Array.from(selected))}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-600"
            >
              <Check size={12} /> Guardar panel
            </button>
          </div>
        </motion.div>
      </div>
    </>
  );
}