import {
  DeleteObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { exec } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import zlib from 'node:zlib';
import { query } from '../../src/lib/db';
import { log } from '../utils/logger';

const execAsync = promisify(exec);
let client: S3Client | null = null;

function getConfig() {
  const endpoint = process.env.B2_ENDPOINT;
  const accessKeyId = process.env.B2_KEY_ID;
  const secretAccessKey = process.env.B2_APPLICATION_KEY;
  const bucket = process.env.B2_BUCKET_NAME;

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) return null;

  const retentionDays = parseInt(process.env.B2_BACKUP_RETENTION_DAYS || '30', 10);
  const backupPrefix = (process.env.B2_BACKUP_PREFIX || 'backups').replace(/^\/+|\/+$/g, '');

  return {
    endpoint,
    accessKeyId,
    secretAccessKey,
    bucket,
    region: process.env.B2_REGION || endpoint.match(/s3\.([^.]+)\./)?.[1] || 'us-east-005',
    retentionDays: isNaN(retentionDays) || retentionDays < 1 ? 30 : retentionDays,
    backupPrefix,
  };
}

function getClient(config: NonNullable<ReturnType<typeof getConfig>>) {
  if (!client) {
    client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true,
    });
  }
  return client;
}

export function isB2BackupConfigured(): boolean {
  return getConfig() !== null;
}

/**
 * Escapa valores para literais SQL seguros.
 */
function escapeSqlValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (value instanceof Date) {
    return `'${value.toISOString()}'`;
  }
  if (typeof value === 'object') {
    const jsonStr = JSON.stringify(value).replace(/'/g, "''");
    return `'${jsonStr}'::jsonb`;
  }
  const str = String(value).replace(/'/g, "''");
  return `'${str}'`;
}

/**
 * Gera o script SQL de dump do banco de dados PostgreSQL.
 * Tenta executar pg_dump (se instalado); caso contrário, usa fallback Node.js em JS puro.
 */
async function generateSqlDump(): Promise<{ sql: string; tableCount: number; method: 'pg_dump' | 'node_fallback' }> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL não configurada no arquivo .env. Defina a string de conexão do PostgreSQL.');
  }

  // 1. Tenta usar o pg_dump nativo se disponível no sistema
  try {
    const { stdout } = await execAsync(`pg_dump "${dbUrl}" --clean --if-exists --no-owner --no-privileges`, {
      maxBuffer: 50 * 1024 * 1024, // 50 MB max
      timeout: 120_000,
    });

    if (stdout && stdout.trim().length > 0) {
      return { sql: stdout, tableCount: -1, method: 'pg_dump' };
    }
  } catch {
    log.info('[Backup] pg_dump nativo não encontrado ou falhou. Utilizando exportação nativa Node.js SQL.');
  }

  // 2. Fallback: Leitura do schema e tabelas via query SQL
  const tablesRes = await query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);

  const tableNames = tablesRes.rows.map((r: { table_name: string }) => r.table_name);
  let dumpSql = `-- Neva Pro Database Backup (Node.js Fallback Dump)\n`;
  dumpSql += `-- Generated at: ${new Date().toISOString()}\n`;
  dumpSql += `-- Tables included: ${tableNames.join(', ')}\n\n`;
  dumpSql += `BEGIN;\n\n`;

  for (const tableName of tableNames) {
    const rowsRes = await query(`SELECT * FROM public."${tableName}";`);
    const rows = rowsRes.rows;

    dumpSql += `-- Data for table public."${tableName}" (${rows.length} rows)\n`;
    dumpSql += `TRUNCATE TABLE public."${tableName}" CASCADE;\n`;

    if (rows.length > 0) {
      const columns = Object.keys(rows[0]);
      const quotedCols = columns.map((col) => `"${col}"`).join(', ');

      const batchSize = 100;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const valueTuples = batch.map((row) => {
          const values = columns.map((col) => escapeSqlValue(row[col])).join(', ');
          return `(${values})`;
        });

        dumpSql += `INSERT INTO public."${tableName}" (${quotedCols}) VALUES\n  ${valueTuples.join(',\n  ')};\n`;
      }
    }
    dumpSql += `\n`;
  }

  dumpSql += `COMMIT;\n`;

  return { sql: dumpSql, tableCount: tableNames.length, method: 'node_fallback' };
}

/**
 * Remove arquivos de backup do Backblaze B2 com idade superior à retenção configurada.
 */
async function pruneOldBackups(config: NonNullable<ReturnType<typeof getConfig>>): Promise<number> {
  const s3 = getClient(config);
  const prefix = `${config.backupPrefix}/db/`;
  const cutoffDate = new Date(Date.now() - config.retentionDays * 86_400_000);

  let deletedCount = 0;
  let continuationToken: string | undefined;

  do {
    const listRes = await s3.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );

    const contents = listRes.Contents || [];
    for (const item of contents) {
      if (item.Key && item.LastModified && item.LastModified < cutoffDate) {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: config.bucket,
            Key: item.Key,
          }),
        );
        deletedCount++;
        log.info(`[Backup Cleanup] Backup expirado removido: ${item.Key} (Modificado em: ${item.LastModified.toISOString()})`);
      }
    }

    continuationToken = listRes.NextContinuationToken;
  } while (continuationToken);

  return deletedCount;
}

/**
 * Executa o fluxo completo de backup do banco de dados para o Backblaze B2.
 */
export async function runDatabaseBackup(): Promise<{
  key: string;
  bucket: string;
  sizeBytes: number;
  compressedSizeBytes: number;
  durationMs: number;
  tableCount: number;
  method: string;
  prunedCount: number;
}> {
  const startTime = Date.now();
  const config = getConfig();

  if (!config) {
    throw new Error('Configuração do Backblaze B2 ausente. Defina B2_ENDPOINT, B2_KEY_ID, B2_APPLICATION_KEY e B2_BUCKET_NAME no arquivo .env.');
  }

  log.info('[Backup] Iniciando backup diário do banco de dados...');

  // 1. Gera o Dump SQL
  const { sql, tableCount, method } = await generateSqlDump();
  const rawSizeBytes = Buffer.byteLength(sql, 'utf-8');

  // 2. Comprime em Gzip
  const compressedBuffer = zlib.gzipSync(Buffer.from(sql, 'utf-8'));
  const compressedSizeBytes = compressedBuffer.length;

  // 3. Define a chave do objeto no B2
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const timestampStr = now.toISOString().replace(/[:.]/g, '-');
  const shortId = randomUUID().substring(0, 8);

  const objectKey = `${config.backupPrefix}/db/nevapro_db_${timestampStr}_${shortId}.sql.gz`;

  // 4. Faz Upload para o Backblaze B2
  const s3 = getClient(config);
  await s3.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      Body: compressedBuffer,
      ContentType: 'application/gzip',
      CacheControl: 'no-store',
      Metadata: {
        source: 'nevapro',
        type: 'database-backup',
        method,
        createdAt: now.toISOString(),
      },
    }),
  );

  log.info(
    `[Backup] Backup concluído com sucesso! Upload realizado para B2: "${objectKey}" (${(compressedSizeBytes / 1024 / 1024).toFixed(2)} MB comprimidos, original: ${(rawSizeBytes / 1024 / 1024).toFixed(2)} MB).`,
  );

  // 5. Executa a limpeza de retenção
  let prunedCount = 0;
  try {
    prunedCount = await pruneOldBackups(config);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.error('[Backup] Erro ao executar retenção de backups antigos:', errorMsg);
  }

  const durationMs = Date.now() - startTime;

  return {
    key: objectKey,
    bucket: config.bucket,
    sizeBytes: rawSizeBytes,
    compressedSizeBytes,
    durationMs,
    tableCount,
    method,
    prunedCount,
  };
}

/**
 * Testa a integridade e permissões da conexão de backup no Backblaze B2.
 */
export async function verifyB2BackupStorage(): Promise<{ bucket: string; testKey: string; retentionDays: number }> {
  const config = getConfig();
  if (!config) {
    throw new Error('Defina B2_ENDPOINT, B2_KEY_ID, B2_APPLICATION_KEY e B2_BUCKET_NAME.');
  }

  const storage = getClient(config);
  await storage.send(new HeadBucketCommand({ Bucket: config.bucket }));

  const testKey = `${config.backupPrefix}/connection-tests/probe-${Date.now()}-${randomUUID().substring(0, 8)}.txt`;
  await storage.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: testKey,
      Body: 'Neva Pro Backblaze Backup Test Probe',
      ContentType: 'text/plain',
      Metadata: { source: 'nevapro', type: 'test-probe' },
    }),
  );

  await storage.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: testKey }));

  return {
    bucket: config.bucket,
    testKey,
    retentionDays: config.retentionDays,
  };
}

/**
 * Lista os objetos armazenados na pasta de backups do Backblaze B2.
 */
export async function listB2Backups(): Promise<Array<{ key: string; sizeBytes: number; lastModified: Date }>> {
  const config = getConfig();
  if (!config) return [];
  const s3 = getClient(config);
  const prefix = `${config.backupPrefix}/db/`;
  const listRes = await s3.send(
    new ListObjectsV2Command({
      Bucket: config.bucket,
      Prefix: prefix,
    }),
  );
  return (listRes.Contents || []).map((item) => ({
    key: item.Key || '',
    sizeBytes: item.Size || 0,
    lastModified: item.LastModified || new Date(),
  }));
}
