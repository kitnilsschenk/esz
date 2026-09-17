import { describe, expect, it } from 'vitest';
import {
  einreichungVermerkenFormDefaultValues,
  einreichungVermerkenFormSchema,
  toEinreichungVermerkenPayload,
} from './einreichungFormSchema';

const JETZT = '2026-08-26T14:32:00.000Z';

const GUELTIG = {
  ...einreichungVermerkenFormDefaultValues(JETZT),
  art: 'verwendungsnachweis',
  uebermittlungsweg: 'bscw_manuell',
};

const VORGAENGER_ID = '0198c3aa-aaaa-7000-8000-000000000001';

describe('einreichungVermerkenFormSchema', () => {
  it('belegt den Übermittlungs-Zeitpunkt mit „jetzt" in Berliner Ortszeit vor', () => {
    expect(einreichungVermerkenFormDefaultValues(JETZT).uebermitteltAt).toBe('2026-08-26T16:32');
  });

  it('nimmt eine Erst-Einreichung ohne Korrektur-Angaben an', () => {
    expect(einreichungVermerkenFormSchema.safeParse(GUELTIG).success).toBe(true);
  });

  it('verlangt einen Korrekturgrund, sobald eine Einreichung abgelöst wird', () => {
    const ergebnis = einreichungVermerkenFormSchema.safeParse({ ...GUELTIG, ersetztEinreichungId: VORGAENGER_ID });
    expect(ergebnis.success).toBe(false);
    expect(ergebnis.error?.issues[0]?.path).toEqual(['korrekturGrundCode']);
  });

  it('lehnt einen Korrekturgrund ohne abgelöste Einreichung ab', () => {
    // Beide Felder gehören zusammen — die Datenbank erzwingt dieselbe
    // Kohärenz, hier fällt sie nur früher und sprechender auf.
    const ergebnis = einreichungVermerkenFormSchema.safeParse({ ...GUELTIG, korrekturGrundCode: 'messwert_korrektur' });
    expect(ergebnis.success).toBe(false);
    expect(ergebnis.error?.issues[0]?.path).toEqual(['korrekturGrundCode']);
  });

  it('nimmt eine vollständige Korrektur an', () => {
    const ergebnis = einreichungVermerkenFormSchema.safeParse({
      ...GUELTIG,
      ersetztEinreichungId: VORGAENGER_ID,
      korrekturGrundCode: 'messwert_korrektur',
    });
    expect(ergebnis.success).toBe(true);
  });

  it('weist eine Kennung ab, die keine gültige UUID ist', () => {
    expect(einreichungVermerkenFormSchema.safeParse({ ...GUELTIG, belegRef: 'irgendwas' }).success).toBe(false);
  });

  it('weist einen unvollständigen Zeitpunkt ab', () => {
    expect(einreichungVermerkenFormSchema.safeParse({ ...GUELTIG, uebermitteltAt: '2026-08-26' }).success).toBe(false);
  });

  it('sendet den Übermittlungs-Zeitpunkt als UTC', () => {
    expect(toEinreichungVermerkenPayload(GUELTIG).uebermitteltAt).toBe(JETZT);
  });

  it('lässt leere Optionalfelder weg, statt sie als leere Zeichenketten zu senden', () => {
    const payload = toEinreichungVermerkenPayload(GUELTIG);
    expect(payload).not.toHaveProperty('anfrageRef');
    expect(payload).not.toHaveProperty('belegRef');
    expect(payload).not.toHaveProperty('ersetztEinreichungId');
    expect(payload).not.toHaveProperty('korrekturGrundCode');
  });

  it('sendet Vorgänger und Korrekturgrund nur GEMEINSAM', () => {
    const payload = toEinreichungVermerkenPayload({
      ...GUELTIG,
      ersetztEinreichungId: VORGAENGER_ID,
      korrekturGrundCode: 'klima_revision',
    });
    expect(payload.ersetztEinreichungId).toBe(VORGAENGER_ID);
    expect(payload.korrekturGrundCode).toBe('klima_revision');
  });
});
