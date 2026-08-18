import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { rateLimiter } from '../middleware/rateLimiter';
import { requireAuth } from '../middleware/auth';
import { resolveTenant } from '../middleware/tenant';
import { dbAdmin } from '../lib/dbQueryBuilder';
import { log } from '../utils/logger';
import { normalizeEmail } from '../utils/sanitize';

const router = Router();

// ============= LIST TODAY'S TASKS =============
router.get('/tasks', requireAuth, resolveTenant, async (req: AuthenticatedRequest, res: Response) => {
  const email = normalizeEmail((req.query.email as string) || req.user?.email || '');

  if (req.user?.role !== 'admin' && req.user?.email !== email) {
    res.status(403).json({ error: 'Acesso negado: permissões insuficientes.' });
    return;
  }

  try {
    const { data: user } = await dbAdmin
      .from('users')
      .select('id, answered_questions')
      .eq('email', email)
      .maybeSingle();

    if (!user) {
      res.json({ tasks: [], weekly_goal: null });
      return;
    }

    const taskDate = (req.query.date as string) || new Date().toISOString().split('T')[0];

    // Fetch tasks for this date
    const { data: tasks } = await dbAdmin
      .from('user_study_tasks')
      .select('*')
      .eq('user_id', user.id)
      .eq('task_date', taskDate)
      .order('created_at', { ascending: true });

    // If no tasks exist for today, auto-generate defaults
    if (!tasks || tasks.length === 0) {
      const isToday = taskDate === new Date().toISOString().split('T')[0];
      if (isToday) {
        const answered = user.answered_questions || 0;
        const defaults = [
          {
            user_id: user.id,
            title: `Matemática e suas Tecnologias - 15 questões estilo ENEM`,
            estimated_time: '45 min',
            target_tab: 'questions',
            done: false,
            task_date: taskDate,
            created_at: new Date().toISOString(),
          },
          {
            user_id: user.id,
            title: `Revisar pendências no Caderno de Erros`,
            estimated_time: '20 min',
            target_tab: 'errors',
            done: false,
            task_date: taskDate,
            created_at: new Date().toISOString(),
          },
          {
            user_id: user.id,
            title: `Linguagens, Códigos & Humanas - 15 questões de interpretação ENEM`,
            estimated_time: '30 min',
            target_tab: 'questions',
            done: false,
            task_date: taskDate,
            created_at: new Date().toISOString(),
          },
        ];

        const { data: inserted, error: insertError } = await dbAdmin
          .from('user_study_tasks')
          .insert(defaults.map((t) => ({ ...t, tenant_id: req.tenantId || null })))
          .select('*');

        if (insertError) throw insertError;

        res.json({
          tasks: inserted || defaults,
          weekly_goal: {
            questions_answered: answered || 0,
          },
        });
        return;
      }

      res.json({ tasks: [], weekly_goal: null });
      return;
    }

    res.json({
      tasks,
      weekly_goal: {
        questions_answered: user.answered_questions || 0,
      },
    });
  } catch (err) {
    log.error('[StudyPlan] Error fetching tasks:', err);
    res.status(500).json({ error: 'Erro ao buscar tarefas do plano de estudos.' });
  }
});

// ============= CREATE TASK =============
router.post('/tasks', rateLimiter(10, 60_000), requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const email = normalizeEmail(req.user?.email || '');

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

    const { title, estimated_time, target_tab, task_date } = req.body;
    if (!title) {
      res.status(400).json({ error: 'Título da tarefa é obrigatório.' });
      return;
    }

    const { data, error } = await dbAdmin
      .from('user_study_tasks')
      .insert({
        user_id: user.id,
        title,
        estimated_time: estimated_time || '30 min',
        target_tab: target_tab || 'questions',
        done: false,
        task_date: task_date || new Date().toISOString().split('T')[0],
        tenant_id: req.tenantId || null,
        created_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    log.error('[StudyPlan] Error creating task:', err);
    res.status(500).json({ error: 'Erro ao criar tarefa.' });
  }
});

// ============= TOGGLE / UPDATE TASK =============
router.put('/tasks/:id', rateLimiter(10, 60_000), requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const email = normalizeEmail(req.user?.email || '');
  const { id } = req.params;

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

    // Verify ownership
    const { data: existing } = await dbAdmin
      .from('user_study_tasks')
      .select('user_id')
      .eq('id', id)
      .maybeSingle();

    if (!existing) {
      res.status(404).json({ error: 'Tarefa não encontrada.' });
      return;
    }

    if (existing.user_id !== user.id && req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Acesso negado: você não é o dono desta tarefa.' });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (req.body.done !== undefined) updates.done = req.body.done;
    if (req.body.title !== undefined) updates.title = req.body.title;
    if (req.body.estimated_time !== undefined) updates.estimated_time = req.body.estimated_time;
    if (req.body.target_tab !== undefined) updates.target_tab = req.body.target_tab;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'Nenhum campo válido para atualizar.' });
      return;
    }

    const { data, error } = await dbAdmin
      .from('user_study_tasks')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    log.error('[StudyPlan] Error updating task:', err);
    res.status(500).json({ error: 'Erro ao atualizar tarefa.' });
  }
});

// ============= DELETE TASK =============
router.delete('/tasks/:id', rateLimiter(10, 60_000), requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const email = normalizeEmail(req.user?.email || '');
  const { id } = req.params;

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

    const { data: existing } = await dbAdmin
      .from('user_study_tasks')
      .select('user_id')
      .eq('id', id)
      .maybeSingle();

    if (existing && existing.user_id !== user.id && req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }

    const { error } = await dbAdmin
      .from('user_study_tasks')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    log.error('[StudyPlan] Error deleting task:', err);
    res.status(500).json({ error: 'Erro ao remover tarefa.' });
  }
});

export default router;
