"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type ReauthStatus = "Pendiente" | "Autorizada" | "Rechazada";

export type ChecklistReauthRequest = {
  id: string;
  categoryId: string;
  categoryName: string | null;
  assetId: string | null;
  assetLabel: string | null;
  cycleStart: string;
  cycleEnd: string;
  windowEnd: string;
  missedChecklistId: string | null;
  status: ReauthStatus;
  requestedByUserId: string | null;
  requestedByName: string | null;
  reason: string;
  decidedByUserId: string | null;
  decidedByName: string | null;
  decisionNotes: string | null;
  decidedAt: string | null;
  completedChecklistId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReauthPage = {
  data: ChecklistReauthRequest[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type ReauthFilters = {
  status?: ReauthStatus;
  page?: number;
  pageSize?: number;
};

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useChecklistReauth() {
  const { session } = useAuth();
  const companyId = session?.companyId ? String(session.companyId) : null;

  const [requests, setRequests] = useState<ChecklistReauthRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRequests = useCallback(async (filters: ReauthFilters = {}) => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.status)   params.set("status",   filters.status);
      if (filters.page)     params.set("page",     String(filters.page));
      if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
      const qs = params.toString();
      const res = await fetch(`/api/company/${companyId}/checklists/reauth-requests${qs ? `?${qs}` : ""}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const json = await res.json();
      const raw: Array<Record<string, unknown>> = Array.isArray(json) ? json : (json.data ?? []);
      setRequests(raw.map((r) => ({
        id: String(r.id),
        categoryId: String(r.categoryId),
        categoryName: (r.categoryName as string | null) ?? null,
        assetId: r.assetId ? String(r.assetId) : null,
        assetLabel: (r.assetLabel as string | null) ?? null,
        cycleStart: String(r.cycleStart),
        cycleEnd: String(r.cycleEnd),
        windowEnd: String(r.windowEnd),
        missedChecklistId: r.missedChecklistId ? String(r.missedChecklistId) : null,
        status: (r.status as ReauthStatus) ?? "Pendiente",
        requestedByUserId: r.requestedByUserId ? String(r.requestedByUserId) : null,
        requestedByName: (r.requestedByName as string | null) ?? null,
        reason: String(r.reason ?? ""),
        decidedByUserId: r.decidedByUserId ? String(r.decidedByUserId) : null,
        decidedByName: (r.decidedByName as string | null) ?? null,
        decisionNotes: (r.decisionNotes as string | null) ?? null,
        decidedAt: (r.decidedAt as string | null) ?? null,
        completedChecklistId: r.completedChecklistId ? String(r.completedChecklistId) : null,
        createdAt: String(r.createdAt),
        updatedAt: String(r.updatedAt),
      })));
      setTotal(typeof json.total === "number" ? json.total : 0);
      setPage(typeof json.page === "number" ? json.page : 1);
      setPageSize(typeof json.pageSize === "number" ? json.pageSize : 20);
      setTotalPages(typeof json.totalPages === "number" ? json.totalPages : 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  const createRequest = useCallback(
    async (input: { missedChecklistId: string; reason: string }) => {
      if (!companyId) throw new Error("companyId requerido");
      const res = await fetch(`/api/company/${companyId}/checklists/reauth-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      await fetchRequests();
      return res.json();
    },
    [companyId, fetchRequests]
  );

  const decideRequest = useCallback(
    async (id: string, input: { decision: "Autorizada" | "Rechazada"; notes?: string }) => {
      if (!companyId) throw new Error("companyId requerido");
      const numericId = /(\d+)$/.exec(id)?.[1] ?? id;
      const res = await fetch(`/api/company/${companyId}/checklists/reauth-requests/checklist-reauth-${numericId}/decidir`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      await fetchRequests();
      return res.json();
    },
    [companyId, fetchRequests]
  );

  return {
    requests,
    total,
    page,
    pageSize,
    totalPages,
    loading,
    error,
    fetchRequests,
    createRequest,
    decideRequest,
    refetch: () => fetchRequests(),
  };
}