"use client";

import { useMemo, useState } from "react";
import { useFeedback } from "@/components/providers/feedback-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { useAssets } from "@/hooks/useAssets";
import { useGarages } from "@/hooks/useGarages";
import { useCompanyUsers } from "@/hooks/useCompanyUsers";
import { Button } from "@/components/ui/button";
import { DataExportToolbar, type ExportColumn, type ExportRow } from "@/components/ui/data-export-toolbar";
import { InputField, SelectField, TextareaField } from "@/components/ui/form-controls";
import { EmptyState, StatCard, SurfaceCard } from "@/components/ui/surface";
import { StatusPill } from "@/components/ui/status-pill";
import { Table, TableBody, TableCard, TableHead } from "@/components/ui/table";
import { ModulePageHeader } from "@/features/modules/module-page-header";
import type { GarageRecord, GarageStatus } from "@/types/fleet";

type GarageForm = Omit<GarageRecord, "id" | "tenantId">;

const columns: ExportColumn[] = [
  { key: "code", label: "Código" },
  { key: "name", label: "Garaje" },
  { key: "location", label: "Ubicación" },
  { key: "capacity", label: "Capacidad" },
  { key: "supervisor", label: "Supervisor" },
  { key: "status", label: "Estado" },
  { key: "notes", label: "Notas" },
];

function emptyForm(): GarageForm {
  return { code: "", name: "", location: "", capacity: 0, supervisor: "", status: "Activo", notes: "" };
}

const ADMIN_ROLES = ["owner_empresa", "admin_empresa", "supervisor", "superadmin"];

export function GaragesPage() {
  const { confirmAction, notifyError } = useFeedback();
  const { session } = useAuth();
  const { assets } = useAssets();
  const { garages, createGarage, updateGarage } = useGarages();
  const { users } = useCompanyUsers();

  const [form, setForm] = useState<GarageForm>(() => emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // can("garages.manage") → lee el rol del JWT directamente
  const canManage = ADMIN_ROLES.includes(session?.role ?? "");

  const supervisorOptions = users
    .filter((user) => ["owner_empresa", "admin_empresa", "supervisor"].includes(user.role))
    .map((user) => ({
      value: user.name,
      label: `${user.name} — ${user.role === "supervisor" ? "Supervisor" : "Admin"}`,
    }));

  const rows = useMemo(() => {
    const value = query.trim().toLowerCase();
    return garages
      .map((garage) => ({
        ...garage,
        vehicleCount: assets.filter(
          (asset) => asset.location === garage.name || asset.site === garage.name
        ).length,
      }))
      .filter(
        (garage) =>
          !value ||
          garage.name.toLowerCase().includes(value) ||
          garage.location.toLowerCase().includes(value) ||
          garage.supervisor.toLowerCase().includes(value)
      );
  }, [assets, garages, query]);

  const exportRows = rows.map<ExportRow>((garage) => ({
    code: garage.code,
    name: garage.name,
    location: garage.location,
    capacity: garage.capacity,
    supervisor: garage.supervisor,
    status: garage.status,
    notes: garage.notes,
  }));

  const save = async () => {
    if (!canManage) {
      notifyError("Sin permiso", "Tu rol no puede modificar garajes.");
      return;
    }
    if (!form.code.trim() || !form.name.trim() || !form.location.trim() || !form.supervisor.trim()) {
      notifyError("Formulario incompleto", "Completa código, nombre, ubicación y supervisor.");
      return;
    }

    const confirmed = await confirmAction({
      title: editingId ? "Guardar garaje" : "Crear garaje",
      description: "El garaje quedará disponible para control de ubicación, capacidad y responsables.",
      confirmLabel: editingId ? "Guardar cambios" : "Crear garaje",
      accent: "sky",
      successTitle: editingId ? "Garaje actualizado" : "Garaje creado",
      successDescription: "El catálogo de garajes quedó actualizado.",
      summary: [
        { label: "Garaje", value: form.name },
        { label: "Ubicación", value: form.location },
        { label: "Supervisor", value: form.supervisor },
        { label: "Capacidad", value: `${form.capacity}` },
      ],
      action: async () => {
        if (editingId) {
          await updateGarage(editingId, form);
        } else {
          await createGarage(form);
        }
      },
    });

    if (confirmed) {
      setEditingId(null);
      setForm(emptyForm());
    }
  };

  return (
    <div className="space-y-4">
      <ModulePageHeader
        badge="Gestión"
        title="Garajes"
        subtitle="Controla dónde se guardan los vehículos, capacidad disponible y supervisor responsable."
        accent="sky"
      />

      <section className="grid gap-3 md:grid-cols-4">
        <StatCard label="Garajes" value={garages.length.toString()} detail="Base actual" tone="info" />
        <StatCard label="Activos" value={garages.filter((item) => item.status === "Activo").length.toString()} detail="Disponibles" tone="success" />
        <StatCard label="Capacidad" value={garages.reduce((total, item) => total + Number(item.capacity || 0), 0).toString()} detail="Espacios registrados" tone="neutral" />
        <StatCard label="Vehículos" value={assets.length.toString()} detail="Flota general" tone="warning" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        <SurfaceCard className="p-4">
          <h2 className="text-lg font-semibold text-neutral-950">{editingId ? "Editar garaje" : "Nuevo garaje"}</h2>
          <p className="mt-1 text-sm text-neutral-500">Registra patio, bodega, base o zona de resguardo vehicular.</p>
          <div className="mt-4 space-y-4">
            <InputField label="Código" value={form.code} onChange={(value) => setForm((current) => ({ ...current, code: value.toUpperCase() }))} accent="sky" placeholder="GAR-001" />
            <InputField label="Nombre del garaje" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} accent="sky" placeholder="Base principal de vehículos" />
            <InputField label="Ubicación" value={form.location} onChange={(value) => setForm((current) => ({ ...current, location: value }))} accent="sky" placeholder="Dirección, zona o referencia operativa" />
            <InputField label="Cantidad de vehículos" type="number" min="0" step="1" value={String(form.capacity)} onChange={(value) => setForm((current) => ({ ...current, capacity: Number(value || 0) }))} accent="sky" />
            <SelectField
              label="Supervisor a cargo"
              value={form.supervisor}
              onChange={(value) => setForm((current) => ({ ...current, supervisor: value }))}
              accent="sky"
              options={[{ value: "", label: "Selecciona supervisor" }, ...supervisorOptions]}
            />
            <SelectField
              label="Estado"
              value={form.status}
              onChange={(value) => setForm((current) => ({ ...current, status: value as GarageStatus }))}
              accent="sky"
              options={[{ value: "Activo", label: "Activo" }, { value: "Inactivo", label: "Inactivo" }]}
            />
            <TextareaField label="Notas" value={form.notes} onChange={(value) => setForm((current) => ({ ...current, notes: value }))} accent="sky" rows={3} placeholder="Horarios, restricciones, responsable de llaves o condiciones de seguridad." />
            <div className="flex justify-end gap-2">
              {editingId ? (
                <Button variant="outline" onClick={() => { setEditingId(null); setForm(emptyForm()); }}>
                  Cancelar
                </Button>
              ) : null}
              <Button tone="sky" disabled={!canManage} onClick={save}>
                {editingId ? "Guardar garaje" : "Crear garaje"}
              </Button>
            </div>
          </div>
        </SurfaceCard>

        <TableCard title="Catálogo de garajes" description="Ubicación, capacidad, supervisor y referencias de flota.">
          <DataExportToolbar title="Garajes" columns={columns} rows={exportRows} accent="sky" searchValue={query} onSearchChange={setQuery} searchPlaceholder="Buscar garaje, ubicación o supervisor" />
          {rows.length === 0 ? (
            <EmptyState title="Sin garajes" description="Crea el primer garaje para controlar dónde se guardan los vehículos." />
          ) : (
            <Table minWidth="min-w-[900px]">
              <TableHead>
                <tr>
                  <th className="px-4 py-3 font-semibold">Garaje</th>
                  <th className="px-4 py-3 font-semibold">Ubicación</th>
                  <th className="px-4 py-3 font-semibold">Supervisor</th>
                  <th className="px-4 py-3 font-semibold">Capacidad</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Acciones</th>
                </tr>
              </TableHead>
              <TableBody>
                {rows.map((garage) => (
                  <tr key={garage.id}>
                    <td className="px-4 py-3 font-semibold text-neutral-950">
                      {garage.name}
                      <p className="text-xs text-neutral-500">{garage.code}</p>
                    </td>
                    <td className="px-4 py-3">{garage.location}</td>
                    <td className="px-4 py-3">{garage.supervisor}</td>
                    <td className="px-4 py-3">{garage.vehicleCount} / {garage.capacity}</td>
                    <td className="px-4 py-3">
                      <StatusPill label={garage.status} tone={garage.status === "Activo" ? "success" : "warning"} />
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        tone="sky"
                        variant="outline"
                        className="px-3 py-1.5 text-xs"
                        onClick={() => {
                          setEditingId(garage.id);
                          setForm({
                            code: garage.code,
                            name: garage.name,
                            location: garage.location,
                            capacity: garage.capacity,
                            supervisor: garage.supervisor,
                            status: garage.status,
                            notes: garage.notes,
                          });
                        }}
                      >
                        Editar
                      </Button>
                    </td>
                  </tr>
                ))}
              </TableBody>
            </Table>
          )}
        </TableCard>
      </section>
    </div>
  );
}