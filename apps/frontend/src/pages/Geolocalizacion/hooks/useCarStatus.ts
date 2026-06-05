import { useCarStore } from '../store/carStore';
import { useSelectionStore } from '../store/selectionStore';

export const useCarStatus = () => {
  const selectedCar   = useSelectionStore((s) => s.selectedCar);
  const toggleEngine  = useCarStore((s) => s.toggleEngine);
  const toggleLock    = useCarStore((s) => s.toggleLock);

  if (!selectedCar) {
    return {
      car: null,
      isOn: false,
      isLocked: false,
      isBlocked: false,
      toggleEngine: () => {},
      toggleLock: () => {},
    };
  }

  return {
    car: selectedCar,
    isOn: selectedCar.engine === 'on',
    isLocked: selectedCar.lock === 'locked',
    isBlocked: selectedCar.state === 'blocked',
    toggleEngine: () => toggleEngine(selectedCar.id),
    toggleLock: () => toggleLock(selectedCar.id),
  };
};