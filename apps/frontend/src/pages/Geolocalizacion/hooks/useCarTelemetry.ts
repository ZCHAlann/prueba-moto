import { useEffect, useState } from 'react';
import { telemetrySimulator } from '../services/telemetryMock';
import { useSelectionStore } from '../store/selectionStore';
import type { Telemetry } from '../types/telemetry';

export const useCarTelemetry = (): Telemetry | null => {
  const carId = useSelectionStore((s) => s.selectedCar?.id);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);

  useEffect(() => {
    if (!carId) {
      setTelemetry(null);
      return;
    }
    return telemetrySimulator.subscribe(carId, setTelemetry);
  }, [carId]);

  return telemetry;
};