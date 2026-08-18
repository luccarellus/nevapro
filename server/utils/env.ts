/**
 * Environment variable validation.
 * Fails fast on startup if critical variables are missing.
 * Prevents the server from running in a broken state.
 */

const REQUIRED_VARS: string[] = [
  'DATABASE_URL',
  'JWT_SECRET',
];

const CONDITIONAL_VARS: { vars: string[]; purpose: string }[] = [
  { vars: ['B2_ENDPOINT', 'B2_KEY_ID', 'B2_APPLICATION_KEY', 'B2_BUCKET_NAME'], purpose: 'Backblaze B2 file storage' },
  { vars: ['REDIS_URL'], purpose: 'Redis caching (self-hosted — VPS via docker-compose)' },
  { vars: ['SENTRY_DSN'], purpose: 'Sentry error tracking' },
  { vars: ['GEMINI_API_KEY'], purpose: 'Gemini AI API' },
  { vars: ['RESEND_API_KEY', 'RESEND_FROM_EMAIL'], purpose: 'Resend (envio de e‑mails de redefinição de senha)' },
  { vars: ['EVENTEASE_WEBHOOK_SECRET'], purpose: 'Integração Webhook EventEase' },
];


/**
 * Validates environment variables on startup.
 * Throws an error if any required variable is missing.
 * Logs warnings for optional but recommended variables.
 */
export function validateEnv(): void {
  const missing: string[] = [];

  for (const name of REQUIRED_VARS) {
    if (!process.env[name]) {
      missing.push(name);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `[ENV] Variáveis obrigatórias ausentes: ${missing.join(', ')}. ` +
      'Verifique seu arquivo .env ou as configurações de ambiente.',
    );
  }

  // Log warnings for conditional vars
  for (const group of CONDITIONAL_VARS) {
    const allMissing = group.vars.every(v => !process.env[v]);
    const someMissing = group.vars.some(v => !process.env[v]);

    if (allMissing) {
      log.warn(`[ENV] Aviso: ${group.purpose} não configurado. Funcionalidade indisponível.`);
    } else if (someMissing) {
      log.warn(`[ENV] Aviso: Configuração incompleta para ${group.purpose}. Alguns recursos podem falhar.`);
    }
  }
}
import { log } from './logger';
