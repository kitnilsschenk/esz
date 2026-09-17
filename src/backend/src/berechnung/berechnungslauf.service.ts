import { randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Propagation, Transactional } from '@nestjs-cls/transactional';
import type { SecurityContext } from '../common/security/security-context';
import { EnergyEndkundeRepository } from '../stammdaten/persistence/energy/energy-endkunde.repository';
import { nichtGefunden, ungueltigeEingabe } from '../stammdaten/common/problem.util';
import { AuditService } from '../audit/audit.service';
import { BERECHNUNG_EVENT_CODES, BERECHNUNG_FEHLER_CODES } from './audit/berechnung-audit-events';
import type { BerechnungFehlerCode } from './audit/berechnung-audit-events';
import { BerechnungFehlerException } from './berechnung-fehler.exception';
import { MvetLookupRepository } from './persistence/mvet-lookup.repository';
import type { MvetInfo } from './persistence/mvet-lookup.repository';
import { AnalyticsBaselinePeriodeRepository } from './persistence/analytics-baseline-periode.repository';
import { AnalyticsKlimaTagRepository } from './persistence/analytics-klima-tag.repository';
import { AnalyticsMesswertMonatRepository } from './persistence/analytics-messwert-monat.repository';
import type { TagesaggregatZeile } from './persistence/analytics-messwert-monat.repository';
import { AnalyticsEingangSnapshotRepository } from './persistence/analytics-eingang-snapshot.repository';
import { EinflussIntervallLeseRepository } from './persistence/einfluss-intervall-lese.repository';
import { AnalyticsVerfahrenRepository } from './persistence/analytics-verfahren.repository';
import {
  MINDEST_GTZ_STREUUNG,
  MINDEST_PUNKTE,
  baselineRegression,
  koeffizientenInBaselineGroessen,
  sucheHeizgrenze,
  type BaselinePunkt,
  type BaselineRegressionErgebnis,
  type VermessungsMonat,
} from './domain/baseline-regression';
import { AnalyticsBerechnungslaufRepository } from './persistence/analytics-berechnungslauf.repository';
import type {
  BerechnungslaufRow,
  LaufergebnisRow,
  LaufergebnisZeileInput,
  QualitaetsStufe,
} from './persistence/analytics-berechnungslauf.repository';
import { KLIMA_QUELLE_PORT } from './klima/klima-quelle.port';
import type { KlimaQuellePort, KlimaTagWert } from './klima/klima-quelle.port';
import {
  GTZ_T_HEIZGRENZE_C_DEFAULT,
  GTZ_T_INNEN_C_DEFAULT,
  TAGE_PRO_JAHR_DEFAULT,
  baselineNormiert,
  gradtagzahlSumme,
  gradtagzahlTag,
  referenzMonat,
} from './domain/witterung-gtz';
import type { GtzParameter } from './domain/witterung-gtz';
import { enumerateDays, enumerateMonths } from './zeit.util';
import type { Monatsscheibe } from './zeit.util';
import { sha256Canonical } from './hash.util';
import { mapBerechnungslaufAntwort } from './berechnungslauf.mapper';
import type { BerechnungslaufAntwort, BerechnungslaufListItem, SystemgrenzeQuelle } from './berechnungslauf.types';
import type { BerechnungslaufAnlegenDto } from './dto/berechnungslauf-anlegen.dto';
import { toSeite } from '../stammdaten/common/seite.dto';
import type { Seite } from '../stammdaten/common/seite.dto';

const VERFAHREN_CODE = 'witterung_gtz_vdi3807';

/** Darstellungsgrenze fuer `baseline_abweichung_pct` — numeric(7,2), s. Verwendungsstelle. */
const ABWEICHUNG_GRENZE_PCT = 99_999.99;
const TAGES_ZEITZONE_DEFAULT = 'Europe/Berlin';
/**
 * M1 (security-auditor, ADR-0006 Phase 5) — Obergrenze der Lauf-Spanne gegen
 * Resource-Exhaustion. `periodeVon/bis` sind DTO-seitig nur als ISO-Datum
 * geprüft; ohne diese Kappe erzeugt eine Spanne wie `0001`→`9999` Millionen
 * Monats-/Tageszeilen und einen ungebremsten `measurement`-Scan. Der Deckel
 * sitzt bewusst HIER (am Ort, an dem die Ressource verbraucht wird: direkt
 * vor jeder DB-Arbeit), 120 Monate = 10 Jahre Kopffreiheit über jeden realen
 * BAFA-Nachweiszeitraum.
 */
const MAX_LAUF_MONATE = 120;

interface EffektiveParameter {
  readonly gtzParameter: GtzParameter;
  readonly tageProJahr: number;
  readonly tagesZeitzone: string;
}

interface BerechnungKontext {
  readonly dto: BerechnungslaufAnlegenDto;
  readonly mvet: MvetInfo;
  readonly monate: readonly Monatsscheibe[];
  readonly effektiv: EffektiveParameter;
  readonly verfahren: { readonly code: string; readonly version: number };
}

interface KlimaZeileMitGtz extends KlimaTagWert {
  readonly gtzTag: number;
}

/**
 * `POST /berechnung/laeufe` — Orchestrierung des Rechenkerns
 * (`domain/witterung-gtz.ts`, ADR-0006 B12.1) gegen die reale DB. A10-Sperre
 * zuerst, DANN erst jeder Schreibzugriff (inkl. `.angefordert`-Audit) — s.
 * `starten()`-Kommentar für die verbindliche Reihenfolge.
 */
@Injectable()
export class BerechnungslaufService {
  constructor(
    private readonly endkundeRepository: EnergyEndkundeRepository,
    private readonly mvetLookupRepository: MvetLookupRepository,
    private readonly baselinePeriodeRepository: AnalyticsBaselinePeriodeRepository,
    private readonly klimaTagRepository: AnalyticsKlimaTagRepository,
    private readonly messwertMonatRepository: AnalyticsMesswertMonatRepository,
    private readonly eingangSnapshotRepository: AnalyticsEingangSnapshotRepository,
    private readonly einflussIntervallLeseRepository: EinflussIntervallLeseRepository,
    private readonly verfahrenRepository: AnalyticsVerfahrenRepository,
    private readonly berechnungslaufRepository: AnalyticsBerechnungslaufRepository,
    private readonly auditService: AuditService,
    @Inject(KLIMA_QUELLE_PORT) private readonly klimaQuellePort: KlimaQuellePort,
  ) {}

  /**
   * Verbindliche Reihenfolge (Arbeitsauftrag Priorität 2/3, wörtlich):
   *   1. A10-Sperr-Check ZUERST — `energy.endkunde.verarbeitungs_status`.
   *      Solange dieser Schritt nicht "aktiv" bestätigt, wird NICHTS
   *      geschrieben (auch KEIN Audit-Event — Konsistenz mit jeder anderen
   *      400/404/409-Ablehnung im Repo, die ebenfalls unauditiert bleibt;
   *      `@AuditAction`/der generische M2-Fallback decken nur
   *      `ForbiddenException`/erfolgreiche state-ändernde Aktionen ab).
   *   2. Rein LESENDE Validierung (mvet, Baseline, Periode, `ersetztLaufId`,
   *      Verfahrenskatalog) — ebenfalls NOCH KEIN Schreibzugriff.
   *   3. `berechnungslauf.bereinigung.angefordert` — DER ERSTE Schreibzugriff
   *      überhaupt.
   *   4. Rechenkern + Persistenz in EINER `@Transactional(Propagation.
   *      Nested)`-Klammer (Savepoint) — schlägt sie fehl, rollt NUR dieser
   *      Savepoint zurück (append-only bleibt gewahrt, KEINE Teil-Zeilen),
   *      während `.angefordert` in der ÄUSSEREN, vom `TransactionInterceptor`
   *      getragenen Request-Tx erhalten bleibt (die committet IMMER, s.
   *      dortiger Klassen-Kommentar "Konflikt B") — genau deshalb kann
   *      `.fehlgeschlagen` sicher NACH dem Rollback des Savepoints noch in
   *      derselben (äußeren) Transaktion geschrieben werden.
   *   5. Erfolg: `.abgeschlossen` (+ `.ersetzt`, falls `ersetztLaufId`
   *      gesetzt) — Misserfolg: `.fehlgeschlagen`, dann Rethrow.
   */
  async starten(
    dto: BerechnungslaufAnlegenDto,
    subject: SecurityContext,
    synthetic: boolean,
  ): Promise<BerechnungslaufAntwort> {
    // --- 1. A10, zuerst, kein Schreibzugriff ---
    const endkunde = await this.endkundeRepository.findById(dto.endkundeId);
    if (endkunde === undefined) {
      throw nichtGefunden('Endkunde');
    }
    if (endkunde.verarbeitungsStatus !== 'aktiv') {
      throw new BerechnungFehlerException(
        BERECHNUNG_FEHLER_CODES.ENDKUNDE_GESPERRT,
        HttpStatus.CONFLICT,
        'Endkunde ist gesperrt oder gelöscht (Art. 18 DSGVO) — kein neuer Berechnungslauf zulässig (A10).',
      );
    }

    // --- 2. Lesende Validierung ---
    const mvet = await this.mvetLookupRepository.findById(dto.mvetId);
    if (mvet === undefined) {
      throw nichtGefunden('Messkonzept-Version-Energietraeger');
    }
    if (mvet.endkundeId !== dto.endkundeId) {
      throw ungueltigeEingabe('endkundeId stimmt nicht mit dem ueber mvetId aufgeloesten Endkunden ueberein.');
    }
    if (mvet.baselineWertKwh === null) {
      throw new BerechnungFehlerException(
        BERECHNUNG_FEHLER_CODES.BASELINE_FEHLT,
        HttpStatus.BAD_REQUEST,
        'Die referenzierte Messkonzept-Version-Energietraeger hat keinen erfassten baseline_wert.',
      );
    }
    if (mvet.baselineEinheit !== null && mvet.baselineEinheit !== 'kWh') {
      throw new BerechnungFehlerException(
        BERECHNUNG_FEHLER_CODES.BASELINE_EINHEIT_UNGUELTIG,
        HttpStatus.BAD_REQUEST,
        `baseline_einheit '${mvet.baselineEinheit}' wird in v1 NICHT automatisch umgerechnet (fail-closed) — erwartet kWh.`,
      );
    }

    if (Date.parse(dto.periodeVon) >= Date.parse(dto.periodeBis)) {
      throw ungueltigeEingabe('periodeVon muss zeitlich VOR periodeBis liegen (halboffenes Intervall).');
    }
    // KEINE Monatsanfangs-Pruefung mehr: Ein Foerderjahr ist der Zeitraum aus
    // dem Bewilligungsbescheid und beginnt nicht zwangslaeufig am Ersten.
    // Kap. 9.1 des Technischen Merkblatts v2.2 verlangt ausdruecklich, die
    // Einsparung zeitanteilig zu ermitteln, wenn der relevante Zeitraum
    // kleiner ist als das Foerderjahr — eine Rundung auf Monatsgrenzen
    // verschoebe den Nachweiszeitraum um Wochen. Die Randmonate duerfen
    // deshalb angeschnitten sein (s. `enumerateMonths`).
    const monate = enumerateMonths(dto.periodeVon, dto.periodeBis);
    if (monate.length === 0) {
      throw ungueltigeEingabe('Die Periode enthaelt keinen einzigen Kalendertag.');
    }
    if (monate.length > MAX_LAUF_MONATE) {
      throw ungueltigeEingabe(
        `Die Periode umfasst ${monate.length} Monate; das Maximum je Lauf ist ${MAX_LAUF_MONATE} (Ressourcenschutz, M1).`,
      );
    }

    if (dto.ersetztLaufId !== undefined) {
      const ersetzterLauf = await this.berechnungslaufRepository.findById(dto.ersetztLaufId);
      if (
        ersetzterLauf === undefined ||
        ersetzterLauf.endkundeId !== dto.endkundeId ||
        ersetzterLauf.mvetId !== dto.mvetId
      ) {
        throw new BerechnungFehlerException(
          BERECHNUNG_FEHLER_CODES.ERSETZTER_LAUF_UNGUELTIG,
          HttpStatus.BAD_REQUEST,
          'ersetztLaufId verweist auf keinen existierenden Lauf desselben Endkunden/derselben mvet.',
        );
      }
    }

    const verfahren = await this.verfahrenRepository.findAktiveVersion(VERFAHREN_CODE);
    if (verfahren === undefined) {
      // Sollte strukturell nie eintreten — der `GoldenVectorBootstrapService`
      // haelt die App beim Start an, falls KEIN aktives Verfahren existiert.
      throw new Error(`Kein aktives Verfahren '${VERFAHREN_CODE}' im Katalog (analytics.verfahren_version).`);
    }

    const effektiv: EffektiveParameter = {
      gtzParameter: {
        tInnenC: dto.parameter?.tInnenC ?? GTZ_T_INNEN_C_DEFAULT,
        tHeizgrenzeC: dto.parameter?.tHeizgrenzeC ?? GTZ_T_HEIZGRENZE_C_DEFAULT,
      },
      tageProJahr: dto.parameter?.tageProJahr ?? TAGE_PRO_JAHR_DEFAULT,
      tagesZeitzone: dto.parameter?.tagesZeitzone ?? TAGES_ZEITZONE_DEFAULT,
    };

    // --- 3. ERSTER Schreibzugriff ---
    await this.auditService.append({
      eventTyp: BERECHNUNG_EVENT_CODES.LAUF_ANGEFORDERT,
      actorTyp: subject.actorTyp,
      actorSub: subject.sub,
      ergebnis: 'ok',
      kontext: this.baseKontext({ dto, mvet, monate, verfahren, synthetic }),
    });

    const berechnungKontext: BerechnungKontext = { dto, mvet, monate, effektiv, verfahren };

    // --- 4. Rechenkern + Persistenz (Savepoint) ---
    let ergebnis: {
      readonly lauf: BerechnungslaufRow;
      readonly ergebnisse: readonly LaufergebnisRow[];
      readonly systemgrenzeQuelle: SystemgrenzeQuelle;
    };
    try {
      ergebnis = await this.berechnenUndSpeichernInTx(berechnungKontext);
    } catch (error: unknown) {
      const fehlerCode = this.klassifiziereFehler(error);
      await this.auditService.append({
        eventTyp: BERECHNUNG_EVENT_CODES.LAUF_FEHLGESCHLAGEN,
        actorTyp: subject.actorTyp,
        actorSub: subject.sub,
        ergebnis: 'error',
        kontext: { ...this.baseKontext({ dto, mvet, monate, verfahren, synthetic }), fehler_code: fehlerCode },
      });
      throw error;
    }

    // --- 5. Erfolg ---
    await this.auditService.append({
      eventTyp: BERECHNUNG_EVENT_CODES.LAUF_ABGESCHLOSSEN,
      actorTyp: subject.actorTyp,
      actorSub: subject.sub,
      ergebnis: 'ok',
      objektRef: ergebnis.lauf.id,
      kontext: {
        ...this.baseKontext({ dto, mvet, monate, verfahren, synthetic }),
        qualitaets_stufe: ergebnis.lauf.qualitaetsStufeMin,
        systemgrenze_quelle: ergebnis.systemgrenzeQuelle,
      },
    });
    if (dto.ersetztLaufId !== undefined) {
      await this.auditService.append({
        eventTyp: BERECHNUNG_EVENT_CODES.LAUF_ERSETZT,
        actorTyp: subject.actorTyp,
        actorSub: subject.sub,
        ergebnis: 'ok',
        objektRef: ergebnis.lauf.id,
        kontext: { ...this.baseKontext({ dto, mvet, monate, verfahren, synthetic }), ersetzt_lauf_id: dto.ersetztLaufId },
      });
    }

    return mapBerechnungslaufAntwort(ergebnis.lauf, ergebnis.ergebnisse);
  }

  /**
   * **Einen Lauf neu rechnen (Korrektur).**
   *
   * ADR-0007 B7/D7 verlangt fuer eine nachtraegliche Korrektur „nie stilles
   * Ueberschreiben": Der alte Lauf bleibt stehen, ein neuer ersetzt ihn, und
   * die Differenz wird bei der Einreichung ausgewiesen. Bis hierher fehlte
   * dafuer der Einstieg — `ersetztLaufId` liess sich nur setzen, wenn der
   * Aufrufer SAEMTLICHE Parameter des alten Laufs von Hand wiederholte. Wer
   * dabei einen Wert danebengreift, korrigiert nicht, sondern rechnet etwas
   * anderes.
   *
   * Diese Route uebernimmt die Parameter deshalb VOM ERSETZTEN LAUF:
   * Messkonzept, Periode, Grundlastanteil, Klimastation, GTZ_base und
   * GTZ_norm. Geaendert hat sich nur die Datenlage — genau das ist der Sinn
   * einer Korrektur.
   *
   * **GTZ_base geht als Override hinein.** Der Lauf speichert den WERT, nicht
   * die Herkunft (berechnet oder vorgegeben). Ihn als Override zu setzen
   * reproduziert die Basis des Originals exakt; ihn wegzulassen wuerde ihn
   * neu aus den Klimadaten ableiten — und damit eine zweite Aenderung
   * einfuehren, die niemand angefordert hat.
   *
   * Ein bereits ersetzter Lauf laesst sich nicht erneut korrigieren: Sonst
   * haette ein Original zwei Nachfolger, und beide waeren nach der
   * Auswahlregel „nicht ersetzt". Die Korrektur gehoert an den juengsten.
   */
  async neuBerechnen(laufId: string, subject: SecurityContext, synthetic: boolean): Promise<BerechnungslaufAntwort> {
    const alt = await this.berechnungslaufRepository.findById(laufId);
    if (alt === undefined) {
      throw nichtGefunden('Berechnungslauf');
    }

    if (await this.berechnungslaufRepository.existiertNachfolger(laufId)) {
      throw new BerechnungFehlerException(
        BERECHNUNG_FEHLER_CODES.ERSETZTER_LAUF_UNGUELTIG,
        HttpStatus.CONFLICT,
        'Dieser Lauf wurde bereits durch einen neueren ersetzt. Eine Korrektur gehoert an den juengsten Lauf, sonst haette das Original zwei gleichrangige Nachfolger.',
      );
    }

    return this.starten(
      {
        endkundeId: alt.endkundeId,
        mvetId: alt.mvetId,
        periodeVon: alt.periodeVon,
        periodeBis: alt.periodeBis,
        grundlastAnteil: alt.grundlastAnteil,
        stationRef: alt.stationRef,
        gtzBaseOverride: alt.gtzBase,
        ...(alt.gtzNorm !== null ? { gtzNormOverride: alt.gtzNorm } : {}),
        ausloeser: 'nachlauf_korrektur',
        ersetztLaufId: alt.id,
      },
      subject,
      synthetic,
    );
  }

  async finden(laufId: string): Promise<BerechnungslaufAntwort> {
    const lauf = await this.berechnungslaufRepository.findById(laufId);
    if (lauf === undefined) {
      throw nichtGefunden('Berechnungslauf');
    }
    const ergebnisse = await this.berechnungslaufRepository.findErgebnisseByLaufId(laufId);
    // Ob dieser Lauf selbst ueberholt ist, steht nirgends an ihm — nur ein
    // NACHFOLGER weiss es. Ohne diese Auskunft liest jemand eine alte Zahl,
    // ohne zu erkennen, dass eine Korrektur sie abgeloest hat.
    const nachfolgerId = await this.berechnungslaufRepository.findNachfolgerId(laufId);
    return mapBerechnungslaufAntwort(lauf, ergebnisse, nachfolgerId ?? null);
  }

  /**
   * `GET /berechnung/endkunden/{endkundeId}/laeufe` — PII-freie Lauf-Liste je
   * Endkunde, Cursor-paginiert. 404, wenn der Endkunde nicht existiert
   * (konsistent mit `finden()`; kein Info-Leck über einen leeren `daten`-Array
   * für eine erratene ID).
   */
  async listeFuerEndkunde(
    endkundeId: string,
    optionen: { readonly cursor?: string; readonly limit: number },
  ): Promise<Seite<BerechnungslaufListItem>> {
    const endkunde = await this.endkundeRepository.findById(endkundeId);
    if (endkunde === undefined) {
      throw nichtGefunden('Endkunde');
    }
    const result = await this.berechnungslaufRepository.findByEndkundeId(endkundeId, optionen);
    return toSeite(result.daten, result.naechsterCursor, optionen.limit);
  }

  /**
   * ALLES in einer Tx (Arbeitsauftrag Priorität 2, wörtlich) — GTZ_base,
   * Snapshots (content-addressed einfrieren), Monatswerte (`referenzMonat`),
   * `berechnungslauf`+`laufergebnis`+`lauf_retention_status`-Insert.
   */
  @Transactional(Propagation.Nested)
  private async berechnenUndSpeichernInTx(kontext: BerechnungKontext): Promise<{
    readonly lauf: BerechnungslaufRow;
    readonly ergebnisse: readonly LaufergebnisRow[];
    readonly systemgrenzeQuelle: SystemgrenzeQuelle;
  }> {
    const { dto, mvet, monate, effektiv, verfahren } = kontext;
    const baselineWertKwh = mvet.baselineWertKwh;
    if (baselineWertKwh === null) {
      // Strukturell bereits in starten() ausgeschlossen — Backstop fuer den Typchecker.
      throw new Error('baselineWertKwh unerwartet null in berechnenUndSpeichernInTx.');
    }

    // --- Systemgrenze (V0028): WELCHE Zaehler gehoeren zu DIESEM Messkonzept? ---
    // Die Zuordnung `mvet -> System` ist massgeblich. Ohne sie zog der Lauf
    // alle aktiven Zaehler des Endkunden mit passendem Energietraeger heran —
    // ein Kunde mit zwei unabhaengigen Gas-Messkonzepten bekam in BEIDEN
    // Laeufen die Summe BEIDER Systeme. Die Zuordnungstabelle startet je
    // Bestands-`mvet` LEER (V0028 "Uebergangszustand"), deshalb bleibt die
    // alte Heuristik als Fallback bestehen — aber ausgewiesen, nicht still
    // (`systemgrenze_quelle` im Audit-Kontext des Laufs).
    const mvetSystemIds = await this.mvetLookupRepository.listSystemIdsByMvetId(dto.mvetId);
    const systemgrenzeQuelle: SystemgrenzeQuelle = mvetSystemIds.length > 0 ? 'mvet_system' : 'endkunde_fallback';

    // --- Messwert: Zaehler-/Kanal-Menge + Tagesaggregation ueber die GESAMTE Periode ---
    const zaehlerIds =
      systemgrenzeQuelle === 'mvet_system'
        ? await this.messwertMonatRepository.findAktiveZaehlerIdsFuerSysteme(mvetSystemIds, mvet.energietraeger)
        : await this.messwertMonatRepository.findAktiveZaehlerIds(dto.endkundeId, mvet.energietraeger);
    const tagesZeilen = await this.messwertMonatRepository.berechneTagesaggregation({
      zaehlerIds,
      von: dto.periodeVon,
      bis: dto.periodeBis,
      zeitzone: effektiv.tagesZeitzone,
    });
    // Kanaele mit fremder Einheit brechen den Lauf ab, statt still zu wirken:
    // mitsummiert ergaeben m³ oder kvarh eine falsche kWh-Zahl, weggelassen
    // einen zu niedrigen Ist-Verbrauch und damit eine zu hohe Einsparung.
    // Symmetrisch zur Baseline-Seite, die eine fremde Einheit ebenfalls
    // fail-closed ablehnt statt umzurechnen.
    const kanalBestand = await this.messwertMonatRepository.ermittleAktiveMesskanaele(zaehlerIds);
    if (kanalBestand.fremdeEinheiten.length > 0) {
      throw new BerechnungFehlerException(
        BERECHNUNG_FEHLER_CODES.MESSKANAL_EINHEIT_UNGUELTIG,
        HttpStatus.BAD_REQUEST,
        `Aktive Messkanaele im Berechnungsumfang fuehren nicht verwertbare Einheiten (${kanalBestand.fremdeEinheiten.join(', ')}). ` +
          `Der Ist-Verbrauch wird in kWh gefuehrt und in v1 NICHT umgerechnet (fail-closed). ` +
          `Entweder den Kanal als Untermessung kennzeichnen, ihn stilllegen, oder seine Einheit korrigieren.`,
      );
    }
    const erwarteteKanalzahl = kanalBestand.verwertbar;

    // --- Klima: Baseline-Perioden (fuer GTZ_base) + Zielperiode (fuer GTZ_m_ist) einfrieren ---
    // Der Standard-/alternative Pfad braucht die Baseline-Perioden IMMER: sie
    // DEFINIEREN die Vermessung, an die angepasst wird (Merkblatt Kap. 2.2.2).
    // Beim vereinfachten Pfad nur dann, wenn GTZ_base daraus herzuleiten ist.
    const passtKoeffizientenAn = mvet.messkonzeptTyp !== 'vereinfacht';
    const brauchtGtzBaseAusKlima = dto.gtzBaseOverride === undefined && dto.grundlastAnteil !== 1;
    const baselinePerioden =
      brauchtGtzBaseAusKlima || passtKoeffizientenAn
        ? await this.baselinePeriodeRepository.listByMvet(dto.mvetId)
        : [];
    if (passtKoeffizientenAn && baselinePerioden.length === 0) {
      throw new BerechnungFehlerException(
        BERECHNUNG_FEHLER_CODES.BASELINE_VERMESSUNG_FEHLT,
        HttpStatus.BAD_REQUEST,
        `Das Messkonzept ist als '${mvet.messkonzeptTyp}' gefuehrt. Dort wird die Baseline nach Merkblatt Technik ` +
          'Kap. 2.2.2 durch eine VERMESSUNG des Systems erhoben -- ohne erfasste Baseline-Periode gibt es nichts, ' +
          'woran sich die Koeffizienten anpassen liessen. Entweder die Baseline-Perioden am Messkonzept erfassen ' +
          'oder das Messkonzept als vereinfacht fuehren.',
      );
    }
    if (brauchtGtzBaseAusKlima && baselinePerioden.length === 0) {
      throw new BerechnungFehlerException(
        BERECHNUNG_FEHLER_CODES.GTZ_BASE_NICHT_ERMITTELBAR,
        HttpStatus.BAD_REQUEST,
        'GTZ_base kann nicht ermittelt werden: keine energy.baseline_periode fuer diese mvet erfasst und kein gtzBaseOverride gesetzt (g<1). Der B5-Fallback "GTZ_base := GTZ_norm" ist in v1 NICHT implementiert (normperiode-Aufloesung fehlt).',
      );
    }

    const klimaBereiche = [
      ...baselinePerioden.map((p) => ({ von: p.von, bis: p.bis })),
      { von: dto.periodeVon, bis: dto.periodeBis },
    ];
    // Bei g=1 ist B_witt=0: die Gradtagzahl geht dann in KEINE Ergebniszahl
    // ein (s. `referenzMonat()`/`baselineNormiert()`). Eine Lücke in den
    // Klimadaten kann das Ergebnis in diesem Fall nicht verfälschen — sie zu
    // einem Abbruchgrund zu machen, hielte Läufe auf, die sachlich in Ordnung
    // sind.
    // Beim Standard-Pfad ist die Gradtagzahl Regressor der Anpassung -- eine
    // Luecke verschoebe dort die Koeffizienten selbst, nicht nur einen
    // Monatswert. Deshalb wirkt sie dort IMMER auf das Ergebnis.
    const klimaWirktAufErgebnis = passtKoeffizientenAn || dto.grundlastAnteil !== 1;
    const klimaTageMap = new Map<string, number>();
    for (const bereich of klimaBereiche) {
      const tage = await this.holeKlimaTageMitNachfuellen(dto.stationRef, bereich.von, bereich.bis, klimaWirktAufErgebnis);
      for (const tag of tage) {
        klimaTageMap.set(tag.tag, tag.tMittelC);
      }
    }
    const klimaZeilen: KlimaZeileMitGtz[] = [...klimaTageMap.entries()]
      .map(([tag, tMittelC]) => ({ tag, tMittelC, gtzTag: gradtagzahlTag(tMittelC, effektiv.gtzParameter) }))
      .sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));

    // --- GTZ_base ---
    let gtzBase: number;
    if (dto.gtzBaseOverride !== undefined) {
      gtzBase = dto.gtzBaseOverride;
    } else if (!passtKoeffizientenAn && dto.grundlastAnteil === 1) {
      // Unbenutzt in referenzMonat()/baselineNormiert() (B_witt=0) —
      // NOT-NULL-Spaltenplatzhalter (berechnungslauf.gtz_base erlaubt kein NULL).
      //
      // Im Standard-Pfad greift diese Abkuerzung NICHT: dort ist g kein
      // Eingabeparameter, sondern ERGEBNIS der Anpassung. Ein eingesandtes
      // g=1 duerfte GTZ_base nicht auf 0 setzen, bevor ueberhaupt feststeht,
      // ob ein Witterungsanteil existiert.
      gtzBase = 0;
    } else {
      const jahresGtzWerte = baselinePerioden.map((periode) => {
        const tageInPeriode = klimaZeilen.filter((z) => z.tag >= periode.von && z.tag < periode.bis);
        return gradtagzahlSumme(
          tageInPeriode.map((z) => ({ tag: z.tag, tMittelC: z.tMittelC })),
          effektiv.gtzParameter,
        );
      });
      gtzBase = jahresGtzWerte.reduce((summe, wert) => summe + wert, 0) / jahresGtzWerte.length;
    }

    // --- Standard-Messkonzept: Koeffizienten an die Vermessung anpassen ---
    // Merkblatt Technik Kap. 2.2.2. Bis hierher ist alles identisch zum
    // vereinfachten Pfad; ab hier entscheidet sich nur, WOHER (a0, b1)
    // kommen. Die Monatsformel unten ist in beiden Faellen dieselbe.
    let regression: BaselineRegressionErgebnis | null = null;
    let baselineAbweichungPct: number | null = null;
    let baselineWertEffektiv = baselineWertKwh;
    let grundlastAnteilEffektiv = dto.grundlastAnteil;
    let vermessungsZeilen: readonly TagesaggregatZeile[] = [];

    if (passtKoeffizientenAn) {
      vermessungsZeilen = await this.holeVermessungsZeilen(zaehlerIds, baselinePerioden, effektiv.tagesZeitzone);
      const vermessungsMonate = this.bildeVermessungsMonate(baselinePerioden, vermessungsZeilen, klimaZeilen);
      const ausgang = baselineRegression(this.zuBaselinePunkten(vermessungsMonate, effektiv.gtzParameter));
      if (ausgang.art === 'hindernis') {
        throw new BerechnungFehlerException(
          BERECHNUNG_FEHLER_CODES.BASELINE_ANPASSUNG_GESCHEITERT,
          HttpStatus.BAD_REQUEST,
          `Die Baseline-Koeffizienten lassen sich nicht an die Vermessung anpassen (${ausgang.code}): ` +
            ausgang.hinweis +
            this.heizgrenzeHinweis(vermessungsMonate, effektiv.gtzParameter),
        );
      }
      regression = ausgang.ergebnis;

      const groessen = koeffizientenInBaselineGroessen({
        grundlastProTagKwh: regression.grundlastProTagKwh,
        koeffizientB1KwhProKd: regression.koeffizientB1KwhProKd,
        gtzBase,
        tageProJahr: effektiv.tageProJahr,
      });
      baselineWertEffektiv = groessen.baselineJahresWertKwh;
      grundlastAnteilEffektiv = groessen.grundlastAnteil;

      // Die ERFASSTE Baseline (TB-02, Beleg) wird NICHT ersetzt, sondern
      // verglichen. Laufen beide auseinander, ist das ein Befund fuer den
      // Nachweis -- kein Abbruchgrund: der Beleg bleibt der Beleg, das
      // angepasste Modell bleibt das Modell.
      if (baselineWertKwh > 0) {
        const roh = ((baselineWertEffektiv - baselineWertKwh) / baselineWertKwh) * 100;
        // Die Spalte ist numeric(7,2). Eine winzige erfasste Baseline (etwa
        // eine versehentliche 1 statt 10 000) erzeugt eine Abweichung von
        // Millionen Prozent -- der INSERT liefe auf einen numeric-Overflow
        // und der Lauf braeche mit einem DB-Fehler ab statt mit einer
        // Aussage. Jenseits dieser Grenze sagt die genaue Zahl ohnehin
        // nichts mehr, was „voellig verschieden" nicht schon sagt.
        baselineAbweichungPct = Math.max(-ABWEICHUNG_GRENZE_PCT, Math.min(ABWEICHUNG_GRENZE_PCT, roh));
      }
    }

    // --- Snapshots content-addressed einfrieren (B2) ---
    // Der Messwert-Snapshot traegt im Standard-Pfad AUCH die Tage der
    // Vermessung: er muss belegen, woraus die Koeffizienten entstanden sind.
    // Entdoppelt ueber (Tag, Kanal) -- Baseline-Periode und Zielperiode duerfen
    // sich ueberlappen (bei Pilotbestand A IST das Baselinejahr zugleich
    // Foerderjahr 1), und ein doppelt gezaehlter Tag verfaelschte den Hash und
    // die Zeilenzahl.
    const snapshotZeilenMap = new Map<string, TagesaggregatZeile>();
    for (const zeile of [...tagesZeilen, ...vermessungsZeilen]) {
      snapshotZeilenMap.set(`${zeile.tag}|${String(zeile.messkanalKey)}`, zeile);
    }
    const snapshotZeilen = [...snapshotZeilenMap.values()];
    const snapshotVon = snapshotZeilen.reduce((min, z) => (z.tag < min ? z.tag : min), dto.periodeVon);
    const snapshotBis = snapshotZeilen.reduce((max, z) => (z.tag > max ? z.tag : max), dto.periodeBis);

    const messwertKanoniziert = snapshotZeilen
      .map((z) => `${z.tag}|${z.messkanalKey}|${z.wertKwh.toFixed(3)}|${z.qualitaetMin}|${z.anzahlMesswerte}`)
      .sort();
    const messwertHash = sha256Canonical(messwertKanoniziert);
    const messwertSnapshot = await this.eingangSnapshotRepository.findeOderErstelle({
      endkundeId: dto.endkundeId,
      art: 'messwert_tag',
      inhaltHash: messwertHash,
      von: snapshotVon,
      bis: snapshotBis,
      zeilenAnzahl: snapshotZeilen.length,
    });
    if (messwertSnapshot.neuErstellt) {
      await this.eingangSnapshotRepository.insertMesswertTagZeilen(messwertSnapshot.id, snapshotZeilen);
    }

    const klimaKanoniziert = klimaZeilen.map((z) => `${z.tag}|${z.tMittelC.toFixed(2)}|${z.gtzTag.toFixed(2)}`);
    const klimaHash = sha256Canonical(klimaKanoniziert);
    const klimaVon = klimaZeilen[0]?.tag ?? dto.periodeVon;
    const klimaBis = klimaZeilen[klimaZeilen.length - 1]?.tag ?? dto.periodeBis;
    const klimaSnapshot = await this.eingangSnapshotRepository.findeOderErstelle({
      endkundeId: dto.endkundeId,
      art: 'klima_tag',
      inhaltHash: klimaHash,
      von: klimaVon,
      bis: klimaBis,
      zeilenAnzahl: klimaZeilen.length,
    });
    if (klimaSnapshot.neuErstellt) {
      await this.eingangSnapshotRepository.insertKlimaTagZeilen(klimaSnapshot.id, dto.stationRef, klimaZeilen);
    }

    // --- Einflussgrößen: DRITTE Snapshot-Art (ADR-0006 D7/A5/B7) ---
    // Systeme der `mvet_id` über die V0028-Zuordnungstabelle auflösen, dafür
    // die zum Lauf-Zeitraum GÜLTIGEN `einfluss.intervall`-Zeilen laden und
    // als pseudonyme PROJEKTION einfrieren — GENAU die sechs Spalten von
    // `analytics.eingang_einflussgroesse` (`EinflussIntervallLeseRepository`
    // selektiert die Verwaltungsfelder `betroffener_typ`/`quelle_typ`/
    // `rechtsgrundlage`/`abwaegung_ref`/`art14_information_at`/`anlass_code`
    // gar nicht erst — A5/D7-Kernauflage, s. dortiger Kommentar).
    //
    // BEWUSST KEIN Snapshot (bleibt `NULL`), wenn nichts im Scope ist — weder
    // wenn `energy.messkonzept_version_energietraeger_system` KEINE
    // Zuordnung für diese `mvet_id` trägt (V0028: Übergangszustand, "Tabelle
    // startet LEER"), noch wenn zugeordnete Systeme im Lauf-Zeitraum KEINE
    // gültigen Intervalle haben. Das ist der REGELFALL, solange die
    // Zuordnungstabelle kaum gepflegt ist — Abweichung von V0027s (dort
    // ausdrücklich NICHT erzwungener) Empfehlung "immer einen, ggf. leeren,
    // Snapshot erzeugen": ein bei JEDEM Lauf entstehender leerer Snapshot
    // wäre reines DB-Rauschen, solange der Regelfall "keine Zuordnung
    // gepflegt" ist, und suggerierte fälschlich, es sei bereits geprüft
    // worden, ob Einflussgrößen existieren, obwohl nur die Zuordnung fehlt.
    const einflussSystemIds = mvetSystemIds;
    let einflussgroesseSnapshotId: string | null = null;
    let einflussgroesseHash: Buffer | null = null;
    if (einflussSystemIds.length > 0) {
      const einflussZeilen = await this.einflussIntervallLeseRepository.findGueltigeFuerSysteme(
        einflussSystemIds,
        dto.periodeVon,
        dto.periodeBis,
      );
      if (einflussZeilen.length > 0) {
        const einflussKanoniziert = einflussZeilen
          .map(
            (z) =>
              `${z.systemId}|${z.groesseCode}|${z.wertNum === null ? '' : z.wertNum.toFixed(3)}|${z.wertCode ?? ''}|${z.gueltigAbMonat}|${z.gueltigBisMonat ?? ''}`,
          )
          .sort();
        einflussgroesseHash = sha256Canonical(einflussKanoniziert);
        const einflussSnapshot = await this.eingangSnapshotRepository.findeOderErstelle({
          endkundeId: dto.endkundeId,
          art: 'einflussgroesse',
          inhaltHash: einflussgroesseHash,
          von: dto.periodeVon,
          bis: dto.periodeBis,
          zeilenAnzahl: einflussZeilen.length,
        });
        if (einflussSnapshot.neuErstellt) {
          await this.eingangSnapshotRepository.insertEinflussgroesseZeilen(einflussSnapshot.id, einflussZeilen);
        }
        einflussgroesseSnapshotId = einflussSnapshot.id;
      }
    }

    // --- Monatswerte ---
    const ergebnisZeilen: LaufergebnisZeileInput[] = monate.map((monat) => {
      const gtzMonatIst = klimaZeilen
        .filter((z) => z.tag >= monat.von && z.tag < monat.bis)
        .reduce((summe, z) => summe + z.gtzTag, 0);

      let referenzKwh: number;
      try {
        referenzKwh = referenzMonat({
          baselineJahresWertKwh: baselineWertEffektiv,
          grundlastAnteil: grundlastAnteilEffektiv,
          // Die Tage DER SCHEIBE — bei einem angeschnittenen Randmonat weniger
          // als der Kalendermonat hat. Genau das ist die zeitanteilige
          // Ermittlung, die Kap. 9.1 des Technischen Merkblatts verlangt.
          tageImMonat: monat.tageImZeitraum,
          tageProJahr: effektiv.tageProJahr,
          gtzMonatIst,
          gtzBase: grundlastAnteilEffektiv === 1 ? null : gtzBase,
        });
      } catch (error: unknown) {
        if (error instanceof RangeError) {
          throw ungueltigeEingabe(
            `Rechenkern hat die Eingaben fuer den Zeitraum ${monat.von}..${monat.bis} abgelehnt: ${error.message}`,
          );
        }
        throw error;
      }

      const klassifikation = this.klassifiziereMonat(monat, tagesZeilen, erwarteteKanalzahl);

      return {
        monat: monat.monat,
        referenzKwh: this.runde(referenzKwh, 3),
        istKwh: this.runde(klassifikation.istKwh, 3),
        gtzIst: this.runde(gtzMonatIst, 2),
        tageGesamt: monat.tageImZeitraum,
        tageGemessen: klassifikation.tageGemessen,
        tageGeschaetzt: klassifikation.tageGeschaetzt,
        tageErsatz: klassifikation.tageErsatz,
        tageFehlend: klassifikation.tageFehlend,
        abdeckungPct: this.runde(klassifikation.abdeckungPct, 2),
        qualitaetsStufe: klassifikation.qualitaetsStufe,
      };
    });

    const qualitaetsStufeMin = this.schlechtesteStufe(ergebnisZeilen.map((z) => z.qualitaetsStufe));

    let gtzNorm: number | null = null;
    let baselineNormKwh: number | null = null;
    if (dto.gtzNormOverride !== undefined) {
      gtzNorm = dto.gtzNormOverride;
      try {
        baselineNormKwh = this.runde(
          baselineNormiert({
            baselineJahresWertKwh: baselineWertEffektiv,
            grundlastAnteil: grundlastAnteilEffektiv,
            gtzNorm: dto.gtzNormOverride,
            gtzBase: grundlastAnteilEffektiv === 1 ? null : gtzBase,
          }),
          3,
        );
      } catch (error: unknown) {
        if (error instanceof RangeError) {
          throw ungueltigeEingabe(`Rechenkern hat gtzNormOverride abgelehnt: ${error.message}`);
        }
        throw error;
      }
    }

    const parameter = {
      t_innen_c: effektiv.gtzParameter.tInnenC,
      t_heizgrenze_c: effektiv.gtzParameter.tHeizgrenzeC,
      tage_pro_jahr: effektiv.tageProJahr,
      tages_zeitzone: effektiv.tagesZeitzone,
      // Seit Verfahrensversion 2 (V0076) Pflichtfeld des Parametersatzes: es
      // entscheidet, welcher Weg zu (a0, b1) gefuehrt hat, und geht damit in
      // `parameter_hash` ein. Zwei Laeufe mit identischen GTZ-Parametern, aber
      // unterschiedlichem Messkonzept sind NICHT derselbe Lauf.
      messkonzept_typ: mvet.messkonzeptTyp,
      ...(passtKoeffizientenAn
        ? { regression_mindest_punkte: MINDEST_PUNKTE, regression_mindest_gtz_streuung: MINDEST_GTZ_STREUUNG }
        : {}),
    };
    const parameterHash = sha256Canonical([JSON.stringify(parameter)]);
    // rohdaten_hash — DRITTE Komponente NUR, wenn tatsächlich ein
    // Einflussgrößen-Snapshot entstanden ist (Entscheidung (b) der finalen
    // Antwort dieses Arbeitspakets, NICHT (a) "immer einrechnen, ggf. mit
    // Platzhalter"): ADR-0006 D7 sagt wörtlich, Einflussgrößen "gehen ...
    // in rohdaten_hash ... ein" — das gilt nur für Einflussgrößen, die
    // TATSÄCHLICH in die Rohdatenmenge eingegangen sind. Ein Lauf OHNE
    // Einflussgrößen im Scope (der v1-Regelfall, s. o.) hat rein SEMANTISCH
    // keine dritte Rohdaten-Komponente — ein synthetischer Platzhalter
    // würde einen nicht vorhandenen Bestandteil VORTÄUSCHEN. Praktische
    // Konsequenz: `rohdaten_hash` bleibt für JEDEN Lauf ohne Einflussgrößen-
    // Snapshot BYTIDENTISCH zur alten Zwei-Komponenten-Formel (hash-stabil
    // zu allen Läufen vor diesem Patch) — nur ein Lauf, der TATSÄCHLICH
    // einen dritten Snapshot einfriert, bekommt einen strukturell neuen
    // Hash-Raum (kein Bruch für alle anderen).
    const rohdatenHash =
      einflussgroesseHash === null
        ? sha256Canonical([messwertHash.toString('hex'), klimaHash.toString('hex')])
        : sha256Canonical([messwertHash.toString('hex'), klimaHash.toString('hex'), einflussgroesseHash.toString('hex')]);

    const lauf = await this.berechnungslaufRepository.insertLauf({
      id: randomUUID(),
      endkundeId: dto.endkundeId,
      energietraeger: mvet.energietraeger,
      mvetId: dto.mvetId,
      verfahrenCode: verfahren.code,
      verfahrenVersion: verfahren.version,
      parameter,
      parameterHash,
      periodeVon: dto.periodeVon,
      periodeBis: dto.periodeBis,
      messwertSnapshotId: messwertSnapshot.id,
      klimaSnapshotId: klimaSnapshot.id,
      einflussgroesseSnapshotId,
      stationRef: dto.stationRef,
      rohdatenHash,
      baselineWertKwh: this.runde(baselineWertEffektiv, 3),
      grundlastAnteil: this.runde(grundlastAnteilEffektiv, 3),
      gtzBase: this.runde(gtzBase, 2),
      messkonzeptTyp: mvet.messkonzeptTyp,
      gueteR2: regression === null ? null : this.runde(regression.bestimmtheitsmass, 4),
      gueteCvRmsePct: regression === null ? null : this.runde(regression.cvRmsePct, 2),
      gueteNmbePct: regression === null ? null : this.runde(regression.nmbePct, 2),
      guetePunkte: regression?.punkte ?? null,
      baselineAbweichungPct: baselineAbweichungPct === null ? null : this.runde(baselineAbweichungPct, 2),
      gtzNorm,
      baselineNormKwh,
      qualitaetsStufeMin,
      ausloeser: dto.ausloeser ?? 'manuell',
      codeRevision: process.env['EDMS_CODE_REVISION'] ?? 'dev-unbekannt',
      ersetztLaufId: dto.ersetztLaufId ?? null,
    });

    await this.berechnungslaufRepository.insertLaufergebnisZeilen(lauf.id, ergebnisZeilen);
    await this.berechnungslaufRepository.insertRetentionStatus(lauf.id);

    const ergebnisse = await this.berechnungslaufRepository.findErgebnisseByLaufId(lauf.id);
    return { lauf, ergebnisse, systemgrenzeQuelle };
  }

  /**
   * Klimatage für `[von, bis)` aus `analytics.klima_tag`; fehlende
   * Kalendertage werden zuvor über den `KlimaQuellePort` nachgefüllt
   * (synthetisch oder real vom DWD, je nach `EDMS_KLIMA_QUELLE` — der
   * Service kennt den Unterschied nicht, s. `KlimaQuellePort`-Doc).
   *
   * Die Herkunft des Abrufs (Quelle, Dateiversion, Lizenzkennung) wandert
   * mit in die Zeile: nur so lässt sich später belegen, aus welcher Datei
   * unter welcher Lizenz ein Baseline-Wert stammt (Auflage A-3,
   * `docs/datenquellen.md` DQ-001).
   *
   * Bleiben danach Tage offen, weil die Quelle sie nicht kennt (bei realen
   * DWD-Daten der Normalfall bei Stationsausfall), wird das NICHT stillschweigend
   * hingenommen: eine unvollständige Gradtagzahl-Summe unterschätzt den
   * Heizbedarf und damit die ausgewiesene Einsparung. Der Lauf bricht dann ab
   * und benennt die Lücke — aber nur, wenn die Gradtagzahl überhaupt in das
   * Ergebnis eingeht (`pruefeVollstaendigkeit`, s. Aufrufstelle).
   */
  private async holeKlimaTageMitNachfuellen(
    stationRef: string,
    von: string,
    bis: string,
    pruefeVollstaendigkeit: boolean,
  ): Promise<KlimaTagWert[]> {
    let tage = await this.klimaTagRepository.findTage(stationRef, von, bis);
    const erwarteteTage = enumerateDays(von, bis);

    if (tage.length < erwarteteTage.length) {
      const vorhandeneTage = new Set(tage.map((t) => t.tag));
      const fehlendeTage = new Set(erwarteteTage.filter((tag) => !vorhandeneTage.has(tag)));
      if (fehlendeTage.size > 0) {
        const abruf = await this.klimaQuellePort.holeTageswerte(stationRef, von, bis);
        const nachzufuellen = abruf.werte.filter((wert) => fehlendeTage.has(wert.tag));
        await this.klimaTagRepository.insertAbruf(stationRef, nachzufuellen, abruf.herkunft);
        tage = await this.klimaTagRepository.findTage(stationRef, von, bis);
      }
    }

    if (pruefeVollstaendigkeit && tage.length < erwarteteTage.length) {
      const vorhanden = new Set(tage.map((t) => t.tag));
      const fehlend = erwarteteTage.filter((tag) => !vorhanden.has(tag));
      throw new BerechnungFehlerException(
        BERECHNUNG_FEHLER_CODES.KLIMADATEN_UNVOLLSTAENDIG,
        HttpStatus.BAD_REQUEST,
        `Klimadaten unvollstaendig fuer Station '${stationRef}' im Zeitraum [${von}, ${bis}): ` +
          `${fehlend.length} von ${erwarteteTage.length} Tagen fehlen (erste Luecke: ${fehlend[0] ?? '-'}). ` +
          `Eine unvollstaendige Gradtagzahl-Summe wuerde den Heizbedarf und damit die ausgewiesene Einsparung verfaelschen.`,
      );
    }

    return tage;
  }

  /**
   * B12.4 — Tagesklassifikation über ALLE einbezogenen Messkanäle
   * (worst-case, "restriktivste Auflösung bei Mehrdeutigkeit", analog
   * `StammdatenResourceAttributesProvider`-Finding-A-Konvention): ein Tag
   * gilt NUR dann als "gemessen", wenn JEDER erwartete Kanal an diesem Tag
   * einen Wert mit Rang `gemessen`/`korrigiert` beisteuert. Fehlt EIN Kanal
   * komplett (kein Rohwert-/Delta-Beitrag diesen Tag), zählt der GESAMTE
   * Tag als "fehlend" für diesen Kanal-Beitrag — d. h. der Tages-Tier ist
   * das MINIMUM über alle Kanäle, "fehlender Kanal" = Tier -1 (schlechter
   * als `ersatzwert`=0).
   */
  /**
   * Tageswerte ueber die erfassten Baseline-Perioden — die Vermessung, an die
   * der Standard-Pfad seine Koeffizienten anpasst. Getrennt von den Zeilen der
   * Zielperiode geholt, weil beide Mengen sich ueberlappen duerfen und nur die
   * Zielperiode in die Monatsklassifikation eingehen darf.
   */
  private async holeVermessungsZeilen(
    zaehlerIds: readonly string[],
    perioden: readonly { readonly von: string; readonly bis: string }[],
    tagesZeitzone: string,
  ): Promise<readonly TagesaggregatZeile[]> {
    const zeilen: TagesaggregatZeile[] = [];
    for (const periode of perioden) {
      const teil = await this.messwertMonatRepository.berechneTagesaggregation({
        zaehlerIds,
        von: periode.von,
        bis: periode.bis,
        zeitzone: tagesZeitzone,
      });
      zeilen.push(...teil);
    }
    return zeilen;
  }

  /**
   * Monatspunkte der Vermessung fuer die Anpassung: je Monatsscheibe die
   * Kalendertage, die Gradtagzahl und der gemessene Verbrauch.
   *
   * UNVOLLSTAENDIGE MONATE FALLEN HERAUS. Ein Monat, in dem an einzelnen Tagen
   * nicht gemessen wurde, traegt einen zu niedrigen Verbrauch bei voller
   * Gradtagzahl — die Anpassung zoege daraus eine zu flache Kennlinie und
   * damit dauerhaft eine zu niedrige Baseline-Erwartung. Das waere ein
   * systematischer, immer gleichgerichteter Fehler zu Lasten des Endkunden.
   * Ihn zu uebersehen ist leicht, weil das Ergebnis plausibel aussieht.
   *
   * Angeschnittene Monatsscheiben bleiben dagegen zulaessig, solange sie
   * LUECKENLOS sind: die Kalendertage sind ein eigener Regressor, eine
   * vollstaendig gemessene Zwanzig-Tage-Scheibe ist ein gueltiger Punkt.
   */
  private bildeVermessungsMonate(
    perioden: readonly { readonly von: string; readonly bis: string }[],
    zeilen: readonly TagesaggregatZeile[],
    klimaZeilen: readonly KlimaZeileMitGtz[],
  ): readonly VermessungsMonat[] {
    const monate: VermessungsMonat[] = [];
    for (const periode of perioden) {
      for (const scheibe of enumerateMonths(periode.von, periode.bis)) {
        const zeilenDerScheibe = zeilen.filter((z) => z.tag >= scheibe.von && z.tag < scheibe.bis);
        const gemesseneTage = new Set(zeilenDerScheibe.map((z) => z.tag));
        if (gemesseneTage.size < scheibe.tageImZeitraum) {
          continue;
        }
        monate.push({
          monat: scheibe.von,
          tage: scheibe.tageImZeitraum,
          verbrauchKwh: zeilenDerScheibe.reduce((summe, z) => summe + z.wertKwh, 0),
          // Die TEMPERATUREN, nicht die fertige Gradtagzahl: Scheitert die
          // Anpassung, wird unten nach einer passenden Heizgrenze gesucht —
          // und die verändert jede Gradtagzahl.
          temperaturenC: klimaZeilen
            .filter((z) => z.tag >= scheibe.von && z.tag < scheibe.bis)
            .map((z) => z.tMittelC),
        });
      }
    }
    // Deterministische Reihenfolge: die Summen der Normalgleichung sind in
    // Gleitkomma nicht assoziativ, und der Lauf muss reproduzierbar sein (F6).
    return monate.sort((a, b) => (a.monat < b.monat ? -1 : a.monat > b.monat ? 1 : 0));
  }

  /** Monatspunkte für die Anpassung — Gradtagzahl mit den Parametern DIESES Laufs. */
  private zuBaselinePunkten(
    monate: readonly VermessungsMonat[],
    gtzParameter: GtzParameter,
  ): readonly BaselinePunkt[] {
    return monate.map((m) => ({
      monat: m.monat,
      tage: m.tage,
      verbrauchKwh: m.verbrauchKwh,
      gtz: m.temperaturenC.reduce((summe, t) => summe + gradtagzahlTag(t, gtzParameter), 0),
    }));
  }

  /**
   * Ergänzt die Abbruchmeldung um die Heizgrenze, bei der dieselbe Vermessung
   * durchginge.
   *
   * Der Grund steht in ADR-0006 C10.2/C10.3: Der häufigste Abbruchgrund ist
   * nicht die Datenlage, sondern ein Parameter — und wer die Meldung liest,
   * kann den Kandidaten nicht selbst durchrechnen. Ohne diesen Zusatz endet
   * die Spur bei „die Eingangsdaten sind zu pruefen", und das führt in die
   * falsche Richtung.
   */
  private heizgrenzeHinweis(monate: readonly VermessungsMonat[], gtzParameter: GtzParameter): string {
    const vorschlag = sucheHeizgrenze(monate, (tMittelC, tHeizgrenzeC) =>
      gradtagzahlTag(tMittelC, { tInnenC: gtzParameter.tInnenC, tHeizgrenzeC }),
    );
    if (vorschlag === null || vorschlag.tHeizgrenzeC === gtzParameter.tHeizgrenzeC) {
      return '';
    }
    return (
      ` Geprueft: Mit t_heizgrenze_c = ${String(vorschlag.tHeizgrenzeC)} °C statt ` +
      `${String(gtzParameter.tHeizgrenzeC)} °C ergaebe dieselbe Vermessung eine Grundlast von ` +
      `${vorschlag.grundlastProTagKwh.toFixed(2)} kWh/d bei R² = ${vorschlag.bestimmtheitsmass.toFixed(4)} ` +
      `und CV(RMSE) = ${vorschlag.cvRmsePct.toFixed(2)} %. Die Heizgrenze ist je Messkonzept zu begruenden, ` +
      'nicht pauschal zu uebernehmen (ADR-0006 C10-O1).'
    );
  }

  private klassifiziereMonat(
    monat: Monatsscheibe,
    tagesZeilen: readonly TagesaggregatZeile[],
    erwarteteKanalzahl: number,
  ): {
    readonly istKwh: number;
    readonly tageGemessen: number;
    readonly tageGeschaetzt: number;
    readonly tageErsatz: number;
    readonly tageFehlend: number;
    readonly abdeckungPct: number;
    readonly qualitaetsStufe: QualitaetsStufe;
  } {
    const tageDesMonats = enumerateDays(monat.von, monat.bis);
    let istKwh = 0;
    let tageGemessen = 0;
    let tageGeschaetzt = 0;
    let tageErsatz = 0;
    let tageFehlend = 0;
    let laufenderAusfall = 0;
    let maxAusfall = 0;

    for (const tag of tageDesMonats) {
      const zeilenDesTages = tagesZeilen.filter((z) => z.tag === tag);
      istKwh += zeilenDesTages.reduce((summe, z) => summe + z.wertKwh, 0);

      const tier =
        erwarteteKanalzahl === 0 || zeilenDesTages.length < erwarteteKanalzahl
          ? -1
          : Math.min(...zeilenDesTages.map((z) => Math.floor(z.qualitaetMin / 10)));

      if (tier >= 2) {
        tageGemessen += 1;
        laufenderAusfall = 0;
      } else {
        if (tier === 1) {
          tageGeschaetzt += 1;
        } else if (tier === 0) {
          tageErsatz += 1;
        } else {
          tageFehlend += 1;
        }
        laufenderAusfall += 1;
        maxAusfall = Math.max(maxAusfall, laufenderAusfall);
      }
    }

    // Gegen die Tage DER SCHEIBE, nicht des Kalendermonats: Ein
    // angeschnittener Randmonat mit zwanzig vollstaendig gemessenen Tagen hat
    // 100 % Abdeckung, nicht 65 %.
    const abdeckungPct = (100 * tageGemessen) / monat.tageImZeitraum;
    let qualitaetsStufe: QualitaetsStufe;
    if (abdeckungPct < 75) {
      qualitaetsStufe = 'nicht_ausweisbar';
    } else if (abdeckungPct >= 90 && maxAusfall <= 7) {
      qualitaetsStufe = 'belastbar';
    } else {
      qualitaetsStufe = 'eingeschraenkt';
    }

    return { istKwh, tageGemessen, tageGeschaetzt, tageErsatz, tageFehlend, abdeckungPct, qualitaetsStufe };
  }

  /** B12.4: "Der Lauf-Kopf führt die schlechteste Stufe der Periode." */
  private schlechtesteStufe(stufen: readonly QualitaetsStufe[]): QualitaetsStufe {
    const rang: Record<QualitaetsStufe, number> = { belastbar: 2, eingeschraenkt: 1, nicht_ausweisbar: 0 };
    return stufen.reduce<QualitaetsStufe>(
      (schlechteste, stufe) => (rang[stufe] < rang[schlechteste] ? stufe : schlechteste),
      'belastbar',
    );
  }

  private runde(wert: number, nachkommastellen: number): number {
    const faktor = 10 ** nachkommastellen;
    return Math.round(wert * faktor) / faktor;
  }

  private klassifiziereFehler(error: unknown): BerechnungFehlerCode {
    if (error instanceof BerechnungFehlerException) {
      return error.fehlerCode;
    }
    return BERECHNUNG_FEHLER_CODES.UNERWARTETER_FEHLER;
  }

  /** `kontext`-Grundgerüst, das ALLE drei/vier `berechnungslauf.bereinigung.*`-Events teilen (V0021-Whitelist). */
  private baseKontext(input: {
    readonly dto: BerechnungslaufAnlegenDto;
    readonly mvet: MvetInfo;
    readonly monate: readonly Monatsscheibe[];
    readonly verfahren: { readonly code: string; readonly version: number };
    readonly synthetic: boolean;
  }): Record<string, string | number | boolean> {
    return {
      synthetic: input.synthetic,
      endkunde_id: input.dto.endkundeId,
      energietraeger: input.mvet.energietraeger,
      verfahren_code: input.verfahren.code,
      verfahren_version: input.verfahren.version,
      periode_von: input.dto.periodeVon,
      periode_bis: input.dto.periodeBis,
      monate_anzahl: input.monate.length,
    };
  }
}
