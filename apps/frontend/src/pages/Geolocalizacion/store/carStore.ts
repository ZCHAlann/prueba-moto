import { create } from 'zustand';
import { mockCars } from '../data/mockCars';
import type { Car, CarState } from '../types/car';

interface CarStore {
  cars: Car[];
  filter: CarState | 'all';
  search: string;
  setFilter: (f: CarState | 'all') => void;
  setSearch: (s: string) => void;
  getCarById: (id: string) => Car | undefined;
  updateCar: (id: string, partial: Partial<Car>) => void;
  toggleEngine: (id: string) => void;
  toggleLock: (id: string) => void;
}

export const useCarStore = create<CarStore>((set, get) => ({
  cars: mockCars,
  filter: 'all',
  search: '',

  setFilter: (filter) => set({ filter }),
  setSearch: (search) => set({ search }),

  getCarById: (id) => get().cars.find((c) => c.id === id),

  updateCar: (id, partial) =>
    set((s) => ({
      cars: s.cars.map((c) => (c.id === id ? { ...c, ...partial } : c)),
    })),

  toggleEngine: (id) =>
    set((s) => ({
      cars: s.cars.map((c) => {
        if (c.id !== id) return c;
        const nextEngine = c.engine === 'on' ? 'off' : 'on';
        return { ...c, engine: nextEngine, state: nextEngine === 'on' ? 'active' : 'off' };
      }),
    })),

  toggleLock: (id) =>
    set((s) => ({
      cars: s.cars.map((c) =>
        c.id === id ? { ...c, lock: c.lock === 'locked' ? 'unlocked' : 'locked' } : c
      ),
    })),
}));