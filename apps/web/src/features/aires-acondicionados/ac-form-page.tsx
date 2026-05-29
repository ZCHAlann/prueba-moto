"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFeedback } from "@/components/providers/feedback-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { useAcUnits } from "@/hooks/useAcUnits";
import { useSites } from "@/hooks/useSites";
import { useCompanyUsers } from "@/hooks/useCompanyUsers";
import { Button } from "@/components/ui/button";
import { InputField, SelectField, TextareaField } from "@/components/ui/form-controls";
import { ImageGalleryField } from "@/components/ui/image-gallery-field";
import { SurfaceCard } from "@/components/ui/surface";
import { ModulePageHeader } from "@/features/modules/module-page-header";
import type { AirConditioningStatus, AirConditioningType, AirConditioningUnit } from "@/types/fleet";

type AirForm = Omit<AirConditioningUnit, "id" | "tenantId">;

const ADMIN_ROLES = ["owner_empresa", "admin_empresa", "supervisor", "superadmin"];

function emptyForm(): AirForm {
  return {
    code: "", name: "", type: "Split", site: "", floor: "", area: "",
    serial: "", brand: "", model: "", capacityBtu: "", voltage: "", amperage: "",
    refrigerantType: "", installDate: "", technician: "", status: "Operativo",
    lastService: "", nextService: "", photoUrls: [], notes: "",
  };
}

export function AcFormPage({ mode, unitId }: { mode: "create" | "edit"; unitId?: string }) {
  const router = useRouter();
  const { confirmAction, notifyError } = useFeedback();
  const { session } = useAuth();
  const { units, createUnit, updateUnit } = useAcUnits();
  const { sites } = useSites();
  const { users } = useCompanyUsers();
  const [form, setForm] = useState<AirForm>(() => emptyForm());

  const canManage = ADMIN_ROLES.includes(session?.role ?? "");

  useEffect(() => {
    if (mode === "edit" && unitId) {
      const unit = units.find((u) => u.id === unitId);
      if (unit) {
        setForm(unit);
      } else if (units.length > 0) {
        router.push("/aires-acondicionados");
      }
    }
  }, [mode, unitId, units, router]);

  const technicianOptions = users
    .filter((u) => ["owner_empresa", "admin_empresa", "supervisor"].includes(u.role))
    .map((u) => u.name);

  const siteOptions = sites
    .filter((s) => s.status === "Activa")
    .map((s) => s.name);

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
      title: mode === "edit" ? "Guardar equipo A/C" : "Crear equipo A/C",
      description: "El equipo quedará relacionado con sede, responsable y mantenimientos.",
      confirmLabel: mode === "edit" ? "Guardar cambios" : "Crear equipo",
      accent: "cyan",
      successTitle: mode === "edit" ? "Equipo actualizado" : "Equipo creado",
      successDescription: "El inventario ha sido actualizado.",
      summary: [
        { label: "Equipo", value: form.name },
        { label: "Tipo", value: form.type },
        { label: "Sede", value: form.site },
      ],
      action: async () => {
        if (mode === "edit" && unitId) {
          await updateUnit(unitId, form);
        } else {
          await createUnit(form);
        }
      },
    });

    if (confirmed) {
      router.push("/aires-acondicionados");
    }
  };

  return (
    <div className="space-y-6">
      <ModulePageHeader
        badge="A/C Pro"
        title={mode === "edit" ? "Editar A/C" : "Nuevo A/C"}
        subtitle="Alta técnica y operativa del equipo."
        accent="cyan"
      />
      <SurfaceCard className="p-6 max-w-4xl">
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <InputField label="Código" value={form.code} onChange={(value) => setForm((c) => ({ ...c, code: value.toUpperCase() }))} accent="cyan" placeholder="AC-001" />
            <SelectField label="Estado" value={form.status} onChange={(value) => setForm((c) => ({ ...c, status: value as AirConditioningStatus }))} accent="cyan" options={[{ value: "Operativo", label: "Operativo" }, { value: "En revision", label: "En revisión" }, { value: "Pendiente revision", label: "Pendiente revisión" }, { value: "Fuera de servicio", label: "Fuera de servicio" }]} />
          </div>
          <InputField label="Nombre del equipo" value={form.name} onChange={(value) => setForm((c) => ({ ...c, name: value }))} accent="cyan" placeholder="Aire oficina principal" />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Tipo" value={form.type} onChange={(value) => setForm((c) => ({ ...c, type: value as AirConditioningType }))} accent="cyan" options={[{ value: "Split", label: "Split" }, { value: "Cassette", label: "Cassette" }, { value: "Central", label: "Central" }, { value: "Chiller", label: "Chiller" }, { value: "Fan-coil", label: "Fan-coil" }, { value: "Ventana", label: "Ventana" }, { value: "Otro", label: "Otro" }]} />
            <SelectField label="Sede" value={form.site} onChange={(value) => setForm((c) => ({ ...c, site: value }))} accent="cyan" options={[{ value: "", label: "Selecciona sede" }, ...siteOptions.map((s) => ({ value: s, label: s }))]} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <InputField label="Piso/Nivel" value={form.floor} onChange={(value) => setForm((c) => ({ ...c, floor: value }))} accent="cyan" placeholder="Ej. Piso 2" />
            <InputField label="Área Exacta" value={form.area} onChange={(value) => setForm((c) => ({ ...c, area: value }))} accent="cyan" placeholder="Sala de Juntas" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <InputField label="Marca" value={form.brand} onChange={(value) => setForm((c) => ({ ...c, brand: value }))} accent="cyan" />
            <InputField label="Modelo" value={form.model} onChange={(value) => setForm((c) => ({ ...c, model: value }))} accent="cyan" />
            <InputField label="No. de Serie" value={form.serial} onChange={(value) => setForm((c) => ({ ...c, serial: value }))} accent="cyan" />
            <InputField label="Capacidad (BTU/TR)" value={form.capacityBtu} onChange={(value) => setForm((c) => ({ ...c, capacityBtu: value }))} accent="cyan" />
            <InputField label="Voltaje" value={form.voltage} onChange={(value) => setForm((c) => ({ ...c, voltage: value }))} accent="cyan" placeholder="Ej. 220V" />
            <InputField label="Refrigerante" value={form.refrigerantType} onChange={(value) => setForm((c) => ({ ...c, refrigerantType: value }))} accent="cyan" placeholder="R-410A" />
          </div>
          <SelectField
            label="Técnico A/C"
            value={form.technician}
            onChange={(value) => setForm((c) => ({ ...c, technician: value }))}
            accent="cyan"
            options={[{ value: "", label: "Selecciona técnico" }, ...technicianOptions.map((name) => ({ value: name, label: name }))]}
          />
          <TextareaField label="Notas" value={form.notes} onChange={(value) => setForm((c) => ({ ...c, notes: value }))} accent="cyan" rows={3} />
          <ImageGalleryField
            label="Fotos del equipo"
            values={form.photoUrls}
            onChange={(urls) => setForm((c) => ({ ...c, photoUrls: urls }))}
            uploadEndpoint="ac-photos"
            maxFiles={6}
            accent="cyan"
            hint="Sube fotos de la unidad interior, exterior o placas técnicas."
          />
          <div className="flex justify-end gap-3 pt-4 border-t border-neutral-100 dark:border-slate-800">
            <Button variant="outline" type="button" onClick={() => router.push("/aires-acondicionados")}>Cancelar</Button>
            <Button tone="cyan" disabled={!canManage} onClick={save}>
              {mode === "edit" ? "Guardar cambios" : "Crear equipo"}
            </Button>
          </div>
        </div>
      </SurfaceCard>
    </div>
  );
}