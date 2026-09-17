/**
 * ADR-0007 Teil C, Auflage A15 — Datenminimierung: Einflussgrößen verlassen
 * den Export in v1 KLASSIERT, nicht im Rohwert („sie sind laut ADR-0006 F5
 * KEINE Rechengröße — ein Wert, der nicht in die Rechnung eingeht, muss für
 * deren Nachvollziehbarkeit nicht im Rohwert vorliegen"). Betrifft laut
 * Arbeitsauftrag AUSDRÜCKLICH nur die beiden NUMERISCHEN Kataloggrößen
 * (`einfluss.katalog`, V0020): `personenanzahl` und `nutzflaeche`. Die drei
 * CODIERTEN Größen (`nutzungszweck`, `energietraeger_mix`,
 * `geraeteabschaffung`) sind bereits eine geschlossene, kleine Werteliste
 * (B12.5) — kein kontinuierlicher, re-identifizierbarer Rohwert — und werden
 * unverändert als `wert_code` durchgereicht.
 *
 * **Der Klassierungs-Schnitt ist fachlich NICHT festgelegt — dies ist ein
 * nachvollziehbarer VORSCHLAG, KEIN bestätigter Wert.** Bestätigung durch
 * `compliance-director`/`savings-engineer`/Bewilligungsbehörde (O-B8-Analogie)
 * ausstehend, s. finale Antwort dieses Arbeitspakets. Erfinde hier KEINE
 * Autorität — bis zur Bestätigung ist dies der v1-Default.
 *
 * REINE Domäne (keine I/O). `analytics.eingang_einflussgroesse` wird in v1
 * strukturell NIE befüllt (kein `einflussgroesse_snapshot_id`-Feld an
 * `analytics.berechnungslauf`, kein Schreibpfad im Repo, s.
 * `nachweis-export-renderer.ts`-Kopfkommentar) — diese Funktion ist daher
 * heute UNERREICHT im Produktivpfad, aber vollständig implementiert und
 * getestet, damit ihre Einführung KEINE Renderer-Änderung mehr braucht,
 * sobald der Snapshot-Schreibpfad nachgezogen wird.
 */

export type EinflussKlassierbarerGroessenCode = 'personenanzahl' | 'nutzflaeche';

const KLASSIERBARE_GROESSEN_CODES: readonly EinflussKlassierbarerGroessenCode[] = ['personenanzahl', 'nutzflaeche'];

export function istKlassierbareGroesse(groesseCode: string): groesseCode is EinflussKlassierbarerGroessenCode {
  return (KLASSIERBARE_GROESSEN_CODES as readonly string[]).includes(groesseCode);
}

interface Klassenband {
  /** Obergrenze INKLUSIV; `Number.POSITIVE_INFINITY` für die letzte, offene Klasse. */
  readonly bisEinschliesslich: number;
  readonly klasse: string;
}

/** Vorschlag (bestätigungsbedürftig): Personen je Haushalt/Nutzungseinheit — vier Bänder, orientiert an gängigen Haushaltsgrößenklassen. */
export const PERSONENANZAHL_KLASSEN: readonly Klassenband[] = [
  { bisEinschliesslich: 2, klasse: '1-2' },
  { bisEinschliesslich: 4, klasse: '3-4' },
  { bisEinschliesslich: 6, klasse: '5-6' },
  { bisEinschliesslich: Number.POSITIVE_INFINITY, klasse: '7+' },
];

/** Vorschlag (bestätigungsbedürftig): Nutzfläche in m² — fünf Bänder. */
export const NUTZFLAECHE_M2_KLASSEN: readonly Klassenband[] = [
  { bisEinschliesslich: 59.999, klasse: '<60' },
  { bisEinschliesslich: 99.999, klasse: '60-99' },
  { bisEinschliesslich: 149.999, klasse: '100-149' },
  { bisEinschliesslich: 249.999, klasse: '150-249' },
  { bisEinschliesslich: Number.POSITIVE_INFINITY, klasse: '250+' },
];

function klassifiziereBand(wert: number, baender: readonly Klassenband[]): string {
  for (const band of baender) {
    if (wert <= band.bisEinschliesslich) {
      return band.klasse;
    }
  }
  // Strukturell unerreichbar (letztes Band ist +Infinity) — Backstop.
  const letztes = baender[baender.length - 1];
  return letztes === undefined ? 'unklassifiziert' : letztes.klasse;
}

/**
 * Liefert den EXPORTIERBAREN Wert einer Einflussgrößen-Zeile:
 * - `personenanzahl`/`nutzflaeche` (numerisch) → Klassenband (s. o.).
 * - alles andere (codiert: `nutzungszweck`/`energietraeger_mix`/
 *   `geraeteabschaffung`) → unverändert der `wertCode` (bereits eine
 *   geschlossene, kleine Werteliste, kein Rohwert-Risiko).
 * - negative/`NaN`-Eingaben werden NICHT klassifiziert (Aufrufer-Fehler,
 *   `undefined` — fail-closed statt eine falsche Klasse zu behaupten).
 */
export function klassifiziereEinflussgroesse(input: {
  readonly groesseCode: string;
  readonly wertNum: number | null;
  readonly wertCode: string | null;
}): string | undefined {
  if (istKlassierbareGroesse(input.groesseCode)) {
    if (input.wertNum === null || !Number.isFinite(input.wertNum) || input.wertNum < 0) {
      return undefined;
    }
    const baender = input.groesseCode === 'personenanzahl' ? PERSONENANZAHL_KLASSEN : NUTZFLAECHE_M2_KLASSEN;
    return klassifiziereBand(input.wertNum, baender);
  }
  return input.wertCode ?? undefined;
}
