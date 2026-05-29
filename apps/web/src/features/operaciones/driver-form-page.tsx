"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFeedback } from "@/components/providers/feedback-provider";
import { useDrivers } from "@/hooks/useDrivers";
import { useSites } from "@/hooks/useSites";
import { Button } from "@/components/ui/button";
import { InputField, SelectField, TextareaField } from "@/components/ui/form-controls";
import { SurfaceCard } from "@/components/ui/surface";
import { ModulePageHeader } from "@/features/modules/module-page-header";

type DriverFormPageProps = {
  mode: "create" | "edit";
  driverId?: string;
};

function buildSiteOptions(siteNames: string[], currentValue: string) {
  const options = [...siteNames];
  if (currentValue && !options.includes(currentValue)) options.push(currentValue);
  return options;
}

export function DriverFormPage({ mode, driverId }: DriverFormPageProps) {
  const router = useRouter();
  const { confirmAction, notifyError } = useFeedback();

  // ── hooks nuevos ─────────────────────────────────────────────────────────────
  const { drivers, loading: driversLoading, createDriver, updateDriver } = useDrivers();
  const { sites, loading: sitesLoading } = useSites();

  const driver = drivers.find((d) => d.id === driverId);
  const activeSites = sites.filter((s) => s.status === "Activa").map((s) => s.name);

  const [form, setForm] = useState({
    licenseNumber: driver?.licenseNumber ?? "",
    firstName: driver?.firstName ?? "",
    lastName: driver?.lastName ?? "",
    licenseType: driver?.licenseType ?? "Tipo C",
    licenseExpiry: driver?.licenseExpiry ?? "",
    licensePoints: driver?.licensePoints?.toString() ?? "30",
    email: driver?.email ?? "",
    phone: driver?.phone ?? "",
    site: driver?.site ?? activeSites[0] ?? "",
    status: driver?.status ?? "Activo",
    notes: driver?.notes ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const siteOptions = buildSiteOptions(activeSites, form.site);

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.licenseNumber.trim()) next.licenseNumber = "El numero de licencia es obligatorio.";
    if (!form.firstName.trim()) next.firstName = "Los nombres son obligatorios.";
    if (!form.lastName.trim()) next.lastName = "Los apellidos son obligatorios.";
    if (!form.licenseType.trim()) next.licenseType = "La licencia es obligatoria.";
    if (!form.licenseExpiry.trim()) next.licenseExpiry = "La vigencia es obligatoria.";
    if (!form.email.trim()) next.email = "El correo es obligatorio.";
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = "Ingresa un correo valido.";
    if (!form.phone.trim()) next.phone = "El telefono es obligatorio.";
    if (!form.site.trim()) next.site = "La sede es obligatoria.";
    const points = Number(form.licensePoints);
    if (!Number.isFinite(points) || points < 0 || points > 30) next.licensePoints = "Los puntos deben estar entre 0 y 30.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  if (driversLoading || sitesLoading) {
    return (
      <div className="space-y-4">
        <ModulePageHeader badge={mode === "create" ? "Alta de conductor" : "Edicion de conductor"} title="Cargando…" subtitle="" accent="cyan" />
        <div className="h-40 animate-pulse rounded-xl bg-neutral-100" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ModulePageHeader
        badge={mode === "create" ? "Alta de conductor" : "Edicion de conductor"}
        title={mode === "create" ? "Nuevo conductor" : `Editar ${driver?.name ?? "conductor"}`}
        subtitle="Formulario conectado al catalogo de sedes y al backend Express."
        accent="cyan"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/gestion/sedes" className="rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-700 shadow-sm transition hover:border-cyan-300 hover:text-cyan-700">
              Gestionar sedes
            </Link>
            <Link href="/operaciones/conductores" className="rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-700 shadow-sm transition hover:border-cyan-300 hover:text-cyan-700">
              Volver
            </Link>
          </div>
        }
      />

      {siteOptions.length === 0 ? (
        <SurfaceCard className="border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          Antes de crear conductores necesitas al menos una sede activa en Gestion / Sedes.
        </SurfaceCard>
      ) : null}

      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!validate()) return;
          if (siteOptions.length === 0) {
            notifyError("Sin sedes activas", "Crea o reactiva una sede antes de guardar el conductor.");
            return;
          }

          const fullName = `${form.firstName.trim()} ${form.lastName.trim()}`.trim();
          const payload = {
            code: form.licenseNumber.trim(),
            name: fullName,
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim(),
            licenseNumber: form.licenseNumber.trim(),
            licenseType: form.licenseType.trim(),
            licenseExpiry: form.licenseExpiry,
            licensePoints: Number(form.licensePoints),
            email: form.email.trim(),
            phone: form.phone.trim(),
            site: form.site,
            status: form.status as "Activo" | "Inactivo",
            notes: form.notes.trim(),
          };

          await confirmAction({
            title: mode === "create" ? "Crear conductor" : "Guardar cambios del conductor",
            description: mode === "create"
              ? "Se dara de alta al conductor y quedara disponible para asignaciones operativas."
              : "Se actualizara la ficha del conductor.",
            confirmLabel: mode === "create" ? "Confirmar alta" : "Confirmar actualizacion",
            accent: "cyan",
            successTitle: mode === "create" ? "Conductor creado" : "Conductor actualizado",
            successDescription: mode === "create"
              ? "El conductor ya puede participar en asignaciones."
              : "Los cambios del conductor quedaron guardados.",
            summary: [
              { label: "# licencia", value: form.licenseNumber },
              { label: "Nombre", value: fullName },
              { label: "Licencia", value: `${form.licenseType} / ${form.licenseExpiry}` },
              { label: "Puntos", value: form.licensePoints },
              { label: "Estado", value: form.status },
              { label: "Sede", value: form.site },
            ],
            action: async () => {
              if (mode === "create") {
                await createDriver(payload);
              } else if (driverId) {
                await updateDriver(driverId, payload);
              }
              router.push("/operaciones/conductores");
            },
          });
        }}
      >
        <SurfaceCard className="p-4">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-neutral-950">Ficha del conductor</h2>
            <p className="mt-1 text-sm text-neutral-500">Informacion base para asignacion, cumplimiento y seguimiento operativo.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <InputField label="# de licencia" value={form.licenseNumber} onChange={(v) => setForm((c) => ({ ...c, licenseNumber: v }))} accent="cyan" error={errors.licenseNumber} />
            <InputField label="Nombres" value={form.firstName} onChange={(v) => setForm((c) => ({ ...c, firstName: v }))} accent="cyan" error={errors.firstName} />
            <InputField label="Apellidos" value={form.lastName} onChange={(v) => setForm((c) => ({ ...c, lastName: v }))} accent="cyan" error={errors.lastName} />
            <InputField label="Tipo de licencia" value={form.licenseType} onChange={(v) => setForm((c) => ({ ...c, licenseType: v }))} accent="cyan" error={errors.licenseType} />
            <InputField label="Vigencia" type="date" value={form.licenseExpiry} onChange={(v) => setForm((c) => ({ ...c, licenseExpiry: v }))} accent="cyan" error={errors.licenseExpiry} />
            <InputField label="Puntos en licencia" type="number" value={form.licensePoints} onChange={(v) => setForm((c) => ({ ...c, licensePoints: v }))} accent="cyan" error={errors.licensePoints} hint="Valor referencial de 0 a 30 puntos." />
            <InputField label="Telefono" value={form.phone} onChange={(v) => setForm((c) => ({ ...c, phone: v }))} accent="cyan" error={errors.phone} />
            <InputField label="Correo" type="email" value={form.email} onChange={(v) => setForm((c) => ({ ...c, email: v }))} accent="cyan" error={errors.email} />
            <SelectField label="Sede" value={form.site} onChange={(v) => setForm((c) => ({ ...c, site: v }))} accent="cyan" error={errors.site} hint="Catalogo tomado desde Gestion / Sedes." options={siteOptions.map((s) => ({ value: s, label: s }))} />
            <SelectField label="Estado" value={form.status} onChange={(v) => setForm((c) => ({ ...c, status: v as "Activo" | "Inactivo" }))} accent="cyan" options={[{ value: "Activo", label: "Activo" }, { value: "Inactivo", label: "Inactivo" }]} />
          </div>
        </SurfaceCard>
        <SurfaceCard className="p-4">
          <TextareaField label="Notas" value={form.notes} onChange={(v) => setForm((c) => ({ ...c, notes: v }))} accent="cyan" rows={4} placeholder="Experiencia, restricciones, disponibilidad o consideraciones del conductor." />
        </SurfaceCard>
        <div className="flex justify-end">
          <Button type="submit" tone="cyan" variant="solid" disabled={siteOptions.length === 0}>
            {mode === "create" ? "Crear conductor" : "Guardar cambios"}
          </Button>
        </div>
      </form>
    </div>
  );
}