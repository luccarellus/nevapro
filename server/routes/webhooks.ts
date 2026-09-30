import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { timingSafeEqual, randomBytes, createHash } from 'node:crypto';
import { dbAdmin } from '../lib/dbQueryBuilder';
import { normalizeEmail, sanitizeInput } from '../utils/sanitize';
import { log } from '../utils/logger';
import { rateLimiter } from '../middleware/rateLimiter';
import { sendPasswordResetEmail, sendWelcomeEmail } from '../services/email';
import { query } from '../../src/lib/db';
import { PLATFORM_TENANT_ID } from '../services/rbacService';

const router = Router();

/**
 * Comparação em tempo constante: evita que um atacante descubra o segredo do
 * webhook byte a byte medindo o tempo de resposta (timing attack).
 */
function safeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length === 0 || b.length !== a.length) {
    // Ainda assim, compare contra o próprio valor para manter o tempo estável.
    timingSafeEqual(Buffer.from(a || 'x'), Buffer.from(a || 'x'));
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Cria o token de redefinição (1h) para o aluno definir a própria senha
 * via o fluxo padrão de recuperação — a conta nasce SEM senha conhecida.
 */
async function createResetTokenForNewUser(email: string): Promise<string | null> {
  const resetToken = crypto.randomUUID().replace(/-/g, '');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  try {
    await query(
      `INSERT INTO public.password_reset_tokens (id, user_id, token, expires_at, created_at)
       SELECT gen_random_uuid(), id, $1, $2, NOW()
       FROM public.users WHERE email = $3`,
      // Hash SHA-256: token em texto claro só existe no e-mail (mesma política do /auth)
      [createHash('sha256').update(resetToken).digest('hex'), expiresAt.toISOString(), email],
    );
    return resetToken;
  } catch (err) {
    log.error('[Webhook EventEase] Erro ao criar token de definição de senha:', err);
    return null;
  }
}


/**
 * Webhook de integração do EventEase -> NevaPro
 * Endpoint: POST /api/webhooks/eventease
 * 
 * Cadastra um novo aluno no NevaPro automaticamente quando ele se registra no EventEase.
 * A senha padrão configurada é "nevapro123".
 */
router.post('/eventease', rateLimiter(10, 60_000), async (req: Request, res: Response) => {
  try {
    // 1. Validar Chave Secreta de Segurança (X-Webhook-Secret) — timing-safe
    const webhookSecret = req.headers['x-webhook-secret'];
    const expectedSecret = process.env.EVENTEASE_WEBHOOK_SECRET;

    if (!expectedSecret || typeof webhookSecret !== 'string' || !safeEqual(webhookSecret, expectedSecret)) {
      log.warn('[Webhook EventEase] Tentativa de acesso sem chave secreta válida.');
      res.status(401).json({ error: 'Chave de integração inválida ou não configurada.' });
      return;
    }

    const { email, name, city, school, gremio } = req.body || {};

    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'E-mail válido é obrigatório.' });
      return;
    }

    const cleanEmail = normalizeEmail(email);
    const safeName = sanitizeInput(name) || cleanEmail.split('@')[0];
    const safeCity = sanitizeInput(city);
    const safeSchool = sanitizeInput(school);
    const safeGremio = sanitizeInput(gremio);

    // 2. Verificar se o e-mail já existe na tabela de alunos
    const { data: existingUser, error: fetchError } = await dbAdmin
      .from('users')
      .select('id, email')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (fetchError) {
      log.error('[Webhook EventEase] Erro ao buscar usuário:', fetchError);
      res.status(500).json({ error: 'Erro ao verificar existência de usuário.' });
      return;
    }

    if (existingUser) {
      res.status(200).json({
        success: true,
        message: 'Usuário já cadastrado no NevaPro.',
        userId: existingUser.id,
      });
      return;
    }

    // 3. Credenciais temporárias: senha aleatória de alta entropia. NUNCA uma
    // senha padrão fixa conhecida (account takeover em massa).
    const tempPassword = randomBytes(18).toString('base64url'); // ~143 bits
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const newUserId = crypto.randomUUID();

    // 4. Cadastrar aluno no banco (com a senha temporária aleatória)
    const { data: newUser, error: insertError } = await dbAdmin
      .from('users')
      .insert({
        id: newUserId,
        email: cleanEmail,
        name: safeName,
        password_hash: passwordHash,
        role: 'student',
        tenant_id: PLATFORM_TENANT_ID,
        city: safeCity,
        school: safeSchool,
        gremio: safeGremio,
        xp: 0,
        level: 1,
        created_at: new Date().toISOString(),
      })
      .select('id, email, name')
      .single();

    if (insertError) {
      log.error('[Webhook EventEase] Erro ao cadastrar aluno:', insertError);
      res.status(500).json({ error: 'Erro ao criar conta no NevaPro.' });
      return;
    }

    // Vincula o novo aluno ao papel student (RBAC)
    try {
      await query(
        `INSERT INTO public.user_tenant_roles (user_id, tenant_id, role_id)
         SELECT $1, $2, id FROM public.roles WHERE code = 'student' AND tenant_id IS NULL
         ON CONFLICT (user_id, tenant_id, role_id) DO NOTHING`,
        [newUserId, PLATFORM_TENANT_ID],
      );
    } catch (rbacErr) {
      log.error('[Webhook EventEase] Erro ao vincular papel student:', rbacErr);
    }

    log.info(`[Webhook EventEase] Aluno cadastrado com sucesso: ${cleanEmail}`);

    // 5. E-mail com link de "definir senha" (1h). Envia de forma assíncrona; a
    // resposta ao webhook não depende da entrega do e-mail.
    const resetToken = await createResetTokenForNewUser(cleanEmail);
    if (resetToken) {
      const appUrl = process.env.APP_URL || 'https://nevapro.com';
      const resetLink = `${appUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(cleanEmail)}`;
      void sendPasswordResetEmail(cleanEmail, safeName, resetLink).catch((emailErr) => {
        log.error('[Webhook EventEase] Erro ao enviar e-mail de definição de senha:', emailErr);
      });
    } else {
      log.error(`[Webhook EventEase] Conta criada sem token de definição de senha: ${cleanEmail}. Solicite recuperação manual.`);
    }
    void sendWelcomeEmail(cleanEmail, safeName).catch((emailErr) => {
      log.error('[Webhook EventEase] Erro ao enviar e-mail de boas-vindas:', emailErr);
    });


    res.status(201).json({
      success: true,
      message: 'Usuário criado com sucesso no NevaPro. O aluno receberá um e-mail para definir a própria senha.',
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
      },
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error('[Webhook EventEase] Erro inesperado:', errorMessage);
    res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

export default router;
