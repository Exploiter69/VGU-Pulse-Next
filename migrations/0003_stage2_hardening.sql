-- Migration 0003: Stage 2 Security, Concurrency, Deduplication, and Source Classification Hardening
-- Forward-only migration preserving all existing pulse_cards, handshake_requests, and campus_events data.

-- 1. Deduplicated Card Reports Table (1 report per reporter_hash per card_id)
CREATE TABLE IF NOT EXISTS card_reports (
  card_id TEXT NOT NULL REFERENCES pulse_cards(id) ON DELETE CASCADE,
  reporter_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (card_id, reporter_hash)
);

CREATE INDEX IF NOT EXISTS idx_card_reports_card_id
  ON card_reports(card_id);

-- 2. Idempotent Event Participations Table (1 participation record per participant_token_hash per event_id)
CREATE TABLE IF NOT EXISTS event_participations (
  event_id TEXT NOT NULL REFERENCES campus_events(id) ON DELETE CASCADE,
  participant_token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (event_id, participant_token_hash)
);

CREATE INDEX IF NOT EXISTS idx_event_participations_event_id
  ON event_participations(event_id);

-- 3. True Sliding-Window Rate Limit Events Table
CREATE TABLE IF NOT EXISTS rate_limit_events (
  id TEXT PRIMARY KEY,
  rate_key TEXT NOT NULL,
  timestamp_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_events_key_time
  ON rate_limit_events(rate_key, timestamp_ms);

CREATE INDEX IF NOT EXISTS idx_rate_limit_events_time
  ON rate_limit_events(timestamp_ms);

-- 4. Expand campus_events.verification_source CHECK constraint to include truthful 'External Govt / Public Portal'
-- SQLite requires table recreation to alter a CHECK constraint while preserving all existing rows.
CREATE TABLE IF NOT EXISTS campus_events_new (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 5 AND 140),
  organizer TEXT NOT NULL CHECK (length(organizer) BETWEEN 2 AND 80),
  category TEXT NOT NULL CHECK (category IN ('Workshop', 'Hackathon', 'Cultural', 'Sports', 'Seminar')),
  date_label TEXT NOT NULL CHECK (length(date_label) BETWEEN 3 AND 40),
  time_label TEXT NOT NULL CHECK (length(time_label) BETWEEN 3 AND 40),
  venue TEXT NOT NULL CHECK (length(venue) BETWEEN 2 AND 100),
  registration_url TEXT,
  verification_source TEXT NOT NULL CHECK (
    verification_source IN (
      'Official VGU Link',
      'External Govt / Public Portal',
      'Verified Club Submission',
      'Student Submitted (Unverified)'
    )
  ),
  going_count INTEGER NOT NULL DEFAULT 0 CHECK (going_count >= 0),
  looking_for_buddy_count INTEGER NOT NULL DEFAULT 0 CHECK (looking_for_buddy_count >= 0),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'archived', 'removed')),
  created_at TEXT NOT NULL
);

INSERT INTO campus_events_new (
  id, title, organizer, category, date_label, time_label, venue,
  registration_url, verification_source, going_count, looking_for_buddy_count,
  status, created_at
)
SELECT
  id, title, organizer, category, date_label, time_label, venue,
  registration_url,
  CASE
    WHEN id IN ('evt-academic-abc-verification', 'evt-aicte-internship-drive')
      THEN 'External Govt / Public Portal'
    ELSE verification_source
  END,
  going_count, looking_for_buddy_count, status, created_at
FROM campus_events;

DROP TABLE campus_events;
ALTER TABLE campus_events_new RENAME TO campus_events;

CREATE INDEX IF NOT EXISTS idx_campus_events_status_created
  ON campus_events(status, created_at DESC);
