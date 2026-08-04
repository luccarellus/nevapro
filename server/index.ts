import './instrument';
import * as Sentry from '@sentry/node';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import * as dotenv from 'dotenv';
import multer from 'multer';

dotenv.config({ quiet: true });



import { validateEnv } from './utils/env';
import { log } from './utils/logger';
import { isB2LogStorageConfigured, storeB2Log } from './services/b2LogStorage';
import { flushLogContext, runWithLogContext } from './services/logContext';
import { csrfProtection, isAllowedOrigin } from './middleware/csrf';
import { rateLimiter } from './middleware/rateLimiter';
import { verifyRecaptcha } from './middleware/recaptcha';
import { requireAuth } from './middleware/auth';
import pool from '../src/lib/db';
import { getSupabaseAdminClient, dbAdmin } from './lib/dbQueryBuilder';
import { query } from '../src/lib/db';
import { sanitizeInput } from './utils/sanitize';
import { getUserCache, invalidateUserCache, setUserCache, userCacheKeys } from './services/userCache';

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


// Validate critical environment variables before starting
validateEnv();

export const app = express();

// Trust proxy (for rate limiting behind nginx / Vercel)
app.set('trust proxy', 1);
app.disable('etag');

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

    log.info(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-CSRF-Token');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ===== Anti-caching for API =====
app.use('/api', (req, res, next) => {
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

// ===== Image Proxy =====
app.get('/api/imagem', async (req, res) => {
  const imageUrl = req.query.url as string;
  if (!imageUrl) {
    res.status(400).send('URL missing');
    return;
  }
  try {
    const parsedUrl = new URL(imageUrl);
    const hostname = parsedUrl.hostname.toLowerCase();
    const allowedHostsEnv = process.env.ALLOWED_IMAGE_HOSTS || '';
    const extraHosts = allowedHostsEnv.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
    const isAllowedHost = hostname === 'enem.dev' || hostname === 'api.enem.dev' || extraHosts.includes(hostname);
    if (!isAllowedHost) {
      res.status(403).send('Acesso negado: domínio não permitido.');
      return;
    }
    const response = await fetch(imageUrl, {
      headers: { 'User-Agent': 'Mozilla', Referer: 'https://enem.dev/' },
      redirect: 'manual',
    });
    if (response.status >= 300 && response.status < 400) {
      res.status(403).send('Acesso negado: redirecionamentos não são permitidos.');
      return;
    }
    if (!response.ok) {
      res.status(response.status).send('Fetch error');
      return;
    }
    res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);
  } catch {
    res.status(500).send('Proxy error');
  }
});



// ===== Storage Proxy (B2) =====
app.get('/api/storage/object', requireAuth, async (req: any, res: any) => {
  const filePath = req.query.file as string;
  if (!filePath) {
    res.status(400).json({ error: 'Parâmetro file é obrigatório.' });
    return;
  }
  if (filePath.includes('..') || filePath.includes('\\\\') || filePath.startsWith('/')) {
    res.status(400).json({ error: 'Caminho de arquivo inválido.' });
    return;
  }
  try {
    const bucketName = process.env.B2_BUCKET_NAME || 'neva-avatars';
    const { data, error } = await dbAdmin.storage.from(bucketName).getObject(filePath);
    if (error || !data) {
      log.error('[Storage] GetObject error:', error);
      res.status(500).json({ error: 'Erro ao buscar arquivo no Storage.' });
      return;
    }
    const { stream, contentType } = data;
    if (!stream) {
      res.status(404).json({ error: 'Arquivo não encontrado.' });
      return;
    }
    res.setHeader('Content-Type', contentType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    
    const { Readable } = await import('stream');
    if (stream instanceof Readable) {
      stream.pipe(res);
    } else {
      Readable.from(stream as any).pipe(res);
    }
  } catch (error: unknown) {
    log.error('[Storage] Error:', error);
    res.status(500).json({ error: 'Erro ao servir arquivo.' });
  }
});

// ===== Errors Book =====
app.get('/api/user/errors', requireAuth, async (req, res) => {
  const email = ((req.query.email as string) || req.user?.email || '').toLowerCase().trim();
  if (req.user?.role !== 'admin' && req.user?.email !== email) {
    res.status(403).json({ error: 'Acesso negado: permissões insuficientes.' });
    return;
  }
  try {
    const errorsCacheKey = userCacheKeys.errors(email);
    const cachedErrors = await getUserCache<unknown[]>(errorsCacheKey);
    if (cachedErrors) {
      res.json(cachedErrors);
      return;
    }
    const userRes = await query('SELECT id FROM public.users WHERE email = $1 LIMIT 1', [email]);
    if (userRes.rows.length === 0) {
      res.status(404).json({ error: 'Usuário não encontrado' });
      return;
    }
    const userId = userRes.rows[0].id;
    const errorsQuery = `
      WITH latest_answers AS (
        SELECT *, ROW_NUMBER() OVER(PARTITION BY question_id ORDER BY created_at DESC) as rn
        FROM public.answers WHERE user_id = $1
      )
      SELECT la.id as answer_id, la.selected_option_index, la.created_at as answered_at,
             q.id as question_id, q.subject, q.text as question_text, q.image_url,
             q.correct_option_index, q.explanation, q.difficulty, q.year, q.index
      FROM latest_answers la
      JOIN public.questions q ON la.question_id = q.id
      WHERE la.rn = 1 AND la.is_correct = false
      ORDER BY la.created_at DESC`;
    const errorsRes = await query(errorsQuery, [userId]);
    const result = [];
    if (errorsRes.rows.length > 0) {
      const questionIds = errorsRes.rows.map(r => r.question_id);
      const optsRes = await query(
        `SELECT question_id, text, image_url, letter FROM public.question_options WHERE question_id = ANY($1::varchar[]) ORDER BY letter ASC`,
        [questionIds],
      );
      const optionsByQuestion = new Map<string, { text: string; image_url: string | null }[]>();
      for (const opt of optsRes.rows) {
        if (!optionsByQuestion.has(opt.question_id)) {
          optionsByQuestion.set(opt.question_id, []);
        }
        optionsByQuestion.get(opt.question_id)!.push(opt);
      }
      for (const errRow of errorsRes.rows) {
        const opts = optionsByQuestion.get(errRow.question_id) || [];
        result.push({
          id: errRow.question_id, subject: errRow.subject, text: errRow.question_text,
          imageUrl: errRow.image_url, correctOptionIndex: errRow.correct_option_index,
          explanation: errRow.explanation, difficulty: errRow.difficulty, year: errRow.year, index: errRow.index,
          selectedOptionIndex: errRow.selected_option_index, answeredAt: errRow.answered_at,
          options: opts.map((o: any) => o.text), optionImages: opts.map((o: any) => o.image_url),
        });
      }
    }
    await setUserCache(errorsCacheKey, result, 180);
    res.json(result);
  } catch (err) {
    log.error('[GET /api/user/errors] Error:', err);
    res.status(500).json({ error: 'Erro ao buscar caderno de erros.' });
  }
});

// ===== LGPD Consent Log =====
app.post('/api/lgpd/consent-log', async (req, res) => {
  const { preferences, userAgent } = req.body;
  if (!preferences) {
    res.status(400).json({ error: 'Preferências de consentimento são obrigatórias.' });
    return;
  }
  try {
    // Mantém o registro de consentimento fora do banco relacional.
    const consentTypes = Object.entries(preferences)
      .filter(([, value]) => value === true)
      .map(([key]) => key)
      .slice(0, 20);
    await storeB2Log('consent', {
      consentTypes: consentTypes.length > 0 ? consentTypes : ['necessary_only'],
      ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
      userAgent: userAgent || req.headers['user-agent'] || '',
    });
    log.info('[LGPD] Consent preferences saved:', consentTypes);
    res.json({ success: true });
  } catch (err) {
    log.error('[LGPD] Failed to save consent:', err);
    res.status(500).json({ error: 'Erro ao registrar consentimento.' });
  }
});

// ===== Upload (Avatar) — definições multer =====
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req: any, file: any, cb: any) => {
    const extension = file.originalname.toLowerCase().split('.').pop() || '';
    const isMaterial = req.query.kind === 'material';
    const imageTypes: Record<string, string[]> = {
      jpg: ['image/jpeg'], jpeg: ['image/jpeg'], png: ['image/png'],
      gif: ['image/gif'], webp: ['image/webp'],
    };
    const materialTypes: Record<string, string[]> = {
      ...imageTypes, pdf: ['application/pdf'], mp4: ['video/mp4'], webm: ['video/webm'],
    };
    const allowedTypes = isMaterial ? materialTypes : imageTypes;
    if (allowedTypes[extension]?.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(isMaterial
        ? 'Formato não permitido. Envie PDF, JPG, PNG, GIF, WEBP, MP4 ou WEBM.'
        : 'Formato não permitido. Envie uma imagem JPG, PNG, GIF ou WEBP.'));
    }
  },
});

const receiveUpload = (req: any, res: any, next: any) => {
  upload.single('file')(req, res, (error: unknown) => {
    if (error) {
      const message = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
        ? 'O arquivo deve ter no máximo 5 MB.'
        : error instanceof Error ? error.message : 'Arquivo inválido.';
      res.status(400).json({ error: message });
      return;
    }
    next();
  });
};

app.post('/api/upload', rateLimiter(5, 60_000), requireAuth, receiveUpload, verifyRecaptcha(), async (req: any, res: any) => {
  try {
    if (!isB2LogStorageConfigured()) {
      log.error('[Upload] Backblaze B2 não configurada no ambiente de execução.');
      res.status(503).json({
        error: 'Armazenamento de arquivos indisponível. Verifique a configuração da Backblaze.',
      });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'Nenhum arquivo enviado.' });
      return;
    }
    if (req.query.kind !== 'material' && req.file.size > 2 * 1024 * 1024) {
      res.status(400).json({ error: 'A foto de perfil deve ter no máximo 2 MB.' });
      return;
    }
    const bucketName = process.env.B2_BUCKET_NAME || 'neva-avatars';
    const fileExt = req.file.originalname.split('.').pop() || 'jpg';
    const prefix = req.query.kind === 'material' ? 'materials' : 'avatars';
    const fileName = `${prefix}/${crypto.randomUUID()}.${fileExt.toLowerCase()}`;
    const { data, error } = await dbAdmin.storage.from(bucketName).upload(fileName, req.file.buffer, {
      contentType: req.file.mimetype,
    });
    if (error) throw error;
    res.json({ url: `/api/storage/object?file=${encodeURIComponent(fileName)}` });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Upload failed';
    log.error('[Upload] Error:', msg);
    res.status(500).json({ error: `Falha ao enviar arquivo: ${msg}` });
  }
});

// ===== Vite Dev Middleware (HMR) =====
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
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

// ===== Static Files (production only) =====
if (process.env.NODE_ENV === 'production') {
  const distPath = path.resolve('dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return;
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ===== Centralized Error Handler =====
Sentry.setupExpressErrorHandler(app);

app.use((err: any, req: any, res: any, _next: any) => {
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

  const server = app.listen(PORT, '0.0.0.0', () => {
    log.info(`[Server] Running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    log.info(`[Server] Frontend: ${process.env.FRONTEND_URL || 'https://neva.pro'}`);
  });

  // Graceful shutdown
  const shutdown = (signal: string) => {
    log.info(`[Server] ${signal} recebido. Encerrando graciosamente...`);
    server.close(async () => {
      try {
        await pool.end();
        log.info('[Server] Pool do Postgres fechado. Processo encerrado.');
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
