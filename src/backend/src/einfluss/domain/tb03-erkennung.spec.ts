import { describe, expect, it } from 'vitest';
import { erkenneTb03 } from './tb03-erkennung';
import type { Tb03Intervall } from './tb03-erkennung';
import type { Tb03DauerRegel, Tb03ProzentRegel } from './tb03-regel';

/**
 * Die Regeln werden hier so gebaut, wie `leseTb03Regel()` sie aus dem Katalog
 * liefert (V0079-Seed) — die Zahlen stehen bewusst NICHT im Produktivcode,
 * nur in Migration und Test.
 */
const PERSONENANZAHL: Tb03ProzentRegel = {
  groesseCode: 'personenanzahl',
  schwellwertCode: 'tb03.personenanzahl.50pct_halbjahr.v2022',
  art: 'prozent',
  wertProzent: 50,
  vergleich: 'gt',
  mindestdauerMonate: 6,
  dauerVergleich: 'gt',
  fassung: 'Merkblatt Technik v2.2, Stand 12.09.2022',
  fassungsvorbehalt: true,
};

const NUTZFLAECHE: Tb03ProzentRegel = {
  ...PERSONENANZAHL,
  groesseCode: 'nutzflaeche',
  schwellwertCode: 'tb03.nutzflaeche.10pct_halbjahr.v2022',
  wertProzent: 10,
  vergleich: 'gte',
};

const NUTZUNGSZWECK: Tb03DauerRegel = {
  groesseCode: 'nutzungszweck',
  schwellwertCode: 'tb03.nutzungszweck.6monate.v2022',
  art: 'dauer',
  mindestdauerMonate: 6,
  dauerVergleich: 'gte',
  fassung: 'Merkblatt Technik v2.2, Stand 12.09.2022',
  fassungsvorbehalt: true,
};

const ANKER_MONAT = '2019-10-01';
const LAUF_MONAT = '2026-09-01';

function intervall(
  gueltigAbMonat: string,
  gueltigBisMonat: string | null,
  wert: { num?: number; code?: string },
): Tb03Intervall {
  return {
    gueltigAbMonat,
    gueltigBisMonat,
    wertNum: wert.num ?? null,
    wertCode: wert.code ?? null,
  };
}

describe('erkenneTb03 — Baseline-Bezug (A16)', () => {
  it('erzeugt keinen Befund, wenn zum Ankermonat kein Intervall galt', () => {
    const intervalle = [intervall('2021-01-01', null, { num: 40 })];

    const ergebnis = erkenneTb03({
      regel: PERSONENANZAHL,
      ankerMonat: ANKER_MONAT,
      intervalle,
      laufMonat: LAUF_MONAT,
    });

    expect(ergebnis.kandidaten).toHaveLength(0);
    expect(ergebnis.skipGrund).toBe('kein_anker');
  });

  it('misst gegen den Baseline-Wert, nicht gegen das Vorintervall', () => {
    // Drei Schritte von je +20 % gegen den Vorgänger — gegen das Vorintervall
    // löste keiner aus, gegen die Baseline (10 -> 17,28 = +72,8 %) schon.
    const intervalle = [
      intervall('2019-01-01', '2021-01-01', { num: 10 }),
      intervall('2021-01-01', '2022-01-01', { num: 12 }),
      intervall('2022-01-01', '2023-01-01', { num: 14.4 }),
      intervall('2023-01-01', null, { num: 17.28 }),
    ];

    const ergebnis = erkenneTb03({
      regel: PERSONENANZAHL,
      ankerMonat: ANKER_MONAT,
      intervalle,
      laufMonat: LAUF_MONAT,
    });

    expect(ergebnis.kandidaten.map((k) => k.zeitraumVon)).toEqual(['2023-01-01']);
  });

  it('erzeugt keinen Befund bei einem Ausgangswert von null', () => {
    const intervalle = [
      intervall('2019-01-01', '2022-01-01', { num: 0 }),
      intervall('2022-01-01', null, { num: 25 }),
    ];

    const ergebnis = erkenneTb03({
      regel: NUTZFLAECHE,
      ankerMonat: ANKER_MONAT,
      intervalle,
      laufMonat: LAUF_MONAT,
    });

    expect(ergebnis.kandidaten).toHaveLength(0);
    expect(ergebnis.skipGrund).toBe('ausgangswert_nicht_teilbar');
  });
});

describe('erkenneTb03 — Strenge der Schwellen', () => {
  it('loest bei Personenanzahl erst oberhalb von 50 Prozent aus', () => {
    const genauFuenfzig = [
      intervall('2019-01-01', '2022-01-01', { num: 10 }),
      intervall('2022-01-01', null, { num: 15 }),
    ];

    expect(
      erkenneTb03({
        regel: PERSONENANZAHL,
        ankerMonat: ANKER_MONAT,
        intervalle: genauFuenfzig,
        laufMonat: LAUF_MONAT,
      }).kandidaten,
    ).toHaveLength(0);
  });

  it('loest bei Nutzflaeche bereits bei genau 10 Prozent aus', () => {
    const genauZehn = [
      intervall('2019-01-01', '2022-01-01', { num: 100 }),
      intervall('2022-01-01', null, { num: 110 }),
    ];

    expect(
      erkenneTb03({
        regel: NUTZFLAECHE,
        ankerMonat: ANKER_MONAT,
        intervalle: genauZehn,
        laufMonat: LAUF_MONAT,
      }).kandidaten,
    ).toHaveLength(1);
  });

  it('wertet eine Verringerung genauso wie eine Erhoehung', () => {
    const halbiert = [
      intervall('2019-01-01', '2022-01-01', { num: 200 }),
      intervall('2022-01-01', null, { num: 100 }),
    ];

    expect(
      erkenneTb03({
        regel: NUTZFLAECHE,
        ankerMonat: ANKER_MONAT,
        intervalle: halbiert,
        laufMonat: LAUF_MONAT,
      }).kandidaten,
    ).toHaveLength(1);
  });
});

describe('erkenneTb03 — Mindestdauer', () => {
  it('verlangt bei "ueber ein halbes Jahr" MEHR als sechs Monate', () => {
    const genauSechsMonate = [
      intervall('2019-01-01', '2022-01-01', { num: 10 }),
      intervall('2022-01-01', '2022-07-01', { num: 30 }),
    ];

    expect(
      erkenneTb03({
        regel: PERSONENANZAHL,
        ankerMonat: ANKER_MONAT,
        intervalle: genauSechsMonate,
        laufMonat: LAUF_MONAT,
      }).kandidaten,
    ).toHaveLength(0);

    const siebenMonate = [
      intervall('2019-01-01', '2022-01-01', { num: 10 }),
      intervall('2022-01-01', '2022-08-01', { num: 30 }),
    ];

    expect(
      erkenneTb03({
        regel: PERSONENANZAHL,
        ankerMonat: ANKER_MONAT,
        intervalle: siebenMonate,
        laufMonat: LAUF_MONAT,
      }).kandidaten,
    ).toHaveLength(1);
  });

  it('laesst beim Nutzungszweck genau sechs Monate genuegen', () => {
    const intervalle = [
      intervall('2019-01-01', '2022-01-01', { code: 'buero' }),
      intervall('2022-01-01', '2022-07-01', { code: 'produktion' }),
    ];

    expect(
      erkenneTb03({
        regel: NUTZUNGSZWECK,
        ankerMonat: ANKER_MONAT,
        intervalle,
        laufMonat: LAUF_MONAT,
      }).kandidaten,
    ).toHaveLength(1);
  });

  it('zaehlt bei offenem Intervall nur vollstaendig verstrichene Monate', () => {
    const intervalle = [
      intervall('2019-01-01', '2026-03-01', { num: 10 }),
      intervall('2026-03-01', null, { num: 30 }),
    ];

    // Lauf im September 2026: seit Maerz sind sechs Monate voll — "gt 6"
    // verlangt sieben, also noch kein Befund.
    expect(
      erkenneTb03({ regel: PERSONENANZAHL, ankerMonat: ANKER_MONAT, intervalle, laufMonat: '2026-09-01' })
        .kandidaten,
    ).toHaveLength(0);

    expect(
      erkenneTb03({ regel: PERSONENANZAHL, ankerMonat: ANKER_MONAT, intervalle, laufMonat: '2026-10-01' })
        .kandidaten,
    ).toHaveLength(1);
  });
});

describe('erkenneTb03 — Klassierung', () => {
  it('klassiert nach Vielfachen des Schwellwerts, nicht des Rohwerts', () => {
    const faelle: readonly { istwert: number; erwartet: string }[] = [
      { istwert: 160, erwartet: 'schwelle_ueberschritten' }, // +60 % = 1,2 x 50 %
      { istwert: 200, erwartet: 'deutlich_ueberschritten' }, // +100 % = 2,0 x
      { istwert: 260, erwartet: 'stark_ueberschritten' }, // +160 % = 3,2 x
    ];

    for (const fall of faelle) {
      const intervalle = [
        intervall('2019-01-01', '2022-01-01', { num: 100 }),
        intervall('2022-01-01', null, { num: fall.istwert }),
      ];

      const ergebnis = erkenneTb03({
        regel: PERSONENANZAHL,
        ankerMonat: ANKER_MONAT,
        intervalle,
        laufMonat: LAUF_MONAT,
      });

      expect(ergebnis.kandidaten[0]?.ueberschreitungKlasse).toBe(fall.erwartet);
    }
  });

  it('deckelt die Klasse bei kleiner Personenanzahl (A22)', () => {
    // Anker 2 -> 8 Personen waere +300 % und damit "stark"; die Klasse
    // verriete dann faktisch die exakte Zahl.
    const intervalle = [
      intervall('2019-01-01', '2022-01-01', { num: 2 }),
      intervall('2022-01-01', null, { num: 8 }),
    ];

    const ergebnis = erkenneTb03({
      regel: PERSONENANZAHL,
      ankerMonat: ANKER_MONAT,
      intervalle,
      laufMonat: LAUF_MONAT,
    });

    expect(ergebnis.kandidaten[0]?.ueberschreitungKlasse).toBe('schwelle_ueberschritten');
  });

  it('eskaliert Dauerregeln nicht mit der Zeit (A21)', () => {
    const intervalle = [
      intervall('2019-01-01', '2020-01-01', { code: 'buero' }),
      intervall('2020-01-01', null, { code: 'produktion' }),
    ];

    const ergebnis = erkenneTb03({
      regel: NUTZUNGSZWECK,
      ankerMonat: ANKER_MONAT,
      intervalle,
      laufMonat: LAUF_MONAT,
    });

    // Über sechs Jahre unveraendert anzeigepflichtig — und trotzdem dieselbe Klasse.
    expect(ergebnis.kandidaten[0]?.ueberschreitungKlasse).toBe('schwelle_ueberschritten');
  });
});

describe('erkenneTb03 — Zeitraumgrenzen stammen aus den Daten (A15)', () => {
  it('liefert bei spaeterem Lauf denselben Zeitraum', () => {
    const intervalle = [
      intervall('2019-01-01', '2022-01-01', { num: 10 }),
      intervall('2022-01-01', null, { num: 30 }),
    ];

    const frueh = erkenneTb03({
      regel: PERSONENANZAHL,
      ankerMonat: ANKER_MONAT,
      intervalle,
      laufMonat: '2023-01-01',
    });
    const spaet = erkenneTb03({
      regel: PERSONENANZAHL,
      ankerMonat: ANKER_MONAT,
      intervalle,
      laufMonat: '2026-09-01',
    });

    expect(frueh.kandidaten).toEqual(spaet.kandidaten);
    // Beginn der Aenderung plus sieben Monate ("mehr als ein halbes Jahr").
    expect(frueh.kandidaten[0]?.zeitraumVon).toBe('2022-01-01');
    expect(frueh.kandidaten[0]?.zeitraumBis).toBe('2022-08-01');
  });
});
