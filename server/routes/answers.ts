import { Router, Response } from 'express';
import { getClient, query } from '../../src/lib/db';
import { requireAuth } from '../middleware/auth';
import { resolveTenant } from '../middleware/tenant';
import { requirePermission } from '../middleware/rbac';
import { rateLimiter } from '../middleware/rateLimiter';
import { AuthenticatedRequest } from '../types';
import { log } from '../utils/logger';
import { invalidateUserCache } from '../services/userCache';
import { PERMISSIONS } from '../lib/permissions';
import { sanitizeRichText, sanitizePlainText } from '../utils/sanitizeHtml';

const MAX_OPTIONS = 10;

/** Normaliza uma string de imagem para URL absoluta válida ou null. */
function normalizeImageUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  return trimmed;
}

/**
 * Sanitiza o questionData enviado pelo cliente antes de persistir.
 *
 * O cliente controla esse payload e ele é renderizado com react-markdown +
 * rehype-raw (sem sanitização) — sem esta camada, qualquer usuário autenticado
 * consegue persistir HTML/JS malicioso executado no navegador de outros alunos.
 */
function sanitizeQuestionData(raw: Record<string, any> | undefined): Record<string, any> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const text = sanitizeRichText(raw.text);
  if (!text) return null; // sem enunciado válido, não persistimos a questão

  const correctIndexRaw = raw.correctOptionIndex;
  const correctOptionIndex =
    typeof correctIndexRaw === 'number' && Number.isInteger(correctIndexRaw) && correctIndexRaw >= 0
      ? Math.min(correctIndexRaw, MAX_OPTIONS - 1)
      : null;

  const options = Array.isArray(raw.options)
    ? raw.options.slice(0, MAX_OPTIONS).map((opt: unknown) => sanitizeRichText(opt, 2_000))
    : [];

  const optionImages = Array.isArray(raw.optionImages)
    ? raw.optionImages.slice(0, MAX_OPTIONS).map(normalizeImageUrl)
    : [];

  return {
    subject: sanitizePlainText(raw.subject, 120) || 'Geral',
    text,
    imageUrl: normalizeImageUrl(raw.imageUrl),
    correctOptionIndex,
    explanation: sanitizeRichText(raw.explanation, 10_000),
    difficulty: ['fácil', 'médio', 'difícil'].includes(String(raw.difficulty || '').toLowerCase())
      ? String(raw.difficulty).toLowerCase()
      : 'médio',
    xpReward: typeof raw.xpReward === 'number' && raw.xpReward >= 0 && raw.xpReward <= 1000 ? Math.round(raw.xpReward) : 50,
    year:
      typeof raw.year === 'number' && raw.year >= 1990 && raw.year <= 2100
        ? Math.round(raw.year)
        : new Date().getFullYear(),
    index: typeof raw.index === 'number' && Number.isInteger(raw.index) && raw.index >= 0 ? Math.min(raw.index, 1_000_000) : 0,
    options,
    optionImages,
  };
}

type AnswerInput = {
  userId: string;
  questionId: string;
  selectedOption: number | null;
  isCorrect: boolean;
  questionData?: Record<string, any>;
};

const router = Router();

router.post('/', rateLimiter(30, 60_000), requireAuth, resolveTenant, requirePermission(PERMISSIONS.QUESTIONS_ANSWER), async (req: AuthenticatedRequest, res: Response) => {
  const { userId, questionId, isCorrect, selectedOption, questionData } = req.body;
  // Política: respostas registradas apenas para a própria conta.
  if (req.user?.userId !== userId) {
    res.status(403).json({ error: 'Acesso negado.' });
    return;
  }
  try {
    const tenantId = req.tenantId || null;
    const safeQuestion = sanitizeQuestionData(questionData);
    const insertOptionPromises: Promise<unknown>[] = [];
    const qCheck = await query('SELECT 1 FROM public.questions WHERE id = $1 LIMIT 1', [questionId]);
    if (qCheck.rows.length === 0 && safeQuestion) {
      await query(
        `INSERT INTO public.questions (id, subject, text, image_url, correct_option_index, explanation, difficulty, xp_reward, year, index)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO NOTHING`,
        [questionId, safeQuestion.subject, safeQuestion.text, safeQuestion.imageUrl,
         safeQuestion.correctOptionIndex, safeQuestion.explanation, safeQuestion.difficulty,
         safeQuestion.xpReward, safeQuestion.year, safeQuestion.index],
      );
      safeQuestion.options.forEach((opt: string, idx: number) => {
        insertOptionPromises.push(
          query(
            `INSERT INTO public.question_options (id, question_id, text, image_url, letter, is_correct)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
            [questionId, opt, safeQuestion.optionImages[idx] || null, String.fromCharCode(65 + idx), idx === safeQuestion.correctOptionIndex],
          ),
        );
      });
      if (insertOptionPromises.length > 0) {
        await Promise.all(insertOptionPromises);
      }
    }
    await query(
      `INSERT INTO public.answers (id, user_id, question_id, selected_option_index, is_correct, tenant_id, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())`,
      [userId, questionId, selectedOption !== undefined ? selectedOption : null, isCorrect, tenantId],
    );
    await invalidateUserCache(req.user?.email || '', userId);
    res.json({ success: true });
  } catch (err) {
    log.error('[POST /api/answers] Error:', err);
    res.status(500).json({ error: 'Erro ao registrar resposta.' });
  }
});

router.post('/batch', rateLimiter(10, 60_000), requireAuth, resolveTenant, requirePermission(PERMISSIONS.QUESTIONS_ANSWER), async (req: AuthenticatedRequest, res: Response) => {
  const answers = req.body?.answers as AnswerInput[];
  if (!Array.isArray(answers) || answers.length === 0 || answers.length > 200) {
    res.status(400).json({ error: 'Envie entre 1 e 200 respostas.' });
    return;
  }
  const userId = answers[0]?.userId;
  if (!userId || answers.some((answer) => answer.userId !== userId || !answer.questionId)) {
    res.status(400).json({ error: 'Lote de respostas inválido.' });
    return;
  }
  // Política: respostas registradas apenas para a própria conta.
  if (req.user?.userId !== userId) {
    res.status(403).json({ error: 'Acesso negado.' });
    return;
  }

  type SafeEntry = { answer: AnswerInput; safe: NonNullable<ReturnType<typeof sanitizeQuestionData>> };
  const questions = answers
    .map((answer) => ({ answer, safe: sanitizeQuestionData(answer.questionData) }))
    .filter((entry): entry is SafeEntry => entry.safe !== null)
    .map(({ answer, safe }) => ({
      id: answer.questionId,
      subject: safe.subject,
      text: safe.text,
      image_url: safe.imageUrl,
      correct_option_index: safe.correctOptionIndex,
      explanation: safe.explanation,
      difficulty: safe.difficulty,
      xp_reward: safe.xpReward,
      year: safe.year,
      question_index: safe.index,
    }));
  const options = answers
    .map((answer) => ({ answer, safe: sanitizeQuestionData(answer.questionData) }))
    .filter((entry): entry is SafeEntry => entry.safe !== null)
    .flatMap(({ answer, safe }) =>
      safe.options.map((text: string, index: number) => ({
        question_id: answer.questionId,
        text,
        image_url: safe.optionImages[index] || null,
        letter: String.fromCharCode(65 + index),
        is_correct: index === safe.correctOptionIndex,
      })),
    );
  const answerRows = answers.map((answer) => ({
    user_id: answer.userId,
    question_id: answer.questionId,
    selected_option_index: answer.selectedOption ?? null,
    is_correct: Boolean(answer.isCorrect),
    tenant_id: req.tenantId || null,
  }));

  const client = await getClient();
  try {
    await client.query('BEGIN');
    if (questions.length > 0) {
      await client.query(
        `INSERT INTO public.questions
          (id, subject, text, image_url, correct_option_index, explanation, difficulty, xp_reward, year, index)
         SELECT id, subject, text, image_url, correct_option_index, explanation, difficulty, xp_reward, year, question_index
         FROM jsonb_to_recordset($1::jsonb) AS q(
           id varchar, subject varchar, text text, image_url text, correct_option_index integer,
           explanation text, difficulty varchar, xp_reward integer, year integer, question_index integer
         ) ON CONFLICT (id) DO NOTHING`,
        [JSON.stringify(questions)],
      );
    }
    if (options.length > 0) {
      await client.query(
        `INSERT INTO public.question_options (id, question_id, text, image_url, letter, is_correct)
         SELECT gen_random_uuid(), o.question_id, o.text, o.image_url, o.letter, o.is_correct
         FROM jsonb_to_recordset($1::jsonb) AS o(
           question_id varchar, text text, image_url text, letter varchar, is_correct boolean
         )
         WHERE NOT EXISTS (
           SELECT 1 FROM public.question_options existing
           WHERE existing.question_id = o.question_id AND existing.letter = o.letter
         )`,
        [JSON.stringify(options)],
      );
    }
    await client.query(
      `INSERT INTO public.answers (id, user_id, question_id, selected_option_index, is_correct, tenant_id, created_at)
       SELECT gen_random_uuid(), user_id, question_id, selected_option_index, is_correct, tenant_id, NOW()
       FROM jsonb_to_recordset($1::jsonb) AS a(
         user_id uuid, question_id varchar, selected_option_index integer, is_correct boolean, tenant_id uuid
       )`,
      [JSON.stringify(answerRows)],
    );
    await client.query('COMMIT');
    await invalidateUserCache(req.user?.email || '', userId);
    res.json({ success: true, count: answers.length });
  } catch (error) {
    await client.query('ROLLBACK');
    log.error('[POST /api/answers/batch] Error:', error);
    res.status(500).json({ error: 'Erro ao registrar respostas.' });
  } finally {
    client.release();
  }
});

export default router;
