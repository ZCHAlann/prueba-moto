"use client";

import { useMemo, useState } from "react";
import { useFeedback } from "@/components/providers/feedback-provider";
import { useSites } from "@/hooks/useSites";
import { useAssets } from "@/hooks/useAssets";
import { useDrivers } from "@/hooks/useDrivers";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import {
  DataExportToolbar,
  type ExportColumn,
  type ExportRow,
} from "@/components/ui/data-export-toolbar";
import { InputField, SelectField, TextareaField } from "@/components/ui/form-controls";
import { EmptyState, StatCard, SurfaceCard } from "@/components/ui/surface";
import { StatusPill } from "@/components/ui/status-pill";
import { Table, TableBody, TableCard, TableHead } from "@/components/ui/table";
import { ModulePageHeader } from "@/features/modules/module-page-header";
import type { OperationalSite, SiteStatus } from "@/types/fleet";

type SiteFormState = Omit<OperationalSite, "id" | "tenantId">;
type SiteFormErrors = Partial<Record<keyof SiteFormState, string>>;

const exportColumns: ExportColumn[] = [
  { key: "code", label: "Codigo" },
  { key: "name", label: "Sede" },
  { key: "city", label: "Ciudad" },
  { key: "address", label: "Direccion" },
  { key: "contact", label: "Contacto" },
  { key: "status", label: "Estado" },
  { key: "references", label: "Referencias" },
];

function createEmptyForm(): SiteFormState {
  return {
    code: "",
    name: "",
    city: "",
    address: "",
    contact: "",
    status: "Activa",
    notes: "",
  };
}

function validateSite(form: SiteFormState) {
  const errors: SiteFormErrors = {};

  if (!form.code.trim()) errors.code = "El codigo de sede es obligatorio.";
  if (!form.name.trim()) errors.name = "El nombre de la sede es obligatorio.";
  if (!form.city.trim()) errors.city = "La ciudad es obligatoria.";
  if (!form.address.trim()) errors.address = "La direccion es obligatoria.";
  if (!form.contact.trim()) errors.contact = "El contacto visible es obligatorio.";

  return errors;
}

export function SitesManagementPage() {
  const { confirmAction, notifyError } = useFeedback();

  // Nuevo backend
  const { sites, loading, createSite, updateSite } = useSites();

  // Assets y drivers siguen en FleetOps hasta que migren
  const { assets } = useAssets();
  const { drivers } = useDrivers();
  const { session } = useAuth();
  const can = (permission: string) => {
    const adminRoles = ["owner_empresa", "admin_empresa", "superadmin"];
    if (permission === "settings.manage") return adminRoles.includes(session?.role ?? "");
    return false;
  };
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SiteFormState>(() => createEmptyForm());
  const [errors, setErrors] = useState<SiteFormErrors>({});

  const rows = useMemo(() => {
    return sites
      .map((site) => {
        const assetCount = assets.filter((asset) => asset.site === site.name).length;
        const driverCount = drivers.filter((driver) => driver.site === site.name).length;
        return {
          ...site,
          references: assetCount + driverCount,
          assetCount,
          driverCount,
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [assets, drivers, sites]);

  const filteredRows = useMemo(() => {
    const value = query.trim().toLowerCase();
    return rows.filter((site) => {
      return (
        value.length === 0 ||
        site.code.toLowerCase().includes(value) ||
        site.name.toLowerCase().includes(value) ||
        site.city.toLowerCase().includes(value) ||
        site.address.toLowerCase().includes(value) ||
        site.contact.toLowerCase().includes(value)
      );
    });
  }, [query, rows]);

  const exportRows = filteredRows.map<ExportRow>((site) => ({
    code: site.code,
    name: site.name,
    city: site.city,
    address: site.address,
    contact: site.contact,
    status: site.status,
    references: `${site.references} referencias`,
  }));

  const resetForm = () => {
    setEditingId(null);
    setErrors({});
    setForm(createEmptyForm());
  };

  const hasManagePermission = can("settings.manage");

  if (loading) {
    return (
      <div className="space-y-4">
        <ModulePageHeader
          badge="Gestion"
          title="Sedes"
          subtitle="Catalogo operativo real para crear, revisar e inactivar sedes sin depender de listas hardcodeadas."
          accent="sky"
        />
        <SurfaceCard className="p-6">
          <p className="text-sm text-neutral-500">Cargando sedes...</p>
        </SurfaceCard>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ModulePageHeader
        badge="Gestion"
        title="Sedes"
        subtitle="Catalogo operativo real para crear, revisar e inactivar sedes sin depender de listas hardcodeadas."
        accent="sky"
      />

      <section className="grid gap-3 md:grid-cols-4">
        <StatCard label="Sedes" value={sites.length.toString()} detail="Catalogo actual" tone="info" />
        <StatCard
          label="Activas"
          value={sites.filter((site) => site.status === "Activa").length.toString()}
          detail="Disponibles en formularios"
          tone="success"
        />
        <StatCard
          label="Inactivas"
          value={sites.filter((site) => site.status === "Inactiva").length.toString()}
          detail="Fuera de alta nueva"
          tone="warning"
        />
        <StatCard
          label="Referencias"
          value={rows.reduce((total, site) => total + site.references, 0).toString()}
          detail="Flota y conductores vinculados"
          tone="neutral"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <SurfaceCard className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-neutral-950">
                {editingId ? "Editar sede" : "Nueva sede"}
              </h2>
              <p className="mt-1 text-sm text-neutral-500">
                Base visible para usuarios, flotas y conductores.
              </p>
            </div>
            {editingId ? (
              <Button tone="neutral" variant="outline" className="px-3 py-2" onClick={resetForm}>
                Cancelar
              </Button>
            ) : null}
          </div>

          {!hasManagePermission ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
              Solo perfiles administradores pueden crear o editar sedes. El catalogo sigue visible para consulta.
            </div>
          ) : null}

          <form
            className="mt-4 space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();

              if (!hasManagePermission) {
                notifyError("Sin permiso", "El rol actual no puede modificar el catalogo de sedes.");
                return;
              }

              const nextErrors = validateSite(form);
              setErrors(nextErrors);

              if (Object.keys(nextErrors).length > 0) {
                notifyError("Formulario incompleto", "Completa la ficha de la sede antes de guardarla.");
                return;
              }

              const confirmed = await confirmAction({
                title: editingId ? "Guardar sede" : "Crear sede",
                description:
                  "La sede quedara disponible para formularios operativos y control de asignaciones.",
                confirmLabel: editingId ? "Guardar cambios" : "Crear sede",
                accent: "sky",
                successTitle: editingId ? "Sede actualizada" : "Sede creada",
                successDescription: "El catalogo operativo ya refleja el cambio.",
                summary: [
                  { label: "Codigo", value: form.code },
                  { label: "Sede", value: form.name },
                  { label: "Ciudad", value: form.city },
                  { label: "Estado", value: form.status },
                ],
                action: async () => {
                  if (editingId) {
                    await updateSite(editingId, form);
                  } else {
                    await createSite(form);
                  }
                },
              });

              if (!confirmed) return;

              resetForm();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <InputField
                label="Codigo"
                value={form.code}
                onChange={(value) => setForm((current) => ({ ...current, code: value.toUpperCase() }))}
                accent="sky"
                error={errors.code}
                placeholder="SEDE-001"
              />
              <SelectField
                label="Estado"
                value={form.status}
                onChange={(value) =>
                  setForm((current) => ({ ...current, status: value as SiteStatus }))
                }
                accent="sky"
                options={[
                  { value: "Activa", label: "Activa" },
                  { value: "Inactiva", label: "Inactiva" },
                ]}
              />
            </div>

            <InputField
              label="Nombre de sede"
              value={form.name}
              onChange={(value) => setForm((current) => ({ ...current, name: value }))}
              accent="sky"
              error={errors.name}
              placeholder="Nombre de la sede principal"
            />
            <InputField
              label="Ciudad / Localidad"
              value={form.city}
              onChange={(value) => setForm((current) => ({ ...current, city: value }))}
              accent="sky"
              error={errors.city}
              placeholder="Ciudad, municipio o zona operativa"
            />
            <InputField
              label="Direccion"
              value={form.address}
              onChange={(value) => setForm((current) => ({ ...current, address: value }))}
              accent="sky"
              error={errors.address}
              placeholder="Direccion completa o referencia de ubicacion"
            />
            <InputField
              label="Contacto visible"
              value={form.contact}
              onChange={(value) => setForm((current) => ({ ...current, contact: value }))}
              accent="sky"
              error={errors.contact}
              placeholder="Contacto responsable / telefono"
            />
            <TextareaField
              label="Notas"
              value={form.notes}
              onChange={(value) => setForm((current) => ({ ...current, notes: value }))}
              accent="sky"
              rows={3}
              placeholder="Cobertura, tipo de operacion o consideraciones para esta sede."
            />

            <div className="flex justify-end">
              <Button
                type="submit"
                tone="sky"
                variant="solid"
                disabled={!hasManagePermission}
              >
                {editingId ? "Guardar sede" : "Crear sede"}
              </Button>
            </div>
          </form>
        </SurfaceCard>

        <TableCard
          title="Catalogo de sedes"
          description="Vista compacta con direccion, contacto y referencias operativas por sede."
        >
          <DataExportToolbar
            title="sedes-apli-smart-motors"
            columns={exportColumns}
            rows={exportRows}
            accent="sky"
            searchValue={query}
            onSearchChange={setQuery}
            searchPlaceholder="Buscar por codigo, sede, ciudad o contacto"
          />

          {filteredRows.length === 0 ? (
            <EmptyState
              title="Sin sedes"
              description="Todavia no hay sedes registradas en esta empresa."
            />
          ) : (
            <Table minWidth="min-w-[1080px]">
              <TableHead>
                <tr>
                  <th className="px-4 py-3 font-semibold">Codigo</th>
                  <th className="px-4 py-3 font-semibold">Sede</th>
                  <th className="px-4 py-3 font-semibold">Contacto</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Referencias</th>
                  <th className="px-4 py-3 font-semibold">Acciones</th>
                </tr>
              </TableHead>
              <TableBody>
                {filteredRows.map((site) => (
                  <tr key={site.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3.5 font-semibold text-neutral-950">{site.code}</td>
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-neutral-950">{site.name}</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {site.city} / {site.address}
                      </p>
                    </td>
                    <td className="px-4 py-3.5">{site.contact}</td>
                    <td className="px-4 py-3.5">
                      <StatusPill
                        label={site.status}
                        tone={site.status === "Activa" ? "success" : "warning"}
                      />
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-neutral-950">{site.references}</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {site.assetCount} flota / {site.driverCount} conductores
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          tone="sky"
                          variant="outline"
                          className="px-3 py-1.5 text-xs"
                          onClick={() => {
                            setEditingId(site.id);
                            setErrors({});
                            setForm({
                              code: site.code,
                              name: site.name,
                              city: site.city,
                              address: site.address,
                              contact: site.contact,
                              status: site.status,
                              notes: site.notes,
                            });
                          }}
                        >
                          Editar
                        </Button>
                        <Button
                          tone={site.status === "Activa" ? "orange" : "teal"}
                          variant="outline"
                          className="px-3 py-1.5 text-xs"
                          disabled={!hasManagePermission}
                          onClick={async () => {
                            if (!hasManagePermission) {
                              notifyError("Sin permiso", "El rol actual no puede cambiar el estado de la sede.");
                              return;
                            }

                            const nextStatus: SiteStatus =
                              site.status === "Activa" ? "Inactiva" : "Activa";

                            await confirmAction({
                              title: nextStatus === "Activa" ? "Reactivar sede" : "Inactivar sede",
                              description:
                                nextStatus === "Activa"
                                  ? "La sede volvera a estar disponible en formularios nuevos."
                                  : "La sede dejara de aparecer como opcion nueva, pero conservara su historial.",
                              confirmLabel: nextStatus === "Activa" ? "Reactivar" : "Inactivar",
                              accent: "sky",
                              successTitle: nextStatus === "Activa" ? "Sede reactivada" : "Sede inactivada",
                              successDescription: "El catalogo ya refleja el nuevo estado operativo.",
                              summary: [
                                { label: "Sede", value: site.name },
                                { label: "Ciudad", value: site.city },
                                { label: "Referencias", value: `${site.references}` },
                                { label: "Nuevo estado", value: nextStatus },
                              ],
                              action: async () => {
                                await updateSite(site.id, {
                                  code: site.code,
                                  name: site.name,
                                  city: site.city,
                                  address: site.address,
                                  contact: site.contact,
                                  status: nextStatus,
                                  notes: site.notes,
                                });
                              },
                            });
                          }}
                        >
                          {site.status === "Activa" ? "Inactivar" : "Reactivar"}
                        </Button>
                      </div>
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