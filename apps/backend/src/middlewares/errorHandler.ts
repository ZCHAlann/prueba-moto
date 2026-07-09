import { Request, Response, NextFunction } from 'express';
import { AppError, ValidationError } from '../lib/errors';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[errorHandler]', req.method, req.originalUrl, '→', err?.message, err?.code);

  if (err instanceof ValidationError) {
    return res.status(err.status).json({
      error: err.message,
      details: err.details,
    });
  }

  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: err.message,
    });
  }

  // Error de Postgres conocido: lo exponemos en desarrollo para debug rápido.
  // En producción se mantiene el mensaje genérico.
  const isPgError = typeof err?.code === 'string' && err.code.startsWith('42');
  const showPgDetail = process.env.NODE_ENV !== 'production' && isPgError;

  return res.status(500).json({
    error: 'Error interno del servidor',
    ...(showPgDetail ? {
      _debug: {
        code: err.code,
        message: err.message,
        detail: err.detail,
        hint: err.hint,
      },
    } : {}),
  });
};