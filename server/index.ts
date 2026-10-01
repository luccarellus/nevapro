import './instrument';
import * as Sentry from '@sentry/node';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config({ quiet: true });

import { validateEnv } from './utils/env';
import { log } from './utils/logger';
import { flushLogContext, runWithLogContext } from './services/logContext';
import { csrfProtection, isAllowedOrigin } from './middleware/csrf';
import { rateLimiter } from './middleware/rateLimiter';
import { HttpError } from './lib/asyncHandler';
import { responseMaskMiddleware } from './middleware/responseMask';
import pool from '../src/lib/db';
import { closeRedisClient, getRedisClient } from './services/redisClient';
import { ensurePlatformTenant } from './services/rbacService';

// Route imports
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import adminRoutes from './routes/admin';
import materialRoutes from './routes/materials';
import eventRoutes from './routes/events';
import muralRoutes from './routes/mural';
import notificationRoutes from './routes/notifications';
import leaderboardRoutes from './routes/leaderboard';
import questionRoutes from './routes/questions';
import healthRoutes from './routes/health';
import answerRoutes from './routes/answers';
import bootstrapRoutes from './routes/bootstrap';
import studyPlanRoutes from './routes/studyPlan';
import performanceRoutes from './routes/performance';
import cronRoutes from './routes/cron';
import clientLogRoutes from './routes/clientLogs';
import webhookRoutes from './routes/webhooks';
import tenantRoutes from './routes/tenants';
import imageProxyRoutes from './routes/imageProxy';
import lgpdRoutes from './routes/lgpd';
import uploadRoutes from './routes/uploads';
import errorsBookRoutes from './routes/errorsBook';
import { closeCacheInvalidationSubscriber, startCacheInvalidationSubscriber } from './services/cache';


// Validate critical environment variables before starting
validateEnv();

// Eagerly connect to Redis on boot
getRedisClient();

// Garante o tenant da plataforma no boot (non-blocking)
ensurePlatformTenant().catch((err) => {
  log.warn('[RBAC] Falha ao garantir tenant da plataforma (non-fatal):', err);
});

export const app = express();

// Trust proxy (for rate limiting behind nginx / Vercel)
app.set('trust proxy', 1);
app.disable('etag');
app.disable('x-powered-by');

// Gzip no hot path: JSON da API e estáticos saem comprimidos (nível 6, threshold 1KB)
app.use(compression({ level: 6, threshold: 1024, filter: (req, res) => {
  // Nunca comprimir SSE/streaming
  if (res.getHeader('Content-Type')?.toString().includes('text/event-stream')) return false;
  return compression.filter(req, res);
} }));

// Agrupa os logs de cada requisição e grava assincronamente após o término da resposta.
app.use((req, res, next) => {
  const startedAt = Date.now();
  runWithLogContext(() => {
    res.on('finish', () => {
      void flushLogContext({
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
        userId: req.user?.userId,
        role: req.user?.role,
        requestId: req.headers['x-request-id'],
      }).catch((error) => {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[Logger] Falha ao finalizar lote de logs:', error);
        }
      });
    });

    // Log HTTP apenas em dev/DEBUG: em produção cada linha virava 1 PUT no B2
    // (flush por request) — custo de rede/event-loop desnecessário no hot path.
    if (process.env.NODE_ENV !== 'production' || process.env.DEBUG === 'true') {
      log.info(`${req.method} ${req.path}`);
    }
    next();
  });
});

// ===== CORS =====
app.use((req, res, next) => {
  const requestOrigin = req.headers.origin;
  const defaultOrigin = process.env.FRONTEND_URL?.split(',')[0] || 'https://neva.pro';
  let allowedOrigin = defaultOrigin;

  if (requestOrigin && isAllowedOrigin(req, requestOrigin)) {
    allowedOrigin = requestOrigin;
  }

  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-CSRF-Token, X-Tenant-ID');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ===== Anti-caching for API (skip stable endpoints) =====
app.use('/api', (req, res, next) => {
  // Allow short cache for stable read-only data
  const stableEndpoints = ['/api/leaderboard', '/api/materials', '/api/questoes'];
  if (req.method === 'GET' && stableEndpoints.some(ep => req.path.startsWith(ep))) {
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    return next();
  }
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// ===== Security Middleware =====
app.use(cookieParser());
app.use(
  helmet({
    contentSecurityPolicy:
      process.env.NODE_ENV === 'production'
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'", "'unsafe-inline'", 'https://www.google.com/recaptcha/', 'https://recaptcha.google.com/recaptcha/'],
              styleSrc: ["'self'", "'unsafe-inline'"],
              frameSrc: ["'self'", 'https://www.google.com/recaptcha/', 'https://recaptcha.google.com/'],
              imgSrc: ["'self'", 'data:', 'https://api.enem.dev', 'https://enem.dev'],
              connectSrc: ["'self'", 'https://api.enem.dev'],
              fontSrc: ["'self'", 'data:'],
              objectSrc: ["'none'"],
              upgradeInsecureRequests: [],
            },
          }
        : false,
    crossOriginEmbedderPolicy: false,
  }),
);

// Body parsing
app.use(express.json({ limit: '1mb' }));

// ===== Mascaramento global de respostas (defense-in-depth) =====
// Redige recursivamente credenciais/tokens/hashes de TODA resposta JSON,
// em qualquer rota, mesmo que algum handler esqueça de remover o campo.
app.use(responseMaskMiddleware);

// ===== Rate Limiting (global) =====
app.use('/api', rateLimiter(300, 15 * 60 * 1000));

// ===== Webhooks (Server-to-server, bypasses CSRF) =====
app.use('/api/webhooks', webhookRoutes);

// ===== CSRF Protection =====
app.use('/api', csrfProtection);


// ===== API Routes =====
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/eventos', eventRoutes);
app.use('/api/recados', muralRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/questoes', questionRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/answers', answerRoutes);
app.use('/api/bootstrap', bootstrapRoutes);
app.use('/api/study-plans', studyPlanRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/cron', cronRoutes);
app.use('/api/client-logs', rateLimiter(30, 60_000), clientLogRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/user', errorsBookRoutes);
app.use('/api/imagem', imageProxyRoutes);
app.use('/api/lgpd', lgpdRoutes);
app.use('/api', uploadRoutes);


// ===== Frontend Serving (SPA & Static Files) =====
const distPath = path.resolve('dist');
const indexPath = path.join(distPath, 'index.html');

if (fs.existsSync(indexPath)) {
  // Assets com hash no filename: cache público imutável por 1 ano (revalidação zero)
  app.use('/assets', express.static(path.join(distPath, 'assets'), {
    immutable: true,
    maxAge: '365d',
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
  }));
  // HTML/raiz: sempre revalida (SPA updates instantâneos)
  app.use(express.static(distPath, { etag: true, lastModified: true, setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  } }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(indexPath);
  });
  log.info(`[Server] Serving static frontend from ${distPath}`);
} else if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  (async () => {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
      app.use(vite.middlewares);
      log.info('[Vite] Dev server middleware attached for HMR');
    } catch (err) {
      log.warn('[Vite] Dev middleware not available, running without HMR');
    }
  })();
}

// ===== API desconhecida: 404 JSON (sem expor a SPA nem detalhes internos) =====
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Recurso não encontrado.' });
});

// ===== Centralized Error Handler =====
Sentry.setupExpressErrorHandler(app);

app.use((err: any, _request: any, res: any, _next: any) => {
  // HttpError: erro de aplicação esperado — não polui o log de erros internos
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  log.error('[Unhandled Error]', err?.message || err);
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: 'JSON mal formatado no corpo da requisição.' });
    return;
  }
  if (err.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Erro ao interpretar JSON.' });
    return;
  }
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: status >= 500 ? 'Erro interno do servidor.' : (err.message || 'Erro ao processar requisição.'),
  });
});

// ===== Startup =====
const PORT = parseInt(process.env.PORT || '3000', 10);

export const startServer = () => {
  if (process.env.VERCEL) return;

  // Ativa o subscriber pub/sub que propaga invalidações de L1 entre instâncias
  startCacheInvalidationSubscriber();

  const server = app.listen(PORT, '0.0.0.0', () => {
    log.info(`[Server] Running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    log.info(`[Server] Frontend: ${process.env.FRONTEND_URL || 'https://neva.pro'}`);
  });
  // Atrás de nginx/proxy: mata keep-alive antes do proxy para evitar 502 intermitente
  server.keepAliveTimeout = 5_000;
  server.headersTimeout = 6_000;

  // Graceful shutdown
  const shutdown = (signal: string) => {
    log.info(`[Server] ${signal} recebido. Encerrando graciosamente...`);
    server.close(async () => {
      try {
        await Promise.allSettled([pool.end(), closeRedisClient(), closeCacheInvalidationSubscriber()]);
        log.info('[Server] Pool do Postgres e Redis encerrados. Processo finalizado.');
        process.exit(0);
      } catch (shutdownErr) {
        log.error('[Server] Erro ao fechar pool:', shutdownErr);
        process.exit(1);
      }
    });
    setTimeout(() => {
      log.error('[Server] Shutdown forçado após timeout.');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};
