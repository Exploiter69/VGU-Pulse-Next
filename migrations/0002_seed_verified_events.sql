-- Migration 0002: Non-deceptive orientation & portal calendar milestones
-- Does NOT insert fake student requests or fabricated club attendance numbers.

INSERT OR IGNORE INTO campus_events (
  id,
  title,
  organizer,
  category,
  date_label,
  time_label,
  venue,
  registration_url,
  verification_source,
  going_count,
  looking_for_buddy_count,
  status,
  created_at
) VALUES
(
  'evt-academic-abc-verification',
  'UGC Academic Bank of Credits (ABC ID) & DigiLocker Verification Window',
  'Academic Administration Reference',
  'Seminar',
  'Ongoing Semester Requirement',
  'Portal Open 24x7',
  'Online via abc.gov.in',
  'https://www.abc.gov.in',
  'Official VGU Link',
  0,
  0,
  'published',
  '2026-10-15T00:00:00.000Z'
),
(
  'evt-aicte-internship-drive',
  'AICTE National Internship Portal — Semester Registration & Skill Track',
  'AICTE Portal Reference',
  'Workshop',
  'Open Rolling Applications',
  'Self-Paced',
  'Online via internship.aicte-india.org',
  'https://internship.aicte-india.org',
  'Official VGU Link',
  0,
  0,
  'published',
  '2026-10-15T00:01:00.000Z'
);
