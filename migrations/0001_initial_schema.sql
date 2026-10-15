-- Migration 0001: Core Stage 2 relational schema for VGU Pulse Next
-- No fake student records are seeded here.

CREATE TABLE IF NOT EXISTS pulse_cards (
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
  coordination_note TEXT NOT NULL CHECK (length(coordination_note) BETWEEN 5 AND 200),
  owner_token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'filled', 'expired', 'removed')),
  report_count INTEGER NOT NULL DEFAULT 0 CHECK (report_count >= 0),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pulse_cards_status_created
  ON pulse_cards(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pulse_cards_category_status
  ON pulse_cards(category, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pulse_cards_owner_hash
  ON pulse_cards(owner_token_hash);

CREATE TABLE IF NOT EXISTS campus_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 5 AND 140),
  organizer TEXT NOT NULL CHECK (length(organizer) BETWEEN 2 AND 80),
  category TEXT NOT NULL CHECK (category IN ('Workshop', 'Hackathon', 'Cultural', 'Sports', 'Seminar')),
  date_label TEXT NOT NULL CHECK (length(date_label) BETWEEN 3 AND 40),
  time_label TEXT NOT NULL CHECK (length(time_label) BETWEEN 3 AND 40),
  venue TEXT NOT NULL CHECK (length(venue) BETWEEN 2 AND 100),
  registration_url TEXT,
  verification_source TEXT NOT NULL CHECK (verification_source IN ('Official VGU Link', 'Verified Club Submission', 'Student Submitted (Unverified)')),
  going_count INTEGER NOT NULL DEFAULT 0 CHECK (going_count >= 0),
  looking_for_buddy_count INTEGER NOT NULL DEFAULT 0 CHECK (looking_for_buddy_count >= 0),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'archived', 'removed')),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_campus_events_status_created
  ON campus_events(status, created_at DESC);

CREATE TABLE IF NOT EXISTS handshake_requests (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES pulse_cards(id) ON DELETE CASCADE,
  from_student_name TEXT NOT NULL CHECK (length(from_student_name) BETWEEN 2 AND 50),
  from_department TEXT NOT NULL CHECK (length(from_department) BETWEEN 2 AND 60),
  from_year TEXT NOT NULL CHECK (from_year IN ('1st Year', '2nd Year', '3rd Year', '4th Year', 'PG / Research')),
  intro_note TEXT NOT NULL CHECK (length(intro_note) BETWEEN 8 AND 280),
  sender_token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_handshakes_card_id
  ON handshake_requests(card_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_handshakes_sender_hash
  ON handshake_requests(sender_token_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT NOT NULL,
  bucket_hour INTEGER NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (key, bucket_hour)
);
