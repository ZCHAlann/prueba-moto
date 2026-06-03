// src/hooks/usePlatformUsers.ts
import { useState, useEffect, useCallback } from "react";

const API = "/api/platform/users";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlatformUserRow {
  id: string;          // "platform-user-1"
  type: "platform";
  email: string;
  username: string;
  role: "superadmin" | "admin_saas" | "comercial" | "soporte";
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
}

export interface CompanyUserRow {
  id: string;          // "company-user-1"
  type: "company";
  companyId: string;
  companyName: string | null;
  companySlug: string | null;
  email: string;
  username: string;
  role: "owner_empresa" | "admin_empresa" | "supervisor" | "operador" | "conductor";
  status: "active" | "inactive";
  modulePermissions: string[];
  profileData: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type AnyUser = PlatformUserRow | CompanyUserRow;

interface UsersSnapshot {
  platformUsers: PlatformUserRow[];
  companyUsers: CompanyUserRow[];
  total: number;
}

export type CreatePlatformUserInput = {
  type: "platform";
  email: string;
  username: string;
  password: string;
  role: PlatformUserRow["role"];
  status?: "active" | "inactive";
};

export type CreateCompanyUserInput = {
  type: "company";
  companyId: string;
  email: string;
  username: string;
  password: string;
  role: CompanyUserRow["role"];
  status?: "active" | "inactive";
  modulePermissions?: string[];
  profileData?: Record<string, unknown>;
};

export type UpdatePlatformUserInput = Partial<Omit<CreatePlatformUserInput, "type" | "password"> & { password?: string }>;
export type UpdateCompanyUserInput  = Partial<Omit<CreateCompanyUserInput,  "type" | "password"> & { password?: string }>;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePlatformUsers() {
  const [platformUsers, setPlatformUsers] = useState<PlatformUserRow[]>([]);
  const [companyUsers,  setCompanyUsers]  = useState<CompanyUserRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  const applySnapshot = useCallback((snapshot: UsersSnapshot) => {
    setPlatformUsers(snapshot.platformUsers ?? []);
    setCompanyUsers(snapshot.companyUsers ?? []);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(API, { credentials: "include" });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data: UsersSnapshot = await res.json();
      applySnapshot(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar usuarios");
    } finally {
      setLoading(false);
    }
  }, [applySnapshot]);

  useEffect(() => { load(); }, [load]);

  const createUser = useCallback(async (input: CreatePlatformUserInput | CreateCompanyUserInput) => {
    const res = await fetch(API, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error ?? `Error ${res.status}`);
    }
    const snapshot: UsersSnapshot = await res.json();
    applySnapshot(snapshot);
  }, [applySnapshot]);

  const updateUser = useCallback(async (
    id: string,
    input: UpdatePlatformUserInput | UpdateCompanyUserInput
  ) => {
    const res = await fetch(`${API}/${id}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error ?? `Error ${res.status}`);
    }
    const snapshot: UsersSnapshot = await res.json();
    applySnapshot(snapshot);
  }, [applySnapshot]);

  const deleteUser = useCallback(async (id: string) => {
    const res = await fetch(`${API}/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error ?? `Error ${res.status}`);
    }
    const snapshot: UsersSnapshot = await res.json();
    applySnapshot(snapshot);
  }, [applySnapshot]);

  return {
    platformUsers,
    companyUsers,
    loading,
    error,
    reload: load,
    createUser,
    updateUser,
    deleteUser,
  };
}