import { describe, expect, it } from 'vitest';
import {
  istSkalensprungVerdacht,
  SKALENSPRUNG_AUSREISSER_FAKTOR,
  SKALENSPRUNG_MIN_STANDVERHAELTNIS,
  SKALENSPRUNG_MIN_STUETZSTELLEN,
  SKALENSPRUNG_REIFE_INTERVALLE,
} from './skalensprung.util';

/**
 * Baut eine Historie eines kumulativen Zaehlers, absteigend nach ts
 * (juengster zuerst) — so, wie das Repository sie liefert.
 *
 * @param stand      Stand des juengsten Wertes.
 * @param zuwachs    Zuwachs je Intervall.
 * @param anzahl     Anzahl der Werte.
 */
function historie(stand: number, zuwachs: number, anzahl: number): number[] {
  return Array.from({ length: anzahl }, (_, i) => stand - i * zuwachs);
}

describe('istSkalensprungVerdacht (ADR-0011 O3 Punkt 3)', () => {
  // Ein Jahr Betrieb bei 15-Minuten-Werten und 20 kWh je Intervall:
  // Stand 700.800 kWh. Weit ueber der Reifeschwelle.
  const GEREIFT = historie(700_800, 20, 40);

  it('schlaegt bei einer Verdopplung des Wandlerfaktors an', () => {
    const verdacht = istSkalensprungVerdacht({ wertNeu: 700_800 * 2, letzteWerte: GEREIFT });

    expect(verdacht).toBe(true);
  });

  it('schlaegt bei der engsten realen Wandlerstufe an (750/800 A = 1,067)', () => {
    const verdacht = istSkalensprungVerdacht({ wertNeu: 700_800 * (800 / 750), letzteWerte: GEREIFT });

    expect(verdacht).toBe(true);
  });

  it('laesst den normalen Betrieb durch', () => {
    const verdacht = istSkalensprungVerdacht({ wertNeu: 700_820, letzteWerte: GEREIFT });

    expect(verdacht).toBe(false);
  });

  it('laesst eine Lastspitze durch, solange sie als Verbrauch erklaerbar bleibt', () => {
    // Das Neunzehnfache der Erwartung — unter dem Ausreisser-Faktor.
    const spitze = 700_800 + (SKALENSPRUNG_AUSREISSER_FAKTOR - 1) * 20;

    const verdacht = istSkalensprungVerdacht({ wertNeu: spitze, letzteWerte: GEREIFT });

    expect(verdacht).toBe(false);
  });

  it('laesst einen grossen Ausreisser durch, der den Zaehlerstand kaum bewegt', () => {
    // Deutlich ueber dem Ausreisser-Faktor (Bedingung 2 erfuellt), aber weit
    // unter dem Standverhaeltnis (Bedingung 3 nicht erfuellt): So sieht ein
    // echter Verbrauchsausschlag aus, kein Faktorwechsel.
    const ausreisser = 700_800 + 100 * 20;

    const verdacht = istSkalensprungVerdacht({ wertNeu: ausreisser, letzteWerte: GEREIFT });

    expect(ausreisser / 700_800).toBeLessThan(SKALENSPRUNG_MIN_STANDVERHAELTNIS);
    expect(verdacht).toBe(false);
  });

  it('schweigt vor Ablauf der Betriebsreife', () => {
    // Stand knapp unter Reife x Erwartung: der Zaehler laeuft noch keinen Tag.
    const jung = historie((SKALENSPRUNG_REIFE_INTERVALLE - 1) * 20, 20, 40);

    const verdacht = istSkalensprungVerdacht({ wertNeu: jung[0]! * 2, letzteWerte: jung });

    expect(verdacht).toBe(false);
  });

  it('schweigt ohne genuegend Stuetzstellen', () => {
    const kurz = historie(700_800, 20, SKALENSPRUNG_MIN_STUETZSTELLEN);
    // `SKALENSPRUNG_MIN_STUETZSTELLEN` Werte ergeben nur so viele MINUS EINS
    // Zuwaechse — eine Stuetzstelle zu wenig.
    expect(kurz).toHaveLength(SKALENSPRUNG_MIN_STUETZSTELLEN);

    const verdacht = istSkalensprungVerdacht({ wertNeu: 700_800 * 2, letzteWerte: kurz });

    expect(verdacht).toBe(false);
  });

  it('laesst sich von einem einzelnen Ausreisser in der Historie nicht anheben', () => {
    // Ein Mittelwert wuerde durch diesen einen Wert um Groessenordnungen
    // steigen und den nachfolgenden Sprung durchlassen; der Median nicht.
    const mitAusreisser = [...GEREIFT];
    mitAusreisser[20] = mitAusreisser[20]! - 500_000;

    const verdacht = istSkalensprungVerdacht({ wertNeu: 700_800 * 2, letzteWerte: mitAusreisser });

    expect(verdacht).toBe(true);
  });

  it('urteilt nicht ueber einen Sprung nach unten (das ist Sache der Monotonie)', () => {
    const verdacht = istSkalensprungVerdacht({ wertNeu: 700_800 / 2, letzteWerte: GEREIFT });

    expect(verdacht).toBe(false);
  });

  it('urteilt nicht ueber einen stillstehenden Zaehler', () => {
    const still = historie(700_800, 0, 40);

    const verdacht = istSkalensprungVerdacht({ wertNeu: 700_800 * 2, letzteWerte: still });

    expect(verdacht).toBe(false);
  });

  it('urteilt nicht ohne Vorgaenger', () => {
    const verdacht = istSkalensprungVerdacht({ wertNeu: 1_000, letzteWerte: [] });

    expect(verdacht).toBe(false);
  });

  it('urteilt nicht bei einem Vorgaenger von 0 (kein Standverhaeltnis bildbar)', () => {
    const verdacht = istSkalensprungVerdacht({ wertNeu: 1_000, letzteWerte: [0, 0, 0] });

    expect(verdacht).toBe(false);
  });

  it('urteilt nicht ueber einen nicht-endlichen Wert', () => {
    const verdacht = istSkalensprungVerdacht({ wertNeu: Number.POSITIVE_INFINITY, letzteWerte: GEREIFT });

    expect(verdacht).toBe(false);
  });
});
