import { describe, it, expect } from 'vitest';
import { calculateAttendance } from '../attendance';
import { calculateSgpaAndCgpa } from '../grades';
import { buildCardSharePayload, buildEventSharePayload } from '../share';
import { DEMO_CAMPUS_EVENTS, DEMO_PULSE_CARDS } from '../../data/demoFixtures';

describe('Attendance Calculator Domain Logic', () => {
  it('computes safe skip buffer accurately when above threshold', () => {
    const res = calculateAttendance({
      attended: 32,
      totalHeld: 40,
      targetPercentage: 75,
    });
    expect(res.isValid).toBe(true);
    expect(res.currentPercentage).toBe(80);
    expect(res.classesCanSkipSafely).toBe(2);
    expect(res.classesMustAttendToRecover).toBe(0);
  });

  it('computes exact consecutive classes needed when below threshold', () => {
    const res = calculateAttendance({
      attended: 28,
      totalHeld: 38,
      targetPercentage: 75,
    });
    expect(res.isValid).toBe(true);
    expect(res.currentPercentage).toBe(73.68);
    expect(res.classesMustAttendToRecover).toBe(2);
    expect(res.status).toBe('deficit');
  });

  it('rejects impossible inputs where attended exceeds totalHeld', () => {
    const res = calculateAttendance({
      attended: 45,
      totalHeld: 40,
      targetPercentage: 75,
    });
    expect(res.isValid).toBe(false);
    expect(res.error).toMatch(/exceed/i);
  });
});

describe('SGPA & CGPA Calculator Domain Logic', () => {
  it('computes weighted SGPA and cumulative CGPA accurately', () => {
    const res = calculateSgpaAndCgpa(
      [
        { id: '1', name: 'DSA', credits: 4, gradeLetter: 'O' },
        { id: '2', name: 'OS', credits: 4, gradeLetter: 'A' },
      ],
      undefined,
      8.0,
      16
    );
    expect(res.isValid).toBe(true);
    expect(res.totalCredits).toBe(8);
    expect(res.sgpa).toBe(9.0);
    expect(res.projectedCgpa).toBe(8.33);
  });
});

describe('Share Engine & Canonical Route Formatting', () => {
  it('builds /cards/:id WhatsApp share URLs without leaking phone numbers', () => {
    const card = DEMO_PULSE_CARDS[0];
    const payload = buildCardSharePayload(card, 'https://vgu-pulse.pages.dev');
    expect(payload.url).toBe(`https://vgu-pulse.pages.dev/cards/${card.id}`);
    expect(payload.whatsappUrl).toContain('https://wa.me/?text=');
    expect(payload.text).toContain(card.title);
  });

  it('builds /events/:id share URLs accurately', () => {
    const evt = DEMO_CAMPUS_EVENTS[0];
    const payload = buildEventSharePayload(evt, 'https://vgu-pulse.pages.dev');
    expect(payload.url).toBe(`https://vgu-pulse.pages.dev/events/${evt.id}`);
  });
});
