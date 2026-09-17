import type { Aufloesung } from '@edms/shared';

/**
 * Härte-Obergrenze gegen eine (theoretische) Endlosschleife bei
 * fehlerhaften/extremen Eingaben — kein fachliches Kriterium, reine
 * Schutzschranke für `erzeugeBucketZeitpunkte`.
 */
const MAX_BUCKETS = 5000;

function parseDatumUtc(datum: string): Date {
  return new Date(`${datum}T00:00:00.000Z`);
}

/** Heutiges Datum (UTC) als `yyyy-mm-dd` — Default-Obergrenze der Zeitraumwahl. */
export function heutigesDatumUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Verschiebt ein `yyyy-mm-dd`-Datum um `deltaTage` Kalendertage (UTC-sicher). */
export function datumVerschieben(datum: string, deltaTage: number): string {
  const basis = parseDatumUtc(datum);
  basis.setUTCDate(basis.getUTCDate() + deltaTage);
  return basis.toISOString().slice(0, 10);
}

/** Verschiebt ein `yyyy-mm-dd`-Datum um `deltaMonate` Kalendermonate (UTC-sicher, Tag bleibt möglichst erhalten). */
export function monatVerschieben(datum: string, deltaMonate: number): string {
  const basis = parseDatumUtc(datum);
  basis.setUTCMonth(basis.getUTCMonth() + deltaMonate);
  return basis.toISOString().slice(0, 10);
}

/**
 * Sinnvolle Default-Fensterbreite je Auflösung — angewendet, sobald die
 * Auflösung gewechselt wird (sonst zeigt z. B. "Stunde" über ein
 * 12-Monats-Fenster tausende Balken). Werte angelehnt an übliche
 * Monitoring-Dashboards (`dataviz`-Skill, `interaction.md`: "Date range
 * first", Presets vor Custom-Range).
 */
export function standardZeitraumFuer(aufloesung: Aufloesung, bisDatum: string): { readonly von: string; readonly bis: string } {
  if (aufloesung === 'stunde') {
    return { von: datumVerschieben(bisDatum, -3), bis: bisDatum };
  }
  if (aufloesung === 'monat') {
    return { von: monatVerschieben(bisDatum, -12), bis: bisDatum };
  }
  return { von: datumVerschieben(bisDatum, -30), bis: bisDatum };
}

/**
 * Normalisiert das UI-Zeitfenster (kalendarische Datumsauswahl, `bisDatum`
 * INKLUSIVE) auf ein für die Backend-Aggregation gültiges, halboffenes
 * `[von, bis)`-UTC-Intervall AN EINER für `aufloesung` gültigen
 * `time_bucket`-Grenze (`measurement-messwert.repository.ts`:
 * `time_bucket($aufloesung, ts)` — Mitternachts-UTC-Grenze für
 * `stunde`/`tag`, zusätzlich Kalendermonatsgrenze für `monat`).
 *
 * OHNE diese Normalisierung würden vom Client selbst erzeugte "erwartete"
 * Buckets (`erzeugeBucketZeitpunkte`) an anderen Grenzen liegen als die vom
 * Server gelieferten `zeitpunkt`-Werte — die Lücken-Erkennung liefe dann
 * leer (jeder Punkt sähe wie eine Lücke aus, s. `useVerbrauchView`-Dok).
 * Bei `monat` wird daher IMMER auf volle Kalendermonate aufgerundet, auch
 * wenn die Nutzerin einen Tag mitten im Monat gewählt hat.
 */
export function berechneAnfrageZeitraum(
  vonDatum: string,
  bisDatumInklusive: string,
  aufloesung: Aufloesung,
): { readonly von: string; readonly bis: string } {
  if (aufloesung === 'monat') {
    const vonMonatsanfang = `${vonDatum.slice(0, 7)}-01`;
    const bisMonatsanfang = `${bisDatumInklusive.slice(0, 7)}-01`;
    const bisExklusiv = monatVerschieben(bisMonatsanfang, 1);
    return { von: `${vonMonatsanfang}T00:00:00.000Z`, bis: `${bisExklusiv}T00:00:00.000Z` };
  }
  const bisExklusiv = datumVerschieben(bisDatumInklusive, 1);
  return { von: `${vonDatum}T00:00:00.000Z`, bis: `${bisExklusiv}T00:00:00.000Z` };
}

function naechsterBucket(zeitpunkt: Date, aufloesung: Aufloesung): Date {
  const naechster = new Date(zeitpunkt.getTime());
  if (aufloesung === 'stunde') {
    naechster.setUTCHours(naechster.getUTCHours() + 1);
  } else if (aufloesung === 'monat') {
    naechster.setUTCMonth(naechster.getUTCMonth() + 1);
  } else {
    naechster.setUTCDate(naechster.getUTCDate() + 1);
  }
  return naechster;
}

/**
 * Erzeugt die vollständige, lückenlose Folge erwarteter Bucket-Startzeiten
 * (ISO, UTC) im halboffenen Intervall `[von, bis)` — GENAU die Menge, die
 * `generate_series(...)` serverseitig ebenfalls erzeugt (s.
 * `berechneAnfrageZeitraum`-Dok). Fehlt ein Bucket in der vom Server
 * gelieferten Zeitreihe, ist das eine ECHTE Lücke (kein Messwert, keine
 * gültige Differenz) — NIEMALS als `wert: 0` interpretieren (s.
 * `useVerbrauchView`).
 */
export function erzeugeBucketZeitpunkte(vonIso: string, bisIso: string, aufloesung: Aufloesung): readonly string[] {
  const bis = new Date(bisIso);
  const ergebnis: string[] = [];
  let cursor = new Date(vonIso);
  while (cursor.getTime() < bis.getTime() && ergebnis.length < MAX_BUCKETS) {
    ergebnis.push(cursor.toISOString());
    cursor = naechsterBucket(cursor, aufloesung);
  }
  return ergebnis;
}

const STUNDEN_FORMAT = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});
const TAG_FORMAT = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const MONAT_FORMAT = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/**
 * Formatiert einen Bucket-Zeitpunkt für Achse/Tooltip/Tabelle (de-DE). Bewusst
 * `timeZone: 'UTC'` — die API liefert/erwartet ausschließlich UTC
 * (`.claude/rules/backend-nestjs.md`: "Zeitstempel immer UTC in DB und API"),
 * eine Umrechnung in die Browser-Zeitzone ist NICHT Teil dieses Passes (s.
 * Abschlussbericht "offene Punkte").
 */
export function formatiereBucket(zeitpunktIso: string, aufloesung: Aufloesung): string {
  const datum = new Date(zeitpunktIso);
  if (aufloesung === 'stunde') {
    return STUNDEN_FORMAT.format(datum);
  }
  if (aufloesung === 'monat') {
    return MONAT_FORMAT.format(datum);
  }
  return TAG_FORMAT.format(datum);
}

/** Zahlenformat für Verbrauchswerte (de-DE, max. 2 Nachkommastellen) — Tooltip/Tabelle/Direktbeschriftung. */
const WERT_FORMAT = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

export function formatiereWert(wert: number): string {
  return WERT_FORMAT.format(wert);
}
