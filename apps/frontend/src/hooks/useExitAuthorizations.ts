"use client";

// ─────────────────────────────────────────────────────────────────────────────
//  useExitAuthorizations
// ─────────────────────────────────────────────────────────────────────────────
//  CRUD + WebSocket para el módulo de autorizaciones de salida.
//
//  Eventos WS consumidos:
//    - exit-authorization:created   → nueva solicitud
//    - exit-authorization:decided   → aprobada o rechazada
//    - exit-authorization:deleted   → borrada
//
//  Para el conductor, el filtro `driverId` se aplica en el backend
//  (sólo ve las suyas). Para el resto, ve todas las de la empresa.
//
//  Comportamiento en vivo:
//    • Cuando llega un `created`/`decided`/`deleted` por WS actualizamos el
//      estado local de forma optimista (UX instantánea).
//    • A continuación disparamos un `fetchList` silencioso (sin spinner) para
//      reconciliar cualquier campo calculado en backend (p. ej. joins) y
//      evitar filas "fantasma" si el evento WS llegó con datos incompletos.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useRef, useState } from "react";
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
  driverName: string | null;
  decidedByName: string | null;
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
  asset: { id: string; plate: string; brand: string; model: string } | null;
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
    requestedAt:               String(raw.requestedAt ?? raw.requested_at ?? ""),
    createdAt:                 String(raw.createdAt   ?? raw.created_at   ?? ""),
    updatedAt:                 String(raw.updatedAt   ?? raw.updated_at   ?? ""),
    assetLabel:   (raw.assetLabel  as string | null) ?? (raw.asset_label  as string | null) ?? null,
    assetName:    (raw.assetName   as string | null) ?? (raw.asset_name   as string | null) ?? null,
    assetPlate:   (raw.assetPlate  as string | null) ?? (raw.asset_plate  as string | null) ?? null,
    driverName:   (raw.driverName  as string | null) ?? (raw.driver_name  as string | null) ?? null,
    decidedByName: (raw.decidedByName as string | null) ?? (raw.decided_by_name as string | null) ?? null,
  };
}

export function useExitAuthorizations() {
  const { session } = useAuth();
  const companyId = session?.companyId ?? null;
  const companyIdStr = companyId ? String(companyId) : null;
  const [items, setItems]   = useState<ExitAuthorization[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [wsChangeCount, setWsChangeCount] = useState(0);
  const [wsDecidedCount, setWsDecidedCount] = useState(0);

  // ── fetchList ref-estable para que el `useEffect` del WS no la liste
  //    como dependencia (lo recrearía en cada cambio de estado).
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
        const res = await fetch(`/api/company/${companyIdStr}/exit-authorizations?${qs.toString()}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const arr: ExitAuthorization[] = (Array.isArray(json) ? json : (json.data ?? [])).map(
          (raw: Record<string, unknown>) => mapRow(raw),
        );
        setItems(arr);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        setLoading(false);
      }
    },
    [companyIdStr],
  );

  // Variante silenciosa — no toca el spinner. La usamos para reconciliar
  // estado en respuesta a eventos WebSocket sin parpadear la UI.
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
        const res = await fetch(`/api/company/${companyIdStr}/exit-authorizations?${qs.toString()}`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const json = await res.json();
        const arr: ExitAuthorization[] = (Array.isArray(json) ? json : (json.data ?? [])).map(
          (raw: Record<string, unknown>) => mapRow(raw),
        );
        setItems(arr);
      } catch {
        // Silencioso: en WS no queremos propagar errores de reconciliación.
      }
    },
    [companyIdStr],
  );

  // Mantener la ref siempre apuntando a la última versión.
  fetchListRef.current = fetchListSilent;

  // ── Suscripción WS ────────────────────────────────────────────────────────
  //  Importante: este useEffect SOLO depende de (session, companyIdStr) para
  //  evitar reconexiones por re-render. La lógica de "refetch silencioso
  //  cuando llega un evento" se hace aquí mismo.
  useExitAuthorizationsSocket(companyIdStr, {
    onCreated: (a) => {
      const mapped = mapRow(a as unknown as Record<string, unknown>);
      setItems((prev) => {
        // Si ya existe (por nuestra propia creación optimista), reemplazamos.
        if (prev.some((x) => x.id === mapped.id)) {
          return prev.map((x) => (x.id === mapped.id ? mapped : x));
        }
        return [mapped, ...prev];
      });
      setWsChangeCount((n) => n + 1);
      // Reconciliación silenciosa: si el evento WS vino con datos incompletos
      // (p. ej. sin driverName), el GET devuelve la fila completa.
      void fetchListRef.current().catch(() => {});
    },
    onDecided: (a) => {
      const mapped = mapRow(a as unknown as Record<string, unknown>);
      setItems((prev) =>
        prev.map((x) => (x.id === mapped.id ? { ...x, ...mapped } : x))
      );
      setWsChangeCount((n) => n + 1);
      setWsDecidedCount((n) => n + 1);
      void fetchListRef.current().catch(() => {});
    },
    onDeleted: ({ id }) => {
      setItems((prev) => prev.filter((x) => x.id !== id));
      setWsChangeCount((n) => n + 1);
      void fetchListRef.current().catch(() => {});
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
        {
          method: "DELETE",
          credentials: "include",
        },
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
    items, loading, error,
    fetchList, fetchListSilent, fetchConductorContext, create, decide, remove,
    refetch: () => fetchList(),
    wsChangeCount, wsDecidedCount,
  };
}
