import { create } from 'zustand';

interface UiStore {
  isCarSelectorOpen: boolean;

  openCarSelector: () => void;
  closeCarSelector: () => void;
  toggleCarSelector: () => void;
}

export const useUiStore = create<UiStore>((set) => ({
  isCarSelectorOpen: false,

  openCarSelector: () =>
    set({
      isCarSelectorOpen: true,
    }),

  closeCarSelector: () =>
    set({
      isCarSelectorOpen: false,
    }),

  toggleCarSelector: () =>
    set((state) => ({
      isCarSelectorOpen: !state.isCarSelectorOpen,
    })),
}));