import { describe, expect, it } from 'vitest';
import {
  foerderjahrAnlegenFormDefaultValues,
  foerderjahrAnlegenFormSchema,
  toFoerderjahrAnlegenPayload,
} from './foerderjahrFormSchema';

const GUELTIG = {
  ...foerderjahrAnlegenFormDefaultValues,
  code: 'FJ-2027',
  vorhabenRef: 'AZ-4711',
  nummer: '2',
  vonMonat: '2027-01-01',
  bisMonat: '2027-12-01',
  definitionQuelle: 'kalenderjahr',
};

describe('foerderjahrAnlegenFormSchema', () => {
  it('nimmt ein vollständig ausgefülltes Formular an', () => {
    expect(foerderjahrAnlegenFormSchema.safeParse(GUELTIG).success).toBe(true);
  });

  it('verlangt für beide Monatsgrenzen den Monatsersten', () => {
    const ergebnis = foerderjahrAnlegenFormSchema.safeParse({ ...GUELTIG, vonMonat: '2027-01-15' });
    expect(ergebnis.success).toBe(false);
    expect(ergebnis.error?.issues[0]?.message).toBe('Bitte den ersten Tag des Monats wählen.');
  });

  it('weist einen Zeitraum ab, dessen Ende vor seinem Anfang liegt', () => {
    const ergebnis = foerderjahrAnlegenFormSchema.safeParse({ ...GUELTIG, bisMonat: '2026-12-01' });
    expect(ergebnis.success).toBe(false);
    // Der Fehler hängt am zweiten Feld — dort steht die Eingabe, die zu
    // korrigieren ist, und dorthin wandert der Fokus.
    expect(ergebnis.error?.issues[0]?.path).toEqual(['bisMonat']);
  });

  it('lässt einen Ein-Monats-Zeitraum zu (Anfang = Ende, beide inklusive)', () => {
    expect(foerderjahrAnlegenFormSchema.safeParse({ ...GUELTIG, bisMonat: '2027-01-01' }).success).toBe(true);
  });

  it('laesst die Tagesfelder leer — ein Kalenderjahr braucht sie nicht', () => {
    expect(foerderjahrAnlegenFormSchema.safeParse(GUELTIG).success).toBe(true);
    expect(toFoerderjahrAnlegenPayload(GUELTIG)).not.toHaveProperty('vonTag');
    expect(toFoerderjahrAnlegenPayload(GUELTIG)).not.toHaveProperty('bisTag');
  });

  it('nimmt taggenaue Grenzen an, wenn sie in den genannten Monaten liegen', () => {
    // Bewilligungszeitraum 12.01. bis 11.04. — bisTag ist der Tag DANACH.
    const werte = { ...GUELTIG, vonMonat: '2027-01-01', bisMonat: '2027-04-01', vonTag: '2027-01-12', bisTag: '2027-04-12' };

    expect(foerderjahrAnlegenFormSchema.safeParse(werte).success).toBe(true);
    expect(toFoerderjahrAnlegenPayload(werte)).toMatchObject({ vonTag: '2027-01-12', bisTag: '2027-04-12' });
  });

  it('lehnt eine halbe Tagesangabe ab — eine Grenze waere gerundet', () => {
    expect(foerderjahrAnlegenFormSchema.safeParse({ ...GUELTIG, vonTag: '2027-01-12' }).success).toBe(false);
    expect(foerderjahrAnlegenFormSchema.safeParse({ ...GUELTIG, bisTag: '2027-04-12' }).success).toBe(false);
  });

  it('lehnt Tage ab, die nicht in den genannten Monaten liegen', () => {
    // Sonst wiese die Liste einen anderen Zeitraum aus, als der Nachweis rechnet.
    const werte = { ...GUELTIG, vonMonat: '2027-01-01', bisMonat: '2027-04-01', vonTag: '2027-03-12', bisTag: '2027-06-12' };

    expect(foerderjahrAnlegenFormSchema.safeParse(werte).success).toBe(false);
  });

  it('rechnet fuer die Monatspruefung auf den LETZTEN enthaltenen Tag zurueck', () => {
    // bisTag 01.05. heisst: letzter Tag ist der 30.04. — also gehoert es zum
    // April, nicht zum Mai. Ohne diese Ruecksicht laege jedes Foerderjahr,
    // das an einem Monatsersten endet, einen Monat daneben.
    const werte = { ...GUELTIG, vonMonat: '2027-01-01', bisMonat: '2027-04-01', vonTag: '2027-01-01', bisTag: '2027-05-01' };

    expect(foerderjahrAnlegenFormSchema.safeParse(werte).success).toBe(true);
  });

  it('lehnt einen Zeitraum ab, dessen Ende vor dem Beginn liegt', () => {
    const werte = { ...GUELTIG, vonMonat: '2027-01-01', bisMonat: '2027-01-01', vonTag: '2027-01-20', bisTag: '2027-01-10' };

    expect(foerderjahrAnlegenFormSchema.safeParse(werte).success).toBe(false);
  });

  it('lehnt eine Kennung mit unzulässigen Zeichen ab', () => {
    expect(foerderjahrAnlegenFormSchema.safeParse({ ...GUELTIG, code: 'FJ 2027' }).success).toBe(false);
  });

  it('hält das Projektjahr im zulässigen Bereich', () => {
    expect(foerderjahrAnlegenFormSchema.safeParse({ ...GUELTIG, nummer: '0' }).success).toBe(false);
    expect(foerderjahrAnlegenFormSchema.safeParse({ ...GUELTIG, nummer: '21' }).success).toBe(false);
    expect(foerderjahrAnlegenFormSchema.safeParse({ ...GUELTIG, nummer: '1,5' }).success).toBe(false);
  });

  it('wandelt das Projektjahr im Payload in eine Zahl', () => {
    expect(toFoerderjahrAnlegenPayload(GUELTIG).nummer).toBe(2);
  });

  it('lässt den optionalen Bescheid-Verweis weg, statt ihn leer zu senden', () => {
    expect(toFoerderjahrAnlegenPayload(GUELTIG)).not.toHaveProperty('bescheidRef');
    expect(toFoerderjahrAnlegenPayload({ ...GUELTIG, bescheidRef: ' AZ-99 ' }).bescheidRef).toBe('AZ-99');
  });
});
