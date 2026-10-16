-- Migration 0004: expand encrypted coordination-note storage without losing relationships.
--
-- AES-256-GCM stores the IV and authenticated ciphertext as hex. A valid 200-character
-- plaintext note can therefore exceed the legacy 200-character CHECK constraint.
-- 1500 characters safely accommodates 200 UTF-16 code units encoded as UTF-8, plus
-- the GCM authentication tag, IV, and version prefix.
--
-- Rebuild the parent and all existing child tables together. New child tables point
-- at pulse_cards_new during the copy; SQLite updates their foreign-key target when
-- pulse_cards_new is renamed to pulse_cards. Rows and indexes are preserved.

CREATE TABLE pulse_cards_new (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 10 AND 120),
  category TEXT NOT NULL CHECK (category IN ('hackathon', 'study', 'sports', 'cab_pool', 'project')),
  description TEXT NOT NULL CHECK (length(description) BETWEEN 15 AND 400),
  author_name TEXT NOT NULL CHECK (length(author_name) BETWEEN 2 AND 50),
  author_department TEXT NOT NULL CHECK (length(author_department) BETWEEN 2 AND 60),
  author_year TEXT NOT NULL CHECK (author_year IN ('1st Year', '2nd Year', '3rd Year', '4th Year', 'PG / Research')),
  tags_json TEXT NOT NULL DEFAULT '[]',
  spots_total INTEGER NOT NULL CHECK (spots_total BETWEEN 1 AND 20),
  spots_remaining INTEGER NOT NULL CHECK (spots_remaining >= 0 AND spots_remaining <= spots_total),
  time_window TEXT NOT NULL CHECK (length(time_window) BETWEEN 3 AND 80),
  preferred_handshake_channel TEXT NOT NULL CHECK (preferred_handshake_channel IN ('WhatsApp', 'Telegram', 'In-Person Campus Meet')),
  coordination_note TEXT NOT NULL CHECK (length(coordination_note) BETWEEN 5 AND 1500),
  owner_token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'filled', 'expired', 'removed')),
  report_count INTEGER NOT NULL DEFAULT 0 CHECK (report_count >= 0),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

INSERT INTO pulse_cards_new (
  id, title, category, description, author_name, author_department, author_year,
  tags_json, spots_total, spots_remaining, time_window, preferred_handshake_channel,
  coordination_note, owner_token_hash, status, report_count, created_at, expires_at
)
SELECT
  id, title, category, description, author_name, author_department, author_year,
  tags_json, spots_total, spots_remaining, time_window, preferred_handshake_channel,
  coordination_note, owner_token_hash, status, report_count, created_at, expires_at
FROM pulse_cards;

CREATE TABLE handshake_requests_new (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES pulse_cards_new(id) ON DELETE CASCADE,
  from_student_name TEXT NOT NULL CHECK (length(from_student_name) BETWEEN 2 AND 50),
  from_department TEXT NOT NULL CHECK (length(from_department) BETWEEN 2 AND 60),
  from_year TEXT NOT NULL CHECK (from_year IN ('1st Year', '2nd Year', '3rd Year', '4th Year', 'PG / Research')),
  intro_note TEXT NOT NULL CHECK (length(intro_note) BETWEEN 8 AND 280),
  sender_token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO handshake_requests_new (
  id, card_id, from_student_name, from_department, from_year, intro_note,
  sender_token_hash, status, created_at, updated_at
)
SELECT
  id, card_id, from_student_name, from_department, from_year, intro_note,
  sender_token_hash, status, created_at, updated_at
FROM handshake_requests;

CREATE TABLE card_reports_new (
  card_id TEXT NOT NULL REFERENCES pulse_cards_new(id) ON DELETE CASCADE,
  reporter_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (card_id, reporter_hash)
);

INSERT INTO card_reports_new (card_id, reporter_hash, created_at)
SELECT card_id, reporter_hash, created_at
FROM card_reports;

DROP TABLE handshake_requests;
DROP TABLE card_reports;
DROP TABLE pulse_cards;

ALTER TABLE pulse_cards_new RENAME TO pulse_cards;
ALTER TABLE handshake_requests_new RENAME TO handshake_requests;
ALTER TABLE card_reports_new RENAME TO card_reports;

CREATE INDEX idx_pulse_cards_status_created
  ON pulse_cards(status, created_at DESC);
CREATE INDEX idx_pulse_cards_category_status
  ON pulse_cards(category, status, created_at DESC);
CREATE INDEX idx_pulse_cards_owner_hash
  ON pulse_cards(owner_token_hash);

CREATE INDEX idx_handshakes_card_id
  ON handshake_requests(card_id, created_at DESC);
CREATE INDEX idx_handshakes_sender_hash
  ON handshake_requests(sender_token_hash, created_at DESC);

CREATE INDEX idx_card_reports_card_id
  ON card_reports(card_id);
