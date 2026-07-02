// hooks/useAuditDashboard.ts
// ─────────────────────────────────────────────────────────────────────────────
// Estado compartido entre AuditMapPanel, ActivityFeed y AuditDrawer
// dentro de pages/Auditoria/page.tsx. Centraliza:
//
//   - events + stats  (vía useAudit + useAuditStats)
//   - filtros (date range)
//   - selección de evento  (selectedEventId → abre el drawer)
//   - hover sincronizado  (hoveredEventId → mapa <-> lista)
//
// Centralizar evita prop-drilling y mantiene sincronía mapa↔lista
// sin Context. Es un custom hook puro, no usa React state global.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo, useState } from "react";
import {
  useAudit,
  useAuditStats,
  type AuditEntry,
  type AuditFilters,
  type AuditStatsResponse,
} from "./useAudit";

export interface UseAuditDashboardFilters extends AuditFilters {
  from?: string;
  to?: string;
}

export interface UseAuditDashboard {
  // Data
  events: AuditEntry[];
  totalEvents: number;
  stats: AuditStatsResponse | null;
  // Filters
  filters: UseAuditDashboardFilters;
  setFilters: (f: UseAuditDashboardFilters) => void;
  // Loading
  loadingList: boolean;
  loadingStats: boolean;
  error: string | null;
  // Selection (sincroniza mapa ↔ lista ↔ drawer)
  selectedEventId: string | null;
  setSelectedEventId: (id: string | null) => void;
  hoveredEventId: string | null;
  setHoveredEventId: (id: string | null) => void;
  // Refs
  refetch: () => void;
}

export function useAuditDashboard(companyId: string | null): UseAuditDashboard {
  const [filters, setFilters] = useState<UseAuditDashboardFilters>({});
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [hoveredEventId, setHoveredEventId]   = useState<string | null>(null);

  const audit = useAudit(companyId, filters);
  const stats = useAuditStats(companyId, filters.from, filters.to);

  const events = useMemo(() => audit.data?.data ?? [], [audit.data]);
  const totalEvents = audit.data?.total ?? 0;

  const refetch = useCallback(() => {
    audit.refetch();
    stats.refetch();
  }, [audit, stats]);

  return {
    events,
    totalEvents,
    stats: stats.data,
    filters,
    setFilters,
    loadingList: audit.loading,
    loadingStats: stats.loading,
    error: audit.error ?? stats.error ?? null,
    selectedEventId,
    setSelectedEventId,
    hoveredEventId,
    setHoveredEventId,
    refetch,
  };
}
