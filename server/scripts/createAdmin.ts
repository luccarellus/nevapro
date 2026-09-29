/**
 * Cria (ou promove) um admin no banco: admin_users + papel RBAC.
 *
 * Uso:
 *   npm run create:admin -- email senha [Nome]
 *   npm run create:admin -- email senha --role tenant --tenant <slug|id>
 *   npm run create:admin
 *
 * - Sem argumentos → modo interativo (pede email, senha e nome no terminal).
 * - --role super|tenant  (padrão: super)
 * - --tenant <slug|id>   obrigatório quando --role tenant
 * - --name <Nome>        nome de exibição (opcional; derivado do email se omitido)
 *
 * Idempotente: se o email já existir em admin_users, atualiza a senha e garante o papel.
 * Requer DATABASE_URL acessível.
 */
import * as readline from 'node:readline';
import bcrypt from 'bcryptjs';
import { query } from '../../src/lib/db';
import { log } from '../utils/logger';
import { PLATFORM_TENANT_ID, ensurePlatformTenant, resolveTenant } from '../services/rbacService';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LEN = 6;

interface CliOptions {
  email?: string;
  password?: string;
  name?: string;
  role: 'super' | 'tenant';
  tenant?: string;
  interactive: boolean;
}

function printUsage(): void {
  console.log(`Uso:
  npm run create:admin -- <email> <senha> [Nome] [--role super|tenant] [--tenant <slug|id>]
  npm run create:admin   (modo interativo)

Opções:
  --role <super|tenant>  Papel a vincular (padrão: super = super_admin global)
  --tenant <slug|id>     Tenant para --role tenant (ex.: nevapro ou uuid)
  --name <Nome>          Nome de exibição do admin`);
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { role: 'super', interactive: false };
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '-h':
      case '--help':
        printUsage();
        process.exit(0);
        break;
      case '--role':
        opts.role = argv[++i] === 'tenant' ? 'tenant' : 'super';
        break;
      case '--tenant':
        opts.tenant = argv[++i];
        break;
      case '--name':
        opts.name = argv[++i];
        break;
      default:
        positional.push(arg);
    }
  }

  if (positional.length >= 1) opts.email = positional[0];
  if (positional.length >= 2) opts.password = positional[1];
  if (positional.length >= 3 && !opts.name) opts.name = positional.slice(2).join(' ');

  if (!opts.email || !opts.password) opts.interactive = true;
  return opts;
}

function ask(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => resolve(answer.trim()));
  });
}

function askHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY || !process.stdin.setRawMode) {
      // Sem TTY (ex.: pipe): não dá para mascarar
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question(prompt, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
      return;
    }

    process.stdout.write(prompt);
    let buffer = '';
    let finished = false;

    const onData = (chunk: Buffer) => {
      for (const ch of chunk.toString('latin1')) {
        if (ch === '\r' || ch === '\n') {
          process.stdout.write('\n');
          if (finished) continue;
          finished = true;
          cleanup();
          resolve(buffer);
          return;
        }
        if (ch === '\u007f' || ch === '\b') {
          if (buffer.length > 0) {
            buffer = buffer.slice(0, -1);
            process.stdout.write('\b \b');
          }
          continue;
        }
        if (ch === '\u0003') {
          // Ctrl+C
          process.stdout.write('\n');
          process.exit(1);
        }
        buffer += ch;
      }
    };

    const cleanup = () => {
      process.stdin.off('data', onData);
      if (process.stdin.isTTY && process.stdin.setRawMode) process.stdin.setRawMode(false);
      process.stdin.pause();
    };

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}

function validate(opts: CliOptions): void {
  if (!EMAIL_RE.test(opts.email || '')) {
    throw new Error(`E-mail inválido: "${opts.email || ''}"`);
  }
  if (!opts.password || opts.password.length < MIN_PASSWORD_LEN) {
    throw new Error(`Senha deve ter no mínimo ${MIN_PASSWORD_LEN} caracteres.`);
  }
  if (opts.role === 'tenant' && !opts.tenant) {
    throw new Error('--role tenant exige --tenant <slug|id>.');
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.interactive) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log('Criação de admin — preencha os dados abaixo:\n');
    opts.email = await ask(rl, 'E-mail: ');
    opts.password = await askHidden('Senha: ');
    if (!opts.name) opts.name = await ask(rl, 'Nome (Enter para derivar do e-mail): ');
    const roleChoice = await ask(rl, 'Papel: [super] super_admin / [t] tenant_admin: ');
    opts.role = roleChoice.toLowerCase().startsWith('t') ? 'tenant' : 'super';
    if (opts.role === 'tenant') opts.tenant = await ask(rl, 'Tenant (slug ou id): ');
    rl.close();
  }

  validate(opts);
  const email = (opts.email || '').toLowerCase();
  const name = opts.name || email.split('@')[0];

  // 1. Garante o tenant da plataforma
  await ensurePlatformTenant();

  // 2. Resolve tenant + garante a linha do papel em public.roles
  let roleTenantId: string;
  let roleCode: string;
  if (opts.role === 'tenant') {
    const tenant = await resolveTenant(opts.tenant as string);
    if (!tenant) {
      throw new Error(`Tenant não encontrado: "${opts.tenant}" (use slug, domínio ou id).`);
    }
    roleTenantId = tenant.id;
    roleCode = 'tenant_admin';
    await query(
      `INSERT INTO public.roles (code, name, description, tenant_id)
       VALUES ('tenant_admin', 'Administrador do Tenant', 'Administrador da instituição/tenant', $1)
       ON CONFLICT (code, tenant_id) DO NOTHING`,
      [tenant.id],
    );
    log.info(`[CreateAdmin] Tenant resolvido: ${tenant.name} (${tenant.id}).`);
  } else {
    roleTenantId = PLATFORM_TENANT_ID;
    roleCode = 'super_admin';
    await query(
      `INSERT INTO public.roles (code, name, description, tenant_id)
       VALUES ('super_admin', 'Super Admin', 'Controle total da plataforma (todos os tenants)', NULL)
       ON CONFLICT (code, tenant_id) DO NOTHING`,
    );
  }

  // 3. Avisa se o e-mail já existe em alguma tabela
  const [adminCheck, studentCheck] = await Promise.all([
    query('SELECT 1 FROM public.admin_users WHERE email = $1 LIMIT 1', [email]),
    query('SELECT 1 FROM public.users WHERE email = $1 LIMIT 1', [email]),
  ]);
  const isUpdate = adminCheck.rows.length > 0;
  if (isUpdate) log.warn(`[CreateAdmin] Admin já existe — senha/papel serão atualizados.`);
  if (studentCheck.rows.length > 0) {
    log.warn(`[CreateAdmin] Atenção: esse e-mail já existe em public.users. No login, admin tem prioridade.`);
  }

  // 4. Cria/atualiza o admin
  const hash = await bcrypt.hash(opts.password as string, 10);
  await query(
    `INSERT INTO public.admin_users (email, password_hash, name, active, tenant_id)
     VALUES ($1, $2, $3, true, $4)
     ON CONFLICT (email) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       name = EXCLUDED.name,
       active = true,
       updated_at = NOW()`,
    [email, hash, name, roleTenantId],
  );
  log.info(`[CreateAdmin] admin_users ${isUpdate ? 'atualizado' : 'criado'}: ${email}`);

  // 5. Vincula o papel (idempotente).
  // super_admin: papel global (roles.tenant_id IS NULL) — IS NOT DISTINCT FROM casa com NULL.
  const roleRowTenantId: string | null = opts.role === 'tenant' ? roleTenantId : null;
  await query(
    `INSERT INTO public.user_tenant_roles (user_id, tenant_id, role_id)
     SELECT au.id, $2, r.id
     FROM public.admin_users au, public.roles r
     WHERE au.email = $1
       AND r.code = $3
       AND r.tenant_id IS NOT DISTINCT FROM $4
     ON CONFLICT (user_id, tenant_id, role_id) DO NOTHING`,
    [email, roleTenantId, roleCode, roleRowTenantId],
  );

  // 6. Limpa eventual bloqueio de login deste e-mail
  await query('DELETE FROM public.login_attempts WHERE email = $1', [email]);

  // 7. Confirma
  const check = await query(
    `SELECT au.email, r.code AS role, r.tenant_id
     FROM public.admin_users au
     JOIN public.user_tenant_roles utr ON utr.user_id = au.id
     JOIN public.roles r ON r.id = utr.role_id
     WHERE au.email = $1 AND r.code = $2`,
    [email, roleCode],
  );
  if (check.rows.length === 0) {
    throw new Error('Falha: papel não confirmado após o insert. Verifique o schema do banco.');
  }

  const row = check.rows[0];
  console.log('');
  console.log('==============================================');
  console.log(' Admin criado com sucesso!');
  console.log('----------------------------------------------');
  console.log(` E-mail:  ${row.email}`);
  console.log(` Papel:   ${row.role}${row.role === 'tenant_admin' ? ` (tenant ${row.tenant_id})` : ' (global)'}`);
  console.log(` Login em: /login (ou /admin)`);
  console.log('==============================================');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    log.error('[CreateAdmin] Erro:', err);
    process.exit(1);
  });
