import { useState, useCallback, useEffect } from "react";

// ─── ID helpers — backend expects prefixed IDs: "company-2", "asset-5", "company-user-4"
const fmtCompany    = (id: string) => id.startsWith("company-")      ? id : `company-${id}`;
const fmtAsset      = (id: string) => id.startsWith("asset-")        ? id : `asset-${id}`;
const fmtTechnician = (id: string) => id.startsWith("company-user-") ? id : `company-user-${id}`;

// ─── Types ────────────────────────────────────────────────────────────────────

export type OilCheckResult = {
  id: string;
  nivel: string;
  color: string;
  confianza: string;
  puede_salir: boolean;
  observaciones: string;
  accion_recomendada: string;
  photo_url: string;
  assetId: string;
  assetPlate:      string | null;  // placa del vehículo
  assetName:       string | null;  // nombre del activo
  technicianId: string;
  technicianName:  string | null;  // nombre completo del técnico
  companyId: string;
  createdAt: string;
};

type AnalyzeParams = {
  photo: File;
  assetId: string;
  technicianId: string;
  companyId: string;
};

export type UseOilCheckReturn = {
  // History
  history: OilCheckResult[];
  historyLoading: boolean;
  historyError: string;
  refetchHistory: () => void;

  // Analysis
  analyze: (params: AnalyzeParams) => Promise<OilCheckResult>;
  analyzing: boolean;
  analyzeError: string;
  clearAnalyzeError: () => void;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOilCheck(companyId: string, assetId?: string): UseOilCheckReturn {
  const [history, setHistory]               = useState<OilCheckResult[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError]     = useState("");
  const [analyzing, setAnalyzing]           = useState(false);
  const [analyzeError, setAnalyzeError]     = useState("");

  const fetchHistory = useCallback(async () => {
    if (!companyId) return;
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const params = new URLSearchParams({ companyId: fmtCompany(companyId) });
      if (assetId) params.set("assetId", fmtAsset(assetId));
      const res = await fetch(`/api/oil-check?${params}`, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? `Error ${res.status}`);
      }
      const data = await res.json() as { data: OilCheckResult[]; total: number };
      setHistory(data.data);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : "Error al cargar historial.");
    } finally {
      setHistoryLoading(false);
    }
  }, [companyId, assetId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const analyze = useCallback(async ({ photo, assetId, technicianId, companyId }: AnalyzeParams): Promise<OilCheckResult> => {
    setAnalyzing(true);
    setAnalyzeError("");
    try {
      const formData = new FormData();
      formData.append("photo", photo);
      const params = new URLSearchParams({
        assetId:      fmtAsset(assetId),
        technicianId: fmtTechnician(technicianId),
        companyId:    fmtCompany(companyId),
      });
      const res = await fetch(`/api/oil-check?${params}`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? `Error ${res.status}`);
      }
      const result = await res.json() as OilCheckResult;
      setHistory(prev => [result, ...prev]);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al analizar la foto.";
      setAnalyzeError(msg);
      throw new Error(msg);
    } finally {
      setAnalyzing(false);
    }
  }, []);

  const clearAnalyzeError = useCallback(() => setAnalyzeError(""), []);

  return {
    history,
    historyLoading,
    historyError,
    refetchHistory: fetchHistory,
    analyze,
    analyzing,
    analyzeError,
    clearAnalyzeError,
  };
}