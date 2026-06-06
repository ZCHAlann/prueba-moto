import { useState, useEffect, useCallback } from 'react';

export type Asset = {
  id: string;
  name: string;
  plate: string | null;
  brand: string | null;
  model: string | null;
  year: string | null;
  status: 'Operativo' | 'En mantenimiento' | 'Fuera de servicio' | string;
  availability: string | null;
  fuelType: string | null;
  photoUrls: string[] | null;
  location: string | null;
  engineOn: boolean;
  locked: boolean;
  lastLat: number | null;
  lastLng: number | null;
  lastGpsAt: string | null;
};

export type Driver = {
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  phone: string | null;
  email: string | null;
  licenseNumber: string | null;
  licenseType: string | null;
  licenseExpiry: string | null;
} | null;

export type Insurance = {
  id: string;
  insurer: string;
  policyNumber: string;
  coverage: string | null;
  startDate: string;
  endDate: string;
  status: string;
  notes: string | null;
} | null;

export type ActiveAssignment = {
  id: string;
  driverId: number;
  startDate: string;
  endDate: string | null;
  status: string;
} | null;

export type Note = {
  id: string;
  body: string;
  authorId: number | null;
  authorName: string | null;
  createdAt: string;
};

export type CockpitData = {
  asset: Asset;
  driver: Driver;
  fuel: {
    totalLiters: number;
    totalCost: number;
    lastOdometer: number | null;
    entries: { date: string; liters: string; cost: string | null }[];
  };
  oilCheck: {
    nivel: string; color: string; confianza: string;
    puedeSalir: boolean; createdAt: string;
  } | null;
  oilChange: {
    date: string; reading: number; nextReading: number;
    progressPct: number | null;
  } | null;
  maintenances: {
    id: string; title: string; priority: string; status: string; dueDate: string;
  }[];
  alerts: { id: string; title: string; severity: string; type: string }[];
  insurance: Insurance;
  notes: Note[];
  activeAssignment: ActiveAssignment;
};

export function useVehicleCockpit(assetId: string | null, companyId: string) {
  const [data, setData] = useState<CockpitData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    if (!assetId || !companyId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/company/${companyId}/vehicle-cockpit/${assetId}`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar');
    } finally {
      setLoading(false);
    }
  }, [assetId, companyId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
