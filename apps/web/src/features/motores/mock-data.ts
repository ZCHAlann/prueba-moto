import type { Motor, MotorAlert, MotorHistoryEvent, MotorStatus, MotorUpcomingTask } from "@/types/motor";

export const motorStatusOptions: MotorStatus[] = ["Operativo", "En mantenimiento", "Reserva", "Fuera de servicio"];

export const defaultMotors: Motor[] = [];

export const defaultMotorHistory: MotorHistoryEvent[] = [];

export const defaultMotorUpcomingTasks: MotorUpcomingTask[] = [];

export const defaultMotorAlerts: MotorAlert[] = [];
