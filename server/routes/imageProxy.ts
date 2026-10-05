/**
 * Image Proxy Routes — /api/imagem
 *
 * Proxy de imagens de enunciados (ENEM/EnemHub). O backend atua como cliente
 * confiável das fontes externas: segue redirects apenas dentro de uma
 * allow-list de hosts (anti-SSRF) e aplica limites de tamanho/tempo (anti-DoS).
 */

import { Router, Response } from 'express';
import { rateLimiter } from '../middleware/rateLimiter';
import { requireAuth } from '../middleware/auth';

const router = Router();

const IMAGE_PROXY_MAX_REDIRECTS = 5;
// Limites de defesa contra DoS/OOM: sem cap, um host allowlisted pode servir
// um arquivo gigante e a resposta inteira seria carregada em memória.
const IMAGE_PROXY_MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_PROXY_TIMEOUT_MS = 8_000;

const isAllowedImageHost = (hostname: string): boolean => {
  const h = hostname.toLowerCase();
  if (h === 'enem.dev' || h === 'api.enem.dev' || h === 'img.enemhub.com.br') return true;
  const extraHosts = (process.env.ALLOWED_IMAGE_HOSTS || '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  return extraHosts.includes(h);
};

const fetchImageWithRedirects = async (rawUrl: string, signal: AbortSignal) => {
  let currentUrl = rawUrl.trim();
  for (let hop = 0; hop <= IMAGE_PROXY_MAX_REDIRECTS; hop++) {
    const parsed = new URL(currentUrl);
    if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
        !isAllowedImageHost(parsed.hostname) ||
        (parsed.port !== '' && parsed.port !== '80' && parsed.port !== '443') ||
        parsed.username !== '' || parsed.password !== '') {
      throw new Error('Acesso negado: dominio nao permitido.');
    }
    const response = await fetch(parsed.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NevaApp/1.0)', Referer: 'https://enem.dev/' },
      redirect: 'manual',
      signal: AbortSignal.any([signal, AbortSignal.timeout(IMAGE_PROXY_TIMEOUT_MS)]),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('redirect sem location');
      await response.body?.cancel();
      // Header pode conter espacos e URLs relativas — resolve antes da proxima iteracao
      currentUrl = new URL(location.trim(), parsed).toString();
      continue;
    }
    return response;
  }
  throw new Error('limite de redirecionamentos excedido');
};

// Autenticado (cookie session_token ou Bearer) + limite 120/min —
// paridade com a rota Laravel (auth.custom + throttle.custom:120,60).
router.get('/', requireAuth, rateLimiter(120, 60_000), async (req, res: Response) => {
  const imageUrl = req.query.url as string;
  if (!imageUrl) {
    res.status(400).send('URL missing');
    return;
  }
  try {
    const controller = new AbortController();
    const response = await fetchImageWithRedirects(imageUrl, controller.signal);
    if (!response.ok) {
      await response.body?.cancel();
      res.status(response.status).send('Fetch error');
      return;
    }
    // Só serve conteúdo de imagem de verdade
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('image/')) {
      await response.body?.cancel();
      res.status(415).send('Unsupported media type');
      return;
    }
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > IMAGE_PROXY_MAX_BYTES) {
      controller.abort();
      await response.body?.cancel();
      res.status(413).send('Image too large');
      return;
    }
    if (!response.body) {
      res.status(502).send('Empty image response');
      return;
    }
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > IMAGE_PROXY_MAX_BYTES) {
        controller.abort();
        await reader.cancel();
        res.status(413).send('Image too large');
        return;
      }
      chunks.push(Buffer.from(value));
    }
    const buffer = Buffer.concat(chunks, received);
    res.setHeader('Content-Length', String(received));
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message.indexOf('Acesso negado') >= 0 || message.indexOf('protocolo') >= 0) {
      res.status(403).send(message);
      return;
    }
    res.status(504).send('Proxy error');
  }
});

export default router;
