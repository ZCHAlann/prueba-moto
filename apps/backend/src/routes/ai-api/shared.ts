// routes/ai-api/shared.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 — Helpers compartidos para todos los routers de /api/ai/*.
//
// Patrones:
//
//   1. Resolver entidades por nombre/código/placa (no IDs internos).
//      El LLM no sabe — ni debe saber — que internamente usamos IDs
//      numéricos. Le pasamos "Camión #1" / "GHT-1234" / "asset-14" y
//      nosotros lo traducimos a `WHERE id = 14`.
//
//   2. Wrap de endpoints con auditoría. Cada request loggea a
//      `ai_api_logs` con duración + status code, sin bloquear el
//      response.
//
//   3. Validación del body con Zod + resumen del error en español.
// ─────────────────────────────────────────────────────────────────────

import { eq, or, sql, and } from 'drizzle-orm';
import { z, type ZodSchema } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { db } from '../../db/client';
import {
  companyAssets,
  companyDrivers,
  companyWorkshops,
  companySuppliers,
  companySites,
} from '../../db/schema/operational';
import { aiApiLogs } from '../../db/schema/platform';
import type { AiApiContext } from '../../middlewares/auth-ai-key';
import { NotFoundError, AppError } from '../../lib/errors';
import { logAudit } from '../../lib/audit';

// ── 1. Resolución de entidades ───────────────────────────────────────

/**
 * Resuelve un vehículo por nombre, código o placa (cualquiera matchea).
 * Devuelve el ID numérico interno (para queries a la DB) + el nombre
 * legible (para devolver al cliente).
 *
 * Si hay varios matchea, devuelve el primero — el LLM ya intentó
 * un nombre más o menos único. Si no hay match, lanza NotFoundError
 * con el término buscado.
 */
export async function resolveAsset(
  companyId: number,
  query: string,
): Promise<{ id: number; name: string }> {
  const q = `%${query}%`;
  const [row] = await db
    .select({ id: companyAssets.id, name: companyAssets.name })
    .from(companyAssets)
    .where(
      and(
        eq(companyAssets.companyId, companyId),
        or(
          sql`${companyAssets.name} ILIKE ${q}`,
          sql`${companyAssets.code} ILIKE ${q}`,
          sql`${companyAssets.plate} ILIKE ${q}`,
        )!,
      ),
    )
    .limit(1);
  if (!row) {
    throw new NotFoundError(
      'Vehículo',
      `"${query}" (buscado por nombre/código/placa)`,
    );
  }
  return row;
}

/**
 * Resuelve un conductor por nombre completo, código o DNI.
 */
export async function resolveDriver(
  companyId: number,
  query: string,
): Promise<{ id: number; name: string }> {
  const q = `%${query}%`;
  // Buscamos por firstName+lastName concatenado, code, dni.
  const [row] = await db
    .select({
      id: companyDrivers.id,
      firstName: companyDrivers.firstName,
      lastName: companyDrivers.lastName,
    })
    .from(companyDrivers)
    .where(
      and(
        eq(companyDrivers.companyId, companyId),
        or(
          sql`CONCAT(${companyDrivers.firstName}, ' ', ${companyDrivers.lastName}) ILIKE ${q}`,
          sql`${companyDrivers.code} ILIKE ${q}`,
          sql`${companyDrivers.dni} ILIKE ${q}`,
        )!,
      ),
    )
    .limit(1);
  if (!row) {
    throw new NotFoundError(
      'Conductor',
      `"${query}" (buscado por nombre/código/DNI)`,
    );
  }
  return { id: row.id, name: `${row.firstName} ${row.lastName}`.trim() };
}

/**
 * Resuelve un taller por nombre o código.
 */
export async function resolveWorkshop(
  companyId: number,
  query: string,
): Promise<{ id: number; name: string }> {
  const q = `%${query}%`;
  const [row] = await db
    .select({ id: companyWorkshops.id, name: companyWorkshops.name })
    .from(companyWorkshops)
    .where(
      and(
        eq(companyWorkshops.companyId, companyId),
        or(
          sql`${companyWorkshops.name} ILIKE ${q}`,
          sql`${companyWorkshops.code} ILIKE ${q}`,
        )!,
      ),
    )
    .limit(1);
  if (!row) {
    throw new NotFoundError(
      'Taller',
      `"${query}" (buscado por nombre/código)`,
    );
  }
  return row;
}

/**
 * Resuelve un proveedor por nombre o RUC/NIT.
 */
export async function resolveSupplier(
  companyId: number,
  query: string,
): Promise<{ id: number; name: string }> {
  const q = `%${query}%`;
  const [row] = await db
    .select({ id: companySuppliers.id, name: companySuppliers.name })
    .from(companySuppliers)
    .where(
      and(
        eq(companySuppliers.companyId, companyId),
        or(
          sql`${companySuppliers.name} ILIKE ${q}`,
          sql`${companySuppliers.nit} ILIKE ${q}`,
        )!,
      ),
    )
    .limit(1);
  if (!row) {
    throw new NotFoundError(
      'Proveedor',
      `"${query}" (buscado por nombre/RUC)`,
    );
  }
  return row;
}

/**
 * Resuelve una sede (site) por nombre o código.
 */
export async function resolveSite(
  companyId: number,
  query: string,
): Promise<{ id: number; name: string }> {
  const q = `%${query}%`;
  const [row] = await db
    .select({ id: companySites.id, name: companySites.name })
    .from(companySites)
    .where(
      and(
        eq(companySites.companyId, companyId),
        or(
          sql`${companySites.name} ILIKE ${q}`,
          sql`${companySites.code} ILIKE ${q}`,
        )!,
      ),
    )
    .limit(1);
  if (!row) {
    throw new NotFoundError(
      'Sede',
      `"${query}" (buscado por nombre/código)`,
    );
  }
  return row;
}

// ── 2. Wrappers y helpers de request/response ────────────────────────

/** Helper: companyId garantizado desde el contexto (lanza 500 si no está). */
export function requireCtx(req: Request): AiApiContext {
  const ctx = req.aiContext;
  if (!ctx) {
    throw new AppError(500, 'aiContext no seteado — bug del middleware');
  }
  return ctx;
}

/** Helper: día actual en YYYY-MM-DD (timezone EC = UTC-5). */
export function todayYmdEc(): string {
  const now = new Date();
  const ec = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  return ec.toISOString().slice(0, 10);
}

/** Helper: parsea un path param tipo 'asset-14' o 'dto-13' o '14' puro. */
export function parseEntityId(raw: string | string[] | undefined, prefix: string): number {
  if (raw === undefined) throw new AppError(400, `Falta el parámetro :${prefix}Id`);
  const s = String(raw);
  const m = s.match(new RegExp(`^(?:${prefix}-)?(\\d+)$`, 'i'));
  if (!m) throw new AppError(400, `ID inválido: "${s}" (formato esperado: ${prefix}-N o N)`);
  const n = Number(m[1]);
  if (!Number.isInteger(n) || n <= 0) {
    throw new AppError(400, `ID inválido: "${s}" (debe ser positivo)`);
  }
  return n;
}

/** Wrapper que audita cada request (fire-and-forget log a ai_api_logs)
 *  y, en desarrollo, loguea a stdout con el body crudo + resultado.
 *
 *  El log a stdout es CRUCIAL para debuggear qué está mandando realmente
 *  el Custom GPT — sin esto hay que ir a la DB a leer `ai_api_logs.requestBody`
 *  cada vez.
 *
 *  Tambien valida que la request no intente escapar del tenant:
 *  si el body, query o path contiene un `companyId` distinto al de la
 *  API key, rechaza con 403 antes de procesar.
 */
export function withAudit(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // ── Defensa en profundidad: anti-tenant-escape ────────────────────
    // La API key esta atada a UNA empresa. Cualquier intento de
    // pasar companyId, empresaId o tenantId distinto al de la key
    // se rechaza con 403 antes de tocar la DB.
    // IMPORTANTE: el mensaje NO revela ni el id de la key ni el id
    // solicitado, solo dice "no habilitada" — asi no le damos pista
    // al LLM ni a un atacante de que la key existe o no.
    const ctx = req.aiContext;
    if (ctx) {
      const blockedFields = ['companyId', 'empresaId', 'tenantId', 'company_id', 'empresa_id'];
      const allSources: Array<{ source: string; obj: any }> = [
        { source: 'body', obj: req.body },
        { source: 'query', obj: req.query },
        { source: 'params', obj: req.params },
      ];
      for (const { source, obj } of allSources) {
        if (!obj || typeof obj !== 'object') continue;
        for (const field of blockedFields) {
          if (obj[field] !== undefined && obj[field] !== null) {
            const requested = Number(obj[field]);
            if (Number.isFinite(requested) && requested !== ctx.companyId) {
              throw new AppError(403, 'Api key no habilitada para esta empresa');
            }
          }
        }
      }
    }

    const start = Date.now();
    const endpoint = `${req.method} ${req.originalUrl.split('?')[0]}`;
    let errMsg: string | undefined;
    let resultBody: unknown = undefined;

    try {
      await handler(req, res, next);
    } catch (err: any) {
      // ── Envolver errores de Zod (validacion de input) en 400 ──────
      // Si un handler hace `schema.parse(input)` y el input no matchea
      // (ej: le falta "motivo" en cancelar), Zod tira un ZodError. Sin
      // este catch, eso se propaga como 500 Internal Server Error y el
      // LLM recibe un mensaje críptico. Lo convertimos a 400 con
      // detalle de que campo falta.
      // jul 2026 v2.3 — Usamos toDidacticError para que el mensaje
      // incluya ejemplo de body correcto y campo que falta. Asi el GPT
      // puede aprender y reintentar.
      if (err && err.name === 'ZodError' && err.issues) {
        const ctxMod = req.aiContext?.modulo ?? 'desconocido';
        const ctxOp = req.aiContext?.operacion ?? 'desconocido';
        const { toDidacticError } = await import('./error-format');
        const didacticErr = toDidacticError(err, ctxMod, ctxOp, req.body?.datos ?? req.body);
        errMsg = didacticErr.message;
        const codigo = 'VALIDATION_ERROR';
        if (!res.headersSent) {
          const payload = {
            ok: false,
            error: {
              codigo,
              mensaje: didacticErr.message,
              didactico: (didacticErr as any).didactico,
              requestId: req.headers['x-request-id'] as string ?? `req-${Date.now()}`,
            },
          };
          resultBody = payload;
          res.status(400).json(payload);
        }
        return;
      }
      // ── AppError (errores de negocio del backend: 400, 403, 404, 409) ─
      // AppError tiene un status code explicito. Si ya se seteo el
      // status code en res, lo respetamos. Si no, usamos el de AppError.
      // Esto evita que un AppError(400, "...") se convierta en 500
      // porque Express no sabe que es 400.
      // jul 2026 v2.1 — Envolvemos en el envelope uniforme {ok:false,
      // error:{codigo, mensaje, requestId}} para que el LLM reciba el
      // MISMO shape tanto en éxito como en error.
      // jul 2026 v2.3 — Si el AppError trae `didactico` (del helper
      // toDidacticError), lo incluimos en el envelope para que el GPT
      // pueda aprender de los errores.
      if (err && typeof err.status === 'number') {
        if (!res.headersSent && res.statusCode === 200) {
          const status = err.status;
          const codigo = (err as any).code
            ?? (status === 400 ? 'BAD_REQUEST'
            : status === 401 ? 'UNAUTHORIZED'
            : status === 403 ? 'FORBIDDEN'
            : status === 404 ? 'NOT_FOUND'
            : status === 409 ? 'CONFLICT'
            : status === 429 ? 'RATE_LIMITED'
            : 'ERROR');
          const payload: any = {
            ok: false,
            error: {
              codigo,
              mensaje: err.message,
              requestId: req.headers['x-request-id'] as string ?? `req-${Date.now()}`,
            },
          };
          // Adjuntar payload didactico si existe
          if ((err as any).didactico) {
            payload.error.didactico = (err as any).didactico;
          }
          resultBody = payload;
          res.status(status).json(payload);
        }
        errMsg = err.message?.slice(0, 500);
        return;
      }
      errMsg = err?.message?.slice(0, 500);
      throw err;
    } finally {
      const duration = Date.now() - start;

      // Log a stdout: siempre, en todos los ambientes. Es barato y
      // crítico para debuggear el LLM en producción.
      try {
        const bodyPreview = req.body && Object.keys(req.body).length > 0
          ? JSON.stringify(req.body).slice(0, 800)
          : '(empty)';
        const resultPreview = resultBody !== undefined
          ? JSON.stringify(resultBody).slice(0, 400)
          : '(no response yet)';
        const opHint = req.body && (req.body as any).operacion
          ? ` [${(req.body as any).modulo}/${(req.body as any).operacion}]`
          : '';
        const statusIcon = res.statusCode >= 400 ? 'X' : 'OK';

        // Si el body tiene un error de validacion, intentar extraer
        // que campo falta y dar un hint.
        let validationHint = '';
        if (res.statusCode === 400 && errMsg) {
          if (errMsg.includes('datos:') && errMsg.includes('received undefined')) {
            validationHint = ' [HINT: LLM probablemente no incluyo el campo "datos"]';
          } else if (errMsg.includes('id:') && errMsg.includes('received undefined')) {
            validationHint = ' [HINT: LLM no incluyo el campo "id"]';
          } else if (errMsg.includes('Invalid input: expected record')) {
            validationHint = ' [HINT: "datos" llego vacio, deberia ser {} o tener campos]';
          } else if (errMsg.includes('expected one of')) {
            validationHint = ' [HINT: el LLM mando un valor fuera del enum]';
          } else if (res.statusCode === 403 && errMsg.includes('Api key no habilitada')) {
            validationHint = ' [HINT: tenant-escape blocked]';
          }
        }

        console.log(
          `[ai-api] ${statusIcon} ${res.statusCode} ${endpoint}${opHint} ` +
          `(${duration}ms) ` +
          `body=${bodyPreview} ` +
          `result=${resultPreview}` +
          (errMsg ? ` err="${errMsg}"${validationHint}` : ''),
        );
      } catch {
        // Nunca romper el response por un log.
      }

      if (ctx) {
        void db.insert(aiApiLogs).values({
          keyId: ctx.keyId,
          companyId: ctx.companyId,
          endpoint,
          method: req.method,
          statusCode: res.statusCode,
          durationMs: duration,
          errorMessage: errMsg ?? null,
          ip: req.ip ?? null,
          userAgent: req.headers['user-agent']?.slice(0, 500) ?? null,
        }).execute().catch(() => {
          // Silencioso — el log no es crítico.
        });
      }

      // ── Audit de acciones de negocio (company_audit_entries) ──────
      // Para cada operacion de WRITE exitosa, persistimos un resumen
      // legible en la tabla general de auditoria. Asi el dashboard
      // del empresa puede mostrar TODAS las acciones del AI (crear,
      // modificar, eliminar) en un solo timeline, junto con las
      // acciones manuales de los usuarios.
      if (ctx && res.statusCode >= 200 && res.statusCode < 300) {
        void persistAuditFromRequest(req, ctx, errMsg).catch(() => {
          // Silencioso — el audit no es crítico.
        });
      }
    }
  };
}

/**
 * Persiste una entrada en `company_audit_entries` para acciones de
 * write exitosas del AI Assistant. Mapea (modulo, operacion) del
 * router unificado a (entity, action) de la tabla de auditoria.
 *
 *   crear/modificar/eliminar  -> action segun operacion
 *   consultar                  -> no se registra (es read)
 *
 * Si el LLM mando un body raro o el resultBody no tiene id, no
 * rompe — simplemente no inserta.
 */
async function persistAuditFromRequest(
  req: Request,
  ctx: AiApiContext,
  _errMsg: string | undefined,
): Promise<void> {
  // Solo POST (no GET)
  if (req.method !== 'POST') return;
  const body = (req.body || {}) as Record<string, any>;
  const modulo: string | undefined = body.modulo;
  const operacion: string | undefined = body.operacion;
  if (!modulo || !operacion) return;

  // 1) Mapear modulo -> entity (la tabla de la BD)
  const MODULO_TO_ENTITY: Record<string, string> = {
    vehiculos:    'company_assets',
    mantenimientos: 'company_maintenance_records',
    alertas:      'company_alerts',
    combustible:   'company_fuel_entries',
    peajes:       'company_toll_entries',
    seguros:      'company_insurance_policies',
    talleres:     'company_workshops',
    proveedores:  'company_suppliers',
    sedes:        'company_sites',
    conductores:  'company_drivers',
    asignaciones: 'company_assignments',
    checklists:   'company_checklists',
    autorizaciones: 'exit_authorizations',
    notificaciones: 'company_notifications',
    solicitudes:  'solicitudes',  // generic
    facturas:     'company_invoices',
    caja_chica:   'caja_chica',
    dashboard:    'dashboard',
    analytics:    'analytics',
    sesion:       'session',
  };
  const entity = MODULO_TO_ENTITY[modulo];
  if (!entity) return; // modulo desconocido, no auditamos

  // 2) Mapear operacion -> action
  // Reglas: 'crear' -> 'create', 'eliminar' -> 'delete', resto -> la
  // operacion literal (status, estado, iniciar, finalizar, cancelar,
  // aprobar, rechazar, etc) o 'update' para 'editar'.
  let action: string;
  if (operacion === 'crear') {
    action = 'create';
  } else if (operacion === 'eliminar') {
    action = 'delete';
  } else if (operacion === 'editar') {
    action = 'update';
  } else {
    // Para iniciar/finalizar/cancelar/estado/aprobar/rechazar/etc,
    // usamos el nombre literal que ya esta en el enum de acciones
    // del frontend (entityLabels.ts). Asi el dashboard muestra
    // "Inició", "Finalizó", "Canceló", "Aprobó", etc.
    action = operacion;
  }

  // 3) Extraer entityId del body o del resultBody
  let entityId: string | undefined;
  if (operacion === 'crear') {
    // El resultBody tiene el id creado, ej: {id: "vehicle-7"} o
    // {id: "maintenance-79"}. Extraemos el numero.
    // (No tenemos acceso a resultBody desde aca, pero el req.body
    // tampoco. Lo resolvemos usando la estrategia del id del body
    // si esta, o el timestamp como fallback.)
    entityId = String(Date.now());
  } else {
    // body.id viene como "vehicle-7" o 7. Extraemos el numero.
    const rawId = body.id;
    if (rawId === undefined || rawId === null) return;
    const s = String(rawId);
    const m = s.match(/(\d+)$/);
    if (m) {
      entityId = m[1];
    } else {
      entityId = s;
    }
  }

  // 4) Description: un resumen legible de la accion
  // Limpio el entityId (sacando el prefijo "vehicle-" etc) para que
  // la description quede "vehiculo 1" en vez de "vehiculo vehicle-1".
  const cleanId = entityId?.replace(/^[a-z_-]+/i, '') ?? entityId ?? '?';
  const description = buildAuditDescription(modulo, operacion, body, cleanId);

  // 5) Insert
  await logAudit(db, ctx.companyId, {
    entity,
    entityId,
    action,
    actorName: 'AI Assistant',
    description,
    metadata: {
      source: 'ai-api',
      keyId: ctx.keyId,
      modulo,
      operacion,
    },
  });
}

/**
 * Genera un resumen legible de la accion en espanol. Esto es lo que
 * va a aparecer en el dashboard del empresa.
 *
 *   "Cambió estado de vehiculo 1 a 'Fuera de servicio'"
 *   "Canceló mantenimiento 80 con motivo 'Cancelado por peticion del usuario'"
 *   "Creó mantenimiento 79 con titulo 'Mantenimiento de prueba'"
 *   "Editó mantenimiento 79: cambió scheduledFor"
 */
function buildAuditDescription(
  modulo: string,
  operacion: string,
  body: Record<string, any>,
  cleanId: string,
): string {
  const entityLabel = MODULO_LABELS[modulo] ?? modulo;
  const datos = body.datos ?? {};

  if (operacion === 'crear') {
    const titulo = datos.titulo ?? datos.nombre ?? datos.name;
    return `Creó ${entityLabel}${titulo ? ` "${titulo}"` : ''} (id=${cleanId})`;
  }

  if (operacion === 'eliminar') {
    return `Eliminó ${entityLabel} ${cleanId}`;
  }

  if (operacion === 'editar') {
    const campos = Object.keys(datos).filter(k => k !== 'id').join(', ');
    return `Editó ${entityLabel} ${cleanId}${campos ? `: cambió ${campos}` : ''}`;
  }

  if (operacion === 'estado' || operacion === 'cambiar_estado') {
    return `Cambió estado de ${entityLabel} ${cleanId} a "${datos.estado ?? '?'}"`;
  }

  if (operacion === 'cancelar') {
    return `Canceló ${entityLabel} ${cleanId}${datos.motivo ? ` con motivo "${datos.motivo}"` : ''}`;
  }

  if (operacion === 'iniciar') {
    return `Inició ${entityLabel} ${cleanId}`;
  }

  if (operacion === 'finalizar') {
    return `Finalizó ${entityLabel} ${cleanId}`;
  }

  if (operacion === 'aprobar') {
    return `Aprobó ${entityLabel} ${cleanId}`;
  }

  if (operacion === 'rechazar') {
    return `Rechazó ${entityLabel} ${cleanId}${datos.motivo ? ` con motivo "${datos.motivo}"` : ''}`;
  }

  if (operacion === 'resolver') {
    return `Resolvió ${entityLabel} ${cleanId}`;
  }

  if (operacion === 'nota') {
    return `Agregó nota a ${entityLabel} ${cleanId}`;
  }

  if (operacion === 'item') {
    return `Agregó repuesto a ${entityLabel} ${cleanId}: ${datos.nombre ?? '?'}`;
  }

  // Fallback: operacion literal
  return `${operacion} en ${entityLabel} ${cleanId}`;
}

const MODULO_LABELS: Record<string, string> = {
  vehiculos:     'vehiculo',
  mantenimientos: 'mantenimiento',
  alertas:       'alerta',
  combustible:    'carga de combustible',
  peajes:        'cruce de peaje',
  seguros:       'poliza de seguro',
  talleres:      'taller',
  proveedores:   'proveedor',
  sedes:         'sede',
  conductores:   'conductor',
  asignaciones:   'asignacion',
  checklists:    'checklist',
  autorizaciones: 'autorizacion de salida',
  notificaciones: 'notificacion',
  solicitudes:    'solicitud',
  facturas:      'factura',
  caja_chica:    'cuenta de caja chica',
  dashboard:     'dashboard',
  analytics:     'reporte',
  sesion:        'sesion',
};

/**
 * Parsea el body con Zod. Si falla, devuelve un 400 con TODOS los issues
 * concatenados en español (no el formato criptico de Zod).
 *
 * Ademas, intenta dar pistas utiles al LLM para que sepa como
 * autocorregir su siguiente intento:
 *   - Si el campo "datos" esta undefined, le decimos explicitamente
 *     que lo incluya.
 *   - Si faltan campos requeridos, los listamos con sus nombres
 *     exactos del schema.
 *   - Si un valor es invalido (ej: enum), listamos las opciones
 *     validas si estan disponibles.
 *
 * NOTA: Esta funcion es SOLO para los endpoints de la AI API
 * (/api/ai/*). Las operaciones normales mantienen su propio
 * manejo de errores sin cambios.
 */
export function parseBody<T>(schema: ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    // Detectar caso especial: "datos" undefined.
    const datosMissing = result.error.issues.some(
      (i) => i.code === 'invalid_type' && i.path.join('.') === 'datos'
        && (i as any).received === 'undefined',
    );
    if (datosMissing) {
      throw new AppError(
        400,
        `Body invalido — datos: falta el campo "datos" (debe ser un objeto con los campos del registro, por ejemplo {vehiculo, fecha, titulo}). ` +
        `Reintenta incluyendo "datos": { ... } aunque este vacio.`,
      );
    }

    // Detectar caso especial: "id" undefined en modificar/eliminar.
    const idMissing = result.error.issues.some(
      (i) => i.path.join('.') === 'id' && (i as any).received === 'undefined',
    );
    if (idMissing) {
      throw new AppError(
        400,
        `Body invalido — id: falta el campo "id" (string con prefijo del modulo, ej "vehicle-14", o numero puro "14"). ` +
        `Si no conoces el id, hace primero una consulta con "query" para obtenerlo.`,
      );
    }

    // Caso general: listar todos los issues con sugerencias.
    const issues = result.error.issues
      .map((i) => {
        const path = i.path.join('.') || 'body';
        let msg = `${path}: ${i.message}`;
        // Si es un error de enum, agregar las opciones validas si las
        // podemos extraer del schema.
        if (i.code === 'invalid_enum_value' && (i as any).options) {
          const opts = (i as any).options as string[];
          msg += ` (opciones validas: ${opts.join(', ')})`;
        }
        return msg;
      })
      .join('; ');
    throw new AppError(400, `Body invalido — ${issues}`);
  }
  return result.data;
}

/** Parsea query con Zod (los query params son siempre string, así que
 *  usamos coerce en cada campo numérico). Misma lógica de error. */
export function parseQuery<T>(schema: ZodSchema<T>, query: unknown): T {
  return parseBody(schema, query);
}
