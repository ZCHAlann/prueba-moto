"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

/** Shape que consume `usePermissions().can()` en el frontend. */
export type PermissionMap = Record<string, Record<string, string[]>>;

export type CompanyRole = {
  id: string;
  companyId: string;
  key: string;
  label: string;
  description: string;
  palette: string;
  permissions: PermissionMap;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateCompanyRoleInput = {
  key: string;
  label: string;
  description?: string;
  palette?: string;
  permissions?: PermissionMap;
};

export type UpdateCompanyRoleInput = {
  label?: string;
  description?: string;
  palette?: string;
  permissions?: PermissionMap;
};

/**
 * useCompanyRoles — CRUD del catálogo persistente de roles de la empresa.
 *
 * Reemplaza el `loadStored` / `loadCustomRoles` de localStorage que
 * tenía la página de Accesos/Roles. Al primer GET el backend siembra
 * los 3 default (supervisor/operador/conductor) si la empresa no los
 * tiene aún.
 */
export function useCompanyRoles() {
  const { session } = useAuth();
  const companyId = session?.companyId ? String(session.companyId) : null;

  const [roles, setRoles]   = useState<CompanyRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const fetchRoles = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/company/${companyId}/roles`, { credentials: "include" });
      if (!res.ok) throw new Error(`Error al cargar roles (HTTP ${res.status})`);
      const json = await res.json();
      const arr: CompanyRole[] = Array.isArray(json.data) ? json.data : [];
      setRoles(arr);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void fetchRoles(); }, [fetchRoles]);

  const createRole = useCallback(async (input: CreateCompanyRoleInput) => {
    if (!companyId) throw new Error("companyId requerido");
    const res = await fetch(`/api/company/${companyId}/roles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error ?? `Error al crear rol (HTTP ${res.status})`);
    }
    await fetchRoles();
  }, [companyId, fetchRoles]);

  const updateRole = useCallback(async (id: string, input: UpdateCompanyRoleInput) => {
    if (!companyId) throw new Error("companyId requerido");
    // El id del backend viene como "company-role-12" (prefijo + numeric).
    // `parseId` en backend espera ese formato exacto, no el número pelado.
    const res = await fetch(`/api/company/${companyId}/roles/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error ?? `Error al actualizar rol (HTTP ${res.status})`);
    }
    await fetchRoles();
  }, [companyId, fetchRoles]);

  const deleteRole = useCallback(async (id: string) => {
    if (!companyId) throw new Error("companyId requerido");
    const res = await fetch(`/api/company/${companyId}/roles/${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error ?? `Error al eliminar rol (HTTP ${res.status})`);
    }
    await fetchRoles();
  }, [companyId, fetchRoles]);

  return {
    roles,
    loading,
    error,
    fetchRoles,
    createRole,
    updateRole,
    deleteRole,
    refetch: () => fetchRoles(),
  };
}
