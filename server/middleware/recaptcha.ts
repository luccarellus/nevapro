import { Request, Response, NextFunction } from 'express';
import { log } from '../utils/logger';

/**
 * reCAPTCHA v3 — Server-side verification middleware.
 *
 * Extracts the reCAPTCHA token from req.body.recaptcha_token and verifies it
 * against Google's API. If the score is below the threshold, the request is
 * rejected with a 403 status.
 *
 * Usage:
 *   router.post('/login', verifyRecaptcha, handler);
 *
 * The middleware is skipped when:
 *   - RECAPTCHA_SECRET_KEY is not configured (development/fallback)
 *   - The request method is idempotent (GET, HEAD, OPTIONS)
 */

const VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';
const DEFAULT_SCORE_THRESHOLD = 0.5;

interface RecaptchaResponse {
  success: boolean;
  score?: number;
  action?: string;
  challenge_ts?: string;
  hostname?: string;
  'error-codes'?: string[];
}

/**
 * Creates a reCAPTCHA verification middleware with an optional score threshold.
 *
 * @param threshold  Minimum score (0.0 – 1.0). Defaults to 0.5.
 *                   Lower values are more permissive, higher values are stricter.
 */
export function verifyRecaptcha(threshold: number = DEFAULT_SCORE_THRESHOLD) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const secretKey = process.env.RECAPTCHA_SECRET_KEY;

    // Skip if not configured (allows local development without reCAPTCHA)
    if (!secretKey) {
      log.warn('[reCAPTCHA] RECAPTCHA_SECRET_KEY não configurada. Pulando verificação.');
      return next();
    }

    const token = req.body?.recaptcha_token;
    if (!token || typeof token !== 'string') {
      log.warn('[reCAPTCHA] Token ausente na requisição.');
      // Fail-closed em produção: sem token não passa (evita bypass quando o
      // frontend está mal configurado). Em dev, permite AJAX para não travar.
      if (process.env.NODE_ENV !== 'production' && req.headers['x-requested-with'] === 'XMLHttpRequest') {
        return next();
      }
      res.status(403).json({
        error: 'Verificação de segurança necessária. Recarregue a página e tente novamente.',
      });
      return;
    }

    try {
      const params = new URLSearchParams({
        secret: secretKey,
        response: token,
      });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1500);
      const response = await fetch(VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        log.error('[reCAPTCHA] Erro HTTP na verificação:', response.status);
        res.status(500).json({ error: 'Erro ao verificar reCAPTCHA. Tente novamente.' });
        return;
      }

      const data = (await response.json()) as RecaptchaResponse;

      if (!data.success) {
        const errorCodes = data['error-codes'] || [];
        const errorMsg = errorCodes.join(', ') || 'desconhecido';

        const isClientOrConfigError = errorCodes.some(
          (code) =>
            code === 'browser-error' ||
            code === 'invalid-input-secret' ||
            code === 'bad-request' ||
            code === 'missing-input-response' ||
            code === 'hostname-mismatch',
        );

        if (isClientOrConfigError) {
          log.info('[reCAPTCHA] Erro de ambiente/cliente permitido para não bloquear usuários:', errorMsg);
          return next();
        }

        log.warn(`[reCAPTCHA] Falha na verificação: ${errorMsg}`);
        res.status(403).json({
          error: 'Verificação de segurança falhou. Tente novamente.',
        });
        return;
      }

      // Score check
      if (typeof data.score === 'number' && data.score < threshold) {
        log.warn(
          `[reCAPTCHA] Score baixo: ${data.score} (limiar: ${threshold}, ação: ${data.action || 'N/A'})`,
        );
        // Fail-closed também no login (score baixo = provável bot).
        res.status(403).json({
          error: 'Nossa verificação de segurança identificou atividade suspeita. Tente novamente mais tarde.',
        });
        return;
      }

      log.info(
        `[reCAPTCHA] OK — ação: ${data.action || 'N/A'}, score: ${data.score ?? 'N/A'}`,
      );
      next();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage.includes('abort') || errorMessage.includes('Timeout')) {
        // Fail-closed em produção: timeout da API do Google não pode abrir
        // janela de bypass da anti-automation (era fail-open antes).
        if (process.env.NODE_ENV === 'production') {
          log.warn('[reCAPTCHA] Timeout na verificação — bloqueando requisição (fail-closed em produção)');
          res.status(503).json({ error: 'Verificação de segurança indisponível. Tente novamente em instantes.' });
          return;
        }
        log.warn('[reCAPTCHA] Timeout na verificação — permitindo requisição (dev)');
        return next();
      }
      log.error('[reCAPTCHA] Erro na verificação:', errorMessage);
      res.status(500).json({ error: 'Erro interno ao verificar reCAPTCHA.' });
    }
  };
}
