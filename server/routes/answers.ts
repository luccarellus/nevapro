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
  if (req.user?.role !== 'admin' && req.user?.userId !== userId) {
    res.status(403).json({ error: 'Acesso negado.' });
    return;
  }
  try {
    const tenantId = req.tenantId || null;
    const qCheck = await query('SELECT 1 FROM public.questions WHERE id = $1 LIMIT 1', [questionId]);
    if (qCheck.rows.length === 0 && questionData) {
      await query(
        `INSERT INTO public.questions (id, subject, text, image_url, correct_option_index, explanation, difficulty, xp_reward, year, index)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO NOTHING`,
        [questionId, questionData.subject || 'Geral', questionData.text, questionData.imageUrl || null,
         questionData.correctOptionIndex, questionData.explanation || '', questionData.difficulty || 'médio',
         questionData.xpReward || 50, questionData.year || 2023, questionData.index || 0],
      );
      if (Array.isArray(questionData.options)) {
        for (let idx = 0; idx < questionData.options.length; idx++) {
          const letter = String.fromCharCode(65 + idx);
          await query(
            `INSERT INTO public.question_options (id, question_id, text, image_url, letter, is_correct)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
            [questionId, questionData.options[idx], questionData.optionImages?.[idx] || null, letter, idx === questionData.correctOptionIndex],
          );
        }
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
  if (req.user?.role !== 'admin' && req.user?.userId !== userId) {
    res.status(403).json({ error: 'Acesso negado.' });
    return;
  }

  const questions = answers.filter((answer) => answer.questionData).map((answer) => ({
    id: answer.questionId,
    subject: answer.questionData?.subject || 'Geral',
    text: answer.questionData?.text || '',
    image_url: answer.questionData?.imageUrl || null,
    correct_option_index: answer.questionData?.correctOptionIndex ?? null,
    explanation: answer.questionData?.explanation || '',
    difficulty: answer.questionData?.difficulty || 'médio',
    xp_reward: answer.questionData?.xpReward || 50,
    year: answer.questionData?.year || 2023,
    question_index: answer.questionData?.index || 0,
  }));
  const options = answers.flatMap((answer) =>
    Array.isArray(answer.questionData?.options)
      ? answer.questionData.options.map((text: string, index: number) => ({
          question_id: answer.questionId,
          text,
          image_url: answer.questionData?.optionImages?.[index] || null,
          letter: String.fromCharCode(65 + index),
          is_correct: index === answer.questionData?.correctOptionIndex,
        }))
      : [],
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
