import { useEffect, useState } from 'react';
import { routesService } from '../services/routesService';
import { useSelectionStore } from '../store/selectionStore';
import type { Route } from '../types/route';

export const useRouteHistory = () => {
  const carId = useSelectionStore((s) => s.selectedCar?.id);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!carId) {
      setRoutes([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    routesService.getByCarId(carId).then((data) => {
      if (!cancelled) {
        setRoutes(data);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [carId]);

  return { routes, loading };
};