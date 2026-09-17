import { Injectable } from '@nestjs/common';
import { Propagation, Transactional } from '@nestjs-cls/transactional';
import { MvetLookupRepository } from './persistence/mvet-lookup.repository';
import { AnalyticsBaselinePeriodeRepository } from './persistence/analytics-baseline-periode.repository';
import { AnalyticsMesswertMonatRepository } from './persistence/analytics-messwert-monat.repository';
import { AnalyticsBerechnungslaufRepository } from './persistence/analytics-berechnungslauf.repository';
import { nichtGefunden, ungueltigeEingabe } from '../stammdaten/common/problem.util';
import type { SystemgrenzeQuelle } from './berechnungslauf.types';

/** Zeitzone der Tagesbildung — dieselbe Vorgabe wie im Lauf (`TAGES_ZEITZONE_DEFAULT`). */
const TAGES_ZEITZONE = 'Europe/Berlin';

/**
 * Die Monate, die als SOMMER gelten.
 *
 * Juli und August, sonst nichts. In diesen beiden Monaten heizt in
 * Deutschland niemand — was ein Zähler dann noch zählt, ist die
 * witterungsUNABHÄNGIGE Grundlast: Warmwasser, Beleuchtung, Betriebstechnik.
 * Juni und September wären an einem kalten Jahr bereits Heizmonate und
 * würden die Grundlast nach oben verfälschen.
 */
const SOMMERMONATE: readonly number[] = [7, 8];

/** Ein Kalenderjahr in Tagen — die Länge des Ersatz-Bezugsfensters ohne Baseline-Periode. */
const JAHR_TAGE = 365;

export interface GrundlastHerleitung {
  /**
   * Der Vorschlag für `g`. Anteil der Baseline, der NICHT der Witterung
   * folgt.
   */
  readonly anteilVorschlag: number;
  readonly sommerMittelKwhTag: number;
  readonly jahresMittelKwhTag: number;
  readonly sommerTage: number;
  readonly basisTage: number;
  readonly basisVon: string;
  readonly basisBis: string;
  /** Woher das Bezugsfenster stammt. */
  readonly basisHerkunft: 'baseline_periode' | 'erste_messdaten';
  /**
   * `false`, wenn der Sommerverbrauch NICHT unter dem Jahresmittel liegt —
   * dann ist der Verbrauch nicht witterungsgeführt und der Vorschlag ist 1.
   */
  readonly witterungsgefuehrt: boolean;
}

export interface Parametervorschlag {
  readonly endkundeId: string;
  readonly mvetId: string;
  readonly energietraeger: string;
  readonly baselineWertKwh: number | null;
  readonly baselineEinheit: string | null;
  /** `false`, wenn die Einheit gesetzt ist und nicht `kWh` — der Lauf lehnt sie fail-closed ab. */
  readonly baselineEinheitVerwertbar: boolean;
  readonly systemgrenzeQuelle: SystemgrenzeQuelle;
  readonly zaehlerAnzahl: number;
  readonly baselinePeriodenAnzahl: number;
  readonly gtzBaseErmittelbar: boolean;
  /** `null`, wenn im Bezugsfenster keine Messdaten liegen. */
  readonly grundlast: GrundlastHerleitung | null;
  /** Klimastations-Kennungen, die für diesen Endkunden schon einmal verwendet wurden. */
  readonly stationRefVorschlaege: readonly string[];
  /**
   * Woher die Stationsvorschläge stammen.
   *
   * `standort` = aus `energy.standort.klimareferenz` der Systeme dieses
   * Messkonzepts — die fachlich richtige Quelle, die Station gehört zum
   * Objekt. `fruehere_laeufe` = nur aus dem, was bei diesem Kunden schon
   * einmal gerechnet wurde; das wiederholt einen Fehler zuverlässig, falls
   * einer drinsteckt (ADR-0006 C10.1). `keine` = nichts vorhanden, der
   * Bediener muss die Station selbst bestimmen.
   */
  readonly stationRefHerkunft: 'standort' | 'fruehere_laeufe' | 'keine';
  readonly datenVon: string | null;
  readonly datenBis: string | null;
  /** Monatsanfänge — der Lauf verlangt sie (v1-Einschränkung). `null`, wenn keine Daten vorliegen. */
  readonly periodeVonVorschlag: string | null;
  readonly periodeBisVorschlag: string | null;
}

/**
 * Was ein Berechnungslauf braucht, aus dem Bestand hergeleitet statt
 * abgefragt.
 *
 * **Warum es diesen Dienst gibt.** `POST /berechnung/laeufe` verlangt sechs
 * Pflichtparameter, darunter `grundlastAnteil` — den Anteil der Baseline, der
 * NICHT der Witterung folgt. Diese eine Zahl entscheidet über die Form der
 * Monatskurve: `referenzMonat()` teilt die Baseline in `g·B·(dM/dA)` und
 * `(1−g)·B·(GTZ_ist/GTZ_base)`. Wer `g` zu klein wählt, hängt zu viel an den
 * Gradtagzahlen — und die gehen im Sommer gegen null. Die Referenz sackt
 * dann ab, während der Ist-Verbrauch bleibt: rechnerischer Mehrverbrauch,
 * wo tatsächlich eingespart wurde.
 *
 * Genau das ist in diesem Projekt passiert. Ein geratenes `g = 0,25` ließ
 * jeden Sommermonat 6 000 bis 7 700 kWh Mehrverbrauch ausweisen, während die
 * Übersichtsblätter des Kunden für dieselben Jahre sinkenden Verbrauch
 * führten. Ein Formular mit einem leeren Zahlenfeld lädt zu genau diesem
 * Fehler ein.
 *
 * **Die Herleitung.** `g` ist das Verhältnis des Sommerniveaus zum
 * Jahresmittel: Im Juli und August heizt niemand, der dann verbleibende
 * Tagesverbrauch IST die Grundlast. Liegt er nicht unter dem Jahresmittel,
 * folgt der Verbrauch der Witterung überhaupt nicht (Strom in einem
 * Bürogebäude: Kühlung und Beleuchtung, kein Heizbezug) — dann ist `g = 1`.
 *
 * Der Dienst SCHLÄGT VOR, er entscheidet nicht. Die Zahl kommt mit ihrer
 * Grundlage zurück (Sommermittel, Jahresmittel, Fenster, Tage), damit man
 * ihr widersprechen kann. Ein Vorschlag ohne nachvollziehbare Herleitung
 * wäre nur eine besser getarnte Vermutung.
 */
@Injectable()
export class ParametervorschlagService {
  constructor(
    private readonly mvetLookupRepository: MvetLookupRepository,
    private readonly baselinePeriodeRepository: AnalyticsBaselinePeriodeRepository,
    private readonly messwertMonatRepository: AnalyticsMesswertMonatRepository,
    private readonly berechnungslaufRepository: AnalyticsBerechnungslaufRepository,
  ) {}

  @Transactional(Propagation.Required)
  async ermitteln(endkundeId: string, mvetId: string): Promise<Parametervorschlag> {
    const mvet = await this.mvetLookupRepository.findById(mvetId);
    if (mvet === undefined) {
      throw nichtGefunden('Messkonzept-Version-Energietraeger');
    }
    if (mvet.endkundeId !== endkundeId) {
      // Dieselbe Pruefung wie im Lauf selbst: Ein Vorschlag fuer die falsche
      // Paarung waere schlimmer als keiner — er saehe plausibel aus.
      throw ungueltigeEingabe(
        'mvetId gehoert nicht zu endkundeId. Der Vorschlag wird fuer genau dieses Paar gebildet.',
      );
    }

    // --- Systemgrenze: WELCHE Zaehler? Dieselbe Aufloesung wie im Lauf ---
    const mvetSystemIds = await this.mvetLookupRepository.listSystemIdsByMvetId(mvetId);
    const systemgrenzeQuelle: SystemgrenzeQuelle = mvetSystemIds.length > 0 ? 'mvet_system' : 'endkunde_fallback';
    const zaehlerIds =
      systemgrenzeQuelle === 'mvet_system'
        ? await this.messwertMonatRepository.findAktiveZaehlerIdsFuerSysteme(mvetSystemIds, mvet.energietraeger)
        : await this.messwertMonatRepository.findAktiveZaehlerIds(endkundeId, mvet.energietraeger);

    const perioden = await this.baselinePeriodeRepository.listByMvet(mvetId);
    const [datenVon, datenBis] = await this.messwertMonatRepository
      .findeDatenspanne(zaehlerIds, TAGES_ZEITZONE)
      .then((spanne) => [spanne?.von ?? null, spanne?.bis ?? null] as const);

    const grundlast = await this.leiteGrundlastAb(zaehlerIds, perioden, datenVon);
    // Standort zuerst: Er ist die fachliche Quelle. Frühere Läufe sind nur
    // der Rückfall — sie wiederholen zuverlässig auch einen Fehler.
    const ausStandort = await this.mvetLookupRepository.listeKlimareferenzenFuerMvet(mvetId);
    const ausLaeufen = await this.berechnungslaufRepository.listeStationRefs(endkundeId);
    const stationRefVorschlaege = [...new Set([...ausStandort, ...ausLaeufen])];
    const stationRefHerkunft: Parametervorschlag['stationRefHerkunft'] =
      ausStandort.length > 0 ? 'standort' : ausLaeufen.length > 0 ? 'fruehere_laeufe' : 'keine';

    return {
      endkundeId,
      mvetId,
      energietraeger: mvet.energietraeger,
      baselineWertKwh: mvet.baselineWertKwh,
      baselineEinheit: mvet.baselineEinheit,
      baselineEinheitVerwertbar: mvet.baselineEinheit === null || mvet.baselineEinheit === 'kWh',
      systemgrenzeQuelle,
      zaehlerAnzahl: zaehlerIds.length,
      baselinePeriodenAnzahl: perioden.length,
      gtzBaseErmittelbar: perioden.length > 0,
      grundlast,
      stationRefVorschlaege,
      stationRefHerkunft,
      datenVon,
      datenBis,
      // BEIDE Grenzen auf VOLLSTAENDIGE Monate. Der Lauf verlangt
      // Monatsanfaenge (v1-Einschraenkung), und ein angeschnittener Monat
      // waere ohnehin nicht belastbar: Die Abdeckung rechnet
      // `tageGemessen / tageImMonat`, ein Monat mit zwoelf von einunddreissig
      // Tagen kommt auf 39 Prozent und faellt auf `nicht_ausweisbar`.
      // Beginnt die Reihe am 12. Oktober, ist der erste brauchbare Monat der
      // November.
      periodeVonVorschlag: datenVon === null ? null : ersterVollerMonat(datenVon),
      periodeBisVorschlag: datenBis === null ? null : endeLetzterVollerMonat(datenBis),
    };
  }

  /**
   * Sommermittel gegen Jahresmittel — auf dem Bezugsfenster, das die
   * Baseline belegt.
   *
   * Ohne erfasste Baseline-Perioden wird ersatzweise das ERSTE Jahr der
   * vorhandenen Messdaten genommen. Das ist schwächer (es muss nicht das
   * Baselinejahr sein) und wird über `basisHerkunft` auch so ausgewiesen —
   * aber es ist besser als gar kein Anhaltspunkt, und der Weg zur
   * Verbesserung steht daneben: Perioden erfassen.
   */
  private async leiteGrundlastAb(
    zaehlerIds: readonly string[],
    perioden: readonly { readonly von: string; readonly bis: string }[],
    datenVon: string | null,
  ): Promise<GrundlastHerleitung | null> {
    if (zaehlerIds.length === 0) {
      return null;
    }

    const fenster =
      perioden.length > 0
        ? perioden.map((p) => ({ von: p.von, bis: p.bis }))
        : datenVon === null
          ? []
          : [{ von: datenVon, bis: tagePlus(datenVon, JAHR_TAGE) }];
    if (fenster.length === 0) {
      return null;
    }

    // Tagessummen ueber ALLE Kanaele — dieselbe Aggregation wie im Lauf,
    // damit Vorschlag und Rechnung dieselben Zahlen sehen.
    const tagesSummen = new Map<string, number>();
    for (const bereich of fenster) {
      const zeilen = await this.messwertMonatRepository.berechneTagesaggregation({
        zaehlerIds,
        von: bereich.von,
        bis: bereich.bis,
        zeitzone: TAGES_ZEITZONE,
      });
      for (const zeile of zeilen) {
        tagesSummen.set(zeile.tag, (tagesSummen.get(zeile.tag) ?? 0) + zeile.wertKwh);
      }
    }
    if (tagesSummen.size === 0) {
      return null;
    }

    let summeGesamt = 0;
    let summeSommer = 0;
    let sommerTage = 0;
    for (const [tag, wert] of tagesSummen) {
      summeGesamt += wert;
      if (SOMMERMONATE.includes(monatVon(tag))) {
        summeSommer += wert;
        sommerTage += 1;
      }
    }

    const basisTage = tagesSummen.size;
    const jahresMittel = summeGesamt / basisTage;
    // Ohne Sommertage im Fenster gibt es kein Grundlastniveau. Dann lieber
    // KEINEN Vorschlag als einen aus Winterdaten hochgerechneten.
    if (sommerTage === 0 || jahresMittel <= 0) {
      return null;
    }
    const sommerMittel = summeSommer / sommerTage;

    const witterungsgefuehrt = sommerMittel < jahresMittel;
    const sortiert = [...tagesSummen.keys()].sort();

    return {
      // Gedeckelt auf 1: Liegt der Sommer UEBER dem Jahresmittel (Kuehlung,
      // Beleuchtung), folgt der Verbrauch der Heizwitterung nicht — dann ist
      // die ganze Baseline Grundlast.
      anteilVorschlag: Math.min(1, runde(sommerMittel / jahresMittel)),
      sommerMittelKwhTag: runde(sommerMittel),
      jahresMittelKwhTag: runde(jahresMittel),
      sommerTage,
      basisTage,
      basisVon: sortiert[0]!,
      basisBis: sortiert[sortiert.length - 1]!,
      basisHerkunft: perioden.length > 0 ? 'baseline_periode' : 'erste_messdaten',
      witterungsgefuehrt,
    };
  }
}

/** Drei Nachkommastellen — mehr Genauigkeit behauptet die Datengrundlage nicht. */
function runde(wert: number): number {
  return Math.round(wert * 1000) / 1000;
}

/** Monat (1–12) eines ISO-Tages `YYYY-MM-DD`. */
function monatVon(isoTag: string): number {
  return Number.parseInt(isoTag.slice(5, 7), 10);
}

/** Der Monatserste des Monats, in den `isoTag` fällt. */
function monatsAnfang(isoTag: string): string {
  return `${isoTag.slice(0, 7)}-01`;
}

/**
 * Der Anfang des ersten VOLLSTAENDIGEN Monats.
 *
 * Beginnt die Reihe am Monatsersten, ist dieser Monat vollstaendig. Sonst
 * faellt er heraus und der Folgemonat ist der erste brauchbare.
 */
function ersterVollerMonat(isoTag: string): string {
  return isoTag.slice(8) === '01' ? isoTag : monatsAnfang(tagePlus(letzterTagDesMonats(isoTag), 1));
}

/**
 * Das EXKLUSIVE Ende des letzten VOLLSTAENDIGEN Monats.
 *
 * Reichen die Daten bis zum Monatsletzten, ist dieser Monat vollstaendig und
 * gehoert dazu — das Ende ist dann der Erste des Folgemonats. Endet die Reihe
 * mitten im Monat, faellt dieser Monat heraus.
 */
function endeLetzterVollerMonat(isoTag: string): string {
  const folgeTag = tagePlus(isoTag, 1);
  return folgeTag.slice(8) === '01' ? folgeTag : monatsAnfang(isoTag);
}

/** Der letzte Kalendertag des Monats, in den `isoTag` faellt. */
function letzterTagDesMonats(isoTag: string): string {
  const jahr = Number.parseInt(isoTag.slice(0, 4), 10);
  const monat = Number.parseInt(isoTag.slice(5, 7), 10);
  // Tag 0 des FOLGEmonats ist der letzte des laufenden (UTC, kein Zonendrift).
  return new Date(Date.UTC(jahr, monat, 0)).toISOString().slice(0, 10);
}

/** `isoTag` plus `tage` Kalendertage, als ISO-Tag. */
function tagePlus(isoTag: string, tage: number): string {
  const millis = Date.parse(`${isoTag}T00:00:00Z`) + tage * 24 * 60 * 60 * 1000;
  return new Date(millis).toISOString().slice(0, 10);
}
