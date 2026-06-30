"use client";

// ─────────────────────────────────────────────────────────────────────────────
// pages/Reports/components/CanvasDataTable.tsx
//
// Tabla del widget del lienzo. Antes mostraba columnas genéricas derivadas
// del payload agregado del calculator (nombres crudos, datos agrupados).
//
// Ahora consume el endpoint `widgets/:id/rows` que devuelve las filas
// específicas del módulo del widget (Combustible, Mantenimiento, Conductores,
// etc.) con columnas legibles en español y tipos (`date`/`number`/`currency`/`string`)
// para formatear cada celda correctamente.
//
// Formato de celdas:
//   - date     → "DD/MM/YYYY"
//   - currency → "$ 1.234,56"
//   - number   → "1.234,56" (es-EC)
//   - string   → tal cual
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "../../../components/ui/table";
import { useCanvasWidgetRows, type CanvasRowsColumn } from "../../../hooks/useCanvasBoards";

const CURRENCY = new Intl.NumberFormat("es-EC", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const NUMBER = new Intl.NumberFormat("es-EC", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function formatCell(v: unknown, type: CanvasRowsColumn["type"]): string {
  if (v == null || v === "") return "—";
  switch (type) {
    case "date": {
      // Acepta "YYYY-MM-DD" o ISO completo.
      const s = String(v).slice(0, 10);
      const [y, m, d] = s.split("-");
      if (y && m && d) return `${d}/${m}/${y}`;
      return s;
    }
    case "currency":
      return typeof v === "number" ? CURRENCY.format(v) : String(v);
    case "number":
      return typeof v === "number" ? NUMBER.format(v) : String(v);
    case "string":
    default:
      return typeof v === "string" ? v : String(v);
  }
}

export function CanvasDataTable({
  companyId,
  boardId,
  widgetId,
}: {
  companyId: string | null;
  boardId:  string | null;
  widgetId: string;
}) {
  const { data, loading, error, refetch } = useCanvasWidgetRows(companyId, boardId, widgetId);

  // Si cambia el widget, refrescamos al recibir el flag (la prop puede no cambiar pero
  // los datos sí por un PUT).
  const [tick, setTick] = useState(0);
  useEffect(() => { setTick((n) => n + 1); }, [widgetId, companyId, boardId]);

  const rows    = useMemo(() => data?.rows ?? [], [data]);
  const columns = useMemo<CanvasRowsColumn[]>(() => data?.columns ?? [], [data]);

  if (loading) {
    return (
      <CenterMsg icon={<Loader2 className="animate-spin" size={20} />} label="Cargando filas…" />
    );
  }
  if (error) {
    return (
      <CenterMsg icon={<AlertCircle size={20} />} label={error} tone="rose" />
    );
  }
  if (!data) {
    return <CenterMsg label="Sin datos" tone="muted" />;
  }

  if (rows.length === 0) {
    return (
      <CenterMsg
        label={data.warning ?? "No hay registros en este rango / scope."}
        tone="muted"
      />
    );
  }

  if (columns.length === 0) {
    return (
      <CenterMsg label="Estructura no soportada para este módulo." tone="muted" />
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      {data.warning && (
        <div className="mb-1 shrink-0 rounded-md bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30">
          {data.warning}
        </div>
      )}
      <div
        className="flex-1 min-h-0 overflow-auto rounded-lg border border-gray-100 dark:border-white/[0.06]"
        key={tick /* fuerza re-mount del inner scroll al cambiar widget */}
      >
        <Table>
          <TableHeader>
            <TableRow className="sticky top-0 z-10 border-b border-gray-100 bg-gray-50/95 backdrop-blur dark:border-white/[0.06] dark:bg-white/[0.03]">
              {columns.map((c) => (
                <TableCell
                  key={c.key}
                  isHeader
                  className="whitespace-nowrap px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400"
                >
                  {c.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow
                key={i}
                className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 dark:border-white/[0.04] dark:hover:bg-white/[0.02]"
              >
                {columns.map((c) => (
                  <TableCell
                    key={c.key}
                    className={`whitespace-nowrap px-2.5 py-1 text-[11px] text-gray-700 dark:text-gray-200 ${
                      c.type === "number" || c.type === "currency" ? "tabular-nums text-right" : ""
                    }`}
                  >
                    {formatCell(row[c.key], c.type)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="mt-1 shrink-0 text-right text-[9px] text-gray-400 dark:text-gray-500">
        {rows.length} fila{rows.length === 1 ? "" : "s"}
        <button
          type="button"
          onClick={() => refetch()}
          className="ml-2 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-600 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-500/15"
          title="Refrescar filas"
        >
          Refrescar
        </button>
      </div>
    </div>
  );
}

function CenterMsg({
  icon,
  label,
  tone,
}: {
  icon?: React.ReactNode;
  label: string;
  tone?: "muted" | "rose";
}) {
  const toneCls = tone === "rose"
    ? "text-rose-500 dark:text-rose-400"
    : "text-gray-300 dark:text-gray-600";
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2">
      {icon && <span className={toneCls}>{icon}</span>}
      <p className="text-[12px] font-medium text-gray-400 dark:text-gray-500 text-center px-4 max-w-[280px]">
        {label}
      </p>
    </div>
  );
}