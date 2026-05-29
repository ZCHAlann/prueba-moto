"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useFeedback } from "@/components/providers/feedback-provider";
import { useAssets } from "@/hooks/useAssets";
import { useSites } from "@/hooks/useSites";
import { useDrivers } from "@/hooks/useDrivers";
import { ModulePageHeader } from "@/features/modules/module-page-header";
import {
  buildVehiclePayload,
  getVehicleFormValues,
  validateVehicle,
  VehicleForm,
  type VehicleFormErrors,
} from "@/features/flotas/vehicle-form";

type VehicleFormPageProps = {
  mode: "create" | "edit";
  vehicleId?: string;
};

export function VehicleFormPage({ mode, vehicleId }: VehicleFormPageProps) {
  const router = useRouter();
  const { assets, createAsset, updateAsset } = useAssets();
  const { sites } = useSites();
  const { drivers } = useDrivers();
  const { confirmAction, notifyError } = useFeedback();

  const vehicle = useMemo(
    () => assets.find((item) => item.id === vehicleId),
    [assets, vehicleId]
  );

  const [values, setValues] = useState(() => getVehicleFormValues(vehicle));
  const [errors, setErrors] = useState<VehicleFormErrors>({});
  const siteOptions = useMemo(() => {
    const activeSites = sites.filter((site) => site.status === "Activa").map((site) => site.name);
    if (values.site && !activeSites.includes(values.site)) {
      activeSites.push(values.site);
    }
    return activeSites;
  }, [sites, values.site]);

  const effectiveValues = useMemo(
    () => ({
      ...values,
      site: values.site || siteOptions[0] || "",
      responsible: values.responsible || drivers.find((driver) => driver.status === "Activo")?.name || "",
    }),
    [drivers, siteOptions, values]
  );
  const responsibleOptions = useMemo(
    () => drivers.filter((driver) => driver.status === "Activo").map((driver) => driver.name),
    [drivers]
  );

  const submit = async () => {
    const nextErrors = validateVehicle(effectiveValues);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      notifyError("Formulario incompleto", "Revisa los campos obligatorios del vehiculo antes de continuar.");
      return;
    }

    if (siteOptions.length === 0) {
      notifyError("Sin sedes activas", "Crea o reactiva una sede antes de guardar el vehiculo.");
      return;
    }

    const payload = buildVehiclePayload(effectiveValues, vehicle);

    await confirmAction({
      title: mode === "create" ? "Confirmar nuevo vehiculo" : "Confirmar actualizacion del vehiculo",
      description: mode === "create" ? "El vehiculo pasara a la base operativa de ApliSmart Motors." : "Se actualizaran los datos maestros y operativos del vehiculo.",
      confirmLabel: mode === "create" ? "Crear vehiculo" : "Guardar cambios",
      accent: "sky",
      successTitle: mode === "create" ? "Vehiculo creado" : "Vehiculo actualizado",
      successDescription: "La informacion del vehiculo ya quedo registrada.",
      summary: [
        { label: "Placa", value: effectiveValues.plate.toUpperCase() },
        { label: "Tipo", value: effectiveValues.category },
        { label: "Marca / modelo", value: `${effectiveValues.brand} ${effectiveValues.model}`.trim() },
        { label: "Estado", value: effectiveValues.status },
      ],
      action: async () => {
        const id = mode === "create" ? createAsset(payload) : (updateAsset(vehicleId ?? "", payload), vehicleId ?? "");
        router.push(`/flotas/${id}`);
      },
    });
  };

  return (
    <div className="space-y-4">
      <ModulePageHeader
        badge={mode === "create" ? "Nuevo vehiculo" : "Editar vehiculo"}
        title={mode === "create" ? "Alta de vehiculo" : `Editar ${vehicle?.plate ?? "vehiculo"}`}
        subtitle="Formulario especifico para flota vehicular, priorizando placa, configuracion tecnica y control operativo."
        accent="sky"
        action={
          <Link
            href="/gestion/sedes"
            className="rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-700 shadow-sm transition hover:border-sky-300 hover:text-sky-700"
          >
            Gestionar sedes
          </Link>
        }
      />

      <VehicleForm
        values={effectiveValues}
        errors={errors}
        siteOptions={siteOptions}
        responsibleOptions={responsibleOptions}
        submitLabel={mode === "create" ? "Crear vehiculo" : "Guardar cambios"}
        onChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))}
        onSubmit={submit}
      />
    </div>
  );
}
