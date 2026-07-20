var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/lib/db.ts
var db_exports = {};
__export(db_exports, {
  default: () => db_default,
  getClient: () => getClient,
  query: () => query,
  runMigrationQuery: () => runMigrationQuery
});
import { Pool } from "pg";
import * as dotenv2 from "dotenv";
var connectionString, isSupabaseDatabase, ssl, pool, query, getClient, directConnectionString, migrationPool, runMigrationQuery, db_default;
var init_db = __esm({
  "src/lib/db.ts"() {
    dotenv2.config();
    connectionString = process.env.DATABASE_URL;
    isSupabaseDatabase = !!connectionString && /supabase/i.test(connectionString);
    ssl = process.env.DISABLE_DB_SSL === "true" ? false : isSupabaseDatabase || process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : void 0;
    pool = new Pool({
      connectionString,
      ssl
    });
    query = async (text, params) => {
      const start = Date.now();
      const res = await pool.query(text, params);
      const duration = Date.now() - start;
      return res;
    };
    getClient = () => {
      return pool.connect();
    };
    directConnectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
    migrationPool = new Pool({
      connectionString: directConnectionString,
      ssl
    });
    runMigrationQuery = async (text, params) => {
      const start = Date.now();
      const res = await migrationPool.query(text, params);
      return res;
    };
    db_default = pool;
  }
});

// server/lib/dbQueryBuilder.ts
var dbQueryBuilder_exports = {};
__export(dbQueryBuilder_exports, {
  dbAdmin: () => dbAdmin,
  getSupabaseAdminClient: () => getSupabaseAdminClient,
  getSupabaseAnonClient: () => getSupabaseAnonClient
});
import { createClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
function getB2Client() {
  if (s3Client) return s3Client;
  const endpoint = process.env.B2_ENDPOINT;
  const accessKeyId = process.env.B2_KEY_ID;
  const secretAccessKey = process.env.B2_APPLICATION_KEY;
  const missing = [];
  if (!endpoint) missing.push("B2_ENDPOINT");
  if (!accessKeyId) missing.push("B2_KEY_ID");
  if (!secretAccessKey) missing.push("B2_APPLICATION_KEY");
  if (missing.length > 0) {
    throw new Error(`Configura\xE7\xF5es do Backblaze B2 ausentes no process.env: ${missing.join(", ")}`);
  }
  s3Client = new S3Client({
    endpoint,
    region: endpoint.split(".")[1] || "us-east-005",
    credentials: {
      accessKeyId,
      secretAccessKey
    },
    forcePathStyle: true
  });
  return s3Client;
}
function getSupabaseAdminClient() {
  if (supabaseAdminClient) return supabaseAdminClient;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY s\xE3o obrigat\xF3rios para Auth/Storage.");
  }
  supabaseAdminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });
  return supabaseAdminClient;
}
function getSupabaseAnonClient() {
  if (supabaseAnonClient) return supabaseAnonClient;
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error("SUPABASE_URL e SUPABASE_ANON_KEY s\xE3o obrigat\xF3rios para login com Supabase Auth.");
  }
  supabaseAnonClient = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });
  return supabaseAnonClient;
}
function sanitizeIdentifier(name) {
  if (!name) return name;
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(`Identificador de banco de dados inv\xE1lido ou inseguro: ${name}`);
  }
  return name;
}
function sanitizeSelectCols(cols) {
  if (!cols) return "*";
  const parts = cols.split(",");
  for (let part of parts) {
    part = part.trim();
    if (!/^[a-zA-Z0-9_*\\(\\)]+$/.test(part)) {
      throw new Error(`Coluna de select insegura detectada: ${part}`);
    }
  }
  return cols;
}
var supabaseAdminClient, supabaseAnonClient, s3Client, PostgresQueryBuilder, dbAdmin;
var init_dbQueryBuilder = __esm({
  "server/lib/dbQueryBuilder.ts"() {
    init_db();
    supabaseAdminClient = null;
    supabaseAnonClient = null;
    s3Client = null;
    PostgresQueryBuilder = class {
      constructor(table) {
        this.action = "select";
        this.selectCols = "*";
        this.whereCols = [];
        this.whereVals = [];
        this.insertData = null;
        this.updateData = null;
        this.limitVal = null;
        this.orderCol = null;
        this.orderAsc = true;
        this.tableName = table;
      }
      select(cols = "*") {
        if (this.action === "select") {
          this.action = "select";
        }
        this.selectCols = cols;
        return this;
      }
      insert(data) {
        this.action = "insert";
        this.insertData = Array.isArray(data) ? data[0] : data;
        return this;
      }
      update(data) {
        this.action = "update";
        this.updateData = data;
        return this;
      }
      delete() {
        this.action = "delete";
        return this;
      }
      eq(col, val) {
        this.whereCols.push(col);
        this.whereVals.push(val);
        return this;
      }
      order(col, { ascending = true } = {}) {
        this.orderCol = col;
        this.orderAsc = ascending;
        return this;
      }
      limit(n) {
        this.limitVal = n;
        return this;
      }
      range(start, end) {
        this.limitVal = end - start + 1;
        return this;
      }
      gte(col, val) {
        this.whereCols.push(`${col}__gte`);
        this.whereVals.push(val);
        return this;
      }
      async execute() {
        let sql = "";
        const params = [];
        const safeTable = sanitizeIdentifier(this.tableName);
        const safeSelectCols = sanitizeSelectCols(this.selectCols);
        if (this.action === "select") {
          sql = `SELECT ${safeSelectCols} FROM ${safeTable}`;
          if (this.whereCols.length > 0) {
            const whereClause = this.whereCols.map((c, i) => {
              const cleanCol = c.replace("__gte", "").replace("__lte", "");
              const safeCol = sanitizeIdentifier(cleanCol);
              const op = c.endsWith("__gte") ? ">=" : c.endsWith("__lte") ? "<=" : "=";
              return `${safeCol} ${op} $${i + 1}`;
            }).join(" AND ");
            sql += ` WHERE ${whereClause}`;
            params.push(...this.whereVals);
          }
          if (this.orderCol) {
            const safeOrderCol = sanitizeIdentifier(this.orderCol);
            sql += ` ORDER BY ${safeOrderCol} ${this.orderAsc ? "ASC" : "DESC"}`;
          }
          if (this.limitVal) {
            sql += ` LIMIT ${this.limitVal}`;
          }
        } else if (this.action === "insert") {
          const keys = Object.keys(this.insertData);
          const vals = Object.values(this.insertData);
          const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
          keys.forEach((k) => sanitizeIdentifier(k));
          sql = `INSERT INTO ${safeTable} (${keys.join(", ")}) VALUES (${placeholders}) RETURNING ${safeSelectCols}`;
          params.push(...vals);
        } else if (this.action === "update") {
          const keys = Object.keys(this.updateData);
          const vals = Object.values(this.updateData);
          keys.forEach((k) => sanitizeIdentifier(k));
          const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
          sql = `UPDATE ${safeTable} SET ${setClause}`;
          params.push(...vals);
          if (this.whereCols.length > 0) {
            const offset = keys.length;
            const whereClause = this.whereCols.map((c, i) => {
              const cleanCol = c.replace("__gte", "").replace("__lte", "");
              const safeCol = sanitizeIdentifier(cleanCol);
              const op = c.endsWith("__gte") ? ">=" : c.endsWith("__lte") ? "<=" : "=";
              return `${safeCol} ${op} $${offset + i + 1}`;
            }).join(" AND ");
            sql += ` WHERE ${whereClause}`;
            params.push(...this.whereVals);
          }
          sql += ` RETURNING ${safeSelectCols}`;
        } else if (this.action === "delete") {
          sql = `DELETE FROM ${safeTable}`;
          if (this.whereCols.length > 0) {
            const whereClause = this.whereCols.map((c, i) => {
              const cleanCol = c.replace("__gte", "").replace("__lte", "");
              const safeCol = sanitizeIdentifier(cleanCol);
              const op = c.endsWith("__gte") ? ">=" : c.endsWith("__lte") ? "<=" : "=";
              return `${safeCol} ${op} $${i + 1}`;
            }).join(" AND ");
            sql += ` WHERE ${whereClause}`;
            params.push(...this.whereVals);
          }
        }
        try {
          const res = await query(sql, params);
          return { data: res.rows, error: null };
        } catch (e) {
          console.error(`[PG Wrapper Error] ${sql}`, e);
          return { data: null, error: e };
        }
      }
      then(resolve, reject) {
        return this.execute().then(resolve, reject);
      }
      async maybeSingle() {
        this.limit(1);
        const { data, error } = await this.execute();
        return { data: data && data.length > 0 ? data[0] : null, error };
      }
      async single() {
        this.limit(1);
        const { data, error } = await this.execute();
        if (error) return { data: null, error };
        if (!data || data.length === 0) return { data: null, error: new Error("No rows found") };
        return { data: data[0], error: null };
      }
    };
    dbAdmin = {
      from(table) {
        return new PostgresQueryBuilder(table);
      },
      auth: {
        admin: {
          async listUsers(params) {
            try {
              const { data, error } = await getSupabaseAdminClient().auth.admin.listUsers({
                page: params?.page,
                perPage: params?.perPage
              });
              return { data, error };
            } catch (error) {
              return { data: { users: [] }, error };
            }
          },
          async deleteUser(id, shouldSoftDelete = false) {
            const { data, error } = await getSupabaseAdminClient().auth.admin.deleteUser(id, shouldSoftDelete);
            return { data, error };
          },
          async updateUserById(id, data) {
            const result = await getSupabaseAdminClient().auth.admin.updateUserById(id, data);
            return result;
          }
        }
      },
      storage: {
        from(bucket) {
          return {
            async upload(path2, file, options) {
              try {
                const client = getB2Client();
                const command = new PutObjectCommand({
                  Bucket: bucket,
                  Key: path2,
                  Body: file,
                  ContentType: options?.contentType || "application/octet-stream"
                });
                await client.send(command);
                return { data: { path: path2 }, error: null };
              } catch (error) {
                console.error("[B2 Storage] Upload error:", error);
                return { data: null, error };
              }
            },
            getPublicUrl(path2, options) {
              const endpointHost = process.env.B2_ENDPOINT?.replace(/^https?:\/\//, "");
              const publicUrl = `https://${bucket}.${endpointHost}/${path2}`;
              return { data: { publicUrl } };
            },
            async getObject(path2) {
              try {
                const client = getB2Client();
                const command = new GetObjectCommand({
                  Bucket: bucket,
                  Key: path2
                });
                const response = await client.send(command);
                const stream = response.Body;
                const contentType = response.ContentType || "application/octet-stream";
                return { data: { stream, contentType }, error: null };
              } catch (error) {
                console.error("[B2 Storage] GetObject error:", error);
                return { data: null, error };
              }
            }
          };
        }
      }
    };
  }
});

// server/instrument.ts
import * as dotenv from "dotenv";
import * as Sentry from "@sentry/node";
dotenv.config({ path: [".env.local", ".env"] });
var dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    sendDefaultPii: false,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1
  });
}

// server/index.ts
import * as Sentry3 from "@sentry/node";
import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import path from "path";
import * as dotenv3 from "dotenv";
import multer from "multer";

// server/utils/env.ts
var REQUIRED_VARS = [
  "DATABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY"
];
var CONDITIONAL_VARS = [
  { vars: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"], purpose: "Supabase Auth/Storage admin" },
  { vars: ["SUPABASE_URL", "SUPABASE_ANON_KEY"], purpose: "Supabase Auth login" },
  { vars: ["B2_ENDPOINT", "B2_KEY_ID", "B2_APPLICATION_KEY", "B2_BUCKET_NAME"], purpose: "Backblaze B2 file storage" },
  { vars: ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"], purpose: "Redis caching (via Upstash)" },
  { vars: ["SENTRY_DSN"], purpose: "Sentry error tracking" },
  { vars: ["GEMINI_API_KEY"], purpose: "Gemini AI API" }
];
function validateEnv() {
  const missing = [];
  for (const name of REQUIRED_VARS) {
    if (!process.env[name]) {
      missing.push(name);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `[ENV] Vari\xE1veis obrigat\xF3rias ausentes: ${missing.join(", ")}. Verifique seu arquivo .env ou as configura\xE7\xF5es de ambiente.`
    );
  }
  for (const group of CONDITIONAL_VARS) {
    const allMissing = group.vars.every((v) => !process.env[v]);
    const someMissing = group.vars.some((v) => !process.env[v]);
    if (allMissing) {
      console.warn(`[ENV] Aviso: ${group.purpose} n\xE3o configurado. Funcionalidade indispon\xEDvel.`);
    } else if (someMissing) {
      console.warn(`[ENV] Aviso: Configura\xE7\xE3o incompleta para ${group.purpose}. Alguns recursos podem falhar.`);
    }
  }
}

// server/utils/logger.ts
import * as Sentry2 from "@sentry/node";
var isDev = process.env.NODE_ENV !== "production" || process.env.DEBUG === "true";
function safeStringify(value) {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
function extractError(args) {
  return args.find((a) => a instanceof Error);
}
function sendToSentry(...args) {
  try {
    const errorObj = extractError(args);
    if (errorObj) {
      Sentry2.captureException(errorObj, {
        tags: { source: "server:logger", handler: "log.error" },
        extra: { args: args.map(safeStringify) }
      });
    } else {
      const message = args.map(safeStringify).join(" ");
      if (message) {
        Sentry2.captureMessage(message, {
          level: "error",
          tags: { source: "server:logger", handler: "log.error" }
        });
      }
    }
  } catch {
  }
}
var log = {
  info: (...args) => {
    if (isDev) console.log(...args);
  },
  warn: (...args) => {
    if (isDev) console.warn(...args);
  },
  error: (...args) => {
    console.error(...args);
    sendToSentry(...args);
  }
};

// server/middleware/csrf.ts
var normalizeOrigin = (value) => {
  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
};
var ALLOWED_ORIGIN = normalizeOrigin(process.env.FRONTEND_URL || "https://neva.pro");
var ALLOWED_ORIGINS = /* @__PURE__ */ new Set([
  ALLOWED_ORIGIN,
  ...process.env.NODE_ENV !== "production" ? ["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:5173"] : []
]);
var isAllowedOrigin = (value) => {
  const originValue = Array.isArray(value) ? value[0] : value;
  if (!originValue) return false;
  try {
    return ALLOWED_ORIGINS.has(new URL(originValue).origin);
  } catch {
    return false;
  }
};
var csrfProtection = (req, res, next) => {
  if (process.env.NODE_ENV !== "production") {
    return next();
  }
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }
  const origin = req.headers.origin;
  if (origin) {
    if (!isAllowedOrigin(origin)) {
      log.warn(`[CSRF] Origem rejeitada: ${origin} (esperado: ${ALLOWED_ORIGIN})`);
      res.status(403).json({ error: "Acesso negado: origem n\xE3o autorizada." });
      return;
    }
    return next();
  }
  const referer = req.headers.referer || req.headers.referrer;
  if (referer) {
    try {
      const refererUrl = new URL(Array.isArray(referer) ? referer[0] : referer);
      if (!isAllowedOrigin(refererUrl.origin)) {
        log.warn(`[CSRF] Referer rejeitado: ${refererUrl.origin} (esperado: ${ALLOWED_ORIGIN})`);
        res.status(403).json({ error: "Acesso negado: referenciador n\xE3o autorizado." });
        return;
      }
      return next();
    } catch {
      res.status(400).json({ error: "Header Referer mal formatado." });
      return;
    }
  }
  const requestedWith = req.headers["x-requested-with"];
  if (!requestedWith || requestedWith !== "XMLHttpRequest") {
    log.warn("[CSRF] Requisi\xE7\xE3o sem Origin/Referer nem X-Requested-With");
    res.status(403).json({ error: "Acesso negado: cabe\xE7alho de seguran\xE7a ausente." });
    return;
  }
  next();
};

// server/types.ts
var CACHE_KEYS = {
  LEADERBOARD: "cache:leaderboard",
  MATERIALS: "cache:materials",
  RECADOS: "cache:recados",
  EVENTOS: "cache:eventos",
  ADMIN_USERS: "cache:admin:users",
  ADMIN_ACTIVITIES: "cache:admin:activities"
};
var CACHE_TTL = {
  [CACHE_KEYS.LEADERBOARD]: 60,
  [CACHE_KEYS.MATERIALS]: 300,
  [CACHE_KEYS.RECADOS]: 300,
  [CACHE_KEYS.EVENTOS]: 300,
  [CACHE_KEYS.ADMIN_USERS]: 120,
  [CACHE_KEYS.ADMIN_ACTIVITIES]: 120
};
var MAX_LOGIN_ATTEMPTS = 5;
var LOCKOUT_DURATION_MS = 15 * 60 * 1e3;

// server/services/cache.ts
var isUpstashRedisConfigured = () => {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
};
var runUpstashRedisCommand = async (command) => {
  if (!isUpstashRedisConfigured()) return null;
  const response = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([command])
  });
  if (!response.ok) {
    throw new Error(`Upstash Redis respondeu com status ${response.status}`);
  }
  const [result] = await response.json();
  if (result?.error) throw new Error(result.error);
  return result?.result;
};
var runUpstashRedisPipeline = async (commands) => {
  if (!isUpstashRedisConfigured()) return null;
  const response = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(commands)
  });
  if (!response.ok) {
    throw new Error(`Upstash Redis pipeline respondeu com status ${response.status}`);
  }
  const results = await response.json();
  for (const r of results) {
    if (r?.error) throw new Error(r.error);
  }
  return results;
};
var cacheGet = async (key) => {
  if (!isUpstashRedisConfigured()) return null;
  try {
    const raw = await runUpstashRedisCommand(["GET", key]);
    if (!raw || typeof raw !== "string") return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};
var cacheSet = async (key, data) => {
  if (!isUpstashRedisConfigured()) return;
  const ttl = CACHE_TTL[key] || 300;
  try {
    await runUpstashRedisPipeline([
      ["SET", key, JSON.stringify(data)],
      ["EXPIRE", key, String(ttl)]
    ]);
  } catch {
  }
};
var cacheInvalidate = async (...keys) => {
  if (!isUpstashRedisConfigured() || keys.length === 0) return;
  try {
    const commands = keys.map((k) => ["DEL", k]);
    await runUpstashRedisPipeline(commands);
  } catch {
  }
};

// server/middleware/rateLimiter.ts
var RATE_LIMITER_CLEANUP_INTERVAL_MS = 6e4;
var RATE_LIMITER_MAX_ENTRIES = 1e4;
var inMemoryRateLimit = /* @__PURE__ */ new Map();
setInterval(() => {
  const now = Date.now();
  for (const [entryKey, entry] of inMemoryRateLimit) {
    if (entry.resetAt <= now) {
      inMemoryRateLimit.delete(entryKey);
    }
  }
  if (inMemoryRateLimit.size > RATE_LIMITER_MAX_ENTRIES) {
    const entries = [...inMemoryRateLimit.entries()].sort(
      ([, a], [, b]) => a.resetAt - b.resetAt
    );
    const toDelete = entries.slice(0, entries.length - RATE_LIMITER_MAX_ENTRIES);
    for (const [key] of toDelete) {
      inMemoryRateLimit.delete(key);
    }
  }
}, RATE_LIMITER_CLEANUP_INTERVAL_MS).unref();
var runUpstashPipeline = async (commands) => {
  if (!isUpstashRedisConfigured()) return null;
  const response = await fetch(
    `${process.env.UPSTASH_REDIS_REST_URL}/pipeline`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(commands)
    }
  );
  if (!response.ok) return null;
  return await response.json();
};
var rateLimiter = (limit, windowMs) => {
  return async (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    const path2 = req.path || req.url || "/";
    const now = Date.now();
    const windowKey = Math.floor(now / windowMs);
    if (isUpstashRedisConfigured()) {
      const redisKey = `ratelimit:${ip}:${path2}:${windowKey}`;
      const ttlSeconds = Math.ceil(windowMs / 1e3);
      try {
        const results = await runUpstashPipeline([
          ["SET", redisKey, "0", "EX", String(ttlSeconds), "NX"],
          ["INCR", redisKey]
        ]);
        if (results && results.length === 2) {
          const incrResult = results[1]?.result;
          const currentCount = typeof incrResult === "number" ? incrResult : Number(incrResult);
          if (!Number.isNaN(currentCount) && currentCount > limit) {
            res.status(429).json({
              error: "Muitas requisi\xE7\xF5es. Tente novamente mais tarde."
            });
            return;
          }
          return next();
        }
      } catch (err) {
        log.warn("[RateLimiter] Redis indispon\xEDvel, usando fallback in-memory");
      }
    }
    const memKey = `${ip}:${path2}:${windowKey}`;
    const resetAt = (windowKey + 1) * windowMs;
    const current = inMemoryRateLimit.get(memKey) || { count: 0, resetAt };
    current.count += 1;
    current.resetAt = resetAt;
    inMemoryRateLimit.set(memKey, current);
    if (current.count > limit) {
      res.status(429).json({
        error: "Muitas requisi\xE7\xF5es. Tente novamente mais tarde."
      });
      return;
    }
    next();
  };
};

// server/middleware/auth.ts
init_dbQueryBuilder();
init_db();

// server/utils/storageUrl.ts
function resolveStoredFileUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  const storedValue = value.trim();
  if (storedValue.startsWith("/api/storage/object?file=")) return storedValue;
  let objectKey = storedValue.match(/^(avatars|materials)\/.+$/)?.[0];
  if (!objectKey) {
    try {
      const pathname = decodeURIComponent(new URL(storedValue).pathname);
      objectKey = pathname.match(/\/(avatars|materials)\/(.+)$/)?.[0]?.slice(1);
    } catch {
      return storedValue;
    }
  }
  return objectKey ? `/api/storage/object?file=${encodeURIComponent(objectKey)}` : storedValue;
}

// server/middleware/auth.ts
var verifySupabaseSession = async (token) => {
  try {
    const { data: userData, error } = await getSupabaseAdminClient().auth.getUser(token);
    if (error || !userData?.user) return null;
    const supabaseUser = userData.user;
    const email = supabaseUser.email?.toLowerCase().trim();
    if (!email) return null;
    const { data: adminRow } = await getSupabaseAdminClient().from("admin_users").select("*").eq("email", email).maybeSingle();
    if (adminRow) {
      return {
        userId: supabaseUser.id,
        email,
        role: "admin",
        authUserId: supabaseUser.id
      };
    }
    const { data: studentRow } = await getSupabaseAdminClient().from("users").select("id").eq("email", email).maybeSingle();
    if (studentRow) {
      return {
        userId: studentRow.id,
        email,
        role: "student",
        authUserId: supabaseUser.id
      };
    }
    return {
      userId: supabaseUser.id,
      email,
      role: "student",
      authUserId: supabaseUser.id
    };
  } catch (err) {
    log.error("[Auth] Error verifying Supabase session:", err);
    return null;
  }
};
var requireAuth = async (req, res, next) => {
  try {
    let token = req.cookies?.sb_session_token;
    if (!token && req.headers.authorization?.startsWith("Bearer ")) {
      token = req.headers.authorization.substring(7);
    }
    if (!token) {
      res.status(401).json({ error: "Sess\xE3o inv\xE1lida ou expirada. Por favor, fa\xE7a login novamente." });
      return;
    }
    const user = await verifySupabaseSession(token);
    if (user) {
      req.user = user;
      return next();
    }
    res.status(401).json({ error: "Sess\xE3o inv\xE1lida ou expirada. Por favor, fa\xE7a login novamente." });
  } catch (err) {
    log.error("[Auth Middleware] Error:", err);
    res.status(500).json({ error: "Erro interno de autentica\xE7\xE3o." });
  }
};
var requireAdmin = async (req, res, next) => {
  await requireAuth(req, res, () => {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Acesso negado: recursos exclusivos de administrador." });
      return;
    }
    next();
  });
};
var ensureAdminUser = async (email, authUserId) => {
  try {
    const { data: existing } = await getSupabaseAdminClient().from("admin_users").select("id, auth_user_id").eq("email", email).maybeSingle();
    if (existing) {
      if (!existing.auth_user_id || existing.auth_user_id !== authUserId) {
        await query(
          "UPDATE public.admin_users SET auth_user_id = $1, updated_at = NOW() WHERE email = $2",
          [authUserId, email]
        );
      }
    } else {
      const name = email.split("@")[0];
      await getSupabaseAdminClient().from("admin_users").insert([
        {
          email,
          name,
          role: "admin",
          auth_user_id: authUserId,
          created_at: (/* @__PURE__ */ new Date()).toISOString(),
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        }
      ]);
    }
  } catch (err) {
    log.error("[ensureAdminUser] Error:", err);
  }
};
var authenticateUser = async (email, password) => {
  const supabase = getSupabaseAnonClient();
  let { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  if (authError || !authData.user) {
    const cleanEmail2 = email.toLowerCase().trim();
    const admin = getSupabaseAdminClient();
    const { data: legacyStudent } = await admin.from("users").select("password_hash").eq("email", cleanEmail2).maybeSingle();
    const passwordHash = legacyStudent?.password_hash;
    if (!passwordHash) return { error: "E-mail ou senha inv\xE1lidos." };
    const bcrypt = await import("bcryptjs");
    const legacyPasswordIsValid = await bcrypt.compare(password, passwordHash).catch(() => false);
    if (!legacyPasswordIsValid) return { error: "E-mail ou senha inv\xE1lidos." };
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: cleanEmail2,
      password,
      email_confirm: true,
      user_metadata: { role: "student" }
    });
    if (createError || !created.user) {
      let existingAuthUserId;
      for (let page = 1; page <= 10 && !existingAuthUserId; page++) {
        const { data: pageData, error: listError } = await admin.auth.admin.listUsers({ page, perPage: 100 });
        if (listError) break;
        existingAuthUserId = pageData.users.find(
          (user) => user.email?.toLowerCase().trim() === cleanEmail2
        )?.id;
        if (pageData.users.length < 100) break;
      }
      if (!existingAuthUserId) return { error: "E-mail ou senha inv\xE1lidos." };
      const { error: updateError } = await admin.auth.admin.updateUserById(existingAuthUserId, {
        password,
        email_confirm: true
      });
      if (updateError) return { error: "E-mail ou senha inv\xE1lidos." };
    }
    ({ data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: cleanEmail2,
      password
    }));
    if (authError || !authData.user) return { error: "E-mail ou senha inv\xE1lidos." };
  }
  const cleanEmail = email.toLowerCase().trim();
  const authUserId = authData.user.id;
  const { data: adminRow } = await getSupabaseAdminClient().from("admin_users").select("*").eq("email", cleanEmail).maybeSingle();
  if (adminRow) {
    if (adminRow.auth_user_id !== authUserId) {
      await ensureAdminUser(cleanEmail, authUserId);
    }
    return {
      user: {
        ...adminRow,
        id: adminRow.id,
        role: "admin",
        answeredQuestions: adminRow.answered_questions || 0,
        correctAnswers: adminRow.correct_answers || 0,
        avatarUrl: resolveStoredFileUrl(adminRow.avatar_url)
      },
      session: authData.session
    };
  }
  const { data: studentRow } = await getSupabaseAdminClient().from("users").select("*").eq("email", cleanEmail).maybeSingle();
  if (studentRow) {
    return {
      user: {
        ...studentRow,
        id: studentRow.id,
        role: "student",
        answeredQuestions: studentRow.answered_questions || studentRow.answeredQuestions || 0,
        correctAnswers: studentRow.correct_answers || studentRow.correctAnswers || 0,
        avatarUrl: resolveStoredFileUrl(studentRow.avatar_url || studentRow.avatarUrl || studentRow.avatar),
        showInLeaderboard: studentRow.show_in_leaderboard !== false,
        languagePreference: studentRow.language_preference || "ingles",
        flashQuizCompleted: !!studentRow.flash_quiz_completed
      },
      session: authData.session
    };
  }
  return { error: "Usu\xE1rio n\xE3o encontrado no sistema." };
};

// server/index.ts
init_db();
init_dbQueryBuilder();
init_db();

// server/routes/auth.ts
import { Router } from "express";
init_db();
init_dbQueryBuilder();

// server/utils/sanitize.ts
var sanitizeInput = (input, maxLength = 100) => {
  if (!input) return "";
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;").replace(/\//g, "&#x2F;").trim().substring(0, maxLength);
};
var normalizeEmail = (email) => {
  return email.toLowerCase().trim();
};

// server/routes/auth.ts
var router = Router();
router.post("/login", rateLimiter(5, 6e4), async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "E-mail e senha s\xE3o obrigat\xF3rios." });
    return;
  }
  const cleanEmail = normalizeEmail(email);
  try {
    const { rows: attemptRows } = await query(
      "SELECT attempts, lock_until FROM public.login_attempts WHERE email = $1",
      [cleanEmail]
    );
    if (attemptRows.length > 0) {
      const attempt = attemptRows[0];
      if (attempt.lock_until && Date.now() < new Date(attempt.lock_until).getTime()) {
        const waitTime = Math.ceil(
          (new Date(attempt.lock_until).getTime() - Date.now()) / 6e4
        );
        res.status(429).json({
          error: `Conta temporariamente bloqueada por excesso de tentativas. Tente novamente em ${waitTime} minutos.`
        });
        return;
      }
    }
  } catch (err) {
    log.error("[Auth Lock Check] Erro:", err);
  }
  try {
    const result = await authenticateUser(cleanEmail, password);
    if (result.error) {
      try {
        const { rows: currentAttemptRows } = await query(
          "SELECT attempts FROM public.login_attempts WHERE email = $1",
          [cleanEmail]
        );
        if (currentAttemptRows.length > 0) {
          const newAttempts = currentAttemptRows[0].attempts + 1;
          const lockUntil = newAttempts >= MAX_LOGIN_ATTEMPTS ? new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString() : null;
          await query(
            "UPDATE public.login_attempts SET attempts = $1, lock_until = $2, updated_at = NOW() WHERE email = $3",
            [newAttempts, lockUntil, cleanEmail]
          );
        } else {
          await query(
            "INSERT INTO public.login_attempts (email, attempts, lock_until) VALUES ($1, 1, NULL)",
            [cleanEmail]
          );
        }
      } catch (dbErr) {
        log.error("[Auth] Erro ao registrar tentativa falha:", dbErr);
      }
      res.status(401).json({ error: result.error });
      return;
    }
    await query("DELETE FROM public.login_attempts WHERE email = $1", [cleanEmail]).catch(() => {
    });
    if (result.session?.access_token) {
      res.cookie("sb_session_token", result.session.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 24 * 60 * 60 * 1e3
      });
    }
    res.json({ success: true, user: result.user });
  } catch (err) {
    log.error("[Auth] Login error:", err);
    res.status(500).json({ error: "Falha na autentica\xE7\xE3o." });
  }
});
router.post("/register", rateLimiter(5, 6e4), async (req, res) => {
  const { email, password, name, city, school, gremio } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "E-mail e senha s\xE3o obrigat\xF3rios." });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "A senha deve conter no m\xEDnimo 6 caracteres." });
    return;
  }
  const cleanEmail = normalizeEmail(email);
  const safeName = sanitizeInput(name);
  const safeCity = sanitizeInput(city);
  const safeSchool = sanitizeInput(school);
  const safeGremio = sanitizeInput(gremio);
  try {
    const { rows: adminExists } = await query(
      "SELECT 1 FROM public.admin_users WHERE email = $1 LIMIT 1",
      [cleanEmail]
    );
    if (adminExists.length > 0) {
      res.status(403).json({ error: "E-mails administrativos devem ser gerenciados pelo banco de dados." });
      return;
    }
    const { data: existing } = await getSupabaseAdminClient().from("users").select("email").eq("email", cleanEmail).maybeSingle();
    if (existing) {
      res.status(400).json({ error: "E-mail j\xE1 cadastrado." });
      return;
    }
    const supabaseAdmin = getSupabaseAdminClient();
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true,
      user_metadata: { name: safeName || cleanEmail.split("@")[0], role: "student" }
    });
    if (authError || !authData.user) {
      if (authError?.message?.toLowerCase().includes("already")) {
        res.status(400).json({ error: "E-mail j\xE1 cadastrado." });
        return;
      }
      throw authError || new Error("Falha ao criar usu\xE1rio no Supabase Auth.");
    }
    const { data, error } = await supabaseAdmin.from("users").insert([
      {
        id: authData.user.id,
        email: cleanEmail,
        name: safeName || cleanEmail.split("@")[0],
        role: "student",
        city: safeCity,
        school: safeSchool,
        gremio: safeGremio,
        xp: 0,
        level: 1,
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      }
    ]).select().single();
    if (error) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id).catch(() => void 0);
      throw error;
    }
    const userObj = {
      ...data,
      id: data.id,
      role: "student",
      answeredQuestions: data.answered_questions || 0,
      correctAnswers: data.correct_answers || 0,
      avatarUrl: resolveStoredFileUrl(data.avatar_url),
      showInLeaderboard: data.show_in_leaderboard !== false,
      languagePreference: data.language_preference || "ingles"
    };
    const loginResult = await authenticateUser(cleanEmail, password);
    if (loginResult.error || !loginResult.session?.access_token) {
      throw new Error("Conta criada, mas n\xE3o foi poss\xEDvel iniciar a sess\xE3o.");
    }
    res.cookie("sb_session_token", loginResult.session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 24 * 60 * 60 * 1e3
    });
    res.status(201).json({ success: true, user: userObj });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error("[Auth] Register error:", errorMessage);
    res.status(500).json({ error: "Erro ao criar conta." });
  }
});
router.post("/forgot-password", rateLimiter(3, 6e4), async (req, res) => {
  const { email } = req.body;
  if (!email) {
    res.status(400).json({ error: "E-mail \xE9 obrigat\xF3rio." });
    return;
  }
  const cleanEmail = normalizeEmail(email);
  try {
    const { getSupabaseAnonClient: getSupabaseAnonClient2 } = await Promise.resolve().then(() => (init_dbQueryBuilder(), dbQueryBuilder_exports));
    const appUrl = process.env.APP_URL || "https://neva.pro";
    const { error } = await getSupabaseAnonClient2().auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: `${appUrl}/reset-password`
    });
    if (error) {
      log.error("[Forgot Password] Supabase error:", error.message);
    }
    res.json({
      success: true,
      message: "Se o e-mail estiver cadastrado, voc\xEA receber\xE1 um link de recupera\xE7\xE3o em instantes."
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error("[Forgot Password] Error:", errorMessage);
    res.status(500).json({ error: "Erro ao solicitar recupera\xE7\xE3o de senha." });
  }
});
router.post("/logout", async (req, res) => {
  try {
    const sbToken = req.cookies?.sb_session_token;
    if (sbToken) {
      const { getSupabaseAnonClient: getSupabaseAnonClient2 } = await Promise.resolve().then(() => (init_dbQueryBuilder(), dbQueryBuilder_exports));
      await getSupabaseAnonClient2().auth.signOut();
    }
  } catch {
  }
  res.clearCookie("sb_session_token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/"
  });
  res.json({ success: true });
});
router.post(
  "/change-password",
  rateLimiter(3, 6e4),
  requireAuth,
  async (req, res) => {
    const { email, currentPassword, newPassword } = req.body;
    if (!email || !currentPassword || !newPassword) {
      res.status(400).json({ error: "Todos os campos s\xE3o obrigat\xF3rios." });
      return;
    }
    const cleanEmail = normalizeEmail(email);
    if (req.user?.role !== "admin" && req.user?.email !== cleanEmail) {
      res.status(403).json({ error: "Acesso negado: permiss\xF5es insuficientes." });
      return;
    }
    try {
      const { getSupabaseAnonClient: getSupabaseAnonClient2 } = await Promise.resolve().then(() => (init_dbQueryBuilder(), dbQueryBuilder_exports));
      const { error: authError } = await getSupabaseAnonClient2().auth.signInWithPassword({
        email: cleanEmail,
        password: currentPassword
      });
      if (authError) {
        res.status(401).json({ error: "Senha atual incorreta." });
        return;
      }
      const supabase = getSupabaseAdminClient();
      const { data: adminRow } = await supabase.from("admin_users").select("auth_user_id").eq("email", cleanEmail).maybeSingle();
      const targetAuthUserId = adminRow?.auth_user_id || req.user?.authUserId;
      if (targetAuthUserId) {
        await supabase.auth.admin.updateUserById(targetAuthUserId, {
          password: newPassword
        });
      }
      res.json({ success: true, message: "Senha atualizada com sucesso." });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      log.error("[Change Password] Error:", errorMessage);
      res.status(500).json({ error: "Erro interno ao alterar a senha." });
    }
  }
);
var auth_default = router;

// server/routes/users.ts
import { Router as Router2 } from "express";
init_dbQueryBuilder();
var router2 = Router2();
router2.get("/profile", requireAuth, async (req, res) => {
  let email = req.query.email || req.user?.email || "";
  const cleanEmail = normalizeEmail(email);
  if (req.user?.role !== "admin" && req.user?.email !== cleanEmail) {
    res.status(403).json({ error: "Acesso negado: permiss\xF5es insuficientes." });
    return;
  }
  try {
    const { data: adminData } = await getSupabaseAdminClient().from("admin_users").select("*").eq("email", cleanEmail).maybeSingle();
    if (adminData) {
      res.json(formatUserProfile(adminData, "admin"));
      return;
    }
    const { data, error } = await getSupabaseAdminClient().from("users").select("*").eq("email", cleanEmail).maybeSingle();
    if (error) throw error;
    if (!data) {
      res.status(404).json({ error: "Usu\xE1rio n\xE3o encontrado" });
      return;
    }
    res.json(formatUserProfile(data, "student"));
  } catch (err) {
    log.error("[Profile] Error:", err);
    res.status(500).json({ error: "Erro ao buscar perfil." });
  }
});
router2.post(
  "/profile",
  rateLimiter(10, 6e4),
  requireAuth,
  async (req, res) => {
    const updateData = req.body;
    const email = normalizeEmail(updateData.email || "");
    if (!email) {
      res.status(400).json({ error: "E-mail obrigat\xF3rio" });
      return;
    }
    if (req.user?.role !== "admin" && req.user?.email !== email) {
      res.status(403).json({ error: "Acesso negado: permiss\xF5es insuficientes." });
      return;
    }
    if (updateData.role !== void 0 && req.user?.role !== "admin") {
      delete updateData.role;
    }
    const { data: adminExists } = await getSupabaseAdminClient().from("admin_users").select("id").eq("email", email).maybeSingle();
    const isAdmin = !!adminExists;
    const targetTable = isAdmin ? "admin_users" : "users";
    const fieldMapping = {
      name: "name",
      city: "city",
      school: "school",
      gremio: "gremio",
      showInLeaderboard: "show_in_leaderboard",
      languagePreference: "language_preference",
      avatarUrl: "avatar_url",
      answeredQuestions: "answered_questions",
      correctAnswers: "correct_answers",
      streak: "streak"
    };
    if (req.user?.role === "admin") {
      fieldMapping.xp = "xp";
      fieldMapping.level = "level";
      fieldMapping.role = "role";
    }
    const dbUpdate = { email };
    for (const [camelKey, snakeKey] of Object.entries(fieldMapping)) {
      if (updateData[camelKey] !== void 0) {
        dbUpdate[snakeKey] = updateData[camelKey];
      }
    }
    const isFlashQuizUpdate = !!updateData.isFlashQuizUpdate;
    let xpDiff = 0;
    let userId = null;
    let oldXp = 0;
    try {
      const { data: oldUser } = await getSupabaseAdminClient().from(targetTable).select("id, xp").eq("email", email).maybeSingle();
      if (oldUser) {
        userId = oldUser.id;
        oldXp = oldUser.xp || 0;
        if (typeof dbUpdate.xp === "number" && dbUpdate.xp > oldXp) {
          xpDiff = dbUpdate.xp - oldXp;
        }
      }
    } catch (e) {
      log.error("[Profile Update] Error fetching old user:", e);
    }
    if (isFlashQuizUpdate && userId) {
      const { data: lastQuiz } = await getSupabaseAdminClient().from("xp_logs").select("created_at").eq("user_id", userId).eq("reason", "Flash Quiz: Maranh\xE3o").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (lastQuiz) {
        const sixHours = 6 * 60 * 60 * 1e3;
        if (Date.now() - new Date(lastQuiz.created_at).getTime() < sixHours) {
          log.info(`[Flash Quiz] Blocked duplicate XP for ${email}`);
          dbUpdate.xp = oldXp;
          xpDiff = 0;
        } else {
          dbUpdate.flash_quiz_completed = true;
        }
      } else {
        dbUpdate.flash_quiz_completed = true;
      }
    }
    try {
      const { data, error } = await getSupabaseAdminClient().from(targetTable).update(dbUpdate).eq("email", email).select().single();
      if (error && error.code === "PGRST116") {
        const { data: insData } = await getSupabaseAdminClient().from(targetTable).insert([{ ...dbUpdate, id: crypto.randomUUID(), created_at: (/* @__PURE__ */ new Date()).toISOString() }]).select().single();
        if (insData) {
          await cacheInvalidate(CACHE_KEYS.LEADERBOARD, CACHE_KEYS.ADMIN_USERS);
          res.json({ success: true, user: formatUserProfile(insData, isAdmin ? "admin" : "student") });
          return;
        }
      }
      if (error) throw error;
      if (userId && xpDiff > 0) {
        const reason = updateData.xpReason || (isFlashQuizUpdate ? "Flash Quiz: Maranh\xE3o" : "Conclus\xE3o de Simulado / Atividade");
        await getSupabaseAdminClient().from("xp_logs").insert([{ user_id: userId, amount: xpDiff, reason, created_at: (/* @__PURE__ */ new Date()).toISOString() }]);
      }
      await cacheInvalidate(CACHE_KEYS.LEADERBOARD, CACHE_KEYS.ADMIN_USERS);
      res.json({ success: true, user: formatUserProfile(data, isAdmin ? "admin" : "student") });
    } catch (err) {
      log.error("[Profile Update] Error:", err);
      res.status(500).json({ error: "Erro ao salvar." });
    }
  }
);
router2.delete("/profile", requireAuth, async (req, res) => {
  const email = normalizeEmail(req.query.email || req.body?.email || "");
  if (!email) {
    res.status(400).json({ error: "E-mail \xE9 obrigat\xF3rio." });
    return;
  }
  if (req.user?.role !== "admin" && req.user?.email !== email) {
    res.status(403).json({ error: "Acesso negado: permiss\xF5es insuficientes." });
    return;
  }
  try {
    const supabase = getSupabaseAdminClient();
    const { data: userData } = await supabase.from("users").select("id").eq("email", email).maybeSingle();
    if (userData?.id) {
      const userId = userData.id;
      await supabase.from("xp_logs").delete().eq("user_id", userId);
      await supabase.from("answers").delete().eq("user_id", userId);
      await supabase.from("notifications").delete().eq("user_id", userId);
      await supabase.from("users").delete().eq("email", email);
    }
    const { rows: adminRows } = await Promise.resolve().then(() => (init_db(), db_exports)).then(
      (m) => m.query("SELECT auth_user_id FROM public.admin_users WHERE email = $1 LIMIT 1", [email])
    );
    const authUserId = adminRows[0]?.auth_user_id;
    await supabase.from("admin_users").delete().eq("email", email);
    if (authUserId) {
      await supabase.auth.admin.deleteUser(authUserId);
    }
    await cacheInvalidate(CACHE_KEYS.LEADERBOARD, CACHE_KEYS.ADMIN_USERS);
    res.json({ success: true });
  } catch (err) {
    log.error("[DELETE /api/user/profile] Error:", err);
    res.status(500).json({ error: "Erro ao remover perfil." });
  }
});
router2.get("/stats", requireAuth, async (req, res) => {
  let email = normalizeEmail(req.query.email || req.user?.email || "");
  if (req.user?.role !== "admin" && req.user?.email !== email) {
    res.status(403).json({ error: "Acesso negado: permiss\xF5es insuficientes." });
    return;
  }
  try {
    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase.from("users").select("id").eq("email", email).maybeSingle();
    if (!user) {
      res.json({ weekly: [], summary: { average: 0, best: 0, total: 0 } });
      return;
    }
    const sevenDaysAgo = /* @__PURE__ */ new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const { data: logs } = await supabase.from("xp_logs").select("*").eq("user_id", user.id).gte("created_at", sevenDaysAgo.toISOString());
    const days = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "S\xE1b"];
    const weeklyMap = {};
    for (let i = 6; i >= 0; i--) {
      const d = /* @__PURE__ */ new Date();
      d.setDate(d.getDate() - i);
      const dayName = days[d.getDay()];
      weeklyMap[dayName] = { day: dayName, xp: 0, fullDate: d.toISOString().split("T")[0] };
    }
    if (logs) {
      for (const logEntry of logs) {
        const date = new Date(logEntry.created_at);
        const dayName = days[date.getDay()];
        if (weeklyMap[dayName]) {
          weeklyMap[dayName].xp += logEntry.amount;
        }
      }
    }
    const weekly = Object.values(weeklyMap);
    const xps = weekly.map((w) => w.xp);
    const total = xps.reduce((a, b) => a + b, 0);
    const best = Math.max(...xps, 0);
    const average = Math.round(total / 7);
    const { data: lastQuizLog } = await supabase.from("xp_logs").select("created_at").eq("user_id", user.id).eq("reason", "Flash Quiz: Maranh\xE3o").order("created_at", { ascending: false }).limit(1).maybeSingle();
    let quizDone = false;
    let secondsRemaining = 0;
    if (lastQuizLog) {
      const lastQuizTime = new Date(lastQuizLog.created_at).getTime();
      const sixHours = 6 * 60 * 60 * 1e3;
      if (Date.now() - lastQuizTime < sixHours) {
        quizDone = true;
        secondsRemaining = Math.max(0, Math.ceil((lastQuizTime + sixHours - Date.now()) / 1e3));
      }
    }
    res.json({ weekly, summary: { average, best, total }, flashQuizCompleted: quizDone, quizSecondsRemaining: secondsRemaining });
  } catch (err) {
    log.error("[Stats] Error:", err);
    res.status(500).json({ error: "Erro ao processar estat\xEDsticas" });
  }
});
function formatUserProfile(data, role) {
  return {
    ...data,
    id: data.id || crypto.randomUUID(),
    role,
    answeredQuestions: data.answered_questions || data.answeredQuestions || 0,
    correctAnswers: data.correct_answers || data.correctAnswers || 0,
    avatarUrl: resolveStoredFileUrl(data.avatar_url || data.avatarUrl || data.avatar),
    showInLeaderboard: data.show_in_leaderboard !== false,
    languagePreference: data.language_preference || "ingles",
    flashQuizCompleted: !!data.flash_quiz_completed
  };
}
var users_default = router2;

// server/routes/admin.ts
import { Router as Router3 } from "express";
init_dbQueryBuilder();
init_db();
var router3 = Router3();
router3.get("/users", requireAdmin, async (req, res) => {
  try {
    const cached = await cacheGet(CACHE_KEYS.ADMIN_USERS);
    if (cached) {
      res.json(cached);
      return;
    }
    const { data, error } = await getSupabaseAdminClient().from("users").select("*").order("xp", { ascending: false });
    if (error) throw error;
    const regularStudents = (data || []).filter((u) => u.role !== "admin").map((u) => ({
      ...u,
      answeredQuestions: u.answered_questions || u.answeredQuestions || 0,
      correctAnswers: u.correct_answers || u.correctAnswers || 0,
      avatarUrl: resolveStoredFileUrl(u.avatar_url || u.avatarUrl || u.avatar)
    }));
    await cacheSet(CACHE_KEYS.ADMIN_USERS, regularStudents);
    res.json(regularStudents);
  } catch (err) {
    log.error("[Admin Users] Error:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});
router3.get("/activities", requireAdmin, async (req, res) => {
  try {
    const cached = await cacheGet(CACHE_KEYS.ADMIN_ACTIVITIES);
    if (cached) {
      res.json(cached);
      return;
    }
    const { rows: logs } = await query(`
      SELECT x.*, u.name as user_name, u.city as user_city
      FROM xp_logs x
      LEFT JOIN users u ON x.user_id = u.id
      ORDER BY x.created_at DESC
      LIMIT 20
    `);
    const activities = (logs || []).map((logEntry) => {
      const logDate = new Date(logEntry.created_at);
      const diff = Math.floor((Date.now() - logDate.getTime()) / 6e4);
      let timeStr = "Agora";
      if (diff > 0 && diff < 60) timeStr = `H\xE1 ${diff} min`;
      else if (diff >= 60 && diff < 1440) timeStr = `H\xE1 ${Math.floor(diff / 60)}h`;
      else if (diff >= 1440) timeStr = `H\xE1 ${Math.floor(diff / 1440)} dias`;
      return {
        id: logEntry.id,
        user: logEntry.user_name || "Estudante",
        action: `Ganhou ${logEntry.amount} XP: ${logEntry.reason || "Atividade"}`,
        time: timeStr,
        city: logEntry.user_city || "Brasil"
      };
    });
    const sevenDaysAgo = /* @__PURE__ */ new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const [mats, recs] = await Promise.all([
      getSupabaseAdminClient().from("materials").select("uploaded_at").gte("uploaded_at", sevenDaysAgo.toISOString().split("T")[0]),
      getSupabaseAdminClient().from("mural").select("created_at").gte("created_at", sevenDaysAgo.toISOString())
    ]);
    const days = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "S\xC1B"];
    const production = {};
    for (let i = 6; i >= 0; i--) {
      const d = /* @__PURE__ */ new Date();
      d.setDate(d.getDate() - i);
      production[days[d.getDay()]] = 0;
    }
    for (const m of mats.data || []) {
      const d = new Date(m.uploaded_at);
      const day = days[d.getDay()];
      if (production[day] !== void 0) production[day]++;
    }
    for (const r of recs.data || []) {
      const d = new Date(r.created_at || r.date);
      const day = days[d.getDay()];
      if (production[day] !== void 0) production[day]++;
    }
    const productionList = Object.entries(production).map(([day, value]) => ({ day, value }));
    const result = { activities, production: productionList };
    await cacheSet(CACHE_KEYS.ADMIN_ACTIVITIES, result);
    res.json(result);
  } catch (err) {
    log.error("[Admin Activities] Error:", err);
    res.status(500).json({ error: "Failed to fetch activities" });
  }
});
router3.post(
  "/sync-auth-users",
  rateLimiter(1, 6e4),
  requireAdmin,
  async (req, res) => {
    try {
      const supabase = getSupabaseAdminClient();
      const { data: authResult, error: authError } = await supabase.auth.admin.listUsers();
      if (authError) throw authError;
      const authUsers = authResult?.users || [];
      let created = 0;
      let updated = 0;
      let skipped = 0;
      for (const au of authUsers) {
        if (!au.email) {
          skipped++;
          continue;
        }
        const email = au.email.toLowerCase().trim();
        const { data: existingAdmin } = await supabase.from("admin_users").select("id, auth_user_id").eq("email", email).maybeSingle();
        const { data: existingStudent } = await supabase.from("users").select("id").eq("email", email).maybeSingle();
        if (existingStudent) {
          skipped++;
          continue;
        }
        if (existingAdmin) {
          if (!existingAdmin.auth_user_id || existingAdmin.auth_user_id !== au.id) {
            await query(
              "UPDATE public.admin_users SET auth_user_id = $1, updated_at = NOW() WHERE email = $2",
              [au.id, email]
            );
            updated++;
          } else {
            skipped++;
          }
        } else {
          const adminName = au.raw_user_meta_data?.name || au.raw_user_meta_data?.full_name || au.email?.split("@")[0] || email.split("@")[0];
          await supabase.from("admin_users").insert([
            {
              id: crypto.randomUUID(),
              email,
              name: adminName,
              role: "admin",
              auth_user_id: au.id,
              created_at: (/* @__PURE__ */ new Date()).toISOString(),
              updated_at: (/* @__PURE__ */ new Date()).toISOString()
            }
          ]);
          created++;
        }
      }
      res.json({
        success: true,
        message: `Sincroniza\xE7\xE3o conclu\xEDda. ${created} criados, ${updated} atualizados, ${skipped} ignorados.`,
        stats: { created, updated, skipped, total: authUsers.length }
      });
    } catch (err) {
      log.error("[Sync Auth Users] Error:", err);
      res.status(500).json({ error: "Erro ao sincronizar usu\xE1rios do Auth." });
    }
  }
);
var admin_default = router3;

// server/routes/materials.ts
import { Router as Router4 } from "express";
init_dbQueryBuilder();

// server/services/notification.ts
init_db();
var addNotification = async (title, message, type) => {
  try {
    await query(
      `INSERT INTO public.notifications (id, user_id, title, content, type, is_read, created_at)
       VALUES (gen_random_uuid(), NULL, $1, $2, $3, false, NOW())`,
      [title, message, type.toLowerCase()]
    );
    log.info(`[addNotification] Global notification sent: "${title}"`);
  } catch (e) {
    log.error("[addNotification] Failed to save notification:", e);
  }
};

// server/utils/validation.ts
var objectBody = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
function readText(value, field, limit, required = false) {
  if (value === void 0 || value === null || value === "") {
    return required ? { error: `O campo ${field} \xE9 obrigat\xF3rio.` } : { data: void 0 };
  }
  if (typeof value !== "string") return { error: `O campo ${field} deve ser um texto.` };
  const data = value.trim();
  if (required && !data) return { error: `O campo ${field} \xE9 obrigat\xF3rio.` };
  if (data.length > limit) return { error: `O campo ${field} deve ter no m\xE1ximo ${limit} caracteres.` };
  return { data };
}
function readInteger(value, field, max) {
  if (value === void 0 || value === null || value === "") return { data: void 0 };
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > max) {
    return { error: `O campo ${field} deve ser um n\xFAmero inteiro entre 0 e ${max}.` };
  }
  return { data: value };
}
function readFields(body, specs) {
  const data = {};
  for (const [field, limit, required] of specs) {
    const result = readText(body[field], field, limit, required);
    if ("error" in result) return result;
    if (result.data !== void 0) data[field] = result.data;
  }
  return { data };
}
function validateMaterialInput(body, partial = false) {
  if (!objectBody(body)) return { error: "Corpo da requisi\xE7\xE3o inv\xE1lido." };
  const result = readFields(body, [
    ["title", 255, !partial],
    ["type", 50, !partial],
    ["subject", 255, false],
    ["foco", 255, false],
    ["url", 2048, !partial],
    ["description", 5e3, false]
  ]);
  if ("error" in result) return result;
  if (partial && Object.keys(result.data).length === 0) return { error: "Nenhum campo v\xE1lido foi informado." };
  return result;
}
function validateEventInput(body, partial = false) {
  if (!objectBody(body)) return { error: "Corpo da requisi\xE7\xE3o inv\xE1lido." };
  const result = readFields(body, [
    ["title", 255, !partial],
    ["description", 5e3, false],
    ["date", 50, false],
    ["time", 50, false],
    ["type", 50, false],
    ["category", 100, false],
    ["observation", 5e3, false]
  ]);
  if ("error" in result) return result;
  for (const [field, max] of [["questionsCount", 1e4], ["xpReward", 1e6]]) {
    const number = readInteger(body[field], field, max);
    if ("error" in number) return number;
    if (number.data !== void 0) result.data[field] = number.data;
  }
  if (partial && Object.keys(result.data).length === 0) return { error: "Nenhum campo v\xE1lido foi informado." };
  return result;
}
function validateMuralInput(body, partial = false) {
  if (!objectBody(body)) return { error: "Corpo da requisi\xE7\xE3o inv\xE1lido." };
  const result = readFields(body, [
    ["title", 255, !partial],
    ["content", 1e4, !partial],
    ["type", 50, false],
    ["category", 50, false],
    ["tag", 100, false]
  ]);
  if ("error" in result) return result;
  if (partial && Object.keys(result.data).length === 0) return { error: "Nenhum campo v\xE1lido foi informado." };
  return result;
}

// server/routes/materials.ts
var router4 = Router4();
router4.get("/", async (req, res) => {
  try {
    const cached = await cacheGet(CACHE_KEYS.MATERIALS);
    if (cached) {
      res.json(cached);
      return;
    }
    const { data, error } = await getSupabaseAdminClient().from("materials").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    const mapped = (data || []).map((m) => ({
      id: m.id,
      title: m.title,
      subject: m.subject,
      foco: m.foco,
      description: m.description,
      url: m.url,
      type: m.type,
      uploadedAt: m.uploaded_at || m.created_at
    }));
    await cacheSet(CACHE_KEYS.MATERIALS, mapped);
    res.json(mapped);
  } catch (err) {
    log.error("[Materials] Error:", err);
    res.status(500).json({ error: "Failed to fetch materials" });
  }
});
router4.post("/", rateLimiter(10, 6e4), requireAdmin, async (req, res) => {
  try {
    const validation = validateMaterialInput(req.body);
    if ("error" in validation) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const { title, type, subject, foco, url, description } = validation.data;
    const { data, error } = await getSupabaseAdminClient().from("materials").insert([
      {
        title,
        type,
        subject,
        foco,
        url,
        description,
        uploaded_at: (/* @__PURE__ */ new Date()).toISOString(),
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      }
    ]).select().single();
    if (error) throw error;
    await cacheInvalidate(CACHE_KEYS.MATERIALS, CACHE_KEYS.ADMIN_ACTIVITIES);
    await addNotification("Novo Material", `"${title}" em ${foco || subject || "ENEM geral"}.`, "material");
    const mappedResult = {
      id: data.id,
      title: data.title,
      subject: data.subject,
      foco: data.subject,
      description: data.description,
      url: data.url,
      type: data.type,
      uploadedAt: data.uploaded_at || data.created_at
    };
    res.status(201).json(mappedResult);
  } catch (err) {
    log.error("[Materials Create] Error:", err);
    res.status(500).json({ error: "Failed to create material" });
  }
});
router4.put("/:id", rateLimiter(10, 6e4), requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const validation = validateMaterialInput(req.body, true);
    if ("error" in validation) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const updates = { ...validation.data, updated_at: (/* @__PURE__ */ new Date()).toISOString() };
    const { data, error } = await getSupabaseAdminClient().from("materials").update(updates).eq("id", id).select().single();
    if (error) throw error;
    await cacheInvalidate(CACHE_KEYS.MATERIALS);
    res.json(data);
  } catch (err) {
    log.error("[Materials Update] Error:", err);
    res.status(500).json({ error: "Failed to update material" });
  }
});
router4.delete("/:id", rateLimiter(10, 6e4), requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await getSupabaseAdminClient().from("materials").delete().eq("id", id);
    if (error) throw error;
    await cacheInvalidate(CACHE_KEYS.MATERIALS);
    res.json({ success: true });
  } catch (err) {
    log.error("[Materials Delete] Error:", err);
    res.status(500).json({ error: "Failed to delete material" });
  }
});
router4.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await getSupabaseAdminClient().from("materials").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) {
      res.status(404).json({ error: "Material not found" });
      return;
    }
    res.json(data);
  } catch (err) {
    log.error("[Materials Get] Error:", err);
    res.status(500).json({ error: "Failed to fetch material" });
  }
});
var materials_default = router4;

// server/routes/events.ts
import { Router as Router5 } from "express";
init_dbQueryBuilder();
var router5 = Router5();
router5.get("/", async (req, res) => {
  try {
    const cached = await cacheGet(CACHE_KEYS.EVENTOS);
    if (cached) {
      res.json(cached);
      return;
    }
    const { data, error } = await getSupabaseAdminClient().from("events").select("*").order("date", { ascending: true });
    if (error) throw error;
    const mapped = (data || []).map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      date: e.date,
      time: e.time,
      type: e.type,
      category: e.category,
      questionsCount: e.questions_count || 0,
      xpReward: e.xp_reward || 0,
      observation: e.observation
    }));
    await cacheSet(CACHE_KEYS.EVENTOS, mapped);
    res.json(mapped);
  } catch (err) {
    log.error("[Events] Error:", err);
    res.status(500).json({ error: "Failed to fetch events" });
  }
});
router5.post("/", rateLimiter(10, 6e4), requireAdmin, async (req, res) => {
  try {
    const validation = validateEventInput(req.body);
    if ("error" in validation) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const { title, description, date, time, type, category, questionsCount, xpReward, observation } = validation.data;
    const { data: result, error } = await getSupabaseAdminClient().from("events").insert([
      {
        title,
        description,
        date,
        time,
        type,
        category,
        questions_count: questionsCount || 0,
        xp_reward: xpReward || 0,
        observation,
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      }
    ]).select().single();
    if (error) throw error;
    await cacheInvalidate(CACHE_KEYS.EVENTOS, CACHE_KEYS.ADMIN_ACTIVITIES);
    await addNotification("Novo Evento", `${title}`, "evento");
    const mappedResult = {
      id: result.id,
      title: result.title,
      description: result.description,
      date: result.date,
      time: result.time,
      type: result.type,
      category: result.category,
      questionsCount: result.questions_count || 0,
      xpReward: result.xp_reward || 0,
      observation: result.observation
    };
    res.status(201).json(mappedResult);
  } catch (err) {
    log.error("[Events Create] Error:", err);
    res.status(500).json({ error: "Failed to create event" });
  }
});
router5.put("/:id", rateLimiter(10, 6e4), requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const validation = validateEventInput(req.body, true);
    if ("error" in validation) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const { questionsCount, xpReward, ...fields } = validation.data;
    const updates = {
      ...fields,
      ...questionsCount !== void 0 ? { questions_count: questionsCount } : {},
      ...xpReward !== void 0 ? { xp_reward: xpReward } : {},
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    const { data, error } = await getSupabaseAdminClient().from("events").update(updates).eq("id", id).select().single();
    if (error) throw error;
    await cacheInvalidate(CACHE_KEYS.EVENTOS);
    res.json(data);
  } catch (err) {
    log.error("[Events Update] Error:", err);
    res.status(500).json({ error: "Failed to update event" });
  }
});
router5.delete("/:id", rateLimiter(10, 6e4), requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await getSupabaseAdminClient().from("events").delete().eq("id", id);
    if (error) throw error;
    await cacheInvalidate(CACHE_KEYS.EVENTOS);
    res.json({ success: true });
  } catch (err) {
    log.error("[Events Delete] Error:", err);
    res.status(500).json({ error: "Failed to delete event" });
  }
});
router5.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await getSupabaseAdminClient().from("events").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    res.json(data);
  } catch (err) {
    log.error("[Events Get] Error:", err);
    res.status(500).json({ error: "Failed to fetch event" });
  }
});
var events_default = router5;

// server/routes/mural.ts
import { Router as Router6 } from "express";
init_dbQueryBuilder();
var router6 = Router6();
router6.get("/", async (req, res) => {
  try {
    const cached = await cacheGet(CACHE_KEYS.RECADOS);
    if (cached) {
      res.json(cached);
      return;
    }
    const { data, error } = await getSupabaseAdminClient().from("mural").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    const mapped = (data || []).map((m) => ({
      id: m.id,
      title: m.title,
      content: m.content,
      date: m.created_at || (/* @__PURE__ */ new Date()).toISOString(),
      sender: m.sender || "Administra\xE7\xE3o",
      category: m.type || "geral",
      tag: m.tag || ""
    }));
    await cacheSet(CACHE_KEYS.RECADOS, mapped);
    res.json(mapped);
  } catch (err) {
    log.error("[Mural] Error:", err);
    res.status(500).json({ error: "Failed to fetch notices" });
  }
});
router6.post("/", rateLimiter(10, 6e4), requireAdmin, async (req, res) => {
  try {
    const validation = validateMuralInput(req.body);
    if ("error" in validation) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const { title, content, type, category, tag } = validation.data;
    const { data: result, error } = await getSupabaseAdminClient().from("mural").insert([
      {
        title,
        content,
        type: type || category || "GERAL",
        tag,
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      }
    ]).select().single();
    if (error) throw error;
    await cacheInvalidate(CACHE_KEYS.RECADOS, CACHE_KEYS.ADMIN_ACTIVITIES);
    await addNotification("Novo Recado", `${title}`, "mural");
    const mappedResult = {
      id: result.id,
      title: result.title,
      content: result.content,
      sender: "Administra\xE7\xE3o",
      date: result.created_at || (/* @__PURE__ */ new Date()).toISOString(),
      category: (result.type || "geral").toLowerCase(),
      tag: result.tag || ""
    };
    res.status(201).json(mappedResult);
  } catch (err) {
    log.error("[Mural Create] Error:", err);
    res.status(500).json({ error: "Failed to create notice" });
  }
});
router6.put("/:id", rateLimiter(10, 6e4), requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const validation = validateMuralInput(req.body, true);
    if ("error" in validation) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const { category, ...fields } = validation.data;
    const updates = { ...fields, ...category !== void 0 ? { type: category } : {} };
    const { data, error } = await getSupabaseAdminClient().from("mural").update(updates).eq("id", id).select().single();
    if (error) throw error;
    await cacheInvalidate(CACHE_KEYS.RECADOS);
    res.json(data);
  } catch (err) {
    log.error("[Mural Update] Error:", err);
    res.status(500).json({ error: "Failed to update notice" });
  }
});
router6.delete("/:id", rateLimiter(10, 6e4), requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await getSupabaseAdminClient().from("mural").delete().eq("id", id);
    if (error) throw error;
    await cacheInvalidate(CACHE_KEYS.RECADOS);
    res.json({ success: true });
  } catch (err) {
    log.error("[Mural Delete] Error:", err);
    res.status(500).json({ error: "Failed to delete notice" });
  }
});
var mural_default = router6;

// server/routes/notifications.ts
import { Router as Router7 } from "express";
init_dbQueryBuilder();
init_db();
var router7 = Router7();
async function getUserIdByEmail(email) {
  const { rows } = await query("SELECT id FROM public.users WHERE email = $1 LIMIT 1", [email]);
  return rows.length > 0 ? rows[0].id : null;
}
async function markGlobalNotificationAsRead(notificationId, userId) {
  await query(
    `INSERT INTO public.notification_reads (id, user_id, notification_id, read_at)
     VALUES (gen_random_uuid(), $1, $2, NOW())
     ON CONFLICT (user_id, notification_id) DO NOTHING`,
    [userId, notificationId]
  );
}
router7.get("/", requireAuth, async (req, res) => {
  const email = (req.query.email || req.user?.email || "").toLowerCase().trim();
  if (req.user?.role !== "admin" && req.user?.email !== email) {
    res.status(403).json({ error: "Acesso negado: permiss\xF5es insuficientes." });
    return;
  }
  try {
    const userId = await getUserIdByEmail(email);
    if (!userId) {
      res.json([]);
      return;
    }
    const { data: notifications, error } = await getSupabaseAdminClient().from("notifications").select("*").or(`user_id.eq.${userId},user_id.is.null`).order("created_at", { ascending: false });
    if (error) throw error;
    const { data: reads } = await getSupabaseAdminClient().from("notification_reads").select("notification_id").eq("user_id", userId);
    const readGlobalIds = new Set((reads || []).map((r) => r.notification_id));
    const mapped = (notifications || []).map((n) => {
      const isGlobal = n.user_id === null;
      return {
        id: n.id,
        user_id: n.user_id,
        title: n.title,
        message: n.content || "",
        type: n.type,
        read: isGlobal ? readGlobalIds.has(n.id) : !!n.is_read,
        createdAt: n.created_at || (/* @__PURE__ */ new Date()).toISOString()
      };
    });
    res.json(mapped);
  } catch (err) {
    log.error("[Notifications] Error:", err);
    res.json([]);
  }
});
router7.post("/read-all", requireAuth, async (req, res) => {
  const email = (req.query.email || req.user?.email || "").toLowerCase().trim();
  if (req.user?.role !== "admin" && req.user?.email !== email) {
    res.status(403).json({ error: "Acesso negado: permiss\xF5es insuficientes." });
    return;
  }
  try {
    const userId = await getUserIdByEmail(email);
    if (!userId) {
      res.json({ success: false, error: "User not found" });
      return;
    }
    await getSupabaseAdminClient().from("notifications").update({ is_read: true }).eq("user_id", userId).eq("is_read", false);
    await query(
      `INSERT INTO public.notification_reads (user_id, notification_id)
       SELECT $1, id FROM public.notifications
       WHERE user_id IS NULL
         AND id <> ALL (
           SELECT notification_id FROM public.notification_reads WHERE user_id = $1
         )`,
      [userId]
    );
    res.json({ success: true });
  } catch (err) {
    log.error("[Notifications ReadAll] Error:", err);
    res.json({ success: false });
  }
});
router7.post("/:id/read", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { data: notif } = await getSupabaseAdminClient().from("notifications").select("user_id").eq("id", id).maybeSingle();
    if (!notif) {
      res.status(404).json({ error: "Notifica\xE7\xE3o n\xE3o encontrada" });
      return;
    }
    const userId = await getUserIdByEmail(req.user?.email || "");
    if (req.user?.role !== "admin" && userId && notif.user_id && notif.user_id !== userId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    if (notif.user_id === null && userId) {
      await markGlobalNotificationAsRead(id, userId);
    } else {
      const { error } = await getSupabaseAdminClient().from("notifications").update({ is_read: true }).eq("id", id);
      if (error) throw error;
    }
    res.json({ success: true });
  } catch (err) {
    log.error("[Notification Read] Error:", err);
    res.status(500).json({ error: "Failed to mark as read" });
  }
});
var notifications_default = router7;

// server/routes/leaderboard.ts
init_dbQueryBuilder();
import { Router as Router8 } from "express";
var router8 = Router8();
router8.get("/", async (req, res) => {
  try {
    const cached = await cacheGet(CACHE_KEYS.LEADERBOARD);
    if (cached) {
      res.json(cached);
      return;
    }
    const { data, error } = await getSupabaseAdminClient().from("users").select("name, city, xp, level, avatar_url").not("role", "is", null).neq("role", "admin").eq("show_in_leaderboard", true).order("xp", { ascending: false }).limit(20);
    if (error) throw error;
    const filteredLeaderboard = (data || []).map((u) => ({
      name: u.name,
      city: u.city,
      xp: u.xp || 0,
      level: u.level || 1,
      avatarUrl: resolveStoredFileUrl(u.avatar_url)
    }));
    await cacheSet(CACHE_KEYS.LEADERBOARD, filteredLeaderboard);
    res.json(filteredLeaderboard);
  } catch (err) {
    log.error("[Leaderboard] Error:", err);
    res.status(500).json({ error: "Erro ao buscar ranking" });
  }
});
var leaderboard_default = router8;

// server/routes/questions.ts
import { Router as Router9 } from "express";
var router9 = Router9();
var BASE_URL = "https://api.enem.dev/v1";
router9.get("/", async (req, res) => {
  const { year, limit, offset } = req.query;
  if (!year) {
    res.status(400).json({ error: "Year parameter is required" });
    return;
  }
  try {
    const apiUrl = `${BASE_URL}/questions/${year}?limit=${limit || 50}&offset=${offset || 0}`;
    const response = await fetch(apiUrl, {
      headers: { "Content-Type": "application/json" }
    });
    if (!response.ok) {
      res.status(response.status).json({ error: `ENEM API error: ${response.statusText}` });
      return;
    }
    const data = await response.json();
    res.json({ questions: data.questions || data });
  } catch (err) {
    log.error("[Questions Proxy] Error:", err);
    res.status(500).json({ error: "Failed to fetch questions from ENEM API" });
  }
});
var questions_default = router9;

// server/routes/health.ts
import { Router as Router10 } from "express";
var router10 = Router10();
router10.get("/", (req, res) => {
  res.json({
    status: "ok",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});
var health_default = router10;

// server/index.ts
dotenv3.config();
validateEnv();
var app = express();
app.set("trust proxy", 1);
app.disable("etag");
var ALLOWED_ORIGIN2 = (() => {
  try {
    return new URL(process.env.FRONTEND_URL || "https://neva.pro").origin;
  } catch {
    return process.env.FRONTEND_URL || "https://neva.pro";
  }
})();
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN2);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-CSRF-Token");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});
app.use(cookieParser());
app.use(
  helmet({
    contentSecurityPolicy: process.env.NODE_ENV === "production" ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https://api.enem.dev", "https://enem.dev"],
        connectSrc: ["'self'", "https://api.enem.dev"],
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: []
      }
    } : false,
    crossOriginEmbedderPolicy: false
  })
);
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  log.info(`[${(/* @__PURE__ */ new Date()).toISOString()}] ${req.method} ${req.url}`);
  next();
});
app.use("/api", rateLimiter(300, 15 * 60 * 1e3));
app.use("/api", csrfProtection);
app.use("/api/auth", auth_default);
app.use("/api/user", users_default);
app.use("/api/admin", admin_default);
app.use("/api/materials", materials_default);
app.use("/api/eventos", events_default);
app.use("/api/recados", mural_default);
app.use("/api/notifications", notifications_default);
app.use("/api/leaderboard", leaderboard_default);
app.use("/api/questoes", questions_default);
app.use("/api/health", health_default);
app.get("/api/imagem", async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) {
    res.status(400).send("URL missing");
    return;
  }
  try {
    const parsedUrl = new URL(imageUrl);
    const hostname = parsedUrl.hostname.toLowerCase();
    const allowedHostsEnv = process.env.ALLOWED_IMAGE_HOSTS || "";
    const extraHosts = allowedHostsEnv.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
    const isAllowedHost = hostname === "enem.dev" || hostname === "api.enem.dev" || extraHosts.includes(hostname);
    if (!isAllowedHost) {
      res.status(403).send("Acesso negado: dom\xEDnio n\xE3o permitido.");
      return;
    }
    const response = await fetch(imageUrl, {
      headers: { "User-Agent": "Mozilla", Referer: "https://enem.dev/" },
      redirect: "manual"
    });
    if (response.status >= 300 && response.status < 400) {
      res.status(403).send("Acesso negado: redirecionamentos n\xE3o s\xE3o permitidos.");
      return;
    }
    if (!response.ok) {
      res.status(response.status).send("Fetch error");
      return;
    }
    res.setHeader("Content-Type", response.headers.get("content-type") || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);
  } catch {
    res.status(500).send("Proxy error");
  }
});
app.get("/api/storage/object", requireAuth, async (req, res) => {
  const filePath = req.query.file;
  if (!filePath) {
    res.status(400).json({ error: "Par\xE2metro file \xE9 obrigat\xF3rio." });
    return;
  }
  if (filePath.includes("..") || filePath.includes("\\\\") || filePath.startsWith("/")) {
    res.status(400).json({ error: "Caminho de arquivo inv\xE1lido." });
    return;
  }
  try {
    const bucketName = process.env.B2_BUCKET_NAME || "neva-avatars";
    const { data, error } = await dbAdmin.storage.from(bucketName).getObject(filePath);
    if (error || !data) {
      log.error("[Storage] GetObject error:", error);
      res.status(500).json({ error: "Erro ao buscar arquivo no Storage." });
      return;
    }
    const { stream, contentType } = data;
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, max-age=3600");
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    res.send(Buffer.concat(chunks));
  } catch (error) {
    log.error("[Storage] Error:", error);
    res.status(500).json({ error: "Erro ao servir arquivo." });
  }
});
app.post("/api/answers", rateLimiter(30, 6e4), requireAuth, async (req, res) => {
  const { userId, questionId, isCorrect, selectedOption, questionData } = req.body;
  try {
    const qCheck = await query("SELECT 1 FROM public.questions WHERE id = $1 LIMIT 1", [questionId]);
    if (qCheck.rows.length === 0 && questionData) {
      await query(
        `INSERT INTO public.questions (id, subject, text, image_url, correct_option_index, explanation, difficulty, xp_reward, year, index)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO NOTHING`,
        [
          questionId,
          questionData.subject || "Geral",
          questionData.text,
          questionData.imageUrl || null,
          questionData.correctOptionIndex,
          questionData.explanation || "",
          questionData.difficulty || "m\xE9dio",
          questionData.xpReward || 50,
          questionData.year || 2023,
          questionData.index || 0
        ]
      );
      if (Array.isArray(questionData.options)) {
        for (let idx = 0; idx < questionData.options.length; idx++) {
          const letter = String.fromCharCode(65 + idx);
          await query(
            `INSERT INTO public.question_options (id, question_id, text, image_url, letter, is_correct)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
            [questionId, questionData.options[idx], questionData.optionImages?.[idx] || null, letter, idx === questionData.correctOptionIndex]
          );
        }
      }
    }
    await query(
      `INSERT INTO public.answers (id, user_id, question_id, selected_option_index, is_correct, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())`,
      [userId, questionId, selectedOption !== void 0 ? selectedOption : null, isCorrect]
    );
    res.json({ success: true });
  } catch (err) {
    log.error("[POST /api/answers] Error:", err);
    res.status(500).json({ error: "Erro ao registrar resposta." });
  }
});
app.get("/api/user/errors", requireAuth, async (req, res) => {
  const email = (req.query.email || req.user?.email || "").toLowerCase().trim();
  if (req.user?.role !== "admin" && req.user?.email !== email) {
    res.status(403).json({ error: "Acesso negado: permiss\xF5es insuficientes." });
    return;
  }
  try {
    const userRes = await query("SELECT id FROM public.users WHERE email = $1 LIMIT 1", [email]);
    if (userRes.rows.length === 0) {
      res.status(404).json({ error: "Usu\xE1rio n\xE3o encontrado" });
      return;
    }
    const userId = userRes.rows[0].id;
    const errorsQuery = `
      WITH latest_answers AS (
        SELECT *, ROW_NUMBER() OVER(PARTITION BY question_id ORDER BY created_at DESC) as rn
        FROM public.answers WHERE user_id = $1
      )
      SELECT la.id as answer_id, la.selected_option_index, la.created_at as answered_at,
             q.id as question_id, q.subject, q.text as question_text, q.image_url,
             q.correct_option_index, q.explanation, q.difficulty, q.year, q.index
      FROM latest_answers la
      JOIN public.questions q ON la.question_id = q.id
      WHERE la.rn = 1 AND la.is_correct = false
      ORDER BY la.created_at DESC`;
    const errorsRes = await query(errorsQuery, [userId]);
    const result = [];
    if (errorsRes.rows.length > 0) {
      const questionIds = errorsRes.rows.map((r) => r.question_id);
      const optsRes = await query(
        `SELECT question_id, text, image_url, letter FROM public.question_options WHERE question_id = ANY($1::varchar[]) ORDER BY letter ASC`,
        [questionIds]
      );
      const optionsByQuestion = /* @__PURE__ */ new Map();
      for (const opt of optsRes.rows) {
        if (!optionsByQuestion.has(opt.question_id)) {
          optionsByQuestion.set(opt.question_id, []);
        }
        optionsByQuestion.get(opt.question_id).push(opt);
      }
      for (const errRow of errorsRes.rows) {
        const opts = optionsByQuestion.get(errRow.question_id) || [];
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
          options: opts.map((o) => o.text),
          optionImages: opts.map((o) => o.image_url)
        });
      }
    }
    res.json(result);
  } catch (err) {
    log.error("[GET /api/user/errors] Error:", err);
    res.status(500).json({ error: "Erro ao buscar caderno de erros." });
  }
});
app.post("/api/lgpd/consent-log", async (req, res) => {
  const { preferences, userAgent } = req.body;
  if (!preferences) {
    res.status(400).json({ error: "Prefer\xEAncias de consentimento s\xE3o obrigat\xF3rias." });
    return;
  }
  try {
    const consentTypes = Object.entries(preferences).filter(([, v]) => v === true).map(([k]) => k).join(",").substring(0, 100);
    await query(
      `INSERT INTO public.consent_logs (id, consent_type, ip_address, user_agent, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, NOW())`,
      [consentTypes || "necessary_only", req.ip || req.socket?.remoteAddress || "unknown", userAgent || req.headers["user-agent"] || ""]
    );
    log.info("[LGPD] Consent preferences saved:", consentTypes);
    res.json({ success: true });
  } catch (err) {
    log.error("[LGPD] Failed to save consent:", err);
    res.status(500).json({ error: "Erro ao registrar consentimento." });
  }
});
var upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const extension = file.originalname.toLowerCase().split(".").pop() || "";
    const isMaterial = req.query.kind === "material";
    const imageTypes = {
      jpg: ["image/jpeg"],
      jpeg: ["image/jpeg"],
      png: ["image/png"],
      gif: ["image/gif"],
      webp: ["image/webp"]
    };
    const materialTypes = {
      ...imageTypes,
      pdf: ["application/pdf"],
      mp4: ["video/mp4"],
      webm: ["video/webm"]
    };
    const allowedTypes = isMaterial ? materialTypes : imageTypes;
    if (allowedTypes[extension]?.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(isMaterial ? "Formato n\xE3o permitido. Envie PDF, JPG, PNG, GIF, WEBP, MP4 ou WEBM." : "Formato n\xE3o permitido. Envie uma imagem JPG, PNG, GIF ou WEBP."));
    }
  }
});
var receiveUpload = (req, res, next) => {
  upload.single("file")(req, res, (error) => {
    if (error) {
      const message = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE" ? "O arquivo deve ter no m\xE1ximo 5 MB." : error instanceof Error ? error.message : "Arquivo inv\xE1lido.";
      res.status(400).json({ error: message });
      return;
    }
    next();
  });
};
app.post("/api/upload", rateLimiter(5, 6e4), requireAuth, receiveUpload, async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "Nenhum arquivo enviado." });
      return;
    }
    if (req.query.kind !== "material" && req.file.size > 2 * 1024 * 1024) {
      res.status(400).json({ error: "A foto de perfil deve ter no m\xE1ximo 2 MB." });
      return;
    }
    const bucketName = process.env.B2_BUCKET_NAME || "neva-avatars";
    const fileExt = req.file.originalname.split(".").pop() || "jpg";
    const prefix = req.query.kind === "material" ? "materials" : "avatars";
    const fileName = `${prefix}/${crypto.randomUUID()}.${fileExt.toLowerCase()}`;
    const { data, error } = await dbAdmin.storage.from(bucketName).upload(fileName, req.file.buffer, {
      contentType: req.file.mimetype
    });
    if (error) throw error;
    res.json({ url: `/api/storage/object?file=${encodeURIComponent(fileName)}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upload failed";
    log.error("[Upload] Error:", msg);
    res.status(500).json({ error: "Falha ao enviar arquivo." });
  }
});
if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
  (async () => {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
      app.use(vite.middlewares);
      log.info("[Vite] Dev server middleware attached for HMR");
    } catch (err) {
      log.warn("[Vite] Dev middleware not available, running without HMR");
    }
  })();
}
if (process.env.NODE_ENV === "production") {
  const distPath = path.resolve("dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api")) return;
    res.sendFile(path.join(distPath, "index.html"));
  });
}
Sentry3.setupExpressErrorHandler(app);
app.use((err, req, res, _next) => {
  log.error("[Unhandled Error]", err?.message || err);
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ error: "JSON mal formatado no corpo da requisi\xE7\xE3o." });
    return;
  }
  if (err.type === "entity.parse.failed") {
    res.status(400).json({ error: "Erro ao interpretar JSON." });
    return;
  }
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: status >= 500 ? "Erro interno do servidor." : err.message || "Erro ao processar requisi\xE7\xE3o."
  });
});
var PORT = parseInt(process.env.PORT || "3000", 10);

// server/vercel.ts
var config4 = {
  api: {
    bodyParser: false
  }
};
var vercel_default = app;
export {
  config4 as config,
  vercel_default as default
};
//# sourceMappingURL=index.js.map
