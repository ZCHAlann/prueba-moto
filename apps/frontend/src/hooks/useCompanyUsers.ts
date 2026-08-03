import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import type { PlatformRole } from "@/types/platform";
import type { PermissionMap } from "../lib/module-tree";
import { extractApiErrorMessage } from "../lib/form-validation";
import { compressIfImage, COMPRESS_OPTS_EVIDENCE } from "../lib/mediaCompress";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CompanyUserStatus = "active" | "inactive";

export type CompanyUser = {
  id: string;
  companyId: string;
  email: string;
  username: string;
  role: PlatformRole;
  status: CompanyUserStatus;
  modulePermissions: PermissionMap;
  permissions: Record<string, unknown>;  // deprecado, siempre {}
  profileData: Record<string, unknown>;
  photoUrl: string | null;
  createdAt: string;
  updatedAt: string;
  /** Timestamp del último cambio (permisos, rol, etc.) que se usa
   *  para invalidar la sesión si cambió. */
  permissionsUpdatedAt?: string | null;
};

export type CreateCompanyUserInput = {
  email: string;
  username: string;
  password: string;
  role: PlatformRole;
  status?: CompanyUserStatus;
  modulePermissions?: PermissionMap;
  profileData?: Record<string, unknown>;
  photoUrl?: string | null;
  /** jun 2026 — cédula/DNI dedicado. Si viene null, backend cae a
   *  profileData.documentNumber como compat. */
  dni?: string | null;
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
  updatePermissions: (id: string, modulePermissions: PermissionMap) => Promise<boolean>;
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
    modulePermissions: (data.modulePermissions as PermissionMap) ?? {},
    permissions:       {},  // deprecado
    profileData:       (data.profileData as Record<string, unknown>) ?? {},
    photoUrl:          (data.photoUrl as string | null) ?? (data.photo_url as string | null) ?? null,
    createdAt:         String(data.createdAt ?? data.created_at ?? ""),
    updatedAt:         String(data.updatedAt ?? data.updated_at ?? ""),
    permissionsUpdatedAt: (data.permissionsUpdatedAt as string | null) ?? null,
  };
}

/** Sube 1 foto al endpoint de usuarios y devuelve la URL pública. */
export async function uploadUserPhoto(file: File, companyId: number): Promise<string> {
  const toUpload = await compressIfImage(file, COMPRESS_OPTS_EVIDENCE);
  const fd = new FormData();
  fd.append("photos", toUpload);
  const res = await fetch(`/api/upload/user-photos?companyId=${companyId}`, {
    method: "POST",
    body: fd,
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Upload user: HTTP ${res.status}`);
  const json = await res.json();
  const url = Array.isArray(json.urls) ? json.urls[0] : json.url;
  if (!url) throw new Error("Upload user: respuesta sin URL");
  return url;
}

/**
 * jul 2026 — pide al backend un JWT firmado para el QR del carnet de un
 * usuario. Se codifica en el QR con qrcode.react. La verificación es
 * pública (ver /public/staff/verify/:token).
 *
 * Errores:
 *   - 401/403: el caller no tiene permiso (no es admin y no es él mismo).
 *   - 404: el user no existe.
 *   - 409: el user está inactivo y solo un admin podría reemitir.
 *
 * El helper NO es parte del hook (no necesita estado React) — se llama
 * desde el IDCardModal cuando se abre.
 */
export async function requestStaffQrToken(
  companyId: number,
  userId: string,
): Promise<{ token: string; ttlSeconds: number }> {
  const res = await fetch(`/api/company/${companyId}/users/${userId}/qr-token`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Error ${res.status}`);
  }
  const json = (await res.json()) as { token: string; ttlSeconds: number };
  if (!json.token) throw new Error("Backend no devolvió token");
  return json;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCompanyUsers(): UseCompanyUsersReturn {
  const { session, refreshSession } = useAuth();
  const companyId = session?.companyId ? String(session.companyId) : null;

  const [users, setUsers]     = useState<CompanyUser[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPageState]   = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [tick, setTick]       = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    fetch(`/api/company/${companyId}/users?page=1&pageSize=100`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`Error ${res.status}`);
        return res.json();
      })
      .then((body: { data: Record<string, unknown>[]; total?: number; page?: number; pageSize?: number; totalPages?: number }) => {
        setUsers((body.data ?? []).map(mapApiToUser));
        setTotal(typeof body.total === "number" ? body.total : 0);
        setPageState(typeof body.page === "number" ? body.page : 1);
        setPageSize(typeof body.pageSize === "number" ? body.pageSize : 100);
        setTotalPages(typeof body.totalPages === "number" ? body.totalPages : 1);
      })
      .catch((err: unknown) => {
        setError(extractApiErrorMessage(err, "Error cargando usuarios"));
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
            // jun 2026 — cédula/DNI (migración 0040).
            // Si llega undefined, lo omitimos del body (backend cae al
            // profileData.documentNumber como compat).
            dni:               input.dni ?? null,
            modulePermissions: input.modulePermissions ?? {},
            profileData:       input.profileData ?? {},
            photoUrl:          input.photoUrl ?? null,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? `Error ${res.status}`);
        }

        const data = await res.json() as Record<string, unknown>;
        const newUser = mapApiToUser(data);
        setUsers((current) => [newUser, ...current]); setTotal((t) => t + 1);
        return newUser.id;
      } catch (err) {
        setError(extractApiErrorMessage(err, "Error creando usuario"));
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
          // jun 2026 — cédula/DNI (migración 0040). Se incluye siempre
          // (puede ser null explícito si el admin la borró). Si NO lo
          // incluyéramos, el backend nunca pisaría la columna.
          dni:               input.dni ?? null,
          modulePermissions: input.modulePermissions ?? {},
          profileData:       input.profileData ?? {},
          photoUrl:          input.photoUrl ?? null,
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
        // Si me actualicé a mí mismo, re-fetch de la sesión para que
        // mis permisos/rol reflejen el cambio de inmediato.
        if (session?.id === id) {
          await refreshSession();
        }
        return true;
      } catch (err) {
        setError(extractApiErrorMessage(err, "Error actualizando usuario"));
        return false;
      }
    },
    [companyId, session?.id, refreshSession]
  );

  // ── Update Permissions ─────────────────────────────────────────────────────
  const updatePermissions = useCallback(
    async (id: string, modulePermissions: PermissionMap): Promise<boolean> => {
      if (!companyId) return false;

      try {
        const res = await fetch(`/api/company/${companyId}/users/${id}/permissions`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modulePermissions }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? `Error ${res.status}`);
        }

        setUsers((current) =>
          current.map((u) => (u.id === id ? { ...u, modulePermissions } : u))
        );
        // Si me actualicé a mí mismo, re-fetch de la sesión para que
        // mis nuevos permisos apliquen de inmediato (sirve de invalida-
        // ción del JWT viejo).
        if (session?.id === id) {
          await refreshSession();
        }
        return true;
      } catch (err) {
        setError(extractApiErrorMessage(err, "Error actualizando permisos"));
        return false;
      }
    },
    [companyId, session?.id, refreshSession]
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

        setUsers((current) => current.filter((u) => u.id !== id)); setTotal((t) => Math.max(0, t - 1));
        return true;
      } catch (err) {
        setError(extractApiErrorMessage(err, "Error eliminando usuario"));
        return false;
      }
    },
    [companyId]
  );

  return { users, total, page, pageSize, totalPages, loading, error, refresh, createUser, updateUser, deleteUser, updatePermissions };
}