import { Button } from "@/components/ui/button";
import { InputField, SelectField, TextareaField } from "@/components/ui/form-controls";
import { SurfaceCard } from "@/components/ui/surface";
import { assetStatusOptions } from "@/features/activos/mock-data";
import type { Asset, AssetCategory, AssetFuelType, AssetStatus } from "@/types/activo";

export type VehicleFormValues = {
  code: string;
  plate: string;
  category: AssetCategory;
  brand: string;
  model: string;
  year: string;
  serial: string;
  color: string;
  maxLoad: string;
  fuelType: AssetFuelType;
  oilType: string;
  oilCapacity: string;
  site: string;
  responsible: string;
  location: string;
  status: AssetStatus;
  observations: string;
};

export type VehicleFormErrors = Partial<Record<keyof VehicleFormValues, string>>;

type VehicleFormProps = {
  values: VehicleFormValues;
  errors: VehicleFormErrors;
  submitLabel: string;
  siteOptions: string[];
  responsibleOptions: string[];
  onChange: (key: keyof VehicleFormValues, value: string) => void;
  onSubmit: () => void;
};

const vehicleTypeOptions: Array<{ value: AssetCategory; label: string }> = [
  { value: "Camion", label: "Camion" },
  { value: "Camioneta", label: "Camioneta" },
  { value: "SUV", label: "SUV" },
  { value: "Furgon", label: "Furgon" },
  { value: "Furgoneta", label: "Furgoneta" },
  { value: "Bus", label: "Bus" },
  { value: "Volqueta", label: "Volqueta" },
];

const fuelTypeOptions: Array<{ value: AssetFuelType; label: string }> = [
  { value: "Diesel", label: "Diesel" },
  { value: "Gasolina", label: "Gasolina" },
  { value: "Electrico", label: "Electrico" },
  { value: "Hibrido", label: "Hibrido" },
];

export function getVehicleFormValues(vehicle?: Asset): VehicleFormValues {
  if (!vehicle) {
    return {
      code: "",
      plate: "",
      category: "Camioneta",
      brand: "",
      model: "",
      year: "2024",
      serial: "",
      color: "",
      maxLoad: "",
      fuelType: "Diesel",
      oilType: "",
      oilCapacity: "",
      site: "",
      responsible: "",
      location: "Patio principal",
      status: "Operativo",
      observations: "",
    };
  }

  return {
    code: vehicle.code,
    plate: vehicle.plate,
    category: vehicle.category,
    brand: vehicle.brand,
    model: vehicle.model,
    year: vehicle.year,
    serial: vehicle.serial,
    color: vehicle.color,
    maxLoad: vehicle.maxLoad,
    fuelType: vehicle.fuelType,
    oilType: vehicle.oilType,
    oilCapacity: vehicle.oilCapacity,
    site: vehicle.site,
    responsible: vehicle.responsible,
    location: vehicle.location,
    status: vehicle.status,
    observations: vehicle.observations,
  };
}

export function buildVehiclePayload(values: VehicleFormValues, current?: Asset): Omit<Asset, "id" | "tenantId"> {
  return {
    code: values.code.trim() || `INT-${values.plate.replace(/[^A-Z0-9]/gi, "").toUpperCase()}`,
    plate: values.plate.toUpperCase(),
    name: `${values.brand} ${values.model}`.trim(),
    assetType: "Vehiculo",
    category: values.category,
    status: values.status,
    site: values.site,
    responsible: values.responsible,
    brand: values.brand,
    model: values.model,
    serial: values.serial,
    year: values.year,
    observations: values.observations,
    location: values.location,
    utilization: current?.utilization ?? "0%",
    nextMaintenance: current?.nextMaintenance ?? new Date().toISOString().slice(0, 10),
    lastInspection: current?.lastInspection ?? new Date().toISOString().slice(0, 10),
    alerts: current?.alerts ?? 0,
    availability:
      values.status === "Operativo"
        ? "Disponible para asignacion"
        : values.status === "En mantenimiento"
          ? "Restringido por taller"
          : "Fuera de servicio",
    color: values.color,
    maxLoad: values.maxLoad,
    fuelType: values.fuelType,
    oilType: values.oilType,
    oilCapacity: values.oilCapacity,
    photoUrls: [],
  };
}

export function validateVehicle(values: VehicleFormValues): VehicleFormErrors {
  const errors: VehicleFormErrors = {};

  if (!values.plate.trim()) errors.plate = "La placa es obligatoria.";
  if (!values.brand.trim()) errors.brand = "La marca es obligatoria.";
  if (!values.model.trim()) errors.model = "El modelo es obligatorio.";
  if (!values.year.trim()) errors.year = "El ano es obligatorio.";
  if (!values.serial.trim()) errors.serial = "El numero de serie o chasis es obligatorio.";
  if (!values.color.trim()) errors.color = "El color es obligatorio.";
  if (!values.maxLoad.trim()) errors.maxLoad = "La carga maxima es obligatoria.";
  if (!values.oilType.trim()) errors.oilType = "El tipo de aceite es obligatorio.";
  if (!values.oilCapacity.trim()) errors.oilCapacity = "La capacidad de aceite es obligatoria.";
  if (!values.site.trim()) errors.site = "La sede es obligatoria.";
  if (!values.responsible.trim()) errors.responsible = "El responsable es obligatorio.";

  return errors;
}

export function VehicleForm({
  values,
  errors,
  submitLabel,
  siteOptions,
  responsibleOptions,
  onChange,
  onSubmit,
}: VehicleFormProps) {
  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <SurfaceCard className="p-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <InputField label="Placa" value={values.plate} onChange={(value) => onChange("plate", value)} accent="sky" error={errors.plate} />
          <SelectField label="Tipo de vehículo" value={values.category} onChange={(value) => onChange("category", value)} accent="sky" options={vehicleTypeOptions} />
          <InputField label="Marca" value={values.brand} onChange={(value) => onChange("brand", value)} accent="sky" error={errors.brand} />
          <InputField label="Modelo" value={values.model} onChange={(value) => onChange("model", value)} accent="sky" error={errors.model} />
          <InputField label="Año" value={values.year} onChange={(value) => onChange("year", value)} accent="sky" error={errors.year} />
          <InputField label="Número de serie / chasis" value={values.serial} onChange={(value) => onChange("serial", value)} accent="sky" error={errors.serial} />
          <InputField label="Color" value={values.color} onChange={(value) => onChange("color", value)} accent="sky" error={errors.color} />
          <InputField label="Carga máxima" value={values.maxLoad} onChange={(value) => onChange("maxLoad", value)} accent="sky" error={errors.maxLoad} />
          <SelectField label="Tipo de combustible" value={values.fuelType} onChange={(value) => onChange("fuelType", value)} accent="sky" options={fuelTypeOptions} />
          <InputField label="Tipo de aceite" value={values.oilType} onChange={(value) => onChange("oilType", value)} accent="sky" error={errors.oilType} />
          <InputField label="Capacidad de aceite" value={values.oilCapacity} onChange={(value) => onChange("oilCapacity", value)} accent="sky" error={errors.oilCapacity} />
          <SelectField label="Estado" value={values.status} onChange={(value) => onChange("status", value)} accent="sky" options={assetStatusOptions.map((status) => ({ value: status, label: status }))} />
          <SelectField
            label="Sede"
            value={values.site}
            onChange={(value) => onChange("site", value)}
            accent="sky"
            error={errors.site}
            hint="Catalogo tomado desde Gestion / Sedes."
            options={siteOptions.map((site) => ({ value: site, label: site }))}
          />
          {responsibleOptions.length > 0 ? (
            <SelectField
              label="Responsable"
              value={values.responsible || responsibleOptions[0]}
              onChange={(value) => onChange("responsible", value)}
              accent="sky"
              error={errors.responsible}
              hint="Se selecciona desde los conductores creados previamente."
              options={responsibleOptions.map((name) => ({ value: name, label: name }))}
            />
          ) : (
            <InputField
              label="Responsable"
              value={values.responsible}
              onChange={(value) => onChange("responsible", value)}
              accent="sky"
              error={errors.responsible}
              hint="No hay conductores activos. Crea un conductor antes de asignar responsable."
              placeholder="Crea un conductor para seleccionarlo"
            />
          )}
          <InputField label="Ubicación" value={values.location} onChange={(value) => onChange("location", value)} accent="sky" />
          <InputField label="Código interno opcional" value={values.code} onChange={(value) => onChange("code", value)} accent="sky" hint="Si no lo defines, ApliSmart Motors lo genera a partir de la placa." />
        </div>
      </SurfaceCard>

      <SurfaceCard className="p-6">
        <TextareaField label="Observaciones" value={values.observations} onChange={(value) => onChange("observations", value)} accent="sky" rows={5} />
        <div className="mt-5 flex justify-end">
          <Button type="submit" tone="sky" variant="solid">{submitLabel}</Button>
        </div>
      </SurfaceCard>
    </form>
  );
}
