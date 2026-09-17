import { describe, expect, it } from 'vitest';
import { istNavEintragAktiv } from './navAktiv';

describe('istNavEintragAktiv', () => {
  it('markiert den Eintrag auf seiner eigenen Route', () => {
    expect(istNavEintragAktiv('/stammdaten/zaehler', { to: '/stammdaten/zaehler' })).toBe(true);
  });

  it('markiert ihn auch auf Detail-Routen darunter', () => {
    expect(istNavEintragAktiv('/stammdaten/zaehler/abc-123', { to: '/stammdaten/zaehler' })).toBe(true);
    expect(istNavEintragAktiv('/stammdaten/zaehler/abc/messkanaele/neu', { to: '/stammdaten/zaehler' })).toBe(true);
  });

  it('vergleicht SEGMENTWEISE, nicht als reinen Zeichen-Präfix', () => {
    // Sonst würde `/stammdaten/zaehler` auch auf einer hypothetischen Route
    // `/stammdaten/zaehlerwerk` anschlagen.
    expect(istNavEintragAktiv('/stammdaten/zaehlerwerk', { to: '/stammdaten/zaehler' })).toBe(false);
  });

  it('markiert nicht bei einer fremden Route', () => {
    expect(istNavEintragAktiv('/stammdaten/endkunden', { to: '/stammdaten/zaehler' })).toBe(false);
  });

  it('berücksichtigt Zusatzpfade unter einem anderen Top-Level-Präfix', () => {
    // Der Kernfall: Ein Messkanal-Detail gehört fachlich zu „Zähler &
    // Messkanäle", liegt aber unter `/stammdaten/messkanaele/:id`.
    const eintrag = { to: '/stammdaten/zaehler', weiterePfade: ['/stammdaten/messkanaele'] };

    expect(istNavEintragAktiv('/stammdaten/messkanaele/abc-123', eintrag)).toBe(true);
    expect(istNavEintragAktiv('/stammdaten/systeme/abc-123', eintrag)).toBe(false);
  });

  it('markiert einen exakten Eintrag NUR auf seiner eigenen Route', () => {
    // Ohne `exakt` würde der Arbeitsplatz (`/`) als Präfix auf JEDER Route
    // passen und dauerhaft als aktiv erscheinen.
    expect(istNavEintragAktiv('/', { to: '/', exakt: true })).toBe(true);
    expect(istNavEintragAktiv('/stammdaten/endkunden', { to: '/', exakt: true })).toBe(false);
  });
});
