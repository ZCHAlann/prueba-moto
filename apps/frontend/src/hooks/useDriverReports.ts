import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

export type DriverReportInvoice = {
  receiptNumber: string;
  description:   string;
  fileUrl?:      string | null;
};

export type ApiDriverReport = {
  id:            string;
  companyId:     string;
  driverId:      string;
  driverName:    string | null;
  fuelLevel:     string | null;
  oilLevel:      string | null;
  vehicleFaults: string | null;
  invoices:      DriverReportInvoice[];
  fileUrls:      string[];
  createdAt:     string;
  updatedAt:     string;
};

export type CreateReportPayload = {
  fuelLevel?:    string | null;
  oilLevel?:     string | null;
  vehicleFaults: string;
  invoices:      DriverReportInvoice[];
  fileUrls:      string[];
};

export function useDriverReports(driverId: string | null) {
  const { session } = useAuth();
  const companyId   = session?.companyId;

  const [reports, setReports] = useState<ApiDriverReport[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!companyId || !driverId) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/company/${companyId}/drivers/${driverId}/reports`);
      const json = await res.json();
      setReports(json.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [companyId, driverId]);

  useEffect(() => { refresh(); }, [refresh]);

  const createReport = useCallback(async (payload: CreateReportPayload): Promise<ApiDriverReport> => {
    const res = await fetch(`/api/company/${companyId}/drivers/${driverId}/reports`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? `Error ${res.status}`);
    }
    const created = await res.json();
    setReports(prev => [created, ...prev]);
    return created;
  }, [companyId, driverId]);

  const [allReports, setAllReports] = useState<ApiDriverReport[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!companyId) return;
    setLoadingAll(true);
    try {
      const res  = await fetch(`/api/company/${companyId}/drivers/reports/all`);
      const json = await res.json();
      setAllReports(json.data ?? []);
    } finally {
      setLoadingAll(false);
    }
  }, [companyId]);

  const deleteReport = useCallback(async (reportId: string): Promise<boolean> => {
    if (!companyId || !driverId) return false;
    try {
      const res = await fetch(
        `/api/company/${companyId}/drivers/${driverId}/reports/${reportId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error();
      setReports(prev => prev.filter(r => r.id !== reportId));
      return true;
    } catch {
      return false;
    }
  }, [companyId, driverId]);


  return { reports, loading, refresh, createReport, allReports, loadingAll, fetchAll, deleteReport };
}