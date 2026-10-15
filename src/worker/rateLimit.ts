import { sha256Hex } from './crypto';

export interface RateLimitCheck {
  allowed: boolean;
  currentHits: number;
  limit: number;
}

export async function checkAndIncrementRateLimit(
  db: D1Database,
  clientIp: string,
  salt: string,
  action: 'create_card' | 'create_handshake' | 'report_card',
  maxHitsPerHour: number
): Promise<RateLimitCheck> {
  const bucketHour = Math.floor(Date.now() / 3_600_000);
  const ipHash = await sha256Hex(`${clientIp}:${salt}:${action}`);
  const key = `${action}:${ipHash}`;

  await db
    .prepare(
      `INSERT INTO rate_limits (key, bucket_hour, hit_count)
       VALUES (?1, ?2, 1)
       ON CONFLICT(key, bucket_hour)
       DO UPDATE SET hit_count = hit_count + 1`
    )
    .bind(key, bucketHour)
    .run();

  const row = await db
    .prepare(
      `SELECT hit_count FROM rate_limits WHERE key = ?1 AND bucket_hour = ?2`
    )
    .bind(key, bucketHour)
    .first<{ hit_count: number }>();

  const currentHits = row?.hit_count ?? 1;
  return {
    allowed: currentHits <= maxHitsPerHour,
    currentHits,
    limit: maxHitsPerHour,
  };
}
