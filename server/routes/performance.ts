import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { requireAuth } from '../middleware/auth';
import { resolveTenant } from '../middleware/tenant';
import { requirePermission } from '../middleware/rbac';
import { rateLimiter } from '../middleware/rateLimiter';
import { dbAdmin } from '../lib/dbQueryBuilder';
import { log } from '../utils/logger';
import { normalizeEmail } from '../utils/sanitize';
import { query } from '../../src/lib/db';
import { calculateFullTri } from '../utils/triCalculator';
import { PERMISSIONS } from '../lib/permissions';

const router = Router();

// ============= GET TRI SCORE HISTORY =============
router.get(
  '/tri-scores',
  requireAuth,
  resolveTenant,
  requirePermission(PERMISSIONS.ANALYTICS_OWN_PERFORMANCE, PERMISSIONS.ANALYTICS_TENANT_SUMMARY),
  async (req: AuthenticatedRequest, res: Response) => {
  const email = normalizeEmail((req.query.email as string) || req.user?.email || '');

  if (req.user?.role !== 'admin' && req.user?.email !== email) {
    res.status(403).json({ error: 'Acesso negado: permissões insuficientes.' });
    return;
  }

  try {
    const { data: user } = await dbAdmin
      .from('users')
      .select('id, tri_target_score, xp, answered_questions, correct_answers')
      .eq('email', email)
      .maybeSingle();

    if (!user) {
      res.json({
        latest_score: null,
        history: [],
        tri_target: 750,
        stats: { hit_rate: 0, answered: 0 },
      });
      return;
    }

    // Fetch TRI score history
    const { data: scores } = await dbAdmin
      .from('user_tri_scores')
      .select('*')
      .eq('user_id', user.id)
      .order('calculated_at', { ascending: false })
      .limit(10);

    const latestScore = scores && scores.length > 0 ? scores[0] : null;

    // Calculate hit rate directly from question answers table for absolute accuracy
    let answered = user.answered_questions || 0;
    let correct = user.correct_answers || 0;

    try {
      const answerStatsRes = await query(
        `WITH latest_answers AS (
           SELECT DISTINCT ON (a.question_id) a.question_id, a.is_correct
           FROM public.answers a
           WHERE a.user_id = $1
           ORDER BY a.question_id, a.created_at DESC
         )
         SELECT 
           COUNT(*) as answered,
           SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct
         FROM latest_answers`,
        [user.id]
      );
      if (answerStatsRes.rows.length > 0 && parseInt(answerStatsRes.rows[0].answered, 10) > 0) {
        answered = parseInt(answerStatsRes.rows[0].answered, 10);
        correct = parseInt(answerStatsRes.rows[0].correct, 10);
      }
    } catch (dbErr) {
      log.warn('[Performance] Fallback to user stats:', dbErr);
    }

    const hitRate = answered > 0 ? Math.round((correct / answered) * 100) : 0;

    res.json({
      latest_score: latestScore ? {
        id: latestScore.id,
        estimated_score: latestScore.estimated_score,
        math_score: latestScore.math_score,
        nature_score: latestScore.nature_score,
        humanities_score: latestScore.humanities_score,
        languages_score: latestScore.languages_score,
        calculated_at: latestScore.calculated_at,
      } : null,
      history: (scores || []).map((s: any) => ({
        id: s.id,
        estimated_score: s.estimated_score,
        calculated_at: s.calculated_at,
      })),
      tri_target: user.tri_target_score || 750,
      stats: {
        hit_rate: hitRate,
        answered,
        correct,
        xp: user.xp || 0,
      },
    });
  } catch (err) {
    log.error('[Performance] Error fetching TRI scores:', err);
    res.status(500).json({ error: 'Erro ao buscar dados de desempenho.' });
  }
});

// ============= GET SUBJECT MASTERY =============
router.get(
  '/subject-mastery',
  requireAuth,
  resolveTenant,
  requirePermission(PERMISSIONS.ANALYTICS_OWN_PERFORMANCE, PERMISSIONS.ANALYTICS_TENANT_SUMMARY),
  async (req: AuthenticatedRequest, res: Response) => {
    const email = normalizeEmail((req.query.email as string) || req.user?.email || '');

    if (req.user?.role !== 'admin' && req.user?.email !== email) {
      res.status(403).json({ error: 'Acesso negado: permissões insuficientes.' });
      return;
    }

    try {
      const { data: user } = await dbAdmin
        .from('users')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (!user) {
        res.json({ subjects: [], evolution: [] });
        return;
      }

      // Get per-subject stats from answers joined with questions
      const subjectStatsQuery = `
        WITH latest_answers AS (
          SELECT DISTINCT ON (a.question_id) a.question_id, a.is_correct, a.created_at
          FROM public.answers a
          WHERE a.user_id = $1
          ORDER BY a.question_id, a.created_at DESC
        )
        SELECT
          q.subject,
          COUNT(*) AS total,
          SUM(CASE WHEN la.is_correct = true THEN 1 ELSE 0 END) AS correct
        FROM latest_answers la
        JOIN public.questions q ON la.question_id = q.id
        GROUP BY q.subject
        ORDER BY total DESC
      `;

      const subjectRes = await query(subjectStatsQuery, [user.id]);
      const subjects = subjectRes.rows.map((row: any) => {
        const total = parseInt(row.total, 10);
        const correct = parseInt(row.correct, 10);
        const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;

        let level: 'high' | 'medium' | 'critical';
        if (percentage >= 70) level = 'high';
        else if (percentage >= 50) level = 'medium';
        else level = 'critical';

        const subjectLower = (row.subject || '').toLowerCase();
        let category = 'Geral';
        if (subjectLower.includes('matem') || subjectLower.includes('tecno')) {
          category = 'Matemática e Suas Tecnologias';
        } else if (subjectLower.includes('natureza') || subjectLower.includes('biologia') || subjectLower.includes('fisica') || subjectLower.includes('quimica')) {
          category = 'Ciências da Natureza';
        } else if (subjectLower.includes('humana') || subjectLower.includes('historia') || subjectLower.includes('geografia') || subjectLower.includes('sociologia') || subjectLower.includes('filosofia')) {
          category = 'Ciências Humanas';
        } else if (subjectLower.includes('linguagen') || subjectLower.includes('portugues') || subjectLower.includes('codigo') || subjectLower.includes('ingles') || subjectLower.includes('english') || subjectLower.includes('espanhol') || subjectLower.includes('spanish')) {
          category = 'Linguagens e Códigos';
        }

        return { name: row.subject, category, percentage, level, total, correct };
      });

      // Get weekly accuracy evolution (last 30 days in 5-day buckets)
      const evolutionQuery = `
        WITH latest_answers AS (
          SELECT DISTINCT ON (a.question_id) a.question_id, a.is_correct, a.created_at
          FROM public.answers a
          WHERE a.user_id = $1 AND a.created_at >= NOW() - INTERVAL '30 days'
          ORDER BY a.question_id, a.created_at DESC
        ),
        day_stats AS (
          SELECT
            DATE(la.created_at) as day,
            COUNT(*) as total,
            SUM(CASE WHEN la.is_correct THEN 1 ELSE 0 END) as correct
          FROM latest_answers la
          GROUP BY DATE(la.created_at)
        )
        SELECT day, total, correct,
          ROUND((SUM(correct) OVER (ORDER BY day)::numeric / NULLIF(SUM(total) OVER (ORDER BY day), 0)) * 100, 1) as running_accuracy
        FROM day_stats
        ORDER BY day
      `;

      const evolutionRes = await query(evolutionQuery, [user.id]);

      const evolution = evolutionRes.rows.map((row: any, index: number) => ({
        label: index === evolutionRes.rows.length - 1 ? 'Hoje' : new Date(row.day).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
        precision: Math.round(parseFloat(row.running_accuracy) || 0),
        day: row.day,
      }));

      res.json({ subjects, evolution });
    } catch (err) {
      log.error('[Performance] Error fetching subject mastery:', err);
      res.status(500).json({ error: 'Erro ao buscar domínio por assunto.' });
    }
  },
);

// ============= CALCULATE TRI SCORE =============
router.post(
  '/calculate-tri',
  rateLimiter(5, 60_000),
  requireAuth,
  resolveTenant,
  requirePermission(PERMISSIONS.ANALYTICS_OWN_PERFORMANCE, PERMISSIONS.ANALYTICS_TENANT_SUMMARY),
  async (req: AuthenticatedRequest, res: Response) => {
    const email = normalizeEmail((req.query.email as string) || req.user?.email || '');

    if (req.user?.role !== 'admin' && req.user?.email !== email) {
      res.status(403).json({ error: 'Acesso negado: permissões insuficientes.' });
      return;
    }

    try {
      const { data: user } = await dbAdmin
        .from('users')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (!user) {
        res.status(404).json({ error: 'Usuário não encontrado.' });
        return;
      }

      const answersQuery = `
        WITH latest_answers AS (
          SELECT DISTINCT ON (a.question_id) a.question_id, a.is_correct, a.created_at
          FROM public.answers a
          WHERE a.user_id = $1
          ORDER BY a.question_id, a.created_at DESC
        )
        SELECT
          la.is_correct,
          la.created_at,
          q.difficulty,
          q.subject
        FROM latest_answers la
        JOIN public.questions q ON la.question_id = q.id
        ORDER BY la.created_at DESC
      `;

      const answersRes = await query(answersQuery, [user.id]);

      if (answersRes.rows.length < 3) {
        res.json({
          calculated: false,
          reason: 'Poucas questões respondidas. Responda pelo menos 3 para gerar uma estimativa TRI.',
          overall: null,
          by_subject: null,
          responses_total: answersRes.rows.length,
        });
        return;
      }

      const items = answersRes.rows.map((row: any) => ({
        isCorrect: Boolean(row.is_correct),
        difficulty: row.difficulty || 'médio',
        subject: row.subject || 'Geral',
      }));

      const result = calculateFullTri(items);

      const subjectNameMap: Record<string, string> = {
        mathematics: 'math_score',
        nature: 'nature_score',
        humanities: 'humanities_score',
        languages: 'languages_score',
      };

      const dbInsert: Record<string, any> = {
        user_id: user.id,
        tenant_id: req.tenantId || null,
        estimated_score: result.overall.estimated_score,
        calculated_at: new Date().toISOString(),
      };

      for (const [key, dbCol] of Object.entries(subjectNameMap)) {
        if (result.by_subject[key]) {
          dbInsert[dbCol] = result.by_subject[key].estimated_score;
        }
      }

      const { data: inserted, error: insertError } = await dbAdmin
        .from('user_tri_scores')
        .insert(dbInsert)
        .select('*')
        .single();

      if (insertError) throw insertError;

    res.json({
      calculated: true,
      overall: {
        id: inserted.id,
        estimated_score: inserted.estimated_score,
        theta: result.overall.theta,
        responses_used: result.overall.responses_used,
        calculated_at: inserted.calculated_at,
      },
      by_subject: {
        math_score: inserted.math_score,
        nature_score: inserted.nature_score,
        humanities_score: inserted.humanities_score,
        languages_score: inserted.languages_score,
      },
      responses_total: result.overall.responses_used,
    });
  } catch (err) {
    log.error('[Performance] Error calculating TRI:', err);
    res.status(500).json({ error: 'Erro ao calcular nota TRI.' });
  }
});

export default router;
