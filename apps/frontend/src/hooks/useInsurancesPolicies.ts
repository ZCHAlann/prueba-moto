import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { compressIfImage, COMPRESS_OPTS_EVIDENCE } from "../lib/mediaCompress";

export type InsuranceStatus = "Vigente" | "Por vencer" | "Vencido";

export type InsurancePolicy = {
  id: string;
  companyId: number;
  assetId: string;
  insurer: string;
  policyNumber: string;
  coverage: string;
  startDate: string;
  endDate: string;
  status: InsuranceStatus;
  notes: string;
  fileUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

type CreatePolicyInput = Omit<InsurancePolicy, "id" | "companyId" | "createdAt" | "updatedAt">;
type UpdatePolicyInput = Omit<InsurancePolicy, "id" | "companyId" | "createdAt" | "updatedAt">;

export type UseInsurancePoliciesReturn = {
  policies: InsurancePolicy[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  createPolicy: (input: CreatePolicyInput) => Promise<string | null>;
  updatePolicy: (id: string, input: UpdatePolicyInput) => Promise<boolean>;
  deletePolicy: (id: string) => Promise<boolean>;
  uploadPolicyFile: (file: File) => Promise<string | null>;
};

function mapApiToPolicy(data: Record<string, unknown>): InsurancePolicy {
  return {
    id:           String(data.id),
    companyId:    Number(data.companyId ?? data.company_id ?? 0),
    assetId:      String(data.assetId ?? data.asset_id ?? ""),
    insurer:      String(data.insurer ?? ""),
    policyNumber: String(data.policyNumber ?? data.policy_number ?? ""),
    coverage:     String(data.coverage ?? ""),
    startDate:    String(data.startDate ?? data.start_date ?? ""),
    endDate:      String(data.endDate ?? data.end_date ?? ""),
    status:       (data.status as InsuranceStatus) ?? "Vigente",
    notes:        String(data.notes ?? ""),
    fileUrl:      data.fileUrl != null
                    ? String(data.fileUrl)
                    : data.file_url != null
                    ? String(data.file_url)
                    : null,
    createdAt:    String(data.createdAt ?? data.created_at ?? ""),
    updatedAt:    String(data.updatedAt ?? data.updated_at ?? ""),
  };
}

function mapPolicyToApi(input: CreatePolicyInput | UpdatePolicyInput) {
  return {
    assetId:      input.assetId,
    insurer:      input.insurer,
    policyNumber: input.policyNumber,
    coverage:     input.coverage,
    startDate:    input.startDate,
    endDate:      input.endDate,
    status:       input.status,
    notes:        input.notes,
    fileUrl:      input.fileUrl ?? null,
  };
}

export function useAssetCenter(): UseInsurancePoliciesReturn {
  const { session } = useAuth();
  const companyId = session?.companyId ? String(session.companyId) : null;

  const [policies, setPolicies] = useState<InsurancePolicy[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [tick, setTick]         = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    fetch(`/api/company/${companyId}/insurance`, { cache: "no-store" })
      .then((res) => { if (!res.ok) throw new Error(`Error ${res.status}`); return res.json(); })
      .then((body: { data: Record<string, unknown>[] }) => {
        setPolicies((body.data ?? []).map(mapApiToPolicy));
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Error cargando pólizas"))
      .finally(() => setLoading(false));
  }, [companyId, tick]);

  // ── Upload: la ruta /insurance-files devuelve { url: string } (singular)
  const uploadPolicyFile = useCallback(async (file: File): Promise<string | null> => {
    if (!companyId) return null;
    try {
      const toUpload = await compressIfImage(file, COMPRESS_OPTS_EVIDENCE);
      const formData = new FormData();
      formData.append("file", toUpload);
      const res = await fetch(`/api/upload/insurance-files?companyId=${companyId}`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(`Upload ${res.status}`);
      const data = await res.json() as { url?: string; urls?: string[] };
      // Soporta ambas formas por si acaso
      return data.url ?? data.urls?.[0] ?? null;
    } catch {
      return null;
    }
  }, [companyId]);

  const createPolicy = useCallback(async (input: CreatePolicyInput): Promise<string | null> => {
    if (!companyId) return null;
    try {
      const res = await fetch(`/api/company/${companyId}/insurance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mapPolicyToApi(input)),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error((b as { error?: string }).error ?? `Error ${res.status}`);
      }
      const data = await res.json() as Record<string, unknown>;
      const created = mapApiToPolicy(data);
      setPolicies((prev) => [...prev, created]);
      return created.id;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creando póliza");
      return null;
    }
  }, [companyId]);

  const updatePolicy = useCallback(async (id: string, input: UpdatePolicyInput): Promise<boolean> => {
    if (!companyId) return false;
    try {
      const res = await fetch(`/api/company/${companyId}/insurance/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mapPolicyToApi(input)),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error((b as { error?: string }).error ?? `Error ${res.status}`);
      }
      const data = await res.json() as Record<string, unknown>;
      const updated = mapApiToPolicy(data);
      setPolicies((prev) => prev.map((p) => (p.id === id ? updated : p)));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error actualizando póliza");
      return false;
    }
  }, [companyId]);

  const deletePolicy = useCallback(async (id: string): Promise<boolean> => {
    if (!companyId) return false;
    try {
      const res = await fetch(`/api/company/${companyId}/insurance/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error((b as { error?: string }).error ?? `Error ${res.status}`);
      }
      setPolicies((prev) => prev.filter((p) => p.id !== id));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error eliminando póliza");
      return false;
    }
  }, [companyId]);

  return { policies, loading, error, refresh, createPolicy, updatePolicy, deletePolicy, uploadPolicyFile };
}