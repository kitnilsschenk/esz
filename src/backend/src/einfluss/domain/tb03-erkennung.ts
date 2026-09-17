import { istMonatsanfang } from '../../common/zeit/zeitscheibe.util';
import type { Tb03Regel } from './tb03-regel';

/**
 * Die eigentliche TB-03-Erkennung — REINE Domäne, keine I/O, keine Uhr.
 *
 * Sie beantwortet für EIN System und EINE Einflussgröße die Frage: Hat sich
 * der Wert gegenüber dem Stand am Ende des Baseline-Erhebungszeitraums so
 * verändert, dass TB-03 eine Anzeige verlangt — und wenn ja, in welchem
 * Zeitraum und in welcher Klasse?
 *
 * Sie erzeugt KEINEN Vorgang und KEINE Frist (ADR-0006:54, A15). Ein Befund
 * ist ein Datum, keine Erklärung gegenüber der Bewilligungsbehörde.
 *
 * ZWEI EIGENE MONATSHILFEN (statt Import aus `nachweis/zeit.util.ts`):
 * Monatsarithmetik ist hier auf Addition und Differenz beschränkt, und der
 * Nachweis-Namensraum trägt seine Helfer an Förderjahr-Semantik gebunden
 * (inklusive vs. halboffene Obergrenzen). Ein Import hätte genau die
 * Off-by-one-Verwechslung importiert, die jene Datei im Kopf beschreibt.
 * `istMonatsanfang` kommt dagegen aus `common/zeit` — dort ist sie
 * semantikfrei.
 */

/** Eine Zeile aus `einfluss.intervall`, auf das reduziert, was die Erkennung braucht. */
export interface Tb03Intervall {
  readonly gueltigAbMonat: string;
  /** `null` = offen. Halboffen `[ab, bis)` — wie `daterange` im EXCLUDE-Constraint (V0020). */
  readonly gueltigBisMonat: string | null;
  readonly wertNum: number | null;
  readonly wertCode: string | null;
}

export type UeberschreitungKlasse =
  | 'schwelle_ueberschritten'
  | 'deutlich_ueberschritten'
  | 'stark_ueberschritten';

export interface Tb03Befundkandidat {
  readonly groesseCode: string;
  readonly schwellwertCode: string;
  readonly zeitraumVon: string;
  readonly zeitraumBis: string;
  readonly ueberschreitungKlasse: UeberschreitungKlasse;
}

/** Warum ein System/eine Größe ohne Befund blieb — für die Ausweispflicht aus A18/A25. */
export type Tb03SkipGrund = 'kein_anker' | 'kein_ausgangswert' | 'ausgangswert_nicht_teilbar';

export interface Tb03Erkennungsergebnis {
  readonly kandidaten: readonly Tb03Befundkandidat[];
  readonly skipGrund?: Tb03SkipGrund;
}

function monatPlus(monat: string, monate: number): string {
  const datum = new Date(`${monat}T00:00:00.000Z`);
  const verschoben = new Date(Date.UTC(datum.getUTCFullYear(), datum.getUTCMonth() + monate, 1));
  return verschoben.toISOString().slice(0, 10);
}

function monateZwischen(vonMonat: string, bisMonat: string): number {
  const von = new Date(`${vonMonat}T00:00:00.000Z`);
  const bis = new Date(`${bisMonat}T00:00:00.000Z`);
  return (bis.getUTCFullYear() - von.getUTCFullYear()) * 12 + (bis.getUTCMonth() - von.getUTCMonth());
}

/** Das Intervall, das im Ankermonat galt — halboffen `[ab, bis)`. */
function intervallAm(intervalle: readonly Tb03Intervall[], monat: string): Tb03Intervall | undefined {
  return intervalle.find(
    (i) => i.gueltigAbMonat <= monat && (i.gueltigBisMonat === null || i.gueltigBisMonat > monat),
  );
}

/**
 * Wie viele Monate das Intervall NACHWEISLICH gedauert hat.
 *
 * Für ein offenes Intervall zählt nur, was bis `laufMonat` VOLLSTÄNDIG
 * verstrichen ist — bewusst konservativ: Der angefangene Monat des Laufs
 * belegt noch keine Dauer, und ein zu früher Befund wäre nach A23 nicht mehr
 * korrigierbar (`einfluss.befund` kennt weder UPDATE noch DELETE).
 */
function dauerMonate(intervall: Tb03Intervall, laufMonat: string): number {
  const ende = intervall.gueltigBisMonat ?? laufMonat;
  return Math.max(0, monateZwischen(intervall.gueltigAbMonat, ende));
}

/**
 * A21 — Dauerregeln werden NICHT eskaliert.
 *
 * Bei einer Auslöseschwelle ist Dauer kein Schweremaß: 18 Monate sind nicht
 * „dreifach anzeigepflichtig", sie sind derselbe Sachverhalt, nur älter. Eine
 * Dauerklasse wüchse allein durch Zeitablauf und wäre mit den Prozentklassen
 * nicht vergleichbar. Die Dauer bleibt über `zeitraum_von`/`zeitraum_bis`
 * ablesbar — beide sind in der Kontext-Whitelist des Audit-Ereignisses
 * (V0021:241).
 */
function klassiereDauer(): UeberschreitungKlasse {
  return 'schwelle_ueberschritten';
}

/**
 * B12.5 — die Klasse ist ein Vielfaches des TB-03-SCHWELLWERTS, nicht des
 * Rohwerts. 1,0–<1,5× `schwelle`, 1,5–<3,0× `deutlich`, ab 3,0× `stark`.
 *
 * A22 (Kleinwert-Deckel): Ist der Bezugswert einer Personenanzahl ≤ 2, wird
 * auf `schwelle_ueberschritten` gedeckelt. Bei Bezugswert 1 bedeutete
 * `stark_ueberschritten` (≥ 3,0 × 50 %) rechnerisch „≥ 2,5 Personen" — also
 * faktisch die exakte Zahl, und zwar im Audit-Log, das die Auditor-Rolle
 * lesen darf, obwohl sie für `read:einflussgroesse` eigens deny-gelistet ist
 * (ADR-0006:526). Genau das verbietet B10. Der Betriebs-Blick auf die
 * tatsächliche Höhe bleibt über `read:einflussgroesse` unberührt.
 */
function klassiereProzent(
  abweichungProzent: number,
  schwelleProzent: number,
  groesseCode: string,
  ausgangswert: number,
): UeberschreitungKlasse {
  if (groesseCode === 'personenanzahl' && ausgangswert <= 2) {
    return 'schwelle_ueberschritten';
  }

  const vielfaches = abweichungProzent / schwelleProzent;
  if (vielfaches >= 3) {
    return 'stark_ueberschritten';
  }
  if (vielfaches >= 1.5) {
    return 'deutlich_ueberschritten';
  }
  return 'schwelle_ueberschritten';
}

function ueberschreitet(wert: number, schwelle: number, vergleich: 'gt' | 'gte'): boolean {
  return vergleich === 'gt' ? wert > schwelle : wert >= schwelle;
}

/**
 * Erkennt Befundkandidaten für EIN System und EINE Größe.
 *
 * `laufMonat` geht AUSSCHLIESSLICH in die Frage ein, ob eine Dauer schon
 * verstrichen ist — nie in die Zeitraumgrenzen des Befundes. Das ist A15:
 * „`zeitraum_von`/`zeitraum_bis` werden ausschließlich aus den Intervalldaten
 * abgeleitet, nie aus dem Laufdatum." Praktisch heißt das: Derselbe Bestand
 * erzeugt in jedem späteren Lauf denselben Befund mit denselben Grenzen —
 * Voraussetzung dafür, dass der Idempotenz-Index aus V0079 überhaupt greifen
 * kann.
 *
 * `zeitraumBis` ist der Monat, in dem die Regel erfüllt WAR — Beginn der
 * Änderung plus Mindestdauer (bei `gt` einen Monat später, weil „über ein
 * halbes Jahr" mehr als sechs Monate verlangt). Er ist damit keine Aussage
 * darüber, wann der Zustand endete, sondern darüber, wann er anzeigepflichtig
 * wurde.
 */
export function erkenneTb03(input: {
  readonly regel: Tb03Regel;
  readonly ankerMonat: string;
  readonly intervalle: readonly Tb03Intervall[];
  readonly laufMonat: string;
}): Tb03Erkennungsergebnis {
  const { regel, ankerMonat, intervalle, laufMonat } = input;

  if (!istMonatsanfang(ankerMonat) || !istMonatsanfang(laufMonat)) {
    throw new RangeError('ankerMonat und laufMonat muessen Monatsanfaenge sein.');
  }

  // A16: Fehlt der Anker, entsteht KEIN Befund — und kein Rückfall auf das
  // Vorintervall. Ein zweiter Bezugsmaßstab wäre ein zweiter, nirgends
  // dokumentierter Erkennungsbegriff.
  const anker = intervallAm(intervalle, ankerMonat);
  if (anker === undefined) {
    return { kandidaten: [], skipGrund: 'kein_anker' };
  }

  const mindestdauer =
    regel.dauerVergleich === 'gt' ? regel.mindestdauerMonate + 1 : regel.mindestdauerMonate;

  const kandidaten: Tb03Befundkandidat[] = [];

  // Nur Intervalle NACH dem Anker sind Änderungen gegenüber der Baseline.
  const spaeter = intervalle.filter((i) => i.gueltigAbMonat > anker.gueltigAbMonat);

  for (const intervall of spaeter) {
    if (dauerMonate(intervall, laufMonat) < mindestdauer) {
      continue;
    }

    let klasse: UeberschreitungKlasse | undefined;

    if (regel.art === 'dauer') {
      // Auslöser ist der WECHSEL des Codes gegenüber dem Baseline-Stand.
      if (
        intervall.wertCode !== null &&
        anker.wertCode !== null &&
        intervall.wertCode !== anker.wertCode
      ) {
        klasse = klassiereDauer();
      }
    } else {
      const ausgangswert = anker.wertNum;
      const istwert = intervall.wertNum;

      if (ausgangswert === null || istwert === null) {
        return { kandidaten, skipGrund: 'kein_ausgangswert' };
      }
      // Ein Ausgangswert von 0 (oder negativ) macht die relative Abweichung
      // undefiniert. Fail-closed statt einer erfundenen Prozentzahl.
      if (ausgangswert <= 0) {
        return { kandidaten, skipGrund: 'ausgangswert_nicht_teilbar' };
      }

      // TB-03 spricht von der ÄNDERUNG, nicht von der Erhöhung: eine
      // Halbierung der Belegung entwertet die Baseline genauso wie eine
      // Verdopplung. Daher der Betrag.
      const abweichungProzent = (Math.abs(istwert - ausgangswert) / ausgangswert) * 100;

      if (ueberschreitet(abweichungProzent, regel.wertProzent, regel.vergleich)) {
        klasse = klassiereProzent(abweichungProzent, regel.wertProzent, regel.groesseCode, ausgangswert);
      }
    }

    if (klasse !== undefined) {
      kandidaten.push({
        groesseCode: regel.groesseCode,
        schwellwertCode: regel.schwellwertCode,
        zeitraumVon: intervall.gueltigAbMonat,
        zeitraumBis: monatPlus(intervall.gueltigAbMonat, mindestdauer),
        ueberschreitungKlasse: klasse,
      });
    }
  }

  return { kandidaten };
}
