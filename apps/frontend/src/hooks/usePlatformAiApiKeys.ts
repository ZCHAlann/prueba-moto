"use client";

// hooks/usePlatformAiApiKeys.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 — Hook de superadmin para gestionar las API keys de /api/ai/*
// de una empresa.
//
// Endpoints (todos bajo /api/platform/companies/:id/ai-api-keys):
//   GET    /                       → listar keys (con paginación)
//   POST   /                       → crear nueva key (devuelve plainKey una vez)
//   POST   /:keyId/revoke          → desactivar
//   POST   /:keyId/reactivate      → reactivar
//   DELETE /:keyId                 → hard-delete
//   GET    /:keyId/logs            → últimos N requests de esta key
// ─────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";

export type AiApiKeyScope = "read" | "write";

export interface PlatformAiApiKey {
  id: number;
  companyId: number;
  name: string;
  keyPrefix: string;          // ej: "aik_live_AbCdEf" (sin el hash)
  scopes: AiApiKeyScope[];
  active: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformAiApiKeyCreateResponse {
  /** La key en texto plano. SOLO se devuelve una vez. */
  plainKey: string;
  /** El registro persistido (sin hash). */
  key: PlatformAiApiKey;
}

export interface PlatformAiApiLog {
  id: number;
  endpoint: string;
  method: string;
  statusCode: number;
  durationMs: number;
  errorMessage: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface UsePlatformAiApiKeysReturn {
  keys: PlatformAiApiKey[];
  total: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  create: (input: { name: string; scopes: AiApiKeyScope[]; expiresAt?: string }) => Promise<PlatformAiApiKeyCreateResponse | null>;
  revoke: (keyId: number) => Promise<boolean>;
  reactivate: (keyId: number) => Promise<boolean>;
  remove: (keyId: number) => Promise<boolean>;
  /** Devuelve los últimos N logs de una key. */
  fetchLogs: (keyId: number, opts?: { limit?: number; statusCode?: number }) => Promise<PlatformAiApiLog[]>;
}

export function usePlatformAiApiKeys(companyId: string | number | null | undefined): UsePlatformAiApiKeysReturn {
  const [keys, setKeys]       = useState<PlatformAiApiKey[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const refresh = useCallback(async () => {
    // Guard: si companyId es null/undefined/"" no hacemos nada. Si es
    // un numero o string valido, lo usamos. Si es 0, tampoco (no existe
    // company con id 0).
    if (companyId === null || companyId === undefined || companyId === "") return;
    setLoading(true);
    setError(null);
    try {
      const url = `/api/platform/companies/${companyId}/ai-api-keys?pageSize=50`;
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.error || `Error ${r.status}`);
      }
      const data = await r.json();
      setKeys(data.items ?? data.keys ?? []);
      setTotal(data.total ?? 0);
    } catch (e: any) {
      setError(e?.message ?? "Error cargando API keys");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    // Cuando cambia el companyId, limpiamos el error viejo y los keys
    // antes de hacer el refresh. Asi no se muestra un error stale
    // cuando el drawer se abre con otra empresa.
    setError(null);
    setKeys([]);
    setTotal(0);
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const create = useCallback(async (input: { name: string; scopes: AiApiKeyScope[]; expiresAt?: string }) => {
    if (!companyId && companyId !== 0) return null;
    try {
      const r = await fetch(`/api/platform/companies/${companyId}/ai-api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.error || `Error ${r.status}`);
      }
      const data: PlatformAiApiKeyCreateResponse = await r.json();
      // Refrescamos la lista para que aparezca la key nueva.
      await refresh();
      return data;
    } catch (e: any) {
      setError(e?.message ?? "Error creando API key");
      return null;
    }
  }, [companyId, refresh]);

  const revoke = useCallback(async (keyId: number) => {
    try {
      const r = await fetch(`/api/platform/companies/${companyId}/ai-api-keys/${keyId}/revoke`, { method: "POST" });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.error || `Error ${r.status}`);
      }
      await refresh();
      return true;
    } catch (e: any) {
      setError(e?.message ?? "Error revocando key");
      return false;
    }
  }, [companyId, refresh]);

  const reactivate = useCallback(async (keyId: number) => {
    try {
      const r = await fetch(`/api/platform/companies/${companyId}/ai-api-keys/${keyId}/reactivate`, { method: "POST" });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.error || `Error ${r.status}`);
      }
      await refresh();
      return true;
    } catch (e: any) {
      setError(e?.message ?? "Error reactivando key");
      return false;
    }
  }, [companyId, refresh]);

  const remove = useCallback(async (keyId: number) => {
    try {
      const r = await fetch(`/api/platform/companies/${companyId}/ai-api-keys/${keyId}`, { method: "DELETE" });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.error || `Error ${r.status}`);
      }
      await refresh();
      return true;
    } catch (e: any) {
      setError(e?.message ?? "Error eliminando key");
      return false;
    }
  }, [companyId, refresh]);

  const fetchLogs = useCallback(async (keyId: number, opts?: { limit?: number; statusCode?: number }) => {
    const params = new URLSearchParams();
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.statusCode) params.set("statusCode", String(opts.statusCode));
    const qs = params.toString();
    const r = await fetch(`/api/platform/companies/${companyId}/ai-api-keys/${keyId}/logs${qs ? `?${qs}` : ""}`, { cache: "no-store" });
    if (!r.ok) return [];
    const data = await r.json();
    return data.items ?? data.logs ?? [];
  }, [companyId]);

  return { keys, total, loading, error, refresh, create, revoke, reactivate, remove, fetchLogs };
}
