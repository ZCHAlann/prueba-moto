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
}

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
   * Si true (default), los resultados se cachean 5 min en memoria.
   * Solo tiene sentido en tools de lectura — el orquestador lo
   * respeta automáticamente al ejecutar.
   */
  cacheable?: boolean;
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
}

// ─── Catálogo ─────────────────────────────────────────────────────────
//
// Jarvis es solo lectura: lista y consulta datos de la operación, no
// modifica ni crea nada. Por eso el catálogo solo tiene tools de GET.

import { vehiculosTool } from './vehiculos';
import { mantenimientosTool } from './mantenimientos';
import { combustibleTool } from './combustible';
import { segurosTool } from './seguros';
import { checklistsTool } from './checklists';
import { asignacionesTool } from './asignaciones';
import { conductoresTool } from './conductores';
import { peajesTool } from './peajes';

export const TOOL_REGISTRY: ToolDefinition[] = [
  vehiculosTool,
  mantenimientosTool,
  combustibleTool,
  segurosTool,
  checklistsTool,
  asignacionesTool,
  conductoresTool,
  peajesTool,
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

// ─── Executor con cache ─────────────────────────────────────────────

import { toolCache } from '../tool-cache';

/**
 * Ejecuta una tool con cache automático para tools `cacheable`.
 * Devuelve `{ result, fromCache }` para que el orquestador sepa si
 * contar latencia real (0 si vino de cache).
 */
export async function runTool(
  toolName: string,
  args: unknown,
  ctx: ToolContext,
): Promise<{ result: ToolResult; fromCache: boolean }> {
  const def = getToolByName(toolName);
  if (!def) {
    return {
      result: { data: [], total: 0, note: `Herramienta desconocida: ${toolName}` },
      fromCache: false,
    };
  }
  const cacheable = def.cacheable !== false; // default true
  if (cacheable) {
    const cached = toolCache.get(ctx.empresaId, ctx.rol, toolName, args);
    if (cached) {
      return { result: cached, fromCache: true };
    }
  }
  const result = await def.execute(args as any, ctx);
  if (cacheable) {
    toolCache.set(ctx.empresaId, ctx.rol, toolName, args, result);
  }
  return { result, fromCache: false };
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

function zodToJsonSchema(schema: any): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') return { type: 'string' };

  const def = getZodDef(schema);
  const type: string = def.type ?? '';

  // ── object ──────────────────────────────────────────────────────────
  if (type === 'object') {
    const shape: Record<string, any> = def.shape ?? {};
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [k, v] of Object.entries(shape)) {
      properties[k] = zodToJsonSchema(v);
      if (!isOptionalOrHasDefault(v)) required.push(k);
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
    return { anyOf: options.map(zodToJsonSchema) };
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
 * Emite un JSON Schema para number/integer incluyendo minimum/maximum
 * extraídos de los checks de Zod. Sin esto, el LLM no ve las restricciones
 * y puede generar valores fuera de rango (e.g. limit: 0) que Groq rechaza
 * con 400 antes de llegar al backend.
 */
function numberSchemaWithBounds(def: Record<string, any>, baseType: 'number' | 'integer' = 'number'): Record<string, unknown> {
  const result: Record<string, unknown> = { type: baseType };
  const checks = Array.isArray(def.checks) ? def.checks : [];
  for (const c of checks) {
    if (!c || typeof c !== 'object') continue;
    if (c.kind === 'min' && c.value !== undefined) result.minimum = c.value;
    if (c.kind === 'max' && c.value !== undefined) result.maximum = c.value;
  }
  return result;
}