import { describe, expect, it } from 'vitest';
import {
  EINSPARLAUF_AUSLOESER_WERTE,
  einsparlaufAnlegenFormDefaultValues,
  einsparlaufAnlegenFormSchema,
  toEinsparlaufAnlegenPayload,
} from './einsparlaufFormSchema';

const KONTEXT = {
  foerderjahrId: '0198c3aa-aaaa-7000-8000-000000000001',
  preflightId: '0198c3bb-bbbb-7000-8000-000000000002',
};

describe('einsparlaufAnlegenFormSchema', () => {
  it('bietet „automatisch (Job)" NICHT als Auslöser an', () => {
    // Der Wert kennzeichnet einen serverseitig angestoßenen Lauf. In einer
    // Maske, die ein Mensch bedient, ließe sich damit die Herkunft eines
    // Nachweis-Laufs falsch beurkunden.
    expect(EINSPARLAUF_AUSLOESER_WERTE).toEqual(['manuell', 'korrektur']);
  });

  it('ist mit „manuell" vorbelegt', () => {
    expect(einsparlaufAnlegenFormDefaultValues.ausloeser).toBe('manuell');
  });

  it('verlangt eine Art', () => {
    expect(einsparlaufAnlegenFormSchema.safeParse(einsparlaufAnlegenFormDefaultValues).success).toBe(false);
  });

  it('ergänzt Förderjahr und Prüfung aus dem Kontext, nicht aus dem Formular', () => {
    const payload = toEinsparlaufAnlegenPayload(
      { art: 'foerderjahr_nachweis', ausloeser: 'manuell', ersetztEinsparlaufId: '' },
      KONTEXT,
    );
    expect(payload.foerderjahrId).toBe(KONTEXT.foerderjahrId);
    expect(payload.preflightId).toBe(KONTEXT.preflightId);
    expect(payload).not.toHaveProperty('ersetztEinsparlaufId');
  });

  it('sendet den abgelösten Lauf nur, wenn einer gewählt wurde', () => {
    const payload = toEinsparlaufAnlegenPayload(
      { art: 'zwischenstand', ausloeser: 'korrektur', ersetztEinsparlaufId: KONTEXT.foerderjahrId },
      KONTEXT,
    );
    expect(payload.ersetztEinsparlaufId).toBe(KONTEXT.foerderjahrId);
  });
});
