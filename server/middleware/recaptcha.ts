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
      // Se for uma requisição AJAX do aplicativo (com X-Requested-With), permite para evitar bloquear usuários caso o frontend esteja sem VITE_RECAPTCHA_SITE_KEY
      if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
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
      const timeout = setTimeout(() => controller.abort(), 3000);
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
        log.warn(`[reCAPTCHA] Falha na verificação: ${errorMsg}`);

        // Se a chave secreta no servidor for inválida, loga o erro mas permite prosseguir para evitar parar o login
        if (errorCodes.includes('invalid-input-secret') || errorCodes.includes('bad-request')) {
          log.error('[reCAPTCHA] ATENÇÃO: RECAPTCHA_SECRET_KEY inválida na Vercel. Verifique as configurações de ambiente.');
          return next();
        }

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
        log.warn('[reCAPTCHA] Timeout na verificação — permitindo requisição para não bloquear usuário');
        return next();
      }
      log.error('[reCAPTCHA] Erro na verificação:', errorMessage);
      res.status(500).json({ error: 'Erro interno ao verificar reCAPTCHA.' });
    }
  };
}
