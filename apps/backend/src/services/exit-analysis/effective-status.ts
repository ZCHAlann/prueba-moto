// services/exit-analysis/effective-status.ts
//
// Fuente ÚNICA de verdad sobre el estado de un ítem de autorización.
//
// Jerarquía de autoridad (decidida explícitamente, no asumida):
//   1. Si el supervisor hizo un override (rejection activa) → GANA SIEMPRE,
//      sin importar lo que diga Gemini.
//   2. Si no hay override y Gemini tuvo confianza "baja" → el ítem queda
//      "en_duda": no se autoriza ni se rechaza solo, se espera al supervisor.
//   3. Si no hay override y Gemini tuvo confianza alta/media → la decisión
//      de Gemini (puede_salir) es la decisión final. La IA autoriza.
//
// Por qué existe este archivo: antes, cada parte del sistema (reanálisis,
// hook del frontend, endpoint de decisión) miraba una sola tabla por su
// cuenta y llegaba a conclusiones distintas. Esto centraliza la regla en
// un solo lugar para que todos estén de acuerdo.

import type {
  ExitCheckItemType,
  EffectiveItemStatus,
  RejectionAction,
} from './types';

export type AnalysisRow = {
  itemType: ExitCheckItemType;
  puedeSalir: boolean;
  confianza: 'alta' | 'media' | 'baja';
  observaciones: string;
  accionRecomendada: string;
};

export type RejectionRow = {
  itemType: ExitCheckItemType;
  action: RejectionAction;
  reason: string;
};

/**
 * Calcula el estado efectivo de UN ítem, combinando el análisis de Gemini
 * con el override del supervisor (si existe). Recibe solo lo que aplica
 * a ese ítem específico (ya filtrado por el caller).
 */
export function getEffectiveItemStatus(
  itemType: ExitCheckItemType,
  analysis: AnalysisRow | null,
  activeRejection: RejectionRow | null,
): EffectiveItemStatus {
  // Sin análisis todavía: no hay nada que decidir.
  if (!analysis) {
    return {
      itemType,
      puedeSalir: false,
      enDuda: false,
      decidedBy: 'sin_datos',
      razon: 'Aún no se ha analizado este ítem.',
    };
  }

  // 1. El supervisor SIEMPRE gana si hizo un override activo.
  if (activeRejection) {
    if (activeRejection.action === 'override_approve') {
      return {
        itemType,
        puedeSalir: true,
        enDuda: false,
        decidedBy: 'supervisor',
        razon: activeRejection.reason,
      };
    }
    // request_recapture o confirm_fail → el supervisor confirma que NO puede salir.
    return {
      itemType,
      puedeSalir: false,
      enDuda: false,
      decidedBy: 'supervisor',
      razon: activeRejection.reason,
    };
  }

  // 2. Sin override: si Gemini tuvo confianza baja, queda en duda. La IA
  //    no decide sola cuando no está segura — esto es lo que pediste:
  //    "si no está segura, marca en duda y deja que el supervisor decida".
  if (analysis.confianza === 'baja') {
    return {
      itemType,
      puedeSalir: false,
      enDuda: true,
      decidedBy: 'sin_datos',
      razon: analysis.observaciones || 'La IA no tiene suficiente certeza; requiere revisión humana.',
    };
  }

  // 3. Sin override, confianza alta/media: la IA decide. Es la autoridad.
  return {
    itemType,
    puedeSalir: analysis.puedeSalir,
    enDuda: false,
    decidedBy: 'ia',
    razon: analysis.accionRecomendada || analysis.observaciones,
  };
}

/**
 * Calcula el estado efectivo de LOS 5 ítems a la vez. Útil para los
 * endpoints que necesitan la vista completa (GET /analyses, reanalyze).
 */
export function getAllEffectiveStatuses(
  analyses: AnalysisRow[],
  rejections: RejectionRow[],
): EffectiveItemStatus[] {
  const items: ExitCheckItemType[] = [
    'refrigerante', 'frenos', 'tablero_luces', 'bateria', 'bayoneta_aceite',
  ];

  // Mapas para lookup O(1). Solo la rejection más reciente activa por ítem
  // debe llegar aquí — el caller es responsable de filtrar por supersededAt.
  const analysisByType = new Map(analyses.map((a) => [a.itemType, a]));
  const rejectionByType = new Map(rejections.map((r) => [r.itemType, r]));

  return items.map((itemType) =>
    getEffectiveItemStatus(
      itemType,
      analysisByType.get(itemType) ?? null,
      rejectionByType.get(itemType) ?? null,
    ),
  );
}

/**
 * Decisión GLOBAL de la autorización a partir de los 5 estados efectivos.
 *
 *   - "apto"                → los 5 pueden salir (IA o supervisor).
 *   - "requiere_correccion" → AL MENOS un ítem NO puede salir (sea por
 *                             rechazo directo, confianza baja, o porque la
 *                             IA no lo aprobó). Esto SIEMPRE se envía al
 *                             conductor, sin esperar al supervisor.
 *   - "requiere_revision_humana" → la autorización todavía no se terminó de
 *                             analizar (sin_datos, o todos los items con
 *                             análisis parcial). NO se envía al conductor
 *                             porque no hay nada concreto que pedirle.
 *
 * IMPORTANTE — cambio de modelo mental:
 *   Antes, "en duda" (confianza baja) era una categoría que BLOQUEABA el
 *   envío al conductor esperando al supervisor. Ahora NO: si la IA no
 *   está segura, igual le pedimos al conductor que rehaga la foto, porque
 *   el costo de reenviar una foto es mucho menor que el costo de tener
 *   al supervisor bloqueando el flujo. El supervisor puede agregar
 *   correcciones manuales encima, pero ya no es un cuello de botella.
 */
export function computeGlobalDecision(
  statuses: EffectiveItemStatus[],
): 'apto' | 'requiere_correccion' | 'requiere_revision_humana' {
  if (statuses.length === 0) return 'requiere_revision_humana';

  // Si TODOS los items tienen análisis y todos pueden salir, está apto.
  if (statuses.every((s) => s.puedeSalir)) return 'apto';

  // Si hay al menos un ítem sin datos (análisis no terminado) y nadie
  // puede salir todavía, esperamos a que termine el análisis. Esto es
  // distinto de "en duda" (que SÍ tiene análisis, pero con confianza baja).
  const tieneSinDatos = statuses.some((s) => s.decidedBy === 'sin_datos');
  const todosSinDatos = statuses.every((s) => s.decidedBy === 'sin_datos');
  if (todosSinDatos) return 'requiere_revision_humana';
  // Si hay una mezcla de "ya analizados" y "sin datos", mandamos a
  // corrección igual (los que ya analizamos y rechazaron, el conductor
  // los rehace; los sin datos los verá marcados como "pendiente").
  if (tieneSinDatos) return 'requiere_correccion';

  // Hay análisis completo de los 5 items y al menos uno no aprueba.
  // Incluye los "en_duda" (confianza baja): la IA no estaba segura, le
  // pedimos al conductor que rehaga la foto con mejor ángulo/iluminación.
  return 'requiere_correccion';
}

/**
 * Ítems que deben mostrarse al conductor como "rehacer foto".
 *
 * Incluye:
 *   - Items con puedeSalir=false (la IA rechazó con certeza).
 *   - Items con confianza="baja" (la IA no estaba segura → que el
 *     conductor la rehaga con mejor ángulo/luz/enfoque).
 *
 * Excluye:
 *   - Items aprobados por la IA o por override del supervisor.
 *   - Items que están "sin_datos" todavía (análisis no terminó).
 */
export function getItemsToCorrect(statuses: EffectiveItemStatus[]): ExitCheckItemType[] {
  return statuses
    .filter((s) => !s.puedeSalir)
    .map((s) => s.itemType);
}