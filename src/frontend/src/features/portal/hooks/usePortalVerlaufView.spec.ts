import { describe, expect, it } from 'vitest';
import { monatLabel } from './usePortalVerlaufView';

describe('monatLabel', () => {
  it('schreibt den Monat aus — das hier liest kein Betriebsmensch', () => {
    expect(monatLabel('2026-08-01')).toBe('August 2026');
    expect(monatLabel('2026-01-01')).toBe('Januar 2026');
    expect(monatLabel('2026-12-01')).toBe('Dezember 2026');
  });

  it('faellt bei einem unerwarteten Wert auf die Datumsformatierung zurueck, statt leer zu bleiben', () => {
    // Ein Monat ausserhalb 1..12 kann aus der API nicht kommen; ein leeres
    // Feld waere trotzdem die schlechteste Antwort darauf.
    expect(monatLabel('2026-13-01')).not.toBe('');
  });
});
