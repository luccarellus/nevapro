import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getSupabaseAdminClient } from '../lib/dbQueryBuilder';
import { normalizeEmail, sanitizeInput } from '../utils/sanitize';
import { log } from '../utils/logger';
import { rateLimiter } from '../middleware/rateLimiter';
import { sendWelcomeEmail } from '../services/email';

const router = Router();


/**
 * Webhook de integração do EventEase -> NevaPro
 * Endpoint: POST /api/webhooks/eventease
 * 
 * Cadastra um novo aluno no NevaPro automaticamente quando ele se registra no EventEase.
 * A senha padrão configurada é "nevapro123".
 */
router.post('/eventease', rateLimiter(30, 60_000), async (req: Request, res: Response) => {
  try {
    // 1. Validar Chave Secreta de Segurança (X-Webhook-Secret)
    const webhookSecret = req.headers['x-webhook-secret'];
    const expectedSecret = process.env.EVENTEASE_WEBHOOK_SECRET;

    if (!expectedSecret || webhookSecret !== expectedSecret) {
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

    const supabaseAdmin = getSupabaseAdminClient();

    // 2. Verificar se o e-mail já existe na tabela de alunos
    const { data: existingUser, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (fetchError) {
      log.error('[Webhook EventEase] Erro ao buscar usuário no Supabase:', fetchError);
      res.status(500).json({ error: 'Erro ao verificar existência de usuário.' });
      return;
    }

    if (existingUser) {
      // Idempotência: Retorna sucesso caso o usuário já esteja cadastrado no NevaPro
      res.status(200).json({
        success: true,
        message: 'Usuário já cadastrado no NevaPro.',
        userId: existingUser.id,
      });
      return;
    }

    // 3. Gerar Hash da Senha Padrão "nevapro123"
    const DEFAULT_PASSWORD = 'nevapro123';
    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
    const newUserId = crypto.randomUUID();

    // 4. Cadastrar aluno no banco
    const { data: newUser, error: insertError } = await supabaseAdmin
      .from('users')
      .insert([
        {
          id: newUserId,
          email: cleanEmail,
          name: safeName,
          password_hash: passwordHash,
          role: 'student',
          city: safeCity,
          school: safeSchool,
          gremio: safeGremio,
          xp: 0,
          level: 1,
          created_at: new Date().toISOString(),
        },
      ])
      .select('id, email, name')
      .single();

    if (insertError) {
      log.error('[Webhook EventEase] Erro ao cadastrar aluno no Supabase:', insertError);
      res.status(500).json({ error: 'Erro ao criar conta no NevaPro.' });
      return;
    }

    log.info(`[Webhook EventEase] Aluno cadastrado com sucesso: ${cleanEmail}`);

    // 5. Enviar e-mail de boas-vindas assincronamente via Resend
    void sendWelcomeEmail(cleanEmail, safeName).catch((emailErr) => {
      log.error('[Webhook EventEase] Erro ao enviar e-mail de boas-vindas:', emailErr);
    });


    res.status(201).json({
      success: true,
      message: 'Usuário criado com sucesso no NevaPro.',
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
