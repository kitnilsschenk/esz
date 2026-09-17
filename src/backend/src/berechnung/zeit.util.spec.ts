import { describe, expect, it } from 'vitest';
import { enumerateDays, enumerateMonths, istMonatsanfang } from './zeit.util';

describe('enumerateMonths', () => {
  it('zerlegt volle Kalendermonate unveraendert', () => {
    const scheiben = enumerateMonths('2024-01-01', '2024-04-01');

    expect(scheiben.map((s) => s.monat)).toEqual(['2024-01-01', '2024-02-01', '2024-03-01']);
    expect(scheiben.map((s) => s.tageImZeitraum)).toEqual([31, 29, 31]);
    expect(scheiben.every((s) => !s.angeschnitten)).toBe(true);
  });

  it('schneidet den ERSTEN Monat an, wenn die Periode mitten im Monat beginnt', () => {
    // Ein Foerderjahr beginnt am Tag aus dem Bewilligungsbescheid, nicht am
    // Monatsersten (Technisches Merkblatt v2.2 Kap. 9.1).
    const scheiben = enumerateMonths('2018-10-12', '2018-12-01');

    expect(scheiben[0]).toEqual({
      monat: '2018-10-01',
      von: '2018-10-12',
      bis: '2018-11-01',
      tageImZeitraum: 20,
      angeschnitten: true,
    });
    expect(scheiben[1]?.angeschnitten).toBe(false);
  });

  it('schneidet den LETZTEN Monat an', () => {
    const scheiben = enumerateMonths('2019-09-01', '2019-10-12');

    expect(scheiben.at(-1)).toEqual({
      monat: '2019-10-01',
      von: '2019-10-01',
      bis: '2019-10-12',
      tageImZeitraum: 11,
      angeschnitten: true,
    });
  });

  it('bildet ein Foerderjahr vom 12.10. bis 11.10. auf 13 Scheiben ab', () => {
    // 11 volle Monate plus zwei angeschnittene Raender — zusammen 365 Tage.
    const scheiben = enumerateMonths('2018-10-12', '2019-10-12');

    expect(scheiben).toHaveLength(13);
    expect(scheiben.filter((s) => s.angeschnitten)).toHaveLength(2);
    expect(scheiben.reduce((summe, s) => summe + s.tageImZeitraum, 0)).toBe(365);
  });

  it('behaelt den Monatsersten als Kennung — er ist der Primaerschluessel-Anteil', () => {
    const scheiben = enumerateMonths('2018-10-12', '2018-11-01');

    expect(scheiben[0]?.monat).toBe('2018-10-01');
    expect(scheiben[0]?.von).toBe('2018-10-12');
  });

  it('laesst zwei Foerderjahre denselben Kalendermonat teilen, ohne dass sie sich ueberlappen', () => {
    // Der Oktober gehoert beiden — dem einen bis zum 11., dem anderen ab dem 12.
    const fj1 = enumerateMonths('2018-10-12', '2019-10-12');
    const fj2 = enumerateMonths('2019-10-12', '2020-10-12');

    const oktoberFj1 = fj1.find((s) => s.monat === '2019-10-01');
    const oktoberFj2 = fj2.find((s) => s.monat === '2019-10-01');

    expect(oktoberFj1).toMatchObject({ von: '2019-10-01', bis: '2019-10-12', tageImZeitraum: 11 });
    expect(oktoberFj2).toMatchObject({ von: '2019-10-12', bis: '2019-11-01', tageImZeitraum: 20 });
    // Zusammen ergeben sie den vollen Monat, ohne einen Tag doppelt zu zaehlen.
    expect((oktoberFj1?.tageImZeitraum ?? 0) + (oktoberFj2?.tageImZeitraum ?? 0)).toBe(31);
  });

  it('vertraegt eine Periode aus einem einzigen Tag', () => {
    const scheiben = enumerateMonths('2024-02-29', '2024-03-01');

    expect(scheiben).toHaveLength(1);
    expect(scheiben[0]).toMatchObject({ monat: '2024-02-01', tageImZeitraum: 1, angeschnitten: true });
  });

  it('liefert nichts fuer ein leeres Intervall', () => {
    expect(enumerateMonths('2024-01-01', '2024-01-01')).toEqual([]);
  });
});

describe('enumerateDays', () => {
  it('zaehlt die Tage eines halboffenen Intervalls', () => {
    expect(enumerateDays('2024-02-28', '2024-03-01')).toEqual(['2024-02-28', '2024-02-29']);
  });
});

describe('istMonatsanfang', () => {
  it('erkennt den Monatsersten', () => {
    expect(istMonatsanfang('2024-03-01')).toBe(true);
    expect(istMonatsanfang('2024-03-02')).toBe(false);
  });
});
