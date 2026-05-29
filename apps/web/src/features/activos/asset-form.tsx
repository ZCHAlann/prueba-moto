"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { InputField, SelectField, TextareaField } from "@/components/ui/form-controls";
import { SurfaceCard } from "@/components/ui/surface";
import {
  assetCategoryOptions,
  assetStatusOptions,
  assetTypeOptions,
} from "@/features/activos/mock-data";
import type { Asset } from "@/types/activo";

export type AssetFormValue = Omit<Asset, "id" | "tenantId">;

type AssetFormProps = {
  value: AssetFormValue;
  onChange: (value: AssetFormValue) => void;
  onSubmit: () => void;
  submitLabel: string;
  siteOptions: string[];
  driverOptions: string[];
  errors?: Partial<Record<keyof AssetFormValue, string>>;
};

export function AssetForm({
  value,
  onChange,
  onSubmit,
  submitLabel,
  siteOptions,
  driverOptions,
  errors = {},
}: AssetFormProps) {
  const categoryOptions = useMemo(() => assetCategoryOptions, []);

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <SurfaceCard className="p-5">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-neutral-950">Identidad operativa</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Base maestra del activo para operacion, control y trazabilidad.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <InputField
            label="Codigo"
            value={value.code}
            onChange={(next) => onChange({ ...value, code: next })}
            accent="sky"
            error={errors.code}
            placeholder="TRK-204"
          />
          <InputField
            label="Nombre"
            value={value.name}
            onChange={(next) => onChange({ ...value, name: next })}
            accent="sky"
            error={errors.name}
            placeholder="Volquete 18m3"
          />
          <SelectField
            label="Tipo activo"
            value={value.assetType}
            onChange={(next) =>
              onChange({
                ...value,
                assetType: next as AssetFormValue["assetType"],
                category: "Camion",
              })
            }
            options={assetTypeOptions.map((option) => ({ value: option, label: option }))}
            accent="sky"
          />
          <SelectField
            label="Categoria"
            value={value.category}
            onChange={(next) => onChange({ ...value, category: next as AssetFormValue["category"] })}
            options={categoryOptions.map((option) => ({ value: option, label: option }))}
            accent="sky"
          />
          <SelectField
            label="Estado"
            value={value.status}
            onChange={(next) => onChange({ ...value, status: next as AssetFormValue["status"] })}
            options={assetStatusOptions.map((option) => ({ value: option, label: option }))}
            accent="sky"
          />
          <InputField
            label="Disponibilidad"
            value={value.availability}
            onChange={(next) => onChange({ ...value, availability: next })}
            accent="sky"
            placeholder="Listo para asignacion"
          />
          <InputField
            label="Utilizacion"
            value={value.utilization}
            onChange={(next) => onChange({ ...value, utilization: next })}
            accent="sky"
            placeholder="84%"
          />
          <InputField
            label="Alertas activas"
            type="number"
            value={String(value.alerts)}
            onChange={(next) => onChange({ ...value, alerts: Number(next || "0") })}
            accent="sky"
          />
        </div>
      </SurfaceCard>

      <SurfaceCard className="p-5">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-neutral-950">Responsable y ubicacion</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Datos visibles para despacho, supervision y control por sede.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SelectField
            label="Sede"
            value={value.site}
            onChange={(next) => onChange({ ...value, site: next })}
            accent="sky"
            error={errors.site}
            hint="Catalogo tomado desde Gestion / Sedes."
            options={siteOptions.map((site) => ({ value: site, label: site }))}
          />
          <InputField
            label="Ubicacion"
            value={value.location}
            onChange={(next) => onChange({ ...value, location: next })}
            accent="sky"
            error={errors.location}
            placeholder="Patio principal"
          />
          <div>
            <SelectField
              label="Responsable"
              value={value.responsible}
              onChange={(next) => onChange({ ...value, responsible: next })}
              accent="sky"
              error={errors.responsible}
              hint="Conductor asignado al vehículo."
              options={driverOptions.map((driver) => ({ value: driver, label: driver }))}
            />
            {driverOptions.length === 0 && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                No hay conductores activos.{" "}
                <Link href="/operaciones/conductores" className="font-semibold underline hover:text-amber-700">
                  Crear conductor
                </Link>
              </p>
            )}
          </div>
          <InputField
            label="Proximo mantenimiento"
            type="date"
            value={normalizeDateInput(value.nextMaintenance)}
            onChange={(next) => onChange({ ...value, nextMaintenance: next })}
            accent="sky"
          />
        </div>
      </SurfaceCard>

      <SurfaceCard className="p-5">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-neutral-950">Datos tecnicos</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Informacion base para taller, soporte y seguimiento del activo.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <InputField
            label="Marca"
            value={value.brand}
            onChange={(next) => onChange({ ...value, brand: next })}
            accent="sky"
            error={errors.brand}
          />
          <InputField
            label="Modelo"
            value={value.model}
            onChange={(next) => onChange({ ...value, model: next })}
            accent="sky"
            error={errors.model}
          />
          <InputField
            label="Serie"
            value={value.serial}
            onChange={(next) => onChange({ ...value, serial: next })}
            accent="sky"
            error={errors.serial}
          />
          <InputField
            label="Placa"
            value={value.plate}
            onChange={(next) => onChange({ ...value, plate: next })}
            accent="sky"
            placeholder="N/A o PBC-2204"
          />
          <InputField
            label="Color"
            value={value.color}
            onChange={(next) => onChange({ ...value, color: next })}
            accent="sky"
            error={errors.color}
          />
          <InputField
            label="Anio"
            value={value.year}
            onChange={(next) => onChange({ ...value, year: next })}
            accent="sky"
            error={errors.year}
          />
          <InputField
            label="Carga maxima"
            value={value.maxLoad}
            onChange={(next) => onChange({ ...value, maxLoad: next })}
            accent="sky"
            error={errors.maxLoad}
          />
          <InputField
            label="Combustible"
            value={value.fuelType}
            onChange={(next) => onChange({ ...value, fuelType: next as AssetFormValue["fuelType"] })}
            accent="sky"
          />
          <InputField
            label="Tipo de aceite"
            value={value.oilType}
            onChange={(next) => onChange({ ...value, oilType: next })}
            accent="sky"
            error={errors.oilType}
          />
          <InputField
            label="Capacidad de aceite"
            value={value.oilCapacity}
            onChange={(next) => onChange({ ...value, oilCapacity: next })}
            accent="sky"
            error={errors.oilCapacity}
          />
          <InputField
            label="Ultima inspeccion"
            type="date"
            value={normalizeDateInput(value.lastInspection)}
            onChange={(next) => onChange({ ...value, lastInspection: next })}
            accent="sky"
          />
        </div>
      </SurfaceCard>

      <SurfaceCard className="p-5">
        <TextareaField
          label="Observaciones"
          value={value.observations}
          onChange={(next) => onChange({ ...value, observations: next })}
          accent="sky"
          rows={5}
          placeholder="Hallazgos operativos, condicion actual, restricciones o notas tecnicas relevantes."
        />
      </SurfaceCard>

      <div className="flex justify-end">
        <Button type="submit" tone="sky" variant="solid">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function normalizeDateInput(value: string) {
  return value.includes("T") ? value.split("T")[0] : value;
}
