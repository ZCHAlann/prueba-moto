import { useEffect, useRef } from 'react';
import { CarSelectorButton } from './CarSelectorButton';
import { CarSelectorDropdown } from './CarSelectorDropdown';
import { useCarStore } from '../../store/carStore';
import { useSelectionStore } from '../../store/selectionStore';
import type { Car } from '../../types/car';
import { useUiStore } from '../../store/uiStore';

export const CarSelector = () => {
  const open = useUiStore((s) => s.isCarSelectorOpen);
  const toggleCarSelector = useUiStore((s) => s.toggleCarSelector);
  const closeCarSelector = useUiStore((s) => s.closeCarSelector);
  const containerRef = useRef<HTMLDivElement>(null);
  const totalCount  = useCarStore((s) => s.cars.length);
  const selectedCar = useSelectionStore((s) => s.selectedCar);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeCarSelector();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = (_car: Car) => closeCarSelector();

  return (
    <div ref={containerRef} className="relative z-[1000]">
      <CarSelectorButton
        totalCount={totalCount}
        selectedCar={selectedCar}
        open={open}
        onClick={() => toggleCarSelector()}
      />
      {open && <CarSelectorDropdown onSelect={handleSelect} />}
    </div>
  );
};