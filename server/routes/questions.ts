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
const MAX_OPTIONS = 10;
const ENEM_MAX_LIMIT = 200;
const ENEM_MAX_OFFSET = 100_000;

type ExternalAlternative = Record<string, unknown> & { text?: string; letter?: string };
type ExternalQuestion = Record<string, unknown> & {
  alternatives?: ExternalAlternative[];
  correctAlternative?: string;
};

function hideAnswerKey(question: ExternalQuestion): ExternalQuestion {
  const { correctAlternative: _correctAlternative, correctOptionIndex: _correctIndex,
    correct_option_index: _correctOptionIndex, answer: _answer, gabarito: _gabarito,
    explanation: _explanation, ...safeQuestion } = question;
  return {
    ...safeQuestion,
    alternatives: question.alternatives?.map(({ isCorrect: _isCorrect, is_correct: _is_correct,
      correct: _correct, ...alternative }) => alternative),
  };
}

function externalQuestionId(question: ExternalQuestion, source: 'enem' | 'enemhub', year: number): string {
  if (source === 'enemhub') {
    const suffix = typeof question.externalId === 'string' && question.externalId
      ? question.externalId
      : typeof question.id === 'string' ? question.id.slice(0, 8) : '';
    return `ehub-${year}-${suffix}`;
  }
  const discipline = typeof question.discipline === 'string' ? question.discipline : 'geral';
  const normalized = discipline.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return `${year}-${question.index}-${normalized}`;
}

async function persistExternalQuestions(
  questions: ExternalQuestion[],
  source: 'enem' | 'enemhub',
  year: number,
): Promise<void> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    for (const question of questions) {
      const alternatives = question.alternatives;
      if (!Array.isArray(alternatives) || alternatives.length < 2 || alternatives.length > MAX_OPTIONS) {
        throw new Error('External question has an invalid alternatives list.');
      }
      const id = externalQuestionId(question, source, year);
      const subject = source === 'enem'
        ? (typeof question.discipline === 'string' ? question.discipline : 'Geral')
        : (typeof question.subject === 'object' && question.subject !== null &&
            typeof (question.subject as Record<string, unknown>).name === 'string'
            ? (question.subject as Record<string, string>).name : 'Geral');
      const text = source === 'enem'
        ? `${typeof question.context === 'string' ? question.context : ''}\n\n${typeof question.alternativesIntroduction === 'string' ? question.alternativesIntroduction : ''}`.trim()
        : typeof question.statement === 'string' ? question.statement : '';
      if (!id || id.length > 64 || !text) {
        throw new Error('External question has invalid identifying or text fields.');
      }

      const correctIndexes = alternatives.flatMap((alternative, index) => {
        const isCorrect = alternative.isCorrect === true || alternative.letter === question.correctAlternative;
        return isCorrect ? [index] : [];
      });
      if (correctIndexes.length !== 1) {
        throw new Error('External question has no unique, verifiable correct alternative.');
      }
      const correctIndex = correctIndexes[0];
      const inserted = await client.query(
        `INSERT INTO public.questions
          (id, subject, text, image_url, correct_option_index, explanation, difficulty, xp_reward, year, index, tenant_id, created_at)
         VALUES ($1, $2, $3, $4, $5, '', $6, 15, $7, $8, NULL, NOW())
         ON CONFLICT (id) DO NOTHING
         RETURNING id`,
        [
          id,
          subject.slice(0, 255),
          text,
          source === 'enem' && Array.isArray(question.files) && typeof question.files[0] === 'string'
            ? question.files[0] : null,
          correctIndex,
          source === 'enemhub' && ['fácil', 'médio', 'difícil'].includes(String(question.difficulty))
            ? question.difficulty : 'médio',
          year,
          source === 'enem' && Number.isInteger(question.index) ? question.index : null,
        ],
      );
      if (inserted.rowCount === 0) continue;

      for (const [index, alternative] of alternatives.entries()) {
        if (typeof alternative.text !== 'string') {
          throw new Error('External question has an invalid alternative text.');
        }
        const image = source === 'enem' ? alternative.file : alternative.image;
        await client.query(
          `INSERT INTO public.question_options
            (id, question_id, text, image_url, letter, is_correct)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
          [id, alternative.text, typeof image === 'string' ? image : null, String.fromCharCode(65 + index), index === correctIndex],
        );
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

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
    // Fail-closed: sem tenant resolvido, NUNCA listar de todos os tenants.
    if (!tenantId) {
      res.status(403).json({ error: 'Tenant não resolvido para o usuário.' });
      return;
    }
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
       WHERE q.tenant_id = $1
       ORDER BY q.created_at DESC
       LIMIT $2 OFFSET $3`,
      [tenantId, pageSize + 1, (page - 1) * pageSize],
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
        // Gabarito não é exposto em listagem: aluno poderia memorizar as
        // respostas via API antes de responder. A correção é feita no servidor.
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

  // Validação estrita: os valores são interpolados na URL upstream e na chave
  // de cache — sem isso, path manipulation e poluição de cache são possíveis.
  const yr = parseInt(String(year), 10);
  const lim = parseInt(String(limit ?? '50'), 10);
  const off = parseInt(String(offset ?? '0'), 10);
  if (!Number.isInteger(yr) || yr < 2009 || yr > 2100) {
    res.status(400).json({ error: 'Year parameter must be a valid exam year' });
    return;
  }
  if (!Number.isInteger(lim) || lim < 1 || lim > 200) {
    res.status(400).json({ error: 'Limit parameter must be between 1 and 200' });
    return;
  }
  if (!Number.isInteger(off) || off < 0 || off > ENEM_MAX_OFFSET) {
    res.status(400).json({ error: `Offset parameter must be between 0 and ${ENEM_MAX_OFFSET}` });
    return;
  }

  try {
    const cacheKey = `cache:questions:v2:${yr}:${lim}:${off}`;
    const cached = await cacheGet<unknown>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }
    const apiUrl = `${BASE_URL}/exams/${yr}/questions?limit=${lim}&offset=${off}`;
    const response = await fetch(apiUrl, {
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      res.status(response.status).json({ error: `ENEM API error: ${response.statusText}` });
      return;
    }

    const data = await response.json() as { questions?: unknown };
    const questions = Array.isArray(data.questions) ? data.questions : null;
    if (!questions || questions.some((question) => !question || typeof question !== 'object' || Array.isArray(question))) {
      res.status(502).json({ error: 'Invalid response from ENEM API' });
      return;
    }
    const externalQuestions = questions as ExternalQuestion[];
    await persistExternalQuestions(externalQuestions, 'enem', yr);
    const payload = { questions: externalQuestions.map(hideAnswerKey) };
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
  const limitNum = Number(limit ?? 50);
  const pageNum = Number(page ?? 1);
  if (!Number.isInteger(limitNum) || limitNum < 1 || limitNum > ENEM_MAX_LIMIT ||
      !Number.isInteger(pageNum) || pageNum < 1 || pageNum > Math.floor(ENEM_MAX_OFFSET / ENEM_MAX_LIMIT)) {
    res.status(400).json({ error: 'Limit or page parameter is invalid' });
    return;
  }

  const key = getEnemHubKey();
  if (!key) {
    res.status(503).json({ error: 'EnemHub não configurada (ENEMHUB_API_KEY ausente).' });
    return;
  }

  try {
    const cacheKey = 'cache:enemhub:questions:v2:' + yearNum + ':' + limitNum + ':' + pageNum;
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
    const body = await response.json() as { data?: unknown; meta?: unknown };
    const questions = Array.isArray(body.data) ? body.data : null;
    if (!questions || questions.some((question) => !question || typeof question !== 'object' || Array.isArray(question))) {
      res.status(502).json({ error: 'Invalid response from EnemHub API' });
      return;
    }
    const externalQuestions = questions as ExternalQuestion[];
    await persistExternalQuestions(externalQuestions, 'enemhub', yearNum);
    const payload = { questions: externalQuestions.map(hideAnswerKey), meta: body.meta || null };
    await cacheSet(cacheKey, payload, 600);
    res.json(payload);
  } catch (err) {
    log.error('[EnemHub Proxy] questions error:', err);
    res.status(500).json({ error: 'Falha ao buscar questões da EnemHub.' });
  }
});

export default router;
