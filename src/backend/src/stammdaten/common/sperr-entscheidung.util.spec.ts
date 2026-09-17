import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ProblemDetailsException } from '../../common/exceptions/problem-details.exception';
import { entscheideSperre, pruefeNeuerhebungsEntscheidung } from './sperr-entscheidung.util';

/**
 * Faengt den erwarteten Problem-Details-Fehler TYPISIERT ab — 409 (Konflikt)
 * ebenso wie 400 (Eingabefehler, Auflage C-8). Der Name stammt aus der Zeit,
 * als es hier nur 409 gab; er bleibt, weil eine Umbenennung jede Zeile dieser
 * Datei anfasst, ohne etwas zu pruefen. `toThrowError(expect.
 * objectContaining(...))` waere kuerzer, liefert aber `any` (eslint
 * `no-unsafe-argument`) und prueft nur oberflaechlich — so laesst sich
 * zusaetzlich der Problem-Detail-Text pruefen.
 */
function fangeKonflikt(aufruf: () => unknown): ProblemDetailsException {
  try {
    aufruf();
  } catch (fehler: unknown) {
    if (fehler instanceof ProblemDetailsException) {
      return fehler;
    }
    throw fehler;
  }
  throw new Error('Erwartet wurde ein Problem-Details-Fehler — es wurde aber kein Fehler geworfen.');
}

/**
 * Die Matrix aus ADR-0007 A11.2. Diese Regel entscheidet fuer BEIDE
 * Subjektarten (Endkunde, Anschlussnutzer) — sie hier einmal vollstaendig zu
 * pruefen ist billiger und schaerfer, als sie in zwei Service-Specs je halb
 * abzudecken.
 */
describe('entscheideSperre (Art.-18-Sperre, ADR-0007 A11.2)', () => {
  it('sperrt ein aktives Subjekt', () => {
    expect(entscheideSperre({ verarbeitungsStatus: 'aktiv', einschraenkungGrundCode: null }, 'art18_1a_richtigkeit', 'Endkunde', null)).toBe(
      'sperren',
    );
  });

  it('quittiert idempotent, wenn derselbe Grund bereits gesetzt ist', () => {
    expect(
      entscheideSperre(
        { verarbeitungsStatus: 'gesperrt', einschraenkungGrundCode: 'art18_1d_widerspruch', neuerhebungFortsetzen: null },
        'art18_1d_widerspruch',
        'Endkunde',
        null,
      ),
    ).toBe('idempotent');
  });

  it('lehnt einen abweichenden Grund mit 409 ab, statt den bestehenden zu ueberschreiben', () => {
    expect(fangeKonflikt(() =>
      entscheideSperre(
        { verarbeitungsStatus: 'gesperrt', einschraenkungGrundCode: 'art18_1a_richtigkeit' },
        'art18_1d_widerspruch',
        'Endkunde', null,
      )
    ).getStatus()).toBe(HttpStatus.CONFLICT);
  });

  it('lehnt eine bestehende Sperre OHNE Grund mit 409 ab (Nacherfassung ist ein eigener Vorgang, A11.9)', () => {
    expect(fangeKonflikt(() =>
      entscheideSperre({ verarbeitungsStatus: 'gesperrt', einschraenkungGrundCode: null }, 'art18_1a_richtigkeit', 'Anschlussnutzer', null)
    ).getStatus()).toBe(HttpStatus.CONFLICT);
  });

  it('behandelt ein fehlendes Grund-Feld (undefined) wie einen fehlenden Grund — nicht wie eine Uebereinstimmung', () => {
    expect(fangeKonflikt(() =>
      entscheideSperre(
        { verarbeitungsStatus: 'gesperrt', einschraenkungGrundCode: undefined },
        'art18_1a_richtigkeit',
        'Anschlussnutzer', null,
      )
    ).getStatus()).toBe(HttpStatus.CONFLICT);
  });

  it('lehnt ein bereits geloeschtes Subjekt mit 409 ab, statt idempotent zu quittieren', () => {
    expect(fangeKonflikt(() =>
      entscheideSperre({ verarbeitungsStatus: 'geloescht', einschraenkungGrundCode: null }, 'art18_1a_richtigkeit', 'Endkunde', null)
    ).getStatus()).toBe(HttpStatus.CONFLICT);
  });

  // Die Meldung des Betriebs-Teams steht in `problemDetail` (RFC 9457), NICHT
  // in `message` — dort steht der Titel „Conflict".
  it('benennt das betroffene Subjekt im Problem-Detail', () => {
    expect(
      fangeKonflikt(() =>
        entscheideSperre({ verarbeitungsStatus: 'geloescht', einschraenkungGrundCode: null }, 'art18_1a_richtigkeit', 'Anschlussnutzer', null),
      ).problemDetail,
    ).toContain('Anschlussnutzer');
  });
  // ---- Auflage C-8 ---------------------------------------------------
  it('quittiert idempotent, wenn Grund UND Erhebungs-Entscheidung uebereinstimmen (C-8)', () => {
    expect(
      entscheideSperre(
        { verarbeitungsStatus: 'gesperrt', einschraenkungGrundCode: 'art18_1b_unrechtmaessig', neuerhebungFortsetzen: true },
        'art18_1b_unrechtmaessig',
        'Endkunde',
        true,
      ),
    ).toBe('idempotent');
  });

  it('lehnt eine abweichende Erhebungs-Entscheidung bei gleichem Grund mit 409 ab (C-8)', () => {
    const fehler = fangeKonflikt(() =>
      entscheideSperre(
        { verarbeitungsStatus: 'gesperrt', einschraenkungGrundCode: 'art18_1b_unrechtmaessig', neuerhebungFortsetzen: true },
        'art18_1b_unrechtmaessig',
        'Endkunde',
        false,
      ),
    );
    expect(fehler.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(fehler.problemDetail).toContain('Erhebung');
  });

  it('behandelt eine Bestandssperre ohne Entscheidung nicht als Zustimmung zur mitgelieferten (C-8)', () => {
    // Zeile aus der Zeit vor V0087: Grund lit. b gesetzt, Spalte NULL. Wer
    // jetzt `false` mitliefert, traegt nach — und das ist ein eigener
    // Vorgang, kein Wiederholungsaufruf des Sperrens.
    expect(
      fangeKonflikt(() =>
        entscheideSperre(
          { verarbeitungsStatus: 'gesperrt', einschraenkungGrundCode: 'art18_1b_unrechtmaessig' },
          'art18_1b_unrechtmaessig',
          'Endkunde',
          false,
        ),
      ).getStatus(),
    ).toBe(HttpStatus.CONFLICT);
  });
});

describe('pruefeNeuerhebungsEntscheidung (Auflage C-8)', () => {
  it('reicht die Entscheidung bei lit. b durch', () => {
    expect(pruefeNeuerhebungsEntscheidung('art18_1b_unrechtmaessig', false, 'Endkunde')).toBe(false);
  });

  it('reicht die Entscheidung bei lit. d durch', () => {
    expect(pruefeNeuerhebungsEntscheidung('art18_1d_widerspruch', true, 'Anschlussnutzer')).toBe(true);
  });

  it('liefert null bei lit. a — dort stellt sich die Frage nicht', () => {
    expect(pruefeNeuerhebungsEntscheidung('art18_1a_richtigkeit', undefined, 'Endkunde')).toBeNull();
  });

  it('liefert null bei lit. c — dort stellt sich die Frage nicht', () => {
    expect(pruefeNeuerhebungsEntscheidung('art18_1c_rechtsverteidigung_betroffener', undefined, 'Endkunde')).toBeNull();
  });

  it('verlangt bei lit. b eine Entscheidung und nennt den Grund dafuer', () => {
    const fehler = fangeKonflikt(() => pruefeNeuerhebungsEntscheidung('art18_1b_unrechtmaessig', undefined, 'Endkunde'));
    expect(fehler.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(fehler.problemDetail).toContain('neuerhebungFortsetzen');
  });

  it('verlangt bei lit. d eine Entscheidung', () => {
    expect(
      fangeKonflikt(() => pruefeNeuerhebungsEntscheidung('art18_1d_widerspruch', undefined, 'Anschlussnutzer')).getStatus(),
    ).toBe(HttpStatus.BAD_REQUEST);
  });

  it('verwirft eine Entscheidung bei lit. a NICHT still, sondern lehnt sie ab', () => {
    // Stilles Verwerfen waere der gefaehrlichere Weg: der Sachbearbeiter
    // glaubte, etwas dokumentiert zu haben, das nirgends steht.
    expect(
      fangeKonflikt(() => pruefeNeuerhebungsEntscheidung('art18_1a_richtigkeit', true, 'Endkunde')).getStatus(),
    ).toBe(HttpStatus.BAD_REQUEST);
  });

  it('lehnt auch ein `false` bei lit. c ab', () => {
    expect(
      fangeKonflikt(() => pruefeNeuerhebungsEntscheidung('art18_1c_rechtsverteidigung_betroffener', false, 'Endkunde')).getStatus(),
    ).toBe(HttpStatus.BAD_REQUEST);
  });
});
