"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";

export type CompanyUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
};

export function useCompanyUsers() {
  const { session } = useAuth();
  const companyId = session?.companyId ? String(session.companyId) : null;

  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    fetch(`/api/company/${companyId}/users`, { cache: "no-store" })
      .then((res) => { if (!res.ok) throw new Error(`Error ${res.status}`); return res.json(); })
      .then((body: { data: Record<string, unknown>[] }) => {
        setUsers((body.data ?? []).map((u) => ({
          id: String(u.id),
          name: String(u.name ?? u.username ?? ""),
          email: String(u.email ?? ""),
          role: String(u.role ?? ""),
          status: String(u.status ?? "Activo"),
        })));
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Error cargando usuarios"))
      .finally(() => setLoading(false));
  }, [companyId]);

  return { users, loading, error };
}