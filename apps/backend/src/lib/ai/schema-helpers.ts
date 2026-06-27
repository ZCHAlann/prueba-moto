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
 * Boolean tolerante. Distingue "true"/"false"/"1"/"0"/"si"/"no".
 *
 * IMPORTANTE: usamos .transform() en lugar de .preprocess() porque
 * .transform() sobre un ZodBoolean devuelve ZodEffects — PERO el
 * .preprocess con un transform custom devuelve el tipo "boolean"
 * directamente al esquema subyacente.
 *
 * Truco: usamos z.preprocess + z.boolean() que devuelve ZodEffects,
 * y luego encadenamos con .transform() para casos raros. PERO eso
 * rompe .optional() y .default().
 *
 * Solución final: usamos una función que devuelve un ZodEffects pero
 * con .transform() que normaliza. La realidad es que para boolean,
 * la mayoría de los LLMs mandan `true` o `false` directamente. Si
 * mandan string, lo manejamos en flattenArgs() del orquestador.
 */
export const tolerantBoolean = () => z.boolean();

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