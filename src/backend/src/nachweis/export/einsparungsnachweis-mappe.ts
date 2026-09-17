import { baueXlsx, type XlsxBlatt, type XlsxZelle } from '../../common/xlsx/xlsx-schreiber';

/**
 * Der technische Erfolgsnachweis in der Form der BAFA-Vorlage
 * (`ESZ_Einsparungsnachweis_Vorlage.xlsx`, End-Verwendungsnachweis, Basis
 * [Q3] Kap. 9 + VN-Merkblatt Kap. 4.3.4) — neun Blätter.
 *
 * **Warum eine Mappe neben den CSVs.** Das Exportbündel enthält dieselben
 * Zahlen, aber in der DE-03-Gliederung des Datenkatalogs. Die Behörde
 * erwartet sie in der Gliederung ihres Formulars. Diese Übersetzung von Hand
 * zu machen, wäre genau die Arbeit, die eine Software abnehmen soll — und
 * jeder Handgriff dabei eine Fehlerquelle.
 *
 * **Die Mappe trägt FORMELN, nicht nur Werte.** Blätter 3, 5, 6a, 6b und 7
 * rechnen sich aus den Eingabeblättern selbst, mit denselben SUMIFS- und
 * INDEX/MATCH-Ausdrücken wie die Vorlage. Der Empfänger kann jede Zahl
 * nachvollziehen, statt sie glauben zu müssen. Der Preis steht im
 * Anleitungsblatt: Blatt 5 rechnet den Baseline-Erwartungswert aus a₀ und b₁
 * neu und weicht dadurch rundungsbedingt um etwa 0,01 % vom gespeicherten
 * Berechnungslauf ab.
 *
 * **Was die Mappe NICHT behauptet.** Die Vorlage ist für das
 * Standard-Messkonzept gebaut (lineare Regression mit Modellgüte); die
 * Software rechnet das vereinfachte (ADR-0006 F1 = (a)). Das Modell lässt
 * sich in die lineare Form überführen — die Witterungsbereinigung IST linear
 * in der Gradtagzahl —, aber es wurde nichts gefittet: **R² bleibt leer.**
 * Eine Zahl dort wäre die Behauptung einer Güte, die nie gemessen wurde.
 * Dasselbe gilt für die zweite Einflussgröße, die ausgeschlossenen Zeiträume
 * und den Primärenergiefaktor. Das Anleitungsblatt sagt es dem Leser.
 */

/** Ein System der Mappe = ein (Endkunde, Energieträger)-Paar eines Berechnungslaufs. */
export interface MappeSystem {
  /** Laufende Kennung `S-01`, `S-02`, … — die Vorlage nummeriert Systeme so. */
  readonly systemId: string;
  readonly endkundePseudonym: string;
  readonly endkundengruppe: string | null;
  readonly standort: string | null;
  readonly energietraeger: string;
  readonly messpunktAnzahl: number;
  readonly baselineVersion: string;
  readonly bemerkung: string | null;

  // --- Baseline-Modell ---
  /**
   * Welcher Weg zu den Koeffizienten geführt hat (V0076). Bestimmt, was in
   * Spalte „Modelltyp" steht und ob eine Modellgüte ausgewiesen wird:
   *
   *   • `vereinfacht` — normativ gesetzt (Merkblatt Kap. 2.1.2). Es wurde
   *     nichts angepasst, also gibt es keine Güte. Spalte J bleibt leer.
   *   • `standard`/`alternativ` — an die Vermessung angepasst (Kap. 2.2.2).
   *     Dann stehen R², CV(RMSE), NMBE und n dort, wo die Vorlage sie erwartet.
   */
  readonly messkonzeptTyp: string;
  /** a₀ — der einflussunabhängige Anteil der Baseline (Kap. 2.2.2: „mindestens Aussagen zum einflussunabhängigen Anteil"). */
  readonly grundlastA0Kwh: number;
  /** b₁ — Verbrauch je Gradtagzahl. */
  readonly koeffizientB1: number;
  /** X₁ = Σ GTZ_ist über den Förderjahr-Zeitraum. */
  readonly istX1: number;
  readonly bereinigungsverfahren: string;
  /** R² der Anpassung; `null` beim vereinfachten Verfahren. Kann negativ sein. */
  readonly bestimmtheitsmass: number | null;
  readonly cvRmsePct: number | null;
  readonly nmbePct: number | null;
  /** n — Monatspunkte der Vermessung. Ohne n ist R² nicht bewertbar. */
  readonly guetePunkte: number | null;
  /** Abstand der angepassten zur nach TB-02 erfassten Jahres-Baseline, in Prozent. */
  readonly baselineAbweichungPct: number | null;

  // --- Ist-Verbrauch, aus der Messpunkt-Bilanz ---
  readonly summeBezugKwh: number | null;
  readonly summeEigenerzeugungKwh: number | null;
  readonly summeEinspeisungKwh: number | null;
  readonly datenverfuegbarkeitPct: number | null;
  readonly geraeteerkennungPct: number | null;
  /**
   * Anteil der Monate, die tatsächlich ausgewiesen werden (Kap. 9.1).
   *
   * Der Erwartungswert in Blatt 5 gilt für den GANZEN Zeitraum; der
   * Ist-Verbrauch deckt nur die Monate ab, die der Einsparlauf trägt. Sind
   * das weniger, vergliche man ohne diesen Faktor eine Ganzjahresreferenz
   * gegen einen Teiljahres-Ist — und wiese eine Einsparung aus, die es nicht
   * gibt.
   */
  readonly zeitanteil: number;
  /** Zur Erläuterung des Faktors: `10 von 13` liest sich anders als `0,77`. */
  readonly monateAusgewiesen: number;
  readonly monateGesamt: number;
}

/** Ein Messpunkt = ein Messkanal, der in die Bilanz eines Systems eingeht. */
export interface MappeMesspunkt {
  readonly messpunktId: string;
  readonly systemId: string;
  readonly zaehlerPseudonym: string;
  readonly richtung: 'bezug' | 'eigenerzeugung' | 'einspeisung';
  /** `null`, wenn die Rohdaten-Kategorie für diesen Export gesperrt ist (A12). */
  readonly summeKwh: number | null;
  readonly qualitaetsFlag: string;
}

export interface MappeEingabe {
  readonly foerderjahrCode: string;
  readonly foerderjahrVonMonat: string;
  readonly foerderjahrBisMonat: string;
  readonly erzeugtAtUtc: string;
  readonly systeme: readonly MappeSystem[];
  readonly messpunkte: readonly MappeMesspunkt[];
  /** `false`, wenn die Rohdaten gesperrt sind — das Messpunkt-Blatt bleibt dann ohne Summen (A12). */
  readonly rohdatenEnthalten: boolean;
}

const RICHTUNG_TEXT: Readonly<Record<MappeMesspunkt['richtung'], string>> = {
  bezug: 'Bezug',
  eigenerzeugung: 'Eigenerzeugung',
  einspeisung: 'Einspeisung',
};

const BLATT = {
  ANLEITUNG: '0_Anleitung',
  SYSTEMREGISTER: '1_Systemregister',
  MESSPUNKTE: '2_Messpunkte',
  SYSTEM_IST: '3_System_Ist',
  BASELINE: '4_Baseline',
  EINSPARUNG: '5_Einsparung',
  AGGREGATION_ET: '6a_Aggregation_ET',
  LK_GRUPPE: '6b_LK_Endkundengruppe',
  SACHBERICHT: '7_Sachbericht_P13',
} as const;

/** Erste Datenzeile aller Tabellenblätter (1 = Titel, 2 = Kopfzeile). */
const DATEN_AB = 3;

/**
 * Anzeigename des Energieträgers. Die Vorlage schreibt „Strom", „Gas",
 * „Wärme"; intern führen wir Kleinschreibung ohne Umlaute.
 *
 * Der Unterschied ist keine Kosmetik. Blatt 7 der Vorlage summiert mit
 * `SUMIFS(…, "Strom")` bzw. `"Gas"` auf feste Zeichenketten. Wer unsere Zahlen
 * in das Originalformular überträgt und dort `waerme` vorfindet, bekommt
 * Nullen — und sieht ihnen nicht an, dass sie falsch sind. Die Mappe schreibt
 * deshalb durchgängig die Schreibweise des Formulars, und alle SUMIFS-Kriterien
 * in dieser Datei beziehen sich auf sie.
 */
const ENERGIETRAEGER_ANZEIGE: Readonly<Record<string, string>> = {
  strom: 'Strom',
  waerme: 'Wärme',
  kaelte: 'Kälte',
  gas: 'Gas',
  oel: 'Öl',
  biomasse: 'Biomasse',
};

function energietraegerAnzeige(code: string): string {
  return ENERGIETRAEGER_ANZEIGE[code] ?? code;
}

export function baueEinsparungsnachweisMappe(eingabe: MappeEingabe): Buffer {
  return baueXlsx([
    anleitungsblatt(eingabe),
    systemregister(eingabe),
    messpunkte(eingabe),
    systemIst(eingabe),
    baseline(eingabe),
    einsparung(eingabe),
    aggregationEnergietraeger(eingabe),
    lkEndkundengruppe(eingabe),
    sachbericht(eingabe),
  ]);
}

function kopf(spalten: readonly string[]): XlsxZelle[] {
  return spalten.map((text) => ({ text, stil: 'kopf' }));
}

/** Zeilennummer der letzten Datenzeile eines Blattes, mindestens `DATEN_AB`. */
function letzteZeile(anzahl: number): number {
  return Math.max(DATEN_AB, DATEN_AB + anzahl - 1);
}

function anleitungsblatt(eingabe: MappeEingabe): XlsxBlatt {
  const hinweis = (a: string, b: string): XlsxZelle[] => [{ text: a, stil: 'kopf' }, b];
  return {
    name: BLATT.ANLEITUNG,
    spalten: [{ breite: 34 }, { breite: 110 }],
    zeilen: [
      [{ text: 'Einsparungsnachweis ESZ — End-Verwendungsnachweis', stil: 'kopf' }],
      [],
      hinweis('Förderjahr', eingabe.foerderjahrCode),
      hinweis('Zeitraum', `${eingabe.foerderjahrVonMonat} bis ${eingabe.foerderjahrBisMonat}`),
      hinweis('Erzeugt am (UTC)', eingabe.erzeugtAtUtc),
      hinweis(
        'Berechnungseinheit',
        '1 System = 1 Energieträger eines Endkunden. Baseline, Bereinigung und Einsparung werden je System ' +
          'gerechnet, nicht je Messpunkt.',
      ),
      [],
      [{ text: 'ZUM RECHENVERFAHREN — bitte lesen', stil: 'kopf' }],
      hinweis('Angewandtes Messkonzept', messkonzeptSatz(eingabe.systeme)),
      hinweis(
        'Modell',
        'In beiden Messkonzepten gilt dieselbe Form: Erwartungswert = a₀ + b₁ · X₁, mit X₁ = Σ Gradtagzahlen ' +
          'des Zeitraums (VDI 3807). Sie unterscheiden sich allein darin, woher a₀ und b₁ kommen — gesetzt ' +
          'oder an die Vermessung angepasst. Blatt 4 weist das je System aus.',
      ),
      hinweis('Modellgüte R²', gueteSatz(eingabe.systeme)),
      hinweis(
        'Rundung',
        'Blatt 5 rechnet den Erwartungswert aus a₀ und b₁ neu. Gegenüber der im System gespeicherten ' +
          'Monatsreferenz ergibt das eine Abweichung in der Größenordnung von 0,01 % — sie stammt aus der ' +
          'Rundung der gespeicherten Monatswerte, nicht aus einem anderen Verfahren.',
      ),
      hinweis(
        'Primärenergiefaktor',
        'Durchgängig 1. Eine Primärenergie-/Substitutionsbilanzierung ist in dieser Fassung nicht ' +
          'implementiert; die Faktorquelle ist lizenz- und attributionspflichtig und noch nicht freigegeben.',
      ),
      hinweis(
        'Zweite Einflussgröße, ausgeschlossene Zeiträume',
        'Nicht belegt. Diese Fassung führt genau eine Einflussgröße (die Gradtagzahl); für weitere ' +
          'Einflussgrößen oder den Nutzen des Systems liegt keine Datenquelle vor. Die Baseline-Bezugszeiträume ' +
          'sind eine Einschluss-, keine Ausschlussliste.',
      ),
      [],
      [{ text: 'PSEUDONYMISIERUNG', stil: 'kopf' }],
      hinweis(
        'Endkunden und Zähler',
        'Durchgängig pseudonymisiert (EK-…, MK-…). Klarnamen sind in diesem Nachweis nicht enthalten.',
      ),
      ...(eingabe.rohdatenEnthalten
        ? []
        : [
            [],
            hinweis(
              'Messpunkt-Summen fehlen',
              'Für diesen Export ist die Rohdaten-Kategorie gesperrt (datenschutzrechtliche Einschränkung). ' +
                'Blatt 2 führt die Messpunkte, aber ohne Jahressummen; Blatt 3 rechnet deshalb nicht aus ' +
                'ihnen, sondern führt die im System gespeicherten Bilanzsummen.',
            ),
          ]),
    ],
  };
}

function systemregister(eingabe: MappeEingabe): XlsxBlatt {
  return {
    name: BLATT.SYSTEMREGISTER,
    spalten: [{ breite: 12 }, { breite: 14 }, { breite: 24 }, { breite: 24 }, { breite: 16 }, { breite: 16 }, { breite: 16 }, { breite: 40 }],
    zeilen: [
      [{ text: `1 · Systemregister — ${String(eingabe.systeme.length)} System(e)`, stil: 'kopf' }],
      kopf([
        'System-ID',
        'Endkunde (pseudonym.)',
        'Endkundengruppe / Branche',
        'Standort',
        'Energieträger',
        'Anzahl Messpunkte',
        'Baseline-Version',
        'Bemerkung',
      ]),
      ...eingabe.systeme.map((system) => [
        system.systemId,
        system.endkundePseudonym,
        system.endkundengruppe ?? 'nicht erfasst',
        system.standort ?? 'nicht erfasst',
        energietraegerAnzeige(system.energietraeger),
        { zahl: system.messpunktAnzahl },
        system.baselineVersion,
        system.bemerkung ?? '',
      ]),
    ],
  };
}

function messpunkte(eingabe: MappeEingabe): XlsxBlatt {
  return {
    name: BLATT.MESSPUNKTE,
    spalten: [{ breite: 18 }, { breite: 12 }, { breite: 16 }, { breite: 18 }, { breite: 22 }, { breite: 16 }],
    zeilen: [
      [{ text: `2 · Messpunkte (${String(eingabe.messpunkte.length)})`, stil: 'kopf' }],
      kopf(['Messpunkt-ID', 'System-ID', 'Zähler-ID (pseudonym.)', 'Richtung/Typ', 'Σ Messwert Förderjahr [kWh]', 'Qualitäts-Flag']),
      ...eingabe.messpunkte.map((mp) => [
        mp.messpunktId,
        mp.systemId,
        mp.zaehlerPseudonym,
        RICHTUNG_TEXT[mp.richtung],
        mp.summeKwh === null ? null : { zahl: mp.summeKwh, stil: 'kwh' as const },
        mp.qualitaetsFlag,
      ]),
    ],
  };
}

/**
 * Blatt 3 — `Ist = Σ Bezug + Eigenerzeugung − Einspeisung`.
 *
 * Mit Rohdaten rechnet das Blatt per SUMIFS aus Blatt 2, genau wie die
 * Vorlage. Ohne Rohdaten (A12-Sperre) stehen dort die im System
 * gespeicherten Bilanzsummen als Werte — sonst zeigte das Blatt lauter
 * Nullen und behauptete damit einen Verbrauch von null.
 */
function systemIst(eingabe: MappeEingabe): XlsxBlatt {
  const mpBis = letzteZeile(eingabe.messpunkte.length);
  const bereich = (spalte: string): string => `${BLATT.MESSPUNKTE}!$${spalte}$${String(DATEN_AB)}:$${spalte}$${String(mpBis)}`;

  const summeFormel = (zeile: number, richtung: string): string =>
    `SUMIFS(${bereich('E')},${bereich('B')},A${String(zeile)},${bereich('D')},"${richtung}")`;

  return {
    name: BLATT.SYSTEM_IST,
    spalten: [{ breite: 12 }, { breite: 22 }, { breite: 18 }, { breite: 20 }, { breite: 18 }, { breite: 20 }, { breite: 22 }],
    zeilen: [
      [{ text: '3 · Ist-Verbrauch je System', stil: 'kopf' }],
      kopf([
        'System-ID',
        'Betrachtungszeitraum',
        'Σ Bezug [kWh]',
        'Eigenerzeugung [kWh]',
        'Einspeisung [kWh]',
        'Ist-Verbrauch [kWh]',
        'Datenverfügbarkeit [%]',
      ]),
      ...eingabe.systeme.map((system, i) => {
        const zeile = DATEN_AB + i;
        const zeitraum = `${eingabe.foerderjahrVonMonat} – ${eingabe.foerderjahrBisMonat}`;
        const spalte = (richtung: string, wert: number | null): XlsxZelle =>
          eingabe.rohdatenEnthalten
            ? { formel: summeFormel(zeile, richtung), stil: 'kwh' }
            : wert === null
              ? null
              : { zahl: wert, stil: 'kwh' };
        return [
          system.systemId,
          zeitraum,
          spalte('Bezug', system.summeBezugKwh),
          spalte('Eigenerzeugung', system.summeEigenerzeugungKwh),
          spalte('Einspeisung', system.summeEinspeisungKwh),
          { formel: `C${String(zeile)}+D${String(zeile)}-E${String(zeile)}`, stil: 'kwh' as const },
          system.datenverfuegbarkeitPct === null ? null : { zahl: system.datenverfuegbarkeitPct, stil: 'prozent' as const },
        ];
      }),
    ],
  };
}

/** Ein Satz für das Anleitungsblatt: welche Messkonzepte in diesem Bündel vorkommen. */
function messkonzeptSatz(systeme: readonly MappeSystem[]): string {
  const hatAnpassung = systeme.some((s) => s.messkonzeptTyp !== 'vereinfacht');
  const hatVereinfacht = systeme.some((s) => s.messkonzeptTyp === 'vereinfacht');
  if (hatAnpassung && hatVereinfacht) {
    return (
      'GEMISCHT. Manche Systeme folgen dem Standard-/alternativen Messkonzept (Merkblatt Technik Kap. 2.2, ' +
      'Baseline durch Vermessung erhoben, Koeffizienten angepasst), andere dem vereinfachten (Kap. 2.1, ' +
      'Baseline aus Jahresabrechnungen, Koeffizienten gesetzt). Blatt 4 weist je System aus, welcher Weg gilt.'
    );
  }
  if (hatAnpassung) {
    return (
      'STANDARD-Messkonzept (Merkblatt Technik Kap. 2.2). Die Baseline ist durch Vermessung des Systems erhoben; ' +
      'a₀ und b₁ sind an die gemessenen Monatswerte der Baseline-Periode angepasst. Witterungsbereinigung über ' +
      'Gradtagzahlen (VDI 3807).'
    );
  }
  return (
    'VEREINFACHTES Messkonzept (Merkblatt Technik Kap. 2.1) mit Witterungsbereinigung über Gradtagzahlen ' +
    '(VDI 3807). Die Baseline stammt aus Jahresabrechnungen; a₀ = B · g und b₁ = B · (1 − g) / GTZ_base sind ' +
    'gesetzt, nicht angepasst. Diese Vorlage ist für das Standard-Messkonzept gebaut — das angewandte Modell ' +
    'wurde in dessen lineare Form überführt.'
  );
}

/** Ein Satz für das Anleitungsblatt: was in Spalte J steht und was nicht. */
function gueteSatz(systeme: readonly MappeSystem[]): string {
  const mitGuete = systeme.filter((s) => s.bestimmtheitsmass !== null).length;
  if (mitGuete === 0) {
    return (
      'BLEIBT LEER. Die Koeffizienten sind gesetzt, nicht aus Messwerten angepasst — es gibt keine ' +
      'Regressionsgüte. Eine Zahl an dieser Stelle wäre die Behauptung einer Güte, die nie gemessen wurde. ' +
      'Das Merkblatt verlangt sie für das vereinfachte Verfahren (Kap. 2.1.2) auch nicht.'
    );
  }
  const teil = mitGuete === systeme.length ? 'Für alle Systeme' : `Für ${String(mitGuete)} von ${String(systeme.length)} Systemen`;
  return (
    `${teil} ausgewiesen, zusammen mit CV(RMSE), NMBE und der Zahl der Monatspunkte (Blatt 4, untere Tabelle). ` +
    'R² ist zentriert definiert und kann negativ werden. Systeme mit vereinfachtem Messkonzept bleiben dort ' +
    'leer — dort wurde nichts angepasst.'
  );
}

/** Spalte D der Vorlage — was in „Modelltyp" steht, hängt am Weg zu den Koeffizienten. */
function modelltext(system: MappeSystem): string {
  return system.messkonzeptTyp === 'vereinfacht'
    ? `normativ gesetzt (vereinfachtes Messkonzept) — ${system.bereinigungsverfahren}`
    : `lin. Regression, an Vermessung angepasst — ${system.bereinigungsverfahren}`;
}

/**
 * Der Erläuterungstext unter der Gütetabelle. Er sagt für JEDEN der beiden
 * Wege, was die Zahlen daneben bedeuten — und im gemischten Bündel für beide,
 * damit der Leser nicht rät, warum manche Zeilen leer sind.
 */
function gueteHinweis(systeme: readonly MappeSystem[]): string {
  const hatAnpassung = systeme.some((s) => s.messkonzeptTyp !== 'vereinfacht');
  const hatVereinfacht = systeme.some((s) => s.messkonzeptTyp === 'vereinfacht');
  const teile = ['Erwartungswert-Modell: E = a₀ + b₁·X₁, mit a₀ in kWh, b₁ in kWh je Kelvin·Tag und X₁ in Kd.'];
  if (hatAnpassung) {
    teile.push(
      'Bei Systemen mit Standard-/alternativem Messkonzept sind a₀ und b₁ an die vermessene Baseline-Periode ' +
        'angepasst (kleinste Quadrate auf kwh_Monat = c·Tage + b₁·GTZ, ohne Achsenabschnitt; a₀ = c·365,25). ' +
        'R² ist zentriert definiert und kann negativ werden. NMBE liegt bauartbedingt nahe null — das ist keine ' +
        'Güte, sondern eine Eigenschaft der Methode; aussagekräftig ist CV(RMSE) zusammen mit n.',
    );
  }
  if (hatVereinfacht) {
    teile.push(
      'Bei Systemen mit vereinfachtem Messkonzept sind a₀ und b₁ NICHT angepasst, sondern aus der erfassten ' +
        'Jahres-Baseline B und dem Grundlast-Anteil g gesetzt (a₀ = B·g, b₁ = B·(1−g)/GTZ_base). Dort bleibt die ' +
        'Modellgüte leer: es wurde nichts angepasst, und eine Zahl wäre die Behauptung einer nie gemessenen Güte. ' +
        'Das Merkblatt verlangt für dieses Verfahren (Kap. 2.1.2) auch keine.',
    );
  }
  return teile.join(' ');
}

function baseline(eingabe: MappeEingabe): XlsxBlatt {
  return {
    name: BLATT.BASELINE,
    spalten: [
      { breite: 12 }, { breite: 16 }, { breite: 26 }, { breite: 26 }, { breite: 18 },
      { breite: 22 }, { breite: 18 }, { breite: 20 }, { breite: 14 }, { breite: 14 },
      { breite: 26 }, { breite: 26 },
    ],
    zeilen: [
      [{ text: '4 · Baseline-Modell je System', stil: 'kopf' }],
      kopf([
        'System-ID',
        'Baseline-Version',
        'Erhebungszeitraum',
        'Modelltyp',
        'Grundlast a₀ [kWh]',
        'Einflussgröße 1',
        'Koeff. b₁',
        'Einflussgröße 2',
        'Koeff. b₂',
        'Modellgüte R²',
        'Ausgeschl./bereinigte Zeiträume',
        'Grund neue Baseline',
      ]),
      ...eingabe.systeme.map((system) => [
        system.systemId,
        system.baselineVersion,
        'Baseline-Bezugszeiträume des Messkonzepts',
        modelltext(system),
        { zahl: system.grundlastA0Kwh, stil: 'kwh' as const },
        'Gradtagzahl (VDI 3807, lokal)',
        { zahl: system.koeffizientB1, stil: 'zahl' as const },
        // b₂ bleibt leer: eine zweite Einflussgröße wird in keinem der beiden
        // Wege bestimmt (es gibt keine Datenquelle dafür).
        null,
        null,
        // R² nur, wo tatsächlich angepasst wurde. Beim vereinfachten
        // Verfahren bliebe jede Zahl hier eine Behauptung.
        system.bestimmtheitsmass === null ? null : { zahl: system.bestimmtheitsmass, stil: 'zahl' as const },
        // Ausschlusszeiträume: `baseline_periode` ist eine EINSCHLUSSliste —
        // was nicht erfasst ist, ist nicht ausgeschlossen, sondern nie erhoben.
        null,
        null,
      ]),
      [],
      kopf(['System-ID', 'Modellgüte R²', 'CV(RMSE) %', 'NMBE %', 'n Monate', 'Abw. zur erfassten Baseline %']),
      ...eingabe.systeme.map((system) => [
        system.systemId,
        system.bestimmtheitsmass === null ? null : { zahl: system.bestimmtheitsmass, stil: 'zahl' as const },
        system.cvRmsePct === null ? null : { zahl: system.cvRmsePct, stil: 'zahl' as const },
        system.nmbePct === null ? null : { zahl: system.nmbePct, stil: 'zahl' as const },
        system.guetePunkte,
        system.baselineAbweichungPct === null ? null : { zahl: system.baselineAbweichungPct, stil: 'zahl' as const },
      ]),
      [],
      [{ text: gueteHinweis(eingabe.systeme), stil: 'hinweis' }],
    ],
  };
}

/**
 * Blatt 5 — das Kernblatt. `Einsparung = (Erwartungswert − Ist) · Zeitanteil`.
 *
 * Der Erwartungswert ist eine FORMEL über Blatt 4, der Ist-Verbrauch eine
 * über Blatt 3 — beides wie in der Vorlage, damit der Empfänger die Kette
 * rückwärts gehen kann.
 */
function einsparung(eingabe: MappeEingabe): XlsxBlatt {
  const anzahl = eingabe.systeme.length;
  const bl = (spalte: string): string =>
    `${BLATT.BASELINE}!$${spalte}$${String(DATEN_AB)}:$${spalte}$${String(letzteZeile(anzahl))}`;
  const ist = (spalte: string): string =>
    `${BLATT.SYSTEM_IST}!$${spalte}$${String(DATEN_AB)}:$${spalte}$${String(letzteZeile(anzahl))}`;
  const reg = (spalte: string): string =>
    `${BLATT.SYSTEMREGISTER}!$${spalte}$${String(DATEN_AB)}:$${spalte}$${String(letzteZeile(anzahl))}`;

  return {
    name: BLATT.EINSPARUNG,
    spalten: [
      { breite: 12 }, { breite: 16 }, { breite: 16 }, { breite: 16 }, { breite: 16 }, { breite: 12 },
      { breite: 26 }, { breite: 20 }, { breite: 16 }, { breite: 20 }, { breite: 16 }, { breite: 22 }, { breite: 20 },
      { breite: 20 }, { breite: 30 },
    ],
    zeilen: [
      [{ text: '5 · Einsparungsberechnung je System', stil: 'kopf' }],
      kopf([
        'System-ID',
        'Endkunde',
        'Energieträger',
        'Baseline-Version',
        'Ist X₁',
        'Ist X₂',
        'Baseline-Erwartungswert [kWh]',
        'Ist-Verbrauch [kWh]',
        'Zeitanteil-Faktor',
        'Einsparung [kWh]',
        'Prim.-Energiefaktor',
        'Einsparung PE [kWh]',
        'Geräteerkennung [%]',
        // Ab hier RECHTS der Vorlagenspalten — sie verschieben nichts und
        // stören einen Leser nicht, der nur A–M liest.
        'Ausgewiesene Monate',
        'Endkundengruppe (Hilfsspalte)',
      ]),
      ...eingabe.systeme.map((system, i) => {
        const z = String(DATEN_AB + i);
        const suchA = `MATCH(A${z},${bl('A')},0)`;
        const suchReg = `MATCH(A${z},${reg('A')},0)`;
        return [
          system.systemId,
          // B, C, D holen sich ihre Werte per INDEX/MATCH wie in der Vorlage,
          // statt sie als Kopien zu führen. Wer im Systemregister etwas
          // korrigiert, sieht die Korrektur hier — eine Kopie bliebe stehen.
          { formel: `INDEX(${reg('B')},${suchReg})` },
          { formel: `INDEX(${reg('E')},${suchReg})` },
          { formel: `INDEX(${bl('B')},${suchA})` },
          { zahl: system.istX1, stil: 'zahl' as const },
          null,
          // Die Vorlagenformel wörtlich: E = a₀ + b₁·X₁ + b₂·X₂, mit N() um
          // die zweite Einflussgröße (leere oder Textzellen zählen als 0) und
          // IFERROR für eine nicht auffindbare System-ID.
          {
            formel:
              `IFERROR(INDEX(${bl('E')},${suchA})+INDEX(${bl('G')},${suchA})*E${z}` +
              `+N(INDEX(${bl('I')},${suchA}))*N(F${z}),0)`,
            stil: 'kwh' as const,
          },
          { formel: `INDEX(${ist('F')},MATCH(A${z},${ist('A')},0))`, stil: 'kwh' as const },
          { zahl: system.zeitanteil, stil: 'zahl' as const },
          { formel: `(G${z}-H${z})*I${z}`, stil: 'kwh' as const },
          1,
          { formel: `J${z}*K${z}`, stil: 'kwh' as const },
          system.geraeteerkennungPct === null ? null : { zahl: system.geraeteerkennungPct, stil: 'prozent' as const },
          `${String(system.monateAusgewiesen)} von ${String(system.monateGesamt)}`,
          // Hilfsspalte für Blatt 6b: Sie holt die Branche auf DIESES Blatt,
          // damit die dortige Summe alle ihre Bereiche auf einem Blatt hat.
          // Vorher standen Summen- und Kriterienbereich auf zwei Blättern und
          // die Zuordnung hing daran, dass beide zeilengleich sortiert sind —
          // richtig, solange die Datei niemand anfasst.
          { formel: `INDEX(${reg('C')},${suchReg})` },
        ];
      }),
      [],
      [
        {
          text:
            'Ist X₁ ist die Summe der Gradtagzahlen des Zeitraums in Kelvin·Tagen (Kd). ' +
            'Zeitanteil-Faktor = ausgewiesene Monate ÷ Monate des Zeitraums (Kap. 9.1). Der Erwartungswert ' +
            'in Spalte G gilt für den ganzen Zeitraum, der Ist-Verbrauch nur für die tatsächlich getragenen ' +
            'Monate — ohne den Faktor stünde hier eine Einsparung, die es nicht gibt. ' +
            'Primärenergiefaktor 1, s. Anleitungsblatt.',
          stil: 'hinweis',
        },
      ],
    ],
  };
}

function aggregationEnergietraeger(eingabe: MappeEingabe): XlsxBlatt {
  // Anzeigenamen, weil Spalte C von Blatt 5 sie fuehrt und das SUMIFS unten
  // darauf trifft.
  const traeger = [...new Set(eingabe.systeme.map((s) => energietraegerAnzeige(s.energietraeger)))].sort();
  const ein = (spalte: string): string =>
    `${BLATT.EINSPARUNG}!$${spalte}$${String(DATEN_AB)}:$${spalte}$${String(letzteZeile(eingabe.systeme.length))}`;

  return {
    name: BLATT.AGGREGATION_ET,
    spalten: [{ breite: 18 }, { breite: 28 }, { breite: 28 }, { breite: 24 }],
    zeilen: [
      [{ text: '6a · Netto-Einsparung je Energieträger (Vergütungsbasis)', stil: 'kopf' }],
      kopf(['Energieträger', 'Σ Einsparungen (nur >0) [kWh]', 'Σ Mehrverbräuche (nur <0) [kWh]', 'Netto-Einsparung [kWh]']),
      ...traeger.map((t, i) => {
        const z = String(DATEN_AB + i);
        return [
          t,
          { formel: `SUMIFS(${ein('J')},${ein('C')},A${z},${ein('J')},">0")`, stil: 'kwh' as const },
          { formel: `SUMIFS(${ein('J')},${ein('C')},A${z},${ein('J')},"<0")`, stil: 'kwh' as const },
          { formel: `B${z}+C${z}`, stil: 'kwh' as const },
        ];
      }),
      [
        { text: 'Summe', stil: 'kopf' },
        null,
        null,
        {
          formel: `SUM(D${String(DATEN_AB)}:D${String(letzteZeile(traeger.length))})`,
          stil: 'kwh' as const,
        },
      ],
      [],
      [
        {
          text:
            'Mehrverbräuche einzelner Systeme werden mit Einsparungen anderer verrechnet (Vorzeichen-Summe). ' +
            'Selbst erzeugte Energie ist keine Einsparung und daher nicht enthalten.',
          stil: 'hinweis',
        },
      ],
    ],
  };
}

function lkEndkundengruppe(eingabe: MappeEingabe): XlsxBlatt {
  const ein = (spalte: string): string =>
    `${BLATT.EINSPARUNG}!$${spalte}$${String(DATEN_AB)}:$${spalte}$${String(letzteZeile(eingabe.systeme.length))}`;
  // Je (Gruppe, Energieträger) EINE Zeile — die Gliederung des LK-Formulars.
  const paare = [
    ...new Set(
      eingabe.systeme.map(
        (s) => `${s.endkundengruppe ?? 'nicht erfasst'} ${energietraegerAnzeige(s.energietraeger)}`,
      ),
    ),
  ].sort();

  return {
    name: BLATT.LK_GRUPPE,
    spalten: [{ breite: 30 }, { breite: 18 }, { breite: 24 }],
    zeilen: [
      [{ text: '6b · LK-Nachweis: Energieträger × Endkundengruppe', stil: 'kopf' }],
      kopf(['Endkundengruppe / Branche', 'Energieträger', 'Netto-Einsparung [kWh]']),
      ...paare.map((paar, i) => {
        const [gruppe = '', traeger = ''] = paar.split(' ');
        const z = String(DATEN_AB + i);
        // Über die Branche UND den Energieträger. Die Vorlage summiert nur
        // über den Energieträger — bei mehreren Branchen stünde dadurch
        // dieselbe Zahl in jeder Zeile, und der Blattname verspräche eine
        // Aufteilung, die gar nicht stattfindet.
        //
        // Beide Kriterienbereiche liegen auf Blatt 5 (Spalte O holt die
        // Branche dorthin), damit die Summe nicht davon abhängt, dass zwei
        // Blätter zeilengleich sortiert bleiben.
        return [
          gruppe,
          traeger,
          { formel: `SUMIFS(${ein('J')},${ein('C')},B${z},${ein('O')},A${z})`, stil: 'kwh' as const },
        ];
      }),
      [],
      [
        {
          text:
            'Zusatzoptionen und Boni (Smart-Meter-Gateway, Lastmanagement, Sektorkopplung, Open Source/Open Data) ' +
            'sind im BAFA-Formular je Endkunde zu ergänzen — sie werden vom System nicht geführt.',
          stil: 'hinweis',
        },
      ],
    ],
  };
}

function sachbericht(eingabe: MappeEingabe): XlsxBlatt {
  const kunden = [...new Set(eingabe.systeme.map((s) => s.endkundePseudonym))].sort();
  const traeger = [...new Set(eingabe.systeme.map((s) => energietraegerAnzeige(s.energietraeger)))].sort();
  const ein = (spalte: string): string =>
    `${BLATT.EINSPARUNG}!$${spalte}$${String(DATEN_AB)}:$${spalte}$${String(letzteZeile(eingabe.systeme.length))}`;

  const gruppeJeKunde = new Map(eingabe.systeme.map((s) => [s.endkundePseudonym, s.endkundengruppe]));

  return {
    name: BLATT.SACHBERICHT,
    spalten: [{ breite: 20 }, { breite: 28 }, ...traeger.map(() => ({ breite: 22 })), { breite: 22 }],
    zeilen: [
      [{ text: '7 · Einzelaufschlüsselung je Endkunde (Sachbericht Punkt 13)', stil: 'kopf' }],
      // Die Vorlage hat hier fest „Strom-Einsparung" und „Gas-Einsparung".
      // Wir setzen eine Spalte je Energieträger, der im Bündel VORKOMMT —
      // sonst hätte ein Wärme-Kunde keine Spalte und ein Gas-Kunde eine leere.
      kopf(['Endkunde (pseudonym.)', 'Branche', ...traeger.map((t) => `${t}-Einsparung [kWh]`), 'Summe [kWh]']),
      ...kunden.map((kunde, i) => {
        const z = String(DATEN_AB + i);
        const ersteWertspalte = 'C';
        const letzteWertspalte = String.fromCharCode(
          ersteWertspalte.charCodeAt(0) + Math.max(0, traeger.length - 1),
        );
        return [
          kunde,
          gruppeJeKunde.get(kunde) ?? 'nicht erfasst',
          ...traeger.map((t) => ({
            formel: `SUMIFS(${ein('J')},${ein('B')},A${z},${ein('C')},"${t}")`,
            stil: 'kwh' as const,
          })),
          {
            formel: `SUM(${ersteWertspalte}${z}:${letzteWertspalte}${z})`,
            stil: 'kwh' as const,
          },
        ];
      }),
    ],
  };
}
