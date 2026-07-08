import express from 'express';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import helmet from 'helmet';
import multer from 'multer';
import cookieParser from 'cookie-parser';
import fs from 'fs';
import { dbAdmin, getSupabaseAnonClient } from './src/lib/dbQueryBuilder.js';
import pool, { query } from './src/lib/db.js';
import * as dotenv from 'dotenv';

dotenv.config();

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

export const app = express();
app.set('trust proxy', 1);

// Configuração nativa de CORS
app.use((req, res, next) => {
  const origin = process.env.FRONTEND_URL || 'https://neva.pro';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Configuração de cookies
app.use(cookieParser());

// Segurança de produção com CSP condicional (ativada apenas em prod para não quebrar o dev HMR)
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https://api.enem.dev", "https://enem.dev"],
      connectSrc: ["'self'", "https://api.enem.dev"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    }
  } : false,
  crossOriginEmbedderPolicy: false
}));
app.use(express.json());

// --- SISTEMA DE AUTENTICAÇÃO E SESSÕES CRIPTOGRAFADAS ---
const SESSION_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  console.error('[Erro Fatal] Variáveis de ambiente JWT_SECRET ou SESSION_SECRET ausentes.');
  process.exit(1);
}

// Gera um token de sessão assinado
const generateToken = (userId: string, email: string, role: string) => {
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 horas de validade
  const payload = `${userId}:${email}:${role}:${expiresAt}`;
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return `${payload}:${signature}`;
};

// Limpeza periódica de tokens revogados expirados no banco de dados (a cada hora)
setInterval(async () => {
  try {
    await query('DELETE FROM public.revoked_tokens WHERE expires_at < NOW()');
  } catch (err) {
    console.error('[Cleanup] Erro ao limpar tokens revogados expirados do banco:', err);
  }
}, 60 * 60 * 1000);

// Valida a assinatura de um token de sessão
const verifyToken = async (token: string) => {
  try {
    if (!token) return null;
    
    // Verifica no banco de dados se o token foi revogado
    const { rows } = await query('SELECT 1 FROM public.revoked_tokens WHERE token = $1 LIMIT 1', [token]);
    if (rows.length > 0) return null;

    const parts = token.split(':');
    if (parts.length !== 5) return null;
    const [userId, email, role, expiresAtStr, signature] = parts;
    const expiresAt = parseInt(expiresAtStr, 10);
    if (Date.now() > expiresAt) return null; // Expirado
    
    const payload = `${userId}:${email}:${role}:${expiresAtStr}`;
    const expectedSignature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
    if (signature !== expectedSignature) return null;
    
    return { userId, email, role };
  } catch (err) {
    return null;
  }
};

// Middleware: Exige que a requisição esteja autenticada (via Cookie ou Bearer Token)
const requireAuth = async (req: any, res: any, next: any) => {
  let token = req.cookies?.session_token;
  
  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.substring(7);
  }

  const user = await verifyToken(token);
  if (user) {
    req.user = user;
    return next();
  }

  return res.status(401).json({ error: 'Sessão inválida ou expirada. Por favor, faça login novamente.' });
};

// Middleware: Exige que o usuário autenticado tenha permissões de administrador
const requireAdmin = (req: any, res: any, next: any) => {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado: recursos exclusivos de administrador.' });
    }
    next();
  });
};

// Middleware: Rate Limiter simples em memória
const rateLimiterAttempts = new Map<string, { count: number, lastAttempt: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [ip, attempt] of rateLimiterAttempts.entries()) {
    if (now - attempt.lastAttempt > 60000) {
      rateLimiterAttempts.delete(ip);
    }
  }
}, 60000);

const rateLimiter = (limit: number, windowMs: number) => {
  return (req: any, res: any, next: any) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const now = Date.now();
    const attempt = rateLimiterAttempts.get(ip);
    
    if (!attempt) {
      rateLimiterAttempts.set(ip, { count: 1, lastAttempt: now });
      return next();
    }
    
    if (now - attempt.lastAttempt > windowMs) {
      attempt.count = 1;
      attempt.lastAttempt = now;
      return next();
    }
    
    if (attempt.count >= limit) {
      const waitTime = Math.ceil((windowMs - (now - attempt.lastAttempt)) / 1000);
      return res.status(429).json({ error: `Muitas requisições. Por favor, aguarde ${waitTime} segundos.` });
    }
    
    attempt.count++;
    next();
  };
};

// Controle de tentativas de login por e-mail (Proteção contra Força Bruta no Banco de Dados)
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutos

// Limpeza periódica de bloqueios expirados do banco de dados (a cada 5 minutos)
setInterval(async () => {
  try {
    await query('DELETE FROM public.login_attempts WHERE lock_until < NOW()');
  } catch (err) {
    console.error('[Cleanup] Erro ao limpar tentativas de login expiradas do banco:', err);
  }
}, 5 * 60 * 1000);


const isFlashQuizCompleted = async (email: string, userId: string): Promise<boolean> => {
  if (userId) {
    try {
      const { data } = await dbAdmin
        .from('xp_logs')
        .select('created_at')
        .eq('user_id', userId)
        .eq('reason', 'Flash Quiz: Maranhão')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        const lastQuizTime = new Date(data.created_at).getTime();
        const now = Date.now();
        const sixHours = 6 * 60 * 60 * 1000;
        if (now - lastQuizTime < sixHours) {
          return true;
        }
      }
    } catch (e) {
      console.error('Error checking last quiz log:', e);
    }
  }
  return false;
};

// Identifica o cargo do usuário
const getUserWithRole = (user: any) => {
  if (!user) return null;
  const isAdmin = user.role === 'admin';

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
    const { data: users, error: usersError } = await dbAdmin.from('users').select('id');
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
      const { error } = await dbAdmin.from('notifications').insert(notifRecords);
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
app.post('/api/auth/login', rateLimiter(5, 60 * 1000), async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });

  const cleanEmail = email.toLowerCase().trim();

  // Verifica bloqueio de conta no banco de dados (Força Bruta)
  let isLocked = false;
  let waitTime = 0;
  try {
    const { rows: attemptRows } = await query('SELECT attempts, lock_until FROM public.login_attempts WHERE email = $1', [cleanEmail]);
    if (attemptRows.length > 0) {
      const attempt = attemptRows[0];
      if (attempt.lock_until && Date.now() < new Date(attempt.lock_until).getTime()) {
        isLocked = true;
        waitTime = Math.ceil((new Date(attempt.lock_until).getTime() - Date.now()) / 60000);
      }
    }
  } catch (err) {
    console.error('[Auth Lock Check] Erro ao verificar bloqueio:', err);
  }

  if (isLocked) {
    return res.status(429).json({ error: `Conta temporariamente bloqueada por excesso de tentativas. Tente novamente em ${waitTime} minutos.` });
  }

  try {
    // 1. Administradores via Supabase Auth
    try {
      if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
        const { data: authData, error: authError } = await getSupabaseAnonClient().auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        const { data: adminRow, error: adminRowError } = await dbAdmin
          .from('admin_users')
          .select('*')
          .eq('email', cleanEmail)
          .maybeSingle();

        if (adminRowError) throw adminRowError;

        const isAuthAdmin = !!authData.user && (
          adminRow ||
          authData.user.app_metadata?.role === 'admin' ||
          authData.user.user_metadata?.role === 'admin'
        );

        if (authData.user && isAuthAdmin) {
          const adminName = authData.user.user_metadata?.name
            || authData.user.user_metadata?.full_name
            || authData.user.email?.split('@')[0]
            || cleanEmail.split('@')[0];

          if (!adminRow) {
            await dbAdmin.from('admin_users').insert([{
              id: crypto.randomUUID(),
              email: cleanEmail,
              name: adminName,
              role: 'admin',
              auth_user_id: authData.user.id,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }]);
          } else if (adminRow.auth_user_id !== authData.user.id) {
            await query(
              'UPDATE public.admin_users SET auth_user_id = $1, updated_at = NOW() WHERE email = $2',
              [authData.user.id, cleanEmail]
            );
          }

          const userObj = getUserWithRole({
            ...(adminRow || {
              id: authData.user.id,
              email: cleanEmail,
              name: adminName,
              role: 'admin',
            }),
            id: authData.user.id,
            email: cleanEmail,
            name: adminName,
            role: 'admin'
          });

          const token = generateToken(userObj.id, userObj.email, userObj.role);
          res.cookie('session_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000
          });

          try {
            await query('DELETE FROM public.login_attempts WHERE email = $1', [cleanEmail]);
          } catch (e) {}
          return res.json({ success: true, user: userObj });
        }
      }
    } catch (authErr) {
      console.error('[Auth Admin] Erro ao autenticar via Supabase:', authErr);
    }

    // 2. Tabela de Alunos
    const { data: student, error: studentError } = await dbAdmin
      .from('users')
      .select('*')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (studentError) throw studentError;

    if (student) {
      const dbPassword = student.password_hash || student.password || student.pasword;
      if (!dbPassword) return res.status(401).json({ error: 'Conta sem senha definida. Entre em contato com o suporte.' });

      let isValid = false;
      let needsHashUpgrade = false;
      if (dbPassword.startsWith('$2a$') || dbPassword.startsWith('$2b$')) {
        isValid = await bcrypt.compare(password, dbPassword);
      } else {
        isValid = dbPassword === password;
        if (isValid) needsHashUpgrade = true;
      }

      if (isValid) {
        if (needsHashUpgrade) {
          try {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);
            await dbAdmin.from('users').update({ password_hash: hashedPassword }).eq('id', student.id);
            console.log(`[Security] Senha legada do usuário ${student.email} convertida para BCrypt com sucesso.`);
          } catch (e) {
            console.error('[Security] Erro ao converter senha legada:', e);
          }
        }
        const userObj = getUserWithRole(student);
        if (userObj) {
          const token = generateToken(userObj.id, userObj.email, userObj.role);
          res.cookie('session_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000
          });
        }
        try {
          await query('DELETE FROM public.login_attempts WHERE email = $1', [cleanEmail]);
        } catch (e) {}
        return res.json({ success: true, user: userObj });
      }
    }

    // Incrementar tentativas falhas no banco de dados
    try {
      const { rows: currentAttemptRows } = await query('SELECT attempts FROM public.login_attempts WHERE email = $1', [cleanEmail]);
      if (currentAttemptRows.length > 0) {
        const newAttempts = currentAttemptRows[0].attempts + 1;
        let lockUntil: string | null = null;
        if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
          lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString();
        }
        await query('UPDATE public.login_attempts SET attempts = $1, lock_until = $2, updated_at = NOW() WHERE email = $3', [newAttempts, lockUntil, cleanEmail]);
      } else {
        await query('INSERT INTO public.login_attempts (email, attempts, lock_until) VALUES ($1, 1, NULL)', [cleanEmail]);
      }
    } catch (dbErr) {
      console.error('[Auth Increment] Erro ao registrar tentativa falha:', dbErr);
    }

    return res.status(401).json({ error: 'E-mail ou senha inválidos.' });

  } catch (err: any) {
    console.error('[Auth] Login error:', err.message);
    res.status(500).json({ error: 'Falha na autenticação.' });
  }
});

// Função utilitária para sanitizar strings (escapando caracteres especiais contra XSS)
const sanitizeInput = (input: string) => {
  if (!input) return '';
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .trim()
    .substring(0, 100);
};

// REGISTER
app.post('/api/auth/register', rateLimiter(5, 60 * 1000), async (req, res) => {
  const { email, password, name, city, school, gremio } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });

  if (password.length < 6) {
    return res.status(400).json({ error: 'A senha deve conter no mínimo 6 caracteres.' });
  }

  const cleanEmail = email.toLowerCase().trim();
  const safeName = sanitizeInput(name);
  const safeCity = sanitizeInput(city);
  const safeSchool = sanitizeInput(school);
  const safeGremio = sanitizeInput(gremio);

  try {
    const { rows: adminExists } = await query('SELECT 1 FROM public.admin_users WHERE email = $1 LIMIT 1', [cleanEmail]);
    if (adminExists.length > 0) {
      return res.status(403).json({ error: 'E-mails administrativos devem ser gerenciados pelo banco de dados.' });
    }

    const { data: existing } = await dbAdmin.from('users').select('email').eq('email', cleanEmail).maybeSingle();
    if (existing) return res.status(400).json({ error: 'E-mail já cadastrado.' });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newStudent = {
      id: crypto.randomUUID(),
      email: cleanEmail,
      name: safeName || cleanEmail.split('@')[0],
      role: 'student',
      city: safeCity,
      school: safeSchool,
      gremio: safeGremio,
      xp: 0,
      level: 1,
      created_at: new Date().toISOString(),
      password_hash: hashedPassword
    };

    const { data, error } = await dbAdmin.from('users').insert([newStudent]).select().single();
    if (error) throw error;

    const userObj = getUserWithRole(data);
    if (userObj) {
      const token = generateToken(userObj.id, userObj.email, userObj.role);
      res.cookie('session_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000
      });
    }

    res.status(201).json({ success: true, user: userObj });
  } catch (err: any) {
    console.error('[Auth] Register error:', err.message);
    res.status(500).json({ error: 'Erro ao criar conta.' });
  }
});

// DELETE USER
app.post('/api/auth/delete-user', requireAuth, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'E-mail é obrigatório.' });
  const cleanEmail = email.toLowerCase().trim();

  if (req.user.role !== 'admin' && req.user.email !== cleanEmail) {
    return res.status(403).json({ error: 'Acesso negado: permissões insuficientes.' });
  }

  try {
    const { rows: adminRows } = await query('SELECT auth_user_id FROM public.admin_users WHERE email = $1 LIMIT 1', [cleanEmail]);
    const authUserId = adminRows[0]?.auth_user_id;
    const { data: userData } = await dbAdmin.from('users').select('id').eq('email', cleanEmail).maybeSingle();
    if (userData?.id) {
      const userId = userData.id;
      await dbAdmin.from('xp_logs').delete().eq('user_id', userId);
      await dbAdmin.from('answers').delete().eq('user_id', userId);
      await dbAdmin.from('notifications').delete().eq('user_id', userId);
    }

    await dbAdmin.from('users').delete().eq('email', cleanEmail);
    await dbAdmin.from('admin_users').delete().eq('email', cleanEmail);

    if (authUserId) {
      await dbAdmin.auth.admin.deleteUser(authUserId);
    } else {
      const { data: authResult } = await dbAdmin.auth.admin.listUsers();
      const target = authResult?.users?.find((u: any) => u.email?.toLowerCase() === cleanEmail);
      if (target) await dbAdmin.auth.admin.deleteUser(target.id);
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error('[POST /api/auth/delete-user] Error:', err);
    res.status(500).json({ error: 'Erro ao remover.' });
  }
});

app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  const { email, currentPassword, newPassword } = req.body;
  if (!email || !currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
  }

  const cleanEmail = email.toLowerCase().trim();

  if (req.user.role !== 'admin' && req.user.email !== cleanEmail) {
    return res.status(403).json({ error: 'Acesso negado: permissões insuficientes.' });
  }

  try {
    // Verifica se é administrador
    const { data: adminExists } = await dbAdmin
      .from('admin_users')
      .select('id')
      .eq('email', cleanEmail)
      .maybeSingle();

    const isAdmin = !!adminExists;

    // 1. Administrador (Supabase Auth)
    if (isAdmin) {
      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return res.status(500).json({ error: 'Supabase Auth n�o configurado para admins.' });
      }

      try {
        const { data: authData, error: authError } = await getSupabaseAnonClient().auth.signInWithPassword({
          email: cleanEmail,
          password: currentPassword,
        });

        if (authError || !authData.user) {
          return res.status(401).json({ error: 'Senha atual incorreta.' });
        }

        const adminName = authData.user.user_metadata?.name
          || authData.user.user_metadata?.full_name
          || authData.user.email?.split('@')[0]
          || cleanEmail.split('@')[0];

        const { data: adminRow, error: adminRowError } = await dbAdmin
          .from('admin_users')
          .select('id, auth_user_id')
          .eq('email', cleanEmail)
          .maybeSingle();

        if (adminRowError) throw adminRowError;

        const adminAuth = dbAdmin.auth.admin;
        const targetUserId = adminRow?.auth_user_id || authData.user.id;
        await adminAuth.updateUserById(targetUserId, { password: newPassword });

        if (!adminRow) {
          await dbAdmin.from('admin_users').insert([{
            id: crypto.randomUUID(),
            email: cleanEmail,
            name: adminName,
            role: 'admin',
            auth_user_id: authData.user.id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }]);
        } else if (!adminRow.auth_user_id) {
          await query('UPDATE admin_users SET auth_user_id = $1, updated_at = NOW() WHERE email = $2', [authData.user.id, cleanEmail]);
        }

        return res.json({ success: true, message: 'Senha atualizada com sucesso.' });
      } catch (authErr) {
        console.error('[Change Password] Erro ao atualizar senha no Supabase Auth:', authErr);
        return res.status(500).json({ error: 'Erro ao alterar senha via Supabase Auth.' });
      }
    }

    // 2. Estudante (Tabela public.users)
    const { data: student, error: studentError } = await dbAdmin
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

    const { error: updateError } = await dbAdmin
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

// LOGOUT
app.post('/api/auth/logout', async (req, res) => {
  const token = req.cookies?.session_token;
  if (token) {
    try {
      const parts = token.split(':');
      if (parts.length === 5) {
        const expiresAtMs = parseInt(parts[3], 10);
        const expiresAtDate = new Date(expiresAtMs).toISOString();
        await query('INSERT INTO public.revoked_tokens (token, expires_at) VALUES ($1, $2) ON CONFLICT DO NOTHING', [token, expiresAtDate]);
      }
    } catch (err) {
      console.error('[Logout] Erro ao registrar token revogado no banco:', err);
    }
  }
  
  res.clearCookie('session_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  });
  res.json({ success: true });
});

// PROFILE
app.get('/api/user/profile', requireAuth, async (req, res) => {
  let email = req.query.email as string;
  if (!email) {
    email = req.user.email;
  }
  const cleanEmail = email.toLowerCase().trim();

  if (req.user.role !== 'admin' && req.user.email !== cleanEmail) {
    return res.status(403).json({ error: 'Acesso negado: permissões insuficientes.' });
  }

  try {
    // 1. Busca se é administrador em admin_users
    const { data: adminData } = await dbAdmin
      .from('admin_users')
      .select('*')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (adminData) {
      return res.json(getUserWithRole(adminData));
    }



    // 2. Busca na tabela de usuários comuns (estudantes)
    const { data, error } = await dbAdmin.from('users').select('*').eq('email', cleanEmail).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json(getUserWithRole(data));
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao buscar perfil.' });
  }
});

app.post('/api/user/profile', requireAuth, async (req, res) => {
  const updateData = req.body;
  const email = (updateData.email || '').toLowerCase().trim();
  if (!email) return res.status(400).json({ error: 'E-mail obrigatório' });

  if (req.user.role !== 'admin' && req.user.email !== email) {
    return res.status(403).json({ error: 'Acesso negado: permissões insuficientes.' });
  }

  // Proteção contra Mass Assignment do campo role
  if (updateData.role !== undefined && req.user.role !== 'admin') {
    delete updateData.role;
  }

  // Verifica se é administrador
  const { data: adminExists } = await dbAdmin
    .from('admin_users')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  const isAdmin = !!adminExists;

  const dbUpdate: any = { email };
  
  // Mapeamento explícito de campos permitidos para as colunas do banco de dados (snake_case)
  const fieldMapping: Record<string, string> = {
    name: 'name',
    city: 'city',
    school: 'school',
    gremio: 'gremio',
    showInLeaderboard: 'show_in_leaderboard',
    languagePreference: 'language_preference'
  };

  if (req.user.role === 'admin') {
    fieldMapping.xp = 'xp';
    fieldMapping.level = 'level';
    fieldMapping.role = 'role';
    fieldMapping.answeredQuestions = 'answered_questions';
    fieldMapping.correctAnswers = 'correct_answers';
    fieldMapping.streak = 'streak';
  }

  Object.entries(fieldMapping).forEach(([camelKey, snakeKey]) => {
    if (updateData[camelKey] !== undefined) {
      dbUpdate[snakeKey] = updateData[camelKey];
    }
  });

  const isFlashQuizUpdate = !!updateData.isFlashQuizUpdate;

  // Fetch the old user profile from database to determine if XP has increased
  let xpDiff = 0;
  let userId = null;
  let oldXp = 0;
  try {
    const { data: oldUser } = await dbAdmin.from('users').select('id, xp').eq('email', email).maybeSingle();
    if (oldUser) {
      userId = oldUser.id;
      oldXp = oldUser.xp || 0;
      if (dbUpdate.xp !== undefined) {
        const newXp = dbUpdate.xp;
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
      dbUpdate.xp = oldXp;
      xpDiff = 0;
    } else {
      // First completion: mark in database
      dbUpdate.flash_quiz_completed = true;
    }
  }

  try {
    const targetTable = isAdmin ? 'admin_users' : 'users';
    const updatePayload = isAdmin 
      ? { name: dbUpdate.name, email: dbUpdate.email }
      : dbUpdate;

    const { data, error } = await dbAdmin.from(targetTable).update(updatePayload).eq('email', email).select().single();
    if (error && error.code === 'PGRST116') {
      if (!isAdmin) {
        dbUpdate.password_hash = 'managed_by_auth';
        const ins = await dbAdmin.from('users').insert([dbUpdate]).select().single();
        if (ins.data && ins.data.xp > 0) {
          await dbAdmin.from('xp_logs').insert([{
            user_id: ins.data.id,
            amount: ins.data.xp,
            reason: 'XP Inicial',
            created_at: new Date().toISOString()
          }]);
        }
        return res.json({ success: true, user: getUserWithRole(ins.data) });
      } else {
        const newAdminPayload = {
          id: req.user.userId || crypto.randomUUID(),
          email,
          name: updateData.name || email.split('@')[0],
          role: 'admin',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        const ins = await dbAdmin.from('admin_users').insert([newAdminPayload]).select().single();
        return res.json({ success: true, user: getUserWithRole(ins.data) });
      }
    }
    if (error) throw error;

    // If there is an XP increase, insert an entry in xp_logs to feed weekly charts
    if (!isAdmin && userId && xpDiff > 0) {
      await dbAdmin.from('xp_logs').insert([{
        user_id: userId,
        amount: xpDiff,
        reason: updateData.xpReason || (isFlashQuizUpdate ? 'Flash Quiz: Maranhão' : 'Conclusão de Simulado / Atividade'),
        created_at: new Date().toISOString()
      }]);
    }

    res.json({ success: true, user: getUserWithRole(data) });
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao salvar.' });
  }
});

app.delete('/api/user/profile', requireAuth, async (req, res) => {
  const email = (req.query.email || req.body.email) as string;
  if (!email) return res.status(400).json({ error: 'E-mail é obrigatório.' });
  const cleanEmail = email.toLowerCase().trim();

  if (req.user.role !== 'admin' && req.user.email !== cleanEmail) {
    return res.status(403).json({ error: 'Acesso negado: permissões insuficientes.' });
  }

  try {
    const { data: userData } = await dbAdmin.from('users').select('id').eq('email', cleanEmail).maybeSingle();
    const { rows: adminRows } = await query('SELECT auth_user_id FROM public.admin_users WHERE email = $1 LIMIT 1', [cleanEmail]);
    const authUserId = adminRows[0]?.auth_user_id;

    if (userData?.id) {
      const userId = userData.id;
      // Clean up linked data in other tables to avoid foreign key violations
      await dbAdmin.from('xp_logs').delete().eq('user_id', userId);
      await dbAdmin.from('answers').delete().eq('user_id', userId);
      await dbAdmin.from('notifications').delete().eq('user_id', userId);
      await dbAdmin.from('users').delete().eq('email', cleanEmail);
    }

    await dbAdmin.from('admin_users').delete().eq('email', cleanEmail);

    if (authUserId) {
      await dbAdmin.auth.admin.deleteUser(authUserId);
    } else {
      const { data: authResult } = await dbAdmin.auth.admin.listUsers();
      const target = authResult?.users?.find((u: any) => u.email?.toLowerCase() === cleanEmail);
      if (target) {
        await dbAdmin.auth.admin.deleteUser(target.id);
      }
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error('[DELETE /api/user/profile] Error:', err);
    res.status(500).json({ error: 'Erro ao remover perfil.' });
  }
});

// NOTIFICATIONS
app.get('/api/notifications', requireAuth, async (req, res) => {
  let email = req.query.email as string;
  if (!email) {
    email = req.user.email;
  }
  const cleanEmail = email.toLowerCase().trim();

  if (req.user.role !== 'admin' && req.user.email !== cleanEmail) {
    return res.status(403).json({ error: 'Acesso negado: permissões insuficientes.' });
  }

  try {
    let dbQuery = dbAdmin.from('notifications').select('*');

    if (cleanEmail) {
      const { data: user } = await dbAdmin.from('users').select('id').eq('email', cleanEmail).maybeSingle();
      if (user) {
        dbQuery = dbQuery.eq('user_id', user.id);
      } else {
        return res.json([]);
      }
    }

    const { data, error } = await dbQuery.order('created_at', { ascending: false });
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
app.get('/api/user/stats', requireAuth, async (req, res) => {
  let email = (req.query.email as string || '').toLowerCase().trim();
  if (!email) {
    email = req.user.email;
  }
  const cleanEmail = email.toLowerCase().trim();

  if (req.user.role !== 'admin' && req.user.email !== cleanEmail) {
    return res.status(403).json({ error: 'Acesso negado: permissões insuficientes.' });
  }

  try {
    // Busca o user id
    const { data: user } = await dbAdmin.from('users').select('id').eq('email', cleanEmail).maybeSingle();
    if (!user) return res.json({ weekly: [], summary: { average: 0, best: 0, total: 0 } });

    // Busca logs de XP dos últimos 7 dias
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: logs } = await dbAdmin
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
      const lastQuizTime = new Date(lastQuizLog.created_at).getTime();
      const now = Date.now();
      const sixHours = 6 * 60 * 60 * 1000;
      if (now - lastQuizTime < sixHours) {
        quizDone = true;
        secondsRemaining = Math.max(0, Math.ceil((lastQuizTime + sixHours - now) / 1000));
      }
    }

    res.json({
      weekly,
      summary: { average, best, total },
      flashQuizCompleted: quizDone,
      quizSecondsRemaining: secondsRemaining
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao processar estatísticas' });
  }
});

// LEADERBOARD (Real Users Ranking)
app.get('/api/leaderboard', async (req, res) => {
  try {
    const { data, error } = await dbAdmin
      .from('users')
      .select('name, email, city, xp, level, role, show_in_leaderboard');

    if (error) throw error;

    // Filtra administradores e estudantes que desativaram exibição no ranking
    const filteredLeaderboard = (data || [])
      .filter(u => {
        const isAdmin = u.role === 'admin';
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
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await dbAdmin
      .from('users')
      .select('*')
      .order('xp', { ascending: false });
    if (error) throw error;

    const regularStudents = (data || []).filter(u => {
      const isAdmin = u.role === 'admin';
      return !isAdmin;
    });
    res.json(regularStudents);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.get('/api/admin/activities', requireAdmin, async (req, res) => {
  try {
    const { rows: logs } = await query(`
      SELECT x.*, u.name as user_name, u.city as user_city
      FROM xp_logs x
      LEFT JOIN users u ON x.user_id = u.id
      ORDER BY x.created_at DESC
      LIMIT 20
    `);

    const activities = (logs || []).map((log: any) => {
      const time = new Date(log.created_at);
      const diff = Math.floor((new Date().getTime() - time.getTime()) / 60000); // minutes
      let timeStr = 'Agora';
      if (diff > 0 && diff < 60) timeStr = `Há ${diff} min`;
      else if (diff >= 60 && diff < 1440) timeStr = `Há ${Math.floor(diff / 60)}h`;
      else if (diff >= 1440) timeStr = `Há ${Math.floor(diff / 1440)} dias`;

      return {
        id: log.id,
        user: log.user_name || 'Estudante',
        action: `Ganhou ${log.amount} XP: ${log.reason || 'Atividade'}`,
        time: timeStr,
        city: log.user_city || 'Brasil'
      };
    });

    // Calculate weekly editorial production
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [mats, recs] = await Promise.all([
      dbAdmin.from('materials').select('uploaded_at').gte('uploaded_at', sevenDaysAgo.toISOString().split('T')[0]),
      dbAdmin.from('mural').select('created_at').gte('created_at', sevenDaysAgo.toISOString())
    ]);

    const production: any = {};
    const days = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      production[days[d.getDay()]] = 0;
    }

    (mats.data || []).forEach((m: any) => {
      const d = new Date(m.uploaded_at);
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

app.post('/api/notifications/read-all', requireAuth, async (req, res) => {
  let email = req.query.email as string;
  if (!email) {
    email = req.user.email;
  }
  const cleanEmail = email.toLowerCase().trim();

  if (req.user.role !== 'admin' && req.user.email !== cleanEmail) {
    return res.status(403).json({ error: 'Acesso negado: permissões insuficientes.' });
  }

  try {
    let query = dbAdmin.from('notifications').update({ is_read: true }).eq('is_read', false);

    if (cleanEmail) {
      const { data: user } = await dbAdmin.from('users').select('id').eq('email', cleanEmail).maybeSingle();
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

app.post('/api/notifications/:id/read', requireAuth, async (req, res) => {
  try {
    // Valida que a notificação pertence ao usuário logado
    const { data: notif } = await dbAdmin
      .from('notifications')
      .select('user_id')
      .eq('id', req.params.id)
      .maybeSingle();

    if (notif && notif.user_id !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado: permissões insuficientes.' });
    }

    const { error } = await dbAdmin.from('notifications').update({ is_read: true }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('[POST /api/notifications/:id/read] Error:', err);
    res.json({ success: false });
  }
});

// UPLOAD DE ARQUIVOS (PDF, ETC) COM LOCAL STORAGE MOCKED
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // Limite de 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/gif'
    ];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido. Apenas PDFs e imagens (PNG, JPEG, GIF) são aceitos.'));
    }
  }
});

app.post('/api/upload', requireAdmin, (req: any, res: any, next: any) => {
  upload.single('file')(req, res, (err: any) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req: any, res: any) => {
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

    const { data, error } = await dbAdmin.storage
      .from('materials')
      .upload(filename, file.buffer, {
        contentType: file.mimetype,
        cacheControl: '3600',
        upsert: true
      });

    if (error) {
      console.error('[Storage] Upload error:', error);
      return res.status(500).json({ error: 'Erro ao fazer upload no Storage: ' + error.message });
    }

    const { data: { publicUrl } } = dbAdmin.storage
      .from('materials')
      .getPublicUrl(filename);

    res.json({ url: publicUrl });
  } catch (error: any) {
    console.error('[POST /api/upload] Error:', error);
    res.status(500).json({ error: 'Erro ao fazer upload do arquivo: ' + error.message });
  }
});

// MATERIALS
app.get('/api/materials', requireAuth, async (req, res) => {
  try {
    const { data, error } = await dbAdmin.from('materials').select('*').order('id', { ascending: false });
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

app.post('/api/materials', requireAdmin, async (req, res) => {
  try {
    const dbRecord = {
      title: req.body.title,
      content_url: req.body.url,
      type: req.body.type,
      subject: req.body.foco || req.body.subject || 'ENEM geral',
      description: req.body.description || ''
    };
    const { data, error } = await dbAdmin.from('materials').insert([dbRecord]).select().single();
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

app.delete('/api/materials/:id', requireAdmin, async (req, res) => {
  try {
    await dbAdmin.from('materials').delete().eq('id', req.params.id);
    res.status(204).end();
  } catch (err) { res.status(204).end(); }
});

app.put('/api/materials/:id', requireAdmin, async (req, res) => {
  try {
    const dbRecord = {
      title: req.body.title,
      content_url: req.body.url,
      type: req.body.type,
      subject: req.body.foco || req.body.subject || 'ENEM geral',
      description: req.body.description || ''
    };
    const { data, error } = await dbAdmin.from('materials').update(dbRecord).eq('id', req.params.id).select().single();
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
app.get('/api/recados', requireAuth, async (req, res) => {
  try {
    const { data, error } = await dbAdmin.from('mural').select('*').order('created_at', { ascending: false });
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

app.post('/api/recados', requireAdmin, async (req, res) => {
  try {
    const dbBody = {
      title: req.body.title,
      content: req.body.content,
      type: req.body.category ? req.body.category.toUpperCase() : 'GERAL'
    };

    const { data, error } = await dbAdmin.from('mural').insert([dbBody]).select().single();
    if (error) {
      console.error('[POST /api/recados] Database insertion error:', error);
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

app.delete('/api/recados/:id', requireAdmin, async (req, res) => {
  try {
    const { error } = await dbAdmin.from('mural').delete().eq('id', req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(204).end();
  }
});

app.put('/api/recados/:id', requireAdmin, async (req, res) => {
  try {
    const dbBody = {
      title: req.body.title,
      content: req.body.content,
      type: req.body.category ? req.body.category.toUpperCase() : 'GERAL'
    };

    const { data, error } = await dbAdmin.from('mural').update(dbBody).eq('id', req.params.id).select().single();
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
app.get('/api/eventos', requireAuth, async (req, res) => {
  try {
    const { data, error } = await dbAdmin
      .from('events')
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

app.post('/api/eventos', requireAdmin, async (req, res) => {
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

    const { data, error } = await dbAdmin
      .from('events')
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

app.delete('/api/eventos/:id', requireAdmin, async (req, res) => {
  try {
    const { error } = await dbAdmin
      .from('events')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) {
    console.error('[DELETE /api/eventos/:id] Error:', err);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

app.put('/api/eventos/:id', requireAdmin, async (req, res) => {
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

    const { data, error } = await dbAdmin
      .from('events')
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
app.get('/api/questoes', requireAuth, async (req, res) => {
  const { year, limit = 50, offset = 0 } = req.query;
  if (!year) return res.status(400).json({ error: 'Ano necessário' });
  try {
    const { data: dbData } = await dbAdmin.from('questions').select('*, question_options(*)').eq('year', year).order('index', { ascending: true }).range(Number(offset), Number(offset) + Number(limit) - 1);
    if (dbData?.length) return res.json({ questions: dbData.map(q => ({ ...q, alternatives: q.question_options?.sort((a: any, b: any) => a.letter.localeCompare(b.letter)) || [] })) });
    const response = await fetch(`https://api.enem.dev/v1/exams/${year}/questions?limit=${limit}&offset=${offset}`);
    const data = await response.json();
    res.json(data);
  } catch (error) { res.status(500).json({ error: 'Erro ao buscar questões' }); }
});

app.post('/api/answers', requireAuth, async (req, res) => {
  const { userId, questionId, isCorrect, selectedOption, questionData } = req.body;
  try {
    // 1. Verificar se a questão já existe no banco
    const qCheck = await query('SELECT 1 FROM public.questions WHERE id = $1 LIMIT 1', [questionId]);
    
    if (qCheck.rows.length === 0 && questionData) {
      console.log(`[POST /api/answers] Caching question ${questionId}...`);
      // Inserir a questão
      await query(
        `INSERT INTO public.questions (id, subject, text, image_url, correct_option_index, explanation, difficulty, xp_reward, year, index)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO NOTHING`,
        [
          questionId,
          questionData.subject || 'Geral',
          questionData.text,
          questionData.imageUrl || null,
          questionData.correctOptionIndex,
          questionData.explanation || 'Resolução baseada nos critérios oficiais do ENEM.',
          questionData.difficulty || 'médio',
          questionData.xpReward || 50,
          questionData.year || 2023,
          questionData.index || 0
        ]
      );

      // Inserir as alternativas
      if (Array.isArray(questionData.options)) {
        for (let idx = 0; idx < questionData.options.length; idx++) {
          const optText = questionData.options[idx];
          const optImg = questionData.optionImages?.[idx] || null;
          const letter = String.fromCharCode(65 + idx); // A, B, C, D, E...
          const isCorrectOption = idx === questionData.correctOptionIndex;

          await query(
            `INSERT INTO public.question_options (id, question_id, text, image_url, letter, is_correct)
             VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5)`,
            [questionId, optText, optImg, letter, isCorrectOption]
          );
        }
      }
    }

    // 2. Inserir a resposta do aluno
    await query(
      `INSERT INTO public.answers (id, user_id, question_id, selected_option_index, is_correct, created_at)
       VALUES (uuid_generate_v4(), $1, $2, $3, $4, NOW())`,
      [userId, questionId, selectedOption !== undefined ? selectedOption : null, isCorrect]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[POST /api/answers] Error logging answer:', err);
    res.status(500).json({ error: 'Erro ao registrar resposta.' });
  }
});

app.get('/api/user/errors', requireAuth, async (req, res) => {
  let email = req.query.email as string;
  if (!email) {
    email = req.user.email;
  }
  const cleanEmail = email.toLowerCase().trim();

  if (req.user.role !== 'admin' && req.user.email !== cleanEmail) {
    return res.status(403).json({ error: 'Acesso negado: permissões insuficientes.' });
  }

  try {
    // 1. Obter o ID do usuário pelo e-mail
    const userRes = await query('SELECT id FROM public.users WHERE email = $1 LIMIT 1', [cleanEmail]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    const userId = userRes.rows[0].id;

    // 2. Buscar as últimas respostas incorretas (rn = 1 e is_correct = false)
    const errorsQuery = `
      WITH latest_answers AS (
        SELECT *,
               ROW_NUMBER() OVER(PARTITION BY question_id ORDER BY created_at DESC) as rn
        FROM public.answers
        WHERE user_id = $1
      )
      SELECT 
        la.id as answer_id,
        la.selected_option_index,
        la.created_at as answered_at,
        q.id as question_id,
        q.subject,
        q.text as question_text,
        q.image_url,
        q.correct_option_index,
        q.explanation,
        q.difficulty,
        q.year,
        q.index
      FROM latest_answers la
      JOIN public.questions q ON la.question_id = q.id
      WHERE la.rn = 1 AND la.is_correct = false
      ORDER BY la.created_at DESC;
    `;

    const errorsRes = await query(errorsQuery, [userId]);
    const errorsList = errorsRes.rows;

    // 3. Para cada erro, carregar suas alternativas
    const result = [];
    for (const errRow of errorsList) {
      const optsRes = await query(
        'SELECT text, image_url, letter, is_correct FROM public.question_options WHERE question_id = $1 ORDER BY letter ASC',
        [errRow.question_id]
      );
      
      result.push({
        id: errRow.question_id,
        subject: errRow.subject,
        text: errRow.question_text,
        imageUrl: errRow.image_url,
        correctOptionIndex: errRow.correct_option_index,
        explanation: errRow.explanation,
        difficulty: errRow.difficulty,
        year: errRow.year,
        index: errRow.index,
        selectedOptionIndex: errRow.selected_option_index,
        answeredAt: errRow.answered_at,
        options: optsRes.rows.map(opt => opt.text),
        optionImages: optsRes.rows.map(opt => opt.image_url),
      });
    }

    res.json(result);
  } catch (err: any) {
    console.error('[GET /api/user/errors] Error:', err);
    res.status(500).json({ error: 'Erro ao buscar caderno de erros.' });
  }
});

app.get('/api/imagem', async (req, res) => {
  const urlStr = req.query.url as string;
  if (!urlStr) return res.status(400).send('URL missing');
  try {
    const parsedUrl = new URL(urlStr);
    const hostname = parsedUrl.hostname.toLowerCase();
    
    // Allowlist de domínios seguros contra SSRF
    const allowedHostsEnv = process.env.ALLOWED_IMAGE_HOSTS || '';
    const extraHosts = allowedHostsEnv.split(',').map(h => h.trim().toLowerCase()).filter(Boolean);
    
    const isAllowedHost = hostname === 'enem.dev' || 
                          hostname === 'api.enem.dev' || 
                          extraHosts.includes(hostname);

    if (!isAllowedHost) {
      return res.status(403).send('Acesso negado: domínio não permitido.');
    }

    const response = await fetch(urlStr, { 
      headers: { 'User-Agent': 'Mozilla', 'Referer': 'https://enem.dev/' },
      redirect: 'manual'
    });
    
    // Bloqueia redirecionamentos para evitar desvio de DNS/Allowlist (SSRF)
    if (response.status >= 300 && response.status < 400) {
      return res.status(403).send('Acesso negado: redirecionamentos não são permitidos.');
    }
    
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

// QUESTOES
app.get('/api/questoes', requireAuth, async (req, res) => {
  const { year, limit = 50, offset = 0 } = req.query;
  if (!year) return res.status(400).json({ error: 'Ano necessário' });
  try {
    const { data: dbData } = await dbAdmin.from('questions').select('*, question_options(*)').eq('year', year).order('index', { ascending: true }).range(Number(offset), Number(offset) + Number(limit) - 1);
    if (dbData?.length) return res.json({ questions: dbData.map(q => ({ ...q, alternatives: q.question_options?.sort((a: any, b: any) => a.letter.localeCompare(b.letter)) || [] })) });
    const response = await fetch(`https://api.enem.dev/v1/exams/${year}/questions?limit=${limit}&offset=${offset}`);
    const data = await response.json();
    res.json(data);
  } catch (error) { res.status(500).json({ error: 'Erro ao buscar questões' }); }
});

app.post('/api/answers', requireAuth, async (req, res) => {
  const { userId, questionId, isCorrect, selectedOption, questionData } = req.body;
  try {
    // 1. Verificar se a questão já existe no banco
    const qCheck = await query('SELECT 1 FROM public.questions WHERE id = $1 LIMIT 1', [questionId]);
    
    if (qCheck.rows.length === 0 && questionData) {
      console.log(`[POST /api/answers] Caching question ${questionId}...`);
      // Inserir a questão
      await query(
        `INSERT INTO public.questions (id, subject, text, image_url, correct_option_index, explanation, difficulty, xp_reward, year, index)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO NOTHING`,
        [
          questionId,
          questionData.subject || 'Geral',
          questionData.text,
          questionData.imageUrl || null,
          questionData.correctOptionIndex,
          questionData.explanation || 'Resolução baseada nos critérios oficiais do ENEM.',
          questionData.difficulty || 'médio',
          questionData.xpReward || 50,
          questionData.year || 2023,
          questionData.index || 0
        ]
      );

      // Inserir as alternativas
      if (Array.isArray(questionData.options)) {
        for (let idx = 0; idx < questionData.options.length; idx++) {
          const optText = questionData.options[idx];
          const optImg = questionData.optionImages?.[idx] || null;
          const letter = String.fromCharCode(65 + idx); // A, B, C, D, E...
          const isCorrectOption = idx === questionData.correctOptionIndex;

          await query(
            `INSERT INTO public.question_options (id, question_id, text, image_url, letter, is_correct)
             VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5)`,
            [questionId, optText, optImg, letter, isCorrectOption]
          );
        }
      }
    }

    // 2. Inserir a resposta do aluno
    await query(
      `INSERT INTO public.answers (id, user_id, question_id, selected_option_index, is_correct, created_at)
       VALUES (uuid_generate_v4(), $1, $2, $3, $4, NOW())`,
      [userId, questionId, selectedOption !== undefined ? selectedOption : null, isCorrect]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[POST /api/answers] Error logging answer:', err);
    res.status(500).json({ error: 'Erro ao registrar resposta.' });
  }
});

app.get('/api/user/errors', requireAuth, async (req, res) => {
  let email = req.query.email as string;
  if (!email) {
    email = req.user.email;
  }
  const cleanEmail = email.toLowerCase().trim();

  if (req.user.role !== 'admin' && req.user.email !== cleanEmail) {
    return res.status(403).json({ error: 'Acesso negado: permissões insuficientes.' });
  }

  try {
    // 1. Obter o ID do usuário pelo e-mail
    const userRes = await query('SELECT id FROM public.users WHERE email = $1 LIMIT 1', [cleanEmail]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    const userId = userRes.rows[0].id;

    // 2. Buscar as últimas respostas incorretas (rn = 1 e is_correct = false)
    const errorsQuery = `
      WITH latest_answers AS (
        SELECT *,
               ROW_NUMBER() OVER(PARTITION BY question_id ORDER BY created_at DESC) as rn
        FROM public.answers
        WHERE user_id = $1
      )
      SELECT 
        la.id as answer_id,
        la.selected_option_index,
        la.created_at as answered_at,
        q.id as question_id,
        q.subject,
        q.text as question_text,
        q.image_url,
        q.correct_option_index,
        q.explanation,
        q.difficulty,
        q.year,
        q.index
      FROM latest_answers la
      JOIN public.questions q ON la.question_id = q.id
      WHERE la.rn = 1 AND la.is_correct = false
      ORDER BY la.created_at DESC;
    `;

    const errorsRes = await query(errorsQuery, [userId]);
    const errorsList = errorsRes.rows;

    // 3. Para cada erro, carregar suas alternativas
    const result = [];
    for (const errRow of errorsList) {
      const optsRes = await query(
        'SELECT text, image_url, letter, is_correct FROM public.question_options WHERE question_id = $1 ORDER BY letter ASC',
        [errRow.question_id]
      );
      
      result.push({
        id: errRow.question_id,
        subject: errRow.subject,
        text: errRow.question_text,
        imageUrl: errRow.image_url,
        correctOptionIndex: errRow.correct_option_index,
        explanation: errRow.explanation,
        difficulty: errRow.difficulty,
        year: errRow.year,
        index: errRow.index,
        selectedOptionIndex: errRow.selected_option_index,
        answeredAt: errRow.answered_at,
        options: optsRes.rows.map(opt => opt.text),
        optionImages: optsRes.rows.map(opt => opt.image_url),
      });
    }

    res.json(result);
  } catch (err: any) {
    console.error('[GET /api/user/errors] Error:', err);
    res.status(500).json({ error: 'Erro ao buscar caderno de erros.' });
  }
});

app.get('/api/imagem', async (req, res) => {
  const urlStr = req.query.url as string;
  if (!urlStr) return res.status(400).send('URL missing');
  try {
    const parsedUrl = new URL(urlStr);
    const hostname = parsedUrl.hostname.toLowerCase();
    
    // Allowlist de domínios seguros contra SSRF
    const allowedHostsEnv = process.env.ALLOWED_IMAGE_HOSTS || '';
    const extraHosts = allowedHostsEnv.split(',').map(h => h.trim().toLowerCase()).filter(Boolean);
    
    const isAllowedHost = hostname === 'enem.dev' || 
                          hostname === 'api.enem.dev' || 
                          extraHosts.includes(hostname);

    if (!isAllowedHost) {
      return res.status(403).send('Acesso negado: domínio não permitido.');
    }

    const response = await fetch(urlStr, { 
      headers: { 'User-Agent': 'Mozilla', 'Referer': 'https://enem.dev/' },
      redirect: 'manual'
    });
    
    // Bloqueia redirecionamentos para evitar desvio de DNS/Allowlist (SSRF)
    if (response.status >= 300 && response.status < 400) {
      return res.status(403).send('Acesso negado: redirecionamentos não são permitidos.');
    }
    
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

// Rota de Health Check para o Docker Compose
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

async function applyDbMigration() {
  try {
    console.log('[DB Migration] Checking database schema...');
    // Verificar se o tipo da coluna 'id' em public.questions já é varchar
    const typeCheck = await query(`
      SELECT data_type 
      FROM information_schema.columns 
      WHERE table_name = 'questions' AND column_name = 'id'
    `);
    
    if (typeCheck.rows.length > 0 && typeCheck.rows[0].data_type === 'uuid') {
      console.log('[DB Migration] Found uuid column in questions table. Applying migration...');
      const sqlPath = path.join(process.cwd(), 'migration_caderno_erros.sql');
      if (fs.existsSync(sqlPath)) {
        const sql = fs.readFileSync(sqlPath, 'utf8');
        await query(sql);
        console.log('[DB Migration] Database migration applied successfully!');
      } else {
        console.error('[DB Migration] migration_caderno_erros.sql file not found!');
      }
    } else {
      console.log('[DB Migration] Database schema is already up to date.');
    }
  } catch (err) {
    console.error('[DB Migration] Failed to run database migration:', err);
  }
}

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

(async () => {
  try {
    const logoSource = path.join(process.cwd(), 'src', 'components', 'logo.png');
    const faviconSourcePng = path.join(process.cwd(), 'src', 'components', 'logotopo.png');
    const faviconSourceIco = path.join(process.cwd(), 'src', 'components', 'favicon.ico');

    if (fs.existsSync(logoSource)) {
      const logoTargets = [
        path.join(process.cwd(), 'public', 'logo.png'),
        path.join(process.cwd(), 'dist', 'logo.png'),
        path.join(process.cwd(), 'dist', 'assets', 'logo.png'),
      ];

      for (const target of logoTargets) {
        const dir = path.dirname(target);
        if (fs.existsSync(dir)) {
          fs.copyFileSync(logoSource, target);
          console.log(`[Logo Setup] Copied main logo to ${target}`);
        }
      }
    } else {
      console.log('[Logo Setup] Main logo not found at src/components/logo.png.');
    }

    if (fs.existsSync(faviconSourcePng)) {
      const faviconPngTargets = [
        path.join(process.cwd(), 'public', 'logotopo.png'),
        path.join(process.cwd(), 'dist', 'logotopo.png'),
        path.join(process.cwd(), 'dist', 'assets', 'logotopo.png'),
        path.join(process.cwd(), 'public', 'icon-512.png'),
        path.join(process.cwd(), 'dist', 'icon-512.png'),
        path.join(process.cwd(), 'dist', 'assets', 'icon-512.png'),
      ];

      for (const target of faviconPngTargets) {
        const dir = path.dirname(target);
        if (fs.existsSync(dir)) {
          fs.copyFileSync(faviconSourcePng, target);
          console.log(`[Logo Setup] Copied PNG favicon asset to ${target}`);
        }
      }
    } else {
      console.log('[Logo Setup] PNG favicon source not found at src/components/logotopo.png.');
    }

    if (fs.existsSync(faviconSourceIco)) {
      const faviconIcoTargets = [
        path.join(process.cwd(), 'public', 'favicon.ico'),
        path.join(process.cwd(), 'dist', 'favicon.ico'),
        path.join(process.cwd(), 'dist', 'assets', 'favicon.ico'),
      ];

      for (const target of faviconIcoTargets) {
        const dir = path.dirname(target);
        if (fs.existsSync(dir)) {
          fs.copyFileSync(faviconSourceIco, target);
          console.log(`[Logo Setup] Copied ICO favicon asset to ${target}`);
        }
      }
    } else {
      console.log('[Logo Setup] ICO favicon source not found at src/components/favicon.ico.');
    }
  } catch (err) {
    console.error('[Logo Setup] Error copying logo/favicon assets:', err);
  }
  await applyDbMigration();
})();

if (!process.env.VERCEL) {
  const PORT = Number(process.env.PORT || 3000);
  const server = app.listen(PORT, '0.0.0.0', () => console.log(`Server production-ready on port ${PORT}`));

  // Graceful shutdown: garante zero downtime em rolling updates (Docker Swarm / EasyPanel).
  // Ao receber SIGTERM, para de aceitar novas conexões, drena as requisições em voo
  // e fecha o pool do Postgres antes de encerrar o processo.
  const shutdown = (signal: string) => {
    console.log(`${signal} recebido. Encerrando graciosamente...`);
    server.close(async () => {
      try {
        await pool.end();
        console.log('Pool do Postgres fechado. Processo encerrado.');
        process.exit(0);
      } catch (err) {
        console.error('Erro ao fechar o pool do Postgres:', err);
        process.exit(1);
      }
    });

    // Failsafe: se o drain travar, força a saída antes do SIGKILL do orquestrador.
    setTimeout(() => {
      console.error('Shutdown forçado após timeout.');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}




