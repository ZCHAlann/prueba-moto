// hooks/useFinanceInvoices.ts
// Hook para el ledger de comprobantes (Finanzas — jul 2026 modelo real).
//
// Endpoints backend:
//   GET    /api/company/:companyId/finance-invoices
//           filtros: q, sourceModule, invoiceTypeId, supplierId,
//                    assetId, from, to, page, pageSize
//   GET    /api/company/:companyId/finance-invoices/:id
//   PATCH  /api/company/:companyId/finance-invoices/:id/notes
//   GET    /api/company/:companyId/finance-invoices/:id/pdf   (binary)
//   GET    /api/company/:companyId/finance-invoice-types        (CRUD sembrados)
//   POST   /api/company/:companyId/finance-invoice-types
//   PATCH  /api/company/:companyId/finance-invoice-types/:id
//   DELETE /api/company/:companyId/finance-invoice-types/:id
//
// Devuelve paginación con page/pageSize (default 15, max 200).

import { useCallback, useState } from "react";
import { useAuth } from "../context/AuthContext";

// ─── Types ───────────────────────────────────────────────────────────────────

export type FinanceInvoiceSourceModule =
  | "combustible"
  | "peajes"
  | "mantenimiento"
  // jul 2026 v4 — vouchers standalone de Caja Chica generan facturas
  // con source_module='petty_cash'. Las trata el listado como un origen
  // más con su propio badge.
  | "petty_cash"
  | "manual";
export type FinanceInvoiceKind =
  | "combustible"
  | "peaje"
  | "repuesto"
  | "mano_obra"
  | "lavada"
  | "servicio"
  | "otro";

/** Bloque de campos hidratados al unir con la tabla de origen
 *  (fuel / toll / maintenance). Cualquier campo puede llegar null. */
export type FinanceInvoiceSourceRef = {
  fuelDate?:                  string | null;
  tollDate?:                  string | null;
  tollName?:                  string | null;
  fuelStation?:               string | null;
  maintenanceScheduledFor?:   string | null;
  maintenanceCompletedAt?:    string | null;
  maintenanceTitle?:          string | null;
  workshopName?:              string | null;
  /** ID de la row origen (combustible/peaje/mantenimiento). Útil para
   *  construir URLs de "Ir al origen" desde el front. Null si huérfano. */
  workshopId?:                number | null;
  assetCode?:                 string | null;
  assetPlate?:                string | null;
  /** ID del asset (vehículo/equipo) asociado. */
  assetId?:                   number | null;
};

export type FinanceInvoiceSupplier = {
  id:          number;
  name:        string;
  nit:         string | null;
  contactName: string | null;
  phone:       string | null;
  email:       string | null;
  address:     string | null;
};

export type FinanceInvoiceItem = {
  description: string;
  quantity:    string | number;
  unitPrice:   string | number;
  subtotal:    string | number;
  imageUrl?:   string | null;
};

export type ApiFinanceInvoice = {
  id:                    string;
  companyId:             string | number;
  sourceModule:          FinanceInvoiceSourceModule;
  sourceEntityId:        number;
  sourceAttachmentKey:   string | null;
  sourceRef:             FinanceInvoiceSourceRef | null;

  /** Fase 1 — campos básicos */
  kind:                  FinanceInvoiceKind;
  invoiceNumber:         string;
  invoiceDate:           string;
  amount:                string | number;
  currency:              string | null;
  supplierName:          string | null;
  fileUrl:               string | null;
  fileMimeType:          string | null;
  status:                "vigente" | "corregida" | "anulada";
  notes:                 string | null;

  /** jul 2026 — modelo real (NO contable) */
  legalNumber:           string | null;
  clientTaxId:           string | null;
  invoiceTypeId:         number | null;
  invoiceTypeName:       string | null;
  supplierId:            number | null;
  supplier:              FinanceInvoiceSupplier | null;
  // jul 2026 v3 — totales + datos contextuales para el desglose.
  subtotal:    number;
  ivaPercent:  number;
  ivaAmount:   number;
  total:       number;
  workshopName: string | null;
  workerName:   string | null;
  items:                 FinanceInvoiceItem[];
};

export type FinanceInvoiceListResponse = {
  total:    number;
  page:     number;
  pageSize: number;
  rows:     ApiFinanceInvoice[];
};

export type FinanceInvoiceFilters = {
  q?:             string;
  sourceModule?:  FinanceInvoiceSourceModule;
  invoiceTypeId?: number;
  supplierId?:    number;
  assetId?:       number | "all";
  from?:          string;
  to?:            string;
  page?:          number;
  pageSize?:      number;
};

export type FinanceInvoiceType = {
  id:        number;
  name:      string;
  isSystem:  boolean;
  isActive:  boolean;
};

const DEFAULT_PAGE_SIZE = 15;

// ─── Mapping ─────────────────────────────────────────────────────────────────

function asStringOrNull(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v);
}
function asNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapApi(raw: Record<string, unknown>): ApiFinanceInvoice {
  const sourceRefRaw = (raw.sourceRef ?? raw.source_ref) as
    | Record<string, unknown>
    | null
    | undefined;

  const supplierRaw = (raw.supplier ?? null) as Record<string, unknown> | null;

  const supplier: FinanceInvoiceSupplier | null = supplierRaw
    ? {
        id:          Number(supplierRaw.id ?? 0),
        name:        String(supplierRaw.name ?? ""),
        nit:         asStringOrNull(supplierRaw.nit),
        contactName: asStringOrNull(supplierRaw.contactName),
        phone:       asStringOrNull(supplierRaw.phone),
        email:       asStringOrNull(supplierRaw.email),
        address:     asStringOrNull(supplierRaw.address),
      }
    : null;

  const itemsRaw = (raw.items ?? []) as Array<Record<string, unknown>>;
  const items: FinanceInvoiceItem[] = itemsRaw.map((it) => ({
    description: String(it.description ?? ""),
    quantity:    it.quantity ?? 0,
    unitPrice:   it.unitPrice ?? 0,
    subtotal:    it.subtotal ?? 0,
    // jul 2026 v3 — imageUrl persistido al subir foto por item.
    imageUrl:    asStringOrNull(it.imageUrl ?? it.image_url),
  }));

  const sourceRef: FinanceInvoiceSourceRef | null = sourceRefRaw
    ? {
        fuelDate:                asStringOrNull(sourceRefRaw.fuelDate),
        tollDate:                asStringOrNull(sourceRefRaw.tollDate),
        tollName:                asStringOrNull(sourceRefRaw.tollName),
        fuelStation:             asStringOrNull(sourceRefRaw.fuelStation),
        maintenanceScheduledFor: asStringOrNull(sourceRefRaw.maintenanceScheduledFor),
        maintenanceCompletedAt:  asStringOrNull(sourceRefRaw.maintenanceCompletedAt),
        maintenanceTitle:        asStringOrNull(sourceRefRaw.maintenanceTitle),
        workshopId:              asNumberOrNull(sourceRefRaw.workshopId),
        workshopName:            asStringOrNull(sourceRefRaw.workshopName),
        assetCode:               asStringOrNull(sourceRefRaw.assetCode),
        assetPlate:              asStringOrNull(sourceRefRaw.assetPlate),
        assetId:                 asNumberOrNull(sourceRefRaw.assetId),
      }
    : null;

  return {
    id:                  String(raw.id ?? ""),
    companyId:           String(raw.companyId ?? raw.company_id ?? ""),
    sourceModule:        (raw.sourceModule ?? raw.source_module ?? "manual") as FinanceInvoiceSourceModule,
    sourceEntityId:      Number(raw.sourceEntityId ?? raw.source_entity_id ?? 0),
    sourceAttachmentKey: asStringOrNull(raw.sourceAttachmentKey ?? raw.source_attachment_key),
    sourceRef,

    kind:            (raw.kind as FinanceInvoiceKind) ?? "otro",
    invoiceNumber:   String(raw.invoiceNumber ?? raw.invoice_number ?? ""),
    invoiceDate:     String(raw.invoiceDate ?? raw.invoice_date ?? ""),
    amount:          raw.amount ?? "0",
    currency:        asStringOrNull(raw.currency) ?? "USD",
    supplierName:    asStringOrNull(raw.supplierName ?? raw.supplier_name),
    fileUrl:         asStringOrNull(raw.fileUrl ?? raw.file_url),
    fileMimeType:    asStringOrNull(raw.fileMimeType ?? raw.file_mime_type),
    status:          ((raw.status as ApiFinanceInvoice["status"]) ?? "vigente"),
    notes:           asStringOrNull(raw.notes),

    legalNumber:     asStringOrNull(raw.legalNumber ?? raw.legal_number),
    clientTaxId:     asStringOrNull(raw.clientTaxId ?? raw.client_tax_id),
    invoiceTypeId:   asNumberOrNull(raw.invoiceTypeId ?? raw.invoice_type_id),
    invoiceTypeName: asStringOrNull(raw.invoiceTypeName ?? raw.invoice_type_name),
    supplierId:      asNumberOrNull(raw.supplierId ?? raw.supplier_id),
    supplier,

    // jul 2026 v3 — totales + datos contextuales para el desglose.
    subtotal:    Number(raw.subtotal ?? 0),
    ivaPercent:  Number(raw.ivaPercent ?? 15),
    ivaAmount:   Number(raw.ivaAmount ?? 0),
    total:       Number(raw.total ?? raw.amount ?? 0),
    workshopName: asStringOrNull(raw.workshopName ?? raw.workshop_name),
    workerName:   asStringOrNull(raw.workerName ?? raw.worker_name),
    items,
  };
}

// ─── Hook: listado paginado ──────────────────────────────────────────────────

export function useFinanceInvoicesQuery() {
  const { session } = useAuth();
  const companyId = session?.companyId;

  const [rows, setRows]           = useState<ApiFinanceInvoice[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const fetchInvoices = useCallback(
    async (filters: FinanceInvoiceFilters = {}): Promise<FinanceInvoiceListResponse | null> => {
      if (!companyId) return null;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (filters.q && filters.q.trim())             params.set("q", filters.q.trim());
        if (filters.sourceModule)                     params.set("sourceModule", filters.sourceModule);
        if (filters.invoiceTypeId !== undefined)      params.set("invoiceTypeId", String(filters.invoiceTypeId));
        if (filters.supplierId !== undefined)         params.set("supplierId", String(filters.supplierId));
        if (filters.assetId !== undefined && filters.assetId !== "all") {
          params.set("assetId", String(filters.assetId));
        }
        if (filters.from)  params.set("from", filters.from);
        if (filters.to)    params.set("to",   filters.to);
        params.set("page",     String(filters.page     ?? 1));
        params.set("pageSize", String(filters.pageSize ?? DEFAULT_PAGE_SIZE));

        const qs = params.toString();
        const res = await fetch(
          `/api/company/${companyId}/finance-invoices${qs ? `?${qs}` : ""}`,
          { credentials: "include" },
        );
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
        }
        const json = (await res.json()) as Record<string, unknown>;
        const rowsRaw = (json.rows ?? []) as Array<Record<string, unknown>>;
        const mapped = rowsRaw.map(mapApi);
        const totalResp =
          typeof json.total === "number" ? (json.total as number) : mapped.length;
        setRows(mapped);
        setTotal(totalResp);
        return {
          total:    totalResp,
          page:     (json.page     as number) ?? filters.page     ?? 1,
          pageSize: (json.pageSize as number) ?? filters.pageSize ?? DEFAULT_PAGE_SIZE,
          rows:     mapped,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error al cargar facturas";
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [companyId],
  );

  const fetchInvoiceById = useCallback(
    async (id: string): Promise<ApiFinanceInvoice | null> => {
      if (!companyId) return null;
      try {
        const res = await fetch(
          `/api/company/${companyId}/finance-invoices/${encodeURIComponent(id)}`,
          { credentials: "include" },
        );
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
        }
        const json = (await res.json()) as Record<string, unknown>;
        return mapApi(json);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error al cargar la factura";
        setError(message);
        return null;
      }
    },
    [companyId],
  );

  return { rows, total, loading, error, fetchInvoices, fetchInvoiceById };
}

// ─── Hook: editar notas ─────────────────────────────────────────────────────

export function useUpdateFinanceInvoiceNotes() {
  const { session } = useAuth();
  const companyId = session?.companyId;
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const updateNotes = useCallback(
    async (id: string, notes: string | null): Promise<ApiFinanceInvoice | null> => {
      if (!companyId) return null;
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/company/${companyId}/finance-invoices/${encodeURIComponent(id)}/notes`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ notes: notes ?? null }),
          },
        );
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
        }
        const json = (await res.json()) as Record<string, unknown>;
        return mapApi(json);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error al guardar notas";
        setError(message);
        return null;
      } finally {
        setSaving(false);
      }
    },
    [companyId],
  );

  return { updateNotes, saving, error };
}

// ─── Hook: descargar PDF ────────────────────────────────────────────────────

export function useDownloadInvoicePdf() {
  const { session } = useAuth();
  const companyId = session?.companyId;
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const downloadPdf = useCallback(
    async (id: string, invoiceNumber?: string): Promise<boolean> => {
      if (!companyId) return false;
      setDownloading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/company/${companyId}/finance-invoices/${encodeURIComponent(id)}/pdf`,
          { credentials: "include" },
        );
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = invoiceNumber
          ? `comprobante-${invoiceNumber}.pdf`
          : "comprobante.pdf";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error al descargar PDF";
        setError(message);
        return false;
      } finally {
        setDownloading(false);
      }
    },
    [companyId],
  );

  return { downloadPdf, downloading, error };
}

// ─── Hook: CRUD invoice types (sembrados + custom) ─────────────────────────

export function useInvoiceTypesQuery() {
  const { session } = useAuth();
  const companyId = session?.companyId;
  const [types, setTypes]       = useState<FinanceInvoiceType[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const fetchTypes = useCallback(async (): Promise<FinanceInvoiceType[] | null> => {
    if (!companyId) return null;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/company/${companyId}/finance-invoice-types`,
        { credentials: "include" },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
      }
      const json = (await res.json()) as { rows: FinanceInvoiceType[] };
      setTypes(json.rows ?? []);
      return json.rows ?? [];
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al cargar tipos";
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  return { types, loading, error, fetchTypes };
}

export function useManageInvoiceTypes() {
  const { session } = useAuth();
  const companyId = session?.companyId;
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const createType = useCallback(
    async (name: string): Promise<FinanceInvoiceType | null> => {
      if (!companyId) return null;
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/company/${companyId}/finance-invoice-types`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ name }),
          },
        );
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
        }
        return (await res.json()) as FinanceInvoiceType;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error al crear tipo";
        setError(message);
        return null;
      } finally {
        setSaving(false);
      }
    },
    [companyId],
  );

  const updateType = useCallback(
    async (id: number, payload: { name?: string; isActive?: boolean }): Promise<FinanceInvoiceType | null> => {
      if (!companyId) return null;
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/company/${companyId}/finance-invoice-types/${id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(payload),
          },
        );
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
        }
        return (await res.json()) as FinanceInvoiceType;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error al actualizar tipo";
        setError(message);
        return null;
      } finally {
        setSaving(false);
      }
    },
    [companyId],
  );

  const deleteType = useCallback(
    async (id: number): Promise<boolean> => {
      if (!companyId) return false;
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/company/${companyId}/finance-invoice-types/${id}`,
          { method: "DELETE", credentials: "include" },
        );
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
        }
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error al desactivar tipo";
        setError(message);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [companyId],
  );

  return { createType, updateType, deleteType, saving, error };
}
