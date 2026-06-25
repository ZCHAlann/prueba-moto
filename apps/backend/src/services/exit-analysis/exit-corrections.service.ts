// services/exit-analysis/exit-corrections.service.ts
//
// Consolida la lista de items que el conductor debe corregir (rehacer foto
// o video). Combina dos fuentes:
//
//   1. Análisis IA: items con puede_salir=false (o confianza="baja")
//      que tienen aiGuidance útil para el conductor.
//   2. Rechazos manuales del supervisor: rejections con action='request_recapture'.
//
// El resultado es una lista consolidada (CorrectionsListItem[]) que se
// guarda en company_exit_authorizations.correctionsSnapshot y se le
// envía al conductor.
//
// Flujo:
//
//   1. Conductor sube 5 fotos → IA analiza → algunas fallan.
//   2. buildCorrectionsList(authId) consolida la lista.
//   3. Supervisor hace click en "Devolver al conductor con N correcciones"
//      → returnToDriver() guarda el snapshot, marca el status como
//      requiere_correccion con correctionsSentAt = now().
//   4. Conductor entra al wizard (con ?correction=exit-auth-N), ve el
//      popup con la lista, rehace SOLO esas fotos, las sube.
//   5. submitCorrections() actualiza las URLs en la autorización y
//      dispara re-análisis SOLO de esos items (vía reanalyzeFailedItems).
//
// Si en una nueva ronda también hay items que fallan, el snapshot se
// SOBREESCRIBE con la nueva lista. La anterior queda en
// correctionsRound++ (counter de rondas).

import { eq, and, inArray, isNull, desc } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  companyExitAuthorizations,
  exitAuthorizationAnalyses,
  exitAnalysisRejections,
} from '../../db/schema/operational';
import { wsBroadcast } from '../websocket';
import { reanalyzeSpecificItems } from './exit-analysis.service';
import { AppError } from '../../lib/errors';
import { parseId } from '../../lib/ids';
import {
  AI_ANALYZED_URL_FIELDS,
  type ExitCheckItemType,
  type MultiItemAnalysisResult,
} from './types';

export type CorrectionSource = 'ia' | 'supervisor';

export type CorrectionsListItem = {
  itemType: ExitCheckItemType;
  /** Campo URL de la autorización que se debe reemplazar. */
  photoField: 'coolantPhotoUrl' | 'brakeFluidPhotoUrl' | 'lightsPhotoUrl' | 'batteryPhotoUrl' | 'oilBayonetaVideoUrl';
  /** URL actual de la foto/video (para mostrarla al supervisor). */
  currentPhotoUrl: string | null;
  /** Quién originó la corrección: IA o supervisor. */
  source: CorrectionSource;
  /** Razón: si source=ia, es el aiGuidance + observaciones; si source=supervisor, es la razón escrita. */
  reason: string;
  /** Si source=ia, el detalle técnico (nivel/estado/color/confianza). */
  detail?: {
    puedeSalir: boolean;
    confianza: string;
    nivel: string | null;
    estado: string | null;
    color: string | null;
  };
  /** Quién marcó la corrección manual (si source=supervisor). */
  decidedByName?: string | null;
  /** Cuándo se decidió. */
  decidedAt: string;
};

export type CorrectionsSnapshot = {
  round: number;
  sentAt: string;
  items: CorrectionsListItem[];
};

/**
 * Construye la lista consolidada de correcciones para una autorización.
 * Combina:
 *   - Análisis IA con puede_salir=false o confianza="baja" (con aiGuidance).
 *   - Rechazos manuales con action='request_recapture' (con la razón del
 *     supervisor).
 *
 * Si un ítem está en ambas fuentes, gana la corrección manual del
 * supervisor (porque es más reciente y específica).
 */
export async function buildCorrectionsList(params: {
  exitAuthorizationId: number;
  companyId: number;
}): Promise<CorrectionsListItem[]> {
  // 1. Traer todos los análisis IA de la autorización.
  const analyses = await db
    .select()
    .from(exitAuthorizationAnalyses)
    .where(and(
      eq(exitAuthorizationAnalyses.exitAuthorizationId, params.exitAuthorizationId),
      eq(exitAuthorizationAnalyses.companyId, params.companyId),
    ))
    .orderBy(desc(exitAuthorizationAnalyses.createdAt));

  // Para cada itemType, quedarnos con el análisis más reciente.
  const latestByType = new Map<ExitCheckItemType, typeof analyses[number]>();
  for (const a of analyses) {
    const t = a.itemType as ExitCheckItemType;
    if (!latestByType.has(t)) latestByType.set(t, a);
  }

  // 2. Traer los rechazos manuales ACTIVOS (no superseded).
  const rejections = await db
    .select()
    .from(exitAnalysisRejections)
    .where(and(
      eq(exitAnalysisRejections.exitAuthorizationId, params.exitAuthorizationId),
      eq(exitAnalysisRejections.companyId, params.companyId),
      isNull(exitAnalysisRejections.supersededAt),
    ));

  const rejectionByType = new Map<ExitCheckItemType, typeof rejections[number]>();
  for (const r of rejections) {
    if (r.action === 'request_recapture') {
      rejectionByType.set(r.itemType as ExitCheckItemType, r);
    }
  }

  // 3. Traer la autorización para tener las URLs actuales.
  const [auth] = await db
    .select()
    .from(companyExitAuthorizations)
    .where(and(
      eq(companyExitAuthorizations.id, params.exitAuthorizationId),
      eq(companyExitAuthorizations.companyId, params.companyId),
    ))
    .limit(1);

  if (!auth) throw new AppError(404, 'Autorización no encontrada.');

  // 4. Construir la lista consolidada. Iteramos sobre los 5 items
  //    conocidos, no sobre los análisis, para garantizar que aparezcan
  //    incluso si un item nunca fue analizado.
  const consolidated: CorrectionsListItem[] = [];
  const itemTypes: ExitCheckItemType[] = [
    'refrigerante', 'frenos', 'tablero_luces', 'bateria', 'bayoneta_aceite',
  ];

  for (const itemType of itemTypes) {
    const rejection = rejectionByType.get(itemType);
    const analysis  = latestByType.get(itemType);

    // Si el supervisor marcó este item como mal, gana siempre.
    if (rejection) {
      const field = AI_ANALYZED_URL_FIELDS.find((f) => f.type === itemType)?.field as
        'coolantPhotoUrl' | 'brakeFluidPhotoUrl' | 'lightsPhotoUrl' | 'batteryPhotoUrl' | 'oilBayonetaVideoUrl';
      consolidated.push({
        itemType,
        photoField: field,
        currentPhotoUrl: (auth as any)[field] ?? null,
        source: 'supervisor',
        reason: rejection.reason,
        decidedByName: rejection.decidedByName,
        decidedAt: rejection.decidedAt.toISOString(),
      });
      continue;
    }

    // Si no hay rechazo manual, ver si la IA marcó como fallido o
    // confianza baja.
    if (analysis && (!analysis.puedeSalir || analysis.confianza === 'baja')) {
      // Construir la razón: priorizar aiGuidance si existe, sino
      // observaciones + accionRecomendada.
      const reason = analysis.aiGuidance && analysis.aiGuidance.trim().length > 0
        ? analysis.aiGuidance
        : `${analysis.observaciones} ${analysis.accionRecomendada}`.trim();
      const field = AI_ANALYZED_URL_FIELDS.find((f) => f.type === itemType)?.field as
        'coolantPhotoUrl' | 'brakeFluidPhotoUrl' | 'lightsPhotoUrl' | 'batteryPhotoUrl' | 'oilBayonetaVideoUrl';
      consolidated.push({
        itemType,
        photoField: field,
        currentPhotoUrl: (auth as any)[field] ?? null,
        source: 'ia',
        reason,
        detail: {
          puedeSalir: analysis.puedeSalir,
          confianza: analysis.confianza,
          nivel: analysis.nivel,
          estado: analysis.estado,
          color: analysis.color,
        },
        decidedAt: analysis.createdAt.toISOString(),
      });
    }
  }

  return consolidated;
}

/**
 * El supervisor devuelve la autorización al conductor. Consolida la lista
 * de correcciones, la guarda en correctionsSnapshot, y marca la
 * autorización como requiere_correccion con correctionsSentAt.
 *
 * Si no hay correcciones, devuelve error 400.
 */
export async function returnToDriver(params: {
  exitAuthorizationId: number;
  companyId: number;
  decidedBy: { id: number | null; name: string | null };
}): Promise<{ snapshot: CorrectionsSnapshot; count: number }> {
  // 1. Cargar la autorización.
  const [auth] = await db
    .select()
    .from(companyExitAuthorizations)
    .where(and(
      eq(companyExitAuthorizations.id, params.exitAuthorizationId),
      eq(companyExitAuthorizations.companyId, params.companyId),
    ))
    .limit(1);

  if (!auth) throw new AppError(404, 'Autorización no encontrada.');
  if (auth.status !== 'Pendiente') {
    throw new AppError(409, `La autorización está en estado "${auth.status}" y no se puede devolver al conductor.`);
  }

  // 2. Construir la lista consolidada.
  const items = await buildCorrectionsList(params);
  if (items.length === 0) {
    throw new AppError(400, 'No hay correcciones que enviar al conductor. Si todo aprueba, autorice o rechace la salida.');
  }

  await persistCorrectionsSnapshotAndNotify({
    exitAuthorizationId: params.exitAuthorizationId,
    companyId: params.companyId,
    items,
    previousRound: auth.correctionsRound ?? 0,
    sentBy: params.decidedBy.name,
  });

  return {
    snapshot: {
      round: (auth.correctionsRound ?? 0) + 1,
      sentAt: new Date().toISOString(),
      items,
    },
    count: items.length,
  };
}

/**
 * Helper interno: persiste el snapshot, marca correctionsSentAt, y notifica
 * por WebSocket. Es la operación centralizada de "devolver al conductor".
 *
 * Usado por:
 *   - returnToDriver (cuando el supervisor hace click manual).
 *   - autoSendCorrectionsToDriver (cuando Gemini detecta que algo falla y
 *     devuelve automáticamente, sin pasar por el supervisor).
 *   - El endpoint /corrections/submit (cuando el conductor subió las
 *     correcciones y la nueva ronda también falla).
 */
async function persistCorrectionsSnapshotAndNotify(params: {
  exitAuthorizationId: number;
  companyId: number;
  items: CorrectionsListItem[];
  previousRound: number;
  sentBy?: string | null;
}): Promise<CorrectionsSnapshot> {
  const snapshot: CorrectionsSnapshot = {
    round: params.previousRound + 1,
    sentAt: new Date().toISOString(),
    items: params.items,
  };

  await db
    .update(companyExitAuthorizations)
    .set({
      aiAnalysisStatus: 'requiere_correccion',
      correctionsSnapshot: snapshot as any,
      correctionsSentAt: new Date(),
      correctionsResubmittedAt: null, // reset por si es una nueva ronda
      correctionsRound: snapshot.round,
      updatedAt: new Date(),
    } as any)
    .where(eq(companyExitAuthorizations.id, params.exitAuthorizationId));

  wsBroadcast(params.companyId, {
    type: 'exit-authorization:corrections-sent',
    data: {
      exitAuthorizationId: String(params.exitAuthorizationId),
      correctionsCount: params.items.length,
      round: snapshot.round,
      sentBy: params.sentBy ?? 'ia',
    },
  });

  return snapshot;
}

/**
 * AUTO-ENVÍO de correcciones al conductor (sin intervención del supervisor).
 *
 * Lo llama el servicio de análisis cuando Gemini termina y la decisión
 * efectiva es "requiere_correccion". En ese caso, el conductor DEBE recibir
 * la lista de items a rehacer directamente por WebSocket — no esperamos
 * a que el supervisor apruebe el envío.
 *
 * Idempotente: si ya hay correcciones pendientes (`correctionsSentAt` sin
 * `correctionsResubmittedAt`), no hace nada. Solo emite una nueva ronda
 * cuando el conductor YA envió las anteriores.
 */
export async function autoSendCorrectionsToDriver(params: {
  exitAuthorizationId: number;
  companyId: number;
}): Promise<{ sent: boolean; count: number; round: number }> {
  const [auth] = await db
    .select()
    .from(companyExitAuthorizations)
    .where(and(
      eq(companyExitAuthorizations.id, params.exitAuthorizationId),
      eq(companyExitAuthorizations.companyId, params.companyId),
    ))
    .limit(1);

  if (!auth) throw new AppError(404, 'Autorización no encontrada.');
  if (auth.status !== 'Pendiente') {
    return { sent: false, count: 0, round: auth.correctionsRound ?? 0 };
  }

  // Si ya hay correcciones pendientes (sentAt sin resubmittedAt), no
  // machacamos la ronda actual — el conductor todavía no las respondió.
  if (auth.correctionsSentAt && !auth.correctionsResubmittedAt) {
    return { sent: false, count: 0, round: auth.correctionsRound ?? 0 };
  }

  const items = await buildCorrectionsList(params);
  if (items.length === 0) {
    return { sent: false, count: 0, round: auth.correctionsRound ?? 0 };
  }

  const snapshot = await persistCorrectionsSnapshotAndNotify({
    exitAuthorizationId: params.exitAuthorizationId,
    companyId: params.companyId,
    items,
    previousRound: auth.correctionsRound ?? 0,
    sentBy: 'ia',
  });

  console.log(
    `[exit-corrections] AUTO-SEND auth ${params.exitAuthorizationId}: ` +
    `${items.length} item(s), round ${snapshot.round} (enviado por IA al conductor)`,
  );

  return { sent: true, count: items.length, round: snapshot.round };
}

/**
 * Devuelve la lista consolidada de correcciones para que el wizard del
 * conductor la lea. Si la autorización nunca fue devuelta, devuelve
 * lista vacía.
 */
export async function getCorrections(params: {
  exitAuthorizationId: number;
  companyId: number;
}): Promise<{
  hasCorrections: boolean;
  round: number;
  sentAt: string | null;
  resubmittedAt: string | null;
  items: CorrectionsListItem[];
  /** Si true, el conductor ya envió las correcciones y están pendientes
   *  de re-análisis. Si false, el conductor todavía no las envió. */
  awaitingResubmission: boolean;
}> {
  const [auth] = await db
    .select()
    .from(companyExitAuthorizations)
    .where(and(
      eq(companyExitAuthorizations.id, params.exitAuthorizationId),
      eq(companyExitAuthorizations.companyId, params.companyId),
    ))
    .limit(1);

  if (!auth) throw new AppError(404, 'Autorización no encontrada.');

  const snapshot = auth.correctionsSnapshot as CorrectionsSnapshot | null;
  if (!snapshot) {
    return {
      hasCorrections: false,
      round: 0,
      sentAt: null,
      resubmittedAt: auth.correctionsResubmittedAt?.toISOString() ?? null,
      items: [],
      awaitingResubmission: false,
    };
  }

  return {
    hasCorrections: true,
    round: snapshot.round,
    sentAt: snapshot.sentAt,
    resubmittedAt: auth.correctionsResubmittedAt?.toISOString() ?? null,
    items: snapshot.items,
    awaitingResubmission: !!auth.correctionsSentAt && !auth.correctionsResubmittedAt,
  };
}

/**
 * El conductor subió las correcciones. Llamado por el endpoint
 * /corrections/submit. Marca correctionsResubmittedAt = now() y
 * dispara re-análisis SOLO de los items que estaban en la lista.
 *
 * Las URLs nuevas se actualizan ANTES vía PATCH /:authId/photo por
 * cada item. Esta función solo marca la resubmission y dispara el
 * re-análisis.
 */

export async function submitCorrectionsStart(params: {
  exitAuthorizationId: number;
  companyId: number;
}): Promise<{ reanalyzedItems: ExitCheckItemType[]; itemTypesToReanalyze: ExitCheckItemType[] }> {
  const [auth] = await db
    .select()
    .from(companyExitAuthorizations)
    .where(and(
      eq(companyExitAuthorizations.id, params.exitAuthorizationId),
      eq(companyExitAuthorizations.companyId, params.companyId),
    ))
    .limit(1);

  if (!auth) throw new AppError(404, 'Autorización no encontrada.');
  if (auth.status !== 'Pendiente') {
    throw new AppError(409, `La autorización está en estado "${auth.status}" y no se puede modificar.`);
  }
  if (!auth.correctionsSentAt) {
    throw new AppError(400, 'Esta autorización no tiene correcciones pendientes.');
  }
  if (auth.correctionsResubmittedAt) {
    throw new AppError(409, 'Las correcciones ya fueron enviadas y están siendo re-analizadas.');
  }

  // Obtener los items del snapshot ANTES de tocar nada.
  const snapshot = auth.correctionsSnapshot as CorrectionsSnapshot | null;
  const itemTypesToReanalyze: ExitCheckItemType[] = snapshot?.items.map((i) => i.itemType) ?? [];

  if (itemTypesToReanalyze.length === 0) {
    return { reanalyzedItems: [], itemTypesToReanalyze: [] };
  }

  // 1. Marcar resubmitted y limpiar rejections de los items corregidos.
  //    Esto debe pasar ANTES del re-análisis para que loadEffectiveStatuses
  //    no vea rejections viejas que ya no aplican.
  await db
    .update(companyExitAuthorizations)
    .set({
      correctionsResubmittedAt: new Date(),
      aiAnalysisStatus: 'en_proceso',
      updatedAt: new Date(),
    } as any)
    .where(eq(companyExitAuthorizations.id, params.exitAuthorizationId));

  await db
    .update(exitAnalysisRejections)
    .set({ supersededAt: new Date() })
    .where(and(
      eq(exitAnalysisRejections.exitAuthorizationId, params.exitAuthorizationId),
      inArray(exitAnalysisRejections.itemType, itemTypesToReanalyze as any),
      isNull(exitAnalysisRejections.supersededAt),
    ));

  // El reanálisis real (Gemini) se hace en background vía
  // `submitCorrectionsFinish`, no acá. Devolvemos la lista de items
  // a re-analizar y un reanalyzedItems provisional vacío — el cliente
  // no necesita esperar.
  return { reanalyzedItems: [], itemTypesToReanalyze };
}

/**
 * Segunda parte (background) del submit de correcciones: re-analiza los
 * items con Gemini y broadcastea el resultado por WS.
 *
 * Se ejecuta como fire-and-forget desde el endpoint, no en el request
 * del cliente. Si falla, el status `en_proceso` queda en la DB y la
 * autorización queda en limbo (sin correcciones pendientes, sin
 * decisión); el supervisor puede ver el item en el panel de análisis
 * y forzar un override o reintentar.
 */
export async function submitCorrectionsFinish(params: {
  exitAuthorizationId: number;
  companyId: number;
  itemTypes: ExitCheckItemType[];
}): Promise<{ ok: true; reanalyzedItems: ExitCheckItemType[]; decision: string }> {
  const { exitAuthorizationId, companyId, itemTypes } = params;

  if (itemTypes.length === 0) {
    return { ok: true, reanalyzedItems: [], decision: 'sin_datos' };
  }

  // 1. Re-analizar SOLO los items del snapshot (no adivinar cuáles fallaron).
  //    reanalyzeSpecificItems maneja el broadcast al conductor y el
  //    auto-envío de correcciones si la nueva ronda también falla.
  const result = await reanalyzeSpecificItems({
    exitAuthorizationId,
    companyId,
    itemTypes,
  });

  // 2. Broadcast de resubmission para que el supervisor vea el nuevo estado.
  wsBroadcast(companyId, {
    type: 'exit-authorization:corrections-resubmitted',
    data: {
      exitAuthorizationId: String(exitAuthorizationId),
      reanalyzedItems: result.reItems,
      decision: result.decision,
    },
  });

  return { ok: true, reanalyzedItems: result.reItems, decision: result.decision };
}