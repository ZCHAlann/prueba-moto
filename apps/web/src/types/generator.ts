export type GeneratorStatus = "Operativo" | "En mantenimiento" | "En reserva";

export type GeneratorRecord = {
  id: string;
  code: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  fuelType: string;
  power: string;
  site: string;
  responsible: string;
  status: GeneratorStatus;
  runtimeHours: number;
  nextMaintenance: string;
  lastService: string;
  notes: string;
};
