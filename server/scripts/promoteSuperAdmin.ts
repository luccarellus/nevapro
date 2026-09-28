/**
 * Bootstrap: promove luccarellus@gmail.com a super admin.
 * Uso: npm run promote:admin  (requer DATABASE_URL acessivel)
 */
import bcrypt from 'bcryptjs';
import { query } from '../../src/lib/db';
import { log } from '../utils/logger';
import { PLATFORM_TENANT_ID } from '../services/rbacService';

const EMAIL = 'luccarellus@gmail.com';
const SENHA = 'luccarellus';

async function promote() {
  const hash = await bcrypt.hash(SENHA, 10);

  // 1. Cria/atualiza o admin
  await query(
    `INSERT INTO public.admin_users (email, password_hash, name, active, tenant_id)
     SELECT $1, $2, 'Luccarellus', true, $3
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, active = true`,
    [EMAIL, hash, PLATFORM_TENANT_ID],
  );
  log.info('[Promote] admin_users garantido.');

  // 2. Vincula o papel super_admin global
  const res = await query(
    `INSERT INTO public.user_tenant_roles (user_id, tenant_id, role_id)
     SELECT au.id, $2, r.id
     FROM public.admin_users au, public.roles r
     WHERE au.email = $1
       AND r.code = 'super_admin' AND r.tenant_id IS NULL
     ON CONFLICT (user_id, tenant_id, role_id) DO NOTHING`,
    [EMAIL, PLATFORM_TENANT_ID],
  );
  log.info(`[Promote] papel super_admin vinculado (${res.rowCount} linha(s)).`);

  // 3. Confirma
  const check = await query(
    `SELECT au.email, r.code AS role
     FROM public.admin_users au
     JOIN public.user_tenant_roles utr ON utr.user_id = au.id
     JOIN public.roles r ON r.id = utr.role_id
     WHERE au.email = $1 AND r.code = 'super_admin'`,
    [EMAIL],
  );
  if (check.rows.length > 0) {
    log.info(`[Promote] CONFIRMADO: ${check.rows[0].email} = ${check.rows[0].role}`);
  } else {
    throw new Error('[Promote] Falha: papel nao confirmado apos insert.');
  }
}

promote()
  .then(() => process.exit(0))
  .catch((err) => {
    log.error('[Promote] Erro:', err);
    process.exit(1);
  });
