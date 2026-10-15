import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateCreateCardPayload,
  validateCreateHandshakePayload,
  validateEventBuddyPayload,
} from '../validation';
import {
  buildCardOgMetadata,
  buildEventOgMetadata,
  escapeHtmlAttribute,
} from '../../worker/ogRewriter';
import {
  decryptCoordinationNote,
  DEV_DEFAULT_ENCRYPTION_SECRET,
  encryptCoordinationNote,
} from '../../worker/crypto';
import { checkAndIncrementRateLimit } from '../../worker/rateLimit';
import worker, { Env } from '../../worker/index';

interface InternalStore {
  cards: Map<string, Record<string, unknown>>;
  events: Map<string, Record<string, unknown>>;
  handshakes: Map<string, Record<string, unknown>>;
  cardReports: Set<string>;
  eventParticipations: Set<string>;
  rateLimitEvents: Array<{ id: string; rate_key: string; timestamp_ms: number }>;
}

/**
 * Stateful in-memory D1 mock supporting `db.batch()`, conditional WHERE clauses
 * on `status` and `spots_remaining`, `card_reports` uniqueness, `event_participations`
 * uniqueness, and `rate_limit_events` sliding-window queries.
 */
function createStatefulD1Mock(): { db: D1Database; store: InternalStore } {
  const store: InternalStore = {
    cards: new Map(),
    events: new Map(),
    handshakes: new Map(),
    cardReports: new Set(),
    eventParticipations: new Set(),
    rateLimitEvents: [],
  };

  store.events.set('evt-academic-abc-verification', {
    id: 'evt-academic-abc-verification',
    title: 'UGC Academic Bank of Credits (ABC ID) Verification',
    organizer: 'Academic Administration Reference',
    category: 'Seminar',
    date_label: 'Ongoing Semester Requirement',
    time_label: 'Portal Open 24x7',
    venue: 'Online via abc.gov.in',
    registration_url: 'https://www.abc.gov.in',
    verification_source: 'External Govt / Public Portal',
    going_count: 2,
    looking_for_buddy_count: 1,
    status: 'published',
    created_at: '2026-10-15T00:00:00.000Z',
  });

  const buildJoinedHandshake = (hs: Record<string, unknown>) => {
    const card = store.cards.get(String(hs.card_id));
    if (!card) return null;
    return {
      ...hs,
      card_title: card.title,
      card_coordination_note: card.coordination_note,
      card_channel: card.preferred_handshake_channel,
      card_owner_hash: card.owner_token_hash,
      card_status: card.status,
      card_spots_total: card.spots_total,
      card_spots_remaining: card.spots_remaining,
      card_expires_at: card.expires_at,
      card_report_count: card.report_count,
    };
  };

  const prepare = (sql: string) => {
    let boundArgs: unknown[] = [];
    const stmt = {
      sql,
      bind(...args: unknown[]) {
        boundArgs = args;
        return stmt;
      },
      async first<T>(): Promise<T | null> {
        if (sql.includes('SELECT 1 AS alive')) {
          return { alive: 1 } as unknown as T;
        }
        if (sql.includes('FROM rate_limit_events')) {
          const rateKey = String(boundArgs[0]);
          const windowStartMs = Number(boundArgs[1]);
          const activeHits = store.rateLimitEvents.filter(
            (e) => e.rate_key === rateKey && e.timestamp_ms > windowStartMs
          ).length;
          return { active_hits: activeHits } as unknown as T;
        }
        if (sql.includes('FROM card_reports')) {
          const key = `${boundArgs[0]}:${boundArgs[1]}`;
          return store.cardReports.has(key)
            ? ({ exists_flag: 1 } as unknown as T)
            : null;
        }
        if (sql.includes('FROM event_participations')) {
          const key = `${boundArgs[0]}:${boundArgs[1]}`;
          return store.eventParticipations.has(key)
            ? ({ joined: 1 } as unknown as T)
            : null;
        }
        if (sql.includes('FROM pulse_cards') && sql.includes('WHERE id = ?1')) {
          const row = store.cards.get(String(boundArgs[0]));
          if (!row) return null;
          if (
            sql.includes("status != 'removed'") &&
            (row.status === 'removed' || Number(row.report_count) >= 5)
          ) {
            return null;
          }
          return { ...row } as unknown as T;
        }
        if (sql.includes('FROM campus_events') && sql.includes('WHERE id = ?1')) {
          const row = store.events.get(String(boundArgs[0]));
          return row ? ({ ...row } as unknown as T) : null;
        }
        if (
          sql.includes('FROM handshake_requests') &&
          sql.includes('from_student_name = ?2')
        ) {
          for (const hs of store.handshakes.values()) {
            if (
              hs.card_id === boundArgs[0] &&
              hs.from_student_name === boundArgs[1] &&
              hs.intro_note === boundArgs[2] &&
              hs.status === 'pending'
            ) {
              return { id: hs.id } as unknown as T;
            }
          }
          return null;
        }
        if (
          sql.includes('FROM handshake_requests h') &&
          sql.includes('WHERE h.id = ?1')
        ) {
          const hs = store.handshakes.get(String(boundArgs[0]));
          if (!hs) return null;
          return buildJoinedHandshake(hs) as unknown as T;
        }
        return null;
      },
      async all<T>(): Promise<{ results: T[] }> {
        if (sql.includes('FROM pulse_cards')) {
          const nowIso = String(boundArgs[0] || new Date().toISOString());
          const list = Array.from(store.cards.values()).filter(
            (c) =>
              (c.status === 'open' || c.status === 'filled') &&
              String(c.expires_at) > nowIso &&
              Number(c.report_count) < 5
          );
          return { results: list as unknown as T[] };
        }
        if (sql.includes('FROM campus_events')) {
          return {
            results: Array.from(store.events.values()) as unknown as T[],
          };
        }
        if (sql.includes('FROM handshake_requests h')) {
          const hashSet = new Set(boundArgs.map(String));
          const isOwnerQuery = sql.includes('c.owner_token_hash IN');
          const matched: unknown[] = [];

          for (const hs of store.handshakes.values()) {
            const joined = buildJoinedHandshake(hs);
            if (!joined) continue;
            const targetHash = isOwnerQuery
              ? String(joined.card_owner_hash)
              : String(joined.sender_token_hash);
            if (hashSet.has(targetHash)) {
              matched.push(joined);
            }
          }
          return { results: matched as T[] };
        }
        return { results: [] };
      },
      async run() {
        if (sql.includes('DELETE FROM rate_limit_events')) {
          const cutoff = Number(boundArgs[0]);
          const before = store.rateLimitEvents.length;
          store.rateLimitEvents = store.rateLimitEvents.filter(
            (e) => e.timestamp_ms > cutoff
          );
          return { meta: { changes: before - store.rateLimitEvents.length } };
        }
        if (sql.includes('INSERT INTO rate_limit_events')) {
          store.rateLimitEvents.push({
            id: String(boundArgs[0]),
            rate_key: String(boundArgs[1]),
            timestamp_ms: Number(boundArgs[2]),
          });
          return { meta: { changes: 1 } };
        }
        if (sql.includes('INSERT OR IGNORE INTO card_reports')) {
          const key = `${boundArgs[0]}:${boundArgs[1]}`;
          if (store.cardReports.has(key)) {
            return { meta: { changes: 0 } };
          }
          store.cardReports.add(key);
          return { meta: { changes: 1 } };
        }
        if (sql.includes('UPDATE pulse_cards') && sql.includes('report_count = report_count + 1')) {
          const card = store.cards.get(String(boundArgs[0]));
          if (!card) return { meta: { changes: 0 } };
          const nextCount = Number(card.report_count) + 1;
          card.report_count = nextCount;
          if (nextCount >= 5) card.status = 'removed';
          return { meta: { changes: 1 } };
        }
        if (sql.includes('INSERT OR IGNORE INTO event_participations')) {
          const key = `${boundArgs[0]}:${boundArgs[1]}`;
          if (store.eventParticipations.has(key)) {
            return { meta: { changes: 0 } };
          }
          store.eventParticipations.add(key);
          return { meta: { changes: 1 } };
        }
        if (sql.includes('DELETE FROM event_participations')) {
          const key = `${boundArgs[0]}:${boundArgs[1]}`;
          const existed = store.eventParticipations.delete(key);
          return { meta: { changes: existed ? 1 : 0 } };
        }
        if (sql.includes('UPDATE campus_events') && sql.includes('going_count = going_count + 1')) {
          const ev = store.events.get(String(boundArgs[0]));
          if (!ev) return { meta: { changes: 0 } };
          ev.going_count = Number(ev.going_count) + 1;
          ev.looking_for_buddy_count = Number(ev.looking_for_buddy_count) + 1;
          return { meta: { changes: 1 } };
        }
        if (sql.includes('UPDATE campus_events') && sql.includes('MAX(0, going_count - 1)')) {
          const ev = store.events.get(String(boundArgs[0]));
          if (!ev) return { meta: { changes: 0 } };
          ev.going_count = Math.max(0, Number(ev.going_count) - 1);
          ev.looking_for_buddy_count = Math.max(0, Number(ev.looking_for_buddy_count) - 1);
          return { meta: { changes: 1 } };
        }
        if (sql.includes('INSERT INTO pulse_cards')) {
          const id = String(boundArgs[0]);
          store.cards.set(id, {
            id,
            title: boundArgs[1],
            category: boundArgs[2],
            description: boundArgs[3],
            author_name: boundArgs[4],
            author_department: boundArgs[5],
            author_year: boundArgs[6],
            tags_json: boundArgs[7],
            spots_total: Number(boundArgs[8]),
            spots_remaining: Number(boundArgs[9]),
            time_window: boundArgs[10],
            preferred_handshake_channel: boundArgs[11],
            coordination_note: boundArgs[12],
            owner_token_hash: boundArgs[13],
            status: 'open',
            report_count: 0,
            created_at: boundArgs[14],
            expires_at: boundArgs[15],
          });
          return { meta: { changes: 1 } };
        }
        if (sql.includes('INSERT INTO handshake_requests')) {
          const id = String(boundArgs[0]);
          store.handshakes.set(id, {
            id,
            card_id: boundArgs[1],
            from_student_name: boundArgs[2],
            from_department: boundArgs[3],
            from_year: boundArgs[4],
            intro_note: boundArgs[5],
            sender_token_hash: boundArgs[6],
            status: 'pending',
            created_at: boundArgs[7],
            updated_at: boundArgs[7],
          });
          return { meta: { changes: 1 } };
        }
        // Conditional card spot decrement (`spots_remaining > 0 AND status = 'open'`)
        if (
          sql.includes('UPDATE pulse_cards') &&
          sql.includes('spots_remaining = spots_remaining - 1')
        ) {
          const card = store.cards.get(String(boundArgs[0]));
          if (
            !card ||
            card.status !== 'open' ||
            Number(card.spots_remaining) <= 0
          ) {
            return { meta: { changes: 0 } };
          }
          const nextSpots = Number(card.spots_remaining) - 1;
          card.spots_remaining = nextSpots;
          card.status = nextSpots <= 0 ? 'filled' : 'open';
          return { meta: { changes: 1 } };
        }
        // Conditional card spot restoration (`spots_remaining < spots_total`)
        if (
          sql.includes('UPDATE pulse_cards') &&
          sql.includes('MIN(spots_total, spots_remaining + 1)')
        ) {
          const card = store.cards.get(String(boundArgs[0]));
          if (
            !card ||
            Number(card.spots_remaining) >= Number(card.spots_total)
          ) {
            return { meta: { changes: 0 } };
          }
          card.spots_remaining = Math.min(
            Number(card.spots_total),
            Number(card.spots_remaining) + 1
          );
          if (card.status === 'filled') {
            card.status = 'open';
          }
          return { meta: { changes: 1 } };
        }
        // Conditional handshake state update
        if (sql.includes('UPDATE handshake_requests')) {
          const hs = store.handshakes.get(String(boundArgs[0]));
          if (!hs) return { meta: { changes: 0 } };

          if (sql.includes("WHERE id = ?1 AND status = 'accepted'")) {
            if (hs.status !== 'accepted') return { meta: { changes: 0 } };
            hs.status = 'declined';
            hs.updated_at = boundArgs[1];
            return { meta: { changes: 1 } };
          }
          if (sql.includes("WHERE id = ?1 AND status = 'pending'")) {
            if (hs.status !== 'pending') return { meta: { changes: 0 } };
            hs.status = 'declined';
            hs.updated_at = boundArgs[1];
            return { meta: { changes: 1 } };
          }
          if (sql.includes('WHERE id = ?1 AND status = ?2')) {
            if (hs.status !== boundArgs[1]) return { meta: { changes: 0 } };
            hs.status = 'accepted';
            hs.updated_at = boundArgs[2];
            return { meta: { changes: 1 } };
          }
          hs.status = boundArgs[1];
          hs.updated_at = boundArgs[2];
          return { meta: { changes: 1 } };
        }
        return { meta: { changes: 1 } };
      },
    };
    return stmt;
  };

  const batch = async (statements: Array<{ run: () => Promise<unknown> }>) => {
    const out = [];
    for (const s of statements) {
      out.push(await s.run());
    }
    return out;
  };

  return {
    db: { prepare, batch } as unknown as D1Database,
    store,
  };
}

describe('P0: AES-256-GCM Coordination-Note Encryption at Rest', () => {
  it('encrypts coordination notes with unique IVs and never stores plaintext in D1', async () => {
    const note = 'Meet at Central Library 2nd floor table 4 at 3:15 PM';
    const c1 = await encryptCoordinationNote(note, DEV_DEFAULT_ENCRYPTION_SECRET);
    const c2 = await encryptCoordinationNote(note, DEV_DEFAULT_ENCRYPTION_SECRET);

    expect(c1.startsWith('enc:v1:')).toBe(true);
    expect(c2.startsWith('enc:v1:')).toBe(true);
    // Unique random 96-bit IVs ensure ciphertexts differ even for identical plaintexts
    expect(c1).not.toBe(c2);
    expect(c1).not.toContain('Central Library');

    const d1 = await decryptCoordinationNote(c1, DEV_DEFAULT_ENCRYPTION_SECRET);
    expect(d1.ok).toBe(true);
    if (d1.ok) {
      expect(d1.plaintext).toBe(note);
    }

    // Wrong key fails authentication tag verification
    const wrongKeyResult = await decryptCoordinationNote(
      c1,
      'wrong-secret-key-that-does-not-match-32b!'
    );
    expect(wrongKeyResult.ok).toBe(false);
  });
});

describe('P0: Handshake Capacity & Lifecycle Integrity', () => {
  let env: Env;
  let store: InternalStore;

  beforeEach(() => {
    const mock = createStatefulD1Mock();
    store = mock.store;
    env = {
      DB: mock.db,
      APP_ENV: 'development',
      PUBLIC_ORIGIN: 'http://localhost:5173',
      RATE_LIMIT_SALT: 'test-salt-value-123456',
      COORDINATION_ENCRYPTION_KEY: DEV_DEFAULT_ENCRYPTION_SECRET,
    };
  });

  it('maintains exact capacity across pending->accepted, repeated accept, accepted->declined, declined->accepted, and blocks overbooking the last spot', async () => {
    const secretNote = 'Telegram @alok_vgu or Library Room 2';

    // Create card with exactly 1 spot total
    const createRes = await worker.fetch(
      new Request('http://localhost/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Need 1 Systems Builder for Hackathon Finale',
          category: 'hackathon',
          description: 'Building an edge worker and SQLite state engine.',
          authorName: 'Alok',
          authorDepartment: 'B.Tech CSE',
          authorYear: '3rd Year',
          tags: ['TypeScript', 'SQLite'],
          spotsTotal: 1,
          timeWindow: 'Saturday 10 AM',
          preferredHandshakeChannel: 'Telegram',
          coordinationNote: secretNote,
          turnstileToken: 'LOCAL_DEV_TURNSTILE_BYPASS',
        }),
      }),
      env
    );
    expect(createRes.status).toBe(201);
    const { card, ownerCapabilityToken } = (await createRes.json()) as {
      card: { id: string; spotsRemaining: number };
      ownerCapabilityToken: string;
    };
    expect(card.spotsRemaining).toBe(1);

    // Verify stored row in D1 is encrypted, NOT plaintext
    const rawCardRow = store.cards.get(card.id)!;
    expect(String(rawCardRow.coordination_note)).toMatch(/^enc:v1:/);
    expect(String(rawCardRow.coordination_note)).not.toContain(secretNote);

    // Create two competing handshake requests (Applicant A and Applicant B) for the 1 spot
    const hsARes = await worker.fetch(
      new Request('http://localhost/api/handshakes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: card.id,
          fromStudentName: 'Vikram',
          fromDepartment: 'B.Tech CSE',
          fromYear: '3rd Year',
          introNote: 'Applicant A: Ready to build the D1 migration layer.',
          turnstileToken: 'LOCAL_DEV_TURNSTILE_BYPASS',
        }),
      }),
      env
    );
    const hsBRes = await worker.fetch(
      new Request('http://localhost/api/handshakes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: card.id,
          fromStudentName: 'Gaurav',
          fromDepartment: 'B.Tech CSE',
          fromYear: '3rd Year',
          introNote: 'Applicant B: Ready to help with frontend testing.',
          turnstileToken: 'LOCAL_DEV_TURNSTILE_BYPASS',
        }),
      }),
      env
    );
    expect(hsARes.status).toBe(201);
    expect(hsBRes.status).toBe(201);

    const hsA = ((await hsARes.json()) as { handshake: { id: string } }).handshake;
    const hsB = ((await hsBRes.json()) as { handshake: { id: string } }).handshake;

    // 1. Accept Applicant A (pending -> accepted): spots_remaining becomes 0, status becomes 'filled'
    const acceptA1 = await worker.fetch(
      new Request(`http://localhost/api/handshakes/${hsA.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerCapabilityToken}`,
        },
        body: JSON.stringify({ status: 'accepted' }),
      }),
      env
    );
    expect(acceptA1.status).toBe(200);
    expect(store.cards.get(card.id)?.spots_remaining).toBe(0);
    expect(store.cards.get(card.id)?.status).toBe('filled');

    // 2. Repeated identical accept on Applicant A (accepted -> accepted) must be idempotent and never make spots negative
    const acceptA2 = await worker.fetch(
      new Request(`http://localhost/api/handshakes/${hsA.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerCapabilityToken}`,
        },
        body: JSON.stringify({ status: 'accepted' }),
      }),
      env
    );
    expect(acceptA2.status).toBe(200);
    expect(store.cards.get(card.id)?.spots_remaining).toBe(0);

    // 3. Competing acceptance of Applicant B while card is filled must fail with 409 CARD_FULL
    const acceptBWhileFull = await worker.fetch(
      new Request(`http://localhost/api/handshakes/${hsB.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerCapabilityToken}`,
        },
        body: JSON.stringify({ status: 'accepted' }),
      }),
      env
    );
    expect(acceptBWhileFull.status).toBe(409);
    expect(store.handshakes.get(hsB.id)?.status).toBe('pending');
    expect(store.cards.get(card.id)?.spots_remaining).toBe(0);

    // 4. Cancel Applicant A (accepted -> declined): restores 1 spot and re-opens card
    const cancelA = await worker.fetch(
      new Request(`http://localhost/api/handshakes/${hsA.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerCapabilityToken}`,
        },
        body: JSON.stringify({ status: 'declined' }),
      }),
      env
    );
    expect(cancelA.status).toBe(200);
    expect(store.cards.get(card.id)?.spots_remaining).toBe(1);
    expect(store.cards.get(card.id)?.status).toBe('open');

    // 5. Repeated decline on Applicant A (declined -> declined) must not exceed spots_total (stays 1)
    const cancelA2 = await worker.fetch(
      new Request(`http://localhost/api/handshakes/${hsA.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerCapabilityToken}`,
        },
        body: JSON.stringify({ status: 'declined' }),
      }),
      env
    );
    expect(cancelA2.status).toBe(200);
    expect(store.cards.get(card.id)?.spots_remaining).toBe(1);

    // 6. Now Applicant B (or declined Applicant A) can be accepted into the restored spot
    const acceptBNowOpen = await worker.fetch(
      new Request(`http://localhost/api/handshakes/${hsB.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerCapabilityToken}`,
        },
        body: JSON.stringify({ status: 'accepted' }),
      }),
      env
    );
    expect(acceptBNowOpen.status).toBe(200);
    const acceptBBody = (await acceptBNowOpen.json()) as {
      handshake: { revealedContactNote: string };
    };
    expect(acceptBBody.handshake.revealedContactNote).toContain(secretNote);
    expect(store.cards.get(card.id)?.spots_remaining).toBe(0);
    expect(store.cards.get(card.id)?.status).toBe('filled');
  });
});

describe('P1: Event Participation Idempotency & Truthful Source Classification', () => {
  let env: Env;

  beforeEach(() => {
    const mock = createStatefulD1Mock();
    env = {
      DB: mock.db,
      APP_ENV: 'development',
      PUBLIC_ORIGIN: 'http://localhost:5173',
      RATE_LIMIT_SALT: 'test-salt-value-123456',
      COORDINATION_ENCRYPTION_KEY: DEV_DEFAULT_ENCRYPTION_SECRET,
    };
  });

  it('classifies external government portals as External Govt / Public Portal and enforces idempotent join/leave per participant token', async () => {
    const eventsRes = await worker.fetch(
      new Request('http://localhost/api/events'),
      env
    );
    const eventsData = (await eventsRes.json()) as {
      events: Array<{
        id: string;
        verificationSource: string;
        goingCount: number;
      }>;
    };
    expect(eventsData.events[0].verificationSource).toBe(
      'External Govt / Public Portal'
    );
    const initialCount = eventsData.events[0].goingCount;

    const participantToken = 'participant_token_abc1234567890123456';

    // First join increments count by 1
    const join1 = await worker.fetch(
      new Request(
        'http://localhost/api/events/evt-academic-abc-verification/buddy',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ direction: 'join', participantToken }),
        }
      ),
      env
    );
    const join1Body = (await join1.json()) as {
      event: { goingCount: number };
      changed: boolean;
    };
    expect(join1Body.changed).toBe(true);
    expect(join1Body.event.goingCount).toBe(initialCount + 1);

    // Second join from same participant token is idempotent (does NOT increment again)
    const join2 = await worker.fetch(
      new Request(
        'http://localhost/api/events/evt-academic-abc-verification/buddy',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ direction: 'join', participantToken }),
        }
      ),
      env
    );
    const join2Body = (await join2.json()) as {
      event: { goingCount: number };
      changed: boolean;
    };
    expect(join2Body.changed).toBe(false);
    expect(join2Body.event.goingCount).toBe(initialCount + 1);

    // Leave decrements count back to initialCount, and second leave is a no-op
    const leave1 = await worker.fetch(
      new Request(
        'http://localhost/api/events/evt-academic-abc-verification/buddy',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ direction: 'leave', participantToken }),
        }
      ),
      env
    );
    const leave1Body = (await leave1.json()) as {
      event: { goingCount: number };
      changed: boolean;
    };
    expect(leave1Body.changed).toBe(true);
    expect(leave1Body.event.goingCount).toBe(initialCount);

    const leave2 = await worker.fetch(
      new Request(
        'http://localhost/api/events/evt-academic-abc-verification/buddy',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ direction: 'leave', participantToken }),
        }
      ),
      env
    );
    const leave2Body = (await leave2.json()) as {
      event: { goingCount: number };
      changed: boolean;
    };
    expect(leave2Body.changed).toBe(false);
    expect(leave2Body.event.goingCount).toBe(initialCount);
  });
});

describe('P1: Card Report Deduplication & Threshold Auto-Removal', () => {
  let env: Env;
  let store: InternalStore;

  beforeEach(() => {
    const mock = createStatefulD1Mock();
    store = mock.store;
    env = {
      DB: mock.db,
      APP_ENV: 'development',
      PUBLIC_ORIGIN: 'http://localhost:5173',
      RATE_LIMIT_SALT: 'test-salt-value-123456',
      COORDINATION_ENCRYPTION_KEY: DEV_DEFAULT_ENCRYPTION_SECRET,
    };
  });

  it('prevents a single reporter IP from inflating report_count while removing card after 5 distinct reporters', async () => {
    const createRes = await worker.fetch(
      new Request('http://localhost/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Study partner for Computer Networks mid-sem',
          category: 'study',
          description: 'Reviewing TCP congestion control and subnetting.',
          authorName: 'Nitish',
          authorDepartment: 'B.Tech CSE',
          authorYear: '3rd Year',
          tags: ['CN'],
          spotsTotal: 2,
          timeWindow: 'Tomorrow 2 PM',
          preferredHandshakeChannel: 'In-Person Campus Meet',
          coordinationNote: 'Library reading hall',
          turnstileToken: 'LOCAL_DEV_TURNSTILE_BYPASS',
        }),
      }),
      env
    );
    const { card } = (await createRes.json()) as { card: { id: string } };

    // Reporter 1 sends 3 duplicate report requests from 10.0.0.1
    for (let i = 0; i < 3; i++) {
      const repRes = await worker.fetch(
        new Request(`http://localhost/api/cards/${card.id}/report`, {
          method: 'POST',
          headers: { 'CF-Connecting-IP': '10.0.0.1' },
        }),
        env
      );
      expect(repRes.status).toBe(200);
      const body = (await repRes.json()) as { alreadyReported: boolean };
      expect(body.alreadyReported).toBe(i > 0);
    }

    // Count must still be 1 (not 3!)
    expect(store.cards.get(card.id)?.report_count).toBe(1);
    expect(store.cards.get(card.id)?.status).toBe('open');

    // 4 additional distinct reporters (10.0.0.2 .. 10.0.0.5) report the card
    for (let ip = 2; ip <= 5; ip++) {
      await worker.fetch(
        new Request(`http://localhost/api/cards/${card.id}/report`, {
          method: 'POST',
          headers: { 'CF-Connecting-IP': `10.0.0.${ip}` },
        }),
        env
      );
    }

    expect(store.cards.get(card.id)?.report_count).toBe(5);
    expect(store.cards.get(card.id)?.status).toBe('removed');

    // Removed card returns 404 on public GET
    const getRemoved = await worker.fetch(
      new Request(`http://localhost/api/cards/${card.id}`),
      env
    );
    expect(getRemoved.status).toBe(404);
  });
});

describe('P1: True Sliding-Window Rate Limiting & Production Secret Fail-Closed Checks', () => {
  it('enforces a rolling 60-minute sliding window across clock boundaries and cleans up expired events', async () => {
    const { db } = createStatefulD1Mock();
    const baseTime = 1_700_000_000_000;

    // 5 hits spread across the end of an hour (e.g. t + 50 min)
    for (let i = 0; i < 5; i++) {
      const check = await checkAndIncrementRateLimit(
        db,
        '203.0.113.9',
        'salt-1234567890123456',
        'create_card',
        5,
        baseTime + i * 1000
      );
      expect(check.allowed).toBe(true);
    }

    // 6th hit 30 minutes later (across a fixed clock hour boundary, but still within trailing 60 mins) MUST be blocked
    const blockedAcrossHourBoundary = await checkAndIncrementRateLimit(
      db,
      '203.0.113.9',
      'salt-1234567890123456',
      'create_card',
      5,
      baseTime + 30 * 60_000
    );
    expect(blockedAcrossHourBoundary.allowed).toBe(false);

    // Hit 61 minutes after the first batch is allowed again as old events expire and get pruned
    const allowedAfterSlidingWindow = await checkAndIncrementRateLimit(
      db,
      '203.0.113.9',
      'salt-1234567890123456',
      'create_card',
      5,
      baseTime + 61 * 60_000
    );
    expect(allowedAfterSlidingWindow.allowed).toBe(true);
  });

  it('fails closed in production when COORDINATION_ENCRYPTION_KEY, RATE_LIMIT_SALT, or TURNSTILE_SECRET_KEY is missing', async () => {
    const { db } = createStatefulD1Mock();
    const validCardPayload = {
      title: 'Need 1 Designer for Product Pitch',
      category: 'project',
      description: 'Preparing slides and Figma prototype for demo day.',
      authorName: 'Sandhya',
      authorDepartment: 'B.Des',
      authorYear: '2nd Year',
      tags: ['Figma'],
      spotsTotal: 1,
      timeWindow: 'Tomorrow',
      preferredHandshakeChannel: 'WhatsApp',
      coordinationNote: 'Design studio room 102',
      turnstileToken: 'some-token',
    };

    // Missing COORDINATION_ENCRYPTION_KEY in production -> 503
    const resNoEnc = await worker.fetch(
      new Request('http://localhost/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validCardPayload),
      }),
      {
        DB: db,
        APP_ENV: 'production',
        RATE_LIMIT_SALT: 'prod-salt-1234567890123456',
        TURNSTILE_SECRET_KEY: 'prod-turnstile-secret',
      }
    );
    expect(resNoEnc.status).toBe(503);
  });
});

describe('P1: Public Input & PII Validation Hardening', () => {
  it('blocks spaced and hyphenated Indian mobile numbers in public fields and intro notes', () => {
    const spacedPhone = validateCreateCardPayload({
      title: 'Need 1 Backend Dev for Hackathon',
      category: 'hackathon',
      description: 'Ping me on +91 98765 43210 right away.',
      authorName: 'Aman',
      authorDepartment: 'B.Tech CSE',
      authorYear: '3rd Year',
      tags: ['Node'],
      spotsTotal: 2,
      timeWindow: 'This Weekend',
      preferredHandshakeChannel: 'WhatsApp',
      coordinationNote: 'Meet at Central Library',
    });
    expect(spacedPhone.valid).toBe(false);

    const handshakeWithPhone = validateCreateHandshakePayload({
      cardId: 'card-123',
      fromStudentName: 'Riya',
      fromDepartment: 'BCA',
      fromYear: '2nd Year',
      introNote: 'Call me at 98765-43210 to coordinate.',
    });
    expect(handshakeWithPhone.valid).toBe(false);

    const invalidBuddyToken = validateEventBuddyPayload({
      direction: 'join',
      participantToken: 'short',
    });
    expect(invalidBuddyToken.valid).toBe(false);
  });

  it('escapes HTML entities in OpenGraph metadata and never includes private fields', () => {
    const meta = buildCardOgMetadata(
      {
        id: 'card-99',
        title: 'Hackathon <script>alert(1)</script> Team',
        category: 'hackathon',
        description: 'Building a safe campus app.',
        authorName: 'Alok',
        authorDepartment: 'CSE',
        authorYear: '3rd Year',
        tags: ['React'],
        spotsTotal: 3,
        spotsRemaining: 2,
        timeWindow: 'Saturday',
        createdAt: '2026-10-15',
        isDemoFixture: false,
        preferredHandshakeChannel: 'WhatsApp',
      },
      'https://vgu-pulse.pages.dev',
      'card-99'
    );
    expect(meta.httpStatus).toBe(200);
    expect(escapeHtmlAttribute(meta.title)).not.toContain('<script>');
    expect(buildEventOgMetadata(null, 'https://vgu-pulse.pages.dev', 'x').httpStatus).toBe(404);
  });
});
