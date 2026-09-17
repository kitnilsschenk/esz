import { describe, expect, it } from 'vitest';
import { formatiereRelativeZeit } from './relativeZeit';

const JETZT = new Date('2026-07-21T12:00:00.000Z');

describe('formatiereRelativeZeit', () => {
  it('formatiert unter einer Minute als "gerade eben"', () => {
    expect(formatiereRelativeZeit('2026-07-21T11:59:45.000Z', JETZT)).toBe('gerade eben');
  });

  it('formatiert Differenzen unter einer Stunde in Minuten', () => {
    expect(formatiereRelativeZeit('2026-07-21T11:45:00.000Z', JETZT)).toBe('vor 15 Min.');
  });

  it('formatiert Differenzen unter einem Tag in Stunden', () => {
    expect(formatiereRelativeZeit('2026-07-21T09:00:00.000Z', JETZT)).toBe('vor 3 Std.');
  });

  it('formatiert Differenzen ab einem Tag in Tagen', () => {
    expect(formatiereRelativeZeit('2026-07-18T12:00:00.000Z', JETZT)).toBe('vor 3 Tagen');
  });
});
