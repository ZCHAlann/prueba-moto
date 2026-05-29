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