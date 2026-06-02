"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import type { Asset } from "../types/activo";

type Motor = Asset; // Motor es un Asset con assetType = "Motor"
type CreateMotorInput = Omit<Motor, "id" | "tenantId">;
type UpdateMotorInput = Omit<Motor, "id" | "tenantId">;

type UseMotorsReturn = {
  motors: Motor[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  getMotor: (id: string) => Motor | undefined;
  createMotor: (input: CreateMotorInput) => Promise<string | null>;
  updateMotor: (id: string, input: UpdateMotorInput) => Promise<boolean>;
  deleteMotor: (id: string) => Promise<boolean>;
};

function mapApiToMotor(data: Record<string, unknown>, companyId: string): Motor {
  return {
    id: String(data.id),
    tenantId: `tenant-company-${companyId}`,
    code: String(data.code ?? ""),
    name: String(data.name ?? ""),
    assetType: "Motor",
    category: String(data.category ?? "") as Motor["category"],
    status: (data.status ?? "Operativo") as Motor["status"],
    site: String(data.siteId ?? ""),
    responsible: String(data.responsible ?? ""),
    brand: String(data.brand ?? ""),
    model: String(data.model ?? ""),
    serial: String(data.serial ?? ""),
    plate: String(data.plate ?? ""),
    year: String(data.year ?? ""),
    observations: String(data.observations ?? ""),
    location: String(data.location ?? ""),
    utilization: String(data.utilization ?? "0%"),
    nextMaintenance: String(data.nextMaintenance ?? ""),
    lastInspection: String(data.lastInspection ?? ""),
    alerts: Number(data.alerts ?? 0),
    availability: String(data.availability ?? "Disponible"),
    color: String(data.color ?? ""),
    maxLoad: String(data.maxLoad ?? ""),
    fuelType: String(data.fuelType ?? "") as Motor["fuelType"],
    oilType: String(data.oilType ?? ""),
    oilCapacity: String(data.oilCapacity ?? ""),
    photoUrls: Array.isArray(data.photoUrls) ? data.photoUrls as string[] : [],
  };
}

export function useMotors(): UseMotorsReturn {
  const { session } = useAuth();
  const companyId = session?.companyId ? String(session.companyId) : null;

  const [motors, setMotors] = useState<Motor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    fetch(`/api/company/${companyId}/assets?assetType=Vehiculo`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`Error ${res.status}`);
        return res.json();
      })
      .then((body: { data: Record<string, unknown>[] }) => {
        setMotors((body.data ?? []).map((item) => mapApiToMotor(item, companyId)));
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Error cargando motores");
      })
      .finally(() => setLoading(false));
  }, [companyId, tick]);

  const getMotor = useCallback(
    (id: string) => motors.find((m) => m.id === id),
    [motors]
  );

  const createMotor = useCallback(
    async (input: CreateMotorInput): Promise<string | null> => {
      if (!companyId) return null;
      try {
        const res = await fetch(`/api/company/${companyId}/assets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...input, assetType: "Motor" }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? `Error ${res.status}`);
        }
        const data = await res.json() as Record<string, unknown>;
        const newMotor = mapApiToMotor(data, companyId);
        setMotors((current) => [...current, newMotor]);
        return String(data.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error creando motor");
        return null;
      }
    },
    [companyId]
  );

  const updateMotor = useCallback(
    async (id: string, input: UpdateMotorInput): Promise<boolean> => {
      if (!companyId) return false;
      try {
        const res = await fetch(`/api/company/${companyId}/assets/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...input, assetType: "Motor" }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? `Error ${res.status}`);
        }
        const data = await res.json() as Record<string, unknown>;
        const updated = mapApiToMotor(data, companyId);
        setMotors((current) => current.map((m) => (m.id === id ? updated : m)));
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error actualizando motor");
        return false;
      }
    },
    [companyId]
  );

  const deleteMotor = useCallback(
    async (id: string): Promise<boolean> => {
      if (!companyId) return false;
      try {
        const res = await fetch(`/api/company/${companyId}/assets/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? `Error ${res.status}`);
        }
        setMotors((current) => current.filter((m) => m.id !== id));
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error eliminando motor");
        return false;
      }
    },
    [companyId]
  );

  return { motors, loading, error, refresh, getMotor, createMotor, updateMotor, deleteMotor };
}