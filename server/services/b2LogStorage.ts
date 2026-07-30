import {
  DeleteObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { getB2Client, getB2Config } from './b2Client';

const LOG_CATEGORIES = [
  'backend/application',
  'backend/http',
  'backend/auth',
  'backend/security',
  'backend/database',
  'backend/storage',
  'backend/email',
  'backend/cron',
  'backend/error',
  'backend/warning',
  'frontend/info',
  'frontend/warn',
  'frontend/error',
  'consent',
] as const;

function getLogPrefix() {
  return (process.env.B2_LOG_PREFIX || 'logs').replace(/^\/+|\/+$/g, '');
}

function objectKey(category: string, occurredAt: Date) {
  const year = occurredAt.getUTCFullYear();
  const month = String(occurredAt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(occurredAt.getUTCDate()).padStart(2, '0');
  return `${getLogPrefix()}/${category}/${year}/${month}/${day}/${occurredAt.getTime()}-${randomUUID()}.json`;
}

export function isB2LogStorageConfigured() {
  return getB2Config() !== null;
}

export async function storeB2Log(
  category: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const config = getB2Config();
  if (!config) {
    throw new Error('Backblaze B2 não configurada para armazenamento de logs.');
  }

  const occurredAt = new Date();
  const key = objectKey(category, occurredAt);
  await getB2Client().send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: JSON.stringify({ occurredAt: occurredAt.toISOString(), ...payload }),
    ContentType: 'application/json',
    CacheControl: 'no-store',
    Metadata: { source: 'nevapro', category },
  }));
  return key;
}

export async function verifyB2LogStorage(): Promise<{ bucket: string; markerKey: string }> {
  const config = getB2Config();
  if (!config) {
    throw new Error('Defina B2_ENDPOINT, B2_KEY_ID, B2_APPLICATION_KEY e B2_BUCKET_NAME.');
  }

  const storage = getB2Client();
  await storage.send(new HeadBucketCommand({ Bucket: config.bucket }));

  const markerKey = `${getLogPrefix()}/.keep`;
  await storage.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: markerKey,
    Body: Buffer.alloc(0),
    ContentType: 'application/x-directory',
    Metadata: { source: 'nevapro' },
  }));
  await Promise.all(LOG_CATEGORIES.map((category) =>
    storage.send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: `${getLogPrefix()}/${category}/.keep`,
      Body: Buffer.alloc(0),
      ContentType: 'application/x-directory',
      Metadata: { source: 'nevapro', category },
    })),
  ));

  const probeKey = `${getLogPrefix()}/connection-tests/${Date.now()}-${randomUUID()}.json`;
  await storage.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: probeKey,
    Body: JSON.stringify({ testedAt: new Date().toISOString(), source: 'nevapro' }),
    ContentType: 'application/json',
  }));
  await storage.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: probeKey }));

  return { bucket: config.bucket, markerKey };
}
