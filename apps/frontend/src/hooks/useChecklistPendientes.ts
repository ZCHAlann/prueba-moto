import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import type { ScopeKind } from "./useChecklistCategories";

export type PendingItem = {
  assetId: string;
  assetLabel: string;
  assetPlate: string | null;
  siteId: number | null;
};

export type PendingCategory = {
  categoryId: string;
  categoryName: string;
  scopeKind: ScopeKind;
  scopeLabel: string;
  cycleStart: string;
  cycleEnd: string;
  windowEnd: string;
  cycleLabel: string;
  isOverdue: boolean;
  pendingItems: PendingItem[];
};

export type MissedCategory = {
  categoryId: string;
  categoryName: string;
  cycleStart: string;
  cycleEnd: string;
  cycleLabel: string;
  missedItems: PendingItem[];
};

export function useChecklistPendientes() {
  const { session } = useAuth();
  const companyId = session?.companyId ? String(session.companyId) : null;

  const [pendientes, setPendientes] = useState<PendingCategory[]>([]);
  const [vencidos, setVencidos] = useState<MissedCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const [resPend, resVenc] = await Promise.all([
        fetch(`/api/company/${companyId}/checklists/pendientes`),
        fetch(`/api/company/${companyId}/checklists/vencidos`),
      ]);
      if (!resPend.ok) throw new Error("Error al cargar pendientes");
      if (!resVenc.ok) throw new Error("Error al cargar vencidos");
      const jsonPend = await resPend.json();
      const jsonVenc = await resVenc.json();
      setPendientes(Array.isArray(jsonPend.data) ? jsonPend.data : []);
      setVencidos(Array.isArray(jsonVenc.data) ? jsonVenc.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return { pendientes, vencidos, loading, error, refetch: fetchAll };
}
