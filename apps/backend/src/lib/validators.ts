// ─────────────────────────────────────────────────────────────────────────────
// Reglas de validación compartidas (backend + frontend)
// Reutilizables vía: import { validators } from '@/lib/validators';
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';

// ─── Patrones regex canónicos ────────────────────────────────────────────────

/** 10 dígitos exactos — cédula, RUC, DNI, teléfono, número de licencia */
export const DIGITS_10 = /^\d{10}$/;

/** Solo letras, espacios, tildes y guiones — para nombres y apellidos */
export const NAME_PATTERN = /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü\s'-]+$/;

/** Solo letras, espacios y signos básicos — para cargos, áreas, ciudades */
export const TEXT_PATTERN = /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü0-9\s,.\-/&()]+$/;

/** Placa vehicular — formato Ecuador: 3 letras + 4 dígitos (ABC-1234 o ABC1234) */
export const PLATE_PATTERN = /^[A-Z]{3}-?\d{3,4}$/;

/** VIN / número de serie alfanumérico — 17 caracteres */
export const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

/** Año razonable para vehículos (1900 - año actual + 1) */
export const REASONABLE_YEAR = (extra = 1) =>
  z.number().int().min(1900).max(new Date().getFullYear() + extra);

/** Solo letras (sin números) */
export const LETTERS_ONLY = /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü\s'-]+$/;

// ─── Strings saneadas contra XSS / HTML injection / code execution ──────────

/** Patrones prohibidos (case-insensitive) — detectados y rechazados */
const FORBIDDEN_PATTERNS: { name: string; pattern: RegExp }[] = [
  // HTML / XSS
  { name: 'html-tag',     pattern: /<\s*\/?[a-z][^>]*>/i },
  { name: 'script',       pattern: /<\s*script/i },
  { name: 'iframe',       pattern: /<\s*iframe/i },
  { name: 'object',       pattern: /<\s*object/i },
  { name: 'embed',        pattern: /<\s*embed/i },
  { name: 'svg',          pattern: /<\s*svg/i },
  { name: 'on-event',     pattern: /\bon[a-z]+\s*=/i },
  { name: 'js-uri',       pattern: /javascript\s*:/i },
  { name: 'data-uri',     pattern: /data\s*:\s*text\/html/i },
  { name: 'vbscript',     pattern: /vbscript\s*:/i },
  // SQL injection — los más comunes; las queries usan Drizzle igual
  { name: 'sql-union',    pattern: /\bunion\b.*\bselect\b/i },
  { name: 'sql-comment',  pattern: /(--|\/\*|\*\/|;.*--)/i },
  { name: 'sql-or-1-1',   pattern: /\b(or|and)\b\s+\d+\s*=\s*\d+/i },
  { name: 'sql-drop',     pattern: /\b(drop|truncate|alter)\b\s+\w+/i },
  // Code execution
  { name: 'shell-cmd',    pattern: /(\$\(|`[^`]*`|\|\s*nc\s|;\s*rm\s|\bshutdown\b)/i },
  { name: 'node-require', pattern: /require\s*\(\s*['"][^'"]+['"]\s*\)/i },
  { name: 'eval-call',    pattern: /\beval\s*\(/i },
];

/**
 * Verifica si un string contiene patrones peligrosos.
 * Se aplica DESPUÉS de la validación con Zod.
 */
export function containsForbiddenContent(value: string): string | null {
  if (typeof value !== 'string') return null;
  for (const { name, pattern } of FORBIDDEN_PATTERNS) {
    if (pattern.test(value)) {
      return `Entrada bloqueada: patrón no permitido (${name})`;
    }
  }
  return null;
}

/**
 * Helper que crea un transform para saneado de strings —
 * recorta espacios y rechaza contenido peligroso.
 */
export function safeString(opts: {
  min?: number;
  max?: number;
  allowEmpty?: boolean;
  pattern?: RegExp;
  patternLabel?: string;
  fieldLabel?: string;
} = {}) {
  const { min = 0, max = 500, allowEmpty = false, pattern, patternLabel, fieldLabel = 'campo' } = opts;
  return z
    .string()
    .transform((v) => (typeof v === 'string' ? v.trim() : v))
    .refine((v) => allowEmpty ? true : v.length >= min, {
      message: `${fieldLabel} es requerido (mín. ${min} caracteres)`,
    })
    .refine((v) => v.length <= max, {
      message: `${fieldLabel} excede el máximo de ${max} caracteres`,
    })
    .refine((v) => containsForbiddenContent(v) === null, () => ({
      message: 'Entrada bloqueada: contenido potencialmente peligroso',
    }))
    .refine(
      (v) => (pattern ? pattern.test(v) : true),
      () => ({ message: patternLabel ?? `${fieldLabel} tiene formato inválido` }),
    );
}

// ─── Validadores reusables ──────────────────────────────────────────────────

export const validators = {
  /** Cédula / RUC / DNI / teléfono / número de licencia — 10 dígitos exactos */
  digits10: z
    .string()
    .trim()
    .regex(DIGITS_10, 'Debe contener exactamente 10 dígitos numéricos'),

  /** Cédula opcional (puede ser null) */
  digits10Optional: z
    .string()
    .trim()
    .regex(DIGITS_10, 'Debe contener exactamente 10 dígitos numéricos')
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),

  /** Teléfono — 10 dígitos, requerido */
  phone: z
    .string()
    .trim()
    .regex(DIGITS_10, 'El teléfono debe tener exactamente 10 dígitos numéricos'),

  /** Teléfono opcional */
  phoneOptional: z
    .string()
    .trim()
    .regex(DIGITS_10, 'El teléfono debe tener exactamente 10 dígitos numéricos')
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),

  /** Email con formato válido */
  email: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/,
      'Formato de correo inválido',
    )
    .max(120, 'El correo no puede exceder 120 caracteres'),

  /** Email opcional */
  emailOptional: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/,
      'Formato de correo inválido',
    )
    .max(120, 'El correo no puede exceder 120 caracteres')
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),

  /** Nombre / apellido — solo letras, espacios, tildes y guiones */
  name: safeString({
    min: 2,
    max: 80,
    pattern: NAME_PATTERN,
    patternLabel: 'Solo se permiten letras, espacios, tildes y guiones',
    fieldLabel: 'Nombre',
  }),

  /** Nombre opcional (no required) */
  nameOptional: safeString({
    max: 80,
    pattern: NAME_PATTERN,
    patternLabel: 'Solo se permiten letras, espacios, tildes y guiones',
    fieldLabel: 'Nombre',
    allowEmpty: true,
  }).nullable().optional().or(z.literal('').transform(() => null)),

  /** Texto libre (ciudad, área, etc.) — saneado contra XSS/SQLi/code */
  text: safeString({
    min: 1,
    max: 200,
    pattern: TEXT_PATTERN,
    patternLabel: 'Contiene caracteres no permitidos',
    fieldLabel: 'Texto',
  }),

  /** Texto libre opcional */
  textOptional: safeString({
    max: 200,
    pattern: TEXT_PATTERN,
    patternLabel: 'Contiene caracteres no permitidos',
    fieldLabel: 'Texto',
    allowEmpty: true,
  }).nullable().optional().or(z.literal('').transform(() => null)),

  /** Texto largo (notas, observaciones) — saneado pero permite más caracteres */
  longText: safeString({
    min: 1,
    max: 2000,
    fieldLabel: 'Notas',
  }),

  /** Texto largo opcional */
  longTextOptional: safeString({
    max: 2000,
    fieldLabel: 'Notas',
    allowEmpty: true,
  }).nullable().optional().or(z.literal('').transform(() => null)),

  /** Placa vehicular */
  plate: z
    .string()
    .trim()
    .toUpperCase()
    .regex(PLATE_PATTERN, 'Formato de placa inválido (ej. ABC-1234)')
    .max(8),

  /** Placa opcional */
  plateOptional: z
    .string()
    .trim()
    .toUpperCase()
    .regex(PLATE_PATTERN, 'Formato de placa inválido (ej. ABC-1234)')
    .max(8)
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),

  /** Año razonable */
  year: REASONABLE_YEAR(),

  /** Número entero no-negativo */
  nonNegativeInt: z.number().int().min(0),

  /** Número positivo (estricto) */
  positiveNumber: z.number().positive(),

  /** Número no-negativo (puede ser 0) */
  nonNegativeNumber: z.number().min(0),

  /** Coordenada lat/long */
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
};
