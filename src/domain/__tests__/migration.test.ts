import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration003 = readFileSync(
  new URL('../../../migrations/0003_stage2_hardening.sql', import.meta.url),
  'utf8'
);
const migration004 = readFileSync(
  new URL('../../../migrations/0004_expand_encrypted_coordination_note.sql', import.meta.url),
  'utf8'
);

describe('Stage 2 forward migration safety', () => {
  it('fails instead of silently ignoring rows while rebuilding campus_events', () => {
    expect(migration003).toContain('INSERT INTO campus_events_new (');
    expect(migration003).not.toMatch(
      /INSERT\\s+OR\\s+IGNORE\\s+INTO\\s+campus_events_new/i
    );
  });

  it('expands encrypted-note storage and copies handshake/report rows before table replacement', () => {
    expect(migration004).toMatch(
      /coordination_note TEXT NOT NULL CHECK \\(length\\(coordination_note\\) BETWEEN 5 AND 1500\\)/
    );
    expect(migration004).toContain('INSERT INTO pulse_cards_new');
    expect(migration004).toContain('FROM pulse_cards;');
    expect(migration004).toContain('INSERT INTO handshake_requests_new');
    expect(migration004).toContain('FROM handshake_requests;');
    expect(migration004).toContain('INSERT INTO card_reports_new');
    expect(migration004).toContain('FROM card_reports;');
    expect(migration004).toContain('DROP TABLE handshake_requests;');
    expect(migration004).toContain('DROP TABLE card_reports;');
    expect(migration004).toContain('DROP TABLE pulse_cards;');
  });
});
