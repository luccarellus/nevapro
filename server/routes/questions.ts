import { Router, Response } from 'express';
import { log } from '../utils/logger';
import { cacheGet, cacheSet, cacheInvalidate } from '../services/cache';
import { requireAuth } from '../middleware/auth';
import { resolveTenant } from '../middleware/tenant';
import { requirePermission } from '../middleware/rbac';
import { rateLimiter } from '../middleware/rateLimiter';
import { query, getClient } from '../../src/lib/db';
import { AuthenticatedRequest } from '../types';
import { PERMISSIONS } from '../lib/permissions';
import { sanitizeRichText, sanitizePlainText } from '../utils/sanitizeHtml';

const router = Router();

const BASE_URL = 'https://api.enem.dev/v1';
const TENANT_QUESTIONS_PAGE_SIZE = 50;

/** Chaves de cache da listagem paginada de questões do tenant. */
function cacheKeysForTenant(tenantId: string | null): string[] {
  // Páginas 1..10 cobrem até 500 questões; a listagem tem TTL curto (60s),
  // então páginas mais antigas expiram naturalmente.
  return Array.from({ length: 10 }, (_, i) => `cache:questions:tenant:${tenantId || 'platform'}:${i + 1}`);
}

// ============= LIST TENANT CUSTOM QUESTIONS (paginado + cache) =============
router.get('/tenant', requireAuth, resolveTenant, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId;
    const pageRaw = parseInt(String(req.query.page || '1'), 10);
    const page = Number.isInteger(pageRaw) && pageRaw > 0 ? Math.min(pageRaw, 1000) : 1;
    const pageSize = TENANT_QUESTIONS_PAGE_SIZE;
    const cacheKey = `cache:questions:tenant:${tenantId || 'platform'}:${page}`;

    const cached = await cacheGet<unknown[]>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const { rows } = await query(
      `SELECT q.id, q.subject, q.text, q.image_url, q.correct_option_index,
              q.explanation, q.difficulty, q.xp_reward, q.year, q.tenant_id, q.created_at
       FROM public.questions q
       WHERE ($1::uuid IS NULL OR q.tenant_id = $1)
       ORDER BY q.created_at DESC
       LIMIT $2 OFFSET $3`,
      [tenantId || null, pageSize + 1, (page - 1) * pageSize],
    );

    // Um item extra indica que há próxima página (paginação sem COUNT(*)).
    const hasMore = rows.length > pageSize;
    const pageRows = hasMore ? rows.slice(0, pageSize) : rows;

    if (pageRows.length === 0) {
      res.json([]);
      return;
    }

    const questionIds = pageRows.map((r) => r.id);
    const { rows: optionsRows } = await query(
      `SELECT question_id, text, image_url, letter, is_correct
       FROM public.question_options
       WHERE question_id = ANY($1::varchar[])
       ORDER BY letter ASC`,
      [questionIds],
    );

    const optionsMap = new Map<string, { options: string[]; optionImages: (string | null)[] }>();
    for (const opt of optionsRows) {
      if (!optionsMap.has(opt.question_id)) {
        optionsMap.set(opt.question_id, { options: [], optionImages: [] });
      }
      const entry = optionsMap.get(opt.question_id)!;
      entry.options.push(opt.text);
      entry.optionImages.push(opt.image_url || null);
    }

    const result = pageRows.map((q) => {
      const opts = optionsMap.get(q.id) || { options: [], optionImages: [] };
      return {
        id: q.id,
        subject: q.subject,
        text: q.text,
        imageUrl: q.image_url,
        correctOptionIndex: q.correct_option_index,
        explanation: q.explanation,
        difficulty: q.difficulty,
        xpReward: q.xp_reward,
        year: q.year,
        tenantId: q.tenant_id,
        options: opts.options,
        optionImages: opts.optionImages,
      };
    });

    await cacheSet(cacheKey, result, 60);
    res.json(result);
  } catch (err) {
    log.error('[Questions Tenant List] Error:', err);
    res.status(500).json({ error: 'Erro ao buscar questões da instituição.' });
  }
});

// ============= CREATE TENANT QUESTION =============
router.post(
  '/',
  rateLimiter(10, 60_000),
  requireAuth,
  resolveTenant,
  requirePermission(PERMISSIONS.QUESTIONS_CREATE),
  async (req: AuthenticatedRequest, res: Response) => {
    const { subject, text, options, optionImages, correctOptionIndex, explanation, difficulty, xpReward, year, imageUrl } = req.body || {};

    if (!subject || !text || !Array.isArray(options) || options.length < 2 || options.length > 10) {
      res.status(400).json({ error: 'Dados da questão incompletos (assunto, enunciado e 2–10 opções são obrigatórios).' });
      return;
    }

    if (typeof correctOptionIndex !== 'number' || correctOptionIndex < 0 || correctOptionIndex >= options.length) {
      res.status(400).json({ error: 'Índice da alternativa correta inválido.' });
      return;
    }

    // Sanitização de rich-text: este conteúdo é renderizado com rehype-raw no
    // frontend — sem allowlist, a criação de questões seria vetor de XSS.
    const safeText = sanitizeRichText(text);
    const safeSubject = sanitizePlainText(subject, 120);
    const safeOptions = options.map((opt: unknown) => sanitizeRichText(opt, 2_000));
    const safeOptionImages = Array.isArray(optionImages)
      ? optionImages.slice(0, 10).map((img: unknown) => (typeof img === 'string' && img.trim() && img.length <= 2048 ? img.trim() : null))
      : [];
    const safeExplanation = sanitizeRichText(explanation || '', 10_000);
    const safeImageUrl = typeof imageUrl === 'string' && imageUrl.trim() && imageUrl.length <= 2048 ? imageUrl.trim() : null;

    if (!safeText || safeOptions.some((opt: string) => !opt)) {
      res.status(400).json({ error: 'Enunciado e alternativas não podem estar vazios após sanitização.' });
      return;
    }

    const client = await getClient();
    try {
      await client.query('BEGIN');
      const questionId = `custom-${crypto.randomUUID()}`;
      const tenantId = req.tenantId || null;

      await client.query(
        `INSERT INTO public.questions
          (id, subject, text, image_url, correct_option_index, explanation, difficulty, xp_reward, year, tenant_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
        [
          questionId,
          safeSubject || 'Geral',
          safeText,
          safeImageUrl,
          correctOptionIndex,
          safeExplanation,
          ['fácil', 'médio', 'difícil'].includes(String(difficulty || '').toLowerCase())
            ? String(difficulty).toLowerCase()
            : 'médio',
          typeof xpReward === 'number' && xpReward >= 0 && xpReward <= 1000 ? Math.round(xpReward) : 50,
          typeof year === 'number' && year >= 1990 && year <= 2100 ? Math.round(year) : new Date().getFullYear(),
          tenantId,
        ],
      );

      for (let idx = 0; idx < safeOptions.length; idx++) {
        const letter = String.fromCharCode(65 + idx);
        await client.query(
          `INSERT INTO public.question_options
            (id, question_id, text, image_url, letter, is_correct)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
          [
            questionId,
            safeOptions[idx],
            safeOptionImages[idx] || null,
            letter,
            idx === correctOptionIndex,
          ],
        );
      }

      await client.query('COMMIT');
      // Invalida o cache da listagem paginada do tenant
      await cacheInvalidate(...cacheKeysForTenant(tenantId));
      res.status(201).json({
        id: questionId,
        subject: safeSubject || 'Geral',
        text: safeText,
        correctOptionIndex,
        options: safeOptions,
        tenantId,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      log.error('[Questions Create] Error:', err);
      res.status(500).json({ error: 'Erro ao criar questão.' });
    } finally {
      client.release();
    }
  },
);

// ============= DELETE TENANT QUESTION =============
router.delete(
  '/:id',
  rateLimiter(10, 60_000),
  requireAuth,
  resolveTenant,
  requirePermission(PERMISSIONS.QUESTIONS_DELETE),
  async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    try {
      const isSuperAdmin = (req as any).rbacContext?.isSuperAdmin;
      const tenantId = req.tenantId;

      const deleteQuery = isSuperAdmin
        ? 'DELETE FROM public.questions WHERE id = $1 RETURNING id'
        : 'DELETE FROM public.questions WHERE id = $1 AND tenant_id = $2 RETURNING id';

      const params = isSuperAdmin ? [id] : [id, tenantId];
      const { rows } = await query(deleteQuery, params);

      if (rows.length === 0) {
        res.status(404).json({ error: 'Questão não encontrada ou não pertence a este tenant.' });
        return;
      }

      // Invalida o cache da listagem paginada do tenant
      await cacheInvalidate(...cacheKeysForTenant(isSuperAdmin ? null : tenantId || null));
      res.json({ success: true, id });
    } catch (err) {
      log.error('[Questions Delete] Error:', err);
      res.status(500).json({ error: 'Erro ao remover questão.' });
    }
  },
);

// Proxy para questões do ENEM (autenticado: o backend atua como cliente pago
// da API externa — não pode servir de proxy aberto)
router.get('/', requireAuth, async (req, res: Response) => {
  const { year, limit, offset } = req.query;

  if (!year) {
    res.status(400).json({ error: 'Year parameter is required' });
    return;
  }

  try {
    const cacheKey = `cache:questions:${year}:${limit || 50}:${offset || 0}`;
    const cached = await cacheGet<unknown>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }
    const apiUrl = `${BASE_URL}/exams/${year}/questions?limit=${limit || 50}&offset=${offset || 0}`;
    const response = await fetch(apiUrl, {
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      res.status(response.status).json({ error: `ENEM API error: ${response.statusText}` });
      return;
    }

    const data = await response.json();
    const payload = { questions: data.questions || data };
    await cacheSet(cacheKey, payload, 600);
    res.json(payload);
  } catch (err) {
    log.error('[Questions Proxy] Error:', err);
    res.status(500).json({ error: 'Failed to fetch questions from ENEM API' });
  }
});

// =============================================================
// ENEMHUB — 2a fonte de questoes (api.enemhub.com.br)
// Formato: statement HTML, subject {name, area},
// alternatives[] com isCorrect, gabarito explicito.
// =============================================================

const ENEMHUB_BASE = 'https://api.enemhub.com.br/v1/enem';

function getEnemHubKey(): string | null {
  const key = process.env.ENEMHUB_API_KEY;
  return key ? key : null;
}

// Subjects (disciplinas com subareas) — dado estatico, cache 1h (autenticado)
router.get('/enemhub/subjects', requireAuth, async (_req, res: Response) => {
  const key = getEnemHubKey();
  if (!key) {
    res.status(503).json({ error: 'EnemHub não configurada (ENEMHUB_API_KEY ausente).' });
    return;
  }
  try {
    const cacheKey = 'cache:enemhub:subjects';
    const cached = await cacheGet<unknown>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }
    const response = await fetch(ENEMHUB_BASE + '/subjects', {
      headers: { 'X-API-Key': key },
    });
    if (response.status === 429) {
      res.status(429).json({ error: 'EnemHub rate limit. Tente novamente em instantes.' });
      return;
    }
    if (!response.ok) {
      res.status(response.status).json({ error: 'EnemHub API error: ' + response.statusText });
      return;
    }
    const body = await response.json();
    const payload = { subjects: body.data || [] };
    await cacheSet(cacheKey, payload, 3600);
    res.json(payload);
  } catch (err) {
    log.error('[EnemHub Proxy] subjects error:', err);
    res.status(500).json({ error: 'Falha ao listar disciplinas da EnemHub.' });
  }
});

// Questoes por ano — cache 10min, retry unico em 429 (autenticado)
router.get('/enemhub', requireAuth, async (req, res: Response) => {
  const { year, limit, page } = req.query;

  const yearNum = parseInt(String(year || ''), 10);
  if (!yearNum || yearNum < 2009 || yearNum > 2025) {
    res.status(400).json({ error: 'Parâmetro year inválido (2009-2025).' });
    return;
  }
  const limitNum = Math.min(Math.max(parseInt(String(limit || '50'), 10) || 50, 1), 200);
  const pageNum = Math.max(parseInt(String(page || '1'), 10) || 1, 1);

  const key = getEnemHubKey();
  if (!key) {
    res.status(503).json({ error: 'EnemHub não configurada (ENEMHUB_API_KEY ausente).' });
    return;
  }

  try {
    const cacheKey = 'cache:enemhub:questions:' + yearNum + ':' + limitNum + ':' + pageNum;
    const cached = await cacheGet<unknown>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }
    const apiUrl = ENEMHUB_BASE + '/questions?year=' + yearNum + '&limit=' + limitNum + '&page=' + pageNum;
    let response = await fetch(apiUrl, { headers: { 'X-API-Key': key } });
    if (response.status === 429) {
      // Retry unico apos pausa curta (rate limit da EnemHub)
      await new Promise((r) => setTimeout(r, 2500));
      response = await fetch(apiUrl, { headers: { 'X-API-Key': key } });
    }
    if (!response.ok) {
      res.status(response.status).json({ error: 'EnemHub API error: ' + response.statusText });
      return;
    }
    const body = await response.json();
    const payload = { questions: body.data || [], meta: body.meta || null };
    await cacheSet(cacheKey, payload, 600);
    res.json(payload);
  } catch (err) {
    log.error('[EnemHub Proxy] questions error:', err);
    res.status(500).json({ error: 'Falha ao buscar questões da EnemHub.' });
  }
});

export default router;
