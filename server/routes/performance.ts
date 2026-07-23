import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { requireAuth } from '../middleware/auth';
import { getSupabaseAdminClient } from '../lib/dbQueryBuilder';
import { log } from '../utils/logger';
import { normalizeEmail } from '../utils/sanitize';
import { query } from '../../src/lib/db';

const router = Router();

// ============= GET TRI SCORE HISTORY =============
router.get('/tri-scores', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const email = normalizeEmail((req.query.email as string) || req.user?.email || '');

  if (req.user?.role !== 'admin' && req.user?.email !== email) {
    res.status(403).json({ error: 'Acesso negado: permissões insuficientes.' });
    return;
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
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
    const { data: scores } = await supabase
      .from('user_tri_scores')
      .select('*')
      .eq('user_id', user.id)
      .order('calculated_at', { ascending: false })
      .limit(10);

    const latestScore = scores && scores.length > 0 ? scores[0] : null;

    // Calculate hit rate from user stats
    const answered = user.answered_questions || 0;
    const correct = user.correct_answers || 0;
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
      history: (scores || []).map(s => ({
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
router.get('/subject-mastery', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const email = normalizeEmail((req.query.email as string) || req.user?.email || '');

  if (req.user?.role !== 'admin' && req.user?.email !== email) {
    res.status(403).json({ error: 'Acesso negado: permissões insuficientes.' });
    return;
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
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

      // Map ENEM subject names to categories
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

    // Format evolution data into labeled buckets
    const evolution = evolutionRes.rows.map((row: any, index: number) => ({
      label: index === evolutionRes.rows.length - 1 ? 'Hoje' : new Date(row.day).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
      precision: Math.round(parseFloat(row.running_accuracy) || 0),
      day: row.day,
    }));

    // If we have fewer than 2 points, add some synthetic starting points
    if (evolution.length < 2) {
      const hitRate = evolution.length === 1 ? evolution[0].precision : 50;
      evolution.unshift({
        label: 'Início',
        precision: Math.max(30, hitRate - 15),
        day: null,
      });
    }

    res.json({ subjects, evolution });
  } catch (err) {
    log.error('[Performance] Error fetching subject mastery:', err);
    res.status(500).json({ error: 'Erro ao buscar domínio por assunto.' });
  }
});

export default router;
