import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { rateLimiter } from '../middleware/rateLimiter';
import { requireAuth } from '../middleware/auth';
import { verifyRecaptcha } from '../middleware/recaptcha';
import { dbAdmin } from '../lib/dbQueryBuilder';
import { query } from '../../src/lib/db';
import { normalizeEmail } from '../utils/sanitize';
import { log } from '../utils/logger';
import { cacheInvalidate } from '../services/cache';
import { CACHE_KEYS } from '../types';
import { resolveStoredFileUrl } from '../utils/storageUrl';
import { getUserCache, invalidateUserCache, setUserCache, userCacheKeys } from '../services/userCache';
import { extractObjectKey } from '../utils/extractObjectKey';

const B2_BUCKET = process.env.B2_BUCKET_NAME || 'neva-avatars';

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
    const { data: adminData } = await dbAdmin
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
    const { data, error } = await dbAdmin
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
  verifyRecaptcha(),
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

    // Multi-Tenancy: apenas administradores podem alterar o tenant padrão do usuário
    if (updateData.tenant_id !== undefined && !req.user?.isAdmin) {
      delete updateData.tenant_id;
    }

    const { data: adminExists } = await dbAdmin
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
      xp: 'xp',
      level: 'level',
    };

    if (req.user?.role === 'admin') {
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
    let oldLevel = 1;

    try {
      const { data: oldUser } = await dbAdmin
        .from(targetTable)
        .select('id, xp, level')
        .eq('email', email)
        .maybeSingle();
      if (oldUser) {
        userId = oldUser.id;
        oldXp = oldUser.xp || 0;
        oldLevel = oldUser.level || 1;
        if (typeof dbUpdate.xp === 'number' && dbUpdate.xp > oldXp) {
          xpDiff = dbUpdate.xp - oldXp;
        }
      }
    } catch (e) {
      log.error('[Profile Update] Error fetching old user:', e);
    }

    // Flash quiz protection - atomic guard (eliminates TOCTOU race condition)
    if (isFlashQuizUpdate && userId) {
      const { rows: locked } = await query(
        `UPDATE ${targetTable}
         SET flash_quiz_completed = true
         WHERE id = $1
           AND (flash_quiz_completed IS NULL OR flash_quiz_completed = false)
         RETURNING id`,
        [userId],
      );

      if (locked.length === 0) {
        log.info(`[Flash Quiz] Atomic guard blocked duplicate XP for ${email}`);
        dbUpdate.xp = oldXp;
        dbUpdate.level = oldLevel;
        xpDiff = 0;
      }
      dbUpdate.flash_quiz_completed = true;
    }

    try {
      const { data, error } = await dbAdmin
        .from(targetTable)
        .update(dbUpdate)
        .eq('email', email)
        .select('*')
        .single();

      if (error && error.message === 'No rows found') {
        // Row not found — try insert
        const { data: insData } = await dbAdmin
          .from(targetTable)
          .insert({ ...dbUpdate, id: crypto.randomUUID(), created_at: new Date().toISOString() })
          .select('*')
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
        await dbAdmin
          .from('xp_logs')
          .insert({ user_id: userId, amount: xpDiff, reason, created_at: new Date().toISOString() });
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
router.delete('/profile', verifyRecaptcha(), requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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
    // Fetch avatar before deletion to clean up B2
    const { data: userData } = await dbAdmin.from('users').select('id, avatar_url').eq('email', email).maybeSingle();
    if (userData?.id) {
      const userId = userData.id;

      // Delete avatar from B2 if stored there
      const avatarUrl = (userData as any).avatar_url as string | undefined;
      if (avatarUrl) {
        const objectKey = extractObjectKey(avatarUrl);
        if (objectKey) {
          await dbAdmin.storage.from(B2_BUCKET).remove(objectKey).catch(() => {});
        }
      }

      await dbAdmin.from('xp_logs').delete().eq('user_id', userId);
      await dbAdmin.from('answers').delete().eq('user_id', userId);
      await dbAdmin.from('notifications').delete().eq('user_id', userId);
      await dbAdmin.from('users').delete().eq('email', email);
    }

    // Clean up admin data
    const { rows: adminRows } = await query(
      'SELECT id, avatar_url FROM public.admin_users WHERE email = $1 LIMIT 1',
      [email],
    );

    // Delete admin avatar from B2 if stored there
    const adminAvatarUrl = adminRows[0]?.avatar_url as string | undefined;
    if (adminAvatarUrl) {
      const objectKey = extractObjectKey(adminAvatarUrl);
      if (objectKey) {
        await dbAdmin.storage.from(B2_BUCKET).remove(objectKey).catch(() => {});
      }
    }

    await dbAdmin.from('admin_users').delete().eq('email', email);

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
    const { data: user } = await dbAdmin.from('users').select('id').eq('email', email).maybeSingle();
    if (!user) {
      res.json({ weekly: [], summary: { average: 0, best: 0, total: 0 } });
      return;
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: logs } = await dbAdmin
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
    const { data: lastQuizLog } = await dbAdmin
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
      quizDone = true;
      secondsRemaining = 0;
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
