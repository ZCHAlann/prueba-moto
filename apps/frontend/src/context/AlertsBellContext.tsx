import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from "react";
import { useAuth } from "../context/AuthContext";
import type { ApiAlert } from "../hooks/useAlerts";

/**
 * Estado compartido de alertas entre el dropdown de notificaciones
 * (header) y el badge del sidebar. Hace un solo fetch por app.
 */

type AlertsBellContextValue = {
  alerts: ApiAlert[];
  openCount: number;
  followUpCount: number;
  totalActive: number;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

const AlertsBellContext = createContext<AlertsBellContextValue | null>(null);

const POLL_MS = 60_000; // re-fetch cada minuto

export function AlertsBellProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const companyId = session?.companyId ? String(session.companyId) : null;
  const scope = session?.scope;

  const [alerts, setAlerts] = useState<ApiAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [tick, setTick]     = useState(0);

  const fetchAlerts = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/company/${companyId}/alerts`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const body = await res.json();
      const raw: Record<string, unknown>[] = Array.isArray(body)
        ? body
        : Array.isArray(body?.data) ? body.data : [];
      setAlerts(
        raw.map((r) => ({
          id: String(r.id ?? ""),
          companyId: Number(r.companyId ?? r.company_id ?? 0),
          assetId: r.assetId ? String(r.assetId) : r.asset_id ? String(r.asset_id) : null,
          title:    String(r.title ?? ""),
          type:     (r.type as ApiAlert["type"]) ?? "Manual",
          severity: (r.severity as ApiAlert["severity"]) ?? "Media",
          status:   (r.status as ApiAlert["status"]) ?? "Abierta",
          dueDate:  String(r.dueDate ?? r.due_date ?? ""),
          notes:    String(r.notes ?? ""),
          createdAt: String(r.createdAt ?? r.created_at ?? ""),
          updatedAt: String(r.updatedAt ?? r.updated_at ?? ""),
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar alertas");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  const refresh = useCallback(() => {
    setTick((n) => n + 1);
    fetchAlerts();
  }, [fetchAlerts]);

  useEffect(() => {
    if (!companyId || scope !== "operacion") return;
    fetchAlerts();
  }, [companyId, scope, fetchAlerts, tick]);

  useEffect(() => {
    if (!companyId || scope !== "operacion") return;
    const t = setInterval(() => fetchAlerts(), POLL_MS);
    return () => clearInterval(t);
  }, [companyId, scope, fetchAlerts]);

  const value = useMemo<AlertsBellContextValue>(() => {
    const open     = alerts.filter((a) => a.status === "Abierta").length;
    const followUp = alerts.filter((a) => a.status === "En seguimiento").length;
    return {
      alerts,
      openCount: open,
      followUpCount: followUp,
      totalActive: open + followUp,
      loading,
      error,
      refresh,
    };
  }, [alerts, loading, error, refresh]);

  return (
    <AlertsBellContext.Provider value={value}>
      {children}
    </AlertsBellContext.Provider>
  );
}

export function useAlertsBell() {
  const ctx = useContext(AlertsBellContext);
  if (!ctx) {
    return {
      alerts: [],
      openCount: 0,
      followUpCount: 0,
      totalActive: 0,
      loading: false,
      error: null,
      refresh: () => {},
    } satisfies AlertsBellContextValue;
  }
  return ctx;
}
