"use client";

import { useMemo, useState } from "react";
import { useFeedback } from "@/components/providers/feedback-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { useAssets } from "@/hooks/useAssets";
import { useDrivers } from "@/hooks/useDrivers";
import { useAssignments } from "@/hooks/useAssignments";
import { Button } from "@/components/ui/button";
import { DataExportToolbar, type ExportColumn, type ExportRow } from "@/components/ui/data-export-toolbar";
import { InputField, SelectField, TextareaField } from "@/components/ui/form-controls";
import { ImageGalleryField } from "@/components/ui/image-gallery-field";
import { EmptyState, StatCard, SurfaceCard } from "@/components/ui/surface";
import { StatusPill } from "@/components/ui/status-pill";
import { Table, TableBody, TableCard, TableHead } from "@/components/ui/table";
import { ModulePageHeader } from "@/features/modules/module-page-header";

const exportColumns: ExportColumn[] = [
  { key: "driverCode", label: "Nro. Documento Conductor" },
  { key: "driver", label: "Conductor" },
  { key: "plate", label: "Nro. Placa" },
  { key: "unit", label: "Unidad" },
  { key: "assignedBy", label: "Asignado Realizada Por" },
  { key: "startDate", label: "Fecha Asignacion" },
  { key: "status", label: "Estado Asignacion" },
  { key: "handoverFileName", label: "Acta de Entrega" },
];

export function AssignmentsPage() {
  const { confirmAction, notifyError, notifySuccess } = useFeedback();

  // ── hooks nuevos ─────────────────────────────────────────────────────────────
  const { assets, loading: assetsLoading } = useAssets();
  const { drivers, loading: driversLoading } = useDrivers();
  const { assignments, loading: assignmentsLoading, createAssignment, finalizeAssignment } = useAssignments();

  // ── solo currentUser del provider viejo ─────────────────────────────────────
  const { session } = useAuth();
  const currentUser = { name: session?.name ?? "Sistema" };

  const loading = assetsLoading || driversLoading || assignmentsLoading;

  const [query, setQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({
    assetId: "",
    driverId: "",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: null as string | null,
    status: "Activa" as const,
    notes: "",
    handoverFileName: "",
  });

  const activeAssignments = useMemo(
    () => assignments.filter((a) => a.status === "Activa"),
    [assignments]
  );

  const availableAssets = useMemo(
    () => assets.filter((asset) => !activeAssignments.some((a) => a.assetId === asset.id)),
    [assets, activeAssignments]
  );

  const rows = useMemo(() => {
    return assignments
      .map((assignment) => {
        const asset = assets.find((a) => a.id === assignment.assetId);
        const driver = drivers.find((d) => d.id === assignment.driverId);
        return {
          ...assignment,
          driverCode: driver?.code ?? "Sin codigo",
          driver: driver?.name ?? "Sin conductor",
          plate: asset?.plate ?? assignment.assetId,
          unit: asset ? `${asset.brand} ${asset.model}` : assignment.assetId,
          assignedBy: currentUser.name,
        };
      })
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
  }, [assignments, assets, drivers, currentUser.name]);

  const filteredRows = useMemo(() => {
    const value = query.trim().toLowerCase();
    return rows.filter(
      (row) =>
        value.length === 0 ||
        row.driverCode.toLowerCase().includes(value) ||
        row.driver.toLowerCase().includes(value) ||
        row.plate.toLowerCase().includes(value) ||
        row.unit.toLowerCase().includes(value) ||
        row.handoverFileName.toLowerCase().includes(value)
    );
  }, [query, rows]);

  const openModal = () => {
    setForm({
      assetId: availableAssets[0]?.id ?? assets[0]?.id ?? "",
      driverId: drivers[0]?.id ?? "",
      startDate: new Date().toISOString().slice(0, 10),
      endDate: null,
      status: "Activa",
      notes: "",
      handoverFileName: "",
    });
    setIsModalOpen(true);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <ModulePageHeader badge="Asignaciones" title="Asignar vehiculo" subtitle="Cargando datos…" accent="cyan" />
        <div className="h-40 animate-pulse rounded-xl bg-neutral-100" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ModulePageHeader
        badge="Asignaciones"
        title="Asignar vehiculo"
        subtitle="Relaciona vehiculos con conductores, adjunta el acta de entrega y controla el cierre desde una sola tabla."
        accent="cyan"
      />

      <section className="grid gap-3 md:grid-cols-4">
        <StatCard label="Activas" value={activeAssignments.length.toString()} detail="Relaciones en curso" tone="info" />
        <StatCard label="Disponibles" value={availableAssets.length.toString()} detail="Vehiculos libres" tone="success" />
        <StatCard label="Con acta" value={assignments.filter((a) => a.handoverFileName).length.toString()} detail="Soporte PDF" tone="warning" />
        <StatCard label="Historial" value={assignments.length.toString()} detail="Base acumulada" tone="neutral" />
      </section>

      <TableCard title="Asignaciones de vehiculos a conductores" description="Vista principal con alta, seguimiento y finalizacion de relaciones activas.">
        <DataExportToolbar
          title="asignaciones-apli-smart-motors"
          columns={exportColumns}
          rows={filteredRows as ExportRow[]}
          accent="cyan"
          searchValue={query}
          onSearchChange={setQuery}
          searchPlaceholder="Buscar por documento, conductor, placa o acta"
          leadingContent={
            <Button tone="cyan" variant="solid" onClick={openModal} className="px-3 py-2">
              Asignar vehiculo
            </Button>
          }
        />

        {filteredRows.length === 0 ? (
          <EmptyState title="Sin asignaciones" description="No hay registros para el filtro aplicado." />
        ) : (
          <Table minWidth="min-w-[1180px]">
            <TableHead>
              <tr>
                <th className="px-4 py-3 font-semibold">#</th>
                <th className="px-4 py-3 font-semibold">Acciones</th>
                <th className="px-4 py-3 font-semibold">Documento conductor</th>
                <th className="px-4 py-3 font-semibold">Nro. Placa</th>
                <th className="px-4 py-3 font-semibold">Asignado por</th>
                <th className="px-4 py-3 font-semibold">Fecha asignacion</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold">Acta</th>
              </tr>
            </TableHead>
            <TableBody>
              {filteredRows.map((row, index) => (
                <tr key={row.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3.5">{index + 1}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        tone="cyan"
                        variant="outline"
                        className="px-2.5 py-2 text-xs"
                        onClick={() => notifySuccess("Acta localizada", row.handoverFileName || "Esta asignacion todavia no tiene acta adjunta.")}
                      >
                        Acta
                      </Button>
                      {row.status === "Activa" ? (
                        <Button
                          tone="neutral"
                          variant="outline"
                          className="px-2.5 py-2 text-xs"
                          onClick={async () => {
                            await confirmAction({
                              title: "Finalizar asignacion",
                              description: "La relacion dejara de estar activa y quedara registrada como historica.",
                              confirmLabel: "Finalizar",
                              accent: "cyan",
                              successTitle: "Asignacion finalizada",
                              successDescription: "La relacion ya salio del estado activo.",
                              summary: [
                                { label: "Placa", value: row.plate },
                                { label: "Conductor", value: row.driver },
                                { label: "Acta", value: row.handoverFileName || "Sin acta" },
                              ],
                              action: async () => {
                                await finalizeAssignment(row.id, new Date().toISOString().slice(0, 10));
                              },
                            });
                          }}
                        >
                          Finalizar
                        </Button>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="font-semibold text-neutral-950">{row.driverCode}</p>
                    <p className="mt-1 text-xs text-neutral-500">{row.driver}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="font-semibold text-neutral-950">{row.plate}</p>
                    <p className="mt-1 text-xs text-neutral-500">{row.unit}</p>
                  </td>
                  <td className="px-4 py-3.5">{row.assignedBy}</td>
                  <td className="px-4 py-3.5">{row.startDate}</td>
                  <td className="px-4 py-3.5">
                    <StatusPill label={row.status} tone={row.status === "Activa" ? "info" : "neutral"} />
                  </td>
                  <td className="px-4 py-3.5">{row.handoverFileName || "Sin acta"}</td>
                </tr>
              ))}
            </TableBody>
          </Table>
        )}
      </TableCard>

      {isModalOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-neutral-950/45 px-4 py-6 backdrop-blur-sm">
          <SurfaceCard className="w-full max-w-3xl overflow-hidden border-neutral-200">
            <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-5 py-4">
              <div>
                <h2 className="text-2xl font-bold text-neutral-950">Asignar vehiculo a conductor</h2>
                <p className="mt-1 text-sm text-neutral-500">Una sola ventana para seleccionar placa, conductor y acta de entrega.</p>
              </div>
              <button type="button" onClick={() => setIsModalOpen(false)} className="rounded-lg border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-600 transition hover:bg-neutral-50">
                Cerrar
              </button>
            </div>
            <form
              className="space-y-4 px-5 py-5"
              onSubmit={async (e) => {
                e.preventDefault();
                const selectedAsset = assets.find((a) => a.id === form.assetId);
                const selectedDriver = drivers.find((d) => d.id === form.driverId);
                const assetBusy = activeAssignments.some((a) => a.assetId === form.assetId);

                if (!selectedAsset || !selectedDriver) {
                  notifyError("Seleccion incompleta", "Debes elegir un vehiculo y un conductor validos.");
                  return;
                }
                if (!form.handoverFileName) {
                  notifyError("Acta requerida", "Adjunta el PDF del acta de entrega antes de confirmar.");
                  return;
                }
                if (assetBusy) {
                  notifyError("Vehiculo ya asignado", "Ese vehiculo ya tiene una asignacion activa.");
                  return;
                }

                await confirmAction({
                  title: "Confirmar asignacion",
                  description: "Se registrara la relacion operativa y el acta de entrega quedara visible en el historial.",
                  confirmLabel: "Confirmar asignacion",
                  accent: "cyan",
                  successTitle: "Asignacion creada",
                  successDescription: "La relacion operativa ya quedo registrada correctamente.",
                  summary: [
                    { label: "Vehiculo", value: `${selectedAsset.plate} / ${selectedAsset.brand} ${selectedAsset.model}` },
                    { label: "Conductor", value: selectedDriver.name },
                    { label: "Fecha", value: form.startDate },
                    { label: "Acta", value: form.handoverFileName },
                  ],
                  action: async () => {
                    await createAssignment(form);
                    setIsModalOpen(false);
                  },
                });
              }}
            >
              <div className="grid gap-4 md:grid-cols-3">
                <SelectField
                  label="Seleccione vehiculo"
                  value={form.assetId}
                  onChange={(v) => setForm((c) => ({ ...c, assetId: v }))}
                  accent="cyan"
                  options={(availableAssets.length ? availableAssets : assets).map((a) => ({ value: a.id, label: `${a.plate} / ${a.brand} ${a.model}` }))}
                />
                <SelectField
                  label="Seleccione conductor"
                  value={form.driverId}
                  onChange={(v) => setForm((c) => ({ ...c, driverId: v }))}
                  accent="cyan"
                  options={drivers.map((d) => ({ value: d.id, label: `${d.code} / ${d.name}` }))}
                />
                <InputField label="Fecha asignacion" type="date" value={form.startDate} onChange={(v) => setForm((c) => ({ ...c, startDate: v }))} accent="cyan" />
                <ImageGalleryField
                  label="Subir Acta de Entrega"
                  values={form.handoverFileName ? [form.handoverFileName] : []}
                  onChange={(urls) => setForm((c) => ({ ...c, handoverFileName: urls[0] ?? "" }))}
                  uploadEndpoint="assignment-photos"
                  maxFiles={1}
                  accent="cyan"
                  accept=".pdf,application/pdf,image/*"
                  hint="Sube el acta firmada (PDF o Imagen)."
                  className="md:col-span-3"
                />
                <TextareaField label="Observaciones" value={form.notes} onChange={(v) => setForm((c) => ({ ...c, notes: v }))} accent="cyan" rows={3} placeholder="Notas de entrega, condiciones de salida o novedades." className="md:col-span-3" />
              </div>
              <div className="flex items-center justify-end gap-3 border-t border-neutral-200 pt-4">
                <Button type="button" tone="neutral" variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                <Button type="submit" tone="cyan" variant="solid">Confirmar</Button>
              </div>
            </form>
          </SurfaceCard>
        </div>
      ) : null}
    </div>
  );
}