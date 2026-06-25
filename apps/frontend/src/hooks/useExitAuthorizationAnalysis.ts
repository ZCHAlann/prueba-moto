"use client";

/**
 * useExitAuthorizationAnalysis
 *
 * Hook para consumir los análisis IA de una autorización de salida.
 *
 * Comportamiento:
 *   - Al montarse o cambiar exitAuthorizationId: hace fetch inmediato
 *     a GET /:id/analyses.
 *   - Si el status es 'en_proceso' o 'pendiente', hace polling cada 3s.
 *   - Cuando el status pasa a un estado final (aprobado_ia,
 *     requiere_correccion, requiere_revision_humana), para el polling.
 *   - Expone `triggerAnalysis()` y `reanalyze()` para que el supervisor
 *     dispare desde la UI.
 *
 * Decisión agregada:
 *   - "apto" → todos los 5 ítems pasaron
 *   - "requiere_correccion" → al menos uno falló
 *   - "requiere_revision_humana" → confianza baja o no se pudo analizar
 *   - "pendiente" → aún no termina
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export type AIItemType =
  | 'refrigerante'
  | 'frenos'
  | 'tablero_luces'
  | 'bateria'
  | 'bayoneta_aceite';

export type AIConfianza = 'alta' | 'media' | 'baja';
export type AINivel = 'ok' | 'bajo' | 'critico' | 'no_visible';
export type AIEstado = 'bueno' | 'degradado' | 'contaminado' | 'no_visible';
export type AIColor = 'miel' | 'oscuro' | 'negro' | 'no_visible';

export type AIAnalysisStatus =
  | 'pendiente'
  | 'en_proceso'
  | 'aprobado_ia'
  | 'requiere_correccion'
  | 'requiere_revision_humana';

/** Quién dictó el estado final del ítem: la IA, el supervisor, o nadie todavía. */
export type DecidedBy = 'ia' | 'supervisor' | 'sin_datos';

/**
 * Estado EFECTIVO de un ítem — combina lo que dijo Gemini con el override
 * del supervisor (si existe). Esta es la fuente de verdad que el frontend
 * debe usar, no `puedeSalir` crudo de los análisis.
 */
export type EffectiveItemStatus = {
  itemType: AIItemType;
  puedeSalir: boolean;
  enDuda: boolean;
  decidedBy: DecidedBy;
  razon: string;
};

export type AIAnalysisItem = {
  id: string;
  exitAuthorizationId: string;
  itemType: AIItemType;
  nivel: AINivel | null;
  estado: AIEstado | null;
  color: AIColor | null;
  confianza: AIConfianza;
  puedeSalir: boolean;
  observaciones: string;
  accionRecomendada: string;
  razonamiento: string;
  /** Guía específica para que el conductor sepa qué mejorar en la próxima foto. */
  aiGuidance: string;
  geminiModel: string;
  latencyMs: number;
  photoUrl: string | null;
  createdAt: string;
};

export type OverallDecision =
  | 'apto'
  | 'requiere_correccion'
  | 'requiere_revision_humana'
  | 'pendiente';

/**
 * Decisión manual del supervisor sobre un ítem.
 *   - request_recapture: la foto está mal, el conductor la rehace
 *   - override_approve:  el supervisor aprueba aunque la IA haya dicho que no
 *   - confirm_fail:      el supervisor confirma el fallo de la IA
 */
export type RejectionAction = 'request_recapture' | 'override_approve' | 'confirm_fail';

export type Rejection = {
  id: string;
  itemType: AIItemType;
  action: RejectionAction;
  reason: string;
  decidedByName: string | null;
  decidedAt: string;
};

/**
 * Item consolidado de corrección. Une lo que la IA detectó (puede_salir=false)
 * con lo que el supervisor marcó manualmente (request_recapture).
 * Es lo que el wizard del conductor usa para saber qué rehacer.
 */
export type CorrectionItem = {
  itemType: AIItemType;
  /** Campo URL de la autorización que se debe reemplazar. */
  photoField: 'coolantPhotoUrl' | 'brakeFluidPhotoUrl' | 'lightsPhotoUrl' | 'batteryPhotoUrl' | 'oilBayonetaVideoUrl';
  currentPhotoUrl: string | null;
  source: 'ia' | 'supervisor';
  reason: string;
  detail?: {
    puedeSalir: boolean;
    confianza: string;
    nivel: string | null;
    estado: string | null;
    color: string | null;
  };
  decidedByName?: string | null;
  decidedAt: string;
};

export type CorrectionsState = {
  hasCorrections: boolean;
  round: number;
  sentAt: string | null;
  resubmittedAt: string | null;
  items: CorrectionItem[];
  /** Si true, el conductor ya envió las correcciones y están pendientes
   *  de re-análisis. Si false, el conductor todavía no las envió. */
  awaitingResubmission: boolean;
};

const POLL_INTERVAL_MS = 3000;

export function useExitAuthorizationAnalysis(exitAuthorizationId: string | null) {
  const { session } = useAuth();
  const companyId = session?.companyId;

  const [analyses, setAnalyses] = useState<AIAnalysisItem[]>([]);
  const [rejections, setRejections] = useState<Rejection[]>([]);
  const [effectiveStatuses, setEffectiveStatuses] = useState<EffectiveItemStatus[]>([]);
  const [corrections, setCorrections] = useState<CorrectionsState>({
    hasCorrections: false,
    round: 0,
    sentAt: null,
    resubmittedAt: null,
    items: [],
    awaitingResubmission: false,
  });
  const [status, setStatus] = useState<AIAnalysisStatus>('pendiente');
  const [authStatus, setAuthStatus] = useState<string | null>(null);
  const [serverEffectiveDecision, setServerEffectiveDecision] = useState<OverallDecision>('pendiente');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trigError, setTrigError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const fetchAnalyses = useCallback(async () => {
    if (!exitAuthorizationId || !companyId) return;
    try {
      const res = await fetch(
        `/api/company/${companyId}/exit-authorizations/${exitAuthorizationId}/analyses`,
        { credentials: 'include', cache: 'no-store' },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAnalyses(data.analyses ?? []);
      setRejections(data.rejections ?? []);
      setEffectiveStatuses(data.effectiveStatuses ?? []);
      setCorrections(data.corrections ?? { hasCorrections: false, round: 0, sentAt: null, resubmittedAt: null, items: [], awaitingResubmission: false });
      setStatus(data.authorization?.aiAnalysisStatus ?? 'pendiente');
      setAuthStatus(data.authorization?.status ?? null);
      setServerEffectiveDecision((data.effectiveDecision as OverallDecision) ?? 'pendiente');
      return data.authorization?.aiAnalysisStatus as AIAnalysisStatus;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al obtener análisis');
      return null;
    }
  }, [exitAuthorizationId, companyId]);

  // Fetch inicial + polling.
  useEffect(() => {
    if (!exitAuthorizationId || !companyId) return;

    let cancelled = false;
    const initial = async () => {
      const s = await fetchAnalyses();
      if (cancelled) return;
      if (s === 'en_proceso' || s === 'pendiente') {
        pollRef.current = setInterval(async () => {
          const next = await fetchAnalyses();
          if (cancelled) return;
          if (next && next !== 'en_proceso' && next !== 'pendiente') {
            stopPolling();
          }
        }, POLL_INTERVAL_MS);
      }
    };
    void initial();
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [exitAuthorizationId, companyId, fetchAnalyses, stopPolling]);

  /**
   * Dispara el análisis IA completo (5 ítems). Devuelve true si se
   * encoló correctamente, false si falló el request.
   */
  const triggerAnalysis = useCallback(async () => {
    if (!exitAuthorizationId || !companyId) return false;
    setTrigError(null);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/company/${companyId}/exit-authorizations/${exitAuthorizationId}/analyze`,
        { method: 'POST', credentials: 'include' },
      );
      if (!res.ok && res.status !== 202) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? `HTTP ${res.status}`);
      }
      setStatus('en_proceso');
      // Arrancar polling.
      stopPolling();
      pollRef.current = setInterval(async () => {
        const next = await fetchAnalyses();
        if (next && next !== 'en_proceso' && next !== 'pendiente') stopPolling();
      }, POLL_INTERVAL_MS);
      return true;
    } catch (err) {
      setTrigError(err instanceof Error ? err.message : 'Error al iniciar análisis');
      return false;
    } finally {
      setLoading(false);
    }
  }, [exitAuthorizationId, companyId, fetchAnalyses, stopPolling]);

  /**
   * Re-analiza SOLO los ítems que fallaron en el análisis anterior.
   * Caso típico: conductor subió nuevas fotos y se quieren re-evaluar
   * las que estaban en rojo, no las 5.
   */
  const reanalyze = useCallback(async () => {
    if (!exitAuthorizationId || !companyId) return false;
    setTrigError(null);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/company/${companyId}/exit-authorizations/${exitAuthorizationId}/reanalyze`,
        { method: 'POST', credentials: 'include' },
      );
      if (!res.ok && res.status !== 202) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? `HTTP ${res.status}`);
      }
      setStatus('en_proceso');
      stopPolling();
      pollRef.current = setInterval(async () => {
        const next = await fetchAnalyses();
        if (next && next !== 'en_proceso' && next !== 'pendiente') stopPolling();
      }, POLL_INTERVAL_MS);
      return true;
    } catch (err) {
      setTrigError(err instanceof Error ? err.message : 'Error al re-analizar');
      return false;
    } finally {
      setLoading(false);
    }
  }, [exitAuthorizationId, companyId, fetchAnalyses, stopPolling]);

  // Decisión agregada calculada en el cliente (no se guarda en DB).
  // Decisión agregada — ya NO se calcula en el cliente con datos crudos de
  // la IA. El backend la calcula en effectiveDecision (combinando IA +
  // overrides del supervisor) y la guardamos directo en fetchAnalyses.
  // Mantenemos overallDecision como alias por compatibilidad con el resto
  // del código que ya lo usaba.
  const overallDecision: OverallDecision = useMemo(() => {
    if (status === 'pendiente' || status === 'en_proceso') return 'pendiente';
    return serverEffectiveDecision;
  }, [status, serverEffectiveDecision]);

  // Ítems que el conductor debe rehacer: la IA (o el supervisor) decidió
  // que NO pueden salir, y NO están en duda (los "en duda" van al
  // supervisor, no al conductor).
  const itemsToCorrect: AIItemType[] = useMemo(() => {
    return effectiveStatuses
      .filter((s) => !s.puedeSalir && !s.enDuda)
      .map((s) => s.itemType);
  }, [effectiveStatuses]);

  // NUEVO: ítems que esperan revisión del supervisor (la IA no tuvo
  // certeza suficiente). Útil para que el panel del supervisor distinga
  // "esto hay que corregir" de "esto hay que revisar".
  const itemsAwaitingReview: AIItemType[] = useMemo(() => {
    return effectiveStatuses.filter((s) => s.enDuda).map((s) => s.itemType);
  }, [effectiveStatuses]);

  // Ítems agrupados por tipo (uno por tipo, incluyendo el más reciente).
  const itemsByType: Record<string, AIAnalysisItem[]> = useMemo(() => {
    return analyses.reduce((acc, item) => {
      if (!acc[item.itemType]) acc[item.itemType] = [];
      acc[item.itemType].push(item);
      return acc;
    }, {} as Record<string, AIAnalysisItem[]>);
  }, [analyses]);

  // Decisiones manuales del supervisor agrupadas por ítem.
  const rejectionsByType: Record<string, Rejection> = useMemo(() => {
    return rejections.reduce((acc, r) => {
      acc[r.itemType] = r;
      return acc;
    }, {} as Record<string, Rejection>);
  }, [rejections]);

  /**
   * El supervisor marca un ítem manualmente. Si action='request_recapture',
   * la autorización pasa a 'requiere_correccion' y el conductor ve qué
   * foto rehacer (con la razón escrita por el supervisor).
   */
  const markItem = useCallback(async (itemType: AIItemType, action: RejectionAction, reason: string) => {
    if (!exitAuthorizationId || !companyId) return false;
    try {
      const res = await fetch(
        `/api/company/${companyId}/exit-authorizations/${exitAuthorizationId}/items/${itemType}/reject`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ action, reason }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? `HTTP ${res.status}`);
      }
      await fetchAnalyses();
      return true;
    } catch (err) {
      setTrigError(err instanceof Error ? err.message : 'Error al marcar ítem');
      return false;
    }
  }, [exitAuthorizationId, companyId, fetchAnalyses]);

  /**
   * El conductor (o supervisor) reemplaza UNA sola foto del análisis. Esto
   * se usa cuando el supervisor pidió reenvío de una foto mal tomada: el
   * conductor sube la nueva y la autorización se actualiza solo en el
   * campo de la URL de ese ítem. Después, se llama a reanalyze() para
   * re-evaluar solo ese ítem.
   */
  const replacePhoto = useCallback(async (
    field: 'coolantPhotoUrl' | 'brakeFluidPhotoUrl' | 'lightsPhotoUrl' | 'batteryPhotoUrl' | 'oilBayonetaVideoUrl',
    url: string,
  ) => {
    if (!exitAuthorizationId || !companyId) return false;
    try {
      const res = await fetch(
        `/api/company/${companyId}/exit-authorizations/${exitAuthorizationId}/photo`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ field, url }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? `HTTP ${res.status}`);
      }
      await fetchAnalyses();
      return true;
    } catch (err) {
      setTrigError(err instanceof Error ? err.message : 'Error al reemplazar foto');
      return false;
    }
  }, [exitAuthorizationId, companyId, fetchAnalyses]);

  // ¿El análisis ya terminó?
  const isComplete = status !== 'pendiente' && status !== 'en_proceso';

  /**
   * El supervisor devuelve la autorización al conductor con la lista
   * consolidada de correcciones. Internamente: arma el snapshot, marca
   * la autorización como requiere_correccion, y notifica al conductor.
   */
  const returnToDriver = useCallback(async () => {
    if (!exitAuthorizationId || !companyId) return null;
    setTrigError(null);
    try {
      const res = await fetch(
        `/api/company/${companyId}/exit-authorizations/${exitAuthorizationId}/return-to-driver`,
        { method: 'POST', credentials: 'include' },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      // Refrescar el estado local.
      await fetchAnalyses();
      return data as { ok: boolean; correctionsCount: number; round: number };
    } catch (err) {
      setTrigError(err instanceof Error ? err.message : 'Error al devolver al conductor');
      return null;
    }
  }, [exitAuthorizationId, companyId, fetchAnalyses]);

  /**
   * El conductor envió las correcciones (las fotos nuevas). Confirma la
   * resubmission y dispara el re-análisis de los items modificados.
   */
  const submitCorrections = useCallback(async () => {
    if (!exitAuthorizationId || !companyId) return null;
    setTrigError(null);
    try {
      const res = await fetch(
        `/api/company/${companyId}/exit-authorizations/${exitAuthorizationId}/corrections/submit`,
        { method: 'POST', credentials: 'include' },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      // Re-arrancar polling porque el re-análisis está corriendo.
      stopPolling();
      pollRef.current = setInterval(async () => {
        const next = await fetchAnalyses();
        if (next && next !== 'en_proceso' && next !== 'pendiente') stopPolling();
      }, POLL_INTERVAL_MS);
      return data as { ok: boolean; reanalyzedItems: AIItemType[] };
    } catch (err) {
      setTrigError(err instanceof Error ? err.message : 'Error al enviar correcciones');
      return null;
    }
  }, [exitAuthorizationId, companyId, fetchAnalyses, stopPolling]);

  return {
    items: analyses,
    itemsByType,
    rejections,
    rejectionsByType,
    effectiveStatuses,
    corrections,
    status,
    authStatus,
    overallDecision,
    itemsToCorrect,
    itemsAwaitingReview,
    isComplete,
    loading,
    error,
    trigError,
    triggerAnalysis,
    reanalyze,
    markItem,
    replacePhoto,
    returnToDriver,
    submitCorrections,
    /** Company ID resuelto de la sesión del usuario. Útil para que
     *  componentes que ya usan este hook no tengan que re-parsear
     *  `useAuth()` o la URL para armar endpoints. */
    companyId,
    refetch: fetchAnalyses,
  };
}
