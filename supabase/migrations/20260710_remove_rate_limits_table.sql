-- Migration: Remove rate_limits table (now handled by Redis Upstash)
-- The DB-backed rate limiter was migrated to Redis Upstash for better performance.
-- This table is no longer needed — Redis handles TTL-based rate limiting automatically.

BEGIN;

-- Drop indexes first, then the table
DROP INDEX IF EXISTS idx_rate_limits_expires;
DROP TABLE IF EXISTS public.rate_limits;

COMMIT;
