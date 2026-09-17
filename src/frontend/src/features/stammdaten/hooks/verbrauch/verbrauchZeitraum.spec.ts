import { describe, expect, it } from 'vitest';
import {
  berechneAnfrageZeitraum,
  datumVerschieben,
  erzeugeBucketZeitpunkte,
  formatiereBucket,
  formatiereWert,
  monatVerschieben,
  standardZeitraumFuer,
} from './verbrauchZeitraum';

describe('datumVerschieben / monatVerschieben', () => {
  it('verschiebt Tage UTC-sicher über eine Monatsgrenze hinweg', () => {
    expect(datumVerschieben('2026-03-01', -1)).toBe('2026-02-28');
    expect(datumVerschieben('2026-07-24', 7)).toBe('2026-07-31');
  });

  it('verschiebt Monate und behandelt Schaltjahre korrekt', () => {
    expect(monatVerschieben('2026-03-15', -1)).toBe('2026-02-15');
    expect(monatVerschieben('2024-01-31', 1)).toBe('2024-03-02'); // JS-Date-Überlauf-Semantik (Februar hat 29 Tage 2024)
  });
});

describe('standardZeitraumFuer', () => {
  it('liefert je Auflösung eine sinnvolle Default-Fensterbreite', () => {
    expect(standardZeitraumFuer('stunde', '2026-07-24')).toEqual({ von: '2026-07-21', bis: '2026-07-24' });
    expect(standardZeitraumFuer('tag', '2026-07-24')).toEqual({ von: '2026-06-24', bis: '2026-07-24' });
    expect(standardZeitraumFuer('monat', '2026-07-24')).toEqual({ von: '2025-07-24', bis: '2026-07-24' });
  });
});

describe('berechneAnfrageZeitraum', () => {
  it('normalisiert Tag/Stunde auf UTC-Mitternacht, `bis` EXKLUSIV (Folgetag)', () => {
    expect(berechneAnfrageZeitraum('2026-07-01', '2026-07-03', 'tag')).toEqual({
      von: '2026-07-01T00:00:00.000Z',
      bis: '2026-07-04T00:00:00.000Z',
    });
    expect(berechneAnfrageZeitraum('2026-07-01', '2026-07-03', 'stunde')).toEqual({
      von: '2026-07-01T00:00:00.000Z',
      bis: '2026-07-04T00:00:00.000Z',
    });
  });

  it('rundet bei Monatsauflösung IMMER auf volle Kalendermonate auf — auch bei einem Tag mitten im Monat', () => {
    expect(berechneAnfrageZeitraum('2026-03-15', '2026-05-02', 'monat')).toEqual({
      von: '2026-03-01T00:00:00.000Z',
      bis: '2026-06-01T00:00:00.000Z',
    });
  });
});

describe('erzeugeBucketZeitpunkte', () => {
  it('erzeugt stündliche Buckets im halboffenen Intervall [von, bis)', () => {
    const buckets = erzeugeBucketZeitpunkte('2026-03-01T10:00:00.000Z', '2026-03-01T13:00:00.000Z', 'stunde');
    expect(buckets).toEqual([
      '2026-03-01T10:00:00.000Z',
      '2026-03-01T11:00:00.000Z',
      '2026-03-01T12:00:00.000Z',
    ]);
  });

  it('erzeugt tägliche Buckets über eine Monatsgrenze hinweg', () => {
    const buckets = erzeugeBucketZeitpunkte('2026-01-30T00:00:00.000Z', '2026-02-02T00:00:00.000Z', 'tag');
    expect(buckets).toEqual(['2026-01-30T00:00:00.000Z', '2026-01-31T00:00:00.000Z', '2026-02-01T00:00:00.000Z']);
  });

  it('erzeugt monatliche Buckets an Kalendermonatsgrenzen (matcht `time_bucket(\'1 month\', …)`)', () => {
    const buckets = erzeugeBucketZeitpunkte('2026-01-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z', 'monat');
    expect(buckets).toEqual(['2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z']);
  });

  it('liefert eine leere Liste, wenn `von >= bis`', () => {
    expect(erzeugeBucketZeitpunkte('2026-03-02T00:00:00.000Z', '2026-03-01T00:00:00.000Z', 'tag')).toEqual([]);
  });
});

describe('formatiereBucket', () => {
  it('formatiert je Auflösung unterschiedlich (de-DE, UTC)', () => {
    expect(formatiereBucket('2026-07-24T14:00:00.000Z', 'stunde')).toBe('24.07.2026, 14:00');
    expect(formatiereBucket('2026-07-24T00:00:00.000Z', 'tag')).toBe('24.07.2026');
    expect(formatiereBucket('2026-07-01T00:00:00.000Z', 'monat')).toBe('Juli 2026');
  });
});

describe('formatiereWert', () => {
  it('formatiert Zahlen de-DE mit höchstens zwei Nachkommastellen', () => {
    expect(formatiereWert(1234.5)).toBe('1.234,5');
    expect(formatiereWert(10)).toBe('10');
  });
});
