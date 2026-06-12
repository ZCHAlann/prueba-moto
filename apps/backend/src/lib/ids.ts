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
  const withPrefix = new RegExp(`^${prefix}-(\\d+)$`).exec(id);
  if (withPrefix) return Number(withPrefix[1]);
  const numeric = /^\d+$/.exec(id);
  if (numeric) return Number(numeric[0]);
  throw new AppError(400, `ID inválido: ${id}`);
};