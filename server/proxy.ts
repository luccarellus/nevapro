/**
 * Proxy simplificado para encaminhar requisições /api para o Laravel.
 *
 * Este módulo é usado apenas em desenvolvimento local.
 * Em produção, use Nginx ou o Dockerfile.
 */

import http from 'http';
import https from 'https';
import { Request, Response } from 'express';

// Headers hop-by-hop (RFC 7230 §6.1) não podem ser reencaminhados.
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

// Host interno do upstream não deve vazar para o cliente.
const RESPONSE_STRIP = new Set(['host']);

// Evita que uma requisição travada no Laravel pendure o dev server.
const PROXY_TIMEOUT_MS = 60_000;

export async function createProxyRequest(
  req: Request,
  res: Response,
  targetBase: string,
): Promise<void> {
  // req.originalUrl preserva o prefixo /api (req.path é reescrito pelo mount
  // do Express em '/api', o que resultaria em /health em vez de /api/health).
  const targetUrl = new URL(req.originalUrl, targetBase);

  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
    path: targetUrl.pathname + targetUrl.search,
    method: req.method,
    headers: {
      ...req.headers,
      host: targetUrl.host,
      // Laravel usa esses para rate limit por IP, geração de URLs e logs.
      'x-forwarded-for': req.headers['x-forwarded-for']
        ? `${req.headers['x-forwarded-for']}, ${req.socket.remoteAddress ?? 'unknown'}`
        : (req.socket.remoteAddress ?? 'unknown'),
      'x-forwarded-proto': 'http',
      'x-forwarded-host': req.headers.host ?? targetUrl.host,
    },
  } as const;

  const proxyReq = (targetUrl.protocol === 'https:' ? https : http).request(options, (proxyRes) => {
    // Repassa os headers do Laravel (Content-Type, Set-Cookie, Cache-Control, ...)
    for (const [key, value] of Object.entries(proxyRes.headers)) {
      if (value === undefined || HOP_BY_HOP.has(key.toLowerCase()) || RESPONSE_STRIP.has(key.toLowerCase())) continue;
      res.setHeader(key, value as string | string[]);
    }

    // CORS: só define se o Laravel não tiver definido.
    if (!res.getHeader('Access-Control-Allow-Origin')) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    res.statusCode = proxyRes.statusCode ?? 502;

    proxyRes.pipe(res);
  });

  let timedOut = false;
  proxyReq.setTimeout(PROXY_TIMEOUT_MS, () => {
    timedOut = true;
    proxyReq.destroy(new Error(`Timeout após ${PROXY_TIMEOUT_MS}ms aguardando o Laravel.`));
  });

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      console.error('[Proxy] Erro na requisição:', err.message);
      res.status(timedOut ? 504 : 502).json({
        error: timedOut ? 'Tempo esgotado aguardando o Laravel.' : 'Falha ao conectar com o backend.',
      });
    } else {
      res.end();
    }
  });

  // Se o cliente desistir (aborted), aborta também o request para o Laravel.
  res.on('close', () => {
    if (!res.writableEnded) proxyReq.destroy();
  });

  // Encaminha o body da requisição
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    req.pipe(proxyReq);
  } else {
    proxyReq.end();
  }
}
