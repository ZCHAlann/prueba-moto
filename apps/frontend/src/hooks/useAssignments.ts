import { apiErrorText, extractApiErrorMessage } from "../lib/form-validation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

export type ApiAssignment = {
  id: string;
  companyId: number;
  assetId: string;
  driverId: string;
  startDate: string;
  endDate: string | null;
  status: "Activa" | "Inactiva" | "Finalizada";
  notes: string;
  handoverUrl: string | null;
  /** URL del PDF del acta de DEVOLUCIÓN (solo presente si status="Finalizada"). */
  returnHandoverUrl: string | null;
  // ── Acta de entrega ──────────────────
  actaNumber:       string | null;
  actaDate:         string | null;
  actaTime:         string | null;
  actaPlace:        string | null;
  actaArea:         string | null;
  driverDni:        string | null;
  driverPhone:      string | null;
  driverRole:       string | null;
  vehicleOdometer:  string | null;
  vehicleFuelLevel: string | null;
  vehicleCondition: string | null;
  novedades:        Record<string, unknown>;
  accesorios:       Record<string, unknown>;
  novedadesText:    string | null;
  signatureLogUrl:  string | null;
  signatureRespUrl: string | null;
  vehiclePhotoUrls: string[];
  createdAt: string;
  updatedAt: string;
  // ── Backend enrichment (display-only) ──────────────────────────────────────
  /** Asset name for display without a separate useAssets() call */
  assetName: string | null;
  assetPlate: string | null;
  assetBrand: string | null;
  /** Driver name for display without a separate useDrivers() call */
  driverName: string | null;
  driverCode: string | null;
};

export type HandoverPayload = {
  actaNumber?:       string | null;
  actaDate?:         string | null;
  actaTime?:         string | null;
  actaPlace?:        string | null;
  actaArea?:         string | null;
  driverDni?:        string | null;
  driverPhone?:      string | null;
  driverRole?:       string | null;
  vehicleOdometer?:  string | null;
  vehicleFuelLevel?: string | null;
  vehicleCondition?: string | null;
  novedades?:        Record<string, unknown>;
  accesorios?:       Record<string, unknown>;
  novedadesText?:    string | null;
  signatureLogUrl?:  string | null;
  signatureRespUrl?: string | null;
  vehiclePhotoUrls?: string[];
  handoverUrl?:      string | null;
  // Campos específicos del acta de DEVOLUCIÓN (solo finalize).
  returnOdometerPhotoUrl?: string | null;
  multasText?:            string | null;
};

type CreateAssignmentPayload = {
  assetId: string;
  driverId: string;
  startDate: string;
  endDate?: string | null;
  notes?: string;
  // jul 2026 — Campos opcionales del acta que se mandan en el POST
  // inicial (antes iban en un PUT adicional que reventaba con 400).
  // El backend los acepta en createAssignmentSchema.
  handoverUrl?:      string | null;
  actaDate?:         string | null;
  actaTime?:         string | null;
  actaPlace?:        string | null;
  driverDni?:        string | null;
  signatureLogUrl?:  string | null;
  signatureRespUrl?: string | null;
  vehiclePhotoUrls?: string[];
};

function mapApi(raw: Record<string, unknown>): ApiAssignment {
  return {
    id:               String(raw.id),
    companyId:        raw.companyId as number,
    assetId:          String(raw.assetId ?? raw.asset_id),
    driverId:         String(raw.driverId ?? raw.driver_id),
    startDate:   String(raw.startDate ?? raw.start_date ?? ""),
    endDate:     (raw.endDate ?? raw.end_date ?? null) as string | null,
    status:           (raw.status as ApiAssignment["status"]) ?? "Activa",
    notes:            (raw.notes as string) ?? "",
    handoverUrl: (raw.handoverUrl ?? raw.handover_url ?? null) as string | null,
    returnHandoverUrl: (raw.returnHandoverUrl ?? raw.return_handover_url ?? null) as string | null,
    actaNumber:       (raw.actaNumber as string | null) ?? null,
    actaDate:         (raw.actaDate as string | null) ?? null,
    actaTime:         (raw.actaTime as string | null) ?? null,
    actaPlace:        (raw.actaPlace as string | null) ?? null,
    actaArea:         (raw.actaArea as string | null) ?? null,
    driverDni:        (raw.driverDni as string | null) ?? null,
    driverPhone:      (raw.driverPhone as string | null) ?? null,
    driverRole:       (raw.driverRole as string | null) ?? null,
    vehicleOdometer:  (raw.vehicleOdometer as string | null) ?? null,
    vehicleFuelLevel: (raw.vehicleFuelLevel as string | null) ?? null,
    vehicleCondition: (raw.vehicleCondition as string | null) ?? null,
    novedades:        (raw.novedades as Record<string, unknown>) ?? {},
    accesorios:       (raw.accesorios as Record<string, unknown>) ?? {},
    novedadesText:    (raw.novedadesText as string | null) ?? null,
    signatureLogUrl:  (raw.signatureLogUrl as string | null) ?? null,
    signatureRespUrl: (raw.signatureRespUrl as string | null) ?? null,
    vehiclePhotoUrls: (raw.vehiclePhotoUrls as string[]) ?? [],
    createdAt:        (raw.createdAt as string) ?? "",
    updatedAt:        (raw.updatedAt as string) ?? "",
    // ── Backend enrichment ──────────────────────────────────────────────────────
    assetName:    (raw.assetName as string | null) ?? null,
    assetPlate:   (raw.assetPlate as string | null) ?? null,
    assetBrand:   (raw.assetBrand as string | null) ?? null,
    driverName:   (raw.driverName as string | null) ?? null,
    driverCode:   (raw.driverCode as string | null) ?? null,
  };
}

export type AssignmentsPage = {
  data: ApiAssignment[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type AssignmentsFilters = {
  status?: "Activa" | "Inactiva" | "Finalizada";
  assetId?: string;
  driverId?: string;
  page?: number;
  pageSize?: number;
  q?: string;
  from?: string;
  to?: string;
};

/**
 * Hook para gestión de asignaciones con DOS slots de paginación independientes
 * (la página de Asignaciones renderiza una lista de "Activas" y otra de
 * "Historial" — cada una con sus propios filtros, página y universo).
 *
 * Mutaciones (createAssignment, updateHandover, finalizeAssignment)
 * actualizan AMBOS slots para mantener la UI coherente (si se finaliza una
 * asignación activa, sale de la lista de activas y entra en la de historial).
 */
export function useAssignments() {
  const { session } = useAuth();
  const companyId = session?.companyId;

  // Slot "activas" (status=Activa)
  const [active, setActive] = useState<AssignmentsPage>({
    data: [], total: 0, page: 1, pageSize: 6, totalPages: 1,
  });
  // Slot "historial" (status=Finalizada o Activa según filtro, + q/fechas)
  const [history, setHistory] = useState<AssignmentsPage>({
    data: [], total: 0, page: 1, pageSize: 6, totalPages: 1,
  });
  // Catálogos auxiliares (no paginados)
  const [assets, setAssets] = useState<Array<{ id: string; name: string | null; plate: string | null; brand: string | null }>>([]);
  const [drivers, setDrivers] = useState<Array<{ id: string; firstName: string; lastName: string; code: string | null; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  /**
   * Fetch genérico con cualquier combinación de filtros. El caller decide
   * qué slot actualizar (activas / historial) pasando `slot`.
   */
  const fetchPage = useCallback(async (slot: "active" | "history", filters: AssignmentsFilters = {}) => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.status)   params.set("status",   filters.status);
      if (filters.assetId)  params.set("assetId",  filters.assetId);
      if (filters.driverId) params.set("driverId", filters.driverId);
      if (filters.page)     params.set("page",     String(filters.page));
      if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
      if (filters.q)        params.set("q",        filters.q);
      if (filters.from)     params.set("from",     filters.from);
      if (filters.to)       params.set("to",       filters.to);
      const qs = params.toString();
      const res = await fetch(`/api/company/${companyId}/assignments${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error(await apiErrorText(res, `Error ${res.status}`));
      const json = await res.json();
      const next: AssignmentsPage = {
        data: (json.data ?? []).map(mapApi),
        total: typeof json.total === "number" ? json.total : 0,
        page: typeof json.page === "number" ? json.page : 1,
        pageSize: typeof json.pageSize === "number" ? json.pageSize : 20,
        totalPages: typeof json.totalPages === "number" ? json.totalPages : 1,
      };
      if (slot === "active") setActive(next);
      else                   setHistory(next);
      if (Array.isArray(json.assets))  setAssets(json.assets);
      if (Array.isArray(json.drivers)) setDrivers(json.drivers);
    } catch (err) {
      setError(extractApiErrorMessage(err, "Error al cargar asignaciones"));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  // Fetch inicial: slot activas. La página padre controla la
  // paginación (`activePage`/`pageSize`) en su propio useEffect;
  // no pisar acá. El selector del wizard usa el endpoint dedicado
  // `available-assets`, ya NO depende de esta lista.
  // (Antes pedíamos 50 acá para que el filtro client-side
  // `availableAssets` viera todas las activas — bug de escala
  // que reventaba con flotas grandes. Ahora viene del server.)
  useEffect(() => { /* la página de Asignaciones dispara su propio fetchPage */ }, [fetchPage]);

  // Compatibilidad: `assignments` apunta al slot "active" (lo que la
  // mayoría de call sites asume), y `refresh` recarga el slot activo.
  // `refresh` no aplica paginación — el caller decide.
  const refresh = useCallback(() => fetchPage("active", { status: "Activa" }), [fetchPage]);

  const createAssignment = useCallback(
    async (payload: CreateAssignmentPayload): Promise<ApiAssignment> => {
      const res = await fetch(`/api/company/${companyId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId:          payload.assetId,
          driverId:         payload.driverId,
          startDate:        payload.startDate,
          endDate:          payload.endDate ?? null,
          notes:            payload.notes ?? "",
          // Solo mandamos cada campo si viene (no mandamos nulls
          // explícitos para no pisar defaults del backend). El schema
          // del backend acepta todos como opcional/null.
          handoverUrl:      payload.handoverUrl,
          actaDate:         payload.actaDate,
          actaTime:         payload.actaTime,
          actaPlace:        payload.actaPlace,
          driverDni:        payload.driverDni,
          signatureLogUrl:  payload.signatureLogUrl,
          signatureRespUrl: payload.signatureRespUrl,
          vehiclePhotoUrls: payload.vehiclePhotoUrls,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        // El backend usa el envelope en ESPAÑOL: {ok:false, error:{codigo,
        // mensaje, requestId}}. Buscamos `mensaje` primero, después
        // `message` por compat con APIs viejas, después el body crudo.
        // El fallback final es stringify del body para no mostrar
        // "[object Object]" en el toast.
        const backendMsg =
          body?.error?.mensaje
          ?? body?.error?.message
          ?? body?.error
          ?? body?.message
          ?? (body ? JSON.stringify(body) : null)
          ?? `Error ${res.status} al crear la asignación`;
        throw new Error(backendMsg);
      }
      const created = mapApi(await res.json());
      // Optimistic: aparece al inicio de la lista de activas.
      setActive((prev) => ({ ...prev, data: [created, ...prev.data], total: prev.total + 1 }));
      return created;
    },
    [companyId],
  );

  const updateHandover = useCallback(
    async (id: string, payload: HandoverPayload): Promise<ApiAssignment> => {
      const res = await fetch(`/api/company/${companyId}/assignments/${id}/handover`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? `Error ${res.status}`);
      }
      const updated = mapApi(await res.json());
      // Reemplaza en cualquier slot donde esté presente.
      setActive((prev) => ({ ...prev, data: prev.data.map((a) => (a.id === id ? updated : a)) }));
      setHistory((prev) => ({ ...prev, data: prev.data.map((a) => (a.id === id ? updated : a)) }));
      return updated;
    },
    [companyId],
  );

  const finalizeAssignment = useCallback(
    async (
      id: string,
      endDate: string,
      handoverData?: Partial<HandoverPayload>,
    ): Promise<ApiAssignment> => {
      const res = await fetch(`/api/company/${companyId}/assignments/${id}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          end_date: endDate,
          // Si vienen datos del acta de devolución, se mezclan en el body.
          // Si no, el backend finaliza sin tocar el acta.
          ...(handoverData ?? {}),
        }),
      });
      if (!res.ok) throw new Error(await apiErrorText(res, `Error ${res.status}`));
      const updated = mapApi(await res.json());
      // Sale de activas (status cambió) y entra a historial.
      setActive((prev) => ({
        ...prev,
        data: prev.data.filter((a) => a.id !== id),
        total: Math.max(0, prev.total - 1),
      }));
      setHistory((prev) => ({ ...prev, data: [updated, ...prev.data], total: prev.total + 1 }));
      return updated;
    },
    [companyId],
  );

  // jul 2026 — Vehículos disponibles para el selector del wizard
  // de asignación. Llama al endpoint dedicado del backend
  // (`/assignments/available-assets`) que filtra en el server
  // (sin asignación activa), con paginación y búsqueda.
  // Es la fuente de verdad del server: escala a cualquier tamaño de
  // flota porque NO trae todos los assets y filtra en el cliente.
  type AvailableAsset = {
    id: string;
    plate: string | null;
    code: string | null;
    name: string | null;
    brand: string | null;
    model: string | null;
    year: string | null;
    color: string | null;
    category: string | null;
    assetType: string | null;
    fuelType: string | null;
    status: string | null;
    updatedAt: string | null;
  };
  const [availableAssets, setAvailableAssets] = useState<AvailableAsset[]>([]);
  const [availableLoading, setAvailableLoading] = useState(false);
  const [availableTotal, setAvailableTotal] = useState(0);
  const fetchAvailableAssets = useCallback(
    async (opts: { q?: string; page?: number; pageSize?: number } = {}) => {
      if (!companyId) return;
      setAvailableLoading(true);
      try {
        const qs = new URLSearchParams();
        if (opts.q) qs.set("q", opts.q);
        if (opts.page) qs.set("page", String(opts.page));
        if (opts.pageSize) qs.set("pageSize", String(opts.pageSize));
        const url = `/api/company/${companyId}/assignments/available-assets?${qs}`;
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error(await apiErrorText(res, `Error ${res.status}`));
        const json = await res.json();
        setAvailableAssets(Array.isArray(json.data) ? json.data : []);
        setAvailableTotal(Number(json.total ?? 0));
      } finally {
        setAvailableLoading(false);
      }
    },
    [companyId],
  );

  // jul 2026 v2 — Espejo del fetchAvailableAssets pero para
  // conductores. Mismo problema: antes el selector del wizard
  // mostraba TODOS los conductores de la empresa, y los ya
  // asignados aparecían como disponibles. El user podía elegirlos
  // y al hacer POST reventaba con 409 (o peor, asignaba dos
  // vehículos al mismo conductor). Ahora el server devuelve solo
  // los Activos + sin asignación activa.
  type AvailableDriver = {
    id: string;
    code: string | null;
    firstName: string | null;
    lastName: string | null;
    name: string;
    dni: string | null;
    phone: string | null;
    photoUrl: string | null;
    status: string | null;
    updatedAt: string | null;
  };
  const [availableDrivers, setAvailableDrivers] = useState<AvailableDriver[]>([]);
  const [availableDriversLoading, setAvailableDriversLoading] = useState(false);
  const [availableDriversTotal, setAvailableDriversTotal] = useState(0);
  const fetchAvailableDrivers = useCallback(
    async (opts: { q?: string; page?: number; pageSize?: number } = {}) => {
      if (!companyId) return;
      setAvailableDriversLoading(true);
      try {
        const qs = new URLSearchParams();
        if (opts.q) qs.set("q", opts.q);
        if (opts.page) qs.set("page", String(opts.page));
        if (opts.pageSize) qs.set("pageSize", String(opts.pageSize));
        const url = `/api/company/${companyId}/assignments/available-drivers?${qs}`;
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error(await apiErrorText(res, `Error ${res.status}`));
        const json = await res.json();
        setAvailableDrivers(Array.isArray(json.data) ? json.data : []);
        setAvailableDriversTotal(Number(json.total ?? 0));
      } finally {
        setAvailableDriversLoading(false);
      }
    },
    [companyId],
  );

  return {
    active,
    history,
    assets,
    drivers,
    loading,
    error,
    fetchPage,
    refresh,
    createAssignment,
    updateHandover,
    finalizeAssignment,
    // jul 2026 — Vehículos disponibles para el selector del wizard.
    // Endpoint dedicado del backend: `/assignments/available-assets`.
    // Escala porque el server filtra (Operativo + sin asignación
    // activa) y pagina. NO se traen todos los assets para filtrar
    // en el cliente (eso era la solución de mierda anterior).
    availableAssets,
    availableLoading,
    availableTotal,
    fetchAvailableAssets,
    // jul 2026 v2 — Conductores disponibles. Mismo patrón que
    // availableAssets. Solo Activos + sin asignación activa.
    availableDrivers,
    availableDriversLoading,
    availableDriversTotal,
    fetchAvailableDrivers,
  };
}