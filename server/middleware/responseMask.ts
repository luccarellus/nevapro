/**
 * Response Masking Middleware — Camada global de proteção de respostas.
 *
 * Intercepta TODA resposta JSON do Express e redige recursivamente chaves
 * sensíveis (credenciais, tokens, hashes, segredos), em qualquer nível de
 * aninhamento. Funciona como rede de segurança (defense-in-depth): mesmo que
 * uma rota esqueça de remover um campo, ele nunca chega ao cliente.
 *
 * Chaves de ID (id, *_id, uuid) NÃO são redigidas: a UI depende delas para
 * operações legítimas; a proteção contra IDOR é feita por autz nas rotas.
 */

import { Response, NextFunction } from 'express';

/** Chaves que são sempre redigidas onde quer que apareçam. */
const SENSITIVE_KEYS = new Set<string>([
  // Credenciais e segredos
  'password',
  'password_hash',
  'passwordhash',
  'senha',
  'secret',
  'secret_key',
  'secretkey',
  'client_secret',
  'clientsecret',
  'api_key',
  'apikey',
  'access_key',
  'accesskey',
  'private_key',
  'privatekey',
  'webhook_secret',
  'cron_secret',
  'recaptcha_secret',
  'b2_application_key',
  // Tokens e sessões
  'token',
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'session_token',
  'sessiontoken',
  'reset_token',
  'resettoken',
  'id_token',
  'bearer',
  'authorization',
  'cookie',
  // Internos
  'password_reset_tokens',
  'hash',
]);

/** Sufixos que tornam uma chave sensível (ex.: db_password, jwt_secret). */
const SENSITIVE_KEY_SUFFIXES = ['_password', '_secret', '_token', '_key', '_hash', '_credential'];

/** Chaves que contêm "key"/"token"/"hash" mas NÃO são sensíveis. */
const SAFE_KEY_EXACT = new Set<string>([
  'key', // p.ex. chave de ordenação inofensiva
  'cache_key',
  'cachekey',
  'idempotency_key',
]);

const SAFE_KEY_SUFFIXES = ['_id', '_ids', '_uuid', '_count', '_total', '_name', '_code', '_type', '_url'];

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase();

  if (SENSITIVE_KEYS.has(k)) return true;
  if (SAFE_KEY_EXACT.has(k)) return false;

  // Sufixos seguros vencem (ex.: session_token_count não é sensível... mas
  // token_count sim seria; por isso checagem explícita de sufixos seguros antes).
  for (const safe of SAFE_KEY_SUFFIXES) {
    if (k.endsWith(safe)) return false;
  }

  for (const suffix of SENSITIVE_KEY_SUFFIXES) {
    if (k.endsWith(suffix)) return true;
  }

  // Formato de chave de API comum (sk-..., pk_live..., etc.)
  return false;
}

/**
 * Detecta strings que parecem hash bcrypt sem custo de regex no hot path:
 * hash bcrypt sempre começa com "$2" e tem 60 chars.
 */
function looksLikeBcryptHash(value: string): boolean {
  return value.length === 60 && value.charCodeAt(0) === 0x24 /* $ */ && value.charCodeAt(1) === 0x32 /* 2 */;
}

/**
 * Redige recursivamente o valor (mutação in-place) SEM o round-trip
 * JSON.parse(JSON.stringify()) da versão anterior — que custava 2 serializações
 * completas em TODA resposta JSON (hot path) e convertia Date/BigInt em string.
 * Objetos vindos de res.json() já são serializáveis; mutá-los aqui é seguro
 * porque ninguém os reutiliza após a resposta.
 */
function redact(value: unknown, depth = 0): unknown {
  // Proteção contra estruturas cílicas/profundas
  if (depth > 12) return '[Redacted: deep]';

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      value[i] = redact(value[i], depth + 1);
    }
    return value;
  }

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      if (isSensitiveKey(key)) {
        obj[key] = '[Redacted]';
      } else {
        obj[key] = redact(obj[key], depth + 1);
      }
    }
    return obj;
  }

  // Strings que parecem hash bcrypt ($2a$/$2b$/$2y$) — redige em qualquer campo
  if (typeof value === 'string' && looksLikeBcryptHash(value)) {
    return '[Redacted]';
  }

  return value;
}

/**
 * Instala interceptação global de res.json().
 * Deve ser montado ANTES de todas as rotas.
 */
export function responseMaskMiddleware(_req: unknown, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);

  res.json = ((body?: unknown) => {
    try {
      if (body && typeof body === 'object') {
        return originalJson(redact(body));
      }
      return originalJson(body);
    } catch {
      return originalJson(body);
    }
  }) as typeof res.json;

  next();
}
