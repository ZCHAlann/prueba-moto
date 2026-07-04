"use client";

import { JSX, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  X, ExternalLink, FileText, Loader2, AlertTriangle, Wrench,
  Truck, User, Droplets, ClipboardCheck, ShieldCheck, Building2, ArrowRight, Bell,
  ClipboardList
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import type { ReportRow } from "./page";

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  const slice = String(s).slice(0, 10);
  const [y, m, d] = slice.split("-");
  if (!d || !m || !y) return String(s);
  return `${d}/${m}/${y}`;
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(2)} USD`;
}

function fmtNum(n: number | null | undefined, decimals = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(decimals);
}

function pickStr(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.length > 0 ? v : null;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

function pickNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// ─── Schemas curados por módulo ──────────────────────────────────────────────
//
// Cada módulo declara qué secciones + qué campos visibles tiene. Esto es
// lo que el drawer nativo del módulo original muestra al usuario final;
// no se enseña nada más. Mantener esta lista sincronizada si el drawer
// nativo agrega un campo nuevo.

type Field = { label: string; value: string; highlight?: boolean };
type Section = {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  fields: Field[];
};
type ModuleSchema = (raw: Record<string, unknown> | null) => Section[];

// Combina nombre del conductor en una sola línea.
function driverName(raw: Record<string, unknown> | null): string | null {
  const d = raw?.driver as Record<string, unknown> | null;
  if (!d) return null;
  const first = pickStr(d.firstName) ?? "";
  const last  = pickStr(d.lastName) ?? "";
  const full  = `${first} ${last}`.trim();
  return full || pickStr(d.code) || null;
}

function deciderName(raw: Record<string, unknown> | null): string | null {
  const d = raw?.decider as Record<string, unknown> | null;
  if (!d) return null;
  const first = pickStr(d.firstName) ?? "";
  const last  = pickStr(d.lastName) ?? "";
  const full  = `${first} ${last}`.trim();
  return full || pickStr(d.code) || null;
}

const fuelSchema: ModuleSchema = (raw) => {
  const f = raw?.fuel as Record<string, unknown> | null;
  const a = raw?.asset as Record<string, unknown> | null;
  const sections: Section[] = [];

  if (a) {
    sections.push({
      title: "Vehículo",
      icon: Truck,
      fields: [
        { label: "Placa",  value: pickStr(a.plate) ?? "—" },
        { label: "Unidad", value: `${pickStr(a.brand) ?? ""} ${pickStr(a.model) ?? ""}`.trim() || "—" },
      ],
    });
  }

  if (f) {
    const gallons = pickNum(f.gallons);
    const cost    = pickNum(f.cost);
    const pricePerGal = gallons && cost ? cost / gallons : null;
    sections.push({
      title: "Detalle de la carga",
      icon: Droplets,
      fields: [
        { label: "Fecha",         value: fmtDate(pickStr(f.date)) },
        { label: "Estación",      value: pickStr(f.station) ?? "—" },
        { label: "Odómetro",      value: pickNum(f.odometer) != null ? `${pickNum(f.odometer)!.toLocaleString("es-EC")} km` : "—" },
        { label: "Galones",       value: gallons != null ? `${fmtNum(gallons)} gal` : "—" },
        { label: "Precio/galón",  value: pricePerGal != null ? fmtMoney(pricePerGal) : "—" },
        { label: "Costo total",   value: fmtMoney(cost), highlight: true },
        { label: "Factura",       value: pickStr(f.invoiceNumber) ?? "—" },
      ],
    });
  }

  return sections;
};

const maintenanceSchema: ModuleSchema = (raw) => {
  const m = raw?.maintenance as Record<string, unknown> | null;
  const a = raw?.asset as Record<string, unknown> | null;
  const w = raw?.workshop as Record<string, unknown> | null;
  const sections: Section[] = [];

  if (a) {
    sections.push({
      title: "Vehículo",
      icon: Truck,
      fields: [
        { label: "Placa",  value: pickStr(a.plate) ?? "—" },
        { label: "Unidad", value: `${pickStr(a.brand) ?? ""} ${pickStr(a.model) ?? ""}`.trim() || "—" },
      ],
    });
  }

  if (w) {
    sections.push({
      title: "Taller",
      icon: Building2,
      fields: [
        { label: "Nombre",  value: pickStr(w.name) ?? "—" },
        { label: "Ciudad",  value: pickStr(w.city) ?? "—" },
      ],
    });
  }

  if (m) {
    const labor = pickNum(m.laborCost);
    const total = pickNum(m.totalCost) ?? labor;
    const parts = labor != null && total != null ? Math.max(0, total - labor) : null;
    sections.push({
      title: "Detalle del mantenimiento",
      icon: Wrench,
      fields: [
        { label: "Título",      value: pickStr(m.title) ?? "—" },
        { label: "Tipo",        value: pickStr(m.kind) ?? "—" },
        { label: "Estado",      value: pickStr(m.status) ?? "—" },
        { label: "Prioridad",   value: pickStr(m.priority) ?? "—" },
        { label: "Programado",  value: fmtDate(pickStr(m.scheduledDate)) },
        { label: "Completado",  value: fmtDate(pickStr(m.completedDate)) },
        { label: "Técnico",     value: pickStr(m.technician) ?? "—" },
        { label: "Mano de obra",value: fmtMoney(labor) },
        { label: "Repuestos",   value: fmtMoney(parts) },
        { label: "Costo total", value: fmtMoney(total), highlight: true },
      ],
    });
  }

  return sections;
};

const checklistSchema: ModuleSchema = (raw) => {
  const c = raw?.checklist as Record<string, unknown> | null;
  const a = raw?.asset as Record<string, unknown> | null;
  const sections: Section[] = [];

  if (a) {
    sections.push({
      title: "Vehículo",
      icon: Truck,
      fields: [
        { label: "Placa",  value: pickStr(a.plate) ?? "—" },
        { label: "Unidad", value: `${pickStr(a.brand) ?? ""} ${pickStr(a.model) ?? ""}`.trim() || "—" },
      ],
    });
  }

  if (c) {
    sections.push({
      title: "Detalle de la inspección",
      icon: ClipboardCheck,
      fields: [
        { label: "Categoría",  value: pickStr(c.categoryName) ?? "—" },
        { label: "Estado",     value: pickStr(c.status) ?? "—" },
        { label: "Inspector",  value: pickStr(c.inspector) ?? "—" },
        { label: "Fecha",      value: fmtDate(pickStr(c.date)) },
        { label: "Resultado",  value: pickStr(c.result) ?? "—" },
        { label: "Observaciones", value: pickStr(c.notes) ?? "—" },
      ],
    });
  }

  return sections;
};

const exitAuthSchema: ModuleSchema = (raw) => {
  const a = raw?.exitAuth as Record<string, unknown> | null;
  const driverNameStr = driverName(raw);
  const deciderNameStr = deciderName(raw);
  const sections: Section[] = [];

  sections.push({
    title: "Vehículo",
    icon: Truck,
    fields: [
      { label: "Placa", value: pickStr(a?.assetPlate) ?? "—" },
    ],
  });

  sections.push({
    title: "Solicitud",
    icon: ShieldCheck,
    fields: [
      { label: "Conductor",   value: driverNameStr ?? "—" },
      { label: "Estado",      value: pickStr(a?.status) ?? "—" },
      { label: "Solicitada",  value: fmtDate(pickStr(a?.requestedAt)) },
      { label: "Decidida",    value: fmtDate(pickStr(a?.decidedAt)) },
      { label: "Aprobada por",value: deciderNameStr ?? "—" },
      { label: "Nota",        value: pickStr(a?.decisionNotes) ?? "—" },
    ],
  });

  return sections;
};

const assignmentSchema: ModuleSchema = (raw) => {
  const a = raw?.assignment as Record<string, unknown> | null;
  const driverNameStr = driverName(raw);
  const v = raw?.asset as Record<string, unknown> | null;
  const sections: Section[] = [];

  sections.push({
    title: "Vehículo",
    icon: Truck,
    fields: [
      { label: "Placa",  value: pickStr(v?.plate) ?? "—" },
      { label: "Unidad", value: `${pickStr(v?.brand) ?? ""} ${pickStr(v?.model) ?? ""}`.trim() || "—" },
    ],
  });

  sections.push({
    title: "Asignación",
    icon: User,
    fields: [
      { label: "Conductor",   value: driverNameStr ?? "—" },
      { label: "Estado",      value: pickStr(a?.status) ?? "—" },
      { label: "Inicio",      value: fmtDate(pickStr(a?.startDate)) },
      { label: "Fin",         value: fmtDate(pickStr(a?.endDate)) },
      { label: "Acta #",      value: pickStr(a?.actaNumber) ?? "—" },
    ],
  });

  return sections;
};

// Gastos (rep-003): combina combustible y mantenimiento, ya despachado por kind.
const expenseSchema: ModuleSchema = (raw) => {
  const kind = pickStr(raw?.kind);
  if (kind === "fuel")        return fuelSchema(raw);
  if (kind === "maintenance") return maintenanceSchema(raw);
  // Fallback: usa el esquema de mantenimiento.
  return maintenanceSchema(raw);
};

const MODULE_SCHEMAS: Record<string, ModuleSchema> = {
  "rep-002": assignmentSchema,
  "rep-003": expenseSchema,
  "rep-004": checklistSchema,
  "rep-005": fuelSchema,
  "rep-008": exitAuthSchema,
  "rep-009": maintenanceSchema,
};

/**
 * Drawer router para la pÃ¡gina de Reportes. Al hacer click en una fila
 * (plana o agrupada), se guarda en `selectedRow`. Este drawer mira el
 * `__raw` enriquecido por `buildPreview()` y decide quÃ© mostrar:
 *
 *   - Si el mÃ³dulo tiene un drawer nativo con endpoint dedicado (Asset,
 *     Alert), carga el detalle desde su endpoint y muestra un resumen
 *     navegable con botones de cross-link.
 *   - Para el resto (Combustible, Checklist, Mantenimiento, Autorizaciones,
 *     Asignaciones, Gastos), reusa el `__raw` que `buildPreview()` ya
 *     inyectÃ³ y lo muestra expandido por secciÃ³n, con todos los campos
 *     escalares del registro y botones de cross-link al mÃ³dulo original
 *     con deep-link (?entryId=, ?checklistId=, ?maintenanceId=, etc.).
 *
 * Esto evita:
 *   - Acoplar Reports a hooks de cada mÃ³dulo (useFuel, useToll, etc.)
 *     que requieren companyId, permisos granulares, sesiÃ³n, etc.
 *   - Mockear props (`isFullAccess`, `meId`, `onEdit`, ...) que en Reports
 *     no tienen semÃ¡ntica.
 *   - Tipos incompatibles al pasar `item={m}` cuando el drawer espera
 *     `id: string` + un set de callbacks que no existen en este contexto.
 */

interface RawPayload {
  __raw?: Record<string, unknown> | null;
}

type ModuleDrawerHint = {
  /** Etiqueta del mÃ³dulo real al que navega el enlace. */
  moduleLabel: string;
  /** Si el `__raw` trae un objeto fuente, construimos la ruta al detalle. */
  buildPath?: (raw: Record<string, unknown> | null) => string | null;
  /** Resumen legible del primer nivel del `__raw`. */
  summarize: (raw: Record<string, unknown> | null) => Array<{ label: string; value: string | null }>;
};

const HINTS: Record<string, ModuleDrawerHint> = {
  "rep-001": {
    moduleLabel: "Activos",
    // No hay ruta de detalle por ahora.
    summarize: (raw) => {
      const a = (raw?.asset as { plate?: string; brand?: string; model?: string; status?: string } | null) ?? null;
      return [
        { label: "Placa",   value: a?.plate ?? null },
        { label: "Marca",   value: a?.brand ?? null },
        { label: "Modelo",  value: a?.model ?? null },
        { label: "Estado",  value: a?.status ?? null },
      ];
    },
  },
  "rep-002": {
    moduleLabel: "Asignaciones",
    summarize: (raw) => {
      const a = (raw?.assignment as Record<string, unknown> | null) ?? null;
      const d = (raw?.driver as Record<string, unknown> | null) ?? null;
      const v = (raw?.asset as Record<string, unknown> | null) ?? null;
      return [
        { label: "Conductor", value: ((d?.firstName ?? "") + " " + (d?.lastName ?? "")).trim() || null },
        { label: "Estado",    value: (a?.status as string | null | undefined) ?? null },
        { label: "Placa",     value: (v?.plate as string | null | undefined) ?? null },
        { label: "Inicio",    value: (a?.startDate as string | null | undefined) ?? null },
        { label: "Acta #",    value: (a?.actaNumber as string | null | undefined) ?? null },
      ];
    },
  },
  "rep-003": {
    moduleLabel: "Gastos (resumen)",
    summarize: (raw) => {
      const kind = (raw?.kind as string | undefined) ?? "";
      if (kind === "fuel") {
        const f = (raw?.fuel as Record<string, unknown> | null) ?? null;
        const v = (raw?.asset as Record<string, unknown> | null) ?? null;
        return [
          { label: "Tipo",     value: "Combustible" },
          { label: "Placa",    value: (v?.plate as string | null | undefined) ?? null },
          { label: "Fecha",    value: (f?.date as string | null | undefined) ?? null },
          { label: "Costo",    value: (f?.cost as number | string | null | undefined)?.toString() ?? null },
        ];
      }
      const m = (raw?.maintenance as Record<string, unknown> | null) ?? null;
      const v = (raw?.asset as Record<string, unknown> | null) ?? null;
      return [
        { label: "Tipo",   value: "Mantenimiento" },
        { label: "Placa",  value: (v?.plate as string | null | undefined) ?? null },
        { label: "TÃ­tulo", value: (m?.title as string | null | undefined) ?? null },
        { label: "Estado", value: (m?.status as string | null | undefined) ?? null },
      ];
    },
  },
  "rep-004": {
    moduleLabel: "Checklists",
    summarize: (raw) => {
      const c = (raw?.checklist as Record<string, unknown> | null) ?? null;
      const v = (raw?.asset as Record<string, unknown> | null) ?? null;
      return [
        { label: "Equipo",    value: (c?.targetLabel as string | null | undefined) ?? (v?.plate as string | null | undefined) ?? null },
        { label: "Estado",    value: (c?.status as string | null | undefined) ?? null },
        { label: "Inspector", value: (c?.inspector as string | null | undefined) ?? null },
        { label: "Fecha",     value: (c?.date as string | null | undefined) ?? null },
      ];
    },
  },
  "rep-005": {
    moduleLabel: "Combustible",
    summarize: (raw) => {
      const f = (raw?.fuel as Record<string, unknown> | null) ?? null;
      const v = (raw?.asset as Record<string, unknown> | null) ?? null;
      return [
        { label: "Factura",  value: (f?.invoiceNumber as string | null | undefined) ?? null },
        { label: "Placa",    value: (v?.plate as string | null | undefined) ?? null },
        { label: "Galones",  value: (f?.gallons as number | string | null | undefined)?.toString() ?? null },
        { label: "Costo",    value: (f?.cost as number | string | null | undefined)?.toString() ?? null },
        { label: "EstaciÃ³n", value: (f?.station as string | null | undefined) ?? null },
      ];
    },
  },
  "rep-006": {
    moduleLabel: "Alertas",
    summarize: (raw) => {
      const a = (raw?.alert as Record<string, unknown> | null) ?? null;
      const v = (raw?.asset as Record<string, unknown> | null) ?? null;
      return [
        { label: "Placa",     value: (v?.plate as string | null | undefined) ?? null },
        { label: "TÃ­tulo",    value: (a?.title as string | null | undefined) ?? null },
        { label: "Severidad", value: (a?.severity as string | null | undefined) ?? null },
        { label: "Estado",    value: (a?.status as string | null | undefined) ?? null },
      ];
    },
  },
  "rep-008": {
    moduleLabel: "Autorizaciones",
    summarize: (raw) => {
      const a = (raw?.exitAuth as Record<string, unknown> | null) ?? null;
      const d = (raw?.driver as Record<string, unknown> | null) ?? null;
      const v = (raw?.asset as Record<string, unknown> | null) ?? null;
      return [
        { label: "Placa",      value: (a?.assetPlate as string | null | undefined) ?? (v?.plate as string | null | undefined) ?? null },
        { label: "Conductor",  value: ((d?.firstName ?? "") + " " + (d?.lastName ?? "")).trim() || null },
        { label: "Estado",     value: (a?.status as string | null | undefined) ?? null },
        { label: "Solicitada", value: (a?.requestedAt as string | null | undefined) ?? null },
      ];
    },
  },
  "rep-009": {
    moduleLabel: "Mantenimiento",
    summarize: (raw) => {
      const m = (raw?.maintenance as Record<string, unknown> | null) ?? null;
      const v = (raw?.asset as Record<string, unknown> | null) ?? null;
      const w = (raw?.workshop as Record<string, unknown> | null) ?? null;
      return [
        { label: "TÃ­tulo",     value: (m?.title as string | null | undefined) ?? null },
        { label: "Tipo",       value: (m?.kind as string | null | undefined) ?? null },
        { label: "Estado",     value: (m?.status as string | null | undefined) ?? null },
        { label: "Placa",      value: (m?.assetPlate as string | null | undefined) ?? (v?.plate as string | null | undefined) ?? null },
        { label: "Taller",     value: (w?.name as string | null | undefined) ?? null },
        { label: "Programado", value: (m?.scheduledDate as string | null | undefined) ?? null },
      ];
    },
  },
};

export function ReportDetailDrawer({
  row,
  moduleId,
  onClose,
}: {
  row: ReportRow | null;
  moduleId: string;
  onClose: () => void;
}) {
  const open = !!row;
  const raw  = (row as RawPayload | null)?.__raw ?? null;
  const hint = HINTS[moduleId];
  const navigate = useNavigate();

  function handleGoToModule() {
    // Ruta conocida por mÃ³dulo. Si no hay mapping, no hacemos nada.
    const map: Record<string, string> = {
      "rep-001": "/gestion/activos",
      "rep-002": "/gestion/asignaciones",
      "rep-004": "/checklist/historial",
      "rep-005": "/combustible",
      "rep-006": "/alertas",
      "rep-008": "/autorizaciones",
      "rep-009": "/mantenimientos",
    };
    const target = map[moduleId];
    if (target) {
      onClose();
      navigate(target);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="report-drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.aside
            key="report-drawer-panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 350, damping: 32 }}
            className="fixed right-0 top-0 z-50 h-full w-full max-w-md overflow-y-auto bg-white dark:bg-gray-900 shadow-2xl"
          >
            <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-gray-100 dark:border-white/[0.06] bg-white dark:bg-gray-900 px-5 py-4">
              <div className="flex items-center gap-2">
                <FileText size={14} className="text-gray-400" />
                <h2 className="text-base font-semibold text-gray-800 dark:text-white">
                  Detalle
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
                aria-label="Cerrar"
              >
                <X size={16} />
              </button>
            </header>

<div className="px-5 py-4 space-y-4">
              {/* Detalle full — para Asset y Alert usa el drawer dedicado que
                  consulta su endpoint. Para el resto (combustible, checklist,
                  mantenimiento, autorizaciones, asignaciones, peajes, gastos)
                  reusa el `__raw` que `buildPreview()` inyectó en cada fila y
                  lo muestra expandido por sección, con botones de navegación
                  cruzada al módulo original con deep-link. */}
              <ModuleFullDetail moduleId={moduleId} raw={raw} onAfterNavigate={onClose} />

              {/* Fallback: si ModuleFullDetail no pudo renderear nada (no hay
                  __raw en esta fila), mostramos el resumen legible + enlace
                  al módulo. Es un caso edge para módulos sin __raw poblado. */}
              {hint && !raw ? (
                <div className="rounded-xl border border-gray-100 dark:border-white/[0.06] bg-gray-50/60 dark:bg-white/[0.02] p-4 space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Resumen del registro
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    No hay datos crudos disponibles para esta fila. Abre el módulo original para ver el detalle completo.
                  </p>
                  <button
                    type="button"
                    onClick={handleGoToModule}
                    className="flex items-center justify-center gap-1.5 w-full px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-colors"
                  >
                    <ExternalLink size={14} />
                    Abrir en {hint.moduleLabel}
                  </button>
                </div>
              ) : null}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

// â”€â”€â”€ Detalle especializado por mÃ³dulo â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//
// Solo los mÃ³dulos que tienen endpoint de detalle dedicado (Asset y Alert)
// muestran un bloque con datos "full". El resto cae al resumen genÃ©rico
// de arriba.

function ModuleFullDetail({
  moduleId,
  raw,
  onAfterNavigate,
}: {
  moduleId: string;
  raw: Record<string, unknown> | null;
  /**
   * Callback que el componente padre ejecuta cuando alguno de los botones
   * de navegación cruzada dispara un `navigate()` — sirve para cerrar
   * el drawer después de cambiar de módulo. Si no viene, los botones
   * navegan igual pero el drawer queda abierto debajo.
   */
  onAfterNavigate?: () => void;
}) {
  const companyId = useAuth().session?.companyId;

  if (moduleId === "rep-001") {
    const assetId = (raw?.asset as { id?: string | null } | null)?.id ?? null;
    return (
      <AssetFullDetail
        assetId={assetId}
        companyId={companyId ?? null}
        onAfterNavigate={onAfterNavigate}
      />
    );
  }

  if (moduleId === "rep-006") {
    const alertId = (raw?.alert as { id?: string | null } | null)?.id ?? null;
    return (
      <AlertFullDetail
        alertId={alertId}
        companyId={companyId ?? null}
        onAfterNavigate={onAfterNavigate}
      />
    );
  }

  // Resto de módulos (rep-002, rep-003, rep-004, rep-005, rep-008, rep-009):
  // reutilizamos el `__raw` que `buildPreview()` ya inyectó y lo mostramos
  // expandido por sección. Da la sensación de un drawer real del módulo
  // sin acoplar Reports a los hooks de cada uno (useFuel, useToll, etc.).
  return <RawExpandedDetail raw={raw} moduleId={moduleId} onAfterNavigate={onAfterNavigate} />;
}

/**
 * Drawer-detail-from-raw: muestra el detalle del registro del reporte
 * siguiendo el patrón visual de los drawers nativos de cada módulo
 * (FuelDetailDrawer, MaintenanceDetailDrawer, ChecklistDetailDrawer,
 * ExitAuthDetailDrawer):
 *
 *   - Header con icono + título + subtítulo (placa · fecha).
 *   - Body con secciones (título uppercase gris, iconos).
 *   - Cada sección tiene Rows con icono + label a la izquierda, valor a
 *     la derecha, highlight en costos.
 *   - Footer con cross-links de navegación al módulo original con deep-link.
 *
 * Solo expone los campos que el schema curado declara — NUNCA muestra
 * IDs internos, URLs crudas, ni campos sensibles.
 */
function RawExpandedDetail({
  raw,
  moduleId,
  onAfterNavigate,
}: {
  raw: Record<string, unknown> | null;
  moduleId: string;
  onAfterNavigate?: () => void;
}) {
  const navigate = useNavigate();

  function go(path: string) {
    onAfterNavigate?.();
    navigate(path);
  }

  const schema = MODULE_SCHEMAS[moduleId];
  const sections = schema ? schema(raw) : [];
  const moduleLabel = HINTS[moduleId]?.moduleLabel ?? "el módulo";

  // ─── Header: subtítulo con datos representativos ───────────────────────
  // Replicamos el patrón del header de FuelDetailDrawer ("ABC-123 · 04/07/2026").
  const fuel = raw?.fuel as Record<string, unknown> | null;
  const m   = raw?.maintenance as Record<string, unknown> | null;
  const a   = raw?.asset as Record<string, unknown> | null;
  const c   = raw?.checklist as Record<string, unknown> | null;
  const xa  = raw?.exitAuth as Record<string, unknown> | null;

  const subtitleParts: string[] = [];
  const plate =
    pickStr(a?.plate) ??
    pickStr(xa?.assetPlate) ??
    pickStr(fuel?.assetPlate) ??
    pickStr(m?.assetPlate) ??
    "—";
  const headerDate =
    pickStr(fuel?.date) ??
    pickStr(m?.scheduledDate) ??
    pickStr(c?.date) ??
    pickStr(xa?.requestedAt);
  subtitleParts.push(plate);
  if (headerDate) subtitleParts.push(fmtDate(headerDate));

  // ─── Cross-links ─────────────────────────────────────────────────────
  const assetId    = (raw?.asset       as { id?: string | null } | null)?.id ?? null;
  const checklist  = (raw?.checklist   as { id?: string | null } | null)?.id ?? null;
  const fuelId     = (raw?.fuel        as { id?: string | null } | null)?.id ?? null;
  const maintId    = (raw?.maintenance as { id?: string | null } | null)?.id ?? null;

  const crossLinks: Array<{ label: string; icon: JSX.Element; to: string; tone: string }> = [];
  if (moduleId === "rep-005" && fuelId) {
    crossLinks.push({ label: "Ver carga en módulo de combustible", icon: <ArrowRight size={12} />, to: `/combustible?entryId=${fuelId}`, tone: "amber" });
  }
  if (moduleId === "rep-004" && checklist) {
    crossLinks.push({ label: "Ver inspección en historial", icon: <ArrowRight size={12} />, to: `/checklist/historial?checklistId=${checklist}`, tone: "emerald" });
  }
  if (moduleId === "rep-009" && maintId) {
    crossLinks.push({ label: "Ver mantenimiento", icon: <ArrowRight size={12} />, to: `/mantenimiento?maintenanceId=${maintId}`, tone: "fuchsia" });
  }
  if (assetId && moduleId !== "rep-001") {
    crossLinks.push({ label: "Ver mantenimientos del vehículo", icon: <ArrowRight size={12} />, to: `/mantenimiento?assetId=${assetId}`, tone: "amber" });
    crossLinks.push({ label: "Ver alertas del vehículo",         icon: <ArrowRight size={12} />, to: `/alertas?assetId=${assetId}`,     tone: "rose" });
    crossLinks.push({ label: "Ver inspecciones del vehículo",    icon: <ArrowRight size={12} />, to: `/checklist?assetId=${assetId}`, tone: "emerald" });
  }

  const toneClasses: Record<string, string> = {
    brand:   "hover:border-brand-300 dark:hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400",
    emerald: "hover:border-emerald-300 dark:hover:border-emerald-500/40 hover:text-emerald-600 dark:hover:text-emerald-400",
    amber:   "hover:border-amber-300 dark:hover:border-amber-500/40 hover:text-amber-600 dark:hover:text-amber-400",
    rose:    "hover:border-rose-300 dark:hover:border-rose-500/40 hover:text-rose-600 dark:hover:text-rose-400",
    fuchsia: "hover:border-fuchsia-300 dark:hover:border-fuchsia-500/40 hover:text-fuchsia-600 dark:hover:text-fuchsia-400",
  };

  if (sections.length === 0) {
    return (
      <div className="rounded-xl border border-gray-100 dark:border-white/[0.06] bg-gray-50/60 dark:bg-white/[0.02] p-4 text-xs text-gray-500 dark:text-gray-400">
        No hay datos disponibles para este registro. Abre {moduleLabel} para ver el detalle completo.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header con subtítulo (placa · fecha), replica FuelDetailDrawer */}
      <div className="flex items-center gap-2 px-1 pb-1">
        <span className="text-[11px] text-gray-400 dark:text-gray-500">
          {subtitleParts.join(" · ")}
        </span>
      </div>

      {/* Body con secciones, replica el patrón visual de los drawers nativos */}
      {sections.map((s, i) => (
        <div key={i}>
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            <s.icon size={11} className="shrink-0" />
            {s.title}
          </p>
          <div className="rounded-xl border border-gray-100 dark:border-white/[0.06] bg-gray-50/60 dark:bg-white/[0.02] divide-y divide-gray-50 dark:divide-white/[0.04]">
            {s.fields.map((f, j) => (
              <div key={j} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                  {f.label}
                </span>
                <span
                  className={
                    f.highlight
                      ? "text-sm font-black text-gray-800 dark:text-white"
                      : "text-sm font-semibold text-gray-700 dark:text-gray-200"
                  }
                >
                  {f.value || "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Cross-links al módulo original con deep-link */}
      {crossLinks.length > 0 && (
        <div className="flex flex-col gap-2 pt-1">
          {crossLinks.map((c, i) => (
            <button
              key={i}
              type="button"
              onClick={() => go(c.to)}
              className={`flex items-center justify-center gap-1.5 w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] text-xs font-semibold text-gray-700 dark:text-gray-200 transition active:scale-[0.98] ${toneClasses[c.tone] ?? ""}`}
            >
              {c.label}
              {c.icon}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€ Asset: drawer con datos completos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type AssetDetail = {
  id: string;
  name: string | null;
  brand: string | null;
  model: string | null;
  plate: string | null;
  status: string | null;
  category: string | null;
  observations: string | null;
  currentDriver?: {
    id: string;
    name: string;
    phone: string | null;
  } | null;
  currentAssignment?: unknown;
};

function AssetFullDetail({
  assetId,
  companyId,
  onAfterNavigate,
}: {
  assetId: string | null;
  companyId: number | null;
  onAfterNavigate?: () => void;
}) {
  const [data, setData]     = useState<AssetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const navigate = useNavigate();

  function go(path: string) {
    onAfterNavigate?.();
    navigate(path);
  }

  useEffect(() => {
    let cancelled = false;
    if (!assetId || !companyId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    fetch(`/api/company/${companyId}/assets/${assetId}`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => { if (!cancelled) setData(json as AssetDetail); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [assetId, companyId]);

  if (!assetId) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-100 dark:border-white/[0.06] bg-gray-50/60 dark:bg-white/[0.02] p-6 text-xs text-gray-500 dark:text-gray-400">
        <Loader2 size={14} className="animate-spin" />
        Cargando detalle del activoâ€¦
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-rose-200 dark:border-rose-500/20 bg-rose-50/60 dark:bg-rose-500/[0.06] p-3 text-xs text-rose-700 dark:text-rose-300">
        <AlertTriangle size={14} />
        No se pudo cargar el detalle: {error ?? "sin datos"}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
        Detalle completo del activo
      </p>
      <dl className="grid gap-2 rounded-xl border border-gray-100 dark:border-white/[0.06] bg-gray-50/60 dark:bg-white/[0.02] p-4 text-xs">
        {([
          ["Nombre",       data.name],
          ["CategorÃ­a",    data.category],
          ["Marca / Modelo", [data.brand, data.model].filter(Boolean).join(" ") || null],
          ["Placa",        data.plate],
          ["Estado",       data.status],
          ["Conductor actual", data.currentDriver?.name ?? null],
        ] as Array<[string, string | null]>).map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-3">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 shrink-0">
              {label}
            </dt>
            <dd className="text-xs font-medium text-gray-800 dark:text-white text-right break-words">
              {value ?? "â€”"}
            </dd>
          </div>
        ))}
      </dl>
      {data.observations && (
        <div className="rounded-xl border border-gray-100 dark:border-white/[0.06] bg-gray-50/60 dark:bg-white/[0.02] p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">
            Observaciones
          </p>
          <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {data.observations}
          </p>
        </div>
      )}

      {/* Acciones de navegaciÃ³n cruzada â€” cada botÃ³n cierra el drawer y
          salta al mÃ³dulo correspondiente con `?assetId=X` para que el
          mÃ³dulo aterrice ya filtrado por este vehÃ­culo. */}
      <div className="flex flex-col gap-2 pt-1">
        <button
          type="button"
          onClick={() => go(`/mantenimiento?assetId=${assetId}`)}
          className="flex items-center justify-center gap-1.5 w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] text-xs font-semibold text-gray-700 dark:text-gray-200 hover:border-brand-300 dark:hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400 transition active:scale-[0.98]"
        >
          <Wrench size={12} /> Ver mantenimientos
          <ExternalLink size={10} className="opacity-60" />
        </button>
        <button
          type="button"
          onClick={() => go(`/alertas?assetId=${assetId}`)}
          className="flex items-center justify-center gap-1.5 w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] text-xs font-semibold text-gray-700 dark:text-gray-200 hover:border-rose-300 dark:hover:border-rose-500/40 hover:text-rose-600 dark:hover:text-rose-400 transition active:scale-[0.98]"
        >
          <Bell size={12} /> Ver alertas
          <ExternalLink size={10} className="opacity-60" />
        </button>
        <button
          type="button"
          onClick={() => go(`/checklist?assetId=${assetId}`)}
          className="flex items-center justify-center gap-1.5 w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] text-xs font-semibold text-gray-700 dark:text-gray-200 hover:border-emerald-300 dark:hover:border-emerald-500/40 hover:text-emerald-600 dark:hover:text-emerald-400 transition active:scale-[0.98]"
        >
          <ClipboardList size={12} /> Ver inspecciones pendientes
          <ExternalLink size={10} className="opacity-60" />
        </button>
      </div>
    </div>
  );
}

// â”€â”€â”€ Alert: drawer con datos completos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type AlertDetail = {
  id: string;
  title: string;
  type: string;
  severity: string;
  status: string;
  dueDate: string;
  notes: string | null;
  assetId?: string | null;
  assetName?: string | null;
  assetPlate?: string | null;
};

function AlertFullDetail({
  alertId,
  companyId,
  onAfterNavigate,
}: {
  alertId: string | null;
  companyId: number | null;
  onAfterNavigate?: () => void;
}) {
  const [data, setData]     = useState<AlertDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const navigate = useNavigate();

  function go(path: string) {
    onAfterNavigate?.();
    navigate(path);
  }

  useEffect(() => {
    let cancelled = false;
    if (!alertId || !companyId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    fetch(`/api/company/${companyId}/alerts/${alertId}`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => { if (!cancelled) setData(json as AlertDetail); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [alertId, companyId]);

  if (!alertId) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-100 dark:border-white/[0.06] bg-gray-50/60 dark:bg-white/[0.02] p-6 text-xs text-gray-500 dark:text-gray-400">
        <Loader2 size={14} className="animate-spin" />
        Cargando detalle de la alertaâ€¦
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-rose-200 dark:border-rose-500/20 bg-rose-50/60 dark:bg-rose-500/[0.06] p-3 text-xs text-rose-700 dark:text-rose-300">
        <AlertTriangle size={14} />
        No se pudo cargar el detalle: {error ?? "sin datos"}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
        Detalle completo de la alerta
      </p>
      <dl className="grid gap-2 rounded-xl border border-gray-100 dark:border-white/[0.06] bg-gray-50/60 dark:bg-white/[0.02] p-4 text-xs">
        {([
          ["TÃ­tulo",     data.title],
          ["Tipo",       data.type],
          ["Severidad",  data.severity],
          ["Estado",     data.status],
          ["Activo",     data.assetPlate || data.assetName],
          ["Vence",      data.dueDate],
        ] as Array<[string, string | null]>).map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-3">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 shrink-0">
              {label}
            </dt>
            <dd className="text-xs font-medium text-gray-800 dark:text-white text-right break-words">
              {value ?? "â€”"}
            </dd>
          </div>
        ))}
      </dl>
      {data.notes && (
        <div className="rounded-xl border border-gray-100 dark:border-white/[0.06] bg-gray-50/60 dark:bg-white/[0.02] p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">
            Notas
          </p>
          <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {data.notes}
          </p>
        </div>
      )}

      {/* Acciones de navegaciÃ³n cruzada â€” solo "Ver activo" cuando aplica,
          ya que la alerta no tiene vÃ­nculo natural con mantenimiento/checklist
          (esos se cruzan desde el detalle del Activo, no al revÃ©s). */}
      {data.assetId ? (
        <button
          type="button"
          onClick={() => go(`/flotas?assetId=${data.assetId}`)}
          className="flex items-center justify-center gap-1.5 w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] text-xs font-semibold text-gray-700 dark:text-gray-200 hover:border-brand-300 dark:hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400 transition active:scale-[0.98]"
        >
          <Truck size={12} /> Ver activo asociado
          <ExternalLink size={10} className="opacity-60" />
        </button>
      ) : null}
    </div>
  );
}
