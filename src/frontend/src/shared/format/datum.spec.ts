import { describe, expect, it } from 'vitest';
import {
  formatiereDatum,
  formatiereKalenderdatum,
  formatiereZeitpunkt,
  formatiereZeitpunktOder,
  vonOrtszeitEingabe,
  zuOrtszeitEingabe,
} from './datum';

describe('datum (zentrale Datums-/Zeitformatierung)', () => {
  it('stellt einen UTC-Zeitstempel in deutscher Notation und Berliner Zeit dar', () => {
    // 14:32 UTC ist in Berliner SOMMERzeit (UTC+2) 16:32.
    expect(formatiereZeitpunkt('2026-08-26T14:32:11.000Z')).toBe('26.08.2026, 16:32');
  });

  it('berücksichtigt die Winterzeit (UTC+1) statt eines festen Offsets', () => {
    expect(formatiereZeitpunkt('2026-01-15T14:32:11.000Z')).toBe('15.01.2026, 15:32');
  });

  it('verschiebt das Datum, wenn der UTC-Zeitpunkt in Berlin bereits am Folgetag liegt', () => {
    // 23:30 UTC am 31.12. ist in Berlin bereits 00:30 am 01.01. — genau der
    // Fall, den eine naive `slice(0, 10)`-Darstellung falsch anzeigen würde.
    expect(formatiereZeitpunkt('2026-12-31T23:30:00.000Z')).toBe('01.01.2027, 00:30');
  });

  it('lässt bei `formatiereDatum` die Uhrzeit weg', () => {
    expect(formatiereDatum('2026-08-26T14:32:11.000Z')).toBe('26.08.2026');
  });

  it('interpretiert ein reines Kalenderdatum als UTC und verschiebt es NICHT auf den Vortag', () => {
    // "2026-08-01" parst als Mitternacht UTC. In Berliner Zeit formatiert wäre
    // das der 01.08. um 02:00 — hier korrekt, aber der Test sichert die
    // bewusste `timeZone: 'UTC'`-Wahl gegen eine spätere Vereinheitlichung ab.
    expect(formatiereKalenderdatum('2026-08-01')).toBe('01.08.2026');
  });

  it('gibt einen unparsbaren Wert unverändert zurück statt "Invalid Date" anzuzeigen', () => {
    expect(formatiereZeitpunkt('kein-datum')).toBe('kein-datum');
  });

  it('setzt bei `null`/`undefined` den fachlichen Ersatztext ein', () => {
    expect(formatiereZeitpunktOder(null, 'aktuell aktiv')).toBe('aktuell aktiv');
    expect(formatiereZeitpunktOder(undefined, 'aktuell aktiv')).toBe('aktuell aktiv');
    expect(formatiereZeitpunktOder('2026-08-26T14:32:11.000Z', 'aktuell aktiv')).toBe('26.08.2026, 16:32');
  });
});

describe('Ortszeit-Eingabe (datetime-local)', () => {
  it('liest eine Sommerzeit-Eingabe als Berliner Ortszeit (UTC+2)', () => {
    expect(vonOrtszeitEingabe('2026-08-26T16:32')).toBe('2026-08-26T14:32:00.000Z');
  });

  it('liest eine Winterzeit-Eingabe als Berliner Ortszeit (UTC+1)', () => {
    expect(vonOrtszeitEingabe('2026-01-15T09:00')).toBe('2026-01-15T08:00:00.000Z');
  });

  it('trifft den Offset auch unmittelbar nach der Umstellung im März', () => {
    // Die Uhr springt am 29.03.2026 um 02:00 auf 03:00. Der zweite Durchgang
    // in `vonOrtszeitEingabe` ist genau dafür da: Der aus der naiven Lesung
    // geschätzte Offset gilt hier noch nicht.
    expect(vonOrtszeitEingabe('2026-03-29T01:30')).toBe('2026-03-29T00:30:00.000Z');
    expect(vonOrtszeitEingabe('2026-03-29T03:30')).toBe('2026-03-29T01:30:00.000Z');
  });

  it('akzeptiert eine Eingabe mit Sekunden (manche Engines hängen sie an)', () => {
    expect(vonOrtszeitEingabe('2026-08-26T16:32:00')).toBe('2026-08-26T14:32:00.000Z');
  });

  it('weist alles ab, was kein vollständiger Zeitpunkt ist', () => {
    expect(vonOrtszeitEingabe('')).toBeUndefined();
    expect(vonOrtszeitEingabe('2026-08-26')).toBeUndefined();
    expect(vonOrtszeitEingabe('26.08.2026 16:32')).toBeUndefined();
  });

  it('belegt ein Eingabefeld mit der Berliner Ortszeit eines UTC-Zeitstempels vor', () => {
    expect(zuOrtszeitEingabe('2026-08-26T14:32:11.000Z')).toBe('2026-08-26T16:32');
    expect(zuOrtszeitEingabe('2026-01-15T08:00:00.000Z')).toBe('2026-01-15T09:00');
  });

  it('ist in beide Richtungen verlustfrei (Minutengenauigkeit)', () => {
    const utc = '2026-08-26T14:32:00.000Z';
    expect(vonOrtszeitEingabe(zuOrtszeitEingabe(utc))).toBe(utc);
  });

  it('wählt in der doppelt vorhandenen Herbst-Stunde die zweite (Winterzeit-)Lesung', () => {
    // Am 25.10.2026 springt die Uhr von 03:00 auf 02:00 zurück: „02:30" gibt
    // es an diesem Tag zweimal. Eine Wanduhr-Eingabe ohne Zeitzone kann das
    // nicht auflösen — die Umrechnung entscheidet sich für die zweite Lesung
    // (UTC+1). Der Test hält diese Wahl fest, damit sie nicht unbemerkt
    // kippt.
    expect(vonOrtszeitEingabe('2026-10-25T02:30')).toBe('2026-10-25T01:30:00.000Z');
  });

  it('liefert für einen unparsbaren Zeitstempel einen leeren Feldwert', () => {
    expect(zuOrtszeitEingabe('kein-datum')).toBe('');
  });
});
