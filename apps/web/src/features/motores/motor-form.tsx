import { Button } from "@/components/ui/button";
import { InputField, SelectField, TextareaField } from "@/components/ui/form-controls";
import { SurfaceCard } from "@/components/ui/surface";
import { motorStatusOptions } from "@/features/motores/mock-data";
import type { Motor, MotorFuelType } from "@/types/motor";

export type MotorFormValues = Omit<Motor, "id" | "tenantId">;
export type MotorFormErrors = Partial<Record<keyof MotorFormValues, string>>;

type MotorFormProps = {
  values: MotorFormValues;
  errors: MotorFormErrors;
  submitLabel: string;
  onChange: (key: keyof MotorFormValues, value: string) => void;
  onSubmit: () => void;
};

const fuelOptions: Array<{ value: MotorFuelType; label: string }> = [
  { value: "Diesel", label: "Diesel" },
  { value: "Gasolina", label: "Gasolina" },
  { value: "Gas", label: "Gas" },
];

export function getMotorFormValues(motor?: Motor): MotorFormValues {
  if (!motor) {
    return {
      internalCode: "",
      serial: "",
      brand: "",
      model: "",
      power: "",
      fuelType: "Diesel",
      oilType: "",
      oilCapacity: "",
      hoursUsed: 0,
      status: "Operativo",
      location: "Taller principal",
      responsible: "",
      observations: "",
      nextMaintenance: new Date().toISOString().slice(0, 10),
    };
  }

  return {
    internalCode: motor.internalCode,
    serial: motor.serial,
    brand: motor.brand,
    model: motor.model,
    power: motor.power,
    fuelType: motor.fuelType,
    oilType: motor.oilType,
    oilCapacity: motor.oilCapacity,
    hoursUsed: motor.hoursUsed,
    status: motor.status,
    location: motor.location,
    responsible: motor.responsible,
    observations: motor.observations,
    nextMaintenance: motor.nextMaintenance,
  };
}

export function validateMotor(values: MotorFormValues): MotorFormErrors {
  const errors: MotorFormErrors = {};
  if (!values.internalCode.trim()) errors.internalCode = "El codigo interno es obligatorio.";
  if (!values.serial.trim()) errors.serial = "La serie es obligatoria.";
  if (!values.brand.trim()) errors.brand = "La marca es obligatoria.";
  if (!values.model.trim()) errors.model = "El modelo es obligatorio.";
  if (!values.power.trim()) errors.power = "La potencia es obligatoria.";
  if (!values.oilType.trim()) errors.oilType = "El tipo de aceite es obligatorio.";
  if (!values.oilCapacity.trim()) errors.oilCapacity = "La capacidad de aceite es obligatoria.";
  if (!values.responsible.trim()) errors.responsible = "El responsable es obligatorio.";
  return errors;
}

export function MotorForm({ values, errors, submitLabel, onChange, onSubmit }: MotorFormProps) {
  return (
    <form className="space-y-6" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <SurfaceCard className="p-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <InputField label="Codigo interno" value={values.internalCode} onChange={(value) => onChange("internalCode", value)} accent="orange" error={errors.internalCode} />
          <InputField label="Serie" value={values.serial} onChange={(value) => onChange("serial", value)} accent="orange" error={errors.serial} />
          <InputField label="Marca" value={values.brand} onChange={(value) => onChange("brand", value)} accent="orange" error={errors.brand} />
          <InputField label="Modelo" value={values.model} onChange={(value) => onChange("model", value)} accent="orange" error={errors.model} />
          <InputField label="Potencia" value={values.power} onChange={(value) => onChange("power", value)} accent="orange" error={errors.power} />
          <SelectField label="Tipo de combustible" value={values.fuelType} onChange={(value) => onChange("fuelType", value)} accent="orange" options={fuelOptions} />
          <InputField label="Tipo de aceite" value={values.oilType} onChange={(value) => onChange("oilType", value)} accent="orange" error={errors.oilType} />
          <InputField label="Capacidad de aceite" value={values.oilCapacity} onChange={(value) => onChange("oilCapacity", value)} accent="orange" error={errors.oilCapacity} />
          <InputField label="Horas de uso" type="number" value={String(values.hoursUsed)} onChange={(value) => onChange("hoursUsed", value)} accent="orange" />
          <SelectField label="Estado" value={values.status} onChange={(value) => onChange("status", value)} accent="orange" options={motorStatusOptions.map((status) => ({ value: status, label: status }))} />
          <InputField label="Ubicacion" value={values.location} onChange={(value) => onChange("location", value)} accent="orange" />
          <InputField label="Responsable" value={values.responsible} onChange={(value) => onChange("responsible", value)} accent="orange" error={errors.responsible} />
          <InputField label="Proximo mantenimiento" type="date" value={values.nextMaintenance} onChange={(value) => onChange("nextMaintenance", value)} accent="orange" />
        </div>
      </SurfaceCard>

      <SurfaceCard className="p-6">
        <TextareaField label="Observaciones" value={values.observations} onChange={(value) => onChange("observations", value)} accent="orange" rows={5} />
        <div className="mt-5 flex justify-end">
          <Button type="submit" tone="orange" variant="solid">{submitLabel}</Button>
        </div>
      </SurfaceCard>
    </form>
  );
}
