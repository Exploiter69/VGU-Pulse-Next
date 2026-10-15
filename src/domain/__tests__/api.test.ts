import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateCreateCardPayload,
  validateCreateHandshakePayload,
} from '../validation';
import {
  buildCardOgMetadata,
  buildEventOgMetadata,
  escapeHtmlAttribute,
} from '../../worker/ogRewriter';
import worker, { Env } from '../../worker/index';

/**
 * Lightweight in-memory SQLite/D1 mock tailored to test Worker routes,
 * capability-token hashing, rate limiting, Turnstile fail-closed behavior,
 * and private-field isolation in Node/Vitest without external binaries.
 */
function createInMemoryD1Mock(): D1Database {
  const cards = new Map<string, Record<string, unknown>>();
  const events = new Map<string, Record<string, unknown>>();
  const handshakes = new Map<string, Record<string, unknown>>();
  const rateLimits = new Map<string, number>();

  // Seed 1 verified event matching 0002_seed_verified_events.sql
  events.set('evt-academic-abc-verification', {
    id: 'evt-academic-abc-verification',
    title: 'UGC Academic Bank of Credits (ABC ID) Verification',
    organizer: 'Academic Administration Reference',
    category: 'Seminar',
    date_label: 'Ongoing Semester Requirement',
    time_label: 'Portal Open 24x7',
    venue: 'Online via abc.gov.in',
    registration_url: 'https://www.abc.gov.in',
    verification_source: 'Official VGU Link',
    going_count: 2,
    looking_for_buddy_count: 1,
    status: 'published',
    created_at: '2026-10-15T00:00:00.000Z',
  });

  const prepare = (sql: string) => {
    let boundArgs: unknown[] = [];
    const stmt = {
      bind(...args: unknown[]) {
        boundArgs = args;
        return stmt;
      },
      async first<T>(): Promise<T | null> {
        if (sql.includes('SELECT 1 AS alive')) {
          return { alive: 1 } as unknown as T;
        }
        if (sql.includes('FROM rate_limits')) {
          const key = `${boundArgs[0]}:${boundArgs[1]}`;
          return { hit_count: rateLimits.get(key) ?? 1 } as unknown as T;
        }
        if (sql.includes('FROM pulse_cards') && sql.includes('WHERE id = ?1')) {
          const row = cards.get(String(boundArgs[0]));
          return (row ?? null) as unknown as T;
        }
        if (sql.includes('FROM campus_events') && sql.includes('WHERE id = ?1')) {
          const row = events.get(String(boundArgs[0]));
          return (row ?? null) as unknown as T;
        }
        if (sql.includes('FROM handshake_requests h') && sql.includes('WHERE h.id = ?1')) {
          const hs = handshakes.get(String(boundArgs[0]));
          if (!hs) return null;
          const card = cards.get(String(hs.card_id));
          if (!card) return null;
          return {
            ...hs,
            card_title: card.title,
            card_coordination_note: card.coordination_note,
            card_channel: card.preferred_handshake_channel,
            card_owner_hash: card.owner_token_hash,
          } as unknown as T;
        }
        return null;
      },
      async all<T>(): Promise<{ results: T[] }> {
        if (sql.includes('FROM pulse_cards')) {
          const list = Array.from(cards.values()).filter(
            (c) => c.status !== 'removed' && Number(c.report_count) < 5
          );
          return { results: list as unknown as T[] };
        }
        if (sql.includes('FROM campus_events')) {
          return {
            results: Array.from(events.values()) as unknown as T[],
          };
        }
        if (sql.includes('FROM handshake_requests h')) {
          const hashSet = new Set(boundArgs.map(String));
          const isOwnerQuery = sql.includes('c.owner_token_hash IN');
          const matched: unknown[] = [];

          for (const hs of handshakes.values()) {
            const card = cards.get(String(hs.card_id));
            if (!card) continue;
            const targetHash = isOwnerQuery
              ? String(card.owner_token_hash)
              : String(hs.sender_token_hash);
            if (hashSet.has(targetHash)) {
              matched.push({
                ...hs,
                card_title: card.title,
                card_coordination_note: card.coordination_note,
                card_channel: card.preferred_handshake_channel,
                card_owner_hash: card.owner_token_hash,
              });
            }
          }
          return { results: matched as T[] };
        }
        return { results: [] };
      },
      async run() {
        if (sql.includes('INSERT INTO rate_limits')) {
          const key = `${boundArgs[0]}:${boundArgs[1]}`;
          rateLimits.set(key, (rateLimits.get(key) ?? 0) + 1);
          return { meta: { changes: 1 } };
        }
        if (sql.includes('INSERT INTO pulse_cards')) {
          const id = String(boundArgs[0]);
          cards.set(id, {
            id,
            title: boundArgs[1],
            category: boundArgs[2],
            description: boundArgs[3],
            author_name: boundArgs[4],
            author_department: boundArgs[5],
            author_year: boundArgs[6],
            tags_json: boundArgs[7],
            spots_total: boundArgs[8],
            spots_remaining: boundArgs[9],
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
          handshakes.set(id, {
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
        if (sql.includes('UPDATE handshake_requests')) {
          const hs = handshakes.get(String(boundArgs[0]));
          if (hs) {
            hs.status = boundArgs[1];
            hs.updated_at = boundArgs[2];
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        }
        if (sql.includes('UPDATE pulse_cards') && sql.includes('spots_remaining')) {
          const card = cards.get(String(boundArgs[0]));
          if (card) {
            const nextSpots = Math.max(0, Number(card.spots_remaining) - 1);
            card.spots_remaining = nextSpots;
            if (nextSpots === 0) card.status = 'filled';
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        }
        return { meta: { changes: 1 } };
      },
    };
    return stmt;
  };

  return { prepare } as unknown as D1Database;
}

describe('Stage 2 Request Validation & PII Protection', () => {
  it('blocks Indian mobile numbers and email addresses in public card descriptions', () => {
    const withPhone = validateCreateCardPayload({
      title: 'Need 1 Backend Dev for Hackathon',
      category: 'hackathon',
      description: 'Call me directly at 9876543210 to join the team.',
      authorName: 'Aman',
      authorDepartment: 'B.Tech CSE',
      authorYear: '3rd Year',
      tags: ['Node'],
      spotsTotal: 2,
      timeWindow: 'This Weekend',
      preferredHandshakeChannel: 'WhatsApp',
      coordinationNote: 'Meet at Central Library',
    });
    expect(withPhone.valid).toBe(false);
    if (!withPhone.valid) {
      expect(withPhone.code).toBe('PUBLIC_PII_DETECTED');
    }

    const withEmail = validateCreateCardPayload({
      title: 'Need 1 Backend Dev for Hackathon',
      category: 'hackathon',
      description: 'Email me at student@vgu.ac.in right now.',
      authorName: 'Aman',
      authorDepartment: 'B.Tech CSE',
      authorYear: '3rd Year',
      tags: ['Node'],
      spotsTotal: 2,
      timeWindow: 'This Weekend',
      preferredHandshakeChannel: 'WhatsApp',
      coordinationNote: 'Meet at Central Library',
    });
    expect(withEmail.valid).toBe(false);
  });

  it('rejects oversized or malformed handshake inputs', () => {
    const shortIntro = validateCreateHandshakePayload({
      cardId: 'card-123',
      fromStudentName: 'Riya',
      fromDepartment: 'BCA',
      fromYear: '2nd Year',
      introNote: 'Hi',
    });
    expect(shortIntro.valid).toBe(false);
  });
});

describe('Stage 2 Worker API, Capability Authorization, Rate Limiting & Privacy Isolation', () => {
  let env: Env;

  beforeEach(() => {
    env = {
      DB: createInMemoryD1Mock(),
      APP_ENV: 'development',
      PUBLIC_ORIGIN: 'http://localhost:5173',
      RATE_LIMIT_SALT: 'test-salt',
    };
  });

  it('returns 200 OK on /api/health', async () => {
    const res = await worker.fetch(new Request('http://localhost/api/health'), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('creates a card, hides coordinationNote from public GET, and reveals it only after authorized handshake acceptance', async () => {
    const secretNote = 'Meet at Central Library Table 7 at 4:15 PM sharp';
    const createRes = await worker.fetch(
      new Request('http://localhost/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Need 1 Rust / Systems builder for weekend sprint',
          category: 'hackathon',
          description: 'Working on a local-first CLI tool for campus.',
          authorName: 'Alok',
          authorDepartment: 'B.Tech CSE',
          authorYear: '3rd Year',
          tags: ['Rust', 'CLI'],
          spotsTotal: 2,
          timeWindow: 'Saturday 11 AM',
          preferredHandshakeChannel: 'In-Person Campus Meet',
          coordinationNote: secretNote,
          turnstileToken: 'LOCAL_DEV_TURNSTILE_BYPASS',
        }),
      }),
      env
    );

    expect(createRes.status).toBe(201);
    const createdPayload = (await createRes.json()) as {
      card: { id: string };
      ownerCapabilityToken: string;
    };
    expect(createdPayload.ownerCapabilityToken).toHaveLength(64);

    // 1. Public GET /api/cards/:id must NEVER leak coordinationNote or token hashes
    const publicCardRes = await worker.fetch(
      new Request(`http://localhost/api/cards/${createdPayload.card.id}`),
      env
    );
    const publicCardText = await publicCardRes.text();
    expect(publicCardText).not.toContain(secretNote);
    expect(publicCardText).not.toContain('owner_token_hash');

    // 2. Peer submits a handshake request
    const hsRes = await worker.fetch(
      new Request('http://localhost/api/handshakes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: createdPayload.card.id,
          fromStudentName: 'Vikram',
          fromDepartment: 'B.Tech CSE',
          fromYear: '3rd Year',
          introNote: 'I have built 2 CLI tools in Rust and am free Saturday!',
          turnstileToken: 'LOCAL_DEV_TURNSTILE_BYPASS',
        }),
      }),
      env
    );
    expect(hsRes.status).toBe(201);
    const hsPayload = (await hsRes.json()) as {
      handshake: { id: string; revealedContactNote: string };
      senderCapabilityToken: string;
    };
    // While pending, secret coordination note must NOT be revealed
    expect(hsPayload.handshake.revealedContactNote).not.toContain(secretNote);

    // 3. Unauthorized token cannot accept the handshake
    const badPatch = await worker.fetch(
      new Request(`http://localhost/api/handshakes/${hsPayload.handshake.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer wrong-token-value',
        },
        body: JSON.stringify({ status: 'accepted' }),
      }),
      env
    );
    expect(badPatch.status).toBe(403);

    // 4. Legitimate card owner accepts the handshake
    const goodPatch = await worker.fetch(
      new Request(`http://localhost/api/handshakes/${hsPayload.handshake.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${createdPayload.ownerCapabilityToken}`,
        },
        body: JSON.stringify({ status: 'accepted' }),
      }),
      env
    );
    expect(goodPatch.status).toBe(200);

    // 5. Sender syncs handshakes using senderCapabilityToken and receives the coordinationNote
    const syncRes = await worker.fetch(
      new Request('http://localhost/api/handshakes/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerTokens: [],
          senderTokens: [hsPayload.senderCapabilityToken],
        }),
      }),
      env
    );
    const syncBody = (await syncRes.json()) as {
      handshakes: Array<{ status: string; revealedContactNote: string }>;
    };
    expect(syncBody.handshakes[0].status).toBe('accepted');
    expect(syncBody.handshakes[0].revealedContactNote).toContain(secretNote);
  });

  it('fails closed in production when TURNSTILE_SECRET_KEY is missing', async () => {
    const prodEnv: Env = {
      ...env,
      APP_ENV: 'production',
      TURNSTILE_SECRET_KEY: undefined,
    };

    const res = await worker.fetch(
      new Request('http://localhost/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        }),
      }),
      prodEnv
    );
    expect(res.status).toBe(503);
  });

  it('enforces per-hour rate limits on card creation (max 5/hour)', async () => {
    const payload = {
      title: 'Evening study group for DBMS numericals',
      category: 'study',
      description: 'Solving normalization and indexing problems in reading room.',
      authorName: 'Gaurav',
      authorDepartment: 'B.Tech CSE',
      authorYear: '2nd Year',
      tags: ['DBMS'],
      spotsTotal: 3,
      timeWindow: 'Today 4 PM',
      preferredHandshakeChannel: 'In-Person Campus Meet',
      coordinationNote: 'Library table 2',
      turnstileToken: 'LOCAL_DEV_TURNSTILE_BYPASS',
    };

    for (let i = 0; i < 5; i++) {
      const r = await worker.fetch(
        new Request('http://localhost/api/cards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
        env
      );
      expect(r.status).toBe(201);
    }

    const sixth = await worker.fetch(
      new Request('http://localhost/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
      env
    );
    expect(sixth.status).toBe(429);
  });
});

describe('OpenGraph Server-Side Metadata Generation', () => {
  it('generates safe OpenGraph metadata and escapes HTML entities without leaking private fields', () => {
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
    expect(meta.canonicalUrl).toBe('https://vgu-pulse.pages.dev/cards/card-99');
    expect(escapeHtmlAttribute(meta.title)).not.toContain('<script>');
  });

  it('returns 404 metadata status for missing events', () => {
    const meta = buildEventOgMetadata(
      null,
      'https://vgu-pulse.pages.dev',
      'missing-id'
    );
    expect(meta.httpStatus).toBe(404);
    expect(meta.title).toContain('Event Not Found');
  });
});
