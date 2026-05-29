"use client";

import { useAcUnits } from "@/hooks/useAcUnits";
import { ModulePageHeader } from "@/features/modules/module-page-header";
import { Table, TableBody, TableCard, TableHead } from "@/components/ui/table";

export function AcHistoryPage() {
  const { units, services, refrigerantLogs } = useAcUnits();

  const getUnit = (id: string) => units.find((u) => u.id === id);

  const history = [
    ...services.map((s) => {
      const unit = getUnit(s.unitId);
      return {
        id: s.id,
        date: s.date,
        unitName: unit?.name ?? "Desconocido",
        unitCode: unit?.code ?? "N/A",
        type: s.kind,
        detail: s.findings || "Servicio técnico realizado.",
        technician: s.technician,
        costOrQuantity: s.cost || "-",
        isRefrigerant: false,
      };
    }),
    ...refrigerantLogs.map((l) => {
      const unit = getUnit(l.unitId);
      return {
        id: l.id,
        date: l.date,
        unitName: unit?.name ?? "Desconocido",
        unitCode: unit?.code ?? "N/A",
        type: `Recarga (${l.refrigerantType})`,
        detail: l.reason || "Carga de refrigerante.",
        technician: l.technician,
        costOrQuantity: `+${l.quantity} ${l.unit}`,
        isRefrigerant: true,
      };
    }),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="space-y-6">
      <ModulePageHeader badge="A/C Pro" title="Historial de A/C" subtitle="Eventos técnicos recientes, servicios y recargas para todos los equipos." accent="cyan" />
      <TableCard title="Trazabilidad y Eventos" description="Registro consolidado de todas las intervenciones técnicas.">
        <Table minWidth="min-w-[900px]">
          <TableHead>
            <tr>
              <th className="px-5 py-3 font-semibold">Fecha</th>
              <th className="px-5 py-3 font-semibold">Equipo</th>
              <th className="px-5 py-3 font-semibold">Tipo</th>
              <th className="px-5 py-3 font-semibold">Detalle del Trabajo</th>
              <th className="px-5 py-3 font-semibold">Técnico</th>
              <th className="px-5 py-3 font-semibold text-right">Cantidad / Costo</th>
            </tr>
          </TableHead>
          <TableBody>
            {history.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-neutral-500">No hay eventos registrados en el historial.</td></tr>
            )}
            {history.map((item) => (
              <tr key={item.id} className="hover:bg-neutral-50 dark:hover:bg-slate-800/50">
                <td className="px-5 py-4 text-sm text-neutral-700 dark:text-slate-300">{item.date}</td>
                <td className="px-5 py-4">
                  <p className="font-semibold text-neutral-900 dark:text-white">{item.unitName}</p>
                  <p className="text-xs text-neutral-500 dark:text-slate-400">{item.unitCode}</p>
                </td>
                <td className="px-5 py-4">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${item.isRefrigerant ? "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300" : "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/50 dark:text-cyan-300"}`}>
                    {item.type}
                  </span>
                </td>
                <td className="px-5 py-4 text-sm text-neutral-700 dark:text-slate-300">{item.detail}</td>
                <td className="px-5 py-4 text-sm text-neutral-700 dark:text-slate-300">{item.technician}</td>
                <td className={`px-5 py-4 text-sm font-semibold text-right ${item.isRefrigerant ? "text-sky-600 dark:text-sky-400" : "text-neutral-900 dark:text-white"}`}>
                  {item.costOrQuantity}
                </td>
              </tr>
            ))}
          </TableBody>
        </Table>
      </TableCard>
    </div>
  );
}