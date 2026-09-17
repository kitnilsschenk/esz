/**
 * Die TB-03-Regel, wie sie in `einfluss.katalog.tb03_schwellwert` steht
 * (V0079) — hier in eine getypte Form gebracht.
 *
 * Der Katalog ist die EINZIGE Quelle der Schwellwerte; in diesem Modul steht
 * absichtlich keine einzige Zahl aus dem Merkblatt. Grund ist A14: Nach
 * Abschluss von O-3 (Beschaffung der zum 28.06.2018 gültigen Merkblatt-
 * fassung) werden die Werte gegengeprüft, und eine Abweichung führt zu einer
 * neuen Katalog-Migration mit neuem `schwellwert_code` — nicht zu einer
 * Code-Änderung. Stünde eine Zahl auch hier, gäbe es zwei Wahrheiten.
 *
 * REINE Domäne, keine I/O.
 */

/** Strenge eines Vergleichs — im Merkblatt WÖRTLICH unterschiedlich, s. V0079. */
export type Tb03Vergleich = 'gt' | 'gte';

interface Tb03RegelBasis {
  readonly groesseCode: string;
  /** Trägt die Fassung im Code selbst (A13), z. B. `tb03.nutzflaeche.10pct_halbjahr.v2022`. */
  readonly schwellwertCode: string;
  readonly mindestdauerMonate: number;
  readonly dauerVergleich: Tb03Vergleich;
  readonly fassung: string;
  readonly fassungsvorbehalt: boolean;
}

/** `personenanzahl`, `nutzflaeche` — prozentuale Abweichung gegen den Baseline-Wert. */
export interface Tb03ProzentRegel extends Tb03RegelBasis {
  readonly art: 'prozent';
  readonly wertProzent: number;
  readonly vergleich: Tb03Vergleich;
}

/** `nutzungszweck` — Auslöser ist der WECHSEL des Codes, die Schwelle ist allein die Dauer. */
export interface Tb03DauerRegel extends Tb03RegelBasis {
  readonly art: 'dauer';
}

export type Tb03Regel = Tb03ProzentRegel | Tb03DauerRegel;

function text(quelle: Record<string, unknown>, schluessel: string): string | undefined {
  const wert = quelle[schluessel];
  return typeof wert === 'string' && wert.length > 0 ? wert : undefined;
}

function zahl(quelle: Record<string, unknown>, schluessel: string): number | undefined {
  const wert = quelle[schluessel];
  return typeof wert === 'number' && Number.isFinite(wert) ? wert : undefined;
}

function vergleich(quelle: Record<string, unknown>, schluessel: string): Tb03Vergleich | undefined {
  const wert = quelle[schluessel];
  return wert === 'gt' || wert === 'gte' ? wert : undefined;
}

/**
 * Liest eine Katalogzeile in eine Regel — oder `undefined`.
 *
 * `undefined` heißt nach A25 IMMER „diese Größe wird nicht maschinell
 * überwacht", NIEMALS „nie überschritten". Der Aufrufer muss die Größe
 * überspringen UND die Zahl der übersprungenen Größen ausweisen.
 *
 * Fail-closed: Der DB-CHECK `ck_katalog_tb03_schwellwert_herkunft` (V0079)
 * erzwingt dieselben Felder bereits beim Schreiben. Diese Prüfung ist
 * absichtlich die zweite Schicht — eine Regel, die hier nicht vollständig
 * ankommt, wird nicht „so gut es geht" angewendet, sondern gar nicht. Eine
 * halb gelesene Schwellwertregel erzeugt falsche Nachweisartefakte, und die
 * sind schlimmer als fehlende.
 */
export function leseTb03Regel(groesseCode: string, roh: unknown): Tb03Regel | undefined {
  if (roh === null || typeof roh !== 'object' || Array.isArray(roh)) {
    return undefined;
  }
  const quelle = roh as Record<string, unknown>;

  const schwellwertCode = text(quelle, 'schwellwert_code');
  const fassung = text(quelle, 'fassung');
  const mindestdauerMonate = zahl(quelle, 'mindestdauer_monate');
  const dauerVergleich = vergleich(quelle, 'dauer_vergleich');
  const fassungsvorbehalt = quelle['fassungsvorbehalt'];

  if (
    schwellwertCode === undefined ||
    fassung === undefined ||
    mindestdauerMonate === undefined ||
    mindestdauerMonate <= 0 ||
    dauerVergleich === undefined ||
    typeof fassungsvorbehalt !== 'boolean'
  ) {
    return undefined;
  }

  // A16: In v1 ist der Baseline-Bezug der EINZIGE zulässige Bezugsmaßstab.
  // Der DB-CHECK lässt nichts anderes zu; hier wird es ein zweites Mal
  // abgewiesen, damit ein späterer, zweiter Bezug nicht stillschweigend
  // durch diese Schicht rutscht.
  if (text(quelle, 'bezug') !== 'baseline_ende') {
    return undefined;
  }

  const basis: Tb03RegelBasis = {
    groesseCode,
    schwellwertCode,
    mindestdauerMonate,
    dauerVergleich,
    fassung,
    fassungsvorbehalt,
  };

  const art = quelle['art'];

  if (art === 'dauer') {
    return { ...basis, art: 'dauer' };
  }

  if (art === 'prozent') {
    const wertProzent = zahl(quelle, 'wert');
    const vgl = vergleich(quelle, 'vergleich');
    if (wertProzent === undefined || wertProzent <= 0 || vgl === undefined) {
      return undefined;
    }
    return { ...basis, art: 'prozent', wertProzent, vergleich: vgl };
  }

  return undefined;
}
