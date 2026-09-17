import { csvDokument, csvZeile, formatiereDezimal } from '../domain/csv.util';
import { klassifiziereEinflussgroesse } from '../domain/einflussgroesse-klassierung';
import { klassifiziereZeilenRichtung } from '../domain/einreichung-differenz';
import type { DifferenzZeile } from '../domain/einreichung-differenz';
import { sha256Binaer, sha256Canonical } from '../../berechnung/hash.util';
import { DWD_AENDERUNGSVERMERK, DWD_QUELLENVERMERK } from '../../berechnung/klima/dwd-quellenvermerk.const';
import { KETTE_NICHT_AUFLOESBAR_REGEL_CODE } from '../verfahren.const';
// EINZEILIG, absichtlich: `nachweis-export-renderer.spec.ts` belegt die
// B7-Zweckbindung, indem es JEDE Zeile prueft, die mit `import` beginnt.
// Ein mehrzeiliger Import haette dort eine Zeile ohne erlaubtes Praefix.
import { EXPORT_DATEINAMEN, EXPORT_NACHKOMMASTELLEN, EXPORT_SCHEMA_VERSION_V1, EXPORT_SCHEMA_VERSION_V2, EXPORT_SCHEMA_VERSION_V3, EXPORT_SCHEMA_VERSION_V4, EXPORT_SCHEMA_VERSION_V5, EXPORT_SPALTENPROFIL } from './nachweis-export-spaltenprofil.const';
import { baueEinsparungsnachweisMappe } from './einsparungsnachweis-mappe';
import type { MappeMesspunkt, MappeSystem } from './einsparungsnachweis-mappe';
import type { ExportKategorie } from './nachweis-export-spaltenprofil.const';

/**
 * ADR-0007 D5/B5/B6/B7 (A13/A15/A19/A20) — der kanonische, DETERMINISTISCHE
 * Export-Renderer. REINE Funktion (keine I/O, kein `Date.now()`, kein
 * `Math.random()`): identischer `ExportRenderInput` ⇒ BIT-IDENTISCHES
 * Ergebnis, beliebig oft wiederholbar (Kernanforderung, s. finale Antwort
 * „Determinismus"). Der Aufrufer (`NachweisExportService`) beschafft ALLE
 * Eingangsdaten VORAB (inkl. Pseudonym-Vergabe, die selbst ein
 * Schreibzugriff ist und daher NICHT hier passiert) und ruft diese Funktion
 * dann für (a) die Erst-Erzeugung UND (b) die Download-Verifikation mit
 * IDENTISCHEN Eingaben auf — Abweichung im Ergebnis-Hash ⇒ Datei driftet.
 *
 * **B7-Zweckbindung, strukturell erzwungen:** diese Datei importiert
 * AUSSCHLIESSLICH aus `../domain/**`, `../../berechnung/hash.util`,
 * `../../berechnung/klima/dwd-quellenvermerk.const`, `../verfahren.const`
 * (reine Regel-Code-Konstanten, s. u. — KEIN Repository, KEIN
 * `TransactionHost`) und `./nachweis-export-spaltenprofil.const` — KEIN
 * Import aus `einfluss/**` oder `measurement/**`. Ein Grep-Test
 * (`nachweis-export-renderer.spec.ts`) belegt das Fehlen jeder
 * `einfluss`-Referenz im Quelltext dieser Datei.
 *
 * **Kategorie `rohdaten` (A12, s. `nachweis-export-spaltenprofil.const.ts`):**
 * seit V0028 (`energy.messkonzept_version_energietraeger_system`) BEDINGT
 * gerendert — die A12-Sperre war an „Anschlussnutzer-Sperren strukturell NIE
 * auflösbar" gekoppelt, das gilt seit V0028 nicht mehr UNBEDINGT.
 * `renderExportBundleV1()` prüft dafür `input.header.preflightRegelCodes`
 * auf `KETTE_NICHT_AUFLOESBAR_REGEL_CODE` (`FJ-10`, s. `verfahren.const.ts`
 * und `PreflightService`): fehlt der Code, wird `rohdaten_messwert_tag.csv`
 * aus `input.rohdaten` gerendert (Tages-Snapshot des gebundenen Laufs,
 * `analytics.eingang_messwert_tag` — NIE eine zweite Aggregation auf
 * `measurement.*`, B7); ist er gesetzt, bleibt die Kategorie ausgeschlossen
 * UND das Metablatt weist die Auslassung MIT Grund aus (DE-02-Muster, s.
 * `metablattZeilen()`).
 *
 * **Kategorie `einflussgroessen`:** der Schreibpfad existiert seit V0027/
 * V0028 (`BerechnungslaufService`, dritte Snapshot-Art D7/A5) — `input.
 * einflussgroessen` kann daher Zeilen tragen. `zeilen_anzahl` bleibt
 * dennoch OFT 0: ein einzelner gebundener Berechnungslauf ohne
 * Einflussgrößen-Snapshot (kein System zugeordnet oder keine gültigen
 * Intervalle im Lauf-Zeitraum, s. `BerechnungslaufService`-Kommentar) trägt
 * schlicht keine Zeilen bei. Die Datei wird IMMER gerendert (Header-Zeile,
 * ggf. `zeilen_anzahl=0`) — sichtbare, dokumentierte Leere statt eines
 * fehlenden Dateibündel-Eintrags (DE-02-Muster); `metablattZeilen()` weist
 * die Snapshot-ABDECKUNG über die gebundenen Berechnungsläufe zusätzlich
 * explizit aus (kein stilles Weglassen, s. dort).
 */

export interface RenderBerechnungslauf {
  readonly berechnungslaufId: string;
  readonly endkundeId: string;
  readonly energietraeger: string;
  readonly periodeVon: string;
  readonly periodeBis: string;
  readonly stationRef: string;
  readonly verfahrenCode: string;
  readonly verfahrenVersion: number;
  readonly parameter: Record<string, unknown>;
  readonly parameterHashHex: string;
  readonly rohdatenHashHex: string;
  readonly baselineWertKwh: number;
  readonly grundlastAnteil: number;
  readonly gtzBase: number;
  readonly gtzNorm: number | null;
  readonly baselineNormKwh: number | null;
  readonly qualitaetsStufeMin: string;
  /**
   * V0076 — Messkonzept, mit dem DIESER Lauf gerechnet hat. Entscheidet, was
   * in Spalte „Modelltyp" der Nachweis-Mappe steht und ob dort eine
   * Modellgüte ausgewiesen werden darf.
   */
  readonly messkonzeptTyp: string;
  /** V0076 — Güte der Baseline-Anpassung; `null` beim vereinfachten Verfahren. */
  readonly gueteR2: number | null;
  readonly gueteCvRmsePct: number | null;
  readonly gueteNmbePct: number | null;
  readonly guetePunkte: number | null;
  /** V0076 — Abstand der angepassten von der erfassten Jahres-Baseline in Prozent. */
  readonly baselineAbweichungPct: number | null;
  /** V0027 — `null`, wenn dieser Berechnungslauf KEINEN Einflussgrößen-Snapshot hat (Regelfall in v1, s. `BerechnungslaufService`). NUR für die Metablatt-Abdeckungskennzahl (`metablattZeilen()`) genutzt — wird selbst in KEINER `.csv`-Datei als Spalte gerendert. */
  readonly einflussgroesseSnapshotId: string | null;
}

export interface RenderKlimaTag {
  readonly stationRef: string;
  readonly tag: string;
  readonly tMittel: number;
  readonly gtzTag: number;
}

/**
 * ADR-0007 A12 — bereits auf `(endkundeId, energietraeger)` AUFGELÖSTE Zeile
 * (Auflösung `snapshotId -> (endkundeId, energietraeger)` liegt beim
 * Aufrufer, `NachweisExportService`, analog `RenderBerechnungslauf`/
 * `RenderKlimaTag` — der Renderer selbst bleibt B7-rein, s. Datei-Kopf).
 * `qualitaetMin` bleibt der ROHE `measurement.rang()`-Wert (`smallint`, V0013)
 * — GENAU die eine gefrorene Spalte aus `analytics.eingang_messwert_tag`,
 * KEINE Re-Interpretation in die höherstufige `qualitaets_stufe`-Domäne
 * (`belastbar`/`eingeschraenkt`/`nicht_ausweisbar`) anderer Dateien — eine
 * solche Übersetzung wäre eine im Auftrag NICHT verlangte Neuinterpretation
 * einer bereits eingefrorenen Kennzahl.
 */
export interface RenderRohdatenMesswertTag {
  readonly endkundeId: string;
  readonly energietraeger: string;
  readonly messkanalKey: number;
  readonly tag: string;
  readonly wertKwh: number;
  readonly qualitaetMin: number;
  readonly anzahlMesswerte: number;
}

export interface RenderEinflussgroesse {
  readonly endkundeId: string;
  readonly systemId: string;
  readonly groesseCode: string;
  readonly wertNum: number | null;
  readonly wertCode: string | null;
  readonly gueltigAbMonat: string;
  readonly gueltigBisMonat: string | null;
}

export interface RenderBindung {
  readonly endkundeId: string;
  readonly energietraeger: string;
  readonly monat: string;
  readonly berechnungslaufId: string;
  readonly referenzKwh: number;
  readonly istKwh: number;
  readonly deltaKwh: number;
  readonly deltaAusgewiesenKwh: number;
  readonly qualitaetsStufe: string;
  readonly behandlung: string;
  readonly kandidatenAnzahl: number;
}

export interface RenderErgebnis {
  readonly endkundeId: string;
  readonly energietraeger: string;
  readonly status: string;
  readonly ausschlussGrundCode: string | null;
  readonly referenzKwhSumme: number | null;
  readonly istKwhSumme: number | null;
  readonly einsparungKwhEndenergie: number | null;
  readonly monateAusgewiesen: number;
  readonly monateErsatz: number;
  readonly monateFehlend: number;
  readonly qualitaetsStufeMin: string;
  readonly wissAuswertungAusgenommen: boolean;
}

/**
 * Stammdaten je System fuer die Einsparungsnachweis-Mappe (Exportschema v3).
 *
 * Bewusst eine EIGENE Struktur statt zusaetzlicher Felder an
 * `RenderBerechnungslauf`: Diese Angaben stammen aus `energy.*` und sind
 * keine Rechenergebnisse. Unter v1/v2 bleibt die Liste leer.
 */
export interface RenderNachweisSystem {
  readonly endkundeId: string;
  readonly energietraeger: string;
  /** V0074 — `null`, wenn nicht erfasst. Die Mappe schreibt das aus, statt zu raten. */
  readonly endkundengruppe: string | null;
  /**
   * V0074 — die KENNUNG des Standorts, nicht seine Bezeichnung.
   *
   * Die Bezeichnung liegt feldverschluesselt in `identity.standort_pii` und
   * hat in einem pseudonymisierten Nachweis nichts zu suchen. Der Renderer
   * nummeriert die Standorte je Endkunde durch („Standort 1", „Standort 2") —
   * genau die Darstellung, die die BAFA-Vorlage selbst verwendet.
   * `null` = kein Standort zugeordnet.
   */
  readonly standortId: string | null;
  /** Versionsnummer der Messkonzept-Version, in der Mappe als `B<n>` dargestellt. */
  readonly baselineVersion: number;
  readonly bereinigungsverfahren: string;
  readonly messpunktAnzahl: number;
}

/** Ein Messpunkt der Mappe — ein Messkanal mit seiner Energierichtung (V0074). */
export interface RenderNachweisMesspunkt {
  readonly endkundeId: string;
  readonly energietraeger: string;
  readonly messkanalKey: number;
  readonly richtung: 'bezug' | 'eigenerzeugung' | 'einspeisung';
}

export interface ExportRenderHeader {
  readonly exportId: string;
  readonly einsparlaufId: string;
  readonly ersetztEinsparlaufId: string | null;
  readonly foerderjahrCode: string;
  readonly foerderjahrVonMonat: string;
  /** Projektjahr 1..n — bestimmt die Sollquote der Geraeteerkennung (TB-05). */
  readonly foerderjahrNummer: number;
  readonly foerderjahrBisMonat: string;
  readonly foerderjahrDefinitionQuelle: string;
  readonly einsparlaufArt: string;
  readonly verfahrenCode: string;
  readonly verfahrenVersion: number;
  readonly parameter: Record<string, unknown>;
  readonly bindungsHashHex: string;
  readonly umfangPaareAnzahl: number;
  readonly monateErwartet: number;
  readonly monateGebunden: number;
  readonly gebundeneLaeufeAnzahl: number;
  readonly qualitaetsStufeMin: string;
  readonly preflightId: string;
  readonly preflightProfilCode: string;
  readonly preflightProfilVersion: number;
  readonly preflightErgebnis: string;
  readonly preflightBlockerAnzahl: number;
  readonly preflightWarnungAnzahl: number;
  readonly preflightHinweisAnzahl: number;
  readonly preflightRegelCodes: readonly string[];
  readonly schemaCode: string;
  readonly schemaVersion: number;
  readonly pseudonymProfil: string;
  readonly stationDarstellung: 'pseudonymisiert' | 'klarname';
  readonly zweck: string;
  readonly anfrageRef: string | null;
  /** ISO-8601 UTC (`Z`) — vom Aufrufer VOR dem Rendern fest vergeben und bei jeder Re-Render-Verifikation UNVERÄNDERT wieder übergeben (Determinismus). */
  readonly erzeugtAtUtc: string;
  readonly codeRevision: string;
}

/**
 * Eine Zeile von `geraeteerkennung_quote.csv` (TB-05, Exportschema v2).
 *
 * `quotePct`/`erreicht` sind `null`, wenn es fuer den Zeitraum keine
 * Tageswerte gibt — eine Quote ohne Nenner ist nicht 0, sondern unbekannt.
 */
export interface RenderGeraeteQuote {
  readonly endkundeId: string;
  readonly energietraeger: string;
  readonly gesamtKwh: number;
  readonly zugeordnetKwh: number;
  readonly quotePct: number | null;
  readonly sollQuotePct: number;
  readonly erreicht: boolean | null;
  readonly systemeGesamt: number;
  readonly systemeEntbehrlich: number;
  readonly ohneTageswerte: boolean;
}

/** Eine Zeile von `geraeteerkennung_gruppe.csv` — je (Paar, Gruppe, Methode). */
export interface RenderGeraeteGruppe {
  readonly endkundeId: string;
  readonly energietraeger: string;
  readonly geraetegruppeId: string;
  /** Freitext — geht NUR bei `stationDarstellung==='klarname'` hinaus (A13-Muster). */
  readonly bezeichnung: string;
  readonly methode: string;
  readonly zugeordnetKwh: number;
  readonly anteilPct: number;
  readonly genauigkeitPctMin: number | null;
}

export interface ExportRenderInput {
  readonly header: ExportRenderHeader;
  readonly berechnungslaeufe: readonly RenderBerechnungslauf[];
  readonly klimaTage: readonly RenderKlimaTag[];
  readonly einflussgroessen: readonly RenderEinflussgroesse[];
  /** A12 — s. Datei-Kopf „Kategorie `rohdaten`". IMMER übergeben (auch wenn leer); ob die Datei ÜBERHAUPT gerendert wird, entscheidet `renderExportBundleV1()` selbst anhand `header.preflightRegelCodes` (Determinismus/Single-Source-of-Truth, kein zweiter Entscheidungsort beim Aufrufer). */
  readonly rohdaten: readonly RenderRohdatenMesswertTag[];
  readonly bindungen: readonly RenderBindung[];
  readonly ergebnisse: readonly RenderErgebnis[];
  /** `null`, solange `header.ersetztEinsparlaufId === null` (kein Korrektur-Export). */
  readonly differenzZeilen: readonly DifferenzZeile[] | null;
  /** A20 — vorab vom Aufrufer bestimmt (Repository-Join, s. `analytics-export-lauf.repository.ts`). */
  readonly dwdAttributionErforderlich: boolean;
  /** TB-05 — NUR von `renderExportBundleV2()` gerendert; unter v1 leer übergeben. */
  readonly geraeteQuoten: readonly RenderGeraeteQuote[];
  readonly geraeteGruppen: readonly RenderGeraeteGruppe[];
  /** V0075 (Exportschema v3) — NUR von `renderExportBundleV3()` genutzt; unter v1/v2 leer übergeben. */
  readonly nachweisSysteme: readonly RenderNachweisSystem[];
  readonly nachweisMesspunkte: readonly RenderNachweisMesspunkt[];
  /** Förderjahr-Angaben für die Kopfspalten der Quotendatei. */
  readonly foerderjahr: {
    readonly code: string;
    readonly nummer: number;
    readonly vonMonat: string;
    readonly bisMonat: string;
  };
  readonly endkundePseudonym: (endkundeId: string) => string;
  readonly systemPseudonym: (systemId: string) => string;
  /** A12/A19 — `MK-<lfd>`-Auflösung (Pseudonym-Vergabe, `entitaet_typ='messkanal'`, s. `NachweisExportPseudonymRepository`), analog `endkundePseudonym`. NUR aufgelöst, wenn `rohdaten` tatsächlich gerendert wird (s. `NachweisExportService`). */
  readonly messkanalPseudonym: (messkanalKey: number) => string;
  /** Bei `stationDarstellung==='klarname'` die Identität, sonst die `ST-<lfd>`-Auflösung. */
  readonly stationWert: (stationRef: string) => string;
  /**
   * Bei `stationDarstellung==='klarname'` die Freitext-Bezeichnung, sonst die
   * `GG-<lfd>`-Auflösung (`entitaet_typ='geraetegruppe'`).
   *
   * Dieselbe Behandlung wie bei der Station (A13) und aus demselben Grund:
   * `energy.geraetegruppe.bezeichnung` ist Freitext, und jemand kann eine
   * Gruppe nach einer Person benennen. Für TB-05 wird der Name nicht
   * gebraucht — gefragt sind Quote, Methode und Genauigkeit.
   */
  readonly geraetegruppeWert: (geraetegruppeId: string, bezeichnung: string) => string;
}

export interface ExportRenderDatei {
  readonly dateiname: string;
  readonly kategorie: ExportKategorie;
  /**
   * CSV-Dateien als `string`, die Einsparungsnachweis-Mappe als `Buffer`
   * (Exportschema v3) — XLSX ist ein ZIP-Container und hat keine
   * Textdarstellung, die sich verlustfrei zurueckwandeln liesse.
   */
  readonly inhalt: string | Buffer;
  readonly zeilenAnzahl: number;
  readonly hash: Buffer;
}

export interface ExportRenderErgebnis {
  readonly dateien: readonly ExportRenderDatei[];
  readonly manifestHash: Buffer;
}

function baueDatei(
  dateiname: string,
  kategorie: ExportKategorie,
  header: readonly string[],
  zeilen: readonly (readonly (string | number | boolean | null)[])[],
  praeambelZeile?: string,
): ExportRenderDatei {
  const tabelle = csvDokument(header, zeilen);
  // A20 — „Kurzreferenz im Dateikopf der zwei DWD-abgeleiteten Dateien
  // (BSCW: Dateien reisen einzeln)": eine EINSPALTIGE Vorzeile VOR dem
  // eigentlichen Tabellen-Header, NUR bei `dwdAttributionErforderlich`
  // gesetzt (bedingte Attribution, s. `renderBaselineLauf()`/
  // `renderBaselineKlimaTag()`). Zeigt auf `metablatt.csv` statt den
  // vollen DWD-Text zu duplizieren (`.claude/rules/dependencies.md`: „kein
  // Duplizieren von Vermerkstexten") — trotzdem SELBST hashgeschützter
  // Bestandteil der Datei (der Hash wird über den GESAMTEN Inhalt
  // inkl. Vorzeile gebildet), damit eine still entfernte Vorzeile ebenfalls
  // als Hash-Abweichung auffiele.
  const inhalt = praeambelZeile !== undefined ? `${csvZeile([praeambelZeile])}\r\n${tabelle}` : tabelle;
  return { dateiname, kategorie, inhalt, zeilenAnzahl: zeilen.length, hash: sha256Canonical([inhalt]) };
}

/** A20 — Kurzreferenz (KEIN Volltext-Duplikat, s. `baueDatei()`-Kommentar). Der wörtliche Quellen-/Änderungsvermerk steht EINMAL im Metablatt. */
const DWD_KURZREFERENZ_DATEIKOPF = 'Hinweis: Diese Datei enthaelt DWD-abgeleitete Werte — Quellen-/Aenderungsvermerk (Auflage A-1/A20) siehe metablatt.csv.';

/**
 * A12 — Kategorie `rohdaten`, GENAU der eingefrorene Tages-Snapshot
 * (`analytics.eingang_messwert_tag`, s. `RenderRohdatenMesswertTag`-Dok).
 * Determinismus: fest sortiert nach (Endkunde-Pseudonym, Energieträger,
 * Messkanal-Pseudonym, Tag) — dasselbe Sortier-Muster wie
 * `renderEinspardatenMonat()`.
 */
function renderRohdatenMesswertTag(input: ExportRenderInput): ExportRenderDatei {
  const header = EXPORT_SPALTENPROFIL[EXPORT_DATEINAMEN.ROHDATEN_MESSWERT_TAG];
  const zeilen = [...input.rohdaten]
    .map((r) => ({ ...r, ek: input.endkundePseudonym(r.endkundeId), mk: input.messkanalPseudonym(r.messkanalKey) }))
    .sort((a, b) => {
      if (a.ek !== b.ek) {
        return a.ek < b.ek ? -1 : 1;
      }
      if (a.energietraeger !== b.energietraeger) {
        return a.energietraeger < b.energietraeger ? -1 : 1;
      }
      if (a.mk !== b.mk) {
        return a.mk < b.mk ? -1 : 1;
      }
      return a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0;
    })
    .map((r) => [r.ek, r.energietraeger, r.mk, r.tag, formatiereDezimal(r.wertKwh, EXPORT_NACHKOMMASTELLEN.KWH), r.qualitaetMin, r.anzahlMesswerte]);
  return baueDatei(EXPORT_DATEINAMEN.ROHDATEN_MESSWERT_TAG, 'rohdaten', header, zeilen);
}

function renderBaselineLauf(input: ExportRenderInput): ExportRenderDatei {
  const header = EXPORT_SPALTENPROFIL[EXPORT_DATEINAMEN.BASELINE_LAUF];
  const zeilen = [...input.berechnungslaeufe]
    .sort((a, b) => {
      const ea = input.endkundePseudonym(a.endkundeId);
      const eb = input.endkundePseudonym(b.endkundeId);
      if (ea !== eb) {
        return ea < eb ? -1 : 1;
      }
      if (a.energietraeger !== b.energietraeger) {
        return a.energietraeger < b.energietraeger ? -1 : 1;
      }
      return a.periodeVon < b.periodeVon ? -1 : a.periodeVon > b.periodeVon ? 1 : 0;
    })
    .map((lauf) => [
      input.endkundePseudonym(lauf.endkundeId),
      lauf.energietraeger,
      lauf.berechnungslaufId,
      lauf.periodeVon,
      lauf.periodeBis,
      input.stationWert(lauf.stationRef),
      lauf.verfahrenCode,
      lauf.verfahrenVersion,
      JSON.stringify(lauf.parameter, Object.keys(lauf.parameter).sort()),
      lauf.parameterHashHex,
      lauf.rohdatenHashHex,
      formatiereDezimal(lauf.baselineWertKwh, EXPORT_NACHKOMMASTELLEN.KWH),
      formatiereDezimal(lauf.grundlastAnteil, EXPORT_NACHKOMMASTELLEN.GRUNDLAST_ANTEIL),
      formatiereDezimal(lauf.gtzBase, EXPORT_NACHKOMMASTELLEN.GTZ),
      lauf.gtzNorm === null ? null : formatiereDezimal(lauf.gtzNorm, EXPORT_NACHKOMMASTELLEN.GTZ),
      lauf.baselineNormKwh === null ? null : formatiereDezimal(lauf.baselineNormKwh, EXPORT_NACHKOMMASTELLEN.KWH),
      lauf.qualitaetsStufeMin,
    ]);
  return baueDatei(EXPORT_DATEINAMEN.BASELINE_LAUF, 'baseline', header, zeilen, input.dwdAttributionErforderlich ? DWD_KURZREFERENZ_DATEIKOPF : undefined);
}

function renderBaselineKlimaTag(input: ExportRenderInput): ExportRenderDatei {
  const header = EXPORT_SPALTENPROFIL[EXPORT_DATEINAMEN.BASELINE_KLIMA_TAG];
  const zeilen = [...input.klimaTage]
    .map((k) => ({ ...k, stationWert: input.stationWert(k.stationRef) }))
    .sort((a, b) => {
      if (a.stationWert !== b.stationWert) {
        return a.stationWert < b.stationWert ? -1 : 1;
      }
      if (a.tag !== b.tag) {
        return a.tag < b.tag ? -1 : 1;
      }
      return a.tMittel - b.tMittel;
    })
    .map((k) => [k.stationWert, k.tag, formatiereDezimal(k.tMittel, EXPORT_NACHKOMMASTELLEN.T_MITTEL), formatiereDezimal(k.gtzTag, EXPORT_NACHKOMMASTELLEN.GTZ)]);
  return baueDatei(EXPORT_DATEINAMEN.BASELINE_KLIMA_TAG, 'baseline', header, zeilen, input.dwdAttributionErforderlich ? DWD_KURZREFERENZ_DATEIKOPF : undefined);
}

function renderEinflussgroessenIntervall(input: ExportRenderInput): ExportRenderDatei {
  const header = EXPORT_SPALTENPROFIL[EXPORT_DATEINAMEN.EINFLUSSGROESSEN_INTERVALL];
  const zeilen = [...input.einflussgroessen]
    .sort((a, b) => {
      const ea = input.endkundePseudonym(a.endkundeId);
      const eb = input.endkundePseudonym(b.endkundeId);
      if (ea !== eb) {
        return ea < eb ? -1 : 1;
      }
      const sa = input.systemPseudonym(a.systemId);
      const sb = input.systemPseudonym(b.systemId);
      if (sa !== sb) {
        return sa < sb ? -1 : 1;
      }
      if (a.groesseCode !== b.groesseCode) {
        return a.groesseCode < b.groesseCode ? -1 : 1;
      }
      return a.gueltigAbMonat < b.gueltigAbMonat ? -1 : a.gueltigAbMonat > b.gueltigAbMonat ? 1 : 0;
    })
    .map((e) => [
      input.endkundePseudonym(e.endkundeId),
      input.systemPseudonym(e.systemId),
      e.groesseCode,
      klassifiziereEinflussgroesse({ groesseCode: e.groesseCode, wertNum: e.wertNum, wertCode: e.wertCode }) ?? null,
      e.gueltigAbMonat,
      e.gueltigBisMonat,
    ]);
  return baueDatei(EXPORT_DATEINAMEN.EINFLUSSGROESSEN_INTERVALL, 'einflussgroessen', header, zeilen);
}

function renderEinspardatenMonat(input: ExportRenderInput): ExportRenderDatei {
  const header = EXPORT_SPALTENPROFIL[EXPORT_DATEINAMEN.EINSPARDATEN_MONAT];
  const zeilen = [...input.bindungen]
    .map((b) => ({ ...b, ek: input.endkundePseudonym(b.endkundeId) }))
    .sort((a, b) => {
      if (a.ek !== b.ek) {
        return a.ek < b.ek ? -1 : 1;
      }
      if (a.energietraeger !== b.energietraeger) {
        return a.energietraeger < b.energietraeger ? -1 : 1;
      }
      return a.monat < b.monat ? -1 : a.monat > b.monat ? 1 : 0;
    })
    .map((b) => [
      b.ek,
      b.energietraeger,
      b.monat,
      b.berechnungslaufId,
      formatiereDezimal(b.referenzKwh, EXPORT_NACHKOMMASTELLEN.KWH),
      formatiereDezimal(b.istKwh, EXPORT_NACHKOMMASTELLEN.KWH),
      formatiereDezimal(b.deltaKwh, EXPORT_NACHKOMMASTELLEN.KWH),
      formatiereDezimal(b.deltaAusgewiesenKwh, EXPORT_NACHKOMMASTELLEN.KWH),
      b.qualitaetsStufe,
      b.behandlung,
      b.kandidatenAnzahl,
    ]);
  return baueDatei(EXPORT_DATEINAMEN.EINSPARDATEN_MONAT, 'einspardaten', header, zeilen);
}

function renderEinspardatenJahr(input: ExportRenderInput): ExportRenderDatei {
  const header = EXPORT_SPALTENPROFIL[EXPORT_DATEINAMEN.EINSPARDATEN_JAHR];
  const zeilen = [...input.ergebnisse]
    .map((e) => ({ ...e, ek: input.endkundePseudonym(e.endkundeId) }))
    .sort((a, b) => (a.ek !== b.ek ? (a.ek < b.ek ? -1 : 1) : a.energietraeger < b.energietraeger ? -1 : a.energietraeger > b.energietraeger ? 1 : 0))
    .map((e) => [
      e.ek,
      e.energietraeger,
      e.status,
      e.ausschlussGrundCode,
      e.referenzKwhSumme === null ? null : formatiereDezimal(e.referenzKwhSumme, EXPORT_NACHKOMMASTELLEN.KWH),
      e.istKwhSumme === null ? null : formatiereDezimal(e.istKwhSumme, EXPORT_NACHKOMMASTELLEN.KWH),
      e.einsparungKwhEndenergie === null ? null : formatiereDezimal(e.einsparungKwhEndenergie, EXPORT_NACHKOMMASTELLEN.KWH),
      e.monateAusgewiesen,
      e.monateErsatz,
      e.monateFehlend,
      e.qualitaetsStufeMin,
      e.wissAuswertungAusgenommen,
    ]);
  return baueDatei(EXPORT_DATEINAMEN.EINSPARDATEN_JAHR, 'einspardaten', header, zeilen);
}

function renderEinspardatenDifferenz(input: ExportRenderInput, differenzZeilen: readonly DifferenzZeile[]): ExportRenderDatei {
  const header = EXPORT_SPALTENPROFIL[EXPORT_DATEINAMEN.EINSPARDATEN_DIFFERENZ];
  const zeilen = [...differenzZeilen]
    .map((z) => ({ ...z, ek: input.endkundePseudonym(z.endkundeId) }))
    .sort((a, b) => (a.ek !== b.ek ? (a.ek < b.ek ? -1 : 1) : a.energietraeger < b.energietraeger ? -1 : a.energietraeger > b.energietraeger ? 1 : 0))
    .map((z) => [
      z.ek,
      z.energietraeger,
      z.wertAltKwh === null ? null : formatiereDezimal(z.wertAltKwh, EXPORT_NACHKOMMASTELLEN.KWH),
      z.wertNeuKwh === null ? null : formatiereDezimal(z.wertNeuKwh, EXPORT_NACHKOMMASTELLEN.KWH),
      formatiereDezimal(z.deltaKwh, EXPORT_NACHKOMMASTELLEN.KWH),
      klassifiziereZeilenRichtung(z.deltaKwh),
    ]);
  return baueDatei(EXPORT_DATEINAMEN.EINSPARDATEN_DIFFERENZ, 'einspardaten', header, zeilen);
}

/**
 * A13 NAHT (bewusst NICHT gebaut, s. finale Antwort „Design-Entscheidungen"):
 * die im ADR genannte k≥5-Regel („Sammelklassen statt Ausschluss, ohne
 * Klima-Reihe") betrifft AUSSCHLIESSLICH einen wissenschaftlichen Auszug
 * (`zweck='wissenschaftliche_auswertung'`) — der ist Auflage A23 fail-closed
 * gesperrt (DB-CHECK). Diese Funktion kennt daher HEUTE nur EINEN
 * Stations-Pfad (Ehrlichkeitsklausel bei `pseudonymisiert`, Klarname sonst)
 * — der Tag, an dem A23 geklärt wird, braucht eine ZWEITE, k-anonymitäts-
 * geprüfte Variante dieser Funktion (Sammelklasse statt `ST-<lfd>`, KEINE
 * Klima-Tagesreihe), nicht Teil dieses Pakets.
 */
/**
 * Auflage A15/D7, DE-02-Muster ("sichtbare Auslassung statt stillem
 * Weglassen") — die Snapshot-ABDECKUNG über die gebundenen Berechnungsläufe
 * wird IMMER aggregiert ausgewiesen (Zählwerte, KEINE Pro-Endkunde-
 * Aufschlüsselung — das Metablatt ist keine zweite `einspardaten_jahr.csv`).
 * Ein fehlender Snapshot ist in v1 der Regelfall (keine System-Zuordnung
 * gepflegt) — die Formulierung benennt das ausdrücklich als "kein
 * unterdrückter Datenbestand", damit die Kategorie 0-Zeilen NICHT wie ein
 * verschwiegener Befund wirkt.
 */
function einflussgroessenAbdeckungsHinweis(berechnungslaeufe: readonly RenderBerechnungslauf[]): string {
  const gesamt = berechnungslaeufe.length;
  const mitSnapshot = berechnungslaeufe.filter((b) => b.einflussgroesseSnapshotId !== null).length;
  if (gesamt === 0) {
    return 'keine gebundenen Berechnungsläufe — Kategorie strukturell leer, kein unterdrückter Datenbestand.';
  }
  if (mitSnapshot === 0) {
    return `strukturell 0 Zeilen — keiner der ${String(gesamt)} gebundenen Berechnungsläufe hat einen Einflussgrößen-Snapshot (ADR-0006 D7/A5: kein System dem Messkonzept zugeordnet oder keine gültigen Intervalle im Lauf-Zeitraum); kein unterdrückter Datenbestand.`;
  }
  if (mitSnapshot === gesamt) {
    return `enthalten — alle ${String(gesamt)} gebundenen Berechnungsläufe haben einen Einflussgrößen-Snapshot (klassiert, Auflage A15).`;
  }
  return `teilweise enthalten — ${String(mitSnapshot)} von ${String(gesamt)} gebundenen Berechnungsläufen haben einen Einflussgrößen-Snapshot (klassiert, Auflage A15); für die übrigen war zum Berechnungszeitpunkt keine System-Zuordnung/kein gültiges Intervall vorhanden (kein unterdrückter Datenbestand, DE-02-Muster).`;
}

/** A12 — s. Datei-Kopf „Kategorie `rohdaten`" und `KETTE_NICHT_AUFLOESBAR_REGEL_CODE` (`verfahren.const.ts`). EINZIGE Stelle, die über die Aufnahme der Kategorie entscheidet (`renderExportBundleV1()` fragt GENAU diese Funktion). */
function rohdatenErlaubt(input: ExportRenderInput): boolean {
  return !input.header.preflightRegelCodes.includes(KETTE_NICHT_AUFLOESBAR_REGEL_CODE);
}

function metablattZeilen(input: ExportRenderInput): (readonly [string, string | number | boolean | null])[] {
  const h = input.header;
  const stationEhrlichkeitsklausel =
    h.stationDarstellung === 'pseudonymisiert'
      ? 'Die Stationsersetzung ist KEINE Anonymisierung — die mitgelieferte Klima-Tagesreihe macht die Station gegen frei verfügbare DWD-Open-Data-Referenzreihen bestimmbar (ADR-0007 Teil C, Auflage A13).'
      : 'Station im Klarnamen ausgewiesen (aktenkundige Anforderung, s. anfrage_ref).';
  return [
    ['export_id', h.exportId],
    ['export_schema_code', h.schemaCode],
    ['export_schema_version', h.schemaVersion],
    ['erzeugt_at_utc', h.erzeugtAtUtc],
    ['renderer_code_revision', h.codeRevision],
    ['foerderjahr_code', h.foerderjahrCode],
    ['foerderjahr_von_monat', h.foerderjahrVonMonat],
    ['foerderjahr_bis_monat', h.foerderjahrBisMonat],
    ['foerderjahr_definition_quelle', h.foerderjahrDefinitionQuelle],
    ['einsparlauf_id', h.einsparlaufId],
    ['einsparlauf_art', h.einsparlaufArt],
    ['ersetzt_einsparlauf_id', h.ersetztEinsparlaufId],
    ['verfahren_code', h.verfahrenCode],
    ['verfahren_version', h.verfahrenVersion],
    ['aggregations_parameter_json', JSON.stringify(h.parameter, Object.keys(h.parameter).sort())],
    ['bindungs_hash_hex', h.bindungsHashHex],
    ['umfang_paare_anzahl', h.umfangPaareAnzahl],
    ['monate_erwartet', h.monateErwartet],
    ['monate_gebunden', h.monateGebunden],
    ['gebundene_laeufe_anzahl', h.gebundeneLaeufeAnzahl],
    ['jahres_qualitaetsstufe_min_ueber_alle_paare', h.qualitaetsStufeMin],
    ['preflight_id', h.preflightId],
    ['preflight_profil_code', h.preflightProfilCode],
    ['preflight_profil_version', h.preflightProfilVersion],
    ['preflight_ergebnis', h.preflightErgebnis],
    ['preflight_blocker_anzahl', h.preflightBlockerAnzahl],
    ['preflight_warnung_anzahl', h.preflightWarnungAnzahl],
    ['preflight_hinweis_anzahl', h.preflightHinweisAnzahl],
    ['preflight_regel_codes', [...h.preflightRegelCodes].sort().join(',')],
    ['pseudonymisierungsprofil', h.pseudonymProfil],
    ['station_darstellung', h.stationDarstellung],
    ['station_ehrlichkeitsklausel', stationEhrlichkeitsklausel],
    ['zweck', h.zweck],
    ['anfrage_ref', h.anfrageRef],
    [
      'dwd_quellenvermerk',
      input.dwdAttributionErforderlich
        ? DWD_QUELLENVERMERK
        : 'nicht anwendbar — in den gebundenen Berechnungsläufen wurden keine DWD-Klimadaten verwendet (Auflage A20, bedingte Attribution)',
    ],
    [
      'dwd_aenderungsvermerk',
      input.dwdAttributionErforderlich
        ? DWD_AENDERUNGSVERMERK
        : 'nicht anwendbar — s. dwd_quellenvermerk',
    ],
    [
      'kategorie_rohdaten_status',
      rohdatenErlaubt(input)
        ? `enthalten — ${String(input.rohdaten.length)} Zeile(n) analytics.eingang_messwert_tag (Auflage A12)`
        : `nicht enthalten — Auflage A12/${KETTE_NICHT_AUFLOESBAR_REGEL_CODE}: Anschlussnutzer-Sperrstatus fuer mindestens ein System im Scope dieses Laufs strukturell nicht aufloesbar (keine mvet-System-Zuordnung).`,
    ],
    ['kategorie_einflussgroessen_hinweis', einflussgroessenAbdeckungsHinweis(input.berechnungslaeufe)],
    ['wiss_auswertung_ausgenommen_anzahl', input.ergebnisse.filter((e) => e.wissAuswertungAusgenommen).length],
  ];
}

/**
 * TB-05 ([Q3] Kap. 5) — die Quote je (Endkunde, Energietraeger) gegen die
 * Sollquote des Projektjahres.
 *
 * **Der Export rechnet nichts neu.** Die Zahlen kommen aus derselben Abfrage,
 * die auch die Betriebsoberflaeche und das Kundendokument speist
 * (`GeraeteerkennungRepository`) — saehe die Behoerde eine andere Quote als
 * der Betrieb, waere jede Erklaerung dafuer schlechter als der Fehler.
 *
 * Leere Felder statt Nullen bei fehlenden Tageswerten: Eine Quote ohne Nenner
 * ist unbekannt, und eine 0 wuerde als Ergebnis gelesen — hier ausgerechnet
 * als „Auflage verfehlt".
 */
function renderGeraeteerkennungQuote(input: ExportRenderInput): ExportRenderDatei {
  const header = EXPORT_SPALTENPROFIL[EXPORT_DATEINAMEN.GERAETEERKENNUNG_QUOTE];
  const zeilen = [...input.geraeteQuoten]
    .map((q) => ({ ...q, ek: input.endkundePseudonym(q.endkundeId) }))
    .sort((a, b) => (a.ek !== b.ek ? (a.ek < b.ek ? -1 : 1) : a.energietraeger < b.energietraeger ? -1 : a.energietraeger > b.energietraeger ? 1 : 0))
    .map((q) => [
      q.ek,
      q.energietraeger,
      input.foerderjahr.code,
      input.foerderjahr.nummer,
      input.foerderjahr.vonMonat,
      input.foerderjahr.bisMonat,
      formatiereDezimal(q.gesamtKwh, EXPORT_NACHKOMMASTELLEN.KWH),
      formatiereDezimal(q.zugeordnetKwh, EXPORT_NACHKOMMASTELLEN.KWH),
      q.quotePct === null ? null : formatiereDezimal(q.quotePct, EXPORT_NACHKOMMASTELLEN.PROZENT),
      formatiereDezimal(q.sollQuotePct, EXPORT_NACHKOMMASTELLEN.PROZENT),
      q.erreicht,
      q.systemeGesamt,
      q.systemeEntbehrlich,
      q.ohneTageswerte,
    ]);
  return baueDatei(EXPORT_DATEINAMEN.GERAETEERKENNUNG_QUOTE, 'geraeteerkennung', header, zeilen);
}

/**
 * TB-05 — die „Zuordnungs-Metadaten je Verbrauchsanteil": je (Paar, Gruppe,
 * METHODE) eine Zeile mit Anteil und Genauigkeit.
 *
 * Die Gruppe erscheint als `GG-<lfd>`; ihre Freitext-Bezeichnung geht nur bei
 * `stationDarstellung==='klarname'` hinaus (A13-Muster, s.
 * `geraetegruppeWert`). Der Messkanal kommt hier NICHT vor — er haengt an
 * der A12-Rohdaten-Freigabe, die Quote nicht.
 */
function renderGeraeteerkennungGruppe(input: ExportRenderInput): ExportRenderDatei {
  const header = EXPORT_SPALTENPROFIL[EXPORT_DATEINAMEN.GERAETEERKENNUNG_GRUPPE];
  const zeilen = [...input.geraeteGruppen]
    .map((g) => ({ ...g, ek: input.endkundePseudonym(g.endkundeId), gg: input.geraetegruppeWert(g.geraetegruppeId, g.bezeichnung) }))
    .sort((a, b) => {
      if (a.ek !== b.ek) {
        return a.ek < b.ek ? -1 : 1;
      }
      if (a.energietraeger !== b.energietraeger) {
        return a.energietraeger < b.energietraeger ? -1 : 1;
      }
      if (a.gg !== b.gg) {
        return a.gg < b.gg ? -1 : 1;
      }
      return a.methode < b.methode ? -1 : a.methode > b.methode ? 1 : 0;
    })
    .map((g) => [
      g.ek,
      g.energietraeger,
      g.gg,
      g.methode,
      formatiereDezimal(g.zugeordnetKwh, EXPORT_NACHKOMMASTELLEN.KWH),
      formatiereDezimal(g.anteilPct, EXPORT_NACHKOMMASTELLEN.PROZENT),
      g.genauigkeitPctMin === null ? null : formatiereDezimal(g.genauigkeitPctMin, EXPORT_NACHKOMMASTELLEN.PROZENT),
    ]);
  return baueDatei(EXPORT_DATEINAMEN.GERAETEERKENNUNG_GRUPPE, 'geraeteerkennung', header, zeilen);
}

function renderMetablatt(input: ExportRenderInput): ExportRenderDatei {
  const header = EXPORT_SPALTENPROFIL[EXPORT_DATEINAMEN.METABLATT];
  const zeilen = metablattZeilen(input);
  return baueDatei(EXPORT_DATEINAMEN.METABLATT, 'meta', header, zeilen);
}

function renderManifest(dateien: readonly ExportRenderDatei[]): { readonly datei: ExportRenderDatei; readonly manifestHash: Buffer } {
  const sortiert = [...dateien].sort((a, b) => (a.dateiname < b.dateiname ? -1 : a.dateiname > b.dateiname ? 1 : 0));
  const kanonischeZeilen = sortiert.map((d) => `${d.dateiname}|${d.kategorie}|${String(d.zeilenAnzahl)}|${d.hash.toString('hex')}`);
  const manifestHash = sha256Canonical(kanonischeZeilen);
  const header = EXPORT_SPALTENPROFIL[EXPORT_DATEINAMEN.MANIFEST];
  const csvZeilen = sortiert.map((d) => [d.dateiname, d.kategorie, d.zeilenAnzahl, d.hash.toString('hex')]);
  const datei = baueDatei(EXPORT_DATEINAMEN.MANIFEST, 'meta', header, csvZeilen);
  return { datei, manifestHash };
}

/**
 * Rendert das vollständige Dateibündel deterministisch. `rohdaten_
 * messwert_tag.csv` wird NUR aufgenommen, wenn `rohdatenErlaubt(input)`
 * zutrifft (A12, s. dortige Funktion + Datei-Kopf „Kategorie `rohdaten`").
 * `input.differenzZeilen !== null` ⇒ zusätzlich `einspardaten_differenz.csv`
 * (Korrektur-Export, B7 Punkt 4).
 */
export function renderExportBundleV1(input: ExportRenderInput): ExportRenderErgebnis {
  const dateien: ExportRenderDatei[] = [];
  if (rohdatenErlaubt(input)) {
    dateien.push(renderRohdatenMesswertTag(input));
  }
  dateien.push(
    renderBaselineLauf(input),
    renderBaselineKlimaTag(input),
    renderEinflussgroessenIntervall(input),
    renderEinspardatenMonat(input),
    renderEinspardatenJahr(input),
  );
  if (input.differenzZeilen !== null) {
    dateien.push(renderEinspardatenDifferenz(input, input.differenzZeilen));
  }
  dateien.push(renderMetablatt(input));

  const { datei: manifestDatei, manifestHash } = renderManifest(dateien);
  return { dateien: [...dateien, manifestDatei], manifestHash };
}

/**
 * Exportschema **v2** (V0064) — v1 plus die beiden TB-05-Dateien.
 *
 * Bewusst eine eigene Funktion und KEIN Flag in `renderExportBundleV1()`:
 * Der Download rendert einen bestehenden Export NEU und vergleicht gegen
 * seinen gespeicherten Hash (ADR-0007 D5/B5) — genau das ist der Beleg, dass
 * eine eingereichte Datei nicht gedriftet ist. Wuerde v1 ab sofort zwei
 * Dateien mehr erzeugen, waere jeder bereits eingereichte Nachweis
 * rueckwirkend „ungueltig". v1 bleibt deshalb unangetastet; die Auswahl
 * trifft `waehleRenderer()` anhand der am Export GESPEICHERTEN Version.
 *
 * Die beiden Dateien werden IMMER gerendert, auch leer. Eine fehlende Datei
 * waere von „keine Zuordnung gepflegt" nicht zu unterscheiden — und der
 * Unterschied ist bei einer Quotenauflage der ganze Punkt.
 */
export function renderExportBundleV2(input: ExportRenderInput): ExportRenderErgebnis {
  const dateien: ExportRenderDatei[] = [];
  if (rohdatenErlaubt(input)) {
    dateien.push(renderRohdatenMesswertTag(input));
  }
  dateien.push(
    renderBaselineLauf(input),
    renderBaselineKlimaTag(input),
    renderEinflussgroessenIntervall(input),
    renderEinspardatenMonat(input),
    renderEinspardatenJahr(input),
  );
  if (input.differenzZeilen !== null) {
    dateien.push(renderEinspardatenDifferenz(input, input.differenzZeilen));
  }
  dateien.push(
    renderGeraeteerkennungQuote(input),
    renderGeraeteerkennungGruppe(input),
    renderMetablatt(input),
  );

  const { datei: manifestDatei, manifestHash } = renderManifest(dateien);
  return { dateien: [...dateien, manifestDatei], manifestHash };
}

/**
 * Baut `einsparungsnachweis.xlsx` — den technischen Erfolgsnachweis in der
 * Form der BAFA-Vorlage (Exportschema v3, V0075).
 *
 * Die Systeme der Mappe sind die Berechnungslaeufe des Buendels, in stabiler
 * Reihenfolge durchnummeriert (`S-01`, `S-02`, …). Stabil heisst: sortiert
 * nach (Endkunde-Pseudonym, Energietraeger) — ohne feste Sortierung haetten
 * zwei Renderdurchlaeufe desselben Exports verschiedene Nummern, und die
 * Hash-Verifikation schluege fehl.
 */
function renderEinsparungsnachweis(input: ExportRenderInput): ExportRenderDatei {
  const stammdatenJePaar = new Map(
    input.nachweisSysteme.map((s) => [`${s.endkundeId}|${s.energietraeger}`, s]),
  );
  const quoteJePaar = new Map(input.geraeteQuoten.map((q) => [`${q.endkundeId}|${q.energietraeger}`, q]));
  const ergebnisJePaar = new Map(input.ergebnisse.map((e) => [`${e.endkundeId}|${e.energietraeger}`, e]));
  const rohdatenErlaubtHier = rohdatenErlaubt(input);

  // Tagessummen je Messkanal — die Jahressumme eines Messpunkts. Nur, wenn
  // die Rohdaten-Kategorie fuer diesen Export ueberhaupt gerendert wird
  // (A12): Ein Umweg an der Sperre vorbei waere genau das, was sie verhindern
  // soll.
  const summeJeKanal = new Map<number, number>();
  if (rohdatenErlaubtHier) {
    for (const zeile of input.rohdaten) {
      summeJeKanal.set(zeile.messkanalKey, (summeJeKanal.get(zeile.messkanalKey) ?? 0) + zeile.wertKwh);
    }
  }

  // Σ GTZ_ist je Lauf: die Gradtagzahlen seiner Station ueber seinen
  // Zeitraum. Dieselbe Groesse, die im Lauf selbst den Witterungsanteil
  // skaliert — hier nur aufsummiert statt monatsweise angewandt.
  //
  // ZUERST JE (Station, Tag) ENTDOPPELN. `input.klimaTage` ist die Vereinigung
  // der Klima-Snapshots ALLER Laeufe des Buendels, und die ueberlappen sich:
  // Jeder Lauf friert seinen eigenen Bereich ein (Foerderjahr PLUS die
  // Baseline-Bezugszeitraeume), und die Bereiche zweier Energietraeger
  // desselben Kunden decken dieselben Tage ab. Ohne Entdopplung zaehlt jeder
  // gemeinsame Tag mehrfach — gegen den Pilotbestand A geprueft: X₁ stand
  // bei 7 435,96 statt 3 718, also exakt doppelt, und der
  // Baseline-Erwartungswert damit ebenso.
  const gtzJeStationUndTag = new Map<string, number>();
  for (const tag of input.klimaTage) {
    gtzJeStationUndTag.set(`${tag.stationRef}|${tag.tag}`, tag.gtzTag);
  }
  const gtzSumme = (stationRef: string, von: string, bis: string): number => {
    let summe = 0;
    for (const [schluessel, gtzTag] of gtzJeStationUndTag) {
      const trenner = schluessel.indexOf('|');
      const station = schluessel.slice(0, trenner);
      const tag = schluessel.slice(trenner + 1);
      if (station === stationRef && tag >= von && tag < bis) {
        summe += gtzTag;
      }
    }
    return summe;
  };

  const laeufeSortiert = [...input.berechnungslaeufe].sort((a, b) => {
    const pa = input.endkundePseudonym(a.endkundeId);
    const pb = input.endkundePseudonym(b.endkundeId);
    return pa === pb ? a.energietraeger.localeCompare(b.energietraeger) : pa.localeCompare(pb);
  });

  // Standorte je Endkunde durchnummerieren — „Standort 1", „Standort 2".
  // Die Bezeichnung bleibt draussen (sie ist verschluesselte PII); die
  // Nummer sagt dem Leser, was er wissen muss: ob zwei Systeme am selben
  // Ort haengen oder nicht.
  const standortNummerJeEndkunde = new Map<string, Map<string, number>>();
  for (const stamm of [...input.nachweisSysteme].sort((a, b) =>
    `${a.endkundeId}|${a.standortId ?? ''}`.localeCompare(`${b.endkundeId}|${b.standortId ?? ''}`),
  )) {
    if (stamm.standortId === null) {
      continue;
    }
    const jeKunde = standortNummerJeEndkunde.get(stamm.endkundeId) ?? new Map<string, number>();
    if (!jeKunde.has(stamm.standortId)) {
      jeKunde.set(stamm.standortId, jeKunde.size + 1);
    }
    standortNummerJeEndkunde.set(stamm.endkundeId, jeKunde);
  }
  const standortText = (endkundeId: string, standortId: string | null): string | null => {
    if (standortId === null) {
      return null;
    }
    const nummer = standortNummerJeEndkunde.get(endkundeId)?.get(standortId);
    return nummer === undefined ? null : `Standort ${String(nummer)}`;
  };

  const systemIdJePaar = new Map<string, string>();
  const systeme: MappeSystem[] = laeufeSortiert.map((lauf, i) => {
    const schluessel = `${lauf.endkundeId}|${lauf.energietraeger}`;
    const systemId = `S-${String(i + 1).padStart(2, '0')}`;
    systemIdJePaar.set(schluessel, systemId);

    const stamm = stammdatenJePaar.get(schluessel);
    const quote = quoteJePaar.get(schluessel);
    const ergebnis = ergebnisJePaar.get(schluessel);
    const istX1 = gtzSumme(lauf.stationRef, lauf.periodeVon, lauf.periodeBis);

    return {
      systemId,
      endkundePseudonym: input.endkundePseudonym(lauf.endkundeId),
      endkundengruppe: stamm?.endkundengruppe ?? null,
      standort: stamm === undefined ? null : standortText(lauf.endkundeId, stamm.standortId),
      energietraeger: lauf.energietraeger,
      messpunktAnzahl: stamm?.messpunktAnzahl ?? 0,
      baselineVersion: stamm === undefined ? 'B1' : `B${String(stamm.baselineVersion)}`,
      bemerkung: null,
      messkonzeptTyp: lauf.messkonzeptTyp,
      // a0 und b1 stehen in BEIDEN Messkonzepten in denselben Spalten des
      // Laufs — der vereinfachte Weg setzt sie aus (B, g, GTZ_base), der
      // Standard-Weg passt sie an und rechnet sie in dieselben Groessen
      // zurueck (V0076). Der Renderer muss die Wege deshalb nicht
      // unterscheiden; nur die Guete daneben sagt, welcher es war.
      grundlastA0Kwh: runde(lauf.baselineWertKwh * lauf.grundlastAnteil, 3),
      koeffizientB1:
        lauf.gtzBase === 0 ? 0 : runde((lauf.baselineWertKwh * (1 - lauf.grundlastAnteil)) / lauf.gtzBase, 6),
      istX1: runde(istX1, 2),
      bereinigungsverfahren: stamm?.bereinigungsverfahren ?? 'Gradtagzahlverfahren (VDI 3807)',
      bestimmtheitsmass: lauf.gueteR2,
      cvRmsePct: lauf.gueteCvRmsePct,
      nmbePct: lauf.gueteNmbePct,
      guetePunkte: lauf.guetePunkte,
      baselineAbweichungPct: lauf.baselineAbweichungPct,
      // Ohne Rohdaten traegt Blatt 3 die gespeicherten Bilanzsummen: Der
      // gesamte Ist-Verbrauch gilt als Bezug, weil die Aufteilung nach
      // Richtung nur aus den gesperrten Rohdaten herleitbar waere.
      summeBezugKwh: rohdatenErlaubtHier ? null : (ergebnis?.istKwhSumme ?? null),
      summeEigenerzeugungKwh: rohdatenErlaubtHier ? null : 0,
      summeEinspeisungKwh: rohdatenErlaubtHier ? null : 0,
      datenverfuegbarkeitPct: null,
      geraeteerkennungPct: quote?.quotePct ?? null,
      // Kap. 9.1 — s. `MappeSystem.zeitanteil`. Ohne Ergebniszeile bleibt 1;
      // dann gibt es auch keine Monatsaufteilung, gegen die zu korrigieren
      // waere.
      monateAusgewiesen: ergebnis?.monateAusgewiesen ?? 0,
      monateGesamt: monateGesamt(ergebnis),
      zeitanteil:
        ergebnis === undefined || monateGesamt(ergebnis) === 0
          ? 1
          : runde(ergebnis.monateAusgewiesen / monateGesamt(ergebnis), 4),
    };
  });

  const messpunkte: MappeMesspunkt[] = [...input.nachweisMesspunkte]
    .sort((a, b) => a.messkanalKey - b.messkanalKey)
    .flatMap((mp) => {
      const systemId = systemIdJePaar.get(`${mp.endkundeId}|${mp.energietraeger}`);
      if (systemId === undefined) {
        // Ein Messkanal ohne Lauf im Buendel gehoert nicht in diesen
        // Nachweis — er wird ausgelassen, nicht mit einem erfundenen System
        // verknuepft.
        return [];
      }
      const pseudonym = input.messkanalPseudonym(mp.messkanalKey);
      return [
        {
          messpunktId: `${systemId}-${pseudonym}`,
          systemId,
          zaehlerPseudonym: pseudonym,
          richtung: mp.richtung,
          summeKwh: rohdatenErlaubtHier ? runde(summeJeKanal.get(mp.messkanalKey) ?? 0, 3) : null,
          qualitaetsFlag: 'gemessen',
        },
      ];
    });

  const inhalt = baueEinsparungsnachweisMappe({
    foerderjahrCode: input.foerderjahr.code,
    foerderjahrVonMonat: input.foerderjahr.vonMonat,
    foerderjahrBisMonat: input.foerderjahr.bisMonat,
    erzeugtAtUtc: input.header.erzeugtAtUtc,
    systeme,
    messpunkte,
    rohdatenEnthalten: rohdatenErlaubtHier,
  });

  return {
    dateiname: EXPORT_DATEINAMEN.EINSPARUNGSNACHWEIS,
    kategorie: 'einsparungsnachweis',
    inhalt,
    zeilenAnzahl: systeme.length + messpunkte.length,
    hash: sha256Binaer(inhalt),
  };
}

/** Monate des Zeitraums = ausgewiesen + ersetzt + fehlend (B12.4: disjunkt). */
function monateGesamt(ergebnis: RenderErgebnis | undefined): number {
  return ergebnis === undefined ? 0 : ergebnis.monateAusgewiesen + ergebnis.monateErsatz + ergebnis.monateFehlend;
}

function runde(wert: number, stellen: number): number {
  const faktor = 10 ** stellen;
  return Math.round(wert * faktor) / faktor;
}

/**
 * Exportschema **v3** (V0075) — v2 plus `einsparungsnachweis.xlsx`.
 *
 * Eigene Funktion aus demselben Grund wie bei v2: Der Download rendert
 * bestehende Exporte NEU und prueft gegen ihren Hash. v2 bleibt unangetastet.
 */
export function renderExportBundleV3(input: ExportRenderInput): ExportRenderErgebnis {
  const v2 = renderExportBundleV2(input);
  // Die Mappe VOR dem Manifest einsortieren — das Manifest listet alle
  // vorangehenden Dateien samt Hash und muss sie deshalb kennen.
  const ohneManifest = v2.dateien.filter((d) => d.dateiname !== EXPORT_DATEINAMEN.MANIFEST);
  const dateien = [...ohneManifest, renderEinsparungsnachweis(input)];
  const { datei: manifestDatei, manifestHash } = renderManifest(dateien);
  return { dateien: [...dateien, manifestDatei], manifestHash };
}

/**
 * Waehlt den Renderer anhand der Schema-Version des Exports.
 *
 * Eine unbekannte Version wird fail-closed abgewiesen: Lieber ein Download,
 * der mit klarer Meldung scheitert, als einer, der stillschweigend das
 * falsche Buendel erzeugt und dann an der Hash-Pruefung „driftet".
 */
export function waehleRenderer(schemaVersion: number): (input: ExportRenderInput) => ExportRenderErgebnis {
  if (schemaVersion === EXPORT_SCHEMA_VERSION_V1) {
    return renderExportBundleV1;
  }
  if (schemaVersion === EXPORT_SCHEMA_VERSION_V2) {
    return renderExportBundleV2;
  }
  // v3, v4 und v5 teilen sich den Renderer — s. `EXPORT_SCHEMA_VERSION_V5`.
  if (
    schemaVersion === EXPORT_SCHEMA_VERSION_V3 ||
    schemaVersion === EXPORT_SCHEMA_VERSION_V4 ||
    schemaVersion === EXPORT_SCHEMA_VERSION_V5
  ) {
    return renderExportBundleV3;
  }
  throw new Error(
    `Unbekannte Exportschema-Version ${String(schemaVersion)} — kein Renderer vorhanden (bekannt: ${String(EXPORT_SCHEMA_VERSION_V1)}, ${String(EXPORT_SCHEMA_VERSION_V2)}, ${String(EXPORT_SCHEMA_VERSION_V3)}, ${String(EXPORT_SCHEMA_VERSION_V4)}, ${String(EXPORT_SCHEMA_VERSION_V5)}).`,
  );
}
