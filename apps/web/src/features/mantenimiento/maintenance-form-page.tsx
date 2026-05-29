"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFeedback } from "@/components/providers/feedback-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { useAssets } from "@/hooks/useAssets";
import { useDrivers } from "@/hooks/useDrivers";
import { useMaintenances, type MaintenanceKind, type MaintenancePriority, type MaintenanceStatus } from "@/hooks/useMaintenances";
import { Button } from "@/components/ui/button";
import { InputField, SelectField, TextareaField } from "@/components/ui/form-controls";
import { ImageGalleryField } from "@/components/ui/image-gallery-field";
import { SurfaceCard } from "@/components/ui/surface";
import { ModulePageHeader } from "@/features/modules/module-page-header";
import { useCompanyUsers } from "@/hooks/useCompanyUsers";

type MaintenanceFormPageProps = {
  mode: "create" | "edit";
  maintenanceId?: string;
};

export function MaintenanceFormPage({ mode, maintenanceId }: MaintenanceFormPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { confirmAction } = useFeedback();
  const { session } = useAuth();

  // ── hooks nuevos ─────────────────────────────────────────────────────────────
  const { assets, loading: assetsLoading } = useAssets();
  const { drivers, loading: driversLoading } = useDrivers();
  const { maintenances, loading: maintenancesLoading, createMaintenance, updateMaintenance } = useMaintenances();

  // ── users sigue en FleetOps hasta el Día- 5 ──────────────────────────────────
  const { users } = useCompanyUsers();

  const record = maintenances.find((item) => item.id === maintenanceId);
  const presetAssetId = searchParams.get("assetId");
  const companyId = session?.companyId ?? "";

  const [form, setForm] = useState({
    assetId: record?.assetId ?? presetAssetId ?? assets[0]?.id ?? "",
    title: record?.title ?? "",
    kind: (record?.kind ?? "Preventivo") as MaintenanceKind,
    priority: (record?.priority ?? "Programado") as MaintenancePriority,
    status: (record?.status ?? "Pendiente") as MaintenanceStatus,
    scheduledDate: record?.scheduledDate ?? "",
    dueDate: record?.dueDate ?? "",
    completedDate: record?.completedDate ?? null as string | null,
    responsible: record?.responsible ?? "",
    photoNames: record?.photoNames ?? ([] as string[]),
    notes: record?.notes ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isEmergency = form.priority === "Emergente";

  const responsibleOptions = [
    { value: "", label: "Selecciona responsable" },
    ...drivers.map((d) => ({ value: d.name, label: `${d.name} — Conductor` })),
    ...users
      .filter((u) => ["admin_empresa", "supervisor", "operador"].includes(u.role))
      .map((u) => ({
        value: u.name,
        label: `${u.name} — ${u.role === "supervisor" ? "Supervisor" : u.role === "operador" ? "Técnico" : "Admin"}`,
      })),
  ];

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.assetId) next.assetId = "Debes seleccionar un vehiculo.";
    if (!form.title.trim()) next.title = "El trabajo es obligatorio.";
    if (!form.scheduledDate.trim()) next.scheduledDate = "La fecha programada es obligatoria.";
    if (!form.dueDate.trim()) next.dueDate = "La fecha limite es obligatoria.";
    if (!form.responsible.trim()) next.responsible = "El responsable es obligatorio.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const loading = assetsLoading || driversLoading || maintenancesLoading;

  if (loading) {
    return (
      <div className="space-y-6">
        <ModulePageHeader
          badge={mode === "create" ? "Alta técnica" : "Edición técnica"}
          title="Cargando…"
          subtitle=""
          accent="amber"
        />
        <div className="h-40 animate-pulse rounded-xl bg-neutral-100" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ModulePageHeader
        badge={mode === "create" ? "Alta técnica" : "Edición técnica"}
        title={mode === "create" ? "Nuevo mantenimiento" : "Editar mantenimiento"}
        subtitle="Orden técnica con validación, confirmación previa y resultado visible."
        accent="amber"
        action={
          <Link
            href="/mantenimiento"
            className="rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-700 shadow-sm transition hover:border-amber-300 hover:text-amber-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            Volver
          </Link>
        }
      />

      {isEmergency && (
        <div className="rounded-xl border-2 border-rose-400 bg-rose-50 p-4 dark:border-rose-600 dark:bg-rose-950">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🚨</span>
            <div>
              <p className="font-bold text-rose-700 dark:text-rose-300">Mantenimiento Emergente</p>
              <p className="text-sm text-rose-600 dark:text-rose-400">
                Este mantenimiento fue originado por una situación de fuerza mayor. El vehículo quedó detenido en el momento del registro.
              </p>
            </div>
          </div>
        </div>
      )}

      <form
        className="space-y-6"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!validate()) return;

          const selectedAsset = assets.find((a) => a.id === form.assetId);

          await confirmAction({
            title: mode === "create" ? "Crear mantenimiento" : "Guardar cambios del mantenimiento",
            description:
              mode === "create"
                ? "Se registrará una nueva orden técnica y quedará disponible para seguimiento operativo."
                : "Se actualizará la orden técnica actual en la base de la empresa activa.",
            confirmLabel: mode === "create" ? "Confirmar creación" : "Confirmar actualización",
            accent: "amber",
            successTitle: mode === "create" ? "Mantenimiento creado" : "Mantenimiento actualizado",
            successDescription: "La orden técnica quedó registrada correctamente.",
            summary: [
              {
                label: "Vehículo",
                value: selectedAsset
                  ? `${selectedAsset.plate} / ${selectedAsset.brand} ${selectedAsset.model}`
                  : form.assetId,
              },
              { label: "Trabajo", value: form.title },
              { label: "Tipo", value: form.kind },
              { label: "Atención", value: form.priority },
              { label: "Estado", value: form.status },
              { label: "Responsable", value: form.responsible },
              { label: "Fotos", value: `${form.photoNames.length} foto(s)` },
            ],
            action: async () => {
              if (mode === "create") {
                await createMaintenance(form);
              } else if (maintenanceId) {
                await updateMaintenance(maintenanceId, form);
              }
              router.push("/mantenimiento");
            },
          });
        }}
      >
        <SurfaceCard className="p-5">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-neutral-950 dark:text-white">Orden técnica</h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-slate-400">
              Registra alcance, estado, fechas y responsable del trabajo.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SelectField
              label="Vehículo"
              value={form.assetId}
              onChange={(v) => setForm((c) => ({ ...c, assetId: v }))}
              accent="amber"
              error={errors.assetId}
              options={assets.map((a) => ({ value: a.id, label: `${a.code} / ${a.name}` }))}
            />
            <InputField
              label="Trabajo"
              value={form.title}
              onChange={(v) => setForm((c) => ({ ...c, title: v }))}
              accent="amber"
              error={errors.title}
            />
            <SelectField
              label="Tipo"
              value={form.kind}
              onChange={(v) => setForm((c) => ({ ...c, kind: v as MaintenanceKind }))}
              accent="amber"
              options={[
                { value: "Preventivo", label: "Preventivo" },
                { value: "Correctivo", label: "Correctivo" },
              ]}
            />
            <SelectField
              label="Atención"
              value={form.priority}
              onChange={(v) => setForm((c) => ({ ...c, priority: v as MaintenancePriority }))}
              accent="amber"
              options={[
                { value: "Programado", label: "Programado" },
                { value: "Emergente", label: "🚨 Emergente por fuerza mayor" },
              ]}
            />
            <SelectField
              label="Estado"
              value={form.status}
              onChange={(v) => setForm((c) => ({ ...c, status: v as MaintenanceStatus }))}
              accent="amber"
              options={[
                { value: "Pendiente", label: "Pendiente" },
                { value: "En proceso", label: "En proceso" },
                { value: "Completado", label: "Completado" },
              ]}
            />
            <InputField
              label="Fecha programada"
              type="date"
              value={form.scheduledDate}
              onChange={(v) => setForm((c) => ({ ...c, scheduledDate: v }))}
              accent="amber"
              error={errors.scheduledDate}
            />
            <InputField
              label="Fecha límite"
              type="date"
              value={form.dueDate}
              onChange={(v) => setForm((c) => ({ ...c, dueDate: v }))}
              accent="amber"
              error={errors.dueDate}
            />
            <InputField
              label="Fecha completado"
              type="date"
              value={form.completedDate ?? ""}
              onChange={(v) => setForm((c) => ({ ...c, completedDate: v || null }))}
              accent="amber"
            />
            <SelectField
              label="Responsable"
              value={form.responsible}
              onChange={(v) => setForm((c) => ({ ...c, responsible: v }))}
              accent="amber"
              error={errors.responsible}
              hint="Conductor, supervisor o técnico asignado."
              options={responsibleOptions}
            />
          </div>
        </SurfaceCard>

        <SurfaceCard className="p-5">
          <ImageGalleryField
            label="Evidencia fotográfica"
            values={form.photoNames}
            onChange={(urls) => setForm((c) => ({ ...c, photoNames: urls }))}
            uploadEndpoint="maintenance-photos"
            companyId={String(companyId)}
            maxFiles={10}
            accent="amber"
            hint="Sube fotos de las fallas, repuestos o reparaciones finalizadas."
          />
          <div className="mt-6">
            <TextareaField
              label="Notas técnicas"
              value={form.notes}
              onChange={(v) => setForm((c) => ({ ...c, notes: v }))}
              accent="amber"
              rows={5}
              placeholder="Detalle técnico, hallazgos, repuestos, aprobaciones o restricciones."
            />
          </div>
        </SurfaceCard>

        <div className="flex justify-end">
          <Button type="submit" tone="amber" variant="solid">
            {mode === "create" ? "Crear mantenimiento" : "Guardar cambios"}
          </Button>
        </div>
      </form>
    </div>
  );
}