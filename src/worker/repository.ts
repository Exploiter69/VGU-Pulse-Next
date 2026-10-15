import {
  AcademicYear,
  CampusEvent,
  CreateHandshakeInput,
  CreatePulseCardInput,
  EventVerificationSource,
  HandshakeChannel,
  HandshakeRequest,
  PulseCard,
  PulseCategory,
} from '../types/domain';
import {
  decryptCoordinationNote,
  encryptCoordinationNote,
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
  verification_source: EventVerificationSource;
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
  card_status: 'open' | 'filled' | 'expired' | 'removed';
  card_spots_total: number;
  card_spots_remaining: number;
  card_expires_at: string;
  card_report_count: number;
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

  const isExpired = new Date(row.expires_at).getTime() <= Date.now();
  const effectiveStatus =
    row.status === 'removed'
      ? 'removed'
      : isExpired
      ? 'expired'
      : row.spots_remaining <= 0
      ? 'filled'
      : 'open';

  // PRIVACY INVARIANT: coordination_note and owner_token_hash are NEVER mapped to public PulseCard
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
    status: effectiveStatus,
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
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return null;
  }
  return mapRowToPublicCard(row);
}

export async function createCardRecord(
  db: D1Database,
  input: CreatePulseCardInput,
  encryptionSecret: string
): Promise<{ card: PulseCard; ownerCapabilityToken: string }> {
  const id = generateRecordId('card');
  const rawToken = generateCapabilityToken();
  const tokenHash = await sha256Hex(rawToken);
  const encryptedCoordinationNote = await encryptCoordinationNote(
    input.coordinationNote,
    encryptionSecret
  );
  const now = new Date();
  const createdAt = now.toISOString();
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
      encryptedCoordinationNote,
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

/**
 * Deduplicated card reporting:
 * A given `reporterHash` (`SHA-256(clientIp + salt + cardId)`) can only increment `report_count` once per card.
 */
export async function reportCardWithDeduplication(
  db: D1Database,
  cardId: string,
  reporterHash: string
): Promise<{ found: boolean; alreadyReported: boolean }> {
  const card = await db
    .prepare(`SELECT id, status FROM pulse_cards WHERE id = ?1`)
    .bind(cardId)
    .first<{ id: string; status: string }>();

  if (!card || card.status === 'removed') {
    return { found: false, alreadyReported: false };
  }

  const existing = await db
    .prepare(
      `SELECT 1 AS exists_flag FROM card_reports
       WHERE card_id = ?1 AND reporter_hash = ?2`
    )
    .bind(cardId, reporterHash)
    .first<{ exists_flag: number }>();

  if (existing?.exists_flag === 1) {
    return { found: true, alreadyReported: true };
  }

  const nowIso = new Date().toISOString();
  const insertResult = await db
    .prepare(
      `INSERT OR IGNORE INTO card_reports (card_id, reporter_hash, created_at)
       VALUES (?1, ?2, ?3)`
    )
    .bind(cardId, reporterHash, nowIso)
    .run();

  if ((insertResult.meta?.changes ?? 0) === 0) {
    return { found: true, alreadyReported: true };
  }

  await db
    .prepare(
      `UPDATE pulse_cards
       SET report_count = report_count + 1,
           status = CASE WHEN report_count + 1 >= 5 THEN 'removed' ELSE status END
       WHERE id = ?1`
    )
    .bind(cardId)
    .run();

  return { found: true, alreadyReported: false };
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

/**
 * Participant-aware, idempotent event buddy participation:
 * - Joining twice with the same `participantToken` only increments counts once.
 * - Leaving without having joined does not decrement counts.
 */
export async function updateEventBuddyParticipation(
  db: D1Database,
  eventId: string,
  rawParticipantToken: string,
  direction: 'join' | 'leave'
): Promise<{ event: CampusEvent | null; changed: boolean }> {
  const event = await getPublicEventById(db, eventId);
  if (!event) {
    return { event: null, changed: false };
  }

  const participantHash = await sha256Hex(`event-buddy:${rawParticipantToken}`);
  const existing = await db
    .prepare(
      `SELECT 1 AS joined FROM event_participations
       WHERE event_id = ?1 AND participant_token_hash = ?2`
    )
    .bind(eventId, participantHash)
    .first<{ joined: number }>();

  const isCurrentlyJoined = existing?.joined === 1;

  if (direction === 'join') {
    if (isCurrentlyJoined) {
      return { event, changed: false };
    }
    const nowIso = new Date().toISOString();
    const ins = await db
      .prepare(
        `INSERT OR IGNORE INTO event_participations (event_id, participant_token_hash, created_at)
         VALUES (?1, ?2, ?3)`
      )
      .bind(eventId, participantHash, nowIso)
      .run();

    if ((ins.meta?.changes ?? 0) > 0) {
      await db
        .prepare(
          `UPDATE campus_events
           SET going_count = going_count + 1,
               looking_for_buddy_count = looking_for_buddy_count + 1
           WHERE id = ?1 AND status = 'published'`
        )
        .bind(eventId)
        .run();
    }
    const updated = await getPublicEventById(db, eventId);
    return { event: updated, changed: (ins.meta?.changes ?? 0) > 0 };
  }

  // direction === 'leave'
  if (!isCurrentlyJoined) {
    return { event, changed: false };
  }

  const del = await db
    .prepare(
      `DELETE FROM event_participations
       WHERE event_id = ?1 AND participant_token_hash = ?2`
    )
    .bind(eventId, participantHash)
    .run();

  if ((del.meta?.changes ?? 0) > 0) {
    await db
      .prepare(
        `UPDATE campus_events
         SET going_count = MAX(0, going_count - 1),
             looking_for_buddy_count = MAX(0, looking_for_buddy_count - 1)
         WHERE id = ?1 AND status = 'published'`
      )
      .bind(eventId)
      .run();
  }

  const updated = await getPublicEventById(db, eventId);
  return { event: updated, changed: (del.meta?.changes ?? 0) > 0 };
}

async function mapHandshakeRow(
  row: D1HandshakeJoinedRow,
  direction: 'incoming' | 'outgoing',
  encryptionSecret: string
): Promise<HandshakeRequest> {
  let revealedContactNote =
    direction === 'incoming'
      ? `Review intro note. Accepting reveals your private coordination instructions (${row.card_channel}) to ${row.from_student_name}.`
      : `Waiting for card owner to review your intro note.`;

  if (row.status === 'accepted') {
    const decrypted = await decryptCoordinationNote(
      row.card_coordination_note,
      encryptionSecret
    );
    const noteText = decrypted.ok
      ? decrypted.plaintext
      : '[Coordination note unavailable due to key mismatch]';

    revealedContactNote =
      direction === 'outgoing'
        ? `Accepted! Owner coordination note (${row.card_channel}): ${noteText}`
        : `You accepted this request. Your coordination note (${noteText}) is now visible to ${row.from_student_name}.`;
  } else if (row.status === 'declined') {
    revealedContactNote =
      'Request was declined. No private coordination details were shared.';
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

const JOINED_HANDSHAKE_SELECT = `
  SELECT
    h.*,
    c.title AS card_title,
    c.coordination_note AS card_coordination_note,
    c.preferred_handshake_channel AS card_channel,
    c.owner_token_hash AS card_owner_hash,
    c.status AS card_status,
    c.spots_total AS card_spots_total,
    c.spots_remaining AS card_spots_remaining,
    c.expires_at AS card_expires_at,
    c.report_count AS card_report_count
  FROM handshake_requests h
  JOIN pulse_cards c ON c.id = h.card_id
`;

export async function createHandshakeRecord(
  db: D1Database,
  input: CreateHandshakeInput,
  encryptionSecret: string
): Promise<
  | { ok: true; handshake: HandshakeRequest; senderCapabilityToken: string }
  | { ok: false; code: string; message: string; status: number }
> {
  const cardRow = await db
    .prepare(`SELECT * FROM pulse_cards WHERE id = ?1`)
    .bind(input.cardId)
    .first<D1PulseCardRow>();

  if (
    !cardRow ||
    cardRow.status === 'removed' ||
    cardRow.report_count >= 5 ||
    new Date(cardRow.expires_at).getTime() <= Date.now()
  ) {
    return {
      ok: false,
      code: 'CARD_NOT_FOUND',
      message:
        'The requested Pulse card does not exist, has expired, or is no longer active.',
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

  // Prevent identical duplicate pending spam on the same card
  const duplicateCheck = await db
    .prepare(
      `SELECT id FROM handshake_requests
       WHERE card_id = ?1 AND from_student_name = ?2 AND intro_note = ?3 AND status = 'pending'`
    )
    .bind(input.cardId, input.fromStudentName, input.introNote)
    .first<{ id: string }>();

  if (duplicateCheck?.id) {
    return {
      ok: false,
      code: 'DUPLICATE_HANDSHAKE',
      message: 'An identical pending handshake request already exists for this card.',
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
    .prepare(`${JOINED_HANDSHAKE_SELECT} WHERE h.id = ?1`)
    .bind(id)
    .first<D1HandshakeJoinedRow>();

  if (!joined) {
    throw new Error('Failed to load created handshake.');
  }

  return {
    ok: true,
    handshake: await mapHandshakeRow(joined, 'outgoing', encryptionSecret),
    senderCapabilityToken: rawSenderToken,
  };
}

export async function listAuthorizedHandshakes(
  db: D1Database,
  rawOwnerTokens: string[],
  rawSenderTokens: string[],
  encryptionSecret: string
): Promise<HandshakeRequest[]> {
  const validOwnerTokens = rawOwnerTokens.filter(
    (t) => typeof t === 'string' && t.trim().length >= 32
  );
  const validSenderTokens = rawSenderTokens.filter(
    (t) => typeof t === 'string' && t.trim().length >= 32
  );

  const ownerHashes = await Promise.all(
    validOwnerTokens.slice(0, 30).map((t) => sha256Hex(t.trim()))
  );
  const senderHashes = await Promise.all(
    validSenderTokens.slice(0, 50).map((t) => sha256Hex(t.trim()))
  );

  const results: HandshakeRequest[] = [];

  if (ownerHashes.length > 0) {
    const placeholders = ownerHashes.map((_, i) => `?${i + 1}`).join(', ');
    const rows = await db
      .prepare(
        `${JOINED_HANDSHAKE_SELECT}
         WHERE c.owner_token_hash IN (${placeholders})
         ORDER BY h.created_at DESC`
      )
      .bind(...ownerHashes)
      .all<D1HandshakeJoinedRow>();

    for (const r of rows.results ?? []) {
      results.push(await mapHandshakeRow(r, 'incoming', encryptionSecret));
    }
  }

  if (senderHashes.length > 0) {
    const placeholders = senderHashes.map((_, i) => `?${i + 1}`).join(', ');
    const rows = await db
      .prepare(
        `${JOINED_HANDSHAKE_SELECT}
         WHERE h.sender_token_hash IN (${placeholders})
         ORDER BY h.created_at DESC`
      )
      .bind(...senderHashes)
      .all<D1HandshakeJoinedRow>();

    for (const r of rows.results ?? []) {
      if (!results.some((existing) => existing.id === r.id)) {
        results.push(await mapHandshakeRow(r, 'outgoing', encryptionSecret));
      }
    }
  }

  return results;
}

/**
 * Atomic capacity and lifecycle transitions for Handshake Requests:
 * - `pending -> accepted` or `declined -> accepted`:
 *   Requires card to be active, un-expired, and `spots_remaining > 0`.
 *   Atomically decrements `spots_remaining` by 1 and transitions card to `'filled'` if `spots_remaining - 1 == 0`.
 *   If a concurrent request takes the last spot or changes the handshake state first, the conditional SQL guard fails safely with `409 Conflict`.
 * - `accepted -> declined`:
 *   Atomically restores 1 spot (`MIN(spots_total, spots_remaining + 1)`) and transitions card status back to `'open'`.
 * - `pending -> declined`:
 *   Updates handshake status to `'declined'` without altering card capacity.
 * - Repeated identical status (`accepted -> accepted` or `declined -> declined`):
 *   Idempotent no-op returning `200 OK` without double-decrementing or double-incrementing capacity.
 */
export async function updateHandshakeDecision(
  db: D1Database,
  handshakeId: string,
  rawOwnerToken: string,
  newStatus: 'accepted' | 'declined',
  encryptionSecret: string
): Promise<
  | { ok: true; handshake: HandshakeRequest }
  | { ok: false; code: string; message: string; status: number }
> {
  const joined = await db
    .prepare(`${JOINED_HANDSHAKE_SELECT} WHERE h.id = ?1`)
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

  const callerHash = await sha256Hex(rawOwnerToken.trim());
  if (callerHash !== joined.card_owner_hash) {
    return {
      ok: false,
      code: 'FORBIDDEN_CAPABILITY',
      message: 'Invalid or unauthorized card-owner capability token.',
      status: 403,
    };
  }

  if (
    joined.card_status === 'removed' ||
    joined.card_report_count >= 5 ||
    new Date(joined.card_expires_at).getTime() <= Date.now()
  ) {
    return {
      ok: false,
      code: 'CARD_INACTIVE',
      message: 'Cannot modify handshakes on an expired or removed card.',
      status: 409,
    };
  }

  const previousStatus = joined.status;
  const nowIso = new Date().toISOString();

  // Case 1: Idempotent no-op (accepted -> accepted, or declined -> declined)
  if (previousStatus === newStatus) {
    return {
      ok: true,
      handshake: await mapHandshakeRow(joined, 'incoming', encryptionSecret),
    };
  }

  // Case 2: Transitioning TO 'accepted' (from 'pending' or 'declined') -> Must claim 1 available spot atomically
  if (newStatus === 'accepted') {
    if (joined.card_spots_remaining <= 0 || joined.card_status === 'filled') {
      return {
        ok: false,
        code: 'CARD_FULL',
        message: 'No spots remaining on this card to accept another request.',
        status: 409,
      };
    }

    // Conditional update on card capacity first, then conditional update on handshake status
    const claimSpotStmt = db
      .prepare(
        `UPDATE pulse_cards
         SET spots_remaining = spots_remaining - 1,
             status = CASE WHEN spots_remaining - 1 <= 0 THEN 'filled' ELSE 'open' END
         WHERE id = ?1
           AND status = 'open'
           AND spots_remaining > 0`
      )
      .bind(joined.card_id);

    const acceptHsStmt = db
      .prepare(
        `UPDATE handshake_requests
         SET status = 'accepted', updated_at = ?3
         WHERE id = ?1 AND status = ?2`
      )
      .bind(handshakeId, previousStatus, nowIso);

    const batchResults = await db.batch([claimSpotStmt, acceptHsStmt]);
    const cardChanges = batchResults[0]?.meta?.changes ?? 0;
    const hsChanges = batchResults[1]?.meta?.changes ?? 0;

    if (cardChanges === 0) {
      // If card had no spots left due to concurrent acceptance, ensure handshake stays in previousStatus
      if (hsChanges > 0) {
        await db
          .prepare(
            `UPDATE handshake_requests SET status = ?2, updated_at = ?3 WHERE id = ?1`
          )
          .bind(handshakeId, previousStatus, nowIso)
          .run();
      }
      return {
        ok: false,
        code: 'CARD_FULL',
        message: 'Concurrent update exhausted the last spot on this card.',
        status: 409,
      };
    }

    if (hsChanges === 0) {
      // Handshake state changed concurrently; restore the claimed spot
      await db
        .prepare(
          `UPDATE pulse_cards
           SET spots_remaining = MIN(spots_total, spots_remaining + 1),
               status = 'open'
           WHERE id = ?1`
        )
        .bind(joined.card_id)
        .run();

      return {
        ok: false,
        code: 'CONCURRENT_STATE_CHANGE',
        message: 'Handshake state was modified concurrently. Please refresh.',
        status: 409,
      };
    }
  } else if (previousStatus === 'accepted' && newStatus === 'declined') {
    // Case 3: Cancelling a previously accepted handshake ('accepted' -> 'declined') -> Restore 1 spot atomically
    const declineHsStmt = db
      .prepare(
        `UPDATE handshake_requests
         SET status = 'declined', updated_at = ?2
         WHERE id = ?1 AND status = 'accepted'`
      )
      .bind(handshakeId, nowIso);

    const restoreSpotStmt = db
      .prepare(
        `UPDATE pulse_cards
         SET spots_remaining = MIN(spots_total, spots_remaining + 1),
             status = CASE WHEN status = 'filled' THEN 'open' ELSE status END
         WHERE id = ?1
           AND spots_remaining < spots_total`
      )
      .bind(joined.card_id);

    const batchResults = await db.batch([declineHsStmt, restoreSpotStmt]);
    const hsChanges = batchResults[0]?.meta?.changes ?? 0;

    if (hsChanges === 0) {
      return {
        ok: false,
        code: 'CONCURRENT_STATE_CHANGE',
        message: 'Handshake state was modified concurrently.',
        status: 409,
      };
    }
  } else {
    // Case 4: 'pending' -> 'declined' (No capacity change)
    const res = await db
      .prepare(
        `UPDATE handshake_requests
         SET status = 'declined', updated_at = ?2
         WHERE id = ?1 AND status = 'pending'`
      )
      .bind(handshakeId, nowIso)
      .run();

    if ((res.meta?.changes ?? 0) === 0) {
      return {
        ok: false,
        code: 'CONCURRENT_STATE_CHANGE',
        message: 'Handshake state was modified concurrently.',
        status: 409,
      };
    }
  }

  const refreshed = await db
    .prepare(`${JOINED_HANDSHAKE_SELECT} WHERE h.id = ?1`)
    .bind(handshakeId)
    .first<D1HandshakeJoinedRow>();

  if (!refreshed) {
    throw new Error('Failed to reload updated handshake.');
  }

  return {
    ok: true,
    handshake: await mapHandshakeRow(refreshed, 'incoming', encryptionSecret),
  };
}
