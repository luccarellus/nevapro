import { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Erro de aplicação com status HTTP tipado.
 *
 * Handlers lançam `new HttpError(404, '...')` em vez de repetir
 * res.status(...).json(...) — o handler central do Express converte.
 */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * Wrapper para handlers async: propaga rejeições ao error handler central
 * (sem try/catch repetido em cada rota — elimina ~1 try/catch por endpoint).
 *
 * Uso: router.get('/', requireAuth, asyncHandler(async (req, res) => { ... }))
 */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
