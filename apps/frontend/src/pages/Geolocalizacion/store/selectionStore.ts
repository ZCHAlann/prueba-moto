import { create } from 'zustand';
import type { Car } from '../types/car';
import type { Route } from '../types/route';

interface SelectionStore {
  selectedCar: Car | null;
  selectedRoute: Route | null;
  selectCar: (car: Car | null) => void;
  selectRoute: (route: Route | null) => void;
  clearRoute: () => void;
  clear: () => void;
}

export const useSelectionStore = create<SelectionStore>((set) => ({
  selectedCar: null,
  selectedRoute: null,

  selectCar: (car) => set({ selectedCar: car, selectedRoute: null }),
  selectRoute: (route) => set({ selectedRoute: route }),
  clearRoute: () => set({ selectedRoute: null }),
  clear: () => set({ selectedCar: null, selectedRoute: null }),
}));