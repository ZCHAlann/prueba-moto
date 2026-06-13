import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

export type MyDriverAssignment = {
  hasAssignment: true;
  assignment: {
    id: string;
    assetId: string;
    driverId: string;
    driverName: string;
    startDate: string | null;
    asset: {
      id: string;
      name: string | null;
      code: string | null;
      plate: string | null;
      brand: string | null;
      model: string | null;
    };
  };
};

type NotDriver = { hasAssignment: false; reason?: "not_a_driver" | "no_active_assignment" };

export type DriverAssignmentState = MyDriverAssignment | NotDriver | null;

/**
 * Devuelve la asignación activa del usuario actual si su rol es `conductor`.
 * El backend ya enforza la lógica; este hook es UI.
 *
 * - Si el usuario no es conductor: resuelve a `null` (no loading).
 * - Si es conductor pero no tiene driver row: `{ hasAssignment: false, reason: 'not_a_driver' }`.
 * - Si es conductor y no tiene asignación activa: `{ hasAssignment: false, reason: 'no_active_assignment' }`.
 * - Si tiene: `{ hasAssignment: true, assignment: {...} }`.
 */
export function useMyDriverAssignment(): {
  state: DriverAssignmentState;
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const { session } = useAuth();
  const companyId = session?.companyId ? String(session.companyId) : null;
  const isConductor = session?.role === "conductor";

  const [state, setState] = useState<DriverAssignmentState>(null);
  const [loading, setLoading] = useState<boolean>(isConductor);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!isConductor || !companyId) {
      setState(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/company/${companyId}/auth/me/driver-assignment`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = await r.json();
        if (cancelled) return;
        setState(json?.data ?? json ?? { hasAssignment: false });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Error desconocido");
        setState({ hasAssignment: false });
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [companyId, isConductor, tick]);

  return { state, loading, error, refetch };
}
