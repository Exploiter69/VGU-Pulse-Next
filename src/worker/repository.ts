import {
  AcademicYear,
  CampusEvent,
  CreateHandshakeInput,
  CreatePulseCardInput,
  HandshakeChannel,
  HandshakeRequest,
  PulseCard,
  PulseCategory,
} from '../types/domain';
import {
  generateCapabilityToken,
  generateRecordId,
  sha256Hex,
} from './crypto';

interface D1PulseCardRow {
  id: string;
  title: string;
  category: PulseCategory;
  description: string;
  author_name: string;
  author_department: string;
  author_year: AcademicYear;
  tags_json: string;
  spots_total: number;
  spots_remaining: number;
  time_window: string;
  preferred_handshake_channel: HandshakeChannel;
  coordination_note: string;
  owner_token_hash: string;
  status: 'open' | 'filled' | 'expired' | 'removed';
  report_count: number;
  created_at: string;
  expires_at: string;
}

interface D1CampusEventRow {
  id: string;
  title: string;
  organizer: string;
  category: 'Workshop' | 'Hackathon' | 'Cultural' | 'Sports' | 'Seminar';
  date_label: string;
  time_label: string;
  venue: string;
  registration_url: string | null;
  verification_source:
    | 'Official VGU Link'
    | 'Verified Club Submission'
    | 'Student Submitted (Unverified)';
  going_count: number;
  looking_for_buddy_count: number;
  status: string;
  created_at: string;
}

interface D1HandshakeJoinedRow {
  id: string;
  card_id: string;
  card_title: string;
  card_coordination_note: string;
  card_channel: HandshakeChannel;
  card_owner_hash: string;
  from_student_name: string;
  from_department: string;
  from_year: AcademicYear;
  intro_note: string;
  sender_token_hash: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  updated_at: string;
}

function mapRowToPublicCard(row: D1PulseCardRow): PulseCard {
  let tags: string[] = [];
  try {
    const parsed = JSON.parse(row.tags_json);
    if (Array.isArray(parsed)) tags = parsed;
  } catch {
    tags = [];
  }

  // Notice: coordination_note and owner_token_hash are NEVER included in public PulseCard
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    description: row.description,
    authorName: row.author_name,
    authorDepartment: row.author_department,
    authorYear: row.author_year,
    tags,
    spotsTotal: row.spots_total,
    spotsRemaining: row.spots_remaining,
    timeWindow: row.time_window,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    status: row.status,
    isDemoFixture: false,
    preferredHandshakeChannel: row.preferred_handshake_channel,
  };
}

function mapRowToPublicEvent(row: D1CampusEventRow): CampusEvent {
  return {
    id: row.id,
    title: row.title,
    organizer: row.organizer,
    category: row.category,
    dateLabel: row.date_label,
    timeLabel: row.time_label,
    venue: row.venue,
    registrationUrl: row.registration_url ?? undefined,
    verificationSource: row.verification_source,
    isDemoFixture: false,
    goingCount: row.going_count,
    lookingForBuddyCount: row.looking_for_buddy_count,
  };
}

export async function listPublicCards(
  db: D1Database,
  filters?: { category?: string; q?: string; limit?: number }
): Promise<PulseCard[]> {
  const limit = Math.min(Math.max(filters?.limit ?? 40, 1), 100);
  const nowIso = new Date().toISOString();

  let sql = `
    SELECT * FROM pulse_cards
    WHERE status IN ('open', 'filled')
      AND expires_at > ?1
      AND report_count < 5
  `;
  const binds: unknown[] = [nowIso];

  if (filters?.category && filters.category !== 'all') {
    binds.push(filters.category);
    sql += ` AND category = ?${binds.length}`;
  }

  if (filters?.q && filters.q.trim().length > 0) {
    const pattern = `%${filters.q.trim()}%`;
    binds.push(pattern);
    const idx = binds.length;
    sql += ` AND (title LIKE ?${idx} OR description LIKE ?${idx} OR author_department LIKE ?${idx} OR tags_json LIKE ?${idx})`;
  }

  binds.push(limit);
  sql += ` ORDER BY created_at DESC LIMIT ?${binds.length}`;

  const res = await db
    .prepare(sql)
    .bind(...binds)
    .all<D1PulseCardRow>();

  return (res.results ?? []).map(mapRowToPublicCard);
}

export async function getPublicCardById(
  db: D1Database,
  id: string
): Promise<PulseCard | null> {
  const row = await db
    .prepare(
      `SELECT * FROM pulse_cards
       WHERE id = ?1 AND status != 'removed' AND report_count < 5`
    )
    .bind(id)
    .first<D1PulseCardRow>();

  if (!row) return null;
  return mapRowToPublicCard(row);
}

export async function createCardRecord(
  db: D1Database,
  input: CreatePulseCardInput
): Promise<{ card: PulseCard; ownerCapabilityToken: string }> {
  const id = generateRecordId('card');
  const rawToken = generateCapabilityToken();
  const tokenHash = await sha256Hex(rawToken);
  const now = new Date();
  const createdAt = now.toISOString();
  // Cards expire 14 days after creation by default
  const expiresAt = new Date(now.getTime() + 14 * 86_400_000).toISOString();

  await db
    .prepare(
      `INSERT INTO pulse_cards (
        id, title, category, description, author_name, author_department,
        author_year, tags_json, spots_total, spots_remaining, time_window,
        preferred_handshake_channel, coordination_note, owner_token_hash,
        status, report_count, created_at, expires_at
      ) VALUES (
        ?1, ?2, ?3, ?4, ?5, ?6,
        ?7, ?8, ?9, ?10, ?11,
        ?12, ?13, ?14,
        'open', 0, ?15, ?16
      )`
    )
    .bind(
      id,
      input.title,
      input.category,
      input.description,
      input.authorName,
      input.authorDepartment,
      input.authorYear,
      JSON.stringify(input.tags),
      input.spotsTotal,
      input.spotsTotal,
      input.timeWindow,
      input.preferredHandshakeChannel,
      input.coordinationNote,
      tokenHash,
      createdAt,
      expiresAt
    )
    .run();

  const created = await getPublicCardById(db, id);
  if (!created) {
    throw new Error('Failed to load newly created card.');
  }

  return { card: created, ownerCapabilityToken: rawToken };
}

export async function incrementCardReportCount(
  db: D1Database,
  cardId: string
): Promise<boolean> {
  const res = await db
    .prepare(
      `UPDATE pulse_cards
       SET report_count = report_count + 1,
           status = CASE WHEN report_count + 1 >= 5 THEN 'removed' ELSE status END
       WHERE id = ?1`
    )
    .bind(cardId)
    .run();

  return (res.meta?.changes ?? 0) > 0;
}

export async function listPublicEvents(db: D1Database): Promise<CampusEvent[]> {
  const res = await db
    .prepare(
      `SELECT * FROM campus_events
       WHERE status = 'published'
       ORDER BY created_at DESC LIMIT 50`
    )
    .all<D1CampusEventRow>();

  return (res.results ?? []).map(mapRowToPublicEvent);
}

export async function getPublicEventById(
  db: D1Database,
  id: string
): Promise<CampusEvent | null> {
  const row = await db
    .prepare(
      `SELECT * FROM campus_events WHERE id = ?1 AND status = 'published'`
    )
    .bind(id)
    .first<D1CampusEventRow>();

  if (!row) return null;
  return mapRowToPublicEvent(row);
}

export async function updateEventBuddyCounter(
  db: D1Database,
  eventId: string,
  direction: 'join' | 'leave'
): Promise<CampusEvent | null> {
  const delta = direction === 'join' ? 1 : -1;
  await db
    .prepare(
      `UPDATE campus_events
       SET going_count = MAX(0, going_count + ?2),
           looking_for_buddy_count = MAX(0, looking_for_buddy_count + ?2)
       WHERE id = ?1 AND status = 'published'`
    )
    .bind(eventId, delta)
    .run();

  return getPublicEventById(db, eventId);
}

function mapHandshakeRow(
  row: D1HandshakeJoinedRow,
  direction: 'incoming' | 'outgoing'
): HandshakeRequest {
  let revealedContactNote =
    direction === 'incoming'
      ? `Review intro note. Accepting reveals your coordination instructions (${row.card_channel}) to ${row.from_student_name}.`
      : `Waiting for card owner to review your intro note.`;

  if (row.status === 'accepted') {
    revealedContactNote =
      direction === 'outgoing'
        ? `Accepted! Owner coordination note (${row.card_channel}): ${row.card_coordination_note}`
        : `You accepted this request. Your coordination note (${row.card_coordination_note}) is now visible to ${row.from_student_name}.`;
  } else if (row.status === 'declined') {
    revealedContactNote = 'Request was declined. No coordination details were shared.';
  }

  return {
    id: row.id,
    cardId: row.card_id,
    cardTitle: row.card_title,
    fromStudentName: row.from_student_name,
    fromDepartment: row.from_department,
    fromYear: row.from_year,
    introNote: row.intro_note,
    direction,
    status: row.status,
    createdAtLabel: row.created_at,
    isDemoFixture: false,
    revealedContactNote,
  };
}

export async function createHandshakeRecord(
  db: D1Database,
  input: CreateHandshakeInput
): Promise<
  | { ok: true; handshake: HandshakeRequest; senderCapabilityToken: string }
  | { ok: false; code: string; message: string; status: number }
> {
  const cardRow = await db
    .prepare(`SELECT * FROM pulse_cards WHERE id = ?1`)
    .bind(input.cardId)
    .first<D1PulseCardRow>();

  if (!cardRow || cardRow.status === 'removed' || cardRow.report_count >= 5) {
    return {
      ok: false,
      code: 'CARD_NOT_FOUND',
      message: 'The requested Pulse card does not exist or is no longer active.',
      status: 404,
    };
  }

  if (cardRow.status !== 'open' || cardRow.spots_remaining <= 0) {
    return {
      ok: false,
      code: 'CARD_FULL',
      message: 'All spots on this request card have already been filled.',
      status: 409,
    };
  }

  const id = generateRecordId('hs');
  const rawSenderToken = generateCapabilityToken();
  const senderTokenHash = await sha256Hex(rawSenderToken);
  const nowIso = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO handshake_requests (
        id, card_id, from_student_name, from_department, from_year,
        intro_note, sender_token_hash, status, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending', ?8, ?8)`
    )
    .bind(
      id,
      input.cardId,
      input.fromStudentName,
      input.fromDepartment,
      input.fromYear,
      input.introNote,
      senderTokenHash,
      nowIso
    )
    .run();

  const joined = await db
    .prepare(
      `SELECT
        h.*,
        c.title AS card_title,
        c.coordination_note AS card_coordination_note,
        c.preferred_handshake_channel AS card_channel,
        c.owner_token_hash AS card_owner_hash
       FROM handshake_requests h
       JOIN pulse_cards c ON c.id = h.card_id
       WHERE h.id = ?1`
    )
    .bind(id)
    .first<D1HandshakeJoinedRow>();

  if (!joined) {
    throw new Error('Failed to load created handshake.');
  }

  return {
    ok: true,
    handshake: mapHandshakeRow(joined, 'outgoing'),
    senderCapabilityToken: rawSenderToken,
  };
}

export async function listAuthorizedHandshakes(
  db: D1Database,
  rawOwnerTokens: string[],
  rawSenderTokens: string[]
): Promise<HandshakeRequest[]> {
  const ownerHashes = await Promise.all(
    rawOwnerTokens.slice(0, 30).map((t) => sha256Hex(t))
  );
  const senderHashes = await Promise.all(
    rawSenderTokens.slice(0, 50).map((t) => sha256Hex(t))
  );

  const results: HandshakeRequest[] = [];

  if (ownerHashes.length > 0) {
    const placeholders = ownerHashes.map((_, i) => `?${i + 1}`).join(', ');
    const rows = await db
      .prepare(
        `SELECT
          h.*,
          c.title AS card_title,
          c.coordination_note AS card_coordination_note,
          c.preferred_handshake_channel AS card_channel,
          c.owner_token_hash AS card_owner_hash
         FROM handshake_requests h
         JOIN pulse_cards c ON c.id = h.card_id
         WHERE c.owner_token_hash IN (${placeholders})
         ORDER BY h.created_at DESC`
      )
      .bind(...ownerHashes)
      .all<D1HandshakeJoinedRow>();

    for (const r of rows.results ?? []) {
      results.push(mapHandshakeRow(r, 'incoming'));
    }
  }

  if (senderHashes.length > 0) {
    const placeholders = senderHashes.map((_, i) => `?${i + 1}`).join(', ');
    const rows = await db
      .prepare(
        `SELECT
          h.*,
          c.title AS card_title,
          c.coordination_note AS card_coordination_note,
          c.preferred_handshake_channel AS card_channel,
          c.owner_token_hash AS card_owner_hash
         FROM handshake_requests h
         JOIN pulse_cards c ON c.id = h.card_id
         WHERE h.sender_token_hash IN (${placeholders})
         ORDER BY h.created_at DESC`
      )
      .bind(...senderHashes)
      .all<D1HandshakeJoinedRow>();

    for (const r of rows.results ?? []) {
      // Avoid duplicate if same browser owns card and sent test handshake
      if (!results.some((existing) => existing.id === r.id)) {
        results.push(mapHandshakeRow(r, 'outgoing'));
      }
    }
  }

  return results;
}

export async function updateHandshakeDecision(
  db: D1Database,
  handshakeId: string,
  rawOwnerToken: string,
  newStatus: 'accepted' | 'declined'
): Promise<
  | { ok: true; handshake: HandshakeRequest }
  | { ok: false; code: string; message: string; status: number }
> {
  const joined = await db
    .prepare(
      `SELECT
        h.*,
        c.title AS card_title,
        c.coordination_note AS card_coordination_note,
        c.preferred_handshake_channel AS card_channel,
        c.owner_token_hash AS card_owner_hash
       FROM handshake_requests h
       JOIN pulse_cards c ON c.id = h.card_id
       WHERE h.id = ?1`
    )
    .bind(handshakeId)
    .first<D1HandshakeJoinedRow>();

  if (!joined) {
    return {
      ok: false,
      code: 'HANDSHAKE_NOT_FOUND',
      message: 'Handshake request not found.',
      status: 404,
    };
  }

  const callerHash = await sha256Hex(rawOwnerToken);
  if (callerHash !== joined.card_owner_hash) {
    return {
      ok: false,
      code: 'FORBIDDEN_CAPABILITY',
      message: 'Invalid or unauthorized card-owner capability token.',
      status: 403,
    };
  }

  const nowIso = new Date().toISOString();
  const previousStatus = joined.status;

  await db
    .prepare(
      `UPDATE handshake_requests
       SET status = ?2, updated_at = ?3
       WHERE id = ?1`
    )
    .bind(handshakeId, newStatus, nowIso)
    .run();

  if (previousStatus !== 'accepted' && newStatus === 'accepted') {
    await db
      .prepare(
        `UPDATE pulse_cards
         SET spots_remaining = MAX(0, spots_remaining - 1),
             status = CASE WHEN spots_remaining - 1 <= 0 THEN 'filled' ELSE status END
         WHERE id = ?1`
      )
      .bind(joined.card_id)
      .run();
  }

  const updatedRow: D1HandshakeJoinedRow = {
    ...joined,
    status: newStatus,
    updated_at: nowIso,
  };

  return {
    ok: true,
    handshake: mapHandshakeRow(updatedRow, 'incoming'),
  };
}
