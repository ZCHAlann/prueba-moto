// ─────────────────────────────────────────────────────────────────────────────
// Validación cliente para formularios
// Reglas espejo de apps/backend/src/lib/validators.ts
// ─────────────────────────────────────────────────────────────────────────────

// ─── Patrones regex canónicos (espejo del backend) ────────────────────────────

export const DIGITS_10 = /^\d{10}$/;
export const NAME_PATTERN = /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü\s'-]+$/;
export const TEXT_PATTERN = /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü0-9\s,.\-/&()]+$/;
export const PLATE_PATTERN = /^[A-Z]{3}-?\d{3,4}$/;
export const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

// ─── Reglas de validación reutilizables ──────────────────────────────────────

export const validationRules = {
  required: (v: unknown): true | string => {
    if (v === null || v === undefined) return 'Campo requerido';
    if (typeof v === 'string' && v.trim() === '') return 'Campo requerido';
    return true;
  },

  digits10: (v: string): true | string => {
    if (!v) return 'Campo requerido';
    if (!DIGITS_10.test(v.trim())) return 'Debe tener exactamente 10 dígitos numéricos';
    return true;
  },

  optionalDigits10: (v: string): true | string => {
    if (!v || v.trim() === '') return true;
    if (!DIGITS_10.test(v.trim())) return 'Debe tener exactamente 10 dígitos numéricos';
    return true;
  },

  phone: (v: string): true | string => {
    if (!v) return 'Teléfono requerido';
    if (!DIGITS_10.test(v.trim())) return 'El teléfono debe tener exactamente 10 dígitos numéricos';
    return true;
  },

  optionalPhone: (v: string): true | string => {
    if (!v || v.trim() === '') return true;
    if (!DIGITS_10.test(v.trim())) return 'El teléfono debe tener exactamente 10 dígitos numéricos';
    return true;
  },

  email: (v: string): true | string => {
    if (!v) return 'Correo requerido';
    if (!EMAIL_PATTERN.test(v.trim())) return 'Formato de correo inválido';
    return true;
  },

  optionalEmail: (v: string): true | string => {
    if (!v || v.trim() === '') return true;
    if (!EMAIL_PATTERN.test(v.trim())) return 'Formato de correo inválido';
    return true;
  },

  name: (v: string): true | string => {
    if (!v || v.trim() === '') return 'Campo requerido';
    if (v.trim().length < 2) return 'Mínimo 2 caracteres';
    if (v.trim().length > 80) return 'Máximo 80 caracteres';
    if (!NAME_PATTERN.test(v.trim())) return 'Solo letras, espacios, tildes y guiones';
    return true;
  },

  optionalName: (v: string): true | string => {
    if (!v || v.trim() === '') return true;
    if (v.trim().length > 80) return 'Máximo 80 caracteres';
    if (!NAME_PATTERN.test(v.trim())) return 'Solo letras, espacios, tildes y guiones';
    return true;
  },

  text: (v: string): true | string => {
    if (!v || v.trim() === '') return 'Campo requerido';
    if (v.trim().length > 200) return 'Máximo 200 caracteres';
    if (!TEXT_PATTERN.test(v.trim())) return 'Contiene caracteres no permitidos';
    return true;
  },

  optionalText: (v: string): true | string => {
    if (!v || v.trim() === '') return true;
    if (v.trim().length > 200) return 'Máximo 200 caracteres';
    if (!TEXT_PATTERN.test(v.trim())) return 'Contiene caracteres no permitidos';
    return true;
  },

  longText: (v: string): true | string => {
    if (!v || v.trim() === '') return 'Campo requerido';
    if (v.trim().length > 2000) return 'Máximo 2000 caracteres';
    return true;
  },

  optionalLongText: (v: string): true | string => {
    if (!v || v.trim().length > 2000) return v && v.length > 2000 ? 'Máximo 2000 caracteres' : true;
    return true;
  },

  plate: (v: string): true | string => {
    if (!v || v.trim() === '') return 'Placa requerida';
    if (!PLATE_PATTERN.test(v.trim().toUpperCase())) return 'Formato inválido (ej. ABC-1234)';
    return true;
  },

  optionalPlate: (v: string): true | string => {
    if (!v || v.trim() === '') return true;
    if (!PLATE_PATTERN.test(v.trim().toUpperCase())) return 'Formato inválido (ej. ABC-1234)';
    return true;
  },

  positiveNumber: (v: string | number): true | string => {
    if (v === '' || v === null || v === undefined) return 'Campo requerido';
    const n = Number(v);
    if (!Number.isFinite(n)) return 'Debe ser un número válido';
    if (n < 0) return 'Debe ser un número positivo';
    return true;
  },

  nonNegativeNumber: (v: string | number): true | string => {
    if (v === '' || v === null || v === undefined) return true;
    const n = Number(v);
    if (!Number.isFinite(n)) return 'Debe ser un número válido';
    if (n < 0) return 'Debe ser un número no negativo';
    return true;
  },

  year: (v: string | number): true | string => {
    if (v === '' || v === null || v === undefined) return true;
    const n = Number(v);
    if (!Number.isInteger(n)) return 'Debe ser un número entero';
    const now = new Date().getFullYear();
    if (n < 1900 || n > now + 1) return `Año fuera de rango (1900–${now + 1})`;
    return true;
  },
};

// ─── Hook principal: useFormValidation ───────────────────────────────────────

import { useState, useCallback, useMemo } from 'react';

export type FieldRules = Record<string, Array<(v: any, allValues?: any) => true | string>>;
export type FieldErrors = Record<string, string | undefined>;

/**
 * Hook de validación cliente para formularios.
 *
 * @example
 *   const { values, errors, handleChange, handleSubmit, isValid } = useFormValidation(
 *     { firstName: '', lastName: '' },
 *     {
 *       firstName: [validationRules.required, validationRules.name],
 *       lastName:  [validationRules.required, validationRules.name],
 *     }
 *   );
 */
export function useFormValidation<T extends Record<string, any>>(
  initialValues: T,
  rules: FieldRules = {},
) {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Memoize rule keys to keep refs stable
  const ruleKeys = useMemo(() => Object.keys(rules), [rules]);

  const validateField = useCallback(
    (name: string, value: any, allValues: any = values) => {
      const fieldRules = rules[name];
      if (!fieldRules) return undefined;
      for (const rule of fieldRules) {
        const result = rule(value, allValues);
        if (result !== true) return result;
      }
      return undefined;
    },
    [rules, values],
  );

  const validateAll = useCallback(
    (vals: T = values) => {
      const next: FieldErrors = {};
      let valid = true;
      for (const k of ruleKeys) {
        const err = validateField(k, vals[k], vals);
        if (err) {
          next[k] = err;
          valid = false;
        }
      }
      setErrors(next);
      return valid;
    },
    [ruleKeys, validateField, values],
  );

  const setValue = useCallback(<K extends keyof T>(name: K, value: T[K]) => {
    setValues((prev) => {
      const next = { ...prev, [name]: value };
      // re-validate this field immediately
      const err = validateField(name as string, value, next);
      setErrors((e) => ({ ...e, [name]: err }));
      return next;
    });
  }, [validateField]);

  const handleChange = useCallback(
    (name: keyof T) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const target = e.target as any;
        const value = target.type === 'checkbox' ? target.checked : target.value;
        setValue(name, value as T[keyof T]);
      },
    [setValue],
  );

  const markTouched = useCallback((name: keyof T) => {
    setTouched((t) => ({ ...t, [name]: true }));
  }, []);

  const handleSubmit = useCallback(
    (onSubmit: (vals: T) => void | Promise<void>) =>
      async (e?: React.FormEvent) => {
        e?.preventDefault();
        // mark all touched
        const allTouched: Record<string, boolean> = {};
        for (const k of ruleKeys) allTouched[k] = true;
        setTouched((t) => ({ ...t, ...allTouched }));
        const valid = validateAll();
        if (!valid) return;
        await onSubmit(values);
      },
    [ruleKeys, validateAll, values],
  );

  const reset = useCallback((next: T = initialValues) => {
    setValues(next);
    setErrors({});
    setTouched({});
  }, [initialValues]);

  const isValid = useMemo(
    () => ruleKeys.every((k) => !errors[k]),
    [ruleKeys, errors],
  );

  return {
    values,
    errors,
    touched,
    setValue,
    setValues,
    handleChange,
    markTouched,
    handleSubmit,
    validateAll,
    validateField,
    isValid,
    reset,
  };
}

// ─── Sanitizador de strings (defensa en profundidad cliente) ──────────────────

/**
 * Sanea un string para defenderse de XSS / HTML injection / SQLi básico.
 * Usar ANTES de enviar al backend, sobre todo para campos de notas / justificación.
 */
export function sanitizeString(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[<>]/g, '')              // strip angle brackets
    .replace(/javascript:/gi, '')      // strip js URI
    .replace(/vbscript:/gi, '')
    .replace(/data:text\/html/gi, '')
    .replace(/on\w+\s*=/gi, '')         // strip inline event handlers
    .trim();
}

/**
 * Wrapper para input onChange que sanea el valor antes de pasarlo al state.
 */
export function sanitizedInputChange(
  setter: (v: string) => void,
  maxLength = 2000,
) {
  return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const raw = e.target.value;
    const sanitized = sanitizeString(raw).slice(0, maxLength);
    setter(sanitized);
  };
}

/**
 * Bloquea caracteres no numéricos en inputs numéricos.
 */
export function numericInputFilter(e: React.KeyboardEvent<HTMLInputElement>) {
  const allowed = /[0-9.]/;
  const special = ['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
  if (special.includes(e.key)) return;
  if (!allowed.test(e.key)) e.preventDefault();
}

/**
 * Bloquea todo carácter que no sea dígito (sin punto decimal).
 */
export function digitsOnlyInputFilter(e: React.KeyboardEvent<HTMLInputElement>) {
  const allowed = /[0-9]/;
  const special = ['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
  if (special.includes(e.key)) return;
  if (!allowed.test(e.key)) e.preventDefault();
}
