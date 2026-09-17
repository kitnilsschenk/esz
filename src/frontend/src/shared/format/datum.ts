// Zentrale Datums-/Zeit-Formatierung für die gesamte Oberfläche.
//
// Hintergrund (`.claude/rules/backend-nestjs.md`: „Zeitstempel immer UTC in DB
// und API (`Z` im ISO-String). Zeitzonen-Handling nur in UI."): Die API
// liefert `format: date-time` durchgängig als UTC-ISO-String. Genau HIER —
// und nur hier — wird daraus eine für Betriebs-Personal lesbare deutsche
// Darstellung. Vor Einführung dieses Moduls rendered zehn Stellen
// (fünf Tabellen, fünf Detail-Views) den Roh-String `2026-08-26T14:32:11.000Z`
// direkt in die Oberfläche.
//
// Die Anzeige-Zeitzone ist FEST `Europe/Berlin` (nicht die Zeitzone des
// Browsers): Das EDMS ist ein Betriebswerkzeug für einen deutschen
// Förderkontext — ein Zeitstempel muss zwischen zwei Arbeitsplätzen
// vergleichbar bleiben, auch wenn jemand aus einer anderen Zeitzone zugreift.

const ANZEIGE_ZEITZONE = 'Europe/Berlin';

/** „26.08.2026, 16:32" — Standarddarstellung eines UTC-Zeitpunkts (`createdAt`, `updatedAt`, `gueltigVon`, …). */
const ZEITPUNKT_FORMAT = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: ANZEIGE_ZEITZONE,
});

/** „26.08.2026" — wenn die Uhrzeit fachlich keine Rolle spielt (Tabellenspalten mit knappem Platz). */
const DATUM_FORMAT = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: ANZEIGE_ZEITZONE,
});

/**
 * Reine Kalenderdaten (`format: date`, „yyyy-mm-dd" OHNE Zeitanteil, z. B.
 * Einflussgrößen-Monatsgrenzen). Bewusst `timeZone: 'UTC'`: „2026-08-01"
 * parst als Mitternacht UTC — in `Europe/Berlin` formatiert wäre das der
 * 01.08. um 02:00, aber ein Umschlag über die Datumsgrenze (Zeitzonen
 * WESTLICH von UTC) würde den Vortag anzeigen. Analog `berechnungFormat.ts`.
 */
const KALENDERDATUM_FORMAT = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});

function istGueltig(datum: Date): boolean {
  return !Number.isNaN(datum.getTime());
}

/**
 * Formatiert einen UTC-ISO-Zeitstempel als „26.08.2026, 16:32" (Europe/Berlin).
 * Unparsbare Eingaben werden UNVERÄNDERT zurückgegeben statt „Invalid Date"
 * anzuzeigen — ein unerwartetes Server-Format soll die Zeile nicht unlesbar
 * machen, sondern sichtbar bleiben.
 */
export function formatiereZeitpunkt(iso: string): string {
  const datum = new Date(iso);
  return istGueltig(datum) ? ZEITPUNKT_FORMAT.format(datum) : iso;
}

/** Wie `formatiereZeitpunkt`, aber ohne Uhrzeit („26.08.2026"). */
export function formatiereDatum(iso: string): string {
  const datum = new Date(iso);
  return istGueltig(datum) ? DATUM_FORMAT.format(datum) : iso;
}

/** Formatiert ein reines Kalenderdatum („2026-08-01" → „01.08.2026"), siehe `KALENDERDATUM_FORMAT`. */
export function formatiereKalenderdatum(datumIso: string): string {
  const datum = new Date(datumIso);
  return istGueltig(datum) ? KALENDERDATUM_FORMAT.format(datum) : datumIso;
}

/**
 * `null`/`undefined`-tolerante Variante für optionale Zeitstempel
 * (`gueltigBis: string | null` = „aktuell aktiv"). Der Aufrufer übergibt den
 * fachlichen Ersatztext.
 */
export function formatiereZeitpunktOder(iso: string | null | undefined, ersatz: string): string {
  return iso === null || iso === undefined ? ersatz : formatiereZeitpunkt(iso);
}

// ---------------------------------------------------------------------------
// Gegenrichtung: EINGABE einer Ortszeit
// ---------------------------------------------------------------------------
//
// Alles oberhalb formatiert einen UTC-Zeitstempel FÜR die Anzeige. Die beiden
// Funktionen hier sind die Umkehrung — sie werden gebraucht, sobald ein
// Zeitpunkt nicht vom Server kommt, sondern von einer Person eingegeben wird
// (`<input type="datetime-local">`, z. B. der erklärte Übermittlungszeitpunkt
// einer BAFA-Einreichung).
//
// Ein `datetime-local`-Feld liefert reine Wanduhr-Zeit OHNE Zeitzone
// ("2026-08-26T16:32"). Sie wird hier als `Europe/Berlin` gelesen — dieselbe
// feste Anzeige-Zeitzone wie oben. Die naheliegende Alternative (Zeitzone des
// Browsers) wäre inkonsistent: Wer die Zeit eingibt und danach angezeigt
// bekommt, sähe an einem Arbeitsplatz außerhalb Deutschlands eine ANDERE
// Uhrzeit zurück, als er getippt hat.

const BERLIN_TEILE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: ANZEIGE_ZEITZONE,
});

/** Zerlegt einen Zeitpunkt in seine Berliner Wanduhr-Teile — Basis für Offset-Berechnung und Feld-Vorbelegung. */
function berlinerTeile(zeitpunkt: Date): { readonly datum: string; readonly zeit: string } {
  const teile = new Map(BERLIN_TEILE_FORMAT.formatToParts(zeitpunkt).map((teil) => [teil.type, teil.value]));
  const datum = `${teile.get('year') ?? ''}-${teile.get('month') ?? ''}-${teile.get('day') ?? ''}`;
  // `en-CA` liefert 24-Stunden-Werte, gibt Mitternacht aber je nach Engine als
  // „24" statt „00" aus — für die Offset-Rechnung wäre das ein Tagesfehler.
  const stunde = (teile.get('hour') ?? '00') === '24' ? '00' : (teile.get('hour') ?? '00');
  const zeit = `${stunde}:${teile.get('minute') ?? '00'}:${teile.get('second') ?? '00'}`;
  return { datum, zeit };
}

/** Offset von `Europe/Berlin` gegen UTC in Minuten, gültig FÜR diesen Zeitpunkt (60 im Winter, 120 im Sommer). */
function berlinOffsetMinuten(zeitpunkt: Date): number {
  const { datum, zeit } = berlinerTeile(zeitpunkt);
  const alsWaereEsUtc = Date.parse(`${datum}T${zeit}Z`);
  return Math.round((alsWaereEsUtc - zeitpunkt.getTime()) / 60000);
}

/**
 * UTC-ISO-Zeitstempel → Feldwert eines `<input type="datetime-local">`
 * ("2026-08-26T16:32", Berliner Ortszeit). Für die Vorbelegung eines
 * Eingabefeldes mit „jetzt" oder mit einem bereits gespeicherten Wert.
 */
export function zuOrtszeitEingabe(iso: string): string {
  const zeitpunkt = new Date(iso);
  if (!istGueltig(zeitpunkt)) {
    return '';
  }
  const { datum, zeit } = berlinerTeile(zeitpunkt);
  return `${datum}T${zeit.slice(0, 5)}`;
}

/**
 * Feldwert eines `<input type="datetime-local">` (Berliner Ortszeit) →
 * UTC-ISO-Zeitstempel mit `Z` (`.claude/rules/backend-nestjs.md`: „Zeitstempel
 * immer UTC in DB und API"). Liefert `undefined`, wenn die Eingabe kein
 * vollständiger Zeitpunkt ist — der Aufrufer meldet das als Feldfehler.
 *
 * Zwei Durchgänge: Der erste schätzt den Offset an der naiv als UTC gelesenen
 * Eingabe, der zweite prüft ihn am so gewonnenen Zeitpunkt gegen. Das ist an
 * den beiden Zeitumstellungs-Terminen des Jahres nötig, an denen die
 * Wanduhr-Zeit selbst nicht verrät, welcher Offset gilt.
 *
 * In der Herbst-Stunde, die es zweimal gibt (die Uhr springt zurück), ist die
 * Eingabe echt mehrdeutig; hier fällt die Wahl auf die ZWEITE Lesung
 * (Winterzeit). Auflösen ließe sich das nur mit einem zusätzlichen
 * Eingabefeld für die Zeitzone — Aufwand, der in keinem Verhältnis zu einer
 * Stunde im Jahr steht.
 */
export function vonOrtszeitEingabe(lokal: string): string | undefined {
  // Ohne `step` liefert `datetime-local` minutengenau; einzelne Engines hängen
  // Sekunden an. Beide Formen werden akzeptiert, alles andere abgewiesen —
  // `Date.parse` wäre hier zu nachsichtig und ergäbe stillschweigend einen
  // falschen Zeitpunkt.
  const treffer = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2})?$/.exec(lokal);
  if (treffer === null) {
    return undefined;
  }
  const naivUtc = Date.parse(`${treffer[1] ?? ''}${treffer[2] ?? ':00'}Z`);
  if (Number.isNaN(naivUtc)) {
    return undefined;
  }
  const ersterOffset = berlinOffsetMinuten(new Date(naivUtc));
  const zweiterOffset = berlinOffsetMinuten(new Date(naivUtc - ersterOffset * 60000));
  return new Date(naivUtc - zweiterOffset * 60000).toISOString();
}
