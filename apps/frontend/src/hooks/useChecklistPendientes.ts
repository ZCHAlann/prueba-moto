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

export type MissedItem = {
  /** ID de la fila 'Vencido' persistida (para pedir reauth). null si la
   *  categoría está en el fallback on-demand (empresa nueva, sin sweep). */
  missedChecklistId: string | null;
  assetId: string;
  assetLabel: string;
  assetPlate: string | null;
};

export type MissedCategory = {
  categoryId: string;
  categoryName: string;
  cycleStart: string;
  cycleEnd: string;
  cycleLabel: string;
  missedItems: MissedItem[];
};

/**
 * @param filterAssetId Si viene, el backend pasa solo pendientes cuyo
 *   `pendingItems[].assetId` coincide con este valor. Pensado para
 *   deep-links tipo "Mis inspecciones pendientes" desde ProfilePage.
 *   No romper nada si viene `null` (compatibilidad backwards).
 */
export function useChecklistPendientes(filterAssetId?: string | null) {
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
      const params = filterAssetId
        ? `?assetId=${encodeURIComponent(filterAssetId)}`
        : "";
      const [resPend, resVenc] = await Promise.all([
        fetch(`/api/company/${companyId}/checklists/pendientes${params}`),
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
  }, [companyId, filterAssetId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return { pendientes, vencidos, loading, error, refetch: fetchAll };
}
