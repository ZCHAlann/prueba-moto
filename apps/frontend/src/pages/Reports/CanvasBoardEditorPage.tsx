"use client";

// ─────────────────────────────────────────────────────────────────────────────
// pages/Reports/CanvasBoardEditorPage.tsx
//
// Vista de edición de un lienzo:
//   - Header: nombre editable + Exportar PDF + Guardar + Volver
//   - Panel izquierdo: CanvasModulePanel con chips arrastrables (hover auto
//     expand/collapse, eliminar módulo directo desde el chip)
//   - Canvas libre: drag desde el panel + drag/resize de widgets existentes
//   - Modal WidgetConfigModal al soltar un módulo nuevo
//
// Persistencia:
//   - Renombrar board / panelModules → onBlur o al cerrar modal (no autosave
//     de keystrokes para no saturar).
//   - Mover/redimensionar widgets → PUT inmediato al SOLTAR (sin debounce;
//     useCanvasDrag ya hace commit on mouseup).
//   - Crear/eliminar widget → POST/DELETE inmediato.
//
// Exportar PDF:
//   - Captura visual del contenedor canvasRef (lo que el usuario ve, tal
//     cual) y la embebe en un PDF. Ver pages/Reports/canvasExport.ts.
//   - 100% frontend, no requiere endpoint nuevo.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  ArrowLeft, Save, Check, Loader2, AlertCircle, X, FileDown,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  useCanvasBoard, updateBoard, updateWidget, createWidget, deleteWidget,
  type CanvasWidget,
} from "../../hooks/useCanvasBoards";
import { useAuth } from "../../context/AuthContext";
import { CanvasModulePanel, type ModuloKey } from "./components/CanvasModulePanel";
import { CanvasWidget as CanvasWidgetCard } from "./components/CanvasWidget";
import { WidgetConfigModal, type WidgetConfigOutput } from "./components/WidgetConfigModal";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { exportCanvasToPdf } from "./canvasExport";

export function CanvasBoardEditorPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const companyId = session?.companyId ? String(session.companyId) : null;

  const { detail, loading, error, refetch } = useCanvasBoard(boardId ?? null);

  // ─── Estado editable del board ──────────────────────────────────────────
  const [nameDraft, setNameDraft] = useState("");
  const [panelDraft, setPanelDraft] = useState<string[]>([]);
  const [savingMeta, setSavingMeta] = useState(false);

  // Sincronizar con lo que llega del fetch.
  useEffect(() => {
    if (detail) {
      setNameDraft(detail.board.name);
      setPanelDraft(detail.board.panelModules);
    }
  }, [detail]);

  const nameDirty = detail && nameDraft !== detail.board.name;
  const panelDirty = detail && JSON.stringify(panelDraft) !== JSON.stringify(detail.board.panelModules);

  async function handleSaveMeta() {
    if (!detail || !companyId) return;
    setSavingMeta(true);
    try {
      await updateBoard(companyId, detail.board.id, {
        name: nameDraft,
        panelModules: panelDraft,
      });
      toast.success("Lienzo actualizado.");
      void refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSavingMeta(false);
    }
  }

  // ─── Exportar PDF ────────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  async function handleExportPdf() {
    if (!canvasRef.current) return;
    if (!detail?.widgets.length) {
      toast.error("Agregá al menos un widget antes de exportar.");
      return;
    }
    setExportingPdf(true);
    try {
      await exportCanvasToPdf({
        canvasEl: canvasRef.current,
        boardName: detail.board.name,
      });
      toast.success("PDF generado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo exportar el PDF.");
    } finally {
      setExportingPdf(false);
    }
  }

  // ─── Drop en canvas ────────────────────────────────────────────────────
  const [dropPos, setDropPos] = useState<{ x: number; y: number } | null>(null);
  const [dropModulo, setDropModulo] = useState<ModuloKey | null>(null);

  // Widget actualmente siendo editado (null = no hay modal de edición abierto).
  const [editingWidgetId, setEditingWidgetId] = useState<string | null>(null);

  function handleDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes("application/x-canvas-module")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }

  function handleDrop(e: React.DragEvent) {
    const key = e.dataTransfer.getData("application/x-canvas-module") as ModuloKey | "";
    if (!key) return;
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Posición del drop relativa al canvas (rect ya es del propio canvas,
    // así que el ancho dinámico del CanvasModulePanel con hover no afecta
    // este cálculo).
    const x = Math.max(0, e.clientX - rect.left - 200); // 200 = ancho aprox del widget
    const y = Math.max(0, e.clientY - rect.top  - 40);  // 40 = header aprox
    setDropPos({ x, y });
    setDropModulo(key);
  }

  async function handleWidgetSubmit(out: WidgetConfigOutput) {
    if (!detail || !companyId) return;
    try {
      // Modo edición: el modal trae el widget que estamos editando en
      // `editingWidgetId` (guardado en state). Actualizamos in-place.
      if (editingWidgetId) {
        await updateWidget(companyId, detail.board.id, editingWidgetId, {
          modulo:     out.modulo,
          vizKind:    out.vizKind,
          chartType:  out.chartType,
          scope:      out.scope,
          entityKind: out.entityKind,
          entityIds:  out.entityIds,
          periodo:    out.periodo,
          fechaDesde: out.fechaDesde,
          fechaHasta: out.fechaHasta,
          title:      out.title,
        });
        toast.success("Widget actualizado.");
        setEditingWidgetId(null);
        setDropModulo(null);
        void refetch();
        return;
      }

      // Modo creación (drag desde el panel)
      const widget = await createWidget(companyId, detail.board.id, {
        modulo:      out.modulo,
        vizKind:     out.vizKind,
        chartType:   out.chartType,
        scope:       out.scope,
        entityKind:  out.entityKind,
        entityIds:   out.entityIds,
        periodo:     out.periodo,
        fechaDesde:  out.fechaDesde,
        fechaHasta:  out.fechaHasta,
        title:       out.title,
      });
      // Aplicar posición del drop al widget creado (PUT adicional).
      if (dropPos) {
        await updateWidget(companyId, detail.board.id, widget.id, {
          posX: dropPos.x,
          posY: dropPos.y,
        });
      }
      toast.success("Widget agregado.");
      setDropPos(null);
      setDropModulo(null);
      void refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar el widget");
    }
  }

  // ─── Drag/resize de widgets existentes ──────────────────────────────────
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [pendingDeleteWidgetId, setPendingDeleteWidgetId] = useState<string | null>(null);

  const handleChangeGeometry = useCallback(
    async (widgetId: string, next: { posX: number; posY: number; width: number; height: number }) => {
      if (!detail || !companyId) return;
      try {
        await updateWidget(companyId, detail.board.id, widgetId, next);
        // Refetch silencioso: el widget ya tiene la posición nueva localmente
        // (useCanvasDrag ya actualizó el rect), no necesitamos re-render.
        // Pero si hay otro usuario editando el mismo board, su próxima carga
        // verá el cambio. Para esta sesión basta con NO re-render (optimistic).
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al mover/redimensionar");
        void refetch();
      }
    },
    [companyId, detail],
  );

  const handleDelete = useCallback(
    async (widgetId: string) => {
      if (!detail || !companyId) return;
      try {
        await deleteWidget(companyId, detail.board.id, widgetId);
        toast.success("Widget eliminado.");
        void refetch();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al eliminar");
      } finally {
        setPendingDeleteWidgetId(null);
      }
    },
    [companyId, detail],
  );

  // ─── Render ────────────────────────────────────────────────────────────
  if (loading && !detail) {
    return (
      <CenterState icon={<Loader2 className="animate-spin" size={28} />} label="Cargando lienzo…" />
    );
  }
  if (error) {
    return (
      <CenterState icon={<AlertCircle size={28} />} label={error} tone="rose" />
    );
  }
  if (!detail) return null;

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-[#0d1320]">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-gray-50/60 px-4 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.03]">
        <div className="flex min-w-0 items-center gap-2">
          <button
            onClick={() => navigate("/lienzo")}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/[0.04]"
            title="Volver al listado"
          >
            <ArrowLeft size={15} />
          </button>
          <input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => {
              if (nameDirty) void handleSaveMeta();
            }}
            maxLength={160}
            placeholder="Nombre del lienzo"
            className="min-w-0 flex-1 bg-transparent text-base font-bold text-gray-800 outline-none placeholder:text-gray-400 dark:text-white"
          />
          <span className="hidden shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 sm:inline dark:bg-white/[0.06] dark:text-gray-400">
            {detail.board.isShared ? "Compartido" : "Privado"}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {(nameDirty || panelDirty) && (
            <span className="hidden text-[11px] text-amber-600 sm:inline dark:text-amber-400">Cambios sin guardar</span>
          )}
          <button
            onClick={handleExportPdf}
            disabled={exportingPdf || detail.widgets.length === 0}
            title={detail.widgets.length === 0 ? "Agregá al menos un widget" : "Exportar este lienzo a PDF"}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-600 shadow-sm transition hover:bg-gray-50 disabled:opacity-40 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300 dark:hover:bg-white/[0.07]"
          >
            {exportingPdf ? <Loader2 size={12} className="animate-spin" /> : <FileDown size={12} />}
            Exportar PDF
          </button>
          <button
            onClick={handleSaveMeta}
            disabled={(!nameDirty && !panelDirty) || savingMeta}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-600 disabled:opacity-40"
          >
            {savingMeta ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            Guardar
          </button>
        </div>
      </div>

      {/* Body: panel + canvas */}
      <div className="flex min-h-0 flex-1">
        <CanvasModulePanel
          panelModules={panelDraft}
          onChangePanel={(next) => {
            setPanelDraft(next);
            // Autosave de panelModules (sin esperar al "Guardar"): el cambio
            // es discreto y el panel se puede perder de vista al cambiar de
            // tab, así que guardamos en background.
            if (detail && companyId) {
              void updateBoard(companyId, detail.board.id, { panelModules: next })
                .then(() => toast.success("Panel actualizado."))
                .catch(() => toast.error("Error al guardar panel"));
            }
          }}
        />

        {/* Canvas */}
        <div
          ref={canvasRef}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className="relative flex-1 overflow-auto bg-[radial-gradient(circle,_#e5e7eb_1px,_transparent_1px)] [background-size:18px_18px] dark:bg-[radial-gradient(circle,_#1f2937_1px,_transparent_1px)]"
        >
          {detail.widgets.length === 0 && !dropModulo && (
            <div className="flex h-full items-center justify-center">
              <div className="rounded-3xl border-2 border-dashed border-gray-300 bg-white/70 px-10 py-8 text-center backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.02]">
                <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                  Arrastrá un módulo del panel izquierdo
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Se abrirá un modal para configurar la gráfica o tabla.
                </p>
              </div>
            </div>
          )}

          {detail.widgets.map((w: CanvasWidget) => (
            <CanvasWidgetCard
              key={w.id}
              widget={w}
              selected={selectedWidgetId === w.id}
              onSelect={() => setSelectedWidgetId(w.id)}
              onChangeGeometry={(next) => handleChangeGeometry(w.id, next)}
              onDelete={() => setPendingDeleteWidgetId(w.id)}
              onEdit={() => setEditingWidgetId(w.id)}
            />
          ))}
        </div>
      </div>

      {/* Modal de configuración: al dropear un módulo nuevo, o al editar uno existente */}
      <AnimatePresence>
        {(dropModulo || editingWidgetId) && (
          <WidgetConfigModal
            modulo={dropModulo ?? undefined}
            widget={editingWidgetId ? detail?.widgets.find((w: CanvasWidget) => w.id === editingWidgetId) : undefined}
            onClose={() => {
              setDropModulo(null);
              setDropPos(null);
              setEditingWidgetId(null);
            }}
            onSubmit={handleWidgetSubmit}
          />
        )}
      </AnimatePresence>

      {/* Confirmación de eliminar widget (reemplaza window.confirm) */}
      <AnimatePresence>
        {pendingDeleteWidgetId && (
          <ConfirmDialog
            title="¿Eliminar este widget?"
            description="Se quitará del lienzo de forma permanente. Esta acción no se puede deshacer."
            confirmLabel="Eliminar"
            tone="danger"
            onCancel={() => setPendingDeleteWidgetId(null)}
            onConfirm={() => handleDelete(pendingDeleteWidgetId)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── UI helpers ────────────────────────────────────────────────────────────

function CenterState({ icon, label, tone }: {
  icon: React.ReactNode; label: string; tone?: "muted" | "rose";
}) {
  const toneCls = tone === "rose"
    ? "text-rose-500 dark:text-rose-400"
    : "text-gray-300 dark:text-gray-600";
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <span className={toneCls}>{icon}</span>
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
      </div>
    </div>
  );
}