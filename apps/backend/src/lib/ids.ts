import { AppError } from './errors';

export const toId = (prefix: string, n: number | string): string => {
  return `${prefix}-${n}`;
};

export const parseId = (prefix: string, id: string): number => {
  const regex = new RegExp(`^${prefix}-(\\d+)$`);
  const match = regex.exec(id);
  if (!match) {
    throw new AppError(400, `ID inválido: ${id}`);
  }
  return Number(match[1]);
};

export const parseIdFlexible = (prefix: string, id: string | number): number => {
  if (typeof id === 'number') return id;
  const str = String(id);
  // Si prefix es 'any' (o '*'), aceptar UNICAMENTE prefijos de la lista
  // cerrada de modulos de la app. NO matcheamos cualquier palabra para
  // evitar que un input malicioso tipo `id-999` se cuele como valido.
  if (prefix === 'any' || prefix === '*') {
    const allowed = '(maintenance|invoice|voucher|request|asset|driver|assignment|site|user|company|chat|message|notification|role)';
    const anyPrefix = new RegExp(`^${allowed}-(\\d+)$`).exec(str);
    if (anyPrefix) return Number(anyPrefix[2]);
  } else {
    const withPrefix = new RegExp(`^${prefix}-(\\d+)$`).exec(str);
    if (withPrefix) return Number(withPrefix[1]);
  }
  const numeric = /^\d+$/.exec(str);
  if (numeric) return Number(numeric[0]);
  throw new AppError(400, `ID inválido: ${id}`);
};