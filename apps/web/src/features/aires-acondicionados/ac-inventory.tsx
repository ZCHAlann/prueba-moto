"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useFeedback } from "@/components/providers/feedback-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { useAcUnits } from "@/hooks/useAcUnits";
import { useSites } from "@/hooks/useSites";
import { useCompanyUsers } from "@/hooks/useCompanyUsers";
import { Button } from "@/components/ui/button";
import { DataExportToolbar, type ExportColumn, type ExportRow } from "@/components/ui/data-export-toolbar";
import { InputField, SelectField, TextareaField } from "@/components/ui/form-controls";
import { EmptyState, SurfaceCard } from "@/components/ui/surface";
import { StatusPill } from "@/components/ui/status-pill";
import { Table, TableBody, TableCard, TableHead } from "@/components/ui/table";
import type { AirConditioningStatus, AirConditioningType, AirConditioningUnit } from "@/types/fleet";

type AirForm = Omit<AirConditioningUnit, "id" | "tenantId">;

const ADMIN_ROLES = ["owner_empresa", "admin_empresa", "supervisor", "superadmin"];

const columns: ExportColumn[] = [
  { key: "code", label: "Código" },
  { key: "name", label: "Equipo" },
  { key: "type", label: "Tipo" },
  { key: "site", label: "Sede" },
  { key: "brand", label: "Marca" },
  { key: "capacityBtu", label: "Capacidad" },
  { key: "refrigerantType", label: "Refrigerante" },
  { key: "technician", label: "Técnico" },
  { key: "status", label: "Estado" },
];

function emptyForm(): AirForm {
  return {
    code: "", name: "", type: "Split", site: "", floor: "", area: "",
    serial: "", brand: "", model: "", capacityBtu: "", voltage: "", amperage: "",
    refrigerantType: "", installDate: "", technician: "", status: "Operativo",
    lastService: "", nextService: "", photoUrls: [], notes: "",
  };
}

export function AcInventory({ onSelectUnit }: { onSelectUnit?: (id: string) => void }) {
  const router = useRouter();
  const { confirmAction, notifyError } = useFeedback();
  const { session } = useAuth();
  const { units, createUnit, updateUnit } = useAcUnits();
  const { sites } = useSites();
  const { users } = useCompanyUsers();
  const [form, setForm] = useState<AirForm>(() => emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const canManage = ADMIN_ROLES.includes(session?.role ?? "");

  const technicianOptions = users
    .filter((u) => ["owner_empresa", "admin_empresa", "supervisor"].includes(u.role))
    .map((u) => u.name);

  const siteOptions = sites
    .filter((s) => s.status === "Activa")
    .map((s) => s.name);

  const rows = useMemo(() => {
    const value = query.trim().toLowerCase();
    return units.filter(
      (unit) =>
        !value ||
        unit.name.toLowerCase().includes(value) ||
        unit.code.toLowerCase().includes(value) ||
        unit.site.toLowerCase().includes(value) ||
        unit.technician.toLowerCase().includes(value)
    );
  }, [units, query]);

  const exportRows = rows.map<ExportRow>((unit) => ({
    code: unit.code, name: unit.name, type: unit.type, site: unit.site,
    brand: unit.brand, capacityBtu: unit.capacityBtu,
    refrigerantType: unit.refrigerantType, technician: unit.technician, status: unit.status,
  }));

  const save = async () => {
    if (!canManage) {
      notifyError("Sin permiso", "Tu rol no puede modificar equipos de aire acondicionado.");
      return;
    }
    if (!form.code.trim() || !form.name.trim() || !form.site.trim() || !form.technician.trim()) {
      notifyError("Formulario incompleto", "Completa código, equipo, sede y técnico responsable.");
      return;
    }

    const confirmed = await confirmAction({
      title: editingId ? "Guardar equipo A/C" : "Crear equipo A/C",
      description: "El equipo quedará relacionado con sede, responsable y mantenimientos.",
      confirmLabel: editingId ? "Guardar cambios" : "Crear equipo",
      accent: "cyan",
      successTitle: editingId ? "Equipo actualizado" : "Equipo creado",
      successDescription: "El inventario ha sido actualizado.",
      summary: [
        { label: "Equipo", value: form.name },
        { label: "Tipo", value: form.type },
        { label: "Sede", value: form.site },
        { label: "Técnico", value: form.technician },
      ],
      action: async () => {
        if (editingId) {
          await updateUnit(editingId, form);
        } else {
          await createUnit(form);
        }
      },
    });

    if (confirmed) {
      setEditingId(null);
      setForm(emptyForm());
    }
  };

  return (
    <div className="space-y-6">
      <TableCard title="Inventario A/C" description="Equipos instalados, responsable, estado y ubicación.">
        <DataExportToolbar title="Aires acondicionados" columns={columns} rows={exportRows} accent="cyan" searchValue={query} onSearchChange={setQuery} searchPlaceholder="Buscar equipo, sede o técnico" />
        {rows.length === 0 ? (
          <EmptyState title="Sin equipos A/C" description="Registra el primer equipo para controlar mantenimientos y evidencias." />
        ) : (
          <Table minWidth="min-w-[1050px]">
            <TableHead>
              <tr>
                <th className="px-4 py-3 font-semibold">Equipo</th>
                <th className="px-4 py-3 font-semibold">Sede / Área</th>
                <th className="px-4 py-3 font-semibold">Técnico</th>
                <th className="px-4 py-3 font-semibold">Tipo</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold text-right">Acciones</th>
              </tr>
            </TableHead>
            <TableBody>
              {rows.map((unit) => (
                <tr key={unit.id} className="hover:bg-neutral-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3 font-semibold text-neutral-950 dark:text-white cursor-pointer" onClick={() => router.push(`/aires-acondicionados/${unit.id}`)}>
                    {unit.name}
                    <p className="text-xs font-normal text-neutral-500 dark:text-slate-400">{unit.code} / {unit.brand} {unit.model}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-neutral-700 dark:text-slate-300">
                    {unit.site}
                    <p className="text-xs text-neutral-500 dark:text-slate-400">{unit.floor ? `${unit.floor} - ` : ""}{unit.area}</p>
                  </td>
                  <td className="px-4 py-3 text-sm">{unit.technician}</td>
                  <td className="px-4 py-3 text-sm">{unit.type}</td>
                  <td className="px-4 py-3">
                    <StatusPill label={unit.status} tone={unit.status === "Operativo" ? "success" : unit.status === "Fuera de servicio" ? "danger" : "warning"} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button tone="cyan" variant="outline" className="px-3 py-1 text-xs" onClick={() => { setEditingId(unit.id); setForm({ code: unit.code, name: unit.name, type: unit.type, site: unit.site, floor: unit.floor, area: unit.area, serial: unit.serial, brand: unit.brand, model: unit.model, capacityBtu: unit.capacityBtu, voltage: unit.voltage, amperage: unit.amperage, refrigerantType: unit.refrigerantType, installDate: unit.installDate, technician: unit.technician, status: unit.status, lastService: unit.lastService, nextService: unit.nextService, photoUrls: unit.photoUrls, notes: unit.notes }); }}>Editar</Button>
                      <Button tone="cyan" variant="solid" className="px-3 py-1 text-xs" onClick={() => router.push(`/aires-acondicionados/${unit.id}`)}>Ver Ficha</Button>
                    </div>
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