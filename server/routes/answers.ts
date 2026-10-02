import { Router, Response } from 'express';
import { getClient } from '../../src/lib/db';
import { requireAuth } from '../middleware/auth';
import { resolveTenant } from '../middleware/tenant';
import { requirePermission } from '../middleware/rbac';
import { rateLimiter } from '../middleware/rateLimiter';
import { AuthenticatedRequest } from '../types';
import { log } from '../utils/logger';
import { invalidateUserCache } from '../services/userCache';
import { PERMISSIONS } from '../lib/permissions';

const MAX_OPTIONS = 10;

type AnswerInput = {
  userId: string;
  questionId: string;
  selectedOption: number;
};

function isAnswerInput(value: unknown): value is AnswerInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const answer = value as Record<string, unknown>;
  return typeof answer.userId === 'string' &&
    typeof answer.questionId === 'string' &&
    answer.questionId.trim().length > 0 &&
    answer.questionId.length <= 64 &&
    normalizeSelectedOption(answer.selectedOption) !== null;
}

/** Valida selectedOption como índice inteiro dentro dos limites. */
function normalizeSelectedOption(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= MAX_OPTIONS) {
    return null;
  }
  return value;
}

const router = Router();

router.post('/', rateLimiter(30, 60_000), requireAuth, resolveTenant, requirePermission(PERMISSIONS.QUESTIONS_ANSWER), async (req: AuthenticatedRequest, res: Response) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    res.status(400).json({ error: 'Corpo da requisição inválido.' });
    return;
  }
  const { userId, selectedOption } = req.body;
  const questionId = typeof req.body.questionId === 'string' ? req.body.questionId.trim() : '';
  if (!questionId || questionId.length > 64) {
    res.status(400).json({ error: 'questionId inválido.' });
    return;
  }
  if (typeof userId !== 'string') {
    res.status(400).json({ error: 'userId inválido.' });
    return;
  }
  // Política: respostas registradas apenas para a própria conta.
  if (req.user?.userId !== userId) {
    res.status(403).json({ error: 'Acesso negado.' });
    return;
  }
  const safeSelected = normalizeSelectedOption(selectedOption);
  if (safeSelected === null) {
    res.status(400).json({ error: 'selectedOption inválido.' });
    return;
  }
  let gradedAnswer: { is_correct: boolean; correct_option_index: number | null; explanation: string | null } | null = null;
  try {
    const tenantId = req.tenantId || null;
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const graded = await client.query(
        `SELECT qo.is_correct, q.correct_option_index, q.explanation
         FROM public.questions q
         LEFT JOIN public.question_options qo
           ON qo.question_id = q.id AND qo.letter = $2
         WHERE q.id = $1
         LIMIT 1`,
        [questionId, String.fromCharCode(65 + safeSelected)],
      );
      if (graded.rows.length === 0 || graded.rows[0].is_correct === null) {
        await client.query('ROLLBACK');
        res.status(422).json({ error: 'Questão indisponível para correção.' });
        return;
      }
      gradedAnswer = graded.rows[0];
      const isCorrect = Boolean(graded.rows[0].is_correct);
      await client.query(
        `INSERT INTO public.answers (id, user_id, question_id, selected_option_index, is_correct, tenant_id, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())`,
        [userId, questionId, safeSelected, isCorrect, tenantId],
      );
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }
    await invalidateUserCache(req.user?.email || '', userId);
    if (!gradedAnswer) throw new Error('Missing grading result after answer transaction.');
    res.json({
      success: true,
      isCorrect: gradedAnswer.is_correct,
      correctOptionIndex: gradedAnswer.correct_option_index,
      explanation: gradedAnswer.explanation,
    });
  } catch (err) {
    log.error('[POST /api/answers] Error:', err);
    res.status(500).json({ error: 'Erro ao registrar resposta.' });
  }
});

router.post('/batch', rateLimiter(10, 60_000), requireAuth, resolveTenant, requirePermission(PERMISSIONS.QUESTIONS_ANSWER), async (req: AuthenticatedRequest, res: Response) => {
  const rawAnswers: unknown = req.body?.answers;
  if (!Array.isArray(rawAnswers) || rawAnswers.length === 0 || rawAnswers.length > 200) {
    res.status(400).json({ error: 'Envie entre 1 e 200 respostas.' });
    return;
  }
  if (rawAnswers.some((answer) => !isAnswerInput(answer))) {
    res.status(400).json({ error: 'Lote de respostas inválido.' });
    return;
  }
  const answers = rawAnswers as AnswerInput[];
  const userId = answers[0]?.userId;
  if (!userId || answers.some((answer) => answer.userId !== userId)) {
    res.status(400).json({ error: 'Lote de respostas inválido.' });
    return;
  }
  // Política: respostas registradas apenas para a própria conta.
  if (req.user?.userId !== userId) {
    res.status(403).json({ error: 'Acesso negado.' });
    return;
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const questionIds = [...new Set(answers.map((answer) => answer.questionId))];
    const known = await client.query(
      'SELECT id, correct_option_index, explanation FROM public.questions WHERE id = ANY($1::varchar[])',
      [questionIds],
    );
    if (known.rows.length !== questionIds.length) {
      await client.query('ROLLBACK');
      res.status(422).json({ error: 'Uma ou mais questões estão indisponíveis para correção.' });
      return;
    }
    const correctIndexes = new Map<string, number | null>(
      known.rows.map((row) => [row.id, row.correct_option_index]),
    );

    const optionRows = await client.query(
      `SELECT question_id, letter, is_correct
       FROM public.question_options
       WHERE question_id = ANY($1::varchar[])`,
      [questionIds],
    );
    const correctness = new Map<string, Map<string, boolean>>();
    for (const row of optionRows.rows) {
      if (!correctness.has(row.question_id)) correctness.set(row.question_id, new Map());
      correctness.get(row.question_id)!.set(row.letter, Boolean(row.is_correct));
    }
    const hasUnknownOption = answers.some((answer) => {
      const letter = String.fromCharCode(65 + answer.selectedOption);
      return !correctness.get(answer.questionId)?.has(letter);
    });
    if (hasUnknownOption) {
      await client.query('ROLLBACK');
      res.status(422).json({ error: 'Uma ou mais alternativas não existem para as questões informadas.' });
      return;
    }
    const answerRows = answers.map((answer) => {
      const letter = String.fromCharCode(65 + answer.selectedOption);
      return {
        user_id: answer.userId,
        question_id: answer.questionId,
        selected_option_index: answer.selectedOption,
        is_correct: correctness.get(answer.questionId)?.get(letter) === true,
        tenant_id: req.tenantId || null,
      };
    });
    const results = answerRows.map((answer) => ({
      questionId: answer.question_id,
      selectedOption: answer.selected_option_index,
      isCorrect: answer.is_correct,
      correctOptionIndex: correctIndexes.get(answer.question_id) ?? null,
      explanation: known.rows.find((question) => question.id === answer.question_id)?.explanation ?? null,
    }));
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
    res.json({ success: true, count: answers.length, results });
  } catch (error) {
    await client.query('ROLLBACK');
    log.error('[POST /api/answers/batch] Error:', error);
    res.status(500).json({ error: 'Erro ao registrar respostas.' });
  } finally {
    client.release();
  }
});

export default router;
