/**
 * Logger with Sentry integration.
 *
 * - Info/Warn: printed to console in dev only.
 * - Error: always printed to console AND sent to Sentry.captureException()
 *   or Sentry.captureMessage() automatically.
 *
 * Uses static import of @sentry/node — safe because server/index.ts imports
 * ./instrument (which runs Sentry.init()) before importing this module.
 */

import * as Sentry from '@sentry/node';
import { isB2LogStorageConfigured, storeB2Log } from '../services/b2LogStorage';

export interface Logger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

const isDev = process.env.NODE_ENV !== 'production' || process.env.DEBUG === 'true';

/** Safe stringification helper — never throws. */
function safeStringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

const SENSITIVE_VALUE = /("(?:password|token|secret|authorization|cookie|apiKey|applicationKey)"\s*:\s*)"[^"]*"/gi;
const BEARER_TOKEN = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;

function redact(value: string): string {
  return value
    .replace(SENSITIVE_VALUE, '$1"[REDACTED]"')
    .replace(BEARER_TOKEN, 'Bearer [REDACTED]');
}

function archive(level: 'info' | 'warn' | 'error', args: unknown[]): void {
  if (!isB2LogStorageConfigured()) return;

  void storeB2Log('application', {
    level,
    message: redact(args.map(safeStringify).join(' ')),
    environment: process.env.NODE_ENV || 'development',
  }).catch((error) => {
    if (isDev) console.warn('[Logger] Falha ao arquivar log na Backblaze:', safeStringify(error));
  });
}

/** Extract an Error from args, preferring the first Error instance found. */
function extractError(args: unknown[]): Error | undefined {
  return args.find((a): a is Error => a instanceof Error);
}

/**
 * Sends an error payload to Sentry.
 * Silently ignores failures (Sentry unavailable or DSN not configured).
 */
function sendToSentry(...args: unknown[]): void {
  try {
    const errorObj = extractError(args);
    if (errorObj) {
      Sentry.captureException(errorObj, {
        tags: { source: 'server:logger', handler: 'log.error' },
        extra: { args: args.map(safeStringify) },
      });
    } else {
      const message = args.map(safeStringify).join(' ');
      if (message) {
        Sentry.captureMessage(message, {
          level: 'error',
          tags: { source: 'server:logger', handler: 'log.error' },
        });
      }
    }
  } catch {
    // Sentry unavailable — silently ignore
  }
}

export const log: Logger = {
  info: (...args: unknown[]) => {
    if (isDev) console.log(...args);
    archive('info', args);
  },
  warn: (...args: unknown[]) => {
    if (isDev) console.warn(...args);
    archive('warn', args);
  },
  error: (...args: unknown[]) => {
    // Always print to console in any environment
    console.error(...args);
    // Fire-and-forget Sentry notification (synchronous)
    sendToSentry(...args);
    archive('error', args);
  },
};
