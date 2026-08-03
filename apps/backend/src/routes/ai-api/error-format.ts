// routes/ai-api/error-format.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 v2.3 — Formateador didactico de errores para que el GPT pueda
// aprender y reintentar con la estructura correcta.
//
// Filosofia: si le decimos al GPT "aprende de los errores", los errores
// tienen que ser auto-explicativos:
//   1. Decir el modulo/operacion que fallo.
//   2. Decir el campo exacto que falta o esta mal.
//   3. Decir el formato esperado.
//   4. Dar un ejemplo de body correcto (los ultimos 1-2 inputs
//      exitosos de la misma operacion, si los tenemos).
//   5. Si la operacion acepta `id`/`vehiculo`/`query`, decir cual
//      resolveria mejor.
//
// Asi el GPT puede leer el error, entender que le falto, y reintentar
// con la estructura correcta sin tener que volver a las instrucciones.
// ─────────────────────────────────────────────────────────────────────

import { ZodError, type ZodIssue, type ZodTypeAny, z } from 'zod';
import { AppError } from '../../lib/errors';

export type DidacticErrorPayload = {
  ok: false;
  error: {
    codigo: string;
    mensaje: string;
    camposFaltantes: string[];
    camposInvalidos: string[];
    formatoEsperado: string;
    ejemploBody: Record<string, unknown>;
    operacion: { modulo: string; operacion: string };
    hint?: string;
    requestId: string;
  };
};

/** Detecta un nombre legible de un campo. */
function humanizeField(path: (string | number)[]): string {
  if (path.length === 0) return 'body';
  return path.map((p) => String(p)).join('.');
}

/** Mapea un path de zod a una descripcion humana del campo. */
function describeField(path: (string | number)[]): string {
  const h = humanizeField(path);
  // Diccionario de sinonimos / aclaraciones
  const dictionary: Record<string, string> = {
    motivo: 'motivo (texto libre, 3-280 caracteres, por que se cancela/rechaza)',
    monto: 'monto (numero, en USD, sin simbolo ni comas, ej: 150.50)',
    justificacion: 'justificacion (texto libre opcional)',
    scheduledFor: 'scheduledFor (fecha en formato YYYY-MM-DD, ej: "2026-08-15")',
    fecha: 'fecha (formato YYYY-MM-DD, ej: "2026-08-15")',
    date: 'date (formato YYYY-MM-DD, ej: "2026-08-15")',
    plate: 'plate (placa del vehiculo en MAYUSCULAS, ej: "ABM-4662")',
    code: 'code (codigo interno del vehiculo, unico por empresa)',
    estado: 'estado (uno de: "Operativo", "En mantenimiento", "Fuera de servicio")',
    status: 'status (uno de los valores validos del recurso)',
    vehiculo: 'vehiculo (ID o nombre/placa del vehiculo, ej: "vehicle-14" o "ABM-4662")',
    conductor: 'conductor (ID o nombre del conductor, ej: "driver-7" o "Juan Perez")',
    siteId: 'siteId (ID de sede, ej: "site-1")',
    taller: 'taller (texto libre, nombre del taller, requerido para mantenimientos mano_de_obra)',
    lavador: 'lavador (texto libre, nombre de quien lava, requerido para lavadas)',
    proveedorId: 'proveedorId (ID del proveedor del catalogo, requerido para repuestos)',
    confirmar: 'confirmar (DEBE ser literalmente true para eliminar/cancelar)',
    id: 'id (formato "modulo-N" o solo "N", ej: "vehicle-14" o "14")',
  };
  return dictionary[h] ?? h;
}

/**
 * Genera un mensaje didactico de error de zod.
 * Devuelve el `mensaje` con lista de campos y formato esperado.
 */
function describeZodIssues(issues: ZodIssue[]): {
  faltantes: string[];
  invalidos: string[];
  mensaje: string;
} {
  const faltantes: string[] = [];
  const invalidos: string[] = [];

  for (const i of issues) {
    const campo = describeField(i.path);
    if (i.code === 'invalid_type' && (i as any).received === 'undefined') {
      faltantes.push(campo);
    } else if (i.code === 'invalid_type' && (i as any).expected === 'string' && (i as any).received === 'undefined') {
      faltantes.push(campo);
    } else {
      invalidos.push(`${campo} (${i.message})`);
    }
  }

  let mensaje = 'Datos invalidos:';
  if (faltantes.length > 0) {
    mensaje += `\n  Faltan campos requeridos: ${faltantes.join(', ')}.`;
  }
  if (invalidos.length > 0) {
    mensaje += `\n  Campos con valor invalido: ${invalidos.join('; ')}.`;
  }
  mensaje += '\n  Consultar el inputSchema de la operacion en INSTRUCTIONS.md (INPUT_SCHEMAS.md) o enviar de nuevo corrigiendo lo que se indica.';

  return { faltantes, invalidos, mensaje };
}

/**
 * Devuelve un body de ejemplo correcto para una operacion.
 * Sirve para que el GPT copie la estructura, cambie los valores, y reintente.
 */
function exampleBody(modulo: string, operacion: string): Record<string, unknown> {
  // Patrones por operacion
  const key = `${modulo}/${operacion}`;
  const examples: Record<string, Record<string, unknown>> = {
    'mantenimientos/cancelar': { motivo: 'Reprogramado por falta de repuestos en stock.' },
    'mantenimientos/rechazar': { motivo: 'La factura no coincide con el mantenimiento solicitado.' },
    'mantenimientos/editar': {
      scheduledFor: '2026-08-20',
      title: 'Cambio de aceite y filtros',
      notes: 'Vehiculo presento ruido en el motor el 15/08.',
    },
    'vehiculos/estado': { estado: 'En mantenimiento', motivo: 'Ingreso a taller por falla de motor' },
    'vehiculos/nota': { texto: 'Vehiculo reportado con luz de check engine encendida' },
    'vehiculos/odometro': { lectura: 123456, fecha: '2026-08-15' },
    'solicitudes/crear': { monto: 150.50, motivo: 'Repuesto para mantenimiento programado', siteId: 'site-1' },
    'solicitudes/revisar': { decision: 'approved', motivo: 'Aprobado por administracion' },
    'checklists/crear': { vehiculo: 'ABM-4662', items: [{ pregunta: 'Frenos OK', cumple: true }] },
    'autorizaciones/crear': { vehiculo: 'ABM-4662', fecha: '2026-08-15', motivo: 'Salida a proveedor' },
    'autorizaciones/aprobar': { id: 'autorizacion-1' },
    'autorizaciones/rechazar': { id: 'autorizacion-1', motivo: 'Fuera de horario' },
    'alertas/crear': { vehiculo: 'ABM-4662', titulo: 'Frenos desgastados', severidad: 'alta' },
    'alertas/estado': { estado: 'Resuelta', notas: 'Se reemplazaron los frenos' },
    'caja_chica/reponer': { id: 'petty-cash-1', monto: 200, nota: 'Reposicion de fondo mensual' },
  };
  if (examples[key]) return examples[key];

  // Patrones por modulo si no hay especifico
  if (operacion === 'crear') {
    return { _comentario: 'Cuerpo con los campos del nuevo registro. Ver INPUT_SCHEMAS.md para los campos requeridos.' };
  }
  if (operacion === 'editar') {
    return { _comentario: 'Cuerpo con los campos a modificar (parcial OK).' };
  }
  if (operacion === 'eliminar') {
    return { id: 'modulo-N', confirmar: true };
  }
  return {};
}

/**
 * Convierte un ZodError en un AppError con mensaje didactico.
 * Uso: throw toDidacticError(zodError, modulo, operacion, input)
 */
export function toDidacticError(
  err: ZodError,
  modulo: string,
  operacion: string,
  input: unknown,
): AppError {
  const desc = describeZodIssues(err.issues);

  // Adjuntamos al AppError la informacion estructurada via `details` (no
  // es estandar pero los handlers la pueden pasar al cliente).
  const friendly = `Operacion ${modulo}/${operacion}: ${desc.mensaje}`;

  const e: any = new AppError(400, friendly, 'VALIDATION_ERROR');
  e.didactico = {
    camposFaltantes: desc.faltantes,
    camposInvalidos: desc.invalidos,
    formatoEsperado: 'Ver INPUT_SCHEMAS.md (docs/INPUT_SCHEMAS.md) — seccion ' + modulo,
    ejemploBody: exampleBody(modulo, operacion),
    operacion: { modulo, operacion },
    inputRecibido: input,
  };
  return e;
}

/**
 * Envoltorio conveniente para handlers que hacen `schema.parse(input)`.
 * En vez de:
 *   const data = schema.parse(input);
 * hace:
 *   const data = parseOrThrow(schema, input, modulo, operacion);
 *
 * Asi, si el input es invalido, lanza un error didactico con ejemplo
 * de body correcto.
 */
export function parseOrThrow<T>(
  schema: ZodTypeAny,
  input: unknown,
  modulo: string,
  operacion: string,
): T {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data as T;
  throw toDidacticError(parsed.error, modulo, operacion, input);
}

/**
 * Helper para handlers que reciben (ctx, input) y hacen `schema.parse(input)`.
 */
export function parseInputOrThrow<T>(
  schema: ZodTypeAny,
  ctx: any,
  input: unknown,
  modulo: string,
  operacion: string,
): T {
  return parseOrThrow<T>(schema, input, modulo, operacion);
}
