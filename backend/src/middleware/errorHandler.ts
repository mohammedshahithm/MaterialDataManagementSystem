import { Request, Response, NextFunction } from 'express';

/**
 * Global error handler middleware.
 */
export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err);

  // Prisma known request errors
  if (err.code === 'P2002') {
    return res.status(409).json({
      error: 'A record with this value already exists',
      field: err.meta?.target,
    });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Record not found' });
  }

  // Zod validation errors
  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.errors,
    });
  }

  // Custom app errors
  if (err.statusCode) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  // Fallback
  return res.status(500).json({ error: 'Internal server error' });
}

/**
 * Custom application error class.
 */
export class AppError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}
