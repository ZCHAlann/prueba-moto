// lib/ai/tools/acciones.ts
//
// MÓDULO ACCIONES — Tools de escritura del Asistente IA (Jarvis).
// jul 2026 v8.5.
//
// Estas tools permiten al LLM agendar mantenimientos, crear alertas,
// cambiar estados, etc. SIN que el LLM toque la DB directamente —
// las tools hacen fetch al endpoint HTTP del backend (que es donde
// están las validaciones, la auth, y los triggers de eventos).
//
// IMPORTANTE — REGLAS:
//   - Empresa SIEMPRE del ToolContext (nunca del LLM).
//   - El LLM solo aporta los argumentos de la acción.
//   - Toda acción de escritura requiere que el LLM le pida
//     CONFIRMACIÓN al usuario antes de llamarla (el orquestador
//     filtra por un flag `confirm: true` que el LLM setea).
//   - Por ahora NO implementamos el flag de confirmación (sería v3),
//     pero dejamos la API lista para que las tools sean idempotentes.
//
// RESOLUCIÓN DE IDs:
//   - El LLM a veces pasa la PLACA en vez del ID (ej: "ABM-4662" en vez
//     de 42). Para estos casos, cada tool resuelve la placa contra
//     `company_assets.plate` y usa el ID real. Si no se encuentra,
//     devuelve error claro al LLM para que pida más info.

import { z } from 'zod';
import { eq, and, ilike } from 'drizzle-orm';
import { db } from '../../../db/client';
import { companyAssets } from '../../../db/schema/operational';
import type { ToolDefinition, ToolResult } from './registry';
import { tolerantString, tolerantNumber, tolerantDateString } from '../schema-helpers';

// ─── Helper: fetch autenticado al backend ────────────────────────────

export interface ActionToolContext {
  empresaId: number;
  userId: number;
  rol: 'admin_empresa' | 'owner_empresa';
  cookieHeader: string;
  baseUrl: string;
}

async function postToBackend(
  ctx: ActionToolContext,
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: unknown; error?: string }> {
  // jul 2026 — loggear el body que mandamos para debug. El LLM a veces
  // manda campos mal formados (ej. tipos de Zod que el backend no acepta)
  // y necesitamos ver qué le llegó al backend.
  // eslint-disable-next-line no-console
  console.log(`[jarvis:tool:post] → ${path}`, JSON.stringify(body, null, 2).slice(0, 1000));
  try {
    const res = await fetch(`${ctx.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: ctx.cookieHeader,
      },
      body: JSON.stringify(body),
    });
    let data: any = null;
    let rawBody = '';
    try {
      rawBody = await res.text();
      data = rawBody ? JSON.parse(rawBody) : null;
    } catch (parseErr) {
      // eslint-disable-next-line no-console
      console.warn(`[jarvis:tool:post] ← ${path} no-JSON response (status=${res.status}):`, rawBody.slice(0, 500));
      data = { __raw: rawBody.slice(0, 500) };
    }
    // Log SIEMPRE del resultado, sea OK o error. Es clave para debug.
    // eslint-disable-next-line no-console
    console.log(
      `[jarvis:tool:post] ← ${path} status=${res.status} ok=${res.ok} data=${JSON.stringify(data).slice(0, 800)}`,
    );
    if (!res.ok) {
      // El backend puede devolver el error en distintos campos.
      // Guardamos el body crudo para que el LLM (y el user) sepa qué pasó.
      const errMsg =
        data?.error ??
        data?.message ??
        (Array.isArray(data?.errors) ? data.errors.map((e: any) => e?.message ?? JSON.stringify(e)).join('; ') : null) ??
        (typeof data === 'string' ? data : null) ??
        `HTTP ${res.status}`;
      return { ok: false, status: res.status, data, error: errMsg };
    }
    return { ok: true, status: res.status, data };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`[jarvis:tool:post] ✗ ${path} network error:`, e);
    return { ok: false, status: 0, data: null, error: e instanceof Error ? e.message : 'Error de red' };
  }
}

// ─── Helper: resolver assetId a partir de número o placa ─────────────
//
// El LLM a veces pasa "ABM-4662" (placa) en vez de 42 (id numérico).
// Esta función normaliza: si recibe un número, lo usa; si recibe un
// string que parece placa, lo busca en la DB. Devuelve el ID numérico
// listo para el backend, o un error claro.

type AssetIdInput = number | string | undefined | null;

async function resolveAssetId(
  input: AssetIdInput,
  ctx: ActionToolContext,
): Promise<{ ok: true; id: number; plate: string } | { ok: false; error: string }> {
  if (ctx.cookieHeader == null) {
    return { ok: false, error: 'No hay cookie de sesión (herramientas de acción deshabilitadas en este chat).' };
  }
  if (input == null) {
    return { ok: false, error: 'Falta assetId o placa del vehículo.' };
  }

  // Caso 1: ya es un número.
  if (typeof input === 'number' && Number.isFinite(input) && input > 0) {
    const [row] = await db
      .select({ id: companyAssets.id, plate: companyAssets.plate })
      .from(companyAssets)
      .where(and(eq(companyAssets.id, input), eq(companyAssets.companyId, ctx.empresaId)))
      .limit(1);
    if (!row) return { ok: false, error: `No existe el vehículo con id ${input}.` };
    return { ok: true, id: row.id, plate: row.plate };
  }

  // Caso 2: string numérico puro (ej: "42" o "asset-42").
  if (typeof input === 'string') {
    const stripped = input.replace(/^(asset|company-asset|company-asset-)/i, '').trim();
    if (/^\d+$/.test(stripped)) {
      return resolveAssetId(Number(stripped), ctx);
    }
  }

  // Caso 3: string con formato de placa (ej: "ABM-4662", "ABC 123", "PBC-1234").
  if (typeof input === 'string') {
    const plate = input.trim().toUpperCase();
    const [row] = await db
      .select({ id: companyAssets.id, plate: companyAssets.plate })
      .from(companyAssets)
      .where(and(
        eq(companyAssets.companyId, ctx.empresaId),
        ilike(companyAssets.plate, plate),
      ))
      .limit(1);
    if (!row) {
      return { ok: false, error: `No encontré un vehículo con la placa "${plate}" en esta empresa.` };
    }
    return { ok: true, id: row.id, plate: row.plate };
  }

  return { ok: false, error: `assetId inválido: ${JSON.stringify(input)}` };
}

// Schema flexible: el LLM puede mandar número O string.
const flexibleAssetId = z.union([z.number().int().positive(), z.string().min(1)]).optional();

// ──────────────────────────────────────────────────────────────────────
// 1. scheduleMaintenance — agendar mantenimiento para un vehículo
// ──────────────────────────────────────────────────────────────────────

const argsScheduleMaintenance = z.object({
  assetId:        flexibleAssetId,
  plate:          tolerantString().optional(), // alternativa a assetId
  title:          tolerantString({ minLength: 3, maxLength: 200 }),
  type:           z.enum(['Preventivo', 'Correctivo', 'Programado', 'Lavada']).default('Programado'),
  category:       tolerantString().default('Otro'),
  scheduledFor:   tolerantDateString(),
  description:    tolerantString().optional(),
  odometerKm:     tolerantNumber().int().nonnegative().optional(),
  assignedUserId: tolerantString().optional(),
});

export const scheduleMaintenanceTool: ToolDefinition<z.infer<typeof argsScheduleMaintenance>> = {
  name:        'scheduleMaintenance',
  description:
    'Agenda un mantenimiento para un vehículo. Parámetros: assetId O plate (uno de los dos es requerido, plate es la del vehículo como ABM-4662), title (3-200 chars), type (Preventivo/Correctivo/Programado/Lavada, default Programado), scheduledFor (YYYY-MM-DD), category, description, odometerKm, assignedUserId. Devuelve el ID del mantenimiento creado.',
  category:    'mantenimiento-escritura',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  schema:      argsScheduleMaintenance,
  cacheable:   false,
  async execute(args, ctx): Promise<ToolResult> {
    const actx = ctx as unknown as ActionToolContext;
    // jul 2026 — LOG INICIAL: ver qué args está mandando el LLM.
    // eslint-disable-next-line no-console
    console.log(`[jarvis:tool:scheduleMaintenance] START args=${JSON.stringify(args)}`);
    if (!actx.cookieHeader) {
      return { data: [], total: 0, note: 'Error: tools de acción necesitan cookie de sesión. Reinicia el chat.' };
    }
    const resolved = await resolveAssetId(args.assetId ?? args.plate, actx);
    // eslint-disable-next-line no-console
    console.log(`[jarvis:tool:scheduleMaintenance] resolveAssetId → ${JSON.stringify(resolved)}`);
    if (!resolved.ok) {
      return { data: [], total: 0, note: resolved.error };
    }
    const res = await postToBackend(actx, `/company/${actx.empresaId}/maintenances`, {
      assetId:      `asset-${resolved.id}`, // formato que espera el backend.
      title:        args.title,
      type:         args.type,
      category:     args.category,
      status:       'Programado',
      scheduledFor: args.scheduledFor,
      description:  args.description,
      odometerKm:   args.odometerKm,
      assignedUserId: args.assignedUserId,
    });
    if (!res.ok) {
      return { data: [], total: 0, note: `Error agendando mantenimiento (HTTP ${res.status}): ${res.error}` };
    }
    const m: any = res.data;
    return {
      data: [m],
      total: 1,
      note: `Mantenimiento #${m?.id ?? '?'} agendado para ${args.scheduledFor} en vehículo ${resolved.plate}.`,
    };
  },
};

// ──────────────────────────────────────────────────────────────────────
// 2. createAlert — crear una alerta
// ──────────────────────────────────────────────────────────────────────

// jul 2026 — Mapeo al schema real del endpoint `POST /company/:id/alerts`:
//   - severity: el endpoint acepta ['Alta', 'Media', 'Baja'] (Title case).
//     Antes la tool mandaba lowercase ('baja'/'media'/'alta'/'critica') y
//     el backend tiraba 400.
//   - type (no 'category'): el endpoint espera un enum ALERT_TYPES
//     ('Vencimiento'/'Mantenimiento'/'Documento'/'Manual').
//   - notes (no 'description'): el endpoint guarda el campo 'notes'.
//   - driverId: el endpoint NO acepta. Se quita.
const argsCreateAlert = z.object({
  title:       tolerantString({ minLength: 3, maxLength: 200 }),
  notes:       tolerantString().optional(),
  severity:    z.enum(['Alta', 'Media', 'Baja']).default('Media'),
  type:        z.enum(['Vencimiento', 'Mantenimiento', 'Documento', 'Manual']).default('Manual'),
  assetId:     flexibleAssetId,
  plate:       tolerantString().optional(),
});

export const createAlertTool: ToolDefinition<z.infer<typeof argsCreateAlert>> = {
  name:        'createAlert',
  description:
    'Crea una alerta operativa. Parámetros: title (requerido, 3-200 chars), notes (opcional), severity (Alta/Media/Baja, default Media), type (Vencimiento/Mantenimiento/Documento/Manual, default Manual), assetId o plate (opcional, linkea la alerta a un vehículo). Devuelve el ID de la alerta creada.',
  category:    'alertas-escritura',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  schema:      argsCreateAlert,
  cacheable:   false,
  async execute(args, ctx): Promise<ToolResult> {
    const actx = ctx as unknown as ActionToolContext;
    if (!actx.cookieHeader) {
      return { data: [], total: 0, note: 'Error: tools de acción necesitan cookie de sesión.' };
    }
    let resolvedAsset: { id: number; plate: string } | null = null;
    if (args.assetId ?? args.plate) {
      const r = await resolveAssetId(args.assetId ?? args.plate, actx);
      if (!r.ok) {
        return { data: [], total: 0, note: r.error };
      }
      resolvedAsset = { id: r.id, plate: r.plate };
    }
    const res = await postToBackend(actx, `/company/${actx.empresaId}/alerts`, {
      title:    args.title,
      notes:    args.notes,
      severity: args.severity,
      type:     args.type,
      assetId:  resolvedAsset ? `asset-${resolvedAsset.id}` : undefined,
    });
    if (!res.ok) {
      return { data: [], total: 0, note: `Error creando alerta: ${res.error}` };
    }
    const a: any = res.data;
    return {
      data: [a],
      total: 1,
      note: `Alerta #${a?.id ?? '?'} creada (severidad ${args.severity}, tipo ${args.type})${resolvedAsset ? ' para vehículo ' + resolvedAsset.plate : ''}.`,
    };
  },
};

// ──────────────────────────────────────────────────────────────────────
// 3. changeVehicleStatus — cambiar estado de un vehículo
// ──────────────────────────────────────────────────────────────────────

const argsChangeVehicleStatus = z.object({
  assetId:   flexibleAssetId,
  plate:     tolerantString().optional(),
  newStatus: z.enum(['Operativo', 'En mantenimiento', 'Fuera de servicio']),
  reason:    tolerantString().optional(),
});

export const changeVehicleStatusTool: ToolDefinition<z.infer<typeof argsChangeVehicleStatus>> = {
  name:        'changeVehicleStatus',
  description:
    'Cambia el estado de un vehículo. Parámetros: assetId O plate (uno de los dos), newStatus (Operativo/En mantenimiento/Fuera de servicio), reason (opcional). Genera un evento de auditoría.',
  category:    'vehiculos-escritura',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  schema:      argsChangeVehicleStatus,
  cacheable:   false,
  async execute(args, ctx): Promise<ToolResult> {
    const actx = ctx as unknown as ActionToolContext;
    if (!actx.cookieHeader) {
      return { data: [], total: 0, note: 'Error: tools de acción necesitan cookie de sesión.' };
    }
    const resolved = await resolveAssetId(args.assetId ?? args.plate, actx);
    if (!resolved.ok) {
      return { data: [], total: 0, note: resolved.error };
    }
    const res = await postToBackend(actx, `/company/${actx.empresaId}/assets/${resolved.id}/status`, {
      status: args.newStatus,
      reason: args.reason,
    });
    if (!res.ok) {
      return { data: [], total: 0, note: `Error cambiando estado: ${res.error}` };
    }
    return {
      data: [res.data],
      total: 1,
      note: `Vehículo ${resolved.plate} ahora está ${args.newStatus}.`,
    };
  },
};

// ──────────────────────────────────────────────────────────────────────
// 4. addVehicleNote — agregar nota libre a un vehículo
// ──────────────────────────────────────────────────────────────────────

const argsAddVehicleNote = z.object({
  assetId: flexibleAssetId,
  plate:   tolerantString().optional(),
  text:    tolerantString({ minLength: 1, maxLength: 2000 }),
});

export const addVehicleNoteTool: ToolDefinition<z.infer<typeof argsAddVehicleNote>> = {
  name:        'addVehicleNote',
  description: 'Agrega una nota libre a un vehículo. assetId o plate (uno), y text (requerido).',
  category:    'vehiculos-escritura',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  schema:      argsAddVehicleNote,
  cacheable:   false,
  async execute(args, ctx): Promise<ToolResult> {
    const actx = ctx as unknown as ActionToolContext;
    if (!actx.cookieHeader) {
      return { data: [], total: 0, note: 'Error: tools de acción necesitan cookie de sesión.' };
    }
    const resolved = await resolveAssetId(args.assetId ?? args.plate, actx);
    if (!resolved.ok) {
      return { data: [], total: 0, note: resolved.error };
    }
    const res = await postToBackend(actx, `/company/${actx.empresaId}/vehicles/${resolved.id}/notes`, {
      text: args.text,
    });
    if (!res.ok) {
      return { data: [], total: 0, note: `Error agregando nota: ${res.error}` };
    }
    return {
      data: [res.data],
      total: 1,
      note: `Nota agregada al vehículo ${resolved.plate}.`,
    };
  },
};

// ──────────────────────────────────────────────────────────────────────
// 5. registerFuelEntry — registrar carga de combustible
// ──────────────────────────────────────────────────────────────────────

const argsRegisterFuelEntry = z.object({
  assetId:  flexibleAssetId,
  plate:    tolerantString().optional(),
  date:     tolerantDateString(),
  liters:   tolerantNumber().positive(),
  cost:     tolerantNumber().nonnegative(),
  odometer: tolerantNumber().int().nonnegative(),
  station:  tolerantString().optional(),
  fuelType: z.enum(['Diesel', 'Gasolina', 'Electrico', 'Hibrido']).default('Diesel'),
  driverId: tolerantNumber().int().positive().optional(),
});

export const registerFuelEntryTool: ToolDefinition<z.infer<typeof argsRegisterFuelEntry>> = {
  name:        'registerFuelEntry',
  description:
    'Registra una carga de combustible. assetId o plate (uno), date, liters, cost, odometer son requeridos. station, fuelType, driverId son opcionales.',
  category:    'combustible-escritura',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  schema:      argsRegisterFuelEntry,
  cacheable:   false,
  async execute(args, ctx): Promise<ToolResult> {
    const actx = ctx as unknown as ActionToolContext;
    if (!actx.cookieHeader) {
      return { data: [], total: 0, note: 'Error: tools de acción necesitan cookie de sesión.' };
    }
    const resolved = await resolveAssetId(args.assetId ?? args.plate, actx);
    if (!resolved.ok) {
      return { data: [], total: 0, note: resolved.error };
    }
    const res = await postToBackend(actx, `/company/${actx.empresaId}/fuel`, {
      assetId:  `asset-${resolved.id}`,
      date:     args.date,
      // jul 2026 — El endpoint espera GALONES (no litros). Convertimos.
      // 1 galón US = 3.78541 litros. Sin la conversión, el backend tira 400
      // con "expected number, received undefined" sobre `gallons`.
      gallons:  Math.round((args.liters / 3.78541) * 10000) / 10000,
      cost:     args.cost,
      odometer: args.odometer,
      station:  args.station,
      fuelType: args.fuelType,
      driverId: args.driverId ? `driver-${args.driverId}` : undefined,
    });
    if (!res.ok) {
      return { data: [], total: 0, note: `Error registrando combustible: ${res.error}` };
    }
    return {
      data: [res.data],
      total: 1,
      note: `Carga de ${args.liters}L por $${args.cost} registrada para vehículo ${resolved.plate}.`,
    };
  },
};

// ──────────────────────────────────────────────────────────────────────
// 6. flagVehicleForMaintenance — marcar vehículo para revisión
// ──────────────────────────────────────────────────────────────────────

// jul 2026 — Mapeo al schema del endpoint `POST /alerts`:
//   - 'reason' se mapea al campo 'notes' (que el endpoint SÍ acepta).
//   - 'severity' en Title case ('Media' en vez de 'media').
//   - 'type' en vez de 'category' (no existe en el endpoint).
const argsFlagVehicleForMaintenance = z.object({
  assetId: flexibleAssetId,
  plate:   tolerantString().optional(),
  reason:  tolerantString({ minLength: 3, maxLength: 500 }),
});

export const flagVehicleForMaintenanceTool: ToolDefinition<z.infer<typeof argsFlagVehicleForMaintenance>> = {
  name:        'flagVehicleForMaintenance',
  description:
    'Marca un vehículo para revisión. Crea una alerta de severidad Media con tipo Mantenimiento y un link al vehículo. Útil para recordatorios automáticos.',
  category:    'vehiculos-escritura',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  schema:      argsFlagVehicleForMaintenance,
  cacheable:   false,
  async execute(args, ctx): Promise<ToolResult> {
    const actx = ctx as unknown as ActionToolContext;
    if (!actx.cookieHeader) {
      return { data: [], total: 0, note: 'Error: tools de acción necesitan cookie de sesión.' };
    }
    const resolved = await resolveAssetId(args.assetId ?? args.plate, actx);
    if (!resolved.ok) {
      return { data: [], total: 0, note: resolved.error };
    }
    const res = await postToBackend(actx, `/company/${actx.empresaId}/alerts`, {
      title:    `Vehículo ${resolved.plate} marcado para revisión`,
      notes:    args.reason,
      severity: 'Media',
      type:     'Mantenimiento',
      assetId:  `asset-${resolved.id}`,
    });
    if (!res.ok) {
      return { data: [], total: 0, note: `Error marcando vehículo: ${res.error}` };
    }
    return {
      data: [res.data],
      total: 1,
      note: `Vehículo ${resolved.plate} marcado para revisión.`,
    };
  },
};

// ──────────────────────────────────────────────────────────────────────
// Catálogo de tools de ACCIÓN (exportadas)
// ──────────────────────────────────────────────────────────────────────

export const ACCIONES_TOOLS: ToolDefinition[] = [
  scheduleMaintenanceTool,
  createAlertTool,
  changeVehicleStatusTool,
  addVehicleNoteTool,
  registerFuelEntryTool,
  flagVehicleForMaintenanceTool,
];
