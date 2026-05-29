"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useFeedback } from "@/components/providers/feedback-provider";
import { useAssets } from "@/hooks/useAssets";
import { useSites } from "@/hooks/useSites";
import { SurfaceCard } from "@/components/ui/surface";
import { AssetForm, type AssetFormValue } from "@/features/activos/asset-form";
import { ModulePageHeader } from "@/features/modules/module-page-header";
import { useDrivers } from "@/hooks/useDrivers";
import { useAuth } from "@/components/providers/auth-provider";

type AssetFormPageProps = {
  mode: "create" | "edit";
  assetId?: string;
};

const emptyAsset: AssetFormValue = {
  code: "",
  name: "",
  assetType: "Vehiculo",
  category: "Camion",
  status: "Operativo",
  site: "",
  responsible: "",
  brand: "",
  model: "",
  serial: "",
  plate: "",
  year: "",
  observations: "",
  location: "",
  utilization: "0%",
  nextMaintenance: "",
  lastInspection: "",
  alerts: 0,
  availability: "Disponible",
  color: "",
  maxLoad: "",
  fuelType: "Diesel",
  oilType: "",
  oilCapacity: "",
  photoUrls: [],
};

export function AssetFormPage({ mode, assetId }: AssetFormPageProps) {
  const router = useRouter();
  const { confirmAction, notifyError } = useFeedback();

  // Nuevo backend
  const { assets, loading: loadingAssets, createAsset, updateAsset } = useAssets();
  const { sites, loading: loadingSites } = useSites();

  // Drivers siguen en FleetOps hasta Día 3
  const { drivers } = useDrivers();
  const { session } = useAuth();
  const can = (permission: string) => {
    if (permission === "assets.manage") {
      return ["owner_empresa", "admin_empresa", "supervisor", "superadmin"].includes(session?.role ?? "");
    }
    return false;
  };

  const asset = assets.find((item) => item.id === assetId);

  const siteOptions = useMemo(() => {
    const activeSites = sites.filter((site) => site.status === "Activa").map((site) => site.name);
    const currentSite = asset?.site ?? "";
    if (currentSite && !activeSites.includes(currentSite)) {
      activeSites.push(currentSite);
    }
    return activeSites;
  }, [asset?.site, sites]);

  const driverOptions = useMemo(() => {
    const activeDrivers = drivers.filter((driver) => driver.status === "Activo").map((driver) => driver.name);
    const currentResponsible = asset?.responsible ?? "";
    if (currentResponsible && !activeDrivers.includes(currentResponsible)) {
      activeDrivers.push(currentResponsible);
    }
    return activeDrivers.sort();
  }, [asset?.responsible, drivers]);

  const initialValue: AssetFormValue = asset
    ? {
        code: asset.code,
        name: asset.name,
        assetType: asset.assetType,
        category: asset.category,
        status: asset.status,
        site: asset.site,
        responsible: asset.responsible,
        brand: asset.brand,
        model: asset.model,
        serial: asset.serial,
        plate: asset.plate,
        year: asset.year,
        observations: asset.observations,
        location: asset.location,
        utilization: asset.utilization,
        nextMaintenance: asset.nextMaintenance,
        lastInspection: asset.lastInspection,
        alerts: asset.alerts,
        availability: asset.availability,
        color: asset.color,
        maxLoad: asset.maxLoad,
        fuelType: asset.fuelType,
        oilType: asset.oilType,
        oilCapacity: asset.oilCapacity,
        photoUrls: asset.photoUrls ?? [], 
      }
    : emptyAsset;

  const [form, setForm] = useState<AssetFormValue>(initialValue);
  const [errors, setErrors] = useState<Partial<Record<keyof AssetFormValue, string>>>({});

  const validate = () => {
    const nextErrors: Partial<Record<keyof AssetFormValue, string>> = {};

    if (!form.code.trim()) nextErrors.code = "El codigo es obligatorio.";
    if (!form.name.trim()) nextErrors.name = "El nombre es obligatorio.";
    if (!form.site.trim()) nextErrors.site = "La sede es obligatoria.";
    if (!form.location.trim()) nextErrors.location = "La ubicacion es obligatoria.";
    if (!form.responsible.trim()) nextErrors.responsible = "El responsable es obligatorio.";
    if (!form.brand.trim()) nextErrors.brand = "La marca es obligatoria.";
    if (!form.model.trim()) nextErrors.model = "El modelo es obligatorio.";
    if (!form.serial.trim()) nextErrors.serial = "La serie es obligatoria.";
    if (!form.year.trim()) nextErrors.year = "El anio es obligatorio.";
    if (!form.color.trim()) nextErrors.color = "El color es obligatorio.";
    if (!form.maxLoad.trim()) nextErrors.maxLoad = "La capacidad es obligatoria.";
    if (!form.oilType.trim()) nextErrors.oilType = "El aceite es obligatorio.";
    if (!form.oilCapacity.trim()) nextErrors.oilCapacity = "La capacidad de aceite es obligatoria.";

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  if (loadingAssets || loadingSites) {
    return (
      <SurfaceCard className="p-6">
        <p className="text-sm text-neutral-500">Cargando...</p>
      </SurfaceCard>
    );
  }

  if (!can("assets.manage")) {
    return (
      <SurfaceCard className="border-rose-200 p-6">
        <p className="text-lg font-semibold text-neutral-950">Sin permisos</p>
        <p className="mt-2 text-sm text-neutral-600">
          El rol actual no puede administrar activos en esta empresa.
        </p>
      </SurfaceCard>
    );
  }

  if (mode === "edit" && !asset) {
    return (
      <SurfaceCard className="p-6">
        <p className="text-lg font-semibold text-neutral-950">Activo no encontrado</p>
        <p className="mt-2 text-sm text-neutral-600">
          El activo solicitado no existe dentro de la empresa activa.
        </p>
      </SurfaceCard>
    );
  }

  return (
    <div className="space-y-4">
      <ModulePageHeader
        badge={mode === "create" ? "Alta de activo" : "Edicion de activo"}
        title={mode === "create" ? "Nuevo activo" : `Editar ${asset?.code ?? "activo"}`}
        subtitle="Formulario controlado con validacion previa, confirmacion global y sedes ligadas al catalogo real."
        accent="sky"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/gestion/sedes"
              className="inline-flex items-center rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-700 shadow-sm transition hover:border-sky-300 hover:text-sky-700"
            >
              Gestionar sedes
            </Link>
            <Link
              href={mode === "edit" && asset ? `/activos/${asset.id}` : "/activos"}
              className="inline-flex items-center rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-700 shadow-sm transition hover:border-sky-300 hover:text-sky-700"
            >
              Volver
            </Link>
          </div>
        }
      />

      <section>
        <AssetForm
          value={form}
          onChange={setForm}
          siteOptions={siteOptions}
          driverOptions={driverOptions}
          errors={errors}
          submitLabel={mode === "create" ? "Crear activo" : "Guardar cambios"}
          onSubmit={async () => {
            if (!validate()) return;

            if (siteOptions.length === 0) {
              notifyError("Sin sedes activas", "Crea o reactiva una sede antes de guardar el activo.");
              return;
            }

            const confirmed = await confirmAction({
              title: mode === "create" ? "Crear nuevo activo" : "Guardar cambios del activo",
              description:
                mode === "create"
                  ? "Se registrara el activo en la base operativa actual y quedara disponible para asignaciones, mantenimiento y control documental."
                  : "Se actualizara la ficha del activo y los cambios quedaran reflejados en el centro de datos operativo.",
              confirmLabel: mode === "create" ? "Confirmar creacion" : "Confirmar actualizacion",
              accent: "sky",
              successTitle: mode === "create" ? "Activo creado" : "Activo actualizado",
              successDescription:
                mode === "create"
                  ? "La nueva ficha operativa ya forma parte de ApliSmart Motors."
                  : "La ficha operativa se actualizo correctamente.",
              summary: [
                { label: "Codigo", value: form.code },
                { label: "Nombre", value: form.name },
                { label: "Tipo", value: `${form.assetType} / ${form.category}` },
                { label: "Estado", value: form.status },
                { label: "Sede", value: `${form.site} / ${form.location}` },
                { label: "Responsable", value: form.responsible },
              ],
              action: async () => {
                if (mode === "create") {
                  const id = await createAsset(form);
                  if (id) router.push(`/activos/${id}`);
                  return;
                }

                if (assetId) {
                  const ok = await updateAsset(assetId, form);
                  if (ok) router.push(`/activos/${assetId}`);
                }
              },
            });

            if (!confirmed) return;
          }}
        />
      </section>
    </div>
  );
}