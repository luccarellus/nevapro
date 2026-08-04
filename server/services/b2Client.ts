/**
 * Unified Backblaze B2 S3 Client
 *
 * Centralizes S3 client creation, configuration, and credential validation.
 * Eliminates 3 separate implementations in:
 *   - dbQueryBuilder.ts (storage proxy)
 *   - b2LogStorage.ts   (log/consent archival)
 *   - b2BackupStorage.ts (database backup)
 */

import { S3Client } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import https from 'node:https';

interface B2Config {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
}

let client: S3Client | null = null;

function parseRegion(endpoint?: string): string {
  if (!endpoint) return 'us-east-005';
  return process.env.B2_REGION || endpoint.match(/s3\.([^.]+)\./)?.[1] || 'us-east-005';
}

/**
 * Returns parsed B2 config or `null` if any required env var is missing.
 */
export function getB2Config(): B2Config | null {
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
    region: parseRegion(endpoint),
  };
}

/**
 * Returns whether B2 storage is fully configured.
 */
export function isB2Configured(): boolean {
  return getB2Config() !== null;
}

/**
 * Returns a singleton S3Client for Backblaze B2.
 * Throws if configuration is missing.
 */
export function getB2Client(): S3Client {
  if (client) return client;

  const config = getB2Config();
  if (!config) {
    throw new Error(
      'Configurações do Backblaze B2 ausentes: B2_ENDPOINT, B2_KEY_ID, B2_APPLICATION_KEY e B2_BUCKET_NAME.',
    );
  }

  const rejectUnauthorized =
    process.env.B2_SSL_REJECT_UNAUTHORIZED === 'false' ||
    process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0'
      ? false
      : true;

  const agent = new https.Agent({
    rejectUnauthorized,
  });

  client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: true,
    requestHandler: new NodeHttpHandler({
      httpsAgent: agent,
    }),
  });

  return client;
}

/**
 * Resets the cached client (useful for testing / config changes).
 */
export function resetB2Client(): void {
  client = null;
}
