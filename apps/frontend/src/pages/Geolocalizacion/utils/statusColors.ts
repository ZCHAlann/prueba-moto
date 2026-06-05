import type { CarState } from '../types/car';

export const STATUS_TW: Record<CarState, { bg: string; text: string; dot: string }> = {
  active: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  off: { bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400' },
  blocked: { bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500' },
};