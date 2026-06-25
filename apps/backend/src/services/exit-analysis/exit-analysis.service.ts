// services/exit-analysis/exit-analysis.service.ts

import { readFileSync, existsSync } from 'fs';
import { toId } from '../../lib/ids';
import { join } from 'path';
import { eq, and, desc, inArray, isNull } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  companyExitAuthorizations,
  companyDrivers,
  exitAuthorizationAnalyses,
  exitAnalysisRejections,
} from '../../db/schema/operational';
import { analyzeMultiItem, type EvidenceItem } from './analyzers/gemini';
import { AppError } from '../../lib/errors';
import { isAiEnabled } from '../../lib/gemini-client';
import { autoSendCorrectionsToDriver } from './exit-corrections.service';
import { wsBroadcast } from '../websocket';
import {
  getAllEffectiveStatuses,
  computeGlobalDecision,
  type AnalysisRow,
  type RejectionRow,
} from './effective-status';
import {
  AI_ANALYZED_URL_FIELDS,
  type ExitCheckItemType,
  type MultiItemAnalysisResult,
  type PersistedAnalysis,
} from './types';
import { buildAnalysisPrompt, type PromptItem } from './prompts/multimodal';

const UPLOAD_BASE = process.env.UPLOAD_DIR ?? join(process.cwd(), '..', '..', 'uploads');

function urlToAbsolutePath(url: string): string {
  if (url.startsWith('http')) return url;
  const relativePart = url.replace(/^\/uploads\//, '');
  return join(UPLOAD_BASE, relativePart);
}

async function loadFileFromUrl(url: string): Promise<Buffer> {
  const abs = urlToAbsolutePath(url);
  if (!existsSync(abs)) {
    throw new AppError(404, `Archivo no encontrado en disco: ${abs}`);
  }
  return readFileSync(abs);
}

async function setStatus(
  exitAuthId: number,
  status: 'pendiente' | 'en_proceso' | 'aprobado_ia' | 'requiere_correccion' | 'requiere_revision_humana',
) {
  await db
    .update(companyExitAuthorizations)
    .set({ aiAnalysisStatus: status, updatedAt: new Date() } as any)
    .where(eq(companyExitAuthorizations.id, exitAuthId));
}

function decisionToStatus(
  decision: string,
): 'pendiente' | 'en_proceso' | 'aprobado_ia' | 'requiere_correccion' | 'requiere_revision_humana' {
  if (decision === 'apto') return 'aprobado_ia';
  if (decision === 'requiere_correccion') return 'requiere_correccion';
  return 'requiere_revision_humana';
}

/**
 * Si la IA aprobó todos los items, aprueba la autorización automáticamente
 * sin esperar al supervisor. Actualiza status → 'Autorizada' y emite
 * el evento WS 'exit-authorization:decided' para que el conductor vea
 * el popup "¡Salida aprobada!" y el estado cambie en tiempo real.
 */
async function autoApproveIfApto(exitAuthId: number, companyId: number, decision: string) {
  if (decision !== 'apto') return;

  const [auth] = await db
    .select({ status: companyExitAuthorizations.status })
    .from(companyExitAuthorizations)
    .where(eq(companyExitAuthorizations.id, exitAuthId))
    .limit(1);

  // No aprobar si ya fue decidida (por si hay race condition).
  if (!auth || auth.status !== 'Pendiente') return;

  const [updated] = await db
    .update(companyExitAuthorizations)
    .set({
      status: 'Autorizada',
      decisionNotes: 'Aprobada automáticamente por el sistema.',
      decidedAt: new Date(),
      updatedAt: new Date(),
    } as any)
    .where(eq(companyExitAuthorizations.id, exitAuthId))
    .returning();

  console.info(`[exit-analysis] auth ${exitAuthId} AUTO-APROBADA por IA`);

  wsBroadcast(companyId, {
    type: 'exit-authorization:decided',
    data: {
      id: `exit-auth-${exitAuthId}`,
      status: 'Autorizada',
      decisionNotes: 'Aprobada automáticamente por el sistema.',
      decidedAt: updated.decidedAt?.toISOString() ?? new Date().toISOString(),
    },
  });
}

async function clearAnalyses(exitAuthId: number) {
  await db
    .delete(exitAuthorizationAnalyses)
    .where(eq(exitAuthorizationAnalyses.exitAuthorizationId, exitAuthId));
}

async function persistResults(
  exitAuthId: number,
  companyId: number,
  analysis: MultiItemAnalysisResult,
  model: string,
  latencyMs: number,
  rawResponseText: string,
  urlMap: Partial<Record<ExitCheckItemType, string>>,
) {
  const items: ExitCheckItemType[] = ['refrigerante', 'frenos', 'tablero_luces', 'bateria', 'bayoneta_aceite'];

  const rows = items.map((itemType) => {
    const item = analysis.items[itemType];
    if (!item) return null;
    return {
      exitAuthorizationId: exitAuthId,
      companyId,
      itemType,
      nivel:             item.nivel   as any,
      estado:            (itemType === 'bayoneta_aceite' ? null : item.estado) as any,
      color:             (itemType === 'bayoneta_aceite' ? item.color : null) as any,
      confianza:         item.confianza as any,
      puedeSalir:        item.puede_salir,
      observaciones:     item.observaciones,
      accionRecomendada: item.accion_recomendada,
      razonamiento:      item.razonamiento,
      aiGuidance:        item.aiGuidance ?? '',
      geminiModel:       model,
      latencyMs,
      rawResponseText,
      photoUrl:          urlMap[itemType] ?? null,
    };
  }).filter(Boolean) as any[];

  if (rows.length > 0) {
    await db.insert(exitAuthorizationAnalyses).values(rows);
  }
}

async function loadEffectiveStatuses(exitAuthId: number) {
  const analysisRows = await db
    .select()
    .from(exitAuthorizationAnalyses)
    .where(eq(exitAuthorizationAnalyses.exitAuthorizationId, exitAuthId));

  const rejectionRows = await db
    .select()
    .from(exitAnalysisRejections)
    .where(and(
      eq(exitAnalysisRejections.exitAuthorizationId, exitAuthId),
      isNull(exitAnalysisRejections.supersededAt),
    ));

  const analyses: AnalysisRow[] = analysisRows.map((r) => ({
    itemType:          r.itemType as ExitCheckItemType,
    puedeSalir:        r.puedeSalir,
    confianza:         r.confianza as 'alta' | 'media' | 'baja',
    observaciones:     r.observaciones,
    accionRecomendada: r.accionRecomendada,
  }));

  const rejections: RejectionRow[] = rejectionRows.map((r) => ({
    itemType: r.itemType as ExitCheckItemType,
    action:   r.action as RejectionRow['action'],
    reason:   r.reason,
  }));

  return getAllEffectiveStatuses(analyses, rejections);
}

// ─── analyzeExitAuthorization ─────────────────────────────────────────────────

export async function analyzeExitAuthorization(params: {
  exitAuthorizationId: string;
  companyId: number;
}): Promise<{ ok: true; decision: string }> {
  if (!isAiEnabled()) {
    throw Object.assign(new Error('IA no habilitada (GEMINI_API_KEY ausente).'), { code: 'AI_DISABLED' });
  }

  const exitAuthNumericId = Number(params.exitAuthorizationId);
  const companyNumericId  = params.companyId;

  const [auth] = await db
    .select()
    .from(companyExitAuthorizations)
    .where(and(
      eq(companyExitAuthorizations.id, exitAuthNumericId),
      eq(companyExitAuthorizations.companyId, companyNumericId),
    ))
    .limit(1);

  if (!auth) throw new AppError(404, 'Autorización de salida no encontrada.');

  await setStatus(exitAuthNumericId, 'en_proceso');

  try {
    const evidences: EvidenceItem[] = [];
    const urlMap: Partial<Record<ExitCheckItemType, string>> = {};

    for (const { field, type, isVideo } of AI_ANALYZED_URL_FIELDS) {
      const url = (auth as any)[field] as string | null | undefined;
      if (url) {
        evidences.push({ type: isVideo ? 'video' : 'image', url });
        urlMap[type] = url;
      }
    }

    if (evidences.length === 0) {
      await setStatus(exitAuthNumericId, 'requiere_revision_humana');
      return { ok: true, decision: 'requiere_revision_humana' };
    }

    const { result, latencyMs, model, rawResponseText } = await analyzeMultiItem({
      evidences,
      loadFile: loadFileFromUrl,
      logLabel: `auth-${exitAuthNumericId}`,
    });

    await clearAnalyses(exitAuthNumericId);
    await persistResults(exitAuthNumericId, companyNumericId, result, model, latencyMs, rawResponseText, urlMap);

    const effectiveStatuses = await loadEffectiveStatuses(exitAuthNumericId);
    const finalStatus = computeGlobalDecision(effectiveStatuses);

    await setStatus(exitAuthNumericId, decisionToStatus(finalStatus));

    console.info(
      `[exit-analysis] auth ${exitAuthNumericId} decision=${finalStatus}, ` +
      `effective=${JSON.stringify(effectiveStatuses.map((s) => ({ item: s.itemType, puede: s.puedeSalir, enDuda: s.enDuda, by: s.decidedBy })))}`,
    );

    // Auto-aprobar si la IA dio apto.
    await autoApproveIfApto(exitAuthNumericId, companyNumericId, finalStatus);

    if (finalStatus === 'requiere_correccion') {
      try {
        const r = await autoSendCorrectionsToDriver({
          exitAuthorizationId: exitAuthNumericId,
          companyId: companyNumericId,
        });
        console.info(`[exit-analysis] auto-send auth ${exitAuthNumericId}: sent=${r.sent} count=${r.count} round=${r.round}`);
      } catch (e) {
        console.error('[exit-analysis] autoSendCorrectionsToDriver falló:', e);
      }
    } else {
      console.info(`[exit-analysis] auth ${exitAuthNumericId} no requiere corrección (status=${finalStatus}), no se auto-envía`);
    }

    return { ok: true, decision: finalStatus };
  } catch (err) {
    console.error(`[exit-analysis] Error analizando auth ${exitAuthNumericId}:`, err);

    // ── Clasificar el error ──
    // Clasificamos ANTES de cambiar el status para saber si el
    // conductor debe recibir un mensaje o si es un error transitorio
    // (rate limit / timeout) que no le incumbe.
    const classification = classifyAnalysisError(err);

    if (classification.transient) {
      // ── Error transitorio: rate limit, timeout, red ──
      // El conductor NO tiene la culpa (la IA está saturada o hay
      // problemas de red). Le mostramos un toast corto "Agente no
      // disponible" y mantenemos el status en 'en_proceso' para que
      // el supervisor pueda re-disparar el análisis si quiere.
      console.warn(
        `[exit-analysis] auth ${exitAuthNumericId} error transitorio ` +
        `(${classification.code}): ${err instanceof Error ? err.message : String(err)}`,
      );
      // Forzamos el status a 'en_proceso' para que el supervisor lo
      // pueda re-disparar desde el panel.
      await setStatus(exitAuthNumericId, 'en_proceso');

      // Resolver el userId del conductor dueño para mandarle el
      // toast SOLO a él.
      const [driverRow] = await db
        .select({ userId: companyDrivers.userId })
        .from(companyDrivers)
        .where(eq(companyDrivers.id, auth.driverId))
        .limit(1);
      const targetUserId = driverRow?.userId ?? undefined;

      // Broadcast con el userMessage corto ("Agente no disponible")
      // y el código. El frontend lo usa para mostrar el toast y
      // cerrar el AnalyzingModal. Mandamos el id con prefijo (e.g.
      // `exit-auth-65`) para que el frontend pueda usarlo directo
      // en las URLs (e.g. `/api/.../exit-authorizations/{id}/photo`).
      wsBroadcast(companyNumericId, {
        type: 'exit-authorization:analysis-failed',
        data: {
          exitAuthorizationId: toId('exit-auth', exitAuthNumericId),
          errorCode: classification.code,
          userMessage: classification.userMessage,
        },
      }, { targetUserId });
      throw err;
    }

    // ── Error que sí le importa al conductor (video muy grande, etc.) ──
    await setStatus(exitAuthNumericId, 'requiere_revision_humana');

    // Resolver el userId del conductor a partir del driverId de la auth.
    const [driverRow] = await db
      .select({ userId: companyDrivers.userId })
      .from(companyDrivers)
      .where(eq(companyDrivers.id, auth.driverId))
      .limit(1);
    const targetUserId = driverRow?.userId ?? undefined;

    // Mandamos el `userMessage` (amigable) y NUNCA el `errorMessage` (raw).
    // El errorMessage técnico queda en el log para debugging.
    wsBroadcast(companyNumericId, {
      type: 'exit-authorization:analysis-failed',
      data: {
        exitAuthorizationId: toId('exit-auth', exitAuthNumericId),
        errorCode: classification.code,
        userMessage: classification.userMessage,
      },
    }, { targetUserId });
    throw err;
  }
}

/**
 * Clasifica un error del análisis IA en una categoría con mensaje
 * amigable para el usuario.
 *
 * - `transient: true`  → rate limit / timeout / red. NO se le muestra
 *   nada al conductor (no es su culpa). El sistema reintenta o
 *   espera.
 * - `transient: false` → error que sí le importa al conductor (video
 *   muy grande, archivo corrupto, etc.). Se le muestra un mensaje
 *   amigable.
 */
export function classifyAnalysisError(err: unknown): {
  code: string;
  userMessage: string;
  transient: boolean;
} {
  const rawMessage = err instanceof Error ? err.message : String(err);
  const errAny = err as { code?: string; status?: number; message?: string };

  // ── Rate limit / quota (transitorio) ──
  // Google devuelve 429 o "RESOURCE_EXHAUSTED" cuando se pasa la cuota
  // del plan free. Es culpa de Gemini, NO del conductor. Mensaje
  // genérico "Agente no disponible" — el conductor solo espera.
  if (
    errAny.status === 429
    || /RESOURCE_EXHAUSTED/i.test(rawMessage)
    || /quota.*exceeded/i.test(rawMessage)
    || /Too Many Requests/i.test(rawMessage)
  ) {
    return {
      code: 'QUOTA_EXCEEDED',
      userMessage: 'Agente no disponible',
      transient: true,
    };
  }

  // ── Timeout / red (transitorio) ──
  if (
    errAny.code === 'ETIMEDOUT'
    || errAny.code === 'ECONNRESET'
    || errAny.code === 'ENOTFOUND'
    || /timeout/i.test(rawMessage)
    || /network/i.test(rawMessage)
  ) {
    return {
      code: 'NETWORK_TIMEOUT',
      userMessage: 'Agente no disponible',
      transient: true,
    };
  }

  // ── 5xx: error del upstream de Gemini (transitorio) ──
  if (errAny.status && errAny.status >= 500 && errAny.status < 600) {
    return {
      code: 'AI_UPSTREAM_ERROR',
      userMessage: 'Agente no disponible',
      transient: true,
    };
  }

  // ── 413: video muy grande (error del USUARIO) ──
  // Este es el ÚNICO caso donde le decimos al conductor que haga algo
  // (re-grabar un video más corto). NO confundir con los anteriores.
  if (errAny.status === 413) {
    return {
      code: 'VIDEO_TOO_LARGE',
      userMessage: 'El video de la bayoneta pesa más de 15 MB. Grabá uno más corto (menos de 30 segundos) o de menor resolución y volvé a enviarlo.',
      transient: false,
    };
  }

  // ── Error desconocido ──
  return {
    code: 'UNKNOWN',
    userMessage: 'No pudimos analizar tu solicitud. Contactá a tu supervisor para que la revise manualmente.',
    transient: false,
  };
}

// ─── reanalyzeSpecificItems ───────────────────────────────────────────────────

export async function reanalyzeSpecificItems(params: {
  exitAuthorizationId: number;
  companyId: number;
  itemTypes: ExitCheckItemType[];
}): Promise<{ ok: true; decision: string; reItems: ExitCheckItemType[] }> {
  if (!isAiEnabled()) {
    throw Object.assign(new Error('IA no habilitada (GEMINI_API_KEY ausente).'), { code: 'AI_DISABLED' });
  }

  const { exitAuthorizationId: exitAuthNumericId, companyId: companyNumericId, itemTypes } = params;

  if (itemTypes.length === 0) {
    const effectiveStatuses = await loadEffectiveStatuses(exitAuthNumericId);
    const finalStatus = computeGlobalDecision(effectiveStatuses);
    await setStatus(exitAuthNumericId, decisionToStatus(finalStatus));
    await autoApproveIfApto(exitAuthNumericId, companyNumericId, finalStatus);
    return { ok: true, decision: finalStatus, reItems: [] };
  }

  const [auth] = await db
    .select()
    .from(companyExitAuthorizations)
    .where(and(
      eq(companyExitAuthorizations.id, exitAuthNumericId),
      eq(companyExitAuthorizations.companyId, companyNumericId),
    ))
    .limit(1);

  if (!auth) throw new AppError(404, 'Autorización de salida no encontrada.');

  const evidences: EvidenceItem[] = [];
  const urlMap: Partial<Record<ExitCheckItemType, string>> = {};

  for (const { field, type, isVideo } of AI_ANALYZED_URL_FIELDS) {
    if (!itemTypes.includes(type)) continue;
    const url = (auth as any)[field] as string | null | undefined;
    if (url) {
      evidences.push({ type: isVideo ? 'video' : 'image', url });
      urlMap[type] = url;
    }
  }

  if (evidences.length === 0) {
    throw new AppError(400, 'No se encontraron URLs para los ítems a re-analizar. Verificá que las fotos se subieron correctamente.');
  }

  await setStatus(exitAuthNumericId, 'en_proceso');

  try {
    const { result, latencyMs, model, rawResponseText } = await analyzeMultiItem({
      evidences,
      loadFile: loadFileFromUrl,
      logLabel: `auth-${exitAuthNumericId}-reanalyze`,
      prompt: buildAnalysisPrompt(itemTypes as PromptItem[]),
    });

    await db
      .delete(exitAuthorizationAnalyses)
      .where(and(
        eq(exitAuthorizationAnalyses.exitAuthorizationId, exitAuthNumericId),
        inArray(exitAuthorizationAnalyses.itemType, itemTypes as any),
      ));

    await persistResults(exitAuthNumericId, companyNumericId, result, model, latencyMs, rawResponseText, urlMap);

    const newEffectiveStatuses = await loadEffectiveStatuses(exitAuthNumericId);
    const finalStatus = computeGlobalDecision(newEffectiveStatuses);
    await setStatus(exitAuthNumericId, decisionToStatus(finalStatus));

    console.info(
      `[exit-analysis] reanalyze auth ${exitAuthNumericId} items=[${itemTypes.join(',')}] decision=${finalStatus}`,
    );

    // Auto-aprobar si todos los items quedaron bien tras la corrección.
    await autoApproveIfApto(exitAuthNumericId, companyNumericId, finalStatus);

    if (finalStatus === 'apto') {
      // autoApproveIfApto ya emitió exit-authorization:decided.
      // Emitimos también analysis-completed para cerrar el AnalyzingModal.
      wsBroadcast(companyNumericId, {
        type: 'exit-authorization:analysis-completed',
        data: {
          exitAuthorizationId: toId('exit-auth', exitAuthNumericId),
          decision: finalStatus,
          auto: true,
          reItems: itemTypes,
        },
      });
    } else if (finalStatus === 'requiere_correccion') {
      try {
        await autoSendCorrectionsToDriver({
          exitAuthorizationId: exitAuthNumericId,
          companyId: companyNumericId,
        });
      } catch (e) {
        console.error('[exit-analysis] autoSendCorrectionsToDriver (post-reanalyze) falló:', e);
      }
    } else {
      // requiere_revision_humana
      wsBroadcast(companyNumericId, {
        type: 'exit-authorization:analysis-completed',
        data: {
          exitAuthorizationId: toId('exit-auth', exitAuthNumericId),
          decision: finalStatus,
          auto: true,
          reItems: itemTypes,
        },
      });
    }

    return { ok: true, decision: finalStatus, reItems: itemTypes };
  } catch (err) {
    console.error(`[exit-analysis] Error re-analizando auth ${exitAuthNumericId}:`, err);
    await setStatus(exitAuthNumericId, 'requiere_revision_humana');
    throw err;
  }
}

// ─── reanalyzeFailedItems (backwards compat) ─────────────────────────────────

export async function reanalyzeFailedItems(params: {
  exitAuthorizationId: string | number;
  companyId: number;
}): Promise<{ ok: true; decision: string; reItems: ExitCheckItemType[] }> {
  const exitAuthNumericId = Number(params.exitAuthorizationId);

  const effectiveStatuses = await loadEffectiveStatuses(exitAuthNumericId);
  const itemsToReanalyze: ExitCheckItemType[] = effectiveStatuses
    .filter((s) => !s.puedeSalir)
    .map((s) => s.itemType);

  return reanalyzeSpecificItems({
    exitAuthorizationId: exitAuthNumericId,
    companyId: params.companyId,
    itemTypes: itemsToReanalyze,
  });
}

// ─── getExitAuthorizationAnalyses ────────────────────────────────────────────

export async function getExitAuthorizationAnalyses(params: {
  exitAuthorizationId: number;
  companyId: number;
}): Promise<PersistedAnalysis[]> {
  const rows = await db
    .select()
    .from(exitAuthorizationAnalyses)
    .where(and(
      eq(exitAuthorizationAnalyses.exitAuthorizationId, params.exitAuthorizationId),
      eq(exitAuthorizationAnalyses.companyId, params.companyId),
    ))
    .orderBy(desc(exitAuthorizationAnalyses.createdAt));

  return rows.map((r) => ({
    id:                  String(r.id),
    exitAuthorizationId: String(r.exitAuthorizationId),
    itemType:            r.itemType as ExitCheckItemType,
    nivel:               (r.nivel as any) ?? null,
    estado:              (r.estado as any) ?? null,
    color:               (r.color as any) ?? null,
    confianza:           r.confianza as any,
    puedeSalir:          r.puedeSalir,
    observaciones:       r.observaciones,
    accionRecomendada:   r.accionRecomendada,
    razonamiento:        r.razonamiento,
    aiGuidance:          r.aiGuidance ?? '',
    geminiModel:         r.geminiModel,
    latencyMs:           r.latencyMs,
    photoUrl:            r.photoUrl,
    createdAt:           r.createdAt.toISOString(),
  }));
}

// ─── getExitAuthorizationEffectiveStatuses ────────────────────────────────────

export async function getExitAuthorizationEffectiveStatuses(params: {
  exitAuthorizationId: number;
  companyId: number;
}) {
  return loadEffectiveStatuses(params.exitAuthorizationId);
}