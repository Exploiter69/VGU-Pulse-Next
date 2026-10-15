import { generateRecordId, sha256Hex } from './crypto';

export interface RateLimitCheck {
  allowed: boolean;
  currentHits: number;
  limit: number;
  windowMs: number;
}

export const DEFAULT_DEV_RATE_LIMIT_SALT = 'local-dev-non-secret-salt-change-in-prod';
export const SLIDING_WINDOW_MS = 3_600_000; // Trailing 60 minutes (3,600,000 ms)

export function resolveRateLimitSalt(
  appEnv: string,
  configuredSalt?: string
): { ok: true; salt: string } | { ok: false; code: string; message: string } {
  const isProd = appEnv === 'production';
  const trimmed = configuredSalt?.trim() ?? '';

  if (isProd) {
    if (
      trimmed.length < 16 ||
      trimmed === DEFAULT_DEV_RATE_LIMIT_SALT ||
      trimmed === 'default-vgu-pulse-salt'
    ) {
      return {
        ok: false,
        code: 'RATE_LIMIT_MISCONFIGURED',
        message: 'Server rate-limit salt is not configured for production.',
      };
    }
    return { ok: true, salt: trimmed };
  }

  return {
    ok: true,
    salt: trimmed || DEFAULT_DEV_RATE_LIMIT_SALT,
  };
}

/**
 * True trailing sliding-window rate limiter backed by D1 `rate_limit_events`.
 * 1. Purges any expired rate-limit events older than `nowMs - windowMs` (keeps storage bounded).
 * 2. Counts active hits for `(action, hashedIp)` inside `(nowMs - windowMs, nowMs]`.
 * 3. Only inserts a new event timestamp when under the limit, preventing clock-boundary burst amplification.
 */
export async function checkAndIncrementRateLimit(
  db: D1Database,
  clientIp: string,
  salt: string,
  action: 'create_card' | 'create_handshake' | 'report_card' | 'event_buddy',
  maxHitsPerWindow: number,
  nowMs: number = Date.now(),
  windowMs: number = SLIDING_WINDOW_MS
): Promise<RateLimitCheck> {
  const windowStartMs = nowMs - windowMs;
  const ipHash = await sha256Hex(`${clientIp}:${salt}:${action}`);
  const rateKey = `${action}:${ipHash}`;

  // 1. Clean up expired sliding-window entries across the table to bound D1 storage
  await db
    .prepare(`DELETE FROM rate_limit_events WHERE timestamp_ms <= ?1`)
    .bind(windowStartMs)
    .run();

  // 2. Atomically admit-and-record in one INSERT ... SELECT statement.
  // D1 serializes writes; combining the count predicate and insert prevents two
  // concurrent requests from both observing a slot and exceeding the configured limit.
  const eventId = generateRecordId('rl');
  const insertResult = await db
    .prepare(
      `INSERT INTO rate_limit_events (id, rate_key, timestamp_ms)
       SELECT ?1, ?2, ?3
       WHERE (
         SELECT COUNT(*) FROM rate_limit_events
         WHERE rate_key = ?2 AND timestamp_ms > ?4
       ) < ?5`
    )
    .bind(eventId, rateKey, nowMs, windowStartMs, maxHitsPerWindow)
    .run();

  const currentRow = await db
    .prepare(
      `SELECT COUNT(*) AS active_hits
       FROM rate_limit_events
       WHERE rate_key = ?1 AND timestamp_ms > ?2`
    )
    .bind(rateKey, windowStartMs)
    .first<{ active_hits: number }>();
  const currentHits = Number(currentRow?.active_hits ?? 0);
  const allowed = (insertResult.meta?.changes ?? 0) === 1;

  return {
    allowed,
    currentHits,
    limit: maxHitsPerWindow,
    windowMs,
  };
}
