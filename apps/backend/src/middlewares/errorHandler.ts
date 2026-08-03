import { Request, Response, NextFunction } from 'express';
import { ZodError, type ZodIssue } from 'zod';
import { AppError, ValidationError } from '../lib/errors';

/**
 * jul 2026 v6 — Traduce un ZodError a un envelope uniforme que el
 * frontend ya sabe leer: `{ok:false, error:{codigo, mensaje, campos, requestId}}`.
 * Devuelve 400 (no 500) y SOLO expone el nombre del campo faltante o
 * inválido, NUNCA el valor enviado (para no leakear PII ni estructura
 * interna del schema).
 *
 * Antes: un `schema.parse(...)` que tiraba ZodError caía al caso
 * default de 500 "Error interno del servidor" y el usuario veía un
 * cartel genérico sin saber qué le faltó. Ahora ve exactamente qué
 * campo del body tiene que arreglar.
 */
function zodToEnvelope(err: ZodError): {
  ok: false;
  error: {
    codigo: 'VALIDATION_ERROR';
    mensaje: string;
    campos: Array<{ campo: string; motivo: string }>;
    requestId: string;
  };
} {
  // Diccionario "humano" para los nombres de campo más comunes. NO
  // incluye el valor (eso podría leakear emails, placas, passwords).
  // Solo describe el campo y el motivo en español.
  const FIELD_LABELS: Record<string, string> = {
    motivo:          'motivo (texto, 3-500 caracteres)',
    monto:           'monto (número positivo, en USD)',
    fecha:           'fecha (formato YYYY-MM-DD)',
    date:            'date (formato YYYY-MM-DD)',
    scheduledFor:    'scheduledFor (YYYY-MM-DD o YYYY-MM-DDTHH:mm:ssZ)',
    scheduledDate:   'scheduledDate (YYYY-MM-DD)',
    estado:          'estado (Operativo, En mantenimiento, Fuera de servicio)',
    status:          'status (uno de los valores válidos del recurso)',
    vehiculo:        'vehiculo (ID con prefijo o nombre/placa)',
    conductor:       'conductor (ID con prefijo o nombre)',
    taller:          'taller (texto, requerido para mano de obra)',
    lavador:         'lavador (texto, requerido para lavadas)',
    proveedorId:     'proveedorId (ID del catálogo, requerido para repuestos)',
    confirmar:       'confirmar (debe ser literalmente true para eliminar)',
    id:              'id (formato "modulo-N" o solo "N")',
    plate:           'plate (placa del vehículo, MAYÚSCULAS)',
    code:            'code (código interno, único por empresa)',
    name:            'name (texto, 2-120 caracteres)',
    description:     'description (texto)',
    notes:           'notes (texto opcional)',
    siteId:          'siteId (ID de sede)',
    assignedUserId:  'assignedUserId (ID de usuario a asignar)',
    type:            'type (tipo de mantenimiento)',
    category:        'category (categoría del mantenimiento)',
    title:           'title (título, 1-200 caracteres)',
  };

  const campos: Array<{ campo: string; motivo: string }> = [];
  for (const i of err.issues) {
    const path = i.path.length ? i.path.join('.') : 'body';
    const isMissing = i.code === 'invalid_type' && (i as any).received === 'undefined';
    let motivo: string;
    if (isMissing) {
      motivo = 'falta o es requerido';
    } else if (i.code === 'invalid_type') {
      motivo = `tipo incorrecto (esperado ${(i as any).expected}, recibido ${(i as any).received})`;
    } else if (i.code === 'invalid_enum_value') {
      const opt = ((i as any).options ?? []).join(', ');
      motivo = `valor inválido (esperado uno de: ${opt})`;
    } else if (i.code === 'too_small') {
      motivo = `muy pequeño (mínimo ${(i as any).minimum})`;
    } else if (i.code === 'too_big') {
      motivo = `muy grande (máximo ${(i as any).maximum})`;
    } else {
      motivo = i.message || 'inválido';
    }
    // Usar el label humano si lo tenemos, si no el path crudo.
    const label = FIELD_LABELS[path] ?? path;
    campos.push({ campo: label, motivo });
  }

  const resumen = campos
    .slice(0, 5)
    .map((c) => `${c.campo}: ${c.motivo}`)
    .join('; ');
  const mas = campos.length > 5 ? ` (+${campos.length - 5} más)` : '';
  const mensaje = campos.length === 1
    ? `Falta o es inválido: ${campos[0].campo}. ${campos[0].motivo}.`
    : `Datos inválidos — ${resumen}${mas}`;

  return {
    ok: false,
    error: {
      codigo: 'VALIDATION_ERROR',
      mensaje,
      campos,
      requestId: `req-${Date.now()}`,
    },
  };
}

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  // ── ZodError: el caso más común en formularios. Lo traducimos al
  // envelope uniforme ANTES de loguear para no spamear el log con
  // info detallada (los campos faltantes ya van en el response).
  if (err instanceof ZodError) {
    // Log corto: solo la cantidad de issues y el primer path.
    const first = err.issues[0];
    console.warn(
      `[errorHandler] ZodError ${req.method} ${req.originalUrl} ` +
      `(${err.issues.length} issues, first: ${first?.path?.join('.') ?? '?'})`,
    );
    return res.status(400).json(zodToEnvelope(err));
  }

  console.error('[errorHandler]', req.method, req.originalUrl, '→', err?.message, err?.code);
  console.error('[errorHandler] cause:', err?.cause)
  if (err?.stack) {
    console.error('[errorHandler] stack:');
    console.error(err.stack.split('\n').slice(0, 8).join('\n'));
  }

  if (err instanceof ValidationError) {
    return res.status(err.status).json({
      ok: false,
      error: {
        codigo: 'VALIDATION_ERROR',
        mensaje: err.message,
        campos: err.details ?? [],
        requestId: `req-${Date.now()}`,
      },
    });
  }

  if (err instanceof AppError) {
    return res.status(err.status).json({
      ok: false,
      error: {
        codigo: (err as any).code ?? 'APP_ERROR',
        mensaje: err.message,
        requestId: `req-${Date.now()}`,
      },
    });
  }

  // Error de Postgres conocido: lo exponemos en desarrollo para debug rápido.
  // En producción se mantiene el mensaje genérico.
  const isPgError = typeof err?.code === 'string' && err.code.startsWith('42');
  const showPgDetail = process.env.NODE_ENV !== 'production' && isPgError;

  return res.status(500).json({
    ok: false,
    error: {
      codigo: 'INTERNAL_ERROR',
      mensaje: 'Error interno del servidor',
      requestId: `req-${Date.now()}`,
      ...(showPgDetail ? {
        _debug: {
          code: err.code,
          message: err.message,
          detail: err.detail,
          hint: err.hint,
        },
      } : {}),
    },
  });
};