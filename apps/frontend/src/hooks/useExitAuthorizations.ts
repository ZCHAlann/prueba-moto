"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import { useExitAuthorizationsSocket } from "./useExitAuthorizationsSocket";

export type ExitAuthStatus = "Pendiente" | "Autorizada" | "Rechazada";

export type ExitAuthorization = {
  id: string;
  companyId: string;
  assetId: string;
  driverId: string;
  status: ExitAuthStatus;
  oilBayonetaVideoUrl: string | null;
  oilBayonetaVideoThumbUrl: string | null;
  coolantPhotoUrl: string | null;
  brakeFluidPhotoUrl: string | null;
  tirePhotosUrl: string[];
  windshieldWasherPhotoUrl: string | null;
  lightsPhotoUrl: string | null;
  batteryPhotoUrl: string | null;
  jackPhotoUrl: string | null;
  notes: string | null;
  decisionNotes: string | null;
  decisionByUserId: string | null;
  decidedAt: string | null;
  requestedAt: string;
  createdAt: string;
  updatedAt: string;
  assetLabel: string | null;
  assetName: string | null;
  assetPlate: string | null;
  // jul 2026 v6 — Foto de perfil del vehículo que arma la autorización
  // (la misma que se ve en Flotas). El backend la trae como
  // `asset_photo_url` en el SELECT del listado/detalle y la expone
  // como `assetPhotoUrl` en el JSON de salida.
  assetPhotoUrl: string | null;
  driverName: string | null;
  decidedByName: string | null;
  aiAnalysisStatus: string | null;
  correctionsSentAt: string | null;
  correctionsRound: number;
  correctionsResubmittedAt: string | null;
};

export type CreateExitAuthorizationInput = {
  assetId: number;
  driverId: number;
  oilBayonetaVideoUrl: string | null;
  oilBayonetaVideoThumbUrl: string | null;
  coolantPhotoUrl: string | null;
  brakeFluidPhotoUrl: string | null;
  tirePhotosUrl: string[];
  windshieldWasherPhotoUrl: string | null;
  lightsPhotoUrl: string | null;
  batteryPhotoUrl: string | null;
  jackPhotoUrl: string | null;
  notes: string | null;
};

export type ConductorContext = {
  driverId: number | null;
  asset: { id: string; plate: string; brand: string; model: string; profilePhotoUrl: string | null } | null;
  authorizations: ExitAuthorization[];
};

export type ListExitAuthorizationsParams = {
  status?: ExitAuthStatus;
  driverId?: number;
  assetId?: number;
  decidedBy?: number;
  date?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

export type ExitAuthPage = {
  data: ExitAuthorization[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

function mapRow(raw: Record<string, unknown>): ExitAuthorization {
  return {
    id:           String(raw.id),
    companyId:    String(raw.companyId ?? raw.company_id ?? ""),
    assetId:      String(raw.assetId    ?? raw.asset_id    ?? ""),
    driverId:     String(raw.driverId   ?? raw.driver_id   ?? ""),
    status:       (raw.status as ExitAuthStatus) ?? "Pendiente",
    oilBayonetaVideoUrl:       (raw.oilBayonetaVideoUrl       as string | null) ?? (raw.oil_bayoneta_video_url       as string | null) ?? null,
    oilBayonetaVideoThumbUrl:  (raw.oilBayonetaVideoThumbUrl  as string | null) ?? (raw.oil_bayoneta_video_thumb_url  as string | null) ?? null,
    coolantPhotoUrl:           (raw.coolantPhotoUrl           as string | null) ?? (raw.coolant_photo_url           as string | null) ?? null,
    brakeFluidPhotoUrl:        (raw.brakeFluidPhotoUrl        as string | null) ?? (raw.brake_fluid_photo_url        as string | null) ?? null,
    tirePhotosUrl:             Array.isArray(raw.tirePhotosUrl)  ? (raw.tirePhotosUrl  as string[])
                                  : Array.isArray(raw.tire_photos_url) ? (raw.tire_photos_url as string[])
                                  : [],
    windshieldWasherPhotoUrl: (raw.windshieldWasherPhotoUrl  as string | null) ?? (raw.windshield_washer_photo_url  as string | null) ?? null,
    lightsPhotoUrl:            (raw.lightsPhotoUrl            as string | null) ?? (raw.lights_photo_url            as string | null) ?? null,
    batteryPhotoUrl:           (raw.batteryPhotoUrl           as string | null) ?? (raw.battery_photo_url           as string | null) ?? null,
    jackPhotoUrl:              (raw.jackPhotoUrl              as string | null) ?? (raw.jack_photo_url              as string | null) ?? null,
    notes:                     (raw.notes   as string | null) ?? null,
    decisionNotes:             (raw.decisionNotes as string | null) ?? (raw.decision_notes as string | null) ?? null,
    decisionByUserId:          raw.decisionByUserId ? String(raw.decisionByUserId) : (raw.decision_by_user_id ? String(raw.decision_by_user_id) : null),
    decidedAt:                 (raw.decidedAt  as string | null) ?? (raw.decided_at  as string | null) ?? null,
    aiAnalysisStatus:  (raw.aiAnalysisStatus  as string | null) ?? (raw.ai_analysis_status  as string | null) ?? null,
    correctionsSentAt: (raw.correctionsSentAt as string | null) ?? (raw.corrections_sent_at as string | null) ?? null,
    correctionsRound:  typeof raw.correctionsRound === "number"
      ? raw.correctionsRound
      : (typeof raw.corrections_round === "number" ? raw.corrections_round : 0),
    correctionsResubmittedAt: (raw.correctionsResubmittedAt as string | null) ?? (raw.corrections_resubmitted_at as string | null) ?? null,
    requestedAt:               String(raw.requestedAt ?? raw.requested_at ?? ""),
    createdAt:                 String(raw.createdAt   ?? raw.created_at   ?? ""),
    updatedAt:                 String(raw.updatedAt   ?? raw.updated_at   ?? ""),
    assetLabel:    (raw.assetLabel    as string | null) ?? (raw.asset_label    as string | null) ?? null,
    assetName:     (raw.assetName     as string | null) ?? (raw.asset_name     as string | null) ?? null,
    assetPlate:    (raw.assetPlate    as string | null) ?? (raw.asset_plate    as string | null) ?? null,
    assetPhotoUrl: (raw.assetPhotoUrl as string | null) ?? (raw.asset_photo_url as string | null) ?? null,
    driverName:    (raw.driverName    as string | null) ?? (raw.driver_name    as string | null) ?? null,
    decidedByName: (raw.decidedByName as string | null) ?? (raw.decided_by_name as string | null) ?? null,
  };
}

export function useExitAuthorizations() {
  const { session } = useAuth();
  const companyId = session?.companyId ?? null;
  const companyIdStr = companyId ? String(companyId) : null;
  const [items, setItems]   = useState<ExitAuthorization[]>([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(7);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [wsChangeCount, setWsChangeCount] = useState(0);
  const [wsCorrectionsCount, setWsCorrectionsCount] = useState(0);
  // AuthId de la última decisión recibida por WS. La página del
  // conductor compara contra `shownIds` para no mostrar el popup de
  // decisión DOS veces para la misma autorización.
  const [wsLastDecidedId, setWsLastDecidedId] = useState<string | null>(null);
  // AuthId del último análisis IA aprobado. La página del conductor
  // muestra el popup "¡IA aprobó!" solo cuando este valor cambia.
  // Antes era un counter que se incrementaba N veces por análisis
  // (re-análisis, polling, etc.) y disparaba el popup múltiples veces.
  const [wsLastAiAptoId, setWsLastAiAptoId] = useState<string | null>(null);
  // AuthId del último análisis IA que falló (ej: video muy grande).
  // La página del conductor lo escucha para cerrar el AnalyzingModal
  // y mostrar el modal de "reenviar solo el video".
  const [wsLastFailedId, setWsLastFailedId] = useState<string | null>(null);
  // Mensaje del último error de análisis IA. Se setea junto con el
  // counter y se usa para mostrar el mini-modal de "reenviar" SOLO
  // cuando el errorCode es `VIDEO_TOO_LARGE`. Para otros errores
  // (transitorios, desconocidos) solo se muestra el toast.
  const [lastAnalysisError, setLastAnalysisError] = useState<{ authId: string; message: string; code: string } | null>(null);

  const fetchListRef = useRef<(params?: ListExitAuthorizationsParams) => Promise<void>>(
    async () => {},
  );

  const fetchList = useCallback(
    async (params: ListExitAuthorizationsParams = {}) => {
      if (!companyIdStr) return;
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        if (params.status)    qs.set("status",    params.status);
        if (params.driverId)  qs.set("driverId",  String(params.driverId));
        if (params.assetId)   qs.set("assetId",   String(params.assetId));
        if (params.decidedBy) qs.set("decidedBy", String(params.decidedBy));
        if (params.date)      qs.set("date",      params.date);
        if (params.from)      qs.set("from",      params.from);
        if (params.to)        qs.set("to",        params.to);
        qs.set("page",     String(params.page ?? 1));
        qs.set("pageSize", String(params.pageSize ?? 7));
        const res = await fetch(`/api/company/${companyIdStr}/exit-authorizations?${qs.toString()}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const arr: ExitAuthorization[] = (Array.isArray(json) ? json : (json.data ?? [])).map(
          (raw: Record<string, unknown>) => mapRow(raw),
        );
        setItems(arr);
        setTotal(typeof json.total === "number" ? json.total : 0);
        setPage(typeof json.page === "number" ? json.page : 1);
        setPageSize(typeof json.pageSize === "number" ? json.pageSize : 7);
        setTotalPages(typeof json.totalPages === "number" ? json.totalPages : 1);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        setLoading(false);
      }
    },
    [companyIdStr],
  );

  const fetchListSilent = useCallback(
    async (params: ListExitAuthorizationsParams = {}) => {
      if (!companyIdStr) return;
      try {
        const qs = new URLSearchParams();
        if (params.status)    qs.set("status",    params.status);
        if (params.driverId)  qs.set("driverId",  String(params.driverId));
        if (params.assetId)   qs.set("assetId",   String(params.assetId));
        if (params.decidedBy) qs.set("decidedBy", String(params.decidedBy));
        if (params.date)      qs.set("date",      params.date);
        if (params.from)      qs.set("from",      params.from);
        if (params.to)        qs.set("to",        params.to);
        qs.set("page",     String(params.page ?? 1));
        qs.set("pageSize", String(params.pageSize ?? 7));
        const res = await fetch(`/api/company/${companyIdStr}/exit-authorizations?${qs.toString()}`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const json = await res.json();
        const arr: ExitAuthorization[] = (Array.isArray(json) ? json : (json.data ?? [])).map(
          (raw: Record<string, unknown>) => mapRow(raw),
        );
        setItems(arr);
        setTotal(typeof json.total === "number" ? json.total : 0);
        setPage(typeof json.page === "number" ? json.page : 1);
        setPageSize(typeof json.pageSize === "number" ? json.pageSize : 7);
        setTotalPages(typeof json.totalPages === "number" ? json.totalPages : 1);
      } catch {
        // Silencioso
      }
    },
    [companyIdStr],
  );

  fetchListRef.current = fetchListSilent;

  useExitAuthorizationsSocket(companyIdStr, {
    onCreated: (a) => {
      const mapped = mapRow(a as unknown as Record<string, unknown>);
      setItems((prev) => {
        if (prev.some((x) => x.id === mapped.id)) {
          return prev.map((x) => (x.id === mapped.id ? mapped : x));
        }
        return [mapped, ...prev];
      });
      setWsChangeCount((n) => n + 1);
      void fetchListRef.current().catch(() => {});
    },
    onCorrectionsSent: () => {
      void fetchListRef.current().catch(() => {});
      setWsCorrectionsCount((n) => n + 1);
    },
    onCorrectionsResubmitted: () => {
      void fetchListRef.current().catch(() => {});
      setWsCorrectionsCount((n) => n + 1);
    },
    onAnalysisFailed: (data) => {
      // El análisis IA falló. Mostramos un toast con el mensaje
      // AMIGABLE (`userMessage`) que el backend clasificó. NUNCA
      // mostramos el errorMessage técnico (JSON crudo de Gemini).
      //
      // Si el código es VIDEO_TOO_LARGE, el `ResubmitVideoModal` se
      // va a abrir para que el conductor reenvíe solo el video. Para
      // otros códigos (UNKNOWN), el toast le avisa que contacte al
      // supervisor.
      toast.error(data.userMessage, {
        duration: 8000,
      });
      // Refetch silencioso para actualizar el status de la autorización.
      void fetchListRef.current().catch(() => {});
      // Guardamos el authId, el mensaje y el código. La página del
      // conductor compara contra `wsLastFailedId` para mostrar el
      // mini-modal UNA sola vez por authId, y usa `code` para decidir
      // si abrir el modal de "reenviar video" (solo VIDEO_TOO_LARGE)
      // o solo mostrar el toast.
      setWsLastFailedId(data.exitAuthorizationId);
      setLastAnalysisError({ authId: data.exitAuthorizationId, message: data.userMessage, code: data.errorCode });
    },
    onDecided: (a) => {
      const mapped = mapRow(a as unknown as Record<string, unknown>);
      setItems((prev) =>
        prev.map((x) => (x.id === mapped.id ? { ...x, ...mapped } : x))
      );
      setWsChangeCount((n) => n + 1);
      // Guardamos el authId de la última decisión. La página del
      // conductor compara contra `wsLastDecidedId` para no mostrar el
      // popup de decisión DOS veces para la misma autorización.
      setWsLastDecidedId(mapped.id);
      void fetchListRef.current().catch(() => {});
    },
    onDeleted: ({ id }) => {
      setItems((prev) => prev.filter((x) => x.id !== id));
      setWsChangeCount((n) => n + 1);
      void fetchListRef.current().catch(() => {});
    },
    onAnalysisCompleted: (data) => {
      // Refetch silencioso para actualizar aiAnalysisStatus en la lista.
      void fetchListRef.current().catch(() => {});

      if (data.decision === "apto" || data.decision === "aprobado_ia") {
        // La IA aprobó. Guardamos el authId del último análisis apto.
        // La página del conductor compara contra `wsLastAiAptoId` para
        // mostrar el popup "¡IA aprobó!" UNA sola vez por authId.
        setWsLastAiAptoId(data.exitAuthorizationId);
        // Si había un error de análisis pendiente para este mismo
        // authId, lo limpiamos: la aprobación del re-análisis significa
        // que el problema se resolvió.
        setLastAnalysisError((prev) =>
          prev?.authId === data.exitAuthorizationId ? null : prev
        );
      } else if (data.decision === "requiere_correccion") {
        // corrections-sent ya lo maneja, pero incrementamos por si acaso.
        setWsCorrectionsCount((n) => n + 1);
      }
      // requiere_revision_humana: no hacemos nada especial en el conductor,
      // el supervisor lo ve en su panel.
    },
  });

  const fetchConductorContext = useCallback(async (): Promise<ConductorContext | null> => {
    if (!companyIdStr) return null;
    try {
      const res = await fetch(`/api/company/${companyIdStr}/exit-authorizations/conductor-context`, {
        credentials: "include",
      });
      if (!res.ok) return null;
      const json = await res.json();
      return {
        driverId: json.driverId ?? null,
        asset:    json.asset ?? null,
        authorizations: (json.authorizations ?? []).map((raw: Record<string, unknown>) => mapRow(raw)),
      };
    } catch {
      return null;
    }
  }, [companyIdStr]);

  const create = useCallback(
    async (input: CreateExitAuthorizationInput) => {
      if (!companyIdStr) throw new Error("companyId requerido");
      const res = await fetch(`/api/company/${companyIdStr}/exit-authorizations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const created = mapRow(await res.json());
      setItems((prev) => {
        if (prev.some((x) => x.id === created.id)) {
          return prev.map((x) => (x.id === created.id ? created : x));
        }
        return [created, ...prev];
      });
      return created;
    },
    [companyIdStr],
  );

  const decide = useCallback(
    async (id: string, action: "approve" | "reject", notes?: string) => {
      if (!companyIdStr) throw new Error("companyId requerido");
      const res = await fetch(
        `/api/company/${companyIdStr}/exit-authorizations/${id}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ notes: notes ?? null }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const updated = mapRow(await res.json());
      setItems((prev) => prev.map((x) => (x.id === id ? updated : x)));
      return updated;
    },
    [companyIdStr],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!companyIdStr) throw new Error("companyId requerido");
      const res = await fetch(
        `/api/company/${companyIdStr}/exit-authorizations/${id}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setItems((prev) => prev.filter((x) => x.id !== id));
    },
    [companyIdStr],
  );

  return {
    items, total, page, pageSize, totalPages, loading, error,
    fetchList, fetchListSilent, fetchConductorContext, create, decide, remove,
    refetch: () => fetchList(),
    wsChangeCount, wsCorrectionsCount,
    // AuthId de la última decisión recibida por WS. La página del
    // conductor compara contra `shownIds` para no mostrar el popup de
    // decisión DOS veces.
    wsLastDecidedId,
    // AuthId del último análisis IA aprobado. La página del conductor
    // muestra el popup "¡IA aprobó!" solo cuando este valor cambia.
    wsLastAiAptoId,
    // AuthId del último análisis IA que falló. La página del conductor
    // muestra el mini-modal de "reenviar solo el video" solo cuando
    // este valor cambia.
    wsLastFailedId, lastAnalysisError,
  };
}