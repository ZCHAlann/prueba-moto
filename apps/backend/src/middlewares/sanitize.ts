// ─────────────────────────────────────────────────────────────────────────────
// Sanitización global — bloquea payloads con XSS / SQLi / code execution
// Se ejecuta ANTES de cualquier route handler o Zod schema.
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../lib/errors';

// Patrones prohibidos (los mismos que en validators.ts)
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
  // SQL injection
  { name: 'sql-union',    pattern: /\bunion\b.*\bselect\b/i },
  { name: 'sql-comment',  pattern: /(--|\/\*|\*\/|;.*--)/i },
  { name: 'sql-or-1-1',   pattern: /\b(or|and)\b\s+\d+\s*=\s*\d+/i },
  { name: 'sql-drop',     pattern: /\b(drop|truncate|alter)\b\s+\w+/i },
  // Code execution
  { name: 'shell-cmd',    pattern: /(\$\(|`[^`]*`|\|\s*nc\s|;\s*rm\s|\bshutdown\b)/i },
  { name: 'node-require', pattern: /require\s*\(\s*['"][^'"]+['"]\s*\)/i },
  { name: 'eval-call',    pattern: /\beval\s*\(/i },
];

const MAX_DEPTH = 10;        // profundidad máxima al recorrer objetos
const MAX_KEYS = 200;        // máximo número de claves en cualquier objeto
const MAX_STRING = 50_000;   // longitud máxima de cualquier string

/**
 * Recorre req.body, req.query, req.params recursivamente y
 * rechaza el request si encuentra contenido peligroso o
 * excede los límites estructurales.
 */
function scan(value: unknown, path: string[], depth = 0): string | null {
  if (depth > MAX_DEPTH) {
    return `Profundidad del payload excedida (${MAX_DEPTH}) en ${path.join('.') || '<root>'}`;
  }
  if (value === null || value === undefined) return null;

  if (typeof value === 'string') {
    if (value.length > MAX_STRING) {
      return `Campo demasiado largo en ${path.join('.') || '<root>'} (max ${MAX_STRING})`;
    }
    for (const { name, pattern } of FORBIDDEN_PATTERNS) {
      if (pattern.test(value)) {
        return `Entrada bloqueada en ${path.join('.') || '<root>'}: patrón no permitido (${name})`;
      }
    }
    return null;
  }

  if (Array.isArray(value)) {
    if (value.length > MAX_KEYS) {
      return `Demasiados elementos en ${path.join('.') || '<root>'} (max ${MAX_KEYS})`;
    }
    for (let i = 0; i < value.length; i++) {
      const err = scan(value[i], [...path, String(i)], depth + 1);
      if (err) return err;
    }
    return null;
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length > MAX_KEYS) {
      return `Demasiadas claves en ${path.join('.') || '<root>'} (max ${MAX_KEYS})`;
    }
    for (const k of keys) {
      const err = scan((value as Record<string, unknown>)[k], [...path, k], depth + 1);
      if (err) return err;
    }
    return null;
  }

  // números, booleanos, etc. — sin problema
  return null;
}

/**
 * Middleware Express que escanea req.body, req.query, req.params
 * y rechaza con 400 ante cualquier contenido peligroso.
 */
export function sanitizeRequest(req: Request, _res: Response, next: NextFunction) {
  for (const source of ['body', 'params', 'query'] as const) {
    const err = scan((req as any)[source], [source]);
    if (err) {
      return next(new ValidationError({ _: [err] }, 'Contenido no permitido'));
    }
  }
  next();
}
