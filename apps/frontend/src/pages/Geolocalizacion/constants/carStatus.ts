import type { CarState } from '../types/car';

export const STATUS_LABELS: Record<CarState, string> = {
  active: 'Activo',
  off: 'Apagado',
  blocked: 'Bloqueado',
};

export const STATUS_HEX: Record<CarState, string> = {
  active: '#10b981',   // emerald-500
  off: '#94a3b8',      // slate-400
  blocked: '#f43f5e',  // rose-500
};