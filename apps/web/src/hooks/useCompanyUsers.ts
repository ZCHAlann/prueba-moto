import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import type { PlatformModuleKey, PlatformRole } from "@/types/platform";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CompanyUserStatus = "active" | "inactive";

export type CompanyUser = {
  id: string;
  companyId: string;
  email: string;
  username: string;
  role: PlatformRole;
  status: CompanyUserStatus;
  modulePermissions: PlatformModuleKey[];
  profileData: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CreateCompanyUserInput = {
  email: string;
  username: string;
  password: string;
  role: PlatformRole;
  status?: CompanyUserStatus;
  modulePermissions?: PlatformModuleKey[];
  profileData?: Record<string, unknown>;
};

export type UpdateCompanyUserInput = Omit<CreateCompanyUserInput, "password"> & {
  password?: string;
};

type UseCompanyUsersReturn = {
  users: CompanyUser[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  createUser: (input: CreateCompanyUserInput) => Promise<string | null>;
  updateUser: (id: string, input: UpdateCompanyUserInput) => Promise<boolean>;
  deleteUser: (id: string) => Promise<boolean>;
};

// ─── Mapper ───────────────────────────────────────────────────────────────────

function mapApiToUser(data: Record<string, unknown>): CompanyUser {
  return {
    id:                String(data.id),
    companyId:         String(data.companyId ?? data.company_id ?? ""),
    email:             String(data.email ?? ""),
    username:          String(data.username ?? ""),
    role:              (data.role as PlatformRole) ?? "operador",
    status:            (data.status as CompanyUserStatus) ?? "active",
    modulePermissions: (data.modulePermissions as PlatformModuleKey[]) ?? [],
    profileData:       (data.profileData as Record<string, unknown>) ?? {},
    createdAt:         String(data.createdAt ?? data.created_at ?? ""),
    updatedAt:         String(data.updatedAt ?? data.updated_at ?? ""),
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCompanyUsers(): UseCompanyUsersReturn {
  const { session } = useAuth();
  const companyId = session?.companyId ? String(session.companyId) : null;

  const [users, setUsers]   = useState<CompanyUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [tick, setTick]     = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    fetch(`/api/company/${companyId}/users`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`Error ${res.status}`);
        return res.json();
      })
      .then((body: { data: Record<string, unknown>[] }) => {
        setUsers((body.data ?? []).map(mapApiToUser));
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Error cargando usuarios");
      })
      .finally(() => setLoading(false));
  }, [companyId, tick]);

  // ── Create ─────────────────────────────────────────────────────────────────
  const createUser = useCallback(
    async (input: CreateCompanyUserInput): Promise<string | null> => {
      if (!companyId) return null;

      try {
        const res = await fetch(`/api/company/${companyId}/users`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email:             input.email,
            username:          input.username,
            password:          input.password,
            role:              input.role,
            status:            input.status ?? "active",
            modulePermissions: input.modulePermissions ?? [],
            profileData:       input.profileData ?? {},
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? `Error ${res.status}`);
        }

        const data = await res.json() as Record<string, unknown>;
        const newUser = mapApiToUser(data);
        setUsers((current) => [newUser, ...current]);
        return newUser.id;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error creando usuario");
        return null;
      }
    },
    [companyId]
  );

  // ── Update ─────────────────────────────────────────────────────────────────
  const updateUser = useCallback(
    async (id: string, input: UpdateCompanyUserInput): Promise<boolean> => {
      if (!companyId) return false;

      try {
        const body: Record<string, unknown> = {
          email:             input.email,
          username:          input.username,
          role:              input.role,
          status:            input.status ?? "active",
          modulePermissions: input.modulePermissions ?? [],
          profileData:       input.profileData ?? {},
        };

        if (input.password) {
          body.password = input.password;
        }

        const res = await fetch(`/api/company/${companyId}/users/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const resBody = await res.json().catch(() => ({}));
          throw new Error((resBody as { error?: string }).error ?? `Error ${res.status}`);
        }

        const data = await res.json() as Record<string, unknown>;
        const updated = mapApiToUser(data);
        setUsers((current) =>
          current.map((u) => (u.id === id ? updated : u))
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error actualizando usuario");
        return false;
      }
    },
    [companyId]
  );

  // ── Delete ─────────────────────────────────────────────────────────────────
  const deleteUser = useCallback(
    async (id: string): Promise<boolean> => {
      if (!companyId) return false;

      try {
        const res = await fetch(`/api/company/${companyId}/users/${id}`, {
          method: "DELETE",
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? `Error ${res.status}`);
        }

        setUsers((current) => current.filter((u) => u.id !== id));
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error eliminando usuario");
        return false;
      }
    },
    [companyId]
  );

  return { users, loading, error, refresh, createUser, updateUser, deleteUser };
}