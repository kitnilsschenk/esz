import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindRows, mapManyRows, mapOneRow } from '../../stammdaten/persistence/map-row';
import type { VerarbeitungsStatus } from '../../stammdaten/persistence/energy/energy-endkunde.repository';
import { toVerarbeitungsStatus as toAnschlussnutzerVerarbeitungsStatus } from '../../stammdaten/persistence/energy/energy-anschlussnutzer.repository';
import type { BindungsKandidat } from '../domain/bindung-resolver';
import type { MonatsQualitaetsStufe } from '../domain/einsparung';
import { TAGES_ZEITZONE_DEFAULT } from '../zeit.util';

export interface ScopePaar {
  readonly endkundeId: string;
  readonly energietraeger: string;
}

interface ScopePaarDbRow {
  readonly endkunde_id: string;
  readonly energietraeger: string;
}

interface KandidatDbRow {
  readonly berechnungslauf_id: string;
  readonly erstellt_at: string;
  readonly referenz_kwh: string;
  readonly ist_kwh: string;
  readonly qualitaets_stufe: string;
  readonly parameter_hash: Buffer;
  readonly rohdaten_hash: Buffer;
}

const QUALITAET_WERTE: readonly MonatsQualitaetsStufe[] = ['belastbar', 'eingeschraenkt', 'nicht_ausweisbar'];
function toQualitaetsStufe(value: string): MonatsQualitaetsStufe {
  return QUALITAET_WERTE.find((k) => k === value) ?? 'nicht_ausweisbar';
}

function mapKandidatRow(row: KandidatDbRow): BindungsKandidat {
  return {
    berechnungslaufId: row.berechnungslauf_id,
    erstelltAt: row.erstellt_at,
    referenzKwh: Number.parseFloat(row.referenz_kwh),
    istKwh: Number.parseFloat(row.ist_kwh),
    qualitaetsStufe: toQualitaetsStufe(row.qualitaets_stufe),
    parameterHash: row.parameter_hash.toString('hex'),
    rohdatenHash: row.rohdaten_hash.toString('hex'),
  };
}

/**
 * ADR-0007 B2 (D2) — REIN LESENDER Zugriff auf die ADR-0006-Lauf-Artefakte
 * `analytics.berechnungslauf`/`analytics.laufergebnis` (B7: „nur
 * Lauf-Artefakte lesen, NIE `measurement`/`einfluss` direkt, keine eigene
 * Aggregation"). `edms_app` hat auf beide Tabellen bereits `SELECT`
 * (V0019-GRANTs, dieselbe App-Laufzeitrolle wie `BerechnungModule`) — KEIN
 * neuer Grant nötig. Bewusst EIN EIGENES, NACHWEIS-eigenes Repository statt
 * Wiederverwendung von `berechnung/persistence/analytics-berechnungslauf.
 * repository.ts` (das Repository dort ist ein SCHREIB-Repository für
 * `BerechnungModule` selbst — die D2-Bindungsauswahl braucht andere,
 * D2-spezifische Queries, keine zusätzliche Kopplung an ein fremdes
 * Modul-Repository).
 */
/**
 * „Der Lauf, der SELBST NICHT ERSETZT WURDE" (V0019, Regel für
 * `lauf_aktuell`).
 *
 * **Warum ein Anti-Join und nicht `ersetzt_lauf_id IS NULL`.** Die Spalte
 * steht am NEUEN Lauf und zeigt auf den alten: Ein Korrekturlauf trägt
 * `ersetzt_lauf_id = <alter Lauf>`, der ersetzte trägt NULL. Das Prädikat
 * `ersetzt_lauf_id IS NULL` liest sich wie „nicht ersetzt", bedeutet aber
 * „ersetzt selbst keinen anderen" — es behielt jeden ÜBERHOLTEN Lauf und
 * schloss jede KORREKTUR aus. Ein falsch gerechneter, bereits in einen
 * Nachweis gebundener Lauf war damit nicht richtigzustellen: Der
 * Korrekturlauf entstand, wurde quittiert und blieb ohne Wirkung.
 *
 * Ersetzt ist ein Lauf genau dann, wenn ein ANDERER auf ihn zeigt.
 * `ix_berechnungslauf_ersetzt` (V0019, partiell auf `ersetzt_lauf_id IS NOT
 * NULL`) ist für genau diesen Anti-Join angelegt.
 */
function nichtErsetzt(alias: string): string {
  return `NOT EXISTS (SELECT 1 FROM analytics.berechnungslauf nachfolger WHERE nachfolger.ersetzt_lauf_id = ${alias}.id)`;
}

@Injectable()
export class AnalyticsLaufLookupRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  /**
   * B4 „Umfangsregel v1" (Design-Entscheidung, s. finale Antwort — die ADR
   * benennt „eine Umfangsregel", legt sie aber nicht fest): alle (Endkunde,
   * Energieträger)-Paare, die IRGENDEINEN nicht-ersetzten
   * `analytics.berechnungslauf` mit Periodenüberlappung zum Förderjahr haben.
   * `vonMonatInklusive`/`bisMonatExklusiv` — Halboffenes Intervall
   * (Aufrufer übergibt bereits den Monatsersten NACH `foerderjahr.bis_monat`,
   * s. `zeit.util.ts` `naechsterMonat()`).
   */
  async findScopePaare(vonMonatInklusive: string, bisMonatExklusiv: string): Promise<ScopePaar[]> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT DISTINCT bl.endkunde_id, bl.energietraeger
         FROM analytics.berechnungslauf bl
        WHERE ${nichtErsetzt('bl')}
          AND bl.periode_von < $2::date
          AND bl.periode_bis > $1::date
        ORDER BY bl.endkunde_id, bl.energietraeger`,
      [vonMonatInklusive, bisMonatExklusiv],
    );
    return mapManyRows(bindRows<ScopePaarDbRow>(rawRows), (row) => ({ endkundeId: row.endkunde_id, energietraeger: row.energietraeger }));
  }

  /**
   * B2 (D2) — ALLE nicht-ersetzten Kandidaten-Läufe, deren Periode `monat`
   * enthält, ABSTEIGEND nach `erstellt_at` (der Aufrufer/`loeseBindungAuf()`
   * wählt daraus den „jüngsten"). Join auf `laufergebnis` für GENAU den einen
   * Monat — ein Lauf ohne Ergebniszeile für diesen Monat (sollte strukturell
   * nicht vorkommen, `insertLaufergebnisZeilen()` befüllt IMMER die gesamte
   * Lauf-Periode) liefert hier konsequenterweise KEINEN Kandidaten.
   */
  /**
   * Die Kandidaten für EINE ZEITSCHEIBE — der Bindungsweg des Nachweises seit
   * V0070.
   *
   * **Der Unterschied zu `findKandidatenFuerMonat` ist der geteilte Monat.**
   * Jene Methode fragt „welcher Lauf enthält diesen Monatsersten?" und findet
   * damit für den Oktober, den sich zwei Förderjahre teilen, den Lauf des
   * VORJAHRES — er enthält den 1.10. schliesslich auch. Diese hier verlangt,
   * dass der Lauf die Scheibe VOLLSTÄNDIG abdeckt (`periode_von <= von` UND
   * `periode_bis >= bis`), und trennt die beiden Anteile damit sauber.
   *
   * `findKandidatenFuerMonat` bleibt für die monatliche Nutzerinformation:
   * Dort IST der Kalendermonat die fachliche Einheit (TB-06), und ein
   * angeschnittener Monat kommt nicht vor.
   */
  async findKandidatenFuerScheibe(
    endkundeId: string,
    energietraeger: string,
    scheibe: { readonly monat: string; readonly von: string; readonly bis: string },
  ): Promise<BindungsKandidat[]> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT bl.id AS berechnungslauf_id, bl.erstellt_at, bl.parameter_hash, bl.rohdaten_hash,
              le.referenz_kwh, le.ist_kwh, le.qualitaets_stufe
         FROM analytics.berechnungslauf bl
         JOIN analytics.laufergebnis le ON le.lauf_id = bl.id AND le.monat = $3::date
        WHERE bl.endkunde_id = $1
          AND bl.energietraeger = $2
          AND bl.periode_von <= $4::date
          AND bl.periode_bis >= $5::date
          AND ${nichtErsetzt('bl')}
        ORDER BY bl.erstellt_at DESC`,
      [endkundeId, energietraeger, scheibe.monat, scheibe.von, scheibe.bis],
    );
    return mapManyRows(bindRows<KandidatDbRow>(rawRows), mapKandidatRow);
  }

  /**
   * Die Kandidaten für einen VOLLSTÄNDIGEN Kalendermonat — der Weg der
   * monatlichen Nutzerinformation (TB-06).
   *
   * **Warum „vollständig" seit den taggenauen Förderjahren (V0070) zählt.**
   * Ein Berechnungslauf deckt jetzt genau den Bewilligungszeitraum ab, und
   * dessen Randmonate sind angeschnitten: Der Lauf eines Förderjahres, das am
   * 12.10. endet, führt für den Oktober eine Zeile über eLF Tage. Fragte die
   * Nutzerinformation nur „enthält der Lauf den Monatsersten?", bekäme sie
   * genau diese Zeile — und meldete dem Kunden elf Tage Verbrauch als
   * Monatswert. Ein zu niedriger Wert, der nach der Zustellung nicht mehr
   * korrigiert wird.
   *
   * Die Bedingung `periode_bis >= erster des Folgemonats` schliesst das aus.
   * Für einen geteilten Monat findet die Nutzerinformation dann GAR KEINEN
   * Kandidaten und überspringt ihn (`ohneBerechnung` in
   * `NutzerinformationService`) — keine Information ist besser als eine
   * falsche. Der Betrieb sieht die Zahl in der Lauf-Bilanz.
   *
   * Für den NACHWEIS gilt das Gegenteil: Dort ist die angeschnittene Scheibe
   * genau richtig (s. `findKandidatenFuerScheibe`), weil Kap. 9.1 die
   * zeitanteilige Ermittlung verlangt. Zwei Zwecke, zwei Fragen.
   */
  async findKandidatenFuerMonat(endkundeId: string, energietraeger: string, monat: string): Promise<BindungsKandidat[]> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT bl.id AS berechnungslauf_id, bl.erstellt_at, bl.parameter_hash, bl.rohdaten_hash,
              le.referenz_kwh, le.ist_kwh, le.qualitaets_stufe
         FROM analytics.berechnungslauf bl
         JOIN analytics.laufergebnis le ON le.lauf_id = bl.id AND le.monat = $3::date
        WHERE bl.endkunde_id = $1
          AND bl.energietraeger = $2
          AND bl.periode_von <= $3::date
          AND bl.periode_bis >= ($3::date + interval '1 month')
          AND ${nichtErsetzt('bl')}
        ORDER BY bl.erstellt_at DESC`,
      [endkundeId, energietraeger, monat],
    );
    return mapManyRows(bindRows<KandidatDbRow>(rawRows), mapKandidatRow);
  }

  /**
   * B7/D7 (`analytics.lauf_retention_status.nachweis_gebunden`) — MONOTON
   * gesetzt (`WHERE NOT nachweis_gebunden`, niemals zurück auf `false`),
   * `nachweis_referenz` trägt NUR die ERSTE Bindung (`COALESCE`, B7 wörtlich:
   * „ein einzelner Text-Slot ... trägt daher die erste Bindung" — die
   * vollständige n:m-Wahrheit bleibt `nachweis.einsparlauf_bindung`).
   * `edms_app` hat `UPDATE` auf `analytics.lauf_retention_status`
   * (V0019-GRANTs, gegen die Dev-DB verifiziert) — kein neuer Grant nötig.
   */
  async markiereNachweisGebunden(berechnungslaufId: string, nachweisReferenz: string): Promise<void> {
    await this.txHost.tx.query(
      `UPDATE analytics.lauf_retention_status
          SET nachweis_gebunden = true,
              gebunden_at = COALESCE(gebunden_at, now()),
              nachweis_referenz = COALESCE(nachweis_referenz, $2)
        WHERE lauf_id = $1 AND NOT nachweis_gebunden`,
      [berechnungslaufId, nachweisReferenz],
    );
  }

  /**
   * ADR-0006 P4 / ADR-0007 A12 — löst die seit V0028 verfügbare Kette
   * `analytics.berechnungslauf.mvet_id` → `energy.messkonzept_version_
   * energietraeger_system` → `system_id` → `energy.nutzungsverhaeltnis` →
   * `anschlussnutzer_id` für EIN Scope-Paar (Endkunde, Energieträger) auf.
   *
   * Umfang der betrachteten Läufe: DIESELBE Filterung wie `findScopePaare()`
   * (nicht-ersetzt, Periodenüberlappung zum Förderjahr-Fenster
   * `[vonMonatInklusive, bisMonatExklusiv)`) — NICHT auf die je Monat
   * GEWÄHLTE Bindung beschränkt (`findKandidatenFuerMonat()`/
   * `loeseBindungAuf()`): jeder KANDIDAT trägt bereits reale, dem Paar
   * zugeordnete Daten und damit reale Anschlussnutzer-Exposition, unabhängig
   * davon, ob er später als Bindung gewählt wird.
   *
   * Zeitraum-Overlap je Lauf GEGEN DESSEN EIGENE `periode_von/periode_bis`
   * (NICHT gegen das gesamte Förderjahr-Fenster, s. `zeit.util.ts`
   * `TAGES_ZEITZONE_DEFAULT`-Kommentar — „der Lauf-Zeitraum", V0023 Punkt 2,
   * wörtlich): ein `energy.nutzungsverhaeltnis` muss NUR mit dem
   * KONKRETEN Lauf überlappen, dessen Systeme es betrifft — die
   * User-Entscheidung 2026-08-26 (P4-Zeitraum-Semantik, V0029-Kommentar auf
   * `energy.anschlussnutzer.verarbeitungs_status`) verlangt „irgendein
   * Nutzungsverhältnis überlappt den Lauf-Zeitraum", NICHT nur ein zum
   * Erstellungszeitpunkt aktuelles (`gueltig_bis IS NULL`) — daher die
   * explizite `gueltig_von < bis AND (gueltig_bis IS NULL OR gueltig_bis >
   * von)`-Overlap-Formel statt eines `gueltig_bis IS NULL`-Filters.
   *
   * `ketteNichtAufloesbar=true`, wenn MINDESTENS EIN relevanter Lauf ein
   * `mvet_id` OHNE jede System-Zuordnung hat (V0028-Übergangszustand,
   * `energy.messkonzept_version_energietraeger_system` startet leer) — dann
   * ist strukturell NICHT feststellbar, ob eine Anschlussnutzer-Sperre
   * greift (ADR-0007 A12, `KETTE_NICHT_AUFLOESBAR_REGEL_CODE`/`FJ-10`,
   * `verfahren.const.ts`).
   */
  async findAnschlussnutzerSperrenFuerPaar(
    endkundeId: string,
    energietraeger: string,
    vonMonatInklusive: string,
    bisMonatExklusiv: string,
  ): Promise<AnschlussnutzerSperrPruefung> {
    const ketteRawRows: unknown = await this.txHost.tx.query(
      `SELECT EXISTS (
         SELECT 1
           FROM analytics.berechnungslauf bl
          WHERE bl.endkunde_id = $1
            AND bl.energietraeger = $2
            AND ${nichtErsetzt('bl')}
            AND bl.periode_von < $4::date
            AND bl.periode_bis > $3::date
            AND NOT EXISTS (
              SELECT 1 FROM energy.messkonzept_version_energietraeger_system mvs WHERE mvs.mvet_id = bl.mvet_id
            )
       ) AS kette_nicht_aufloesbar`,
      [endkundeId, energietraeger, vonMonatInklusive, bisMonatExklusiv],
    );
    const ketteNichtAufloesbar =
      mapOneRow(bindRows<{ readonly kette_nicht_aufloesbar: boolean }>(ketteRawRows), (row) => row.kette_nicht_aufloesbar) ?? false;

    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT DISTINCT an.id AS anschlussnutzer_id, an.verarbeitungs_status, an.einschraenkung_grund_code
         FROM analytics.berechnungslauf bl
         JOIN energy.messkonzept_version_energietraeger_system mvs ON mvs.mvet_id = bl.mvet_id
         JOIN energy.nutzungsverhaeltnis nv ON nv.system_id = mvs.system_id
         JOIN energy.anschlussnutzer an ON an.id = nv.anschlussnutzer_id
        WHERE bl.endkunde_id = $1
          AND bl.energietraeger = $2
          AND ${nichtErsetzt('bl')}
          AND bl.periode_von < $4::date
          AND bl.periode_bis > $3::date
          AND an.verarbeitungs_status <> 'aktiv'
          AND nv.gueltig_von < (bl.periode_bis::timestamp AT TIME ZONE COALESCE(bl.parameter->>'tages_zeitzone', $5))
          AND (nv.gueltig_bis IS NULL OR nv.gueltig_bis > (bl.periode_von::timestamp AT TIME ZONE COALESCE(bl.parameter->>'tages_zeitzone', $5)))
        ORDER BY an.id`,
      [endkundeId, energietraeger, vonMonatInklusive, bisMonatExklusiv, TAGES_ZEITZONE_DEFAULT],
    );
    const gesperrteAnschlussnutzer = mapManyRows(bindRows<GesperrterAnschlussnutzerDbRow>(rawRows), (row) => ({
      anschlussnutzerId: row.anschlussnutzer_id,
      verarbeitungsStatus: toAnschlussnutzerVerarbeitungsStatus(row.verarbeitungs_status),
      einschraenkungGrundCode: row.einschraenkung_grund_code,
    }));

    return { gesperrteAnschlussnutzer, ketteNichtAufloesbar };
  }
}

export interface GesperrterAnschlussnutzer {
  readonly anschlussnutzerId: string;
  readonly verarbeitungsStatus: VerarbeitungsStatus;
  /**
   * A11-Sperrgrund (V0024, existiert auf `energy.anschlussnutzer` genauso wie
   * auf `energy.endkunde`). Entscheidet FJ-11b (Art. 18(1)(a)/(c): Wert wird
   * AUSGEWIESEN + gekennzeichnet) gegen FJ-11c (Art. 18(1)(b)/(d): Paar-
   * Ausschluss). `null` = kein Grund erfasst → fail-closed wie FJ-11c.
   */
  readonly einschraenkungGrundCode: string | null;
}

interface GesperrterAnschlussnutzerDbRow {
  readonly anschlussnutzer_id: string;
  readonly verarbeitungs_status: string;
  /** A11 (V0024) — Art.-18-Sperrgrund; unterscheidet FJ-11b (ausweisen + kennzeichnen) von FJ-11c (Paar-Ausschluss). */
  readonly einschraenkung_grund_code: string | null;
}

export interface AnschlussnutzerSperrPruefung {
  readonly gesperrteAnschlussnutzer: readonly GesperrterAnschlussnutzer[];
  readonly ketteNichtAufloesbar: boolean;
}
