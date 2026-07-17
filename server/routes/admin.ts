import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { rateLimiter } from '../middleware/rateLimiter';
import { requireAdmin } from '../middleware/auth';
import { getSupabaseAdminClient } from '../../src/lib/dbQueryBuilder';
import { query } from '../../src/lib/db';
import { log } from '../utils/logger';
import { cacheGet, cacheSet } from '../services/cache';
import { CACHE_KEYS } from '../types';

const router = Router();

// ============= LIST STUDENTS =============
router.get('/users', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const cached = await cacheGet<unknown[]>(CACHE_KEYS.ADMIN_USERS);
    if (cached) {
      res.json(cached);
      return;
    }

    const { data, error } = await getSupabaseAdminClient()
      .from('users')
      .select('*')
      .order('xp', { ascending: false });

    if (error) throw error;

    const regularStudents = (data || [])
      .filter((u: Record<string, unknown>) => u.role !== 'admin')
      .map((u: Record<string, unknown>) => ({
        ...u,
        answeredQuestions: (u as any).answered_questions || (u as any).answeredQuestions || 0,
        correctAnswers: (u as any).correct_answers || (u as any).correctAnswers || 0,
        avatarUrl: (u as any).avatar_url || (u as any).avatarUrl || (u as any).avatar || '',
      }));

    await cacheSet(CACHE_KEYS.ADMIN_USERS, regularStudents);
    res.json(regularStudents);
  } catch (err) {
    log.error('[Admin Users] Error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ============= ADMIN ACTIVITIES =============
router.get('/activities', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const cached = await cacheGet<{ activities: unknown[]; production: unknown[] }>(CACHE_KEYS.ADMIN_ACTIVITIES);
    if (cached) {
      res.json(cached);
      return;
    }

    const { rows: logs } = await query(`
      SELECT x.*, u.name as user_name, u.city as user_city
      FROM xp_logs x
      LEFT JOIN users u ON x.user_id = u.id
      ORDER BY x.created_at DESC
      LIMIT 20
    `);

    const activities = (logs || []).map((logEntry: Record<string, unknown>) => {
      const logDate = new Date(logEntry.created_at as string);
      const diff = Math.floor((Date.now() - logDate.getTime()) / 60000);
      let timeStr = 'Agora';
      if (diff > 0 && diff < 60) timeStr = `Há ${diff} min`;
      else if (diff >= 60 && diff < 1440) timeStr = `Há ${Math.floor(diff / 60)}h`;
      else if (diff >= 1440) timeStr = `Há ${Math.floor(diff / 1440)} dias`;

      return {
        id: logEntry.id,
        user: logEntry.user_name || 'Estudante',
        action: `Ganhou ${logEntry.amount} XP: ${logEntry.reason || 'Atividade'}`,
        time: timeStr,
        city: logEntry.user_city || 'Brasil',
      };
    });

    // Weekly production
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [mats, recs] = await Promise.all([
      getSupabaseAdminClient()
        .from('materials')
        .select('uploaded_at')
        .gte('uploaded_at', sevenDaysAgo.toISOString().split('T')[0]),
      getSupabaseAdminClient()
        .from('mural')
        .select('created_at')
        .gte('created_at', sevenDaysAgo.toISOString()),
    ]);

    const days = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
    const production: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      production[days[d.getDay()]] = 0;
    }

    for (const m of mats.data || []) {
      const d = new Date((m as any).uploaded_at);
      const day = days[d.getDay()];
      if (production[day] !== undefined) production[day]++;
    }

    for (const r of recs.data || []) {
      const d = new Date((r as any).created_at || (r as any).date);
      const day = days[d.getDay()];
      if (production[day] !== undefined) production[day]++;
    }

    const productionList = Object.entries(production).map(([day, value]) => ({ day, value }));
    const result = { activities, production: productionList };

    await cacheSet(CACHE_KEYS.ADMIN_ACTIVITIES, result);
    res.json(result);
  } catch (err) {
    log.error('[Admin Activities] Error:', err);
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

// ============= SYNC AUTH USERS =============
router.post(
  '/sync-auth-users',
  rateLimiter(1, 60_000),
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const supabase = getSupabaseAdminClient();
      const { data: authResult, error: authError } = await supabase.auth.admin.listUsers();
      if (authError) throw authError;

      const authUsers = authResult?.users || [];
      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const au of authUsers) {
        if (!au.email) {
          skipped++;
          continue;
        }

        const email = au.email.toLowerCase().trim();

        const { data: existingAdmin } = await supabase
          .from('admin_users')
          .select('id, auth_user_id')
          .eq('email', email)
          .maybeSingle();

        const { data: existingStudent } = await supabase
          .from('users')
          .select('id')
          .eq('email', email)
          .maybeSingle();

        if (existingStudent) {
          skipped++;
          continue;
        }

        if (existingAdmin) {
          if (!existingAdmin.auth_user_id || existingAdmin.auth_user_id !== au.id) {
            await query(
              'UPDATE public.admin_users SET auth_user_id = $1, updated_at = NOW() WHERE email = $2',
              [au.id, email],
            );
            updated++;
          } else {
            skipped++;
          }
        } else {
          const adminName =
            au.raw_user_meta_data?.name ||
            au.raw_user_meta_data?.full_name ||
            au.email?.split('@')[0] ||
            email.split('@')[0];

          await supabase.from('admin_users').insert([
            {
              id: crypto.randomUUID(),
              email,
              name: adminName,
              role: 'admin',
              auth_user_id: au.id,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ]);
          created++;
        }
      }

      res.json({
        success: true,
        message: `Sincronização concluída. ${created} criados, ${updated} atualizados, ${skipped} ignorados.`,
        stats: { created, updated, skipped, total: authUsers.length },
      });
    } catch (err: unknown) {
      log.error('[Sync Auth Users] Error:', err);
      res.status(500).json({ error: 'Erro ao sincronizar usuários do Auth.' });
    }
  },
);

export default router;
