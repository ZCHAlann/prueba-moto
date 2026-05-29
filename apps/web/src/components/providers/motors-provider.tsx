"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/components/providers/auth-provider";
import type { Motor } from "@/types/motor";

type MotorAuditEntry = {
  id: string;
  tenantId: string;
  motorId: string;
  action: "create" | "update" | "delete";
  actor: string;
  at: string;
  description: string;
};

type MotorsState = {
  motors: Motor[];
  auditEntries: MotorAuditEntry[];
};

type MotorsContextValue = {
  ready: boolean;
  motors: Motor[];
  motorAuditEntries: MotorAuditEntry[];
  createMotor: (input: Omit<Motor, "id" | "tenantId">) => string;
  updateMotor: (id: string, input: Omit<Motor, "id" | "tenantId">) => void;
  deleteMotor: (id: string) => void;
};

const STORAGE_KEY = "fleetops-motors-v4-production-refresh";
const MotorsContext = createContext<MotorsContextValue | null>(null);

const initialState: MotorsState = {
  motors: [],
  auditEntries: [],
};

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowStamp() {
  const date = new Date();
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export function MotorsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const currentTenantId = session?.companyId ? `tenant-company-${session.companyId}` : "";
  const currentUser = { name: session?.name ?? "Sistema" };
  const [state, setState] = useState<MotorsState>(initialState);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<MotorsState>;
        setState({
          motors: parsed.motors?.length ? parsed.motors : initialState.motors,
          auditEntries: parsed.auditEntries?.length ? parsed.auditEntries : initialState.auditEntries,
        });
      }
    } catch {
      setState(initialState);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [ready, state]);

  const logAudit = useCallback(
    (motorId: string, action: MotorAuditEntry["action"], description: string) => {
      setState((current) => ({
        ...current,
        auditEntries: [
          {
            id: createId("motor-audit"),
            tenantId: currentTenantId,
            motorId,
            action,
            actor: currentUser.name,
            at: nowStamp(),
            description,
          },
          ...current.auditEntries,
        ],
      }));
    },
    [currentTenantId, currentUser.name]
  );

  const scopedMotors = useMemo(
    () => state.motors.filter((item) => item.tenantId === currentTenantId),
    [currentTenantId, state.motors]
  );

  const scopedAudit = useMemo(
    () => state.auditEntries.filter((item) => item.tenantId === currentTenantId),
    [currentTenantId, state.auditEntries]
  );

  const createMotor = useCallback(
    (input: Omit<Motor, "id" | "tenantId">) => {
      const id = createId("motor");
      setState((current) => ({
        ...current,
        motors: [...current.motors, { id, tenantId: currentTenantId, ...input }],
      }));
      logAudit(id, "create", `Motor ${input.internalCode} registrado.`);
      return id;
    },
    [currentTenantId, logAudit]
  );

  const updateMotor = useCallback(
    (id: string, input: Omit<Motor, "id" | "tenantId">) => {
      setState((current) => ({
        ...current,
        motors: current.motors.map((item) =>
          item.id === id ? { id, tenantId: currentTenantId, ...input } : item
        ),
      }));
      logAudit(id, "update", `Motor ${input.internalCode} actualizado.`);
    },
    [currentTenantId, logAudit]
  );

  const deleteMotor = useCallback(
    (id: string) => {
      const motor = state.motors.find((item) => item.id === id);
      setState((current) => ({
        ...current,
        motors: current.motors.filter((item) => item.id !== id),
      }));
      if (motor) {
        logAudit(id, "delete", `Motor ${motor.internalCode} eliminado.`);
      }
    },
    [logAudit, state.motors]
  );

  const value = useMemo<MotorsContextValue>(
    () => ({
      ready,
      motors: scopedMotors,
      motorAuditEntries: scopedAudit,
      createMotor,
      updateMotor,
      deleteMotor,
    }),
    [ready, scopedMotors, scopedAudit, createMotor, updateMotor, deleteMotor]
  );

  return <MotorsContext.Provider value={value}>{children}</MotorsContext.Provider>;
}

export function useMotors() {
  const context = useContext(MotorsContext);

  if (!context) {
    throw new Error("useMotors must be used within MotorsProvider");
  }

  return context;
}
