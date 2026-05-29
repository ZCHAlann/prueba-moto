"use client";

import { useMemo, useState } from "react";
import { usePlatform } from "@/components/providers/platform-provider";
import {
  DataExportToolbar,
  type ExportColumn,
  type ExportRow,
} from "@/components/ui/data-export-toolbar";
import { EmptyState, StatCard } from "@/components/ui/surface";
import { Table, TableBody, TableCard, TableHead } from "@/components/ui/table";
import { ModulePageHeader } from "@/features/modules/module-page-header";

const exportColumns: ExportColumn[] = [
  { key: "at", label: "Fecha" },
  { key: "actor", label: "Actor" },
  { key: "entity", label: "Entidad" },
  { key: "action", label: "Accion" },
  { key: "detail", label: "Detalle" },
  { key: "severity", label: "Severidad" },
];

export function AuditPage() {
  const { logs } = usePlatform();
  const [query, setQuery] = useState("");

  const filteredLogs = useMemo(() => {
    const value = query.trim().toLowerCase();
    return logs.filter((log) => {
      return (
        value.length === 0 ||
        log.actor.toLowerCase().includes(value) ||
        log.entity.toLowerCase().includes(value) ||
        log.action.toLowerCase().includes(value) ||
        log.detail.toLowerCase().includes(value)
      );
    });
  }, [logs, query]);

  const exportRows = useMemo<ExportRow[]>(
    () =>
      filteredLogs.map((log) => ({
        at: log.at,
        actor: log.actor,
        entity: log.entity,
        action: log.action,
        detail: log.detail,
        severity: log.severity,
      })),
    [filteredLogs]
  );

  return (
    <div className="space-y-4">
      <ModulePageHeader
        badge="Panel master"
        title="Auditoria central"
        subtitle="Trazabilidad de marketing, empresas, modulos, CRM y facturacion."
        accent="cyan"
      />

      <section className="grid gap-3 md:grid-cols-4">
        <StatCard label="Eventos" value={logs.length.toString()} detail="Registros visibles" tone="info" />
        <StatCard label="Info" value={logs.filter((log) => log.severity === "info").length.toString()} detail="Acciones normales" tone="success" />
        <StatCard label="Warning" value={logs.filter((log) => log.severity === "warning").length.toString()} detail="Cambios sensibles" tone="warning" />
        <StatCard label="Criticos" value={logs.filter((log) => log.severity === "critical").length.toString()} detail="Requieren seguimiento" tone="danger" />
      </section>

      <TableCard title="Bitacora central" description="Historial del producto y su operacion comercial.">
        <DataExportToolbar
          title="auditoria-apli-smart-motors"
          columns={exportColumns}
          rows={exportRows}
          accent="cyan"
          searchValue={query}
          onSearchChange={setQuery}
          searchPlaceholder="Buscar en logs"
        />

        {filteredLogs.length === 0 ? (
          <EmptyState title="Sin eventos" description="No hay registros para el filtro aplicado." />
        ) : (
          <Table minWidth="min-w-[1080px]">
            <TableHead>
              <tr>
                {exportColumns.map((column) => (
                  <th key={column.key} className="px-4 py-3 font-semibold">
                    {column.label}
                  </th>
                ))}
              </tr>
            </TableHead>
            <TableBody>
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3.5">{log.at}</td>
                  <td className="px-4 py-3.5 font-semibold text-neutral-950">{log.actor}</td>
                  <td className="px-4 py-3.5">{log.entity}</td>
                  <td className="px-4 py-3.5">{log.action}</td>
                  <td className="px-4 py-3.5 text-neutral-700">{log.detail}</td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                        log.severity === "critical"
                          ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                          : log.severity === "warning"
                            ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                            : "bg-sky-50 text-sky-700 ring-1 ring-sky-200"
                      }`}
                    >
                      {log.severity}
                    </span>
                  </td>
                </tr>
              ))}
            </TableBody>
          </Table>
        )}
      </TableCard>
    </div>
  );
}

