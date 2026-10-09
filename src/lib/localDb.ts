import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import bcrypt from 'bcryptjs';
import { log } from '../../server/utils/logger';

let db: DatabaseSync | null = null;

export function getLocalDb(): DatabaseSync {
  if (!db) {
    initLocalDb();
  }
  return db!;
}

export function initLocalDb(): void {
  if (db) return;

  const dbPath = path.resolve('nevapro.sqlite');
  db = new DatabaseSync(dbPath);

  // Enable WAL mode for better concurrency and speed
  try {
    db.exec('PRAGMA journal_mode = WAL;');
  } catch {}

  // Schema creation
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE,
      name TEXT,
      plan TEXT,
      active INTEGER DEFAULT 1,
      domain TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      code TEXT,
      name TEXT,
      tenant_id TEXT
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE,
      name TEXT
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      id TEXT PRIMARY KEY,
      role_id TEXT,
      permission_id TEXT
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      name TEXT,
      password_hash TEXT,
      avatar_url TEXT,
      tenant_id TEXT,
      answered_questions INTEGER DEFAULT 0,
      correct_answers INTEGER DEFAULT 0,
      xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      streak INTEGER DEFAULT 0,
      flash_quiz_completed INTEGER DEFAULT 0,
      token_version INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      name TEXT,
      password_hash TEXT,
      role TEXT DEFAULT 'student',
      avatar_url TEXT,
      answered_questions INTEGER DEFAULT 0,
      correct_answers INTEGER DEFAULT 0,
      tenant_id TEXT,
      xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      streak INTEGER DEFAULT 0,
      flash_quiz_completed INTEGER DEFAULT 0,
      city TEXT,
      school TEXT,
      gremio TEXT,
      points INTEGER DEFAULT 0,
      rank INTEGER DEFAULT 0,
      token_version INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_tenant_roles (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      tenant_id TEXT,
      role_id TEXT,
      UNIQUE(user_id, tenant_id, role_id)
    );

    CREATE TABLE IF NOT EXISTS login_attempts (
      email TEXT PRIMARY KEY,
      attempts INTEGER DEFAULT 0,
      lock_until TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      subject TEXT,
      text TEXT,
      image_url TEXT,
      correct_option_index INTEGER,
      explanation TEXT,
      difficulty TEXT,
      year INTEGER,
      "index" INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS question_options (
      id TEXT PRIMARY KEY,
      question_id TEXT,
      text TEXT,
      image_url TEXT,
      letter TEXT
    );

    CREATE TABLE IF NOT EXISTS answers (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      question_id TEXT,
      selected_option_index INTEGER,
      is_correct INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS materials (
      id TEXT PRIMARY KEY,
      title TEXT,
      subject TEXT,
      url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS recados (
      id TEXT PRIMARY KEY,
      title TEXT,
      content TEXT,
      author TEXT,
      pinned INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS eventos (
      id TEXT PRIMARY KEY,
      title TEXT,
      date TEXT,
      description TEXT,
      type TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_email TEXT,
      title TEXT,
      message TEXT,
      read INTEGER DEFAULT 0,
      type TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed default data if not present
  try {
    const platformTenantId = '00000000-0000-0000-0000-000000000001';
    db.exec(`
      INSERT OR IGNORE INTO tenants (id, slug, name, plan, active)
      VALUES ('${platformTenantId}', 'nevapro', 'NevaPro', 'platform', 1);

      INSERT OR IGNORE INTO roles (id, code, name, tenant_id)
      VALUES ('role-super-admin', 'super_admin', 'Super Administrador', NULL),
             ('role-student', 'student', 'Aluno', '${platformTenantId}');
    `);

    // Seed default admin (luccarellus@gmail.com)
    const adminHash = bcrypt.hashSync('luccarellus', 10);
    db.exec(`
      INSERT OR IGNORE INTO admin_users (id, email, name, password_hash, tenant_id, active)
      VALUES ('admin-luccarellus', 'luccarellus@gmail.com', 'Lucas Luccarelli', '${adminHash}', '${platformTenantId}', 1);

      INSERT OR IGNORE INTO user_tenant_roles (id, user_id, tenant_id, role_id)
      VALUES ('utr-admin-1', 'admin-luccarellus', '${platformTenantId}', 'role-super-admin');
    `);

    // Seed default student for testing
    const studentHash = bcrypt.hashSync('aluno123', 10);
    db.exec(`
      INSERT OR IGNORE INTO users (id, email, name, password_hash, role, tenant_id, xp, level)
      VALUES ('student-1', 'aluno@nevapro.com', 'Aluno Neva', '${studentHash}', 'student', '${platformTenantId}', 120, 1);
    `);
  } catch (seedErr: any) {
    log.warn('[LocalDB] Erro ao aplicar seed inicial:', seedErr?.message || seedErr);
  }

  log.info('[LocalDB] Banco de dados local SQLite inicializado com sucesso.');
}

/**
 * Translates and normalizes PostgreSQL SQL to SQLite SQL
 */
function normalizePostgresToSqlite(sql: string): string {
  let cleaned = sql
    // Remove public. table prefix
    .replace(/public\./gi, '')
    // Remove PostgreSQL type casts like ::varchar, ::int, ::text, etc.
    .replace(/::[a-zA-Z0-9_\[\]]+/g, '')
    // Replace NOW() with datetime('now')
    .replace(/\bNOW\(\)/gi, "datetime('now')")
    // Replace ILIKE with LIKE (SQLite LIKE is ASCII case-insensitive by default)
    .replace(/\bILIKE\b/gi, 'LIKE')
    // Replace IS NOT DISTINCT FROM with IS
    .replace(/\bIS\s+NOT\s+DISTINCT\s+FROM\b/gi, 'IS')
    // Replace NULL::varchar with NULL
    .replace(/\bNULL::[a-zA-Z0-9_]+/gi, 'NULL')
    // Replace lower(something) = lower($1)
    .replace(/ON\s+COMMIT\s+PRESERVE\s+ROWS/gi, '')
    // Handle RETURNING id / RETURNING * (SQLite 3.35+ supports it, but keep it clean)
    // Fix (SELECT ...) UNION ALL (SELECT ...) syntax for SQLite
    .replace(/^\s*\(\s*SELECT/i, 'SELECT')
    .replace(/\)\s*UNION\s+ALL\s*\(\s*SELECT/gi, ' UNION ALL SELECT ')
    .replace(/\)\s*LIMIT\s+(\d+)/gi, ' LIMIT $1');

  // Convert $1, $2, $3 to ?
  cleaned = cleaned.replace(/\$(\d+)/g, '?');

  return cleaned;
}

export async function executeLocalQuery(
  text: string,
  params: any[] = [],
): Promise<{ rows: any[]; rowCount: number }> {
  const database = getLocalDb();
  const normalizedSql = normalizePostgresToSqlite(text);

  // If query is an INSERT/UPDATE/DELETE
  const trimmed = normalizedSql.trim().toUpperCase();
  const isSelect = trimmed.startsWith('SELECT') || trimmed.startsWith('WITH');

  try {
    const stmt = database.prepare(normalizedSql);

    if (isSelect || normalizedSql.toUpperCase().includes('RETURNING')) {
      const rows = stmt.all(...params) as any[];
      return { rows: rows || [], rowCount: (rows || []).length };
    } else {
      const info = stmt.run(...params);
      return { rows: [], rowCount: Number(info.changes || 0) };
    }
  } catch (err: any) {
    // If table or column doesn't exist yet, handle gracefully
    log.warn(`[LocalDB Query Error] ${err.message} | Query: ${normalizedSql.substring(0, 150)}`);
    return { rows: [], rowCount: 0 };
  }
}
