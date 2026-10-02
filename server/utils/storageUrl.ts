import { createHmac } from 'node:crypto';

/**
 * Assinatura HMAC curta para URLs de objects do storage.
 * Evita enumeração de objetos no proxy autenticado: a URL só é aceita
 * quando a assinatura confere (não basta adivinhar o UUID do arquivo).
 */
export function signObjectKey(objectKey: string): string {
  const secret = process.env.JWT_SECRET || '';
  if (!secret) return '';
  return createHmac('sha256', secret).update(`storage:${objectKey}`).digest('base64url').slice(0, 32);
}

export function verifyObjectSignature(objectKey: string, signature: string | undefined): boolean {
  if (!signature) return false;
  const expected = signObjectKey(objectKey);
  if (!expected || expected.length !== signature.length) return false;
  const { timingSafeEqual } = require('node:crypto') as typeof import('node:crypto');
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export function resolveStoredFileUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '';
  const storedValue = value.trim();
  if (storedValue.startsWith('/api/storage/object?file=')) return storedValue;

  let objectKey = storedValue.match(/^(avatars|materials)\/.+$/)?.[0];
  if (!objectKey) {
    try {
      const pathname = decodeURIComponent(new URL(storedValue).pathname);
      objectKey = pathname.match(/\/(avatars|materials)\/(.+)$/)?.[0]?.slice(1);
    } catch {
      return '';
    }
  }

  if (!objectKey) return '';
  const sig = signObjectKey(objectKey);
  return `/api/storage/object?file=${encodeURIComponent(objectKey)}&s=${sig}`;
}
