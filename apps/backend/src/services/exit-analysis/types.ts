// services/exit-analysis/types.ts

/**
 * Tipos de ítem que la IA analiza en una autorización de salida.
 * Solo estos 5 ítems pasan por Gemini. Las otras evidencias (llantas, gata,
 * limpiaparabrisas) se almacenan como evidencia normal y el supervisor las
 * revisa si quiere.
 */
export type ExitCheckItemType =
  | 'refrigerante'
  | 'frenos'
  | 'tablero_luces'
  | 'bateria'
  | 'bayoneta_aceite';

/**
 * Mapeo entre el campo URL de la autorización y el tipo de ítem.
 * Es la lista de "qué se analiza con IA". Si el campo no está acá, NO se
 * envía a Gemini.
 */
export const AI_ANALYZED_URL_FIELDS: Array<{
  field: string;
  type: ExitCheckItemType;
  isVideo?: boolean;
}> = [
  { field: 'coolantPhotoUrl',     type: 'refrigerante' },
  { field: 'brakeFluidPhotoUrl',  type: 'frenos' },
  { field: 'lightsPhotoUrl',      type: 'tablero_luces' },
  { field: 'batteryPhotoUrl',     type: 'bateria' },
  { field: 'oilBayonetaVideoUrl', type: 'bayoneta_aceite', isVideo: true },
];

export type NivelFluido = 'ok' | 'bajo' | 'critico' | 'no_visible';
export type EstadoComponente = 'bueno' | 'degradado' | 'contaminado' | 'no_visible';
export type Confianza = 'alta' | 'media' | 'baja';
export type ColorAceite = 'miel' | 'oscuro' | 'negro' | 'no_visible';

/**
 * Estado de un solo ítem devuelto por Gemini.
 * Los campos opcionales son null cuando no aplican al tipo (ej: batería
 * no tiene nivel, bayoneta usa `color` en vez de `estado`).
 */
export type ItemAnalysis = {
  razonamiento: string;
  nivel: NivelFluido | null;
  estado: EstadoComponente | null;
  color: ColorAceite | null;
  confianza: Confianza;
  puede_salir: boolean;
  observaciones: string;
  accion_recomendada: string;
  /**
   * Guía específica para que el conductor sepa qué mejorar en la próxima
   * foto. Vacía cuando el ítem aprueba. Solo se persiste cuando hay
   * correcciones.
   */
  aiGuidance: string;
};

/**
 * Resultado agregado del análisis multimodal de una autorización.
 */
export type MultiItemAnalysisResult = {
  items: {
    refrigerante:   ItemAnalysis;
    frenos:         ItemAnalysis;
    tablero_luces:  ItemAnalysis;
    bateria:        ItemAnalysis;
    bayoneta_aceite: ItemAnalysis;
  };
  decision_global: 'apto' | 'requiere_correccion' | 'requiere_revision_humana';
  items_a_corregir: ExitCheckItemType[];
};

export type PersistedAnalysis = {
  id: string;
  exitAuthorizationId: string;
  itemType: ExitCheckItemType;
  nivel: NivelFluido | null;
  estado: EstadoComponente | null;
  color: ColorAceite | null;
  confianza: Confianza;
  puedeSalir: boolean;
  observaciones: string;
  accionRecomendada: string;
  razonamiento: string;
  geminiModel: string;
  latencyMs: number;
  photoUrl: string | null;
  createdAt: string;
};

// ─── NUEVO: jerarquía de autoridad (IA decide, supervisor puede hacer override) ──

/**
 * Quién dictó el estado final de un ítem.
 *   - "ia"          → Gemini decidió y nadie intervino.
 *   - "supervisor"   → el supervisor hizo override (siempre gana sobre la IA).
 *   - "sin_datos"    → no hay análisis todavía.
 */
export type DecidedBy = 'ia' | 'supervisor' | 'sin_datos';

/**
 * Acciones que puede tomar el supervisor sobre un ítem ya analizado por la IA.
 *   - request_recapture: la foto está mal, el conductor la rehace.
 *   - override_approve:  el supervisor aprueba aunque la IA haya dicho que no.
 *   - confirm_fail:      el supervisor confirma el fallo de la IA.
 */
export type RejectionAction = 'request_recapture' | 'override_approve' | 'confirm_fail';

/**
 * Estado EFECTIVO de un ítem: combina lo que dijo Gemini con el override
 * del supervisor (si existe). Esta es la fuente de verdad única que debe
 * consultar cualquier parte del sistema (reanálisis, UI del conductor,
 * decisión final de salida) — nunca leer `puedeSalir` de la IA directamente
 * sin pasar por esta combinación.
 */
export type EffectiveItemStatus = {
  itemType: ExitCheckItemType;
  /** true = puede salir, false = debe corregirse. */
  puedeSalir: boolean;
  /** true = Gemini no tuvo suficiente certeza; queda pendiente de revisión humana. */
  enDuda: boolean;
  decidedBy: DecidedBy;
  /** Razón mostrada al conductor/supervisor (de la IA o del override). */
  razon: string;
};