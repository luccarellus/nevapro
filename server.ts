import express from 'express';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import helmet from 'helmet';
import multer from 'multer';
import { supabaseAdmin, supabaseAuthVerifier } from './src/lib/supabaseServer.js';
import * as dotenv from 'dotenv';

dotenv.config();

export const app = express();

// Segurança de produção
  app.use(helmet({
    contentSecurityPolicy: false, // Vite precisa disso desabilitado em dev
    crossOriginEmbedderPolicy: false
  }));
  app.use(express.json());

  // Configuração de Administradores
  const ADMIN_EMAILS = [
    'admin@neva.pro', 
    'lucassantos.-@outlook.com',
  ];

  const ensureAdminInDb = async (email: string, name?: string, preferredId?: string) => {
    try {
      const cleanEmail = email.toLowerCase().trim();
      const { data: existingUser } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (existingUser) {
        if (existingUser.role !== 'admin') {
          await supabaseAdmin.from('users').update({ role: 'admin' }).eq('id', existingUser.id);
          existingUser.role = 'admin';
        }
        return existingUser;
      }

      let userId = preferredId;
      if (!userId) {
        try {
          const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
          const target = (authUsers as any)?.users?.find((u: any) => u.email?.toLowerCase() === cleanEmail);
          if (target) {
            userId = target.id;
          }
        } catch (authErr) {
          console.warn('[ensureAdminInDb] Falha ao listar usuários no auth:', authErr);
        }
      }

      if (!userId) {
        userId = crypto.randomUUID();
      }

      const newAdmin = {
        id: userId,
        email: cleanEmail,
        name: name || cleanEmail.split('@')[0],
        role: 'admin',
        password_hash: 'managed_by_auth',
        level: 1,
        total_xp: 0,
        current_streak: 0,
        questions_attempted: 0,
        questions_resolved: 0,
        created_at: new Date().toISOString()
      };

      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from('users')
        .insert([newAdmin])
        .select()
        .single();

      if (insertErr) {
        console.error('[ensureAdminInDb] Falha ao inserir administrador:', insertErr);
        return null;
      }
      return inserted;
    } catch (err) {
      console.error('[ensureAdminInDb] Erro inesperado:', err);
      return null;
    }
  };
  const isFlashQuizCompleted = async (email: string, userId: string): Promise<boolean> => {
    if (userId) {
      try {
        const { data } = await supabaseAdmin
          .from('users')
          .select('flash_quiz_completed')
          .eq('id', userId)
          .maybeSingle();
        if (data?.flash_quiz_completed) return true;
      } catch (e) {
        console.error('Error checking flash_quiz_completed in users:', e);
      }
    }

    if (userId) {
      try {
        const { data } = await supabaseAdmin
          .from('xp_logs')
          .select('id')
          .eq('user_id', userId)
          .eq('reason', 'Flash Quiz: Maranhão')
          .limit(1);
        if (data && data.length > 0) {
          await supabaseAdmin
            .from('users')
            .update({ flash_quiz_completed: true })
            .eq('id', userId);
          return true;
        }
      } catch (e) {
        console.error('Error checking xp_logs for quiz:', e);
      }
    }
    return false;
  };

  // Identifica o cargo do usuário
  const getUserWithRole = (user: any) => {
    if (!user) return null;
    const email = (user.email || '').toLowerCase().trim();
    const isAdmin = ADMIN_EMAILS.some(adm => adm.toLowerCase() === email) || user.role === 'admin';
    
    return {
      ...user,
      id: user.id || crypto.randomUUID(),
      role: isAdmin ? 'admin' : 'student',
      showInLeaderboard: user.show_in_leaderboard !== false, // default true
      languagePreference: user.language_preference || 'ingles',
      flashQuizCompleted: !!user.flash_quiz_completed
    };
  };

  // Cache volátil forçado (apenas se DB falhar)

  const addNotification = async (title: string, message: string, type: string, metadata?: any) => {
    const newNotif = {
      id: crypto.randomUUID(),
      title,
      message,
      type,
      metadata,
      read: false,
      createdAt: new Date().toISOString()
    };
    
    try {
      const { data: users, error: usersError } = await supabaseAdmin.from('users').select('id');
      if (usersError) throw usersError;

      if (users && users.length > 0) {
        const notifRecords = users.map(u => ({
          id: crypto.randomUUID(),
          user_id: u.id,
          title,
          content: message,
          type: type.toLowerCase(),
          is_read: false,
          created_at: new Date().toISOString()
        }));
        const { error } = await supabaseAdmin.from('notifications').insert(notifRecords);
        if (error) {
          console.error('Failed to save notification: ', error);
          throw error;
        }
      } else {
        console.log('[addNotification] No users found in database to notify.');
      }
    } catch (e) {
      console.error('Failed to save notification:', e);
    }
    return newNotif;
  };

  // Logging middleware
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  // Auth Endpoints (LOGIN)
  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });

    const cleanEmail = email.toLowerCase().trim();
    
    try {
      // 1. Supabase Auth (Para Admins registrados via Dash)
      const { data: authData, error: authError } = await supabaseAuthVerifier.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (!authError && authData.user) {
        await ensureAdminInDb(cleanEmail, authData.user.user_metadata?.full_name, authData.user.id);
        const adminProfile = {
          id: authData.user.id,
          email: cleanEmail,
          name: authData.user.user_metadata?.full_name || cleanEmail.split('@')[0],
          role: 'admin',
          created_at: authData.user.created_at || new Date().toISOString()
        };
        return res.json({ 
          success: true, 
          user: getUserWithRole(adminProfile) 
        });
      }

      // 2. Tabela de Alunos
      const { data: student, error: studentError } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (studentError) throw studentError;

      if (student) {
        const dbPassword = student.password_hash || student.password || student.pasword;
        if (!dbPassword) return res.status(401).json({ error: 'Conta sem senha definida. Entre em contato com o suporte.' });

        let isValid = false;
        if (dbPassword.startsWith('$2a$') || dbPassword.startsWith('$2b$')) {
          isValid = await bcrypt.compare(password, dbPassword);
        } else {
          isValid = dbPassword === password;
        }

        if (isValid) {
          return res.json({ success: true, user: getUserWithRole(student) });
        }
      }

      return res.status(401).json({ error: 'E-mail ou senha inválidos.' });

    } catch (err: any) {
      console.error('[Auth] Login error:', err.message);
      res.status(500).json({ error: 'Falha na autenticação.' });
    }
  });

  // REGISTER
  app.post('/api/auth/register', async (req, res) => {
    const { email, password, name, city, school, gremio } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });

    const cleanEmail = email.toLowerCase().trim();
    
    try {
      if (ADMIN_EMAILS.some(adm => adm.toLowerCase() === cleanEmail)) {
        return res.status(403).json({ error: 'E-mails administrativos devem ser criados pelo painel Supabase.' });
      }

      const { data: existing } = await supabaseAdmin.from('users').select('email').eq('email', cleanEmail).maybeSingle();
      if (existing) return res.status(400).json({ error: 'E-mail já cadastrado.' });

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      const newStudent = {
        id: crypto.randomUUID(),
        email: cleanEmail,
        name: name || cleanEmail.split('@')[0],
        role: 'student',
        city,
        school,
        gremio,
        xp: 0,
        level: 1,
        created_at: new Date().toISOString(),
        password_hash: hashedPassword
      };

      const { data, error } = await supabaseAdmin.from('users').insert([newStudent]).select().single();
      if (error) throw error;

      res.status(201).json({ success: true, user: getUserWithRole(data) });
    } catch (err: any) {
      console.error('[Auth] Register error:', err.message);
      res.status(500).json({ error: 'Erro ao criar conta.' });
    }
  });

  // DELETE USER
  app.post('/api/auth/delete-user', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'E-mail é obrigatório.' });
    const cleanEmail = email.toLowerCase().trim();
    
    try {
      const { data: userData } = await supabaseAdmin.from('users').select('id').eq('email', cleanEmail).maybeSingle();
      if (userData?.id) {
        const userId = userData.id;
        await supabaseAdmin.from('xp_logs').delete().eq('user_id', userId);
        await supabaseAdmin.from('answers').delete().eq('user_id', userId);
        await supabaseAdmin.from('notifications').delete().eq('user_id', userId);
      }

      await supabaseAdmin.from('users').delete().eq('email', cleanEmail);
      
      const { data: authResult } = await supabaseAdmin.auth.admin.listUsers();
      const target = authResult?.users?.find((u: any) => u.email?.toLowerCase() === cleanEmail);
      if (target) await supabaseAdmin.auth.admin.deleteUser(target.id);
      
      res.json({ success: true });
    } catch (err: any) {
      console.error('[POST /api/auth/delete-user] Error:', err);
      res.status(500).json({ error: 'Erro ao remover.' });
    }
  });

  app.post('/api/auth/change-password', async (req, res) => {
    const { email, currentPassword, newPassword } = req.body;
    if (!email || !currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
    }

    const cleanEmail = email.toLowerCase().trim();

    try {
      // 1. Administrador (Supabase Auth)
      if (ADMIN_EMAILS.some(adm => adm.toLowerCase() === cleanEmail)) {
        const { data: authData, error: authError } = await supabaseAuthVerifier.auth.signInWithPassword({
          email: cleanEmail,
          password: currentPassword,
        });

        if (authError || !authData.user) {
          return res.status(401).json({ error: 'Senha atual incorreta.' });
        }

        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(authData.user.id, {
          password: newPassword
        });

        if (updateError) {
          throw updateError;
        }

        return res.json({ success: true, message: 'Senha atualizada com sucesso.' });
      }

      // 2. Estudante (Tabela public.users)
      const { data: student, error: studentError } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (studentError) throw studentError;
      if (!student) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }

      const dbPassword = student.password_hash || student.password || student.pasword;
      if (!dbPassword) {
        return res.status(400).json({ error: 'Conta sem senha definida.' });
      }

      let isValid = false;
      if (dbPassword.startsWith('$2a$') || dbPassword.startsWith('$2b$')) {
        isValid = await bcrypt.compare(currentPassword, dbPassword);
      } else {
        isValid = dbPassword === currentPassword;
      }

      if (!isValid) {
        return res.status(401).json({ error: 'Senha atual incorreta.' });
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newPassword, salt);

      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({ password_hash: hashedPassword })
        .eq('id', student.id);

      if (updateError) throw updateError;

      return res.json({ success: true, message: 'Senha atualizada com sucesso.' });
    } catch (err: any) {
      console.error('[Change Password] Error:', err.message);
      res.status(500).json({ error: 'Erro interno ao alterar a senha.', details: err?.message });
    }
  });

  // PROFILE
  app.get('/api/user/profile', async (req, res) => {
    const email = req.query.email as string;
    if (!email) return res.status(400).json({ error: 'Identificação ausente' });
    
    try {
      const cleanEmail = email.toLowerCase().trim();
      const isAdmin = ADMIN_EMAILS.some(adm => adm.toLowerCase() === cleanEmail);

      if (isAdmin) {
        const dbAdmin = await ensureAdminInDb(cleanEmail);
        if (dbAdmin) {
          return res.json(getUserWithRole(dbAdmin));
        }
      }

      const { data, error } = await supabaseAdmin.from('users').select('*').eq('email', cleanEmail).maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Usuário não encontrado' });
      res.json(getUserWithRole(data));
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao buscar perfil.' });
    }
  });

  app.post('/api/user/profile', async (req, res) => {
    const updateData = req.body;
    const email = (updateData.email || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ error: 'E-mail obrigatório' });
    
    const isAdmin = ADMIN_EMAILS.some(adm => adm.toLowerCase() === email);
    if (isAdmin) {
      await ensureAdminInDb(email, updateData.name);
    }

    const supabaseUpdate: any = { email };
    const allowedFields = [
      'name', 'xp', 'level', 'city', 'school', 'gremio', 
      'role',
      'answeredQuestions', 'correctAnswers', 'streak'
    ];
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) supabaseUpdate[field] = updateData[field];
    });

    if (updateData.showInLeaderboard !== undefined) {
      supabaseUpdate.show_in_leaderboard = updateData.showInLeaderboard;
    }
    if (updateData.languagePreference !== undefined) {
      supabaseUpdate.language_preference = updateData.languagePreference;
    }

    const isFlashQuizUpdate = !!updateData.isFlashQuizUpdate;

    if (supabaseUpdate.xp !== undefined) {
      supabaseUpdate.total_xp = supabaseUpdate.xp;
    }

    // Fetch the old user profile from database to determine if XP has increased
    let xpDiff = 0;
    let userId = null;
    let oldXp = 0;
    try {
      const { data: oldUser } = await supabaseAdmin.from('users').select('id, xp').eq('email', email).maybeSingle();
      if (oldUser) {
        userId = oldUser.id;
        oldXp = oldUser.xp || 0;
        if (supabaseUpdate.xp !== undefined) {
          const newXp = supabaseUpdate.xp;
          if (newXp > oldXp) {
            xpDiff = newXp - oldXp;
          }
        }
      }
    } catch (e) {
      console.error('[Profile Update] Error fetching old user:', e);
    }

    // Check flash quiz protection on server side
    if (isFlashQuizUpdate) {
      const alreadyCompleted = await isFlashQuizCompleted(email, userId);
      if (alreadyCompleted) {
        console.log(`[Flash Quiz Secure Block] Email ${email} blocked from gaining duplicate quiz XP.`);
        // Reset XP back to old rate
        supabaseUpdate.xp = oldXp;
        supabaseUpdate.total_xp = oldXp;
        xpDiff = 0;
      } else {
        // First completion: mark in database
        supabaseUpdate.flash_quiz_completed = true;
      }
    }
    
    try {
      const { data, error } = await supabaseAdmin.from('users').update(supabaseUpdate).eq('email', email).select().single();
      if (error && error.code === 'PGRST116') {
        supabaseUpdate.password_hash = 'managed_by_auth';
        const ins = await supabaseAdmin.from('users').insert([supabaseUpdate]).select().single();
        if (ins.data && ins.data.xp > 0) {
          await supabaseAdmin.from('xp_logs').insert([{
            user_id: ins.data.id,
            amount: ins.data.xp,
            reason: 'XP Inicial',
            created_at: new Date().toISOString()
          }]);
        }
        return res.json({ success: true, user: getUserWithRole(ins.data) });
      }
      if (error) throw error;

      // If there is an XP increase, insert an entry in xp_logs to feed weekly charts
      if (userId && xpDiff > 0) {
        await supabaseAdmin.from('xp_logs').insert([{
          user_id: userId,
          amount: xpDiff,
          reason: isFlashQuizUpdate ? 'Flash Quiz: Maranhão' : 'Conclusão de Simulado / Atividade',
          created_at: new Date().toISOString()
        }]);
      }

      res.json({ success: true, user: getUserWithRole(data) });
    } catch (error: any) {
      res.status(500).json({ error: 'Erro ao salvar.' });
    }
  });

  app.delete('/api/user/profile', async (req, res) => {
    const email = (req.query.email || req.body.email) as string;
    if (!email) return res.status(400).json({ error: 'E-mail é obrigatório.' });
    const cleanEmail = email.toLowerCase().trim();

    try {
      const { data: userData } = await supabaseAdmin.from('users').select('id').eq('email', cleanEmail).maybeSingle();
      if (userData?.id) {
        const userId = userData.id;
        // Clean up linked data in other tables to avoid foreign key violations
        await supabaseAdmin.from('xp_logs').delete().eq('user_id', userId);
        await supabaseAdmin.from('answers').delete().eq('user_id', userId);
        await supabaseAdmin.from('notifications').delete().eq('user_id', userId);
      }

      await supabaseAdmin.from('users').delete().eq('email', cleanEmail);

      const { data: authResult } = await supabaseAdmin.auth.admin.listUsers();
      const target = authResult?.users?.find((u: any) => u.email?.toLowerCase() === cleanEmail);
      if (target) {
        await supabaseAdmin.auth.admin.deleteUser(target.id);
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error('[DELETE /api/user/profile] Error:', err);
      res.status(500).json({ error: 'Erro ao remover perfil.' });
    }
  });

  // NOTIFICATIONS
  app.get('/api/notifications', async (req, res) => {
    const email = req.query.email as string;
    try {
      let query = supabaseAdmin.from('notifications').select('*');
      
      if (email) {
        const cleanEmail = email.toLowerCase().trim();
        const { data: user } = await supabaseAdmin.from('users').select('id').eq('email', cleanEmail).maybeSingle();
        if (user) {
          query = query.eq('user_id', user.id);
        } else {
          return res.json([]);
        }
      }
      
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      
      const mapped = (data || []).map(n => ({
        id: n.id,
        user_id: n.user_id,
        title: n.title,
        message: n.content,
        type: n.type,
        read: n.is_read,
        createdAt: n.created_at || new Date().toISOString()
      }));

      // Deduplicate by title & content to ensure the user gets a unique feed
      const seen = new Set();
      const uniqueMapped = [];
      for (const n of mapped) {
        const key = `${n.title}-${n.message}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueMapped.push(n);
        }
      }
      
      res.json(uniqueMapped);
    } catch (err) {
      console.error('[GET /api/notifications] Error:', err);
      res.json([]);
    }
  });

  // USER STATS (Real Weekly Data)
  app.get('/api/user/stats', async (req, res) => {
    const email = (req.query.email as string || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ error: 'E-mail obrigatório' });

    try {
      // Busca o user id
      const { data: user } = await supabaseAdmin.from('users').select('id').eq('email', email).maybeSingle();
      if (!user) return res.json({ weekly: [], summary: { average: 0, best: 0, total: 0 } });

      // Busca logs de XP dos últimos 7 dias
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const { data: logs } = await supabaseAdmin
        .from('xp_logs')
        .select('*')
        .eq('user_id', user.id)
        .gte('created_at', sevenDaysAgo.toISOString());

      // Agrega por dia
      const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
      const weeklyMap: any = {};
      
      // Inicializa os últimos 7 dias
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dayName = days[d.getDay()];
        weeklyMap[dayName] = { day: dayName, xp: 0, fullDate: d.toISOString().split('T')[0] };
      }

      if (logs) {
        logs.forEach((log: any) => {
          const date = new Date(log.created_at);
          const dayName = days[date.getDay()];
          if (weeklyMap[dayName]) {
            weeklyMap[dayName].xp += log.amount;
          }
        });
      }

      const weekly = Object.values(weeklyMap);
      const xps = weekly.map((w: any) => w.xp);
      const total = xps.reduce((a, b) => a + b, 0);
      const best = Math.max(...xps, 0);
      const average = Math.round(total / 7);

      const quizDone = await isFlashQuizCompleted(email, user.id);

      res.json({
        weekly,
        summary: { average, best, total },
        flashQuizCompleted: quizDone
      });
    } catch (err) {
      res.status(500).json({ error: 'Erro ao processar estatísticas' });
    }
  });

  // LEADERBOARD (Real Users Ranking)
  app.get('/api/leaderboard', async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('name, email, city, xp, level, role, show_in_leaderboard');
      
      if (error) throw error;

      // Filtra administradores e estudantes que desativaram exibição no ranking
      const filteredLeaderboard = (data || [])
        .filter(u => {
          const email = (u.email || '').toLowerCase().trim();
          const isAdmin = ADMIN_EMAILS.some(adm => adm.toLowerCase() === email) || u.role === 'admin';
          if (isAdmin) return false;
          
          if (u.show_in_leaderboard === false) return false;
          return true;
        })
        .map(({ name, city, xp, level }) => ({
          name,
          city,
          xp: xp || 0,
          level: level || 1
        }))
        .sort((a, b) => b.xp - a.xp)
        .slice(0, 20);

      res.json(filteredLeaderboard);
    } catch (err) {
      console.error('Erro ao buscar ranking:', err);
      res.status(500).json({ error: 'Erro ao buscar ranking' });
    }
  });

  // ADMIN ENDPOINTS
  app.get('/api/admin/users', async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      
      const regularStudents = (data || []).filter(u => {
        const email = (u.email || '').toLowerCase().trim();
        const isAdmin = ADMIN_EMAILS.some(adm => adm.toLowerCase() === email) || u.role === 'admin';
        return !isAdmin;
      });
      res.json(regularStudents);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  app.get('/api/admin/activities', async (req, res) => {
    try {
      const { data: logs, error } = await supabaseAdmin
        .from('xp_logs')
        .select('*, users(name, city)')
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;

      const activities = (logs || []).map((log: any) => {
        const time = new Date(log.created_at);
        const diff = Math.floor((new Date().getTime() - time.getTime()) / 60000); // minutes
        let timeStr = 'Agora';
        if (diff > 0 && diff < 60) timeStr = `Há ${diff} min`;
        else if (diff >= 60 && diff < 1440) timeStr = `Há ${Math.floor(diff/60)}h`;
        else if (diff >= 1440) timeStr = `Há ${Math.floor(diff/1440)} dias`;

        return {
          id: log.id,
          user: log.users?.name || 'Estudante',
          action: `Ganhou ${log.amount} XP: ${log.reason || 'Atividade'}`,
          time: timeStr,
          city: log.users?.city || 'Brasil'
        };
      });

      // Calculate weekly editorial production
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const [mats, recs] = await Promise.all([
        supabaseAdmin.from('materials').select('uploadedAt').gte('uploadedAt', sevenDaysAgo.toISOString().split('T')[0]),
        supabaseAdmin.from('mural').select('created_at').gte('created_at', sevenDaysAgo.toISOString())
      ]);

      const production: any = {};
      const days = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        production[days[d.getDay()]] = 0;
      }

      (mats.data || []).forEach((m: any) => {
        const d = new Date(m.uploadedAt);
        const day = days[d.getDay()];
        if (production[day] !== undefined) production[day]++;
      });

      (recs.data || []).forEach((r: any) => {
        const d = new Date(r.created_at || r.date);
        const day = days[d.getDay()];
        if (production[day] !== undefined) production[day]++;
      });

      const productionList = Object.keys(production).map(day => ({
        day,
        value: production[day]
      }));

      res.json({ activities, production: productionList });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch activities' });
    }
  });

  app.post('/api/notifications/read-all', async (req, res) => {
    const email = req.query.email as string;
    try {
      let query = supabaseAdmin.from('notifications').update({ is_read: true }).eq('is_read', false);
      
      if (email) {
        const cleanEmail = email.toLowerCase().trim();
        const { data: user } = await supabaseAdmin.from('users').select('id').eq('email', cleanEmail).maybeSingle();
        if (user) {
          query = query.eq('user_id', user.id);
        } else {
          return res.json({ success: false, error: 'User not found' });
        }
      }
      
      const { error } = await query;
      if (error) throw error;
      res.json({ success: true });
    } catch (err) {
      console.error('[POST /api/notifications/read-all] Error:', err);
      res.json({ success: false });
    }
  });

  app.post('/api/notifications/:id/read', async (req, res) => {
    try {
      const { error } = await supabaseAdmin.from('notifications').update({ is_read: true }).eq('id', req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err) {
      console.error('[POST /api/notifications/:id/read] Error:', err);
      res.json({ success: false });
    }
  });

  // UPLOAD DE ARQUIVOS (PDF, ETC) COM SUPABASE STORAGE
  const upload = multer({ storage: multer.memoryStorage() });

  app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado' });
      }

      const file = req.file;
      const fileExt = path.extname(file.originalname);
      const baseName = path.basename(file.originalname, fileExt)
        .replace(/[^a-zA-Z0-9]/g, '_');
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const filename = `${baseName}-${uniqueSuffix}${fileExt}`;

      const { data, error } = await supabaseAdmin.storage
        .from('materials')
        .upload(filename, file.buffer, {
          contentType: file.mimetype,
          cacheControl: '3600',
          upsert: true
        });

      if (error) {
        console.error('[Supabase Storage] Upload error:', error);
        return res.status(500).json({ error: 'Erro ao fazer upload no Supabase Storage: ' + error.message });
      }

      const { data: { publicUrl } } = supabaseAdmin.storage
        .from('materials')
        .getPublicUrl(filename);

      res.json({ url: publicUrl });
    } catch (error: any) {
      console.error('[POST /api/upload] Error:', error);
      res.status(500).json({ error: 'Erro ao fazer upload do arquivo: ' + error.message });
    }
  });

  // MATERIALS
  app.get('/api/materials', async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from('materials').select('*').order('id', { ascending: false });
      if (error) throw error;
      
      const mapped = (data || []).map(mat => ({
        id: mat.id,
        title: mat.title,
        subject: mat.subject,
        foco: mat.subject,
        description: mat.description,
        url: mat.content_url,
        type: mat.type,
        uploadedAt: mat.created_at ? mat.created_at.split('T')[0] : new Date().toISOString().split('T')[0]
      }));
      
      res.json(mapped);
    } catch (err) { 
      res.json([]); 
    }
  });

  app.post('/api/materials', async (req, res) => {
    try {
      const dbRecord = {
        title: req.body.title,
        content_url: req.body.url,
        type: req.body.type,
        subject: req.body.foco || req.body.subject || 'ENEM geral',
        description: req.body.description || ''
      };
      const { data, error } = await supabaseAdmin.from('materials').insert([dbRecord]).select().single();
      if (error) throw error;
      
      const mappedResult = {
        id: data.id,
        title: data.title,
        subject: data.subject,
        foco: data.subject,
        description: data.description,
        url: data.content_url,
        type: data.type,
        uploadedAt: data.created_at ? data.created_at.split('T')[0] : new Date().toISOString().split('T')[0]
      };

      await addNotification('Novo Material', `"${req.body.title}" em ${dbRecord.subject}.`, 'material', { id: data?.id });
      res.status(201).json(mappedResult);
    } catch (error) {
      console.error('[POST /api/materials] Error inserting:', error);
      res.status(500).json({ error: 'Failed to insert material' });
    }
  });

  app.delete('/api/materials/:id', async (req, res) => {
    try {
      await supabaseAdmin.from('materials').delete().eq('id', req.params.id);
      res.status(204).end();
    } catch (err) { res.status(204).end(); }
  });

  app.put('/api/materials/:id', async (req, res) => {
    try {
      const dbRecord = {
        title: req.body.title,
        content_url: req.body.url,
        type: req.body.type,
        subject: req.body.foco || req.body.subject || 'ENEM geral',
        description: req.body.description || ''
      };
      const { data, error } = await supabaseAdmin.from('materials').update(dbRecord).eq('id', req.params.id).select().single();
      if (error) throw error;
      
      const mappedResult = {
        id: data.id,
        title: data.title,
        subject: data.subject,
        foco: data.subject,
        description: data.description,
        url: data.content_url,
        type: data.type,
        uploadedAt: data.created_at ? data.created_at.split('T')[0] : new Date().toISOString().split('T')[0]
      };
      res.json(mappedResult);
    } catch (error) {
      console.error('[PUT /api/materials/:id] Error updating:', error);
      res.status(500).json({ error: 'Failed to update material' });
    }
  });

  // MURAL
  app.get('/api/recados', async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from('mural').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      
      const mapped = (data || []).map(item => ({
        id: item.id,
        title: item.title,
        content: item.content,
        sender: 'Administração',
        date: item.created_at || new Date().toISOString(),
        category: (item.type || 'geral').toLowerCase(),
        tag: item.type || 'Geral'
      }));
      
      res.json(mapped);
    } catch (err) { 
      res.json([]); 
    }
  });

  app.post('/api/recados', async (req, res) => {
    try {
      const dbBody = {
        title: req.body.title,
        content: req.body.content,
        type: req.body.category ? req.body.category.toUpperCase() : 'GERAL'
      };
      
      const { data, error } = await supabaseAdmin.from('mural').insert([dbBody]).select().single();
      if (error) {
        console.error('[POST /api/recados] Supabase insertion error:', error);
        throw error;
      }
      
      const mappedResult = {
        id: data.id,
        title: data.title,
        content: data.content,
        sender: 'Administração',
        date: data.created_at || new Date().toISOString(),
        category: (data.type || 'geral').toLowerCase(),
        tag: data.type || 'Geral'
      };
      
      await addNotification('Novo Recado', `${req.body.title}`, 'mural', { id: data?.id });
      res.status(201).json(mappedResult);
    } catch (err: any) {
      console.error('[POST /api/recados] Failed to insert recado:', err);
      res.status(500).json({ error: 'Failed to insert recado', details: err?.message || err });
    }
  });

  app.delete('/api/recados/:id', async (req, res) => {
    try {
      await supabaseAdmin.from('mural').delete().eq('id', req.params.id);
      res.status(204).end();
    } catch (err) { 
      res.status(204).end(); 
    }
  });

  app.put('/api/recados/:id', async (req, res) => {
    try {
      const dbBody = {
        title: req.body.title,
        content: req.body.content,
        type: req.body.category ? req.body.category.toUpperCase() : 'GERAL'
      };
      
      const { data, error } = await supabaseAdmin.from('mural').update(dbBody).eq('id', req.params.id).select().single();
      if (error) throw error;
      
      const mappedResult = {
        id: data.id,
        title: data.title,
        content: data.content,
        sender: 'Administração',
        date: data.created_at || new Date().toISOString(),
        category: (data.type || 'geral').toLowerCase(),
        tag: data.type || 'Geral'
      };
      res.json(mappedResult);
    } catch (err: any) {
      console.error('[PUT /api/recados/:id] Failed to update recado:', err);
      res.status(500).json({ error: 'Failed to update recado', details: err?.message || err });
    }
  });

  // EVENTOS
  app.get('/api/eventos', async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('eventos')
        .select('*')
        .order('date', { ascending: true });
      if (error) throw error;
      
      const mapped = (data || []).map(evt => ({
        id: evt.id,
        title: evt.title,
        description: evt.description,
        date: evt.date,
        time: evt.time,
        type: evt.type,
        category: evt.category,
        questionsCount: evt.questions_count,
        xpReward: evt.xp_reward,
        observation: evt.observation
      }));
      res.json(mapped);
    } catch (err) {
      console.error('[GET /api/eventos] Error:', err);
      res.json([]);
    }
  });

  app.post('/api/eventos', async (req, res) => {
    try {
      const dbRecord = {
        title: req.body.title,
        description: req.body.description || '',
        date: req.body.date,
        time: req.body.time || '',
        type: req.body.type || 'evento',
        category: req.body.category || 'Evento',
        questions_count: req.body.questionsCount,
        xp_reward: req.body.xpReward || 0,
        observation: req.body.observation || ''
      };
      
      const { data, error } = await supabaseAdmin
        .from('eventos')
        .insert([dbRecord])
        .select()
        .single();
        
      if (error) throw error;
      
      const mapped = {
        id: data.id,
        title: data.title,
        description: data.description,
        date: data.date,
        time: data.time,
        type: data.type,
        category: data.category,
        questionsCount: data.questions_count,
        xpReward: data.xp_reward,
        observation: data.observation
      };
      
      await addNotification('Novo Evento', `${req.body.title}`, 'evento', { id: data.id });
      res.status(201).json(mapped);
    } catch (err: any) {
      console.error('[POST /api/eventos] Failed to insert event:', err);
      res.status(500).json({ error: 'Failed to insert evento', details: err?.message || err });
    }
  });

  app.delete('/api/eventos/:id', async (req, res) => {
    try {
      const { error } = await supabaseAdmin
        .from('eventos')
        .delete()
        .eq('id', req.params.id);
      if (error) throw error;
      res.status(204).end();
    } catch (err) {
      console.error('[DELETE /api/eventos/:id] Error:', err);
      res.status(500).json({ error: 'Failed to delete event' });
    }
  });

  app.put('/api/eventos/:id', async (req, res) => {
    try {
      const dbRecord = {
        title: req.body.title,
        description: req.body.description || '',
        date: req.body.date,
        time: req.body.time || '',
        type: req.body.type || 'evento',
        category: req.body.category || 'Evento',
        questions_count: req.body.questionsCount,
        xp_reward: req.body.xpReward || 0,
        observation: req.body.observation || ''
      };
      
      const { data, error } = await supabaseAdmin
        .from('eventos')
        .update(dbRecord)
        .eq('id', req.params.id)
        .select()
        .single();
        
      if (error) throw error;
      
      const mapped = {
        id: data.id,
        title: data.title,
        description: data.description,
        date: data.date,
        time: data.time,
        type: data.type,
        category: data.category,
        questionsCount: data.questions_count,
        xpReward: data.xp_reward,
        observation: data.observation
      };
      
      res.json(mapped);
    } catch (err: any) {
      console.error('[PUT /api/eventos/:id] Failed to update event:', err);
      res.status(500).json({ error: 'Failed to update event', details: err?.message });
    }
  });

  // QUESTOES
  app.get('/api/questoes', async (req, res) => {
    const { year, limit = 50, offset = 0 } = req.query;
    if (!year) return res.status(400).json({ error: 'Ano necessário' });
    try {
      const { data: dbData } = await supabaseAdmin.from('questions').select('*, question_options(*)').eq('year', year).order('index', { ascending: true }).range(Number(offset), Number(offset) + Number(limit) - 1);
      if (dbData?.length) return res.json({ questions: dbData.map(q => ({ ...q, alternatives: q.question_options?.sort((a: any, b: any) => a.letter.localeCompare(b.letter)) || [] })) });
      const response = await fetch(`https://api.enem.dev/v1/exams/${year}/questions?limit=${limit}&offset=${offset}`);
      const data = await response.json();
      res.json(data);
    } catch (error) { res.status(500).json({ error: 'Erro ao buscar questões' }); }
  });

  app.post('/api/answers', async (req, res) => {
    const { userId, questionId, isCorrect, xpReward } = req.body;
    try {
      await supabaseAdmin.from('answers').insert([{ user_id: userId, question_id: questionId, is_correct: isCorrect, created_at: new Date().toISOString() }]);
      if (isCorrect) {
        await supabaseAdmin.from('xp_logs').insert([{ user_id: userId, amount: xpReward, reason: `Questão: ${questionId}`, created_at: new Date().toISOString() }]);
        const { data: user } = await supabaseAdmin.from('users').select('xp').eq('id', userId).single();
        if (user) await supabaseAdmin.from('users').update({ xp: (user.xp || 0) + xpReward }).eq('id', userId);
      }
      res.json({ success: true });
    } catch (err) { res.json({ success: true }); }
  });

  app.get('/api/imagem', async (req, res) => {
    const url = req.query.url as string;
    if (!url) return res.status(400).send('URL missing');
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla', 'Referer': 'https://enem.dev/' } });
      if (!response.ok) return res.status(response.status).send('Fetch error');
      res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      const buffer = Buffer.from(await response.arrayBuffer());
      res.send(buffer);
    } catch (error) { res.status(500).send('Proxy error'); }
  });

  // LGPD Consent log endpoint
  app.post('/api/lgpd/consent-log', (req, res) => {
    // Retorna 200 OK para evitar erro de 404 no console do navegador
    console.log('[LGPD] Consent preferences received:', req.body);
    res.json({ success: true });
  });

  async function initVite() {
    if (process.env.VERCEL) return;
    
    if (process.env.NODE_ENV !== 'production') {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
    }
  }

  initVite();

  if (!process.env.VERCEL) {
    const PORT = Number(process.env.PORT || 3000);
    app.listen(PORT, '0.0.0.0', () => console.log(`Server production-ready on port ${PORT}`));
  }
