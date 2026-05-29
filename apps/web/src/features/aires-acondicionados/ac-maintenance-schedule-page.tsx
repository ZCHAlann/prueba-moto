"use client";

import { useAcUnits } from "@/hooks/useAcUnits";
import { ModulePageHeader } from "@/features/modules/module-page-header";
import { Table, TableBody, TableCard, TableHead } from "@/components/ui/table";
import { StatusPill } from "@/components/ui/status-pill";

function getUrgency(dateStr?: string) {
  if (!dateStr) return "Sin programar";
  const diffDays = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
  if (diffDays < 0) return "Atrasado";
  if (diffDays <= 15) return "Próximo a vencer";
  return "Al día";
}

export function AcMaintenanceSchedulePage() {
  const { units } = useAcUnits();

  const scheduledUnits = [...units].filter((u) => u.nextService).sort((a, b) => new Date(a.nextService!).getTime() - new Date(b.nextService!).getTime());
  const unscheduledUnits = units.filter((u) => !u.nextService);
  const allUnits = [...scheduledUnits, ...unscheduledUnits];

  return (
    <div className="space-y-6">
      <ModulePageHeader badge="A/C Pro" title="Mantenimientos de A/C" subtitle="Vista consolidada de próximos trabajos técnicos y mantenimientos preventivos." accent="cyan" />
      <TableCard title="Agenda de A/C" description="Tareas preventivas y fechas objetivo.">
        <Table minWidth="min-w-[900px]">
          <TableHead>
            <tr>
              <th className="px-5 py-3 font-semibold">Equipo</th>
              <th className="px-5 py-3 font-semibold">Sede</th>
              <th className="px-5 py-3 font-semibold">Último Mantenimiento</th>
              <th className="px-5 py-3 font-semibold">Próximo Mantenimiento</th>
              <th className="px-5 py-3 font-semibold">Estado de Agenda</th>
            </tr>
          </TableHead>
          <TableBody>
            {allUnits.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-neutral-500">No hay equipos registrados.</td></tr>
            )}
            {allUnits.map((item) => {
              const urgency = getUrgency(item.nextService);
              return (
                <tr key={item.id} className="hover:bg-neutral-50 dark:hover:bg-slate-800/50">
                  <td className="px-5 py-4 font-semibold text-neutral-950 dark:text-white">
                    {item.name}
                    <p className="text-xs text-neutral-500 font-normal">{item.code}</p>
                  </td>
                  <td className="px-5 py-4 text-sm">{item.site}</td>
                  <td className="px-5 py-4 text-sm">{item.lastService || "No registrado"}</td>
                  <td className="px-5 py-4 text-sm font-medium">{item.nextService || "No programado"}</td>
                  <td className="px-5 py-4">
                    <StatusPill label={urgency} tone={urgency === "Atrasado" ? "danger" : urgency === "Próximo a vencer" ? "warning" : urgency === "Sin programar" ? "neutral" : "success"} />
                  </td>
                </tr>
              );
            })}
          </TableBody>
        </Table>
      </TableCard>
    </div>
  );
}