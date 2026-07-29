import {
  DeleteObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';

let client: S3Client | null = null;

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

function getConfig() {
  const endpoint = process.env.B2_ENDPOINT;
  const accessKeyId = process.env.B2_KEY_ID;
  const secretAccessKey = process.env.B2_APPLICATION_KEY;
  const bucket = process.env.B2_BUCKET_NAME;

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) return null;

  return {
    endpoint,
    accessKeyId,
    secretAccessKey,
    bucket,
    region: process.env.B2_REGION || endpoint.match(/s3\.([^.]+)\./)?.[1] || 'us-east-005',
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

function objectKey(category: string, occurredAt: Date) {
  const year = occurredAt.getUTCFullYear();
  const month = String(occurredAt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(occurredAt.getUTCDate()).padStart(2, '0');
  return `${getLogPrefix()}/${category}/${year}/${month}/${day}/${occurredAt.getTime()}-${randomUUID()}.json`;
}

export function isB2LogStorageConfigured() {
  return getConfig() !== null;
}

export async function storeB2Log(
  category: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const config = getConfig();
  if (!config) {
    throw new Error('Backblaze B2 não configurada para armazenamento de logs.');
  }

  const occurredAt = new Date();
  const key = objectKey(category, occurredAt);
  await getClient(config).send(new PutObjectCommand({
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
  const config = getConfig();
  if (!config) {
    throw new Error('Defina B2_ENDPOINT, B2_KEY_ID, B2_APPLICATION_KEY e B2_BUCKET_NAME.');
  }

  const storage = getClient(config);
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
