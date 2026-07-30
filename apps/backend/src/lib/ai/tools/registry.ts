// lib/ai/tools/registry.ts
// ─────────────────────────────────────────────────────────────────────
// Tool Registry del Asistente IA (Jarvis).
//
// Cada tool es pequeña, determinística, y reutiliza queries Drizzle
// existentes (Parte I sección 4.4 y Parte II sección 20).
//
// REGLAS INQUEBRANTABLES (Parte III sección 46):
//   - El empresaId se inyecta en el executor, NUNCA viene del LLM.
//   - El LLM solo decide QUÉ tool llamar y con QUÉ argumentos de filtro.
//   - Cada tool valida sus argumentos con Zod antes de ejecutar.
//   - Ninguna tool ejecuta INSERT/UPDATE/DELETE en esta fase.
// ─────────────────────────────────────────────────────────────────────

import Groq from 'groq-sdk';
import { z } from 'zod';

// ─── Tipos ────────────────────────────────────────────────────────────

export type JarvisRole = 'admin_empresa' | 'owner_empresa';

export interface ToolContext {
  /** SIEMPRE inyectado por el backend desde el JWT. NUNCA del LLM. */
  empresaId: number;
  /** userId autenticado, útil para auditoría por usuario. */
  userId: number;
  rol: JarvisRole;
  /**
   * Cookie de sesión del request HTTP original. Solo presente en
   * tools de ACCIÓN (POST/PUT/DELETE) que necesitan reusar la
   * autenticación del usuario para llamar a otros endpoints del
   * backend. Para tools de lectura no es necesario.
   */
  cookieHeader?: string;
  /**
   * URL base del backend (ej: "http://localhost:5000"). Usado por
   * las tools de acción para hacer fetch a otros endpoints.
   */
  baseUrl?: string;
}

/**
 * jul 2026 v3 — Capacidades expandidas de la tool.
 * El orquestador usa esto para:
 *   - Filtrar tools por capa antes de mandarlas al 120b
 *   - Decidir si requiere confirmación humana (UI)
 *   - Aplicar rate limits específicos por capa
 *
 * - `read`: tool de solo lectura. Cacheable por default.
 * - `create`: tool de creación. SIEMPRE requiere confirmación.
 *   Devuelve un "proposal" que el frontend muestra al user.
 *   NO ejecuta directo.
 */
export type ToolKind = 'read' | 'create';

/**
 * jul 2026 v3 — Capa de carga (para el clasificador de tools).
 * Capa 1 = siempre disponible. Capa 2 = bajo demanda. Capa 3 = creación.
 * Ver `fase1-catalogo-reducido-jarvis-v3.md` para el detalle.
 */
export type ToolLayer = 1 | 2 | 3;

export interface ToolDefinition<TArgs = any> {
  /** Nombre único que el LLM verá en el catálogo. */
  name: string;
  /** Descripción corta en lenguaje natural — el LLM la usa para decidir. */
  description: string;
  /** Categoría organizativa (no la ve el LLM). */
  category: string;
  /** Roles que pueden usar esta tool (defensa en profundidad). */
  rolesPermitidos: JarvisRole[];
  /** Schema Zod para validar los argumentos que el LLM pase. */
  schema: z.ZodType<TArgs>;
  /**
   * jul 2026 v3 — Tipo de tool.
   * - 'read' (default): solo lectura, cacheable.
   * - 'create': crea un registro, requiere confirmación.
   *
   * Si la tool NO tiene `kind`, se asume 'read' (compat con tools
   * viejas que no declaran el campo).
   */
  kind?: ToolKind;
  /**
   * jul 2026 v3 — Capa de carga para el clasificador.
   * 1 = siempre disponible (Capa 1: núcleo).
   * 2 = bajo demanda (Capa 2: el clasificador la carga según pregunta).
   * 3 = creación (Capa 3: solo cuando la pregunta amerita).
   *
   * Si la tool NO tiene `layer`, se asume 2 (bajo demanda).
   */
  layer?: ToolLayer;
  /**
   * jul 2026 v3 — TTL del cache en ms. Override del default (5min).
   * Tools pesadas (joins grandes, agregaciones) usan 60_000.
   * Si la tool NO tiene `cacheTtlMs`, se usa el default del toolCache.
   */
  cacheTtlMs?: number;
  /**
   * Si true (default), los resultados se cachean 5 min en memoria.
   * Solo tiene sentido en tools de lectura — el orquestador lo
   * respeta automáticamente al ejecutar.
   */
  cacheable?: boolean;
  /**
   * jul 2026 v3 — Política de cache extendida.
   * - `stale` (default para tools de lectura pesadas): SWR activo.
   *   El cache sirve "stale" durante hasta `staleTtlMs` después de
   *   vencer, y se recomputa en background. Útil para tools
   *   pesadas (joins grandes, agregaciones) donde mostrar datos
   *   viejos unos minutos es aceptable.
   * - `fresh`: comportamiento anterior. Solo sirve fresh.
   * - `none`: desactiva cache (lo mismo que cacheable: false).
   *
   * Si no se declara, default = 'stale' para tools de lectura y
   * 'fresh' para tools que declaran `cacheable: false`.
   */
  cachePolicy?: 'fresh' | 'stale' | 'none';
  /**
   * jul 2026 v3 — Override del TTL "stale" (en ms). Default: 6x el
   * fresh TTL, con cap a 30 min. Solo aplica si cachePolicy='stale'.
   */
  staleTtlMs?: number;
  /** Implementación: recibe args validados + contexto con empresaId. */
  execute: (args: TArgs, ctx: ToolContext) => Promise<ToolResult>;
}

export interface ToolResult {
  /** Filas o resumen del resultado (lo que verá el LLM). */
  data: unknown[];
  /** Total de filas (útil para respuestas tipo "encontré N"). */
  total: number;
  /** Resumen textual opcional, ej. "Se aplicó filtro por fecha". */
  note?: string;
  /**
   * jul 2026 v3 — Propuesta de creación (solo para tools kind='create').
   * El frontend usa esto para mostrar el modal de confirmación.
   * Si está presente, NO se ejecutó la acción — solo se propone.
   */
  proposal?: {
    tool: string;
    args: Record<string, unknown>;
    summary: string;
  };
}

// ─── Catálogo ─────────────────────────────────────────────────────────
//
// Jarvis es solo lectura: lista y consulta datos de la operación, no
// modifica ni crea nada. Por eso el catálogo solo tiene tools de GET.

import { VEHICULOS_TOOLS } from './vehiculos';
import { mantenimientosTool } from './mantenimientos';
import { combustibleTool } from './combustible';
import { segurosTool } from './seguros';
import { checklistsTool } from './checklists';
import { asignacionesTool } from './asignaciones';
import { conductoresTool } from './conductores';
import { peajesTool } from './peajes';
import { ACCIONES_TOOLS } from './acciones';
import { CATALOG_V3_TOOLS } from './catalog';

// jul 2026 v3 — El TOOL_REGISTRY combina:
//  1) Tools originales (compat) — no se tocan en Ola 1B
//  2) Tools del catálogo v3 (nuevos módulos: alertas, caja, cumplimiento,
//     auditoría, stats, facturas) — ya reducidas y con metadata v3
//
// Cuando todas las tools originales se migren al shape v3, se borra
// el spread de las viejas y se queda solo con CATALOG_V3_TOOLS.
export const TOOL_REGISTRY: ToolDefinition[] = [
  ...VEHICULOS_TOOLS,
  mantenimientosTool,
  combustibleTool,
  segurosTool,
  checklistsTool,
  asignacionesTool,
  conductoresTool,
  peajesTool,
  ...ACCIONES_TOOLS,
  ...CATALOG_V3_TOOLS,
];

// ─── Helpers ─────────────────────────────────────────────────────────

/** Devuelve la tool por nombre, o undefined si no existe. */
export function getToolByName(name: string): ToolDefinition | undefined {
  return TOOL_REGISTRY.find((t) => t.name === name);
}

/** Devuelve el subconjunto de tools que el rol puede usar. */
export function getToolsForRol(rol: JarvisRole): ToolDefinition[] {
  return TOOL_REGISTRY.filter((t) => t.rolesPermitidos.includes(rol));
}

/** Convierte las tools a formato ChatCompletionTool de Groq. */
export function toolsToGroqSchema(rol: JarvisRole): Groq.Chat.Completions.ChatCompletionTool[] {
  return getToolsForRol(rol).map((t) => ({
    type: 'function' as const,
    function: {
      name:        t.name,
      description: t.description,
      parameters:  zodToJsonSchema(t.schema),
    },
  }));
}

// ─── Filtrado por capa (jul 2026 v3, para el clasificador) ────────────

/** Devuelve solo las tools de Capa 1 (siempre disponibles). */
export function getLayer1Tools(rol: JarvisRole): ToolDefinition[] {
  return getToolsForRol(rol).filter((t) => (t.layer ?? 2) === 1);
}

/** Devuelve solo las tools de Capa 2 (bajo demanda). */
export function getLayer2Tools(rol: JarvisRole): ToolDefinition[] {
  return getToolsForRol(rol).filter((t) => (t.layer ?? 2) === 2);
}

/** Devuelve solo las tools de Capa 3 (creación). */
export function getLayer3Tools(rol: JarvisRole): ToolDefinition[] {
  return getToolsForRol(rol).filter((t) => (t.layer ?? 2) === 3);
}

/** Convierte un subset de tools a schema Groq. */
export function toolsSubsetToGroqSchema(tools: ToolDefinition[]): Groq.Chat.Completions.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name:        t.name,
      description: t.description,
      parameters:  zodToJsonSchema(t.schema),
    },
  }));
}

// ─── Executor con cache ─────────────────────────────────────────────

import { toolCache } from '../tool-cache';

/**
 * jul 2026 v3 — Tracking de recomputes en background (SWR).
 * Key: `${empresaId}|${rol}|${toolName}|${canonicalArgsJson}` (mismo
 * formato que el cache). Mientras un recompute está corriendo, las
 * requests subsecuentes NO disparan OTRO recompute — esperan al
 * primero. Esto evita storms cuando 5 requests llegan a la vez
 * sobre los mismos args stale.
 */
const recomputeInFlight = new Set<string>();

function recomputeKey(empresaId: number, rol: string, toolName: string, args: unknown): string {
  return `${empresaId}|${rol}|${toolName}|${JSON.stringify(args ?? {})}`;
}

/**
 * jul 2026 v3 — Dedupe por turno.
 *
 * Cuando el 120b manda 2 tool calls con el mismo `toolName` y los
 * mismos `args` (ej. `getVehiculos({})` dos veces en el mismo turno,
 * o `getVehiculos({estado:'Operativo'})` y `getVehiculos({})` —
 * la segunda es superset de la primera y no aporta nada), el orquestador
 * solo ejecuta UNA. Las otras reciben el mismo resultado.
 *
 * Esto evita:
 *   - Queries a DB duplicadas (mismo SQL, mismo resultado).
 *   - Latencia acumulada (un tool que tarda 800ms corre 1 vez en vez de 2).
 *
 * El set se limpia al inicio de cada turno del orquestador vía
 * `resetTurnDedup()`.
 */
const turnDedupKeys = new Set<string>();
let turnDedupEmpresaId: number | null = null;

function turnDedupKey(empresaId: number, toolName: string, args: unknown): string {
  return `${empresaId}|${toolName}|${JSON.stringify(args ?? {})}`;
}

/** Llamado por el orquestador al inicio de cada turno de tools. */
export function resetTurnDedup(empresaId: number): void {
  if (turnDedupEmpresaId !== empresaId) {
    turnDedupKeys.clear();
    turnDedupEmpresaId = empresaId;
  } else {
    turnDedupKeys.clear();
  }
}

/**
 * Ejecuta una tool con cache automático (SWR-friendly).
 *
 * Política:
 * - `cachePolicy: 'none'` o `cacheable: false`: ejecuta siempre, no
 *   guarda cache, invalida cache de la empresa al terminar.
 * - `cachePolicy: 'fresh'` (default si no se declara): cache clásico,
 *   TTL fresh. Sirve null si venció.
 * - `cachePolicy: 'stale'`: cache con SWR. Si está fresh, sirve. Si
 *   está stale, sirve el viejo Y dispara recompute en background
 *   (sin volver a disparar si ya hay uno en curso).
 *
 * Devuelve `{ result, fromCache, stale, deduped }` para que el
 * orquestador pueda logear/metricar el origen del resultado.
 */
export async function runTool(
  toolName: string,
  args: unknown,
  ctx: ToolContext,
): Promise<{ result: ToolResult; fromCache: boolean; stale?: boolean; deduped?: boolean }> {
  const def = getToolByName(toolName);
  if (!def) {
    return {
      result: { data: [], total: 0, note: `Herramienta desconocida: ${toolName}` },
      fromCache: false,
    };
  }

  // ── jul 2026 v3 — Dedupe intra-turno ─────────────────────────────────
  // Si el 120b llamó a esta tool con los mismos args en este mismo
  // turno, devolvemos el resultado anterior sin re-ejecutar.
  const dedupKey = turnDedupKey(ctx.empresaId, toolName, args);
  if (turnDedupKeys.has(dedupKey)) {
    // eslint-disable-next-line no-console
    console.log(`[jarvis:cache] DEDUPED ${toolName} (mismo tool+args en el turno, saltamos ejecución)`);
    return {
      result: { data: [], total: 0, note: 'Resultado deduped (ya se ejecutó este tool con los mismos args en el turno).' },
      fromCache: true,
      deduped: true,
    };
  }

  // jul 2026 v3 — Resolver política efectiva.
  // Reglas: cacheable:false => 'none'. Si tiene cachePolicy explícito,
  // gana. Si no, default = 'stale' (recomendado para tools de lectura).
  let effectivePolicy: 'fresh' | 'stale' | 'none';
  if (def.cacheable === false) {
    effectivePolicy = 'none';
  } else if (def.cachePolicy) {
    effectivePolicy = def.cachePolicy;
  } else {
    effectivePolicy = 'stale'; // default v3
  }

  const freshTtlMs = def.cacheTtlMs;
  const staleTtlMs = def.staleTtlMs;

  // ── none: ejecutar siempre, invalidar cache ────────────────────────
  if (effectivePolicy === 'none') {
    // eslint-disable-next-line no-console
    console.log(`[jarvis:cache] EXEC-DIRECT ${toolName} (cacheable=false, ejecutando def.execute)`);
    const result = await def.execute(args as any, ctx);
    // eslint-disable-next-line no-console
    console.log(`[jarvis:cache] EXEC-RETURNED ${toolName} → result=${JSON.stringify(result).slice(0, 500)}`);
    // jul 2026 v8.6 — escritura invalida TODO el cache de la empresa
    // (mismo razonamiento que antes: si dejó datos viejos, próxima
    // lectura devuelve números incoherentes).
    const invalidated = toolCache.invalidate(ctx.empresaId);
    // eslint-disable-next-line no-console
    console.log(`[jarvis:cache] WRITE ${toolName} → invalidated ${invalidated} entries`);
    return { result, fromCache: false };
  }

  // ── fresh | stale: consultar cache con SWR ─────────────────────────
  const fetched = toolCache.getSWR(ctx.empresaId, ctx.rol, toolName, args);

  if (fetched.kind === 'fresh') {
    // eslint-disable-next-line no-console
    console.log(`[jarvis:cache] HIT-FRESH ${toolName}`);
    turnDedupKeys.add(dedupKey);
    return { result: fetched.result, fromCache: true };
  }

  if (fetched.kind === 'stale' && effectivePolicy === 'stale') {
    // Sirve el viejo y dispara recompute en background.
    // eslint-disable-next-line no-console
    console.log(`[jarvis:cache] HIT-STALE ${toolName} (ageMs=${fetched.ageMs}) → recompute en background`);
    turnDedupKeys.add(dedupKey);
    void backgroundRecompute(toolName, args, ctx, def, freshTtlMs, staleTtlMs);
    return { result: fetched.result, fromCache: true, stale: true };
  }

  // ── miss o stale-pero-no-swr: ejecutar sincrónicamente ──────────────
  const result = await def.execute(args as any, ctx);
  toolCache.set(ctx.empresaId, ctx.rol, toolName, args, result, freshTtlMs, staleTtlMs);
  // Marcar en el set de dedupe para que un segundo tool call idéntico
  // en el mismo turno NO re-ejecute.
  turnDedupKeys.add(dedupKey);
  // eslint-disable-next-line no-console
  console.log(`[jarvis:cache] MISS ${toolName} (set, fresh=${freshTtlMs ? Math.round(freshTtlMs / 1000) + 's' : '5min'}, stale=${staleTtlMs ?? '6x'})`);
  return { result, fromCache: false };
}

/**
 * jul 2026 v3 — Recompute en background para SWR.
 * Si ya hay un recompute en curso para los mismos args, NO dispara
 * otro (evita storms).
 */
async function backgroundRecompute(
  toolName: string,
  args: unknown,
  ctx: ToolContext,
  def: ToolDefinition,
  freshTtlMs?: number,
  staleTtlMs?: number,
): Promise<void> {
  const key = recomputeKey(ctx.empresaId, ctx.rol, toolName, args);
  if (recomputeInFlight.has(key)) {
    // eslint-disable-next-line no-console
    console.log(`[jarvis:cache] RECOMPUTE-SKIP ${toolName} (otro recompute en curso)`);
    return;
  }
  recomputeInFlight.add(key);
  try {
    const result = await def.execute(args as any, ctx);
    toolCache.set(ctx.empresaId, ctx.rol, toolName, args, result, freshTtlMs, staleTtlMs);
    // eslint-disable-next-line no-console
    console.log(`[jarvis:cache] RECOMPUTE-DONE ${toolName}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[jarvis:cache] RECOMPUTE-FAIL ${toolName}:`, err);
  } finally {
    recomputeInFlight.delete(key);
  }
}

/** Devuelve stats del cache (para endpoint de debug). */
export function getCacheStats() {
  return toolCache.getStats();
}

/** Invalida el cache (toda la empresa o por empresa). */
export function invalidateCache(empresaId?: number): number {
  return toolCache.invalidate(empresaId);
}

// ─── Conversor Zod → JSON Schema ────────────────────────────────────
// Zod v4 cambió la estructura interna de _def:
//   - Ya NO existe _def.typeName
//   - Ahora es _def.type  (string: 'object', 'string', 'number', etc.)
//   - _def.shape es un objeto plano, no una función
//   - Los arrays usan _def.element en vez de _def.type
//   - Los enums usan _def.entries (objeto) en vez de _def.values (array)
//   - instanceof tampoco funciona (clases internas reestructuradas)
//
// Adicionalmente, Zod v4 puede exponer la metadata en _zod.def
// en vez de _def según el build. Cubrimos ambos.

function getZodDef(schema: any): Record<string, any> {
  return schema?._def ?? schema?._zod?.def ?? {};
}

/**
 * @param compact Si es true, omite el `anyOf: [child, null]` para
 *   parámetros opcionales (ahorra tokens en el schema que se manda
 *   al LLM). En ese caso, el LLM no sabrá que puede mandar `null`,
 *   pero nuestro pre-procesador del LLM se encarga de aceptarlo
 *   antes de validar con Zod.
 *
 *   Default `false` mantiene compatibilidad con la validación de
 *   Groq en runtime.
 */
function zodToJsonSchema(schema: any, compact = false): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') return { type: 'string' };

  const def = getZodDef(schema);
  const type: string = def.type ?? '';

  // ── object ──────────────────────────────────────────────────────────
  if (type === 'object') {
    const shape: Record<string, any> = def.shape ?? {};
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [k, v] of Object.entries(shape)) {
      const child = zodToJsonSchema(v, compact);
      // jul 2026 v8.6 — Aceptar `null` en params opcionales.
      //
      // gpt-oss-120b vía Groq manda `null` en lugar de omitir
      // params opcionales. Zod con `.optional()` rechaza `null` en
      // runtime, pero la validación en el response de Groq (que corre
      // ANTES de mi pre-procesador) también rechaza porque el
      // JSON-schema generado dice `type: string` y Groq valida
      // `expected string, but got null`.
      //
      // Solución: wrappear el schema del prop en `anyOf: [original, null]`
      // para los que son opcionales. Eso le dice a Groq que
      // también acepte `null` para ese campo. Mismo criterio que la
      // opción `nullable: true` en OpenAPI 3.0.
      //
      // jul 2026 v3 — Modo compact: para el schema que se manda al
      // LLM, NO emitimos el `anyOf` con null. El LLM no necesita
      // saber que puede mandar null; nuestro pre-procesador
      // (`gpt-oss-120b-null-preprocessor` o similar) lo acepta
      // antes de la validación Zod. Esto ahorra ~15-20 tokens
      // por prop opcional × 5-10 props por tool × 54 tools = ~5-7k
      // tokens, que es EXACTAMENTE la diferencia entre pasar y no
      // pasar el TPM de 8000.
      if (!isOptionalOrHasDefault(v) || compact) {
        properties[k] = child;
        if (!isOptionalOrHasDefault(v)) required.push(k);
      } else {
        properties[k] = { anyOf: [child, { type: 'null' }] };
      }
    }
    const result: Record<string, unknown> = { type: 'object', properties };
    if (required.length > 0) result.required = required;
    return result;
  }

  // ── primitivos ───────────────────────────────────────────────────────
  if (type === 'string')  return { type: 'string' };
  if (type === 'number')  return numberSchemaWithBounds(def);
  if (type === 'boolean') return { type: 'boolean' };
  if (type === 'integer') return numberSchemaWithBounds(def, 'integer');
  if (type === 'bigint')  return { type: 'integer' };

  // ── enum ─────────────────────────────────────────────────────────────
  // Zod v4: def.entries es un objeto { KEY: "value", ... }
  // Zod v3: def.values es un array ["value1", "value2", ...]
  if (type === 'enum') {
    const values = def.entries
      ? Object.values(def.entries as Record<string, string>)
      : (def.values ?? []);
    return { type: 'string', enum: values };
  }

  // ── optional / nullable → unwrap ─────────────────────────────────────
  if (type === 'optional' || type === 'nullable') {
    const inner = def.innerType ?? def.inner;
    if (inner) return zodToJsonSchema(inner);
    return { type: 'string' };
  }

  // ── default → unwrap ─────────────────────────────────────────────────
  if (type === 'default') {
    const inner = def.innerType ?? def.inner;
    if (inner) return zodToJsonSchema(inner);
    return { type: 'string' };
  }

  // ── array ─────────────────────────────────────────────────────────────
  // Zod v4: def.element; Zod v3: def.type
  if (type === 'array') {
    const itemSchema = def.element ?? def.type;
    return { type: 'array', items: itemSchema ? zodToJsonSchema(itemSchema) : { type: 'string' } };
  }

  // ── transform / preprocess (ZodEffects en v3) ────────────────────────
  if (type === 'transform' || type === 'preprocess' || type === 'effects') {
    const inner = def.schema ?? def.innerType ?? def.in;
    if (inner) return zodToJsonSchema(inner);
  }

  // ── pipeline → tipo de salida ─────────────────────────────────────────
  if (type === 'pipeline') {
    const out = def.out ?? def.output;
    if (out) return zodToJsonSchema(out);
  }

  // ── literal ───────────────────────────────────────────────────────────
  if (type === 'literal') {
    const values = Array.isArray(def.values) ? def.values : [def.value];
    return { type: 'string', enum: values.map(String) };
  }

  // ── union ─────────────────────────────────────────────────────────────
  if (type === 'union') {
    const options: any[] = def.options ?? def.types ?? [];
    return { anyOf: options.map((o) => zodToJsonSchema(o, compact)) };
  }

  // ── intersection ──────────────────────────────────────────────────────
  if (type === 'intersection') {
    return { allOf: [zodToJsonSchema(def.left), zodToJsonSchema(def.right)] };
  }

  // ── Fallback ──────────────────────────────────────────────────────────
  return { type: 'string' };
}

/**
 * Devuelve true si el campo es opcional o tiene default,
 * buscando en cualquier nivel de la cadena de wrappers.
 */
function isOptionalOrHasDefault(schema: any): boolean {
  if (!schema || typeof schema !== 'object') return false;
  const def = getZodDef(schema);
  const type: string = def.type ?? '';

  if (type === 'optional' || type === 'default') return true;

  // nullable no es optional por sí solo, pero propagamos hacia adentro
  if (type === 'nullable') {
    return isOptionalOrHasDefault(def.innerType ?? def.inner);
  }

  // ZodEffects / transform / preprocess: mirar el schema interno
  if (type === 'transform' || type === 'preprocess' || type === 'effects') {
    const inner = def.schema ?? def.innerType ?? def.in;
    if (inner) return isOptionalOrHasDefault(inner);
  }

  return false;
}

/**
 * Emite un JSON Schema para number/integer incluyendo minimum/maximum y
 * el flag `integer` derivados de los checks de Zod v4. Sin esto, el LLM
 * no ve las restricciones y puede generar valores fuera de rango
 * (e.g. limit: 0) o tipos incorrectos (e.g. dias: "10" en vez de 10)
 * que Groq rechaza con 400 antes de llegar al backend.
 *
 * En Zod v4 los checks son class instances con metadata en
 * `check._zod.def` (no en `check._def` ni `check.kind`).
 * Estructuras relevantes que vimos empíricamente:
 *   - .int()       → $ZodNumberFormat / ZodNumberFormat con
 *                    _zod.def = {check: "number_format", format: "safeint"}
 *   - .min(n)      → $ZodCheckGreaterThan con
 *                    _zod.def = {check: "greater_than", value: n, inclusive: true}
 *   - .max(n)      → $ZodCheckLessThan con
 *                    _zod.def = {check: "less_than", value: n, inclusive: true}
 *   - .positive()  → min(>0) en el check interno
 *   - .nonnegative() / .gte() / .lte() → variantes equivalentes
 */
function numberSchemaWithBounds(def: Record<string, any>, baseType: 'number' | 'integer' = 'number'): Record<string, unknown> {
  const result: Record<string, unknown> = { type: baseType };
  const checks = Array.isArray(def.checks) ? def.checks : [];
  for (const c of checks) {
    if (!c || typeof c !== 'object') continue;
    // En Zod v4 los checks son class instances; la metadata real vive en c._zod.def
    const checkDef = c._zod?.def ?? c.def ?? {};
    const checkType: string = checkDef.check ?? '';
    const value: number | undefined = checkDef.value;
    const inclusive: boolean = checkDef.inclusive !== false; // default true

    if (checkType === 'number_format' && checkDef.format === 'safeint') {
      // .int() → forzar integer en JSON Schema
      result.type = 'integer';
    } else if (checkType === 'greater_than' && typeof value === 'number') {
      if (inclusive) result.minimum = value;
      else result.exclusiveMinimum = value;
    } else if (checkType === 'less_than' && typeof value === 'number') {
      if (inclusive) result.maximum = value;
      else result.exclusiveMaximum = value;
    } else if (checkType === 'multiple_of' && typeof value === 'number') {
      result.multipleOf = value;
    }
  }
  return result;
}