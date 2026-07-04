// lib/ai/schema-helpers.ts
// ─────────────────────────────────────────────────────────────────────
// Helpers de Zod para hacer los schemas de tools más tolerantes.
//
// PROBLEMA que resuelve:
// Los LLMs (especialmente llama-3.3-70b) a veces pasan tipos "mal"
// en tool-calling:
//   - Esperan string → mandan { value: "2026-06-01" } o arrays.
//   - Esperan number → mandan "42" o null.
//   - Esperan boolean → mandan "true" o "false" como string.
//
// REGLAS DE DISEÑO (importante):
//   - Para STRINGS usamos z.preprocess (porque z.string().trim() etc.
//     solo existen en ZodString, no en ZodEffects).
//   - Para NUMBERS y BOOLEANS usamos z.coerce (que devuelve el tipo
//     nativo ZodNumber / ZodBoolean, así conserva .int(), .min(),
//     .max(), .positive(), .optional(), .default()).
//   - Como respaldo, los orquestadores aplanan args profundamente
//     anidados con flattenArgs() antes de validar.
// ─────────────────────────────────────────────────────────────────────

import { z } from 'zod';

// ─── Coercer para strings (extrae de objetos/arrays anidados) ─────

function coerceToString(val: unknown): unknown {
  if (val == null) return val;
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number' || typeof val === 'boolean') return String(val).trim();
  if (typeof val === 'object') {
    const visit = (v: unknown, depth: number): unknown => {
      if (depth > 4) return undefined;
      if (v == null) return undefined;
      if (typeof v === 'string') return v.trim();
      if (typeof v === 'number' || typeof v === 'boolean') return String(v).trim();
      if (Array.isArray(v)) {
        for (const item of v) {
          const r = visit(item, depth + 1);
          if (r !== undefined) return r;
        }
        return undefined;
      }
      if (typeof v === 'object') {
        for (const item of Object.values(v as Record<string, unknown>)) {
          const r = visit(item, depth + 1);
          if (r !== undefined) return r;
        }
      }
      return undefined;
    };
    const found = visit(val, 0);
    if (found !== undefined) return found;
    try { return JSON.stringify(val); } catch { return ''; }
  }
  return String(val);
}

// ─── Helpers públicos ──────────────────────────────────────────────

/**
 * String tolerante (extrae de objetos/arrays). Devuelve ZodEffects.
 *
 * Acepta opciones para aplicar restricciones de longitud DENTRO del
 * schema (porque ZodEffects NO expone .min()/.max() — esos son de
 * ZodString y necesitamos aplicarlos antes del preprocess).
 *
 *   tolerantString()                    // cualquier string
 *   tolerantString({ minLength: 1 })     // mínimo 1 caracter
 *   tolerantString({ maxLength: 500 })   // máximo 500 caracteres
 */
export function tolerantString(opts: { minLength?: number; maxLength?: number } = {}) {
  let inner: z.ZodString = z.string();
  if (opts.minLength != null) inner = inner.min(opts.minLength);
  if (opts.maxLength != null) inner = inner.max(opts.maxLength);
  return z.preprocess(coerceToString, inner);
}

/**
 * Fecha YYYY-MM-DD tolerante. Acepta min/max opcional (no aplica a fechas).
 */
export function tolerantDateString() {
  return z.preprocess(coerceToString, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Debe ser una fecha en formato YYYY-MM-DD',
  }));
}

/**
 * Number tolerante. Úsalo así:
 *
 *   limit: tolerantNumber().int().min(1).max(500).optional().default(100)
 *
 * `z.coerce.number()` devuelve un ZodNumber REAL (no ZodEffects),
 * por lo que conserva todos los métodos: .int(), .min(), .max(),
 * .positive(), .optional(), .default().
 *
 * Acepta: 42, "42", true (→1), false (→0). Si llega null/undefined
 * y el campo es .optional(), el default se aplica.
 *
 * Si el LLM pasa un objeto (raro), devuelve NaN — el orquestador
 * aplana args antes con flattenArgs() para evitar ese caso.
 */
export const tolerantNumber = () => z.coerce.number();

/**
 * Number tolerante ESPECÍFICO para IDs de assets/vehículos (assetId).
 *
 * Igual que tolerantNumber(), pero además trata `0` como "campo ausente"
 * en vez de dejar que falle la validación .positive().
 *
 * POR QUÉ EXISTE: el LLM (llama-3.3-70b/llama-3.1-8b) a veces manda
 * `assetId: 0` como placeholder cuando no conoce el id real del vehículo
 * pero sí mandó `placa` en el mismo tool call. Sin este helper, el `0`
 * hace fallar TODO el objeto de argumentos en Zod (.positive() rechaza
 * 0), y el orquestador cae al rescate más agresivo (args vacíos {}),
 * perdiendo también `placa`, `estado` y cualquier otro filtro válido
 * que sí vino bien. Con este helper, `0` se convierte en `undefined`
 * ANTES de validar, entonces el resto de los campos pasan normal y la
 * tool resuelve el vehículo por `placa` como ya hace el código.
 *
 * Uso: `assetId: tolerantAssetId()` (reemplaza a
 * `tolerantNumber().int().positive().optional()`)
 */
export function tolerantAssetId() {
  return z.preprocess(
    (val) => {
      if (val == null) return undefined;
      const n = typeof val === 'string' ? Number(val) : val;
      if (n === 0) return undefined;
      return val;
    },
    z.coerce.number().int().positive(),
  ).optional();
}

/**
 * Boolean tolerante. Acepta `true`/`false` nativos O strings tipo
 * `"true"`/`"false"`/`"1"`/`"0"`. Si el LLM manda un string en vez
 * de boolean (lo cual hace seguido el modelo chico llama-3.1-8b-instant),
 * el conversor Zod → JSON Schema emite un `anyOf: [boolean, string-enum]`
 * para que Groq NO rechace el tool call con 400 "expected boolean, but
 * got string", y este .transform() normaliza el valor a boolean real
 * antes de llegar al execute().
 *
 * Uso: `tolerantBoolean().optional().default(false)` — .optional() y
 * .default() siguen funcionando porque aplican sobre el ZodEffects
 * resultante.
 */
export const tolerantBoolean = () =>
  z
    .union([
      z.boolean(),
      z.enum(['true', 'false', '1', '0']),
    ])
    .transform((v) => (typeof v === 'string' ? v === 'true' || v === '1' : v));

/**
 * Enum tolerante que acepta TRES formatos que el LLM puede generar:
 *  1. Un valor único del enum:                 `"Correctivo"`
 *  2. Un array de valores del enum:            `["Correctivo","Programado"]`
 *  3. Un string con valores separados por coma: `"Correctivo, Programado"` ← caso del bug
 *
 * Caso (3) es lo que el modelo chico (llama-3.1-8b-instant) tiende a generar
 * cuando quiere filtrar por varios valores, en vez de mandar un array. Groq
 * rechaza eso con 400 si el JSON Schema declara `enum` simple.
 *
 * El JSON Schema emitido al LLM es:
 *   anyOf: [
 *     { type: "string", enum: [...] },
 *     { type: "array", items: { type: "string", enum: [...] } }
 *   ]
 * Así Groq acepta tanto `"Correctivo"` como `["Correctivo","Programado"]`
 * sin 400. Si llega `"Correctivo, Programado"`, el preprocess lo divide en
 * array y también pasa la validación.
 *
 * El output es siempre un array (lo aplicamos antes de pasarlo al execute).
 *
 * Uso: `enumOrList(['Correctivo', 'Programado', 'Lavada']).optional()`
 */
export function enumOrList<T extends [string, ...string[]]>(values: T) {
  return z.preprocess(
    (val) => {
      if (typeof val === 'string') {
        const trimmed = val.trim();
        // Comma-separated string: split en array (filtra vacíos)
        if (trimmed.includes(',')) {
          const parts = trimmed
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          if (parts.length > 0) return parts;
        }
        return trimmed;
      }
      return val;
    },
    z.union([
      z.enum(values),
      z.array(z.enum(values)),
    ])
  );
}

// ─── Rescate de args ────────────────────────────────────────────────
// Aplana objetos args profundamente anidados. Usado por el orquestador
// cuando el LLM pasa args con forma inesperada (ej. envuelto en
// { filters: {...} } o { date_range: {...} }).

export interface RescueStats {
  extractedKeys: string[];
  modified: boolean;
}

export function flattenArgs(input: unknown): { value: Record<string, unknown>; stats: RescueStats } {
  const result: Record<string, unknown> = {};
  const extractedKeys: string[] = [];

  const visit = (val: unknown, depth: number) => {
    if (val == null || depth > 4) return;
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return;
    if (Array.isArray(val)) {
      for (const v of val) visit(v, depth + 1);
      return;
    }
    if (typeof val === 'object') {
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        if (v == null) continue;
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          if (!(k in result)) {
            result[k] = v;
            extractedKeys.push(k);
          }
        } else {
          visit(v, depth + 1);
        }
      }
    }
  };

  visit(input, 0);
  return {
    value: result,
    stats: { extractedKeys, modified: extractedKeys.length > 0 },
  };
}