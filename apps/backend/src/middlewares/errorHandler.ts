import { Request, Response, NextFunction } from 'express';
import { AppError, ValidationError } from '../lib/errors';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);

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

  // Error desconocido
  return res.status(500).json({
    error: 'Error interno del servidor',
  });
};