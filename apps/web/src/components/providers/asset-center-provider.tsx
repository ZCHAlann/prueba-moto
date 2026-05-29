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
import type {
  AssetDocument,
  AssetExpiry,
  InsurancePolicy,
  OdometerRecord,
  OilChangeRecord,
  OilType,
} from "@/types/activo";

type AssetCenterAuditEntry = {
  id: string;
  tenantId: string;
  assetId: string;
  entity: string;
  action: "create" | "update" | "delete";
  actor: string;
  at: string;
  description: string;
};

type AssetCenterState = {
  assetDocuments: AssetDocument[];
  insurancePolicies: InsurancePolicy[];
  assetExpiries: AssetExpiry[];
  odometerRecords: OdometerRecord[];
  oilTypes: OilType[];
  oilChanges: OilChangeRecord[];
  auditEntries: AssetCenterAuditEntry[];
};

type AssetCenterContextValue = {
  ready: boolean;
  assetDocuments: AssetDocument[];
  insurancePolicies: InsurancePolicy[];
  assetExpiries: AssetExpiry[];
  odometerRecords: OdometerRecord[];
  oilTypes: OilType[];
  oilChanges: OilChangeRecord[];
  assetCenterAuditEntries: AssetCenterAuditEntry[];
  createAssetDocument: (input: Omit<AssetDocument, "id" | "tenantId">) => string;
  updateAssetDocument: (id: string, input: Omit<AssetDocument, "id" | "tenantId">) => void;
  deleteAssetDocument: (id: string) => void;
  createInsurancePolicy: (input: Omit<InsurancePolicy, "id" | "tenantId">) => string;
  updateInsurancePolicy: (id: string, input: Omit<InsurancePolicy, "id" | "tenantId">) => void;
  deleteInsurancePolicy: (id: string) => void;
  createAssetExpiry: (input: Omit<AssetExpiry, "id" | "tenantId">) => string;
  updateAssetExpiry: (id: string, input: Omit<AssetExpiry, "id" | "tenantId">) => void;
  deleteAssetExpiry: (id: string) => void;
  createOdometerRecord: (input: Omit<OdometerRecord, "id" | "tenantId">) => string;
  deleteOdometerRecord: (id: string) => void;
  createOilType: (input: Omit<OilType, "id" | "tenantId">) => string;
  updateOilType: (id: string, input: Omit<OilType, "id" | "tenantId">) => void;
  deleteOilType: (id: string) => void;
  createOilChange: (input: Omit<OilChangeRecord, "id" | "tenantId">) => string;
  deleteOilChange: (id: string) => void;
};

const STORAGE_KEY = "fleetops-asset-center-v4-production-refresh";

const AssetCenterContext = createContext<AssetCenterContextValue | null>(null);

const initialState: AssetCenterState = {
  assetDocuments: [],
  insurancePolicies: [],
  assetExpiries: [],
  odometerRecords: [],
  oilTypes: [],
  oilChanges: [],
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

function removeById<T extends { id: string }>(items: T[], id: string) {
  return items.filter((item) => item.id !== id);
}

export function AssetCenterProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const currentTenantId = session?.companyId ? `tenant-company-${session.companyId}` : "";
  const currentUser = { name: session?.name ?? "Sistema" };
  const [state, setState] = useState<AssetCenterState>(initialState);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AssetCenterState>;
        setState({
          ...initialState,
          ...parsed,
          assetDocuments: parsed.assetDocuments?.length
            ? parsed.assetDocuments
            : initialState.assetDocuments,
          insurancePolicies: parsed.insurancePolicies?.length
            ? parsed.insurancePolicies
            : initialState.insurancePolicies,
          assetExpiries: parsed.assetExpiries?.length
            ? parsed.assetExpiries
            : initialState.assetExpiries,
          odometerRecords: parsed.odometerRecords?.length
            ? parsed.odometerRecords
            : initialState.odometerRecords,
          oilTypes: parsed.oilTypes?.length ? parsed.oilTypes : initialState.oilTypes,
          oilChanges: parsed.oilChanges?.length ? parsed.oilChanges : initialState.oilChanges,
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

  const logAssetAudit = useCallback(
    (assetId: string, entity: string, action: AssetCenterAuditEntry["action"], description: string) => {
      setState((current) => ({
        ...current,
        auditEntries: [
          {
            id: createId("center-audit"),
            tenantId: currentTenantId,
            assetId,
            entity,
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

  const scoped = useMemo(
    () => ({
      assetDocuments: state.assetDocuments.filter((item) => item.tenantId === currentTenantId),
      insurancePolicies: state.insurancePolicies.filter((item) => item.tenantId === currentTenantId),
      assetExpiries: state.assetExpiries.filter((item) => item.tenantId === currentTenantId),
      odometerRecords: state.odometerRecords.filter((item) => item.tenantId === currentTenantId),
      oilTypes: state.oilTypes.filter((item) => item.tenantId === currentTenantId),
      oilChanges: state.oilChanges.filter((item) => item.tenantId === currentTenantId),
      assetCenterAuditEntries: state.auditEntries.filter((item) => item.tenantId === currentTenantId),
    }),
    [currentTenantId, state]
  );

  const createAssetDocument = useCallback(
    (input: Omit<AssetDocument, "id" | "tenantId">) => {
      const id = createId("doc");
      setState((current) => ({
        ...current,
        assetDocuments: [...current.assetDocuments, { id, tenantId: currentTenantId, ...input }],
      }));
      logAssetAudit(input.assetId, "documents", "create", `Documento ${input.title} registrado.`);
      return id;
    },
    [currentTenantId, logAssetAudit]
  );

  const updateAssetDocument = useCallback(
    (id: string, input: Omit<AssetDocument, "id" | "tenantId">) => {
      setState((current) => ({
        ...current,
        assetDocuments: current.assetDocuments.map((item) =>
          item.id === id ? { id, tenantId: currentTenantId, ...input } : item
        ),
      }));
      logAssetAudit(input.assetId, "documents", "update", `Documento ${input.title} actualizado.`);
    },
    [currentTenantId, logAssetAudit]
  );

  const deleteAssetDocument = useCallback(
    (id: string) => {
      const document = state.assetDocuments.find((item) => item.id === id);
      setState((current) => ({
        ...current,
        assetDocuments: removeById(current.assetDocuments, id),
      }));
      if (document) {
        logAssetAudit(document.assetId, "documents", "delete", `Documento ${document.title} eliminado.`);
      }
    },
    [logAssetAudit, state.assetDocuments]
  );

  const createInsurancePolicy = useCallback(
    (input: Omit<InsurancePolicy, "id" | "tenantId">) => {
      const id = createId("ins");
      setState((current) => ({
        ...current,
        insurancePolicies: [
          ...current.insurancePolicies,
          { id, tenantId: currentTenantId, ...input },
        ],
      }));
      logAssetAudit(input.assetId, "insurance", "create", `Poliza ${input.policyNumber} registrada.`);
      return id;
    },
    [currentTenantId, logAssetAudit]
  );

  const updateInsurancePolicy = useCallback(
    (id: string, input: Omit<InsurancePolicy, "id" | "tenantId">) => {
      setState((current) => ({
        ...current,
        insurancePolicies: current.insurancePolicies.map((item) =>
          item.id === id ? { id, tenantId: currentTenantId, ...input } : item
        ),
      }));
      logAssetAudit(input.assetId, "insurance", "update", `Poliza ${input.policyNumber} actualizada.`);
    },
    [currentTenantId, logAssetAudit]
  );

  const deleteInsurancePolicy = useCallback(
    (id: string) => {
      const policy = state.insurancePolicies.find((item) => item.id === id);
      setState((current) => ({
        ...current,
        insurancePolicies: removeById(current.insurancePolicies, id),
      }));
      if (policy) {
        logAssetAudit(policy.assetId, "insurance", "delete", `Poliza ${policy.policyNumber} eliminada.`);
      }
    },
    [logAssetAudit, state.insurancePolicies]
  );

  const createAssetExpiry = useCallback(
    (input: Omit<AssetExpiry, "id" | "tenantId">) => {
      const id = createId("exp");
      setState((current) => ({
        ...current,
        assetExpiries: [...current.assetExpiries, { id, tenantId: currentTenantId, ...input }],
      }));
      logAssetAudit(input.assetId, "expiries", "create", `Vencimiento ${input.title} registrado.`);
      return id;
    },
    [currentTenantId, logAssetAudit]
  );

  const updateAssetExpiry = useCallback(
    (id: string, input: Omit<AssetExpiry, "id" | "tenantId">) => {
      setState((current) => ({
        ...current,
        assetExpiries: current.assetExpiries.map((item) =>
          item.id === id ? { id, tenantId: currentTenantId, ...input } : item
        ),
      }));
      logAssetAudit(input.assetId, "expiries", "update", `Vencimiento ${input.title} actualizado.`);
    },
    [currentTenantId, logAssetAudit]
  );

  const deleteAssetExpiry = useCallback(
    (id: string) => {
      const expiry = state.assetExpiries.find((item) => item.id === id);
      setState((current) => ({
        ...current,
        assetExpiries: removeById(current.assetExpiries, id),
      }));
      if (expiry) {
        logAssetAudit(expiry.assetId, "expiries", "delete", `Vencimiento ${expiry.title} eliminado.`);
      }
    },
    [logAssetAudit, state.assetExpiries]
  );

  const createOdometerRecord = useCallback(
    (input: Omit<OdometerRecord, "id" | "tenantId">) => {
      const id = createId("odo");
      setState((current) => ({
        ...current,
        odometerRecords: [...current.odometerRecords, { id, tenantId: currentTenantId, ...input }],
      }));
      logAssetAudit(input.assetId, "odometer", "create", `Lectura ${input.reading} registrada.`);
      return id;
    },
    [currentTenantId, logAssetAudit]
  );

  const deleteOdometerRecord = useCallback(
    (id: string) => {
      const record = state.odometerRecords.find((item) => item.id === id);
      setState((current) => ({
        ...current,
        odometerRecords: removeById(current.odometerRecords, id),
      }));
      if (record) {
        logAssetAudit(record.assetId, "odometer", "delete", `Lectura ${record.reading} eliminada.`);
      }
    },
    [logAssetAudit, state.odometerRecords]
  );

  const createOilType = useCallback(
    (input: Omit<OilType, "id" | "tenantId">) => {
      const id = createId("oil");
      setState((current) => ({
        ...current,
        oilTypes: [...current.oilTypes, { id, tenantId: currentTenantId, ...input }],
      }));
      setState((current) => ({
        ...current,
        auditEntries: [
          {
            id: createId("center-audit"),
            tenantId: currentTenantId,
            assetId: "global-oil",
            entity: "oilTypes",
            action: "create",
            actor: currentUser.name,
            at: nowStamp(),
            description: `Tipo de aceite ${input.name} registrado.`,
          },
          ...current.auditEntries,
        ],
      }));
      return id;
    },
    [currentTenantId, currentUser.name]
  );

  const updateOilType = useCallback(
    (id: string, input: Omit<OilType, "id" | "tenantId">) => {
      setState((current) => ({
        ...current,
        oilTypes: current.oilTypes.map((item) =>
          item.id === id ? { id, tenantId: currentTenantId, ...input } : item
        ),
      }));
      setState((current) => ({
        ...current,
        auditEntries: [
          {
            id: createId("center-audit"),
            tenantId: currentTenantId,
            assetId: "global-oil",
            entity: "oilTypes",
            action: "update",
            actor: currentUser.name,
            at: nowStamp(),
            description: `Tipo de aceite ${input.name} actualizado.`,
          },
          ...current.auditEntries,
        ],
      }));
    },
    [currentTenantId, currentUser.name]
  );

  const deleteOilType = useCallback(
    (id: string) => {
      const oilType = state.oilTypes.find((item) => item.id === id);
      setState((current) => ({
        ...current,
        oilTypes: removeById(current.oilTypes, id),
      }));
      if (oilType) {
        setState((current) => ({
          ...current,
          auditEntries: [
            {
              id: createId("center-audit"),
              tenantId: currentTenantId,
              assetId: "global-oil",
              entity: "oilTypes",
              action: "delete",
              actor: currentUser.name,
              at: nowStamp(),
              description: `Tipo de aceite ${oilType.name} eliminado.`,
            },
            ...current.auditEntries,
          ],
        }));
      }
    },
    [currentTenantId, currentUser.name, state.oilTypes]
  );

  const createOilChange = useCallback(
    (input: Omit<OilChangeRecord, "id" | "tenantId">) => {
      const id = createId("oilchg");
      setState((current) => ({
        ...current,
        oilChanges: [...current.oilChanges, { id, tenantId: currentTenantId, ...input }],
      }));
      logAssetAudit(input.assetId, "oilChanges", "create", `Cambio de aceite registrado para ${input.assetId}.`);
      return id;
    },
    [currentTenantId, logAssetAudit]
  );

  const deleteOilChange = useCallback(
    (id: string) => {
      const oilChange = state.oilChanges.find((item) => item.id === id);
      setState((current) => ({
        ...current,
        oilChanges: removeById(current.oilChanges, id),
      }));
      if (oilChange) {
        logAssetAudit(oilChange.assetId, "oilChanges", "delete", `Cambio de aceite ${id} eliminado.`);
      }
    },
    [logAssetAudit, state.oilChanges]
  );

  const value = useMemo<AssetCenterContextValue>(
    () => ({
      ready,
      assetDocuments: scoped.assetDocuments,
      insurancePolicies: scoped.insurancePolicies,
      assetExpiries: scoped.assetExpiries,
      odometerRecords: scoped.odometerRecords,
      oilTypes: scoped.oilTypes,
      oilChanges: scoped.oilChanges,
      assetCenterAuditEntries: scoped.assetCenterAuditEntries,
      createAssetDocument,
      updateAssetDocument,
      deleteAssetDocument,
      createInsurancePolicy,
      updateInsurancePolicy,
      deleteInsurancePolicy,
      createAssetExpiry,
      updateAssetExpiry,
      deleteAssetExpiry,
      createOdometerRecord,
      deleteOdometerRecord,
      createOilType,
      updateOilType,
      deleteOilType,
      createOilChange,
      deleteOilChange,
    }),
    [
      ready,
      scoped,
      createAssetDocument,
      updateAssetDocument,
      deleteAssetDocument,
      createInsurancePolicy,
      updateInsurancePolicy,
      deleteInsurancePolicy,
      createAssetExpiry,
      updateAssetExpiry,
      deleteAssetExpiry,
      createOdometerRecord,
      deleteOdometerRecord,
      createOilType,
      updateOilType,
      deleteOilType,
      createOilChange,
      deleteOilChange,
    ]
  );

  return <AssetCenterContext.Provider value={value}>{children}</AssetCenterContext.Provider>;
}

export function useAssetCenter() {
  const context = useContext(AssetCenterContext);

  if (!context) {
    throw new Error("useAssetCenter must be used within AssetCenterProvider");
  }

  return context;
}
