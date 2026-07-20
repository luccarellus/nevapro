import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { rateLimiter } from '../middleware/rateLimiter';
import { requireAuth } from '../middleware/auth';
import { getSupabaseAdminClient } from '../lib/dbQueryBuilder';
import { normalizeEmail } from '../utils/sanitize';
import { log } from '../utils/logger';
import { cacheInvalidate } from '../services/cache';
import { CACHE_KEYS } from '../types';
import { resolveStoredFileUrl } from '../utils/storageUrl';
import { getUserCache, invalidateUserCache, setUserCache, userCacheKeys } from '../services/userCache';

const router = Router();

// ============= GET PROFILE =============
router.get('/profile', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  let email = (req.query.email as string) || req.user?.email || '';
  const cleanEmail = normalizeEmail(email);

  if (req.user?.role !== 'admin' && req.user?.email !== cleanEmail) {
    res.status(403).json({ error: 'Acesso negado: permissões insuficientes.' });
    return;
  }

  try {
    const cachedProfile = await getUserCache<Record<string, unknown>>(userCacheKeys.profile(cleanEmail));
    if (cachedProfile) {
      res.json(cachedProfile);
      return;
    }
    // Check admin
    const { data: adminData } = await getSupabaseAdminClient()
      .from('admin_users')
      .select('*')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (adminData) {
      const profile = formatUserProfile(adminData, 'admin');
      await setUserCache(userCacheKeys.profile(cleanEmail), profile, 60);
      res.json(profile);
      return;
    }

    // Check student
    const { data, error } = await getSupabaseAdminClient()
      .from('users')
      .select('*')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      res.status(404).json({ error: 'Usuário não encontrado' });
      return;
    }

    const profile = formatUserProfile(data, 'student');
    await setUserCache(userCacheKeys.profile(cleanEmail), profile, 60);
    res.json(profile);
  } catch (err) {
    log.error('[Profile] Error:', err);
    res.status(500).json({ error: 'Erro ao buscar perfil.' });
  }
});

// ============= UPDATE PROFILE =============
router.post(
  '/profile',
  rateLimiter(10, 60_000),
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const updateData = req.body;
    const email = normalizeEmail(updateData.email || '');
    if (!email) {
      res.status(400).json({ error: 'E-mail obrigatório' });
      return;
    }

    if (req.user?.role !== 'admin' && req.user?.email !== email) {
      res.status(403).json({ error: 'Acesso negado: permissões insuficientes.' });
      return;
    }

    // Mass assignment protection
    if (updateData.role !== undefined && req.user?.role !== 'admin') {
      delete updateData.role;
    }

    const { data: adminExists } = await getSupabaseAdminClient()
      .from('admin_users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    const isAdmin = !!adminExists;
    const targetTable = isAdmin ? 'admin_users' : 'users';

    // Field mapping (camelCase → snake_case)
    const fieldMapping: Record<string, string> = {
      name: 'name',
      city: 'city',
      school: 'school',
      gremio: 'gremio',
      showInLeaderboard: 'show_in_leaderboard',
      languagePreference: 'language_preference',
      avatarUrl: 'avatar_url',
      answeredQuestions: 'answered_questions',
      correctAnswers: 'correct_answers',
      streak: 'streak',
    };

    if (req.user?.role === 'admin') {
      fieldMapping.xp = 'xp';
      fieldMapping.level = 'level';
      fieldMapping.role = 'role';
    }

    const dbUpdate: Record<string, unknown> = { email };

    for (const [camelKey, snakeKey] of Object.entries(fieldMapping)) {
      if (updateData[camelKey] !== undefined) {
        dbUpdate[snakeKey] = updateData[camelKey];
      }
    }

    const isFlashQuizUpdate = !!updateData.isFlashQuizUpdate;

    // Fetch old user for XP diff calculation
    let xpDiff = 0;
    let userId: string | null = null;
    let oldXp = 0;

    try {
      const { data: oldUser } = await getSupabaseAdminClient()
        .from(targetTable)
        .select('id, xp')
        .eq('email', email)
        .maybeSingle();
      if (oldUser) {
        userId = oldUser.id;
        oldXp = oldUser.xp || 0;
        if (typeof dbUpdate.xp === 'number' && dbUpdate.xp > oldXp) {
          xpDiff = dbUpdate.xp - oldXp;
        }
      }
    } catch (e) {
      log.error('[Profile Update] Error fetching old user:', e);
    }

    // Flash quiz protection
    if (isFlashQuizUpdate && userId) {
      const { data: lastQuiz } = await getSupabaseAdminClient()
        .from('xp_logs')
        .select('created_at')
        .eq('user_id', userId)
        .eq('reason', 'Flash Quiz: Maranhão')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastQuiz) {
        const sixHours = 6 * 60 * 60 * 1000;
        if (Date.now() - new Date(lastQuiz.created_at).getTime() < sixHours) {
          log.info(`[Flash Quiz] Blocked duplicate XP for ${email}`);
          dbUpdate.xp = oldXp;
          xpDiff = 0;
        } else {
          dbUpdate.flash_quiz_completed = true;
        }
      } else {
        dbUpdate.flash_quiz_completed = true;
      }
    }

    try {
      const { data, error } = await getSupabaseAdminClient()
        .from(targetTable)
        .update(dbUpdate)
        .eq('email', email)
        .select()
        .single();

      if (error && error.code === 'PGRST116') {
        // Row not found — try insert
        const { data: insData } = await getSupabaseAdminClient()
          .from(targetTable)
          .insert([{ ...dbUpdate, id: crypto.randomUUID(), created_at: new Date().toISOString() }])
          .select()
          .single();

        if (insData) {
          await cacheInvalidate(CACHE_KEYS.LEADERBOARD, CACHE_KEYS.ADMIN_USERS);
          await invalidateUserCache(email, insData.id);
          res.json({ success: true, user: formatUserProfile(insData, isAdmin ? 'admin' : 'student') });
          return;
        }
      }

      if (error) throw error;

      // XP log entry
      if (userId && xpDiff > 0) {
        const reason = updateData.xpReason || (isFlashQuizUpdate ? 'Flash Quiz: Maranhão' : 'Conclusão de Simulado / Atividade');
        await getSupabaseAdminClient()
          .from('xp_logs')
          .insert([{ user_id: userId, amount: xpDiff, reason, created_at: new Date().toISOString() }]);
      }

      await cacheInvalidate(CACHE_KEYS.LEADERBOARD, CACHE_KEYS.ADMIN_USERS);
      await invalidateUserCache(email, userId || undefined);
      res.json({ success: true, user: formatUserProfile(data, isAdmin ? 'admin' : 'student') });
    } catch (err: unknown) {
      log.error('[Profile Update] Error:', err);
      res.status(500).json({ error: 'Erro ao salvar.' });
    }
  },
);

// ============= DELETE PROFILE =============
router.delete('/profile', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const email = normalizeEmail(((req.query.email as string) || req.body?.email || ''));
  if (!email) {
    res.status(400).json({ error: 'E-mail é obrigatório.' });
    return;
  }

  if (req.user?.role !== 'admin' && req.user?.email !== email) {
    res.status(403).json({ error: 'Acesso negado: permissões insuficientes.' });
    return;
  }

  try {
    const supabase = getSupabaseAdminClient();

    // Clean up student data
    const { data: userData } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
    if (userData?.id) {
      const userId = userData.id;
      await supabase.from('xp_logs').delete().eq('user_id', userId);
      await supabase.from('answers').delete().eq('user_id', userId);
      await supabase.from('notifications').delete().eq('user_id', userId);
      await supabase.from('users').delete().eq('email', email);
    }

    // Clean up admin data
    const { rows: adminRows } = await import('../../src/lib/db').then((m) =>
      m.query('SELECT auth_user_id FROM public.admin_users WHERE email = $1 LIMIT 1', [email]),
    );
    const authUserId = adminRows[0]?.auth_user_id;
    await supabase.from('admin_users').delete().eq('email', email);

    // Delete from Supabase Auth
    if (authUserId) {
      await supabase.auth.admin.deleteUser(authUserId);
    }

    await cacheInvalidate(CACHE_KEYS.LEADERBOARD, CACHE_KEYS.ADMIN_USERS);
    await invalidateUserCache(email, userData?.id);
    res.json({ success: true });
  } catch (err) {
    log.error('[DELETE /api/user/profile] Error:', err);
    res.status(500).json({ error: 'Erro ao remover perfil.' });
  }
});

// ============= USER STATS =============
router.get('/stats', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  let email = normalizeEmail((req.query.email as string) || req.user?.email || '');

  if (req.user?.role !== 'admin' && req.user?.email !== email) {
    res.status(403).json({ error: 'Acesso negado: permissões insuficientes.' });
    return;
  }

  try {
    const cachedStats = await getUserCache<Record<string, unknown>>(userCacheKeys.stats(email));
    if (cachedStats) {
      res.json(cachedStats);
      return;
    }
    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
    if (!user) {
      res.json({ weekly: [], summary: { average: 0, best: 0, total: 0 } });
      return;
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: logs } = await supabase
      .from('xp_logs')
      .select('*')
      .eq('user_id', user.id)
      .gte('created_at', sevenDaysAgo.toISOString());

    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const weeklyMap: Record<string, { day: string; xp: number; fullDate: string }> = {};

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayName = days[d.getDay()];
      weeklyMap[dayName] = { day: dayName, xp: 0, fullDate: d.toISOString().split('T')[0] };
    }

    if (logs) {
      for (const logEntry of logs) {
        const date = new Date(logEntry.created_at);
        const dayName = days[date.getDay()];
        if (weeklyMap[dayName]) {
          weeklyMap[dayName].xp += logEntry.amount;
        }
      }
    }

    const weekly = Object.values(weeklyMap);
    const xps = weekly.map((w) => w.xp);
    const total = xps.reduce((a, b) => a + b, 0);
    const best = Math.max(...xps, 0);
    const average = Math.round(total / 7);

    // Check flash quiz status
    const { data: lastQuizLog } = await supabase
      .from('xp_logs')
      .select('created_at')
      .eq('user_id', user.id)
      .eq('reason', 'Flash Quiz: Maranhão')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let quizDone = false;
    let secondsRemaining = 0;

    if (lastQuizLog) {
      const lastQuizTime = new Date(lastQuizLog.created_at).getTime();
      const sixHours = 6 * 60 * 60 * 1000;
      if (Date.now() - lastQuizTime < sixHours) {
        quizDone = true;
        secondsRemaining = Math.max(0, Math.ceil((lastQuizTime + sixHours - Date.now()) / 1000));
      }
    }

    const stats = { weekly, summary: { average, best, total }, flashQuizCompleted: quizDone, quizSecondsRemaining: secondsRemaining };
    await setUserCache(userCacheKeys.stats(email), stats, 60);
    res.json(stats);
  } catch (err) {
    log.error('[Stats] Error:', err);
    res.status(500).json({ error: 'Erro ao processar estatísticas' });
  }
});

// Helper
function formatUserProfile(data: Record<string, unknown>, role: 'admin' | 'student') {
  return {
    ...data,
    id: data.id || crypto.randomUUID(),
    role,
    answeredQuestions: (data as any).answered_questions || (data as any).answeredQuestions || 0,
    correctAnswers: (data as any).correct_answers || (data as any).correctAnswers || 0,
    avatarUrl: resolveStoredFileUrl((data as any).avatar_url || (data as any).avatarUrl || (data as any).avatar),
    showInLeaderboard: (data as any).show_in_leaderboard !== false,
    languagePreference: (data as any).language_preference || 'ingles',
    flashQuizCompleted: !!(data as any).flash_quiz_completed,
  };
}

export default router;
