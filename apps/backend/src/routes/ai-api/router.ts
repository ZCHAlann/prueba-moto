// routes/ai-api/router.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 — Router unificado para /api/ai/*.
//
// POR QUÉ ESTE ARCHIVO EXISTE:
// OpenAI Custom GPT Actions tiene un límite estricto de 30 operaciones
// por schema. Nuestra API tiene 70 endpoints. Para evitar partir en
// 2 GPTs, exponemos SOLO 4 operaciones genéricas:
//
//   - consultar(modulo, operacion, filtros)   → GETs
//   - crear(modulo, operacion, datos)         → POSTs
//   - modificar(modulo, operacion, id, datos) → PATCH/PUT
//   - eliminar(modulo, operacion, id, confirmar) → DELETE
//
// El LLM aprende el mapa (modulo, operacion) en las instrucciones. El
// backend valida contra una whitelist de operaciones permitidas.
//
// CÓMO SE REGISTRA UNA OPERACIÓN:
//   registerOperation({ modulo, operacion, scope, inputSchema, handler })
//   donde handler(ctx, input) => Promise<unknown> devuelve lo que va al
//   response.
//
// CÓMO SE MIGRA DESDE EL MONOLITO ANTERIOR:
//   Los routers por módulo exponen handlers con la MISMA firma que
//   antes. Acá los re-exportamos en un registro. Si en el futuro
//   OpenAI levanta el límite, podemos exponer cada operación
//   individual y borrar este router.
// ─────────────────────────────────────────────────────────────────────

import { Router, type Request } from 'express';
import { z, type ZodTypeAny } from 'zod';
import { authAiApiKey, requireAiApiScope, type AiApiContext } from '../../middlewares/auth-ai-key';
import { withAudit, requireCtx, parseBody } from './shared';
import { AppError, NotFoundError } from '../../lib/errors';
import { toId } from '../../lib/ids';
import { toDidacticError } from './error-format';

// ── Tipos ─────────────────────────────────────────────────────────────

export type OperationScope = 'read' | 'write';

/** Handler que ejecuta la operación. Devuelve el body del response. */
export type OperationHandler = (
  ctx: AiApiContext,
  input: any,
) => Promise<unknown>;

/** Definición de una operación. */
export interface OperationDef {
  modulo: string;          // 'vehiculos' | 'mantenimientos' | 'combustible' | ...
  operacion: string;        // 'lista' | 'detalle' | 'atrasados' | ...
  scope: OperationScope;
  summary: string;          // descripción corta
  inputSchema: ZodTypeAny;  // valida el input de la operación
  handler: OperationHandler;
}

// ── Registro (in-memory) ────────────────────────────────────────────

const registry: OperationDef[] = [];

/**
 * Registra una operación. Llamar UNA vez por (modulo, operacion) en el
 * momento del import. Si se llama dos veces, tira error (para evitar
 * duplicados accidentales).
 */
export function registerOperation(def: OperationDef): void {
  const exists = registry.find(
    (r) => r.modulo === def.modulo && r.operacion === def.operacion,
  );
  if (exists) {
    throw new Error(
      `Operacion duplicada: ${def.modulo}/${def.operacion}. ` +
      `Cada par (modulo, operacion) debe ser unico.`,
    );
  }
  registry.push(def);
}

/** Lista las operaciones registradas. */
export function listOperations(): readonly OperationDef[] {
  return registry;
}

/** Devuelve la operación que matchea (modulo, operacion) o null. */
export function findOperation(modulo: string, operacion: string): OperationDef | null {
  return registry.find((r) => r.modulo === modulo && r.operacion === operacion) ?? null;
}

// ── Helpers de input ──────────────────────────────────────────────────

/**
 * Helper: parsea el path param `id` que viene como `'maintenance-12'` o
 * `'maintenance_12'` o `'12'`. Devuelve el id numérico.
 *
 * NOTA: Esta funcion es SOLO para los endpoints de la AI API
 * (/api/ai/*). Es mas permisiva que la version "normal" porque el
 * LLM suele inventar prefijos ("vehicle-N" en vez de "vehiculo-N",
 * "alert-N" en vez de "alerta-N", etc).
 *
 * Acepta:
 *   - `modulo-N` o `modulo_N` (ej: "vehiculo-14")
 *   - Cualquier prefijo terminado en -N o _N seguido de numero
 *     (ej: "vehicle-14", "vh-14", "assets-14"). El prefijo se ignora,
 *     solo importa el numero.
 *   - Numero puro (ej: 14, "14")
 *
 * Si no matchea ninguno, tira 400 con un mensaje claro que incluye
 * el formato esperado.
 */
function parsePathId(raw: unknown, modulo: string): number {
  if (raw === undefined || raw === null) {
    throw new AppError(400, `Falta el campo "id" en el body`);
  }
  const s = String(raw).trim();
  // Aceptar cualquier prefijo terminado en -N o _N seguido de numero,
  // o numero puro. Ejemplos validos: "vehiculo-14", "vehicle-14",
  // "vh-14", "14", "vehiculo_14".
  const m = s.match(/^(?:[a-z]+[-_])?(\d+)$/i);
  if (!m) {
    throw new AppError(
      400,
      `ID invalido: "${s}" (formato esperado: ${modulo}-N, cualquierPrefijo-N, o solo el numero N)`,
    );
  }
  const n = Number(m[1]);
  if (!Number.isInteger(n) || n <= 0) {
    throw new AppError(400, `ID invalido: "${s}" (debe ser positivo)`);
  }
  return n;
}

// ── Express router ──────────────────────────────────────────────────

const router = Router();

// ── Envelope helpers (Fase 1) ───────────────────────────────────────
// jul 2026 v2.1 — Respuesta uniforme {ok, data, meta, resumenTexto}.
// El LLM recibe SIEMPRE el mismo shape, sin importar la operación.
// Si el handler ya devolvió {resumenTexto, ...resto}, lo subimos al
// top-level (meta) y "resto" va a data. Si no, lo generamos a partir
// del resultado y dejamos data=result.
//
// Esto evita que el LLM tenga que aprender el shape específico de
// cada operación (a veces un array, a veces un objeto, a veces
// paginado). Con el envelope, `data` siempre es "lo útil" y
// `resumenTexto` siempre es una frase en español.
function wrapOk(result: unknown, meta: Record<string, unknown> = {}): {
  ok: true;
  data: unknown;
  meta: { requestId: string; timestamp: string; [k: string]: unknown };
  resumenTexto: string;
} {
  const requestId = (meta.requestId as string) ?? `req-${Date.now()}`;
  let data = result;
  let resumenTexto = '';

  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const obj = result as Record<string, unknown>;
    if (typeof obj.resumenTexto === 'string' && obj.resumenTexto.length > 0) {
      resumenTexto = obj.resumenTexto;
      const { resumenTexto: _r, ...rest } = obj;
      data = rest;
    }
  }
  if (!resumenTexto) {
    resumenTexto = autoResumen(data);
  }
  // jul 2026 v2.2 — Si meta trae calidad con score<90, lo agregamos al
  // resumen para que el LLM lo destaque al usuario. Si es >=90, no
  // estorba (los datos son buenos, no hace falta decir nada).
  if (meta.calidad && typeof meta.calidad === 'object') {
    const c = meta.calidad as any;
    if (typeof c.score === 'number' && c.score < 90) {
      const cR = c.resumen ?? c.detalle?.[0]?.mensaje;
      if (cR && resumenTexto && !resumenTexto.includes(cR)) {
        resumenTexto = `${resumenTexto} ⚠️ ${cR}`;
      }
    }
  }

  return {
    ok: true,
    data,
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
      ...meta,
    },
    resumenTexto,
  };
}

/** Genera un resumen automático en español si el handler no lo proveyó. */
function autoResumen(data: unknown): string {
  if (data === null || data === undefined) {
    return 'Operación completada (sin datos).';
  }
  if (Array.isArray(data)) {
    return `${data.length} resultado${data.length !== 1 ? 's' : ''}.`;
  }
  if (typeof data === 'object') {
    const o = data as Record<string, unknown>;
    if (typeof o.total === 'number' || typeof o.registros === 'number') {
      const n = o.registros ?? o.total ?? 0;
      return `${n} registro${Number(n) !== 1 ? 's' : ''}.`;
    }
    if (typeof o.id !== 'undefined' || typeof o.code !== 'undefined') {
      const label = o.name ?? o.code ?? o.title ?? o.id ?? 'registro';
      return `Registro "${label}" procesado.`;
    }
  }
  return 'Operación completada.';
}

/** Envelope de error uniforme. */
function wrapError(err: AppError | { status: number; message: string; code?: string; detalles?: any }): {
  ok: false;
  error: { codigo: string; mensaje: string; detalles?: unknown; requestId: string };
} {
  const status = err.status ?? 500;
  const codigo = (err as any).code ?? (status === 400 ? 'BAD_REQUEST' : status === 404 ? 'NOT_FOUND' : status === 403 ? 'FORBIDDEN' : 'INTERNAL_ERROR');
  return {
    ok: false,
    error: {
      codigo,
      mensaje: err.message,
      detalles: (err as any).detalles,
      requestId: `req-${Date.now()}`,
    },
  };
}

/**
 * Los 4 endpoints que el LLM ve en el OpenAPI. Cada uno acepta un
 * body uniforme con `modulo` + `operacion` + input específico.
 */

const baseBody = z.object({
  modulo: z.string().min(1),
  operacion: z.string().min(1),
});

const consultarBody = baseBody.extend({
  filtros: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  // Aceptamos el identificador en lenguaje natural al top-level también
  // (ej: {modulo, operacion, query: "ABM-4662"}). El handler lo inyecta
  // como filtro antes de pasar al op handler.
  query: z.string().min(1).optional(),
  identificador: z.string().min(1).optional(),
  buscar: z.string().min(1).optional(),
}).transform((body: any) => {
  // Si el LLM mandó query/buscar/identificador al top-level, lo movemos
  // a filtros como "vehiculo" (que es lo que la mayoría de operaciones
  // de detalle entienden para resolver por nombre/placa). NO lo metemos
  // como "id" porque parseEntityId espera formato "vehicle-14" o "14",
  // y un nombre como "ABM-4662" rompe.
  const q = body.query ?? body.buscar ?? body.identificador;
  if (q) {
    body.filtros = { ...(body.filtros ?? {}), query: q, vehiculo: q };
    delete body.query;
    delete body.buscar;
    delete body.identificador;
  }
  return body;
});

/**
 * Si el body NO trae "datos" pero sí trae campos extra al
 * top-level (ej: {modulo, operacion, estado, motivo}), los movemos
 * a "datos" automáticamente. Si no trae "datos" ni campos extra,
 * creamos "datos: {}" para que el handler reciba al menos un objeto
 * y pueda tirar un error claro de "campo X requerido" en vez de
 * "datos undefined".
 */
function extractDatos(body: any): any {
  if (body && typeof body === 'object' && !body.datos) {
    const { modulo, operacion, id, confirmar, filtros, ...rest } = body;
    if (Object.keys(rest).length > 0) {
      return { ...body, datos: rest };
    }
    // Sin campos extra: igual creamos datos: {} para evitar el 400
    // generico "datos undefined". El handler especifico va a tirar
    // un error mas claro de "campo X requerido".
    return { ...body, datos: {} };
  }
  return body;
}

// Aceptamos datos como opcional. Si no viene, extractDatos() lo crea
// como {} para que el handler reciba algo y tire un error claro
// sobre campos faltantes en vez del error generico "datos undefined".
const crearBody = baseBody.extend({
  datos: z.record(z.any()).optional(),
}).transform(extractDatos);

const modificarBody = baseBody.extend({
  id: z.union([z.string(), z.number()]),
  datos: z.record(z.any()).optional(),
}).transform(extractDatos);

const eliminarBody = baseBody.extend({
  id: z.union([z.string(), z.number()]),
  confirmar: z.literal(true, {
    errorMap: () => ({ message: 'Debe ser true literal' }),
  }),
});

// ── /router/consultar ───────────────────────────────────────────────
router.post(
  '/router/consultar',
  authAiApiKey,
  withAudit(async (req, res) => {
    const ctx = requireCtx(req);
    const body = parseBody(consultarBody, req.body);

    const op = findOperation(body.modulo, body.operacion);
    if (!op) {
      throw new AppError(
        404,
        `Operacion no encontrada: ${body.modulo}/${body.operacion}. ` +
        `Consulta la lista de operaciones disponibles con getOperaciones.`,
      );
    }
    if (op.scope !== 'read') {
      throw new AppError(
        400,
        `La operacion ${body.modulo}/${body.operacion} es de escritura. ` +
        `Usa "crear" o "modificar" segun corresponda.`,
      );
    }

    // Setear modulo+operacion en el context para que withAudit pueda
    // formatear errores didacticos aunque el handler haga su propio
    // schema.parse() interno.
    if (req.aiContext) {
      req.aiContext.modulo = body.modulo;
      req.aiContext.operacion = body.operacion;
    }

    // Validar filtros (si los hay) contra el schema de la operación.
    // El input final es: { ...filtros, ... } — el handler sabe qué
    // esperar de cada operación.
    const input = { ...(body.filtros ?? {}) };
    const parsed = op.inputSchema.safeParse(input);
    if (!parsed.success) {
      throw toDidacticError(parsed.error, body.modulo, body.operacion, input);
    }

    const result = await op.handler(ctx, parsed.data);

    // jul 2026 v2.2 — Calidad de datos: cuando el LLM pide el detalle
    // de un vehículo, calculamos un score 0-100 y lo inyectamos en
    // `meta.calidad`. Asi el LLM puede avisar al usuario cuando los
    // datos son incompletos (ej. odómetro nunca registrado).
    const meta: Record<string, unknown> = {};
    if (body.modulo === 'vehiculos' && body.operacion === 'detalle' && result && typeof result === 'object') {
      try {
        const assetId = Number((result as any).id);
        if (Number.isInteger(assetId) && assetId > 0) {
          const { calidadVehiculo } = await import('./calidad-datos');
          meta.calidad = await calidadVehiculo(ctx.companyId, assetId);
        }
      } catch (err) {
        // No crítico: si falla el calculo de calidad, seguimos.
        console.warn('[ai-api] calidadVehiculo failed (non-critical):', (err as Error).message);
      }
    }

    res.json(wrapOk(result, meta));
  }),
);

// ── /router/crear ────────────────────────────────────────────────────
router.post(
  '/router/crear',
  authAiApiKey,
  requireAiApiScope('write'),
  withAudit(async (req, res) => {
    const ctx = requireCtx(req);
    const body = parseBody(crearBody, req.body);

    const op = findOperation(body.modulo, body.operacion);
    if (!op) {
      throw new AppError(
        404,
        `Operacion no encontrada: ${body.modulo}/${body.operacion}. ` +
        `Consulta la lista de operaciones disponibles con getOperaciones.`,
      );
    }
    if (op.scope !== 'write') {
      throw new AppError(
        400,
        `La operacion ${body.modulo}/${body.operacion} es de lectura. ` +
        `Usa "consultar" en vez de "crear".`,
      );
    }

    if (req.aiContext) {
      req.aiContext.modulo = body.modulo;
      req.aiContext.operacion = body.operacion;
    }

    const parsed = op.inputSchema.safeParse(body.datos);
    if (!parsed.success) {
      throw toDidacticError(parsed.error, body.modulo, body.operacion, body.datos);
    }

    const result = await op.handler(ctx, parsed.data);
    res.status(201).json(wrapOk(result, { created: true }));
  }),
);

// ── /router/modificar ───────────────────────────────────────────────
router.post(
  '/router/modificar',
  authAiApiKey,
  requireAiApiScope('write'),
  withAudit(async (req, res) => {
    const ctx = requireCtx(req);
    const body = parseBody(modificarBody, req.body);

    const op = findOperation(body.modulo, body.operacion);
    if (!op) {
      throw new AppError(
        404,
        `Operacion no encontrada: ${body.modulo}/${body.operacion}. ` +
        `Consulta la lista de operaciones disponibles con getOperaciones.`,
      );
    }
    if (op.scope !== 'write') {
      throw new AppError(
        400,
        `La operacion ${body.modulo}/${body.operacion} es de lectura. ` +
        `Usa "consultar" en vez de "modificar".`,
      );
    }

    if (req.aiContext) {
      req.aiContext.modulo = body.modulo;
      req.aiContext.operacion = body.operacion;
    }

    const id = parsePathId(body.id, body.modulo);
    const parsed = op.inputSchema.safeParse({ ...body.datos, id });
    if (!parsed.success) {
      throw toDidacticError(parsed.error, body.modulo, body.operacion, body.datos);
    }

    const result = await op.handler(ctx, parsed.data);
    res.json(wrapOk(result, { updated: true }));
  }),
);

// ── /router/eliminar ────────────────────────────────────────────────
router.post(
  '/router/eliminar',
  authAiApiKey,
  requireAiApiScope('write'),
  withAudit(async (req, res) => {
    const ctx = requireCtx(req);
    const body = parseBody(eliminarBody, req.body);

    const op = findOperation(body.modulo, body.operacion);
    if (!op) {
      throw new AppError(
        404,
        `Operacion no encontrada: ${body.modulo}/${body.operacion}. ` +
        `Consulta la lista de operaciones disponibles con getOperaciones.`,
      );
    }
    if (op.scope !== 'write') {
      throw new AppError(
        400,
        `La operacion ${body.modulo}/${body.operacion} es de lectura. ` +
        `No se puede eliminar.`,
      );
    }
    // /router/eliminar SOLO acepta operaciones cuyo nombre es "eliminar"
    // (soft o hard delete real). Operaciones como "cancelar", "rechazar",
    // "finalizar", "resolver" NO van por aca — esas son cambios de
    // estado, van por /router/modificar. Esto evita que un LLM rompa
    // operaciones que esperan campos extra (ej: cancelar pide "motivo").
    if (body.operacion !== 'eliminar') {
      throw new AppError(
        400,
        `La operacion ${body.modulo}/${body.operacion} no es un borrado real. ` +
        `Usa /router/modificar para cambiar el estado (ej: para cancelar, ` +
        `usa modificar(mantenimientos, cancelar, id, datos: {motivo: "..."})).`,
      );
    }

    if (req.aiContext) {
      req.aiContext.modulo = body.modulo;
      req.aiContext.operacion = body.operacion;
    }

    const id = parsePathId(body.id, body.modulo);
    const result = await op.handler(ctx, { id, confirmar: true });
    res.json(wrapOk(result, { deleted: true }));
  }),
);

// ── /router/operaciones (lista la whitelist) ────────────────────────
/**
 * El LLM puede llamar este endpoint para refrescar la lista de
 * operaciones disponibles (en caso de que el modelo no se acuerde).
 * Devuelve un array compacto con (modulo, operacion, scope, summary).
 */
router.get(
  '/router/operaciones',
  authAiApiKey,
  withAudit(async (_req, res) => {
    const list = registry.map((op) => ({
      modulo: op.modulo,
      operacion: op.operacion,
      scope: op.scope,
      summary: op.summary,
    }));
    res.json(wrapOk({
      total: list.length,
      operaciones: list,
    }, { total: list.length }));
  }),
);

export default router;
