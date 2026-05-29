export type MotorStatus = "Operativo" | "En mantenimiento" | "Reserva" | "Fuera de servicio";

export type MotorFuelType = "Diesel" | "Gasolina" | "Gas";

export type Motor = {
  id: string;
  tenantId: string;
  internalCode: string;
  serial: string;
  brand: string;
  model: string;
  power: string;
  fuelType: MotorFuelType;
  oilType: string;
  oilCapacity: string;
  hoursUsed: number;
  status: MotorStatus;
  location: string;
  responsible: string;
  observations: string;
  nextMaintenance: string;
};

export type MotorHistoryEvent = {
  id: string;
  motorId: string;
  date: string;
  type: string;
  title: string;
  detail: string;
};

export type MotorUpcomingTask = {
  id: string;
  motorId: string;
  dueDate: string;
  title: string;
  status: "Programado" | "Critico";
};

export type MotorAlert = {
  id: string;
  motorId: string;
  severity: "Alta" | "Media" | "Baja";
  title: string;
  detail: string;
};
