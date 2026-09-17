import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Propagation, Transactional } from '@nestjs-cls/transactional';
import type { SecurityContext } from '../common/security/security-context';
import { nichtGefunden, ungueltigeEingabe } from '../stammdaten/common/problem.util';
import { AuditService } from '../audit/audit.service';
import { NACHWEIS_EVENT_CODES } from './audit/nachweis-audit-events';
import { EnergyEndkundeRepository } from '../stammdaten/persistence/energy/energy-endkunde.repository';
import type { Endkunde } from '../stammdaten/persistence/energy/energy-endkunde.repository';
import { AnalyticsVerfahrenRepository } from '../berechnung/persistence/analytics-verfahren.repository';
import { AnalyticsLaufLookupRepository } from './persistence/analytics-lauf-lookup.repository';
import { NachweisFoerderjahrRepository } from './persistence/nachweis-foerderjahr.repository';
import { NachweisPreflightRepository } from './persistence/nachweis-preflight.repository';
import type { InsertBefundInput, Preflight, PreflightBefund, PreflightBefundSchwere } from './persistence/nachweis-preflight.repository';
import { klassifiziereAnschlussnutzerEinschraenkung, klassifiziereEndkundeEinschraenkung } from './domain/paar-einschraenkung';
import { klassifiziereMonat } from './domain/monats-behandlung';
import { loeseBindungAuf } from './domain/bindung-resolver';
import { SubstitutionErkennungService } from './substitution-erkennung';
import { naechsterMonat, scheibenDesFoerderjahres } from './zeit.util';
import type { Monatsscheibe } from './zeit.util';
import { AUSGENOMMENE_FOERDERJAHR_BLOCKER_REGEL_CODES, KETTE_NICHT_AUFLOESBAR_REGEL_CODE, PREFLIGHT_PROFIL_CODE } from './verfahren.const';
import { DWD_AENDERUNGSVERMERK, istQuellenvermerkPlatzhalter } from '../berechnung/klima/dwd-quellenvermerk.const';
import type { PreflightAusfuehrenDto } from './dto/preflight-ausfuehren.dto';
import { toSeite } from '../stammdaten/common/seite.dto';
import type { Seite } from '../stammdaten/common/seite.dto';

/** A-1/A20 (`docs/datenquellen.md` DQ-001) — die Konstante trägt den Marker wörtlich, solange der reale DWD-Text nicht eingesetzt ist. */

export interface PreflightMitBefunden {
  readonly preflight: Preflight;
  readonly befunde: readonly PreflightBefund[];
}

/**
 * `POST /nachweis/preflights` (`create:nachweis_preflight`, ADR-0007 D4/B4) —
 * Vollständigkeits-Preflight (DE-02, M2). Wiederholbar/idempotent (jeder
 * Aufruf erzeugt einen NEUEN, append-only `nachweis.preflight`-Datensatz —
 * "idempotent" im ADR-Sinn heißt hier: gleiche Eingabe → gleiches Ergebnis,
 * NICHT "kein zweiter Datensatz", s. D4).
 *
 * Regel-Codes FJ-01..FJ-09 (FJ-07 als FJ-07a/b/c, Auflage A11) werden hier
 * ANGEWANDT — der KATALOG-Eintrag selbst (`analytics.verfahren_version`,
 * code=`foerderjahr_preflight_de02`) wird nur ALS REFERENZ GELESEN
 * (`profil_code`/`profil_version` am Preflight-Kopf), NICHT interpretiert
 * (V0024-Migrationskommentar: „es existiert noch KEIN Preflight-
 * Ausführungsmotor im Repo" — DIESER Service ist der erste).
 *
 * ZWEI weitere Codes (backend-lead-Design-Entscheidung 2026-08-26, ADR-0006
 * P4/ADR-0007 A12, s. `verfahren.const.ts` — KEIN Katalog-Eintrag ohne
 * Migration, Entwurf V0030 NICHT angewendet): `FJ-11a/b/c` (Anschlussnutzer-
 * Sperre, Analogon zu FJ-07a/b/c) und `FJ-10` (Anschlussnutzer-Sperrstatus
 * strukturell nicht auflösbar — gate't NUR die Export-Kategorie `rohdaten`,
 * s. `nachweis-export-renderer.ts`).
 */
@Injectable()
export class PreflightService {
  constructor(
    private readonly foerderjahrRepository: NachweisFoerderjahrRepository,
    private readonly verfahrenRepository: AnalyticsVerfahrenRepository,
    private readonly laufLookupRepository: AnalyticsLaufLookupRepository,
    private readonly endkundeRepository: EnergyEndkundeRepository,
    private readonly preflightRepository: NachweisPreflightRepository,
    private readonly auditService: AuditService,
    private readonly substitutionErkennungService: SubstitutionErkennungService,
  ) {}

  async ausfuehren(dto: PreflightAusfuehrenDto, subject: SecurityContext, synthetic: boolean): Promise<PreflightMitBefunden> {
    const foerderjahr = await this.foerderjahrRepository.findById(dto.foerderjahrId);
    if (foerderjahr === undefined) {
      throw nichtGefunden('Foerderjahr');
    }
    if (dto.profilCode !== PREFLIGHT_PROFIL_CODE) {
      throw ungueltigeEingabe(`profilCode '${dto.profilCode}' ist unbekannt — v1 kennt nur '${PREFLIGHT_PROFIL_CODE}'.`);
    }
    const profil = await this.verfahrenRepository.findAktiveVersion(dto.profilCode);
    if (profil === undefined) {
      // Sollte strukturell nie eintreten — die Katalogzeile ist seit V0024 live.
      throw new Error(`Kein aktives Verfahren '${dto.profilCode}' im Katalog (analytics.verfahren_version).`);
    }

    // Zeitscheiben statt Monatserster (V0070): Ein Foerderjahr aus dem
    // Bewilligungszeitraum hat angeschnittene Randmonate, und zwei
    // aufeinanderfolgende teilen sich einen Kalendermonat.
    const monatsmenge = scheibenDesFoerderjahres(foerderjahr.vonTag, foerderjahr.bisTag);

    const preflight = await this.pruefeUndSpeichernInTx({
      foerderjahrId: foerderjahr.id,
      profilCode: profil.code,
      profilVersion: profil.version,
      vonMonat: foerderjahr.vonMonat,
      bisMonatExklusiv: naechsterMonat(foerderjahr.bisMonat),
      monatsmenge,
      synthetic,
      ausgefuehrtVonSub: subject.sub,
    });

    const regelCodes = [...new Set(preflight.befunde.map((b) => b.regelCode))].sort().join(',');
    await this.auditService.append({
      eventTyp: NACHWEIS_EVENT_CODES.PREFLIGHT_DURCHGEFUEHRT,
      actorTyp: subject.actorTyp,
      actorSub: subject.sub,
      ergebnis: 'ok',
      objektRef: preflight.preflight.id,
      kontext: {
        synthetic,
        preflight_id: preflight.preflight.id,
        foerderjahr_code: foerderjahr.code,
        profil_code: profil.code,
        profil_version: profil.version,
        ergebnis: preflight.preflight.ergebnis,
        blocker_anzahl: preflight.preflight.blockerAnzahl,
        warnung_anzahl: preflight.preflight.warnungAnzahl,
        hinweis_anzahl: preflight.preflight.hinweisAnzahl,
        umfang_paare_anzahl: preflight.preflight.umfangPaareAnzahl,
        regel_codes: regelCodes,
      },
    });

    return preflight;
  }

  async finden(id: string): Promise<Preflight> {
    const preflight = await this.preflightRepository.findById(id);
    if (preflight === undefined) {
      throw nichtGefunden('Preflight');
    }
    return preflight;
  }

  async befunde(preflightId: string, optionen: { readonly cursorLfd?: number; readonly limit: number }): Promise<Seite<PreflightBefund>> {
    await this.finden(preflightId);
    const result = await this.preflightRepository.findBefunde(preflightId, optionen);
    return toSeite(result.daten, result.naechsterCursorLfd === null ? null : String(result.naechsterCursorLfd), optionen.limit);
  }

  /**
   * ALLES in einer Tx (Muster `BerechnungslaufService.berechnenUndSpeichernInTx`).
   * A11/C2-KRITISCH: `FJ-07c`-Befunde tragen `schwere='blocker'`
   * (Katalog-Vorgabe, V0024-`const`) — sie zählen aber BEWUSST NICHT in
   * `blocker_anzahl`/das `ergebnis`-Gate. Grund (C2, wörtlich): „Eine
   * Kontrolle, die zu ihrer eigenen Umgehung drängt, ist keine" — ein
   * einziger widersprechender Anschlussnutzer/Endkunde darf NICHT den
   * gesamten Förderjahr-Preflight rot färben, das war GENAU die
   * Fehlkonstruktion, die A11 korrigiert. Die einzelne `preflight_befund`-
   * Zeile bleibt trotzdem `schwere='blocker'` (semantisch: „blockiert DIESES
   * PAAR"), NUR die Kopf-Aggregation `blocker_anzahl` blendet `FJ-07c` aus.
   * `nachweis.preflight` selbst hat KEINE DB-Spalte, die diese Filterung
   * erzwingt (`blocker_anzahl` ist ein reiner App-Wert, NUR
   * `ergebnis='gruen' ⇔ blocker_anzahl=0` ist DB-CHECK-erzwungen) — die
   * Korrektheit dieser Filterung liegt vollständig hier, s. Regressionstest
   * `preflight.service.integration.spec.ts` (FJ-07c allein ⇒ dennoch grün).
   */
  @Transactional(Propagation.Nested)
  private async pruefeUndSpeichernInTx(kontext: {
    readonly foerderjahrId: string;
    readonly profilCode: string;
    readonly profilVersion: number;
    readonly vonMonat: string;
    readonly bisMonatExklusiv: string;
    readonly monatsmenge: readonly Monatsscheibe[];
    readonly synthetic: boolean;
    readonly ausgefuehrtVonSub: string;
  }): Promise<PreflightMitBefunden> {
    const befunde: InsertBefundInput[] = [];
    const push = (input: InsertBefundInput): void => {
      befunde.push(input);
    };

    // FJ-01 — strukturell durch die DB-CHECKs auf nachweis.foerderjahr bereits
    // ausgeschlossen (bis_monat >= von_monat, beide Monatsanfaenge); dieser
    // Zweig bleibt als Backstop, NIE erreichbar unter dem heutigen Schema.
    if (kontext.monatsmenge.length === 0) {
      push({ regelCode: 'FJ-01', schwere: 'blocker' });
    }

    // FJ-08 (A-1/A20) — Platzhalter-Marker + Aenderungsvermerk-Vorhandensein.
    // VEREINFACHUNG (dokumentiert, s. finale Antwort): die A20-Nuance „NUR
    // wenn tatsaechlich DWD-Klimadaten (nicht Grundlast-/Synthetik-Laeufe) in
    // mindestens einen gebundenen Lauf eingegangen sind" wird in v1 NICHT
    // geprueft (`analytics.berechnungslauf` traegt kein "hat DWD verwendet"-
    // Merkmal) — der Check greift UNBEDINGT.
    if (istQuellenvermerkPlatzhalter()) {
      push({ regelCode: 'FJ-08', schwere: 'blocker', kennzahlKlasse: 'platzhalter_marker' });
    }
    if (typeof DWD_AENDERUNGSVERMERK !== 'string' || DWD_AENDERUNGSVERMERK.trim().length === 0) {
      push({ regelCode: 'FJ-08', schwere: 'blocker', kennzahlKlasse: 'aenderungsvermerk_fehlt' });
    }

    // FJ-09 — synthetic=true blockt IMMER (Gate-ZU-Konsistenz, s.
    // Design-Entscheidungen in der finalen Antwort: solange
    // EDMS_SYNTHETIC_ONLY=true systemweit gilt, ist EIN gruener Preflight
    // fuer art=foerderjahr_nachweis strukturell unerreichbar — das ist
    // beabsichtigt, kein Bug).
    if (kontext.synthetic) {
      push({ regelCode: 'FJ-09', schwere: 'blocker' });
    }

    const scopePaare = await this.laufLookupRepository.findScopePaare(kontext.vonMonat, kontext.bisMonatExklusiv);

    const endkundeCache = new Map<string, Endkunde | undefined>();
    const getEndkunde = async (endkundeId: string): Promise<Endkunde | undefined> => {
      if (!endkundeCache.has(endkundeId)) {
        endkundeCache.set(endkundeId, await this.endkundeRepository.findById(endkundeId));
      }
      return endkundeCache.get(endkundeId);
    };

    for (const paar of scopePaare) {
      const endkunde = await getEndkunde(paar.endkundeId);
      if (endkunde !== undefined) {
        const einschraenkung = klassifiziereEndkundeEinschraenkung({
          verarbeitungsStatus: endkunde.verarbeitungsStatus,
          einschraenkungGrundCode: endkunde.einschraenkungGrundCode ?? null,
        });
        if (einschraenkung.regelCode !== null && einschraenkung.schwere !== null) {
          push({
            regelCode: einschraenkung.regelCode,
            schwere: einschraenkung.schwere,
            endkundeId: paar.endkundeId,
            energietraeger: paar.energietraeger,
            ...(einschraenkung.grundFehlend ? { kennzahlKlasse: 'grund_fehlt' } : {}),
          });
        }
      }

      if (await this.substitutionErkennungService.pruefen(paar.endkundeId, paar.energietraeger)) {
        push({ regelCode: 'FJ-06', schwere: 'warnung', endkundeId: paar.endkundeId, energietraeger: paar.energietraeger });
      }

      // ADR-0006 P4 / ADR-0007 A12 — Anschlussnutzer-Sperre (FJ-11a/b/c) +
      // Kettenauflösbarkeit (FJ-10, s. `verfahren.const.ts`). Dieselbe
      // Dreiteilung wie beim Endkunden, EIN Befund je betroffenem
      // Anschlussnutzer (forensisch nachvollziehbar über `kennzahlKlasse`,
      // `preflight_befund` hat KEINE eigene `anschlussnutzer_id`-Spalte).
      const anschlussnutzerPruefung = await this.laufLookupRepository.findAnschlussnutzerSperrenFuerPaar(
        paar.endkundeId,
        paar.energietraeger,
        kontext.vonMonat,
        kontext.bisMonatExklusiv,
      );
      for (const an of anschlussnutzerPruefung.gesperrteAnschlussnutzer) {
        const einschraenkungAn = klassifiziereAnschlussnutzerEinschraenkung({
          verarbeitungsStatus: an.verarbeitungsStatus,
          // A11/V0024: `energy.anschlussnutzer` traegt den Sperrgrund sehr wohl
          // (dieselbe Spalte wie `energy.endkunde`). Ihn durchzureichen ist der
          // Unterschied zwischen FJ-11b (Wert AUSWEISEN + kennzeichnen,
          // Art. 18(1)(a)/(c)) und FJ-11c (Paar-Ausschluss, Art. 18(1)(b)/(d)) —
          // ohne ihn liefe JEDER gesperrte Anschlussnutzer in den Ausschluss und
          // verkuerzte die DE-02-Vollstaendigkeit unnoetig (ADR-0007 C4).
          einschraenkungGrundCode: an.einschraenkungGrundCode,
        });
        if (einschraenkungAn.regelCode !== null && einschraenkungAn.schwere !== null) {
          push({
            regelCode: einschraenkungAn.regelCode,
            schwere: einschraenkungAn.schwere,
            endkundeId: paar.endkundeId,
            energietraeger: paar.energietraeger,
            kennzahlKlasse: `anschlussnutzer:${an.anschlussnutzerId}${einschraenkungAn.grundFehlend ? ':grund_fehlt' : ''}`,
          });
        }
      }
      if (anschlussnutzerPruefung.ketteNichtAufloesbar) {
        push({
          regelCode: KETTE_NICHT_AUFLOESBAR_REGEL_CODE,
          schwere: 'blocker',
          endkundeId: paar.endkundeId,
          energietraeger: paar.energietraeger,
          kennzahlKlasse: 'anschlussnutzer_sperrstatus_nicht_aufloesbar',
        });
      }

      for (const scheibe of kontext.monatsmenge) {
        const monat = scheibe.monat;
        const kandidaten = await this.laufLookupRepository.findKandidatenFuerScheibe(
          paar.endkundeId,
          paar.energietraeger,
          scheibe,
        );
        const aufloesung = loeseBindungAuf(kandidaten);

        if (aufloesung.art === 'kein_kandidat') {
          push({ regelCode: 'FJ-02', schwere: 'blocker', endkundeId: paar.endkundeId, energietraeger: paar.energietraeger, monat });
          continue;
        }
        if (aufloesung.art === 'abweichend') {
          push({
            regelCode: 'FJ-05',
            schwere: 'blocker',
            endkundeId: paar.endkundeId,
            energietraeger: paar.energietraeger,
            monat,
            kennzahlKlasse: `kandidaten_${String(aufloesung.kandidatenAnzahl)}`,
          });
          continue;
        }

        if (aufloesung.mehrdeutigGleich) {
          push({
            regelCode: 'FJ-05',
            schwere: 'warnung',
            endkundeId: paar.endkundeId,
            energietraeger: paar.energietraeger,
            monat,
            kennzahlKlasse: `kandidaten_${String(aufloesung.kandidatenAnzahl)}`,
          });
        }

        const monatsKlassifikation = klassifiziereMonat(aufloesung.gewaehlt.qualitaetsStufe);
        if (monatsKlassifikation.befund !== undefined) {
          push({
            regelCode: monatsKlassifikation.befund.regelCode,
            schwere: monatsKlassifikation.befund.schwere,
            endkundeId: paar.endkundeId,
            energietraeger: paar.energietraeger,
            monat,
          });
        }
      }
    }

    // A11/C2 — s. Methoden-Dok: FJ-07c/FJ-11c/FJ-10 zaehlen NICHT in blocker_anzahl (alle drei paar- bzw. kategoriebezogen, s. `verfahren.const.ts`).
    const zaehleSchwere = (schwere: PreflightBefundSchwere): number =>
      befunde.filter(
        (b) => b.schwere === schwere && !(schwere === 'blocker' && (AUSGENOMMENE_FOERDERJAHR_BLOCKER_REGEL_CODES as readonly string[]).includes(b.regelCode)),
      ).length;
    const blockerAnzahl = zaehleSchwere('blocker');
    const warnungAnzahl = befunde.filter((b) => b.schwere === 'warnung').length;
    const hinweisAnzahl = befunde.filter((b) => b.schwere === 'hinweis').length;
    const ergebnis = blockerAnzahl === 0 ? 'gruen' : 'rot';

    const preflight = await this.preflightRepository.insertPreflight({
      id: randomUUID(),
      foerderjahrId: kontext.foerderjahrId,
      profilCode: kontext.profilCode,
      profilVersion: kontext.profilVersion,
      ergebnis,
      blockerAnzahl,
      warnungAnzahl,
      hinweisAnzahl,
      umfangPaareAnzahl: scopePaare.length,
      monateErwartet: kontext.monatsmenge.length,
      synthetic: kontext.synthetic,
      ausgefuehrtVonSub: kontext.ausgefuehrtVonSub,
    });
    await this.preflightRepository.insertBefunde(preflight.id, befunde);
    const befundeGespeichert = await this.preflightRepository.findBefunde(preflight.id, { limit: 1000 });

    return { preflight, befunde: befundeGespeichert.daten };
  }
}
