/**
 * Errors Book Routes — /api/user/errors
 *
 * Caderno de erros do aluno: questões respondidas incorretamente (última
 * tentativa por questão), com cache curto por usuário.
 */

import { Router, Response } from 'express';
import { log } from '../utils/logger';
import { requireAuth } from '../middleware/auth';
import { requireOwnership } from '../middleware/ownership';
import { query } from '../../src/lib/db';
import { getUserCache, setUserCache, userCacheKeys } from '../services/userCache';

const router = Router();

router.get('/errors', requireAuth, requireOwnership, async (req, res: Response) => {
  const email = ((req.query.email as string) || req.user?.email || '').toLowerCase().trim();
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

export default router;
