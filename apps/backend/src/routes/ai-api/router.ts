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

    // Validar filtros (si los hay) contra el schema de la operación.
    // El input final es: { ...filtros, ... } — el handler sabe qué
    // esperar de cada operación.
    const input = { ...(body.filtros ?? {}) };
    const parsed = op.inputSchema.safeParse(input);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join('.') || 'filtros'}: ${i.message}`)
        .join('; ');
      throw new AppError(400, `Input inválido para ${body.modulo}/${body.operacion}: ${issues}`);
    }

    const result = await op.handler(ctx, parsed.data);
    res.json(result);
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

    const parsed = op.inputSchema.safeParse(body.datos);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join('.') || 'datos'}: ${i.message}`)
        .join('; ');
      throw new AppError(400, `Datos inválidos para ${body.modulo}/${body.operacion}: ${issues}`);
    }

    const result = await op.handler(ctx, parsed.data);
    res.status(201).json(result);
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

    const id = parsePathId(body.id, body.modulo);
    const parsed = op.inputSchema.safeParse({ ...body.datos, id });
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join('.') || 'datos'}: ${i.message}`)
        .join('; ');
      throw new AppError(400, `Datos inválidos para ${body.modulo}/${body.operacion}: ${issues}`);
    }

    const result = await op.handler(ctx, parsed.data);
    res.json(result);
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

    const id = parsePathId(body.id, body.modulo);
    const result = await op.handler(ctx, { id, confirmar: true });
    res.json(result);
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
    res.json({
      total: list.length,
      operaciones: list,
    });
  }),
);

export default router;
