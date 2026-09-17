import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Propagation, Transactional } from '@nestjs-cls/transactional';
import type { SecurityContext } from '../../common/security/security-context';
import { AuditService } from '../../audit/audit.service';
import { EnergySystemRepository } from '../persistence/energy/energy-system.repository';
import { EnergyEndkundeRepository } from '../persistence/energy/energy-endkunde.repository';
import { EnergyStandortRepository } from '../persistence/energy/energy-standort.repository';
import { EnergyZaehlerStandortRepository } from '../persistence/energy/energy-zaehler-standort.repository';
import { EinflussKatalogRepository } from '../persistence/einfluss/einfluss-katalog.repository';
import {
  EinflussIntervallRepository,
  PG_EXCLUSION_VIOLATION,
} from '../persistence/einfluss/einfluss-intervall.repository';
import type {
  BetroffenerTyp,
  EinflussIntervall,
  InsertEinflussIntervallInput,
  QuelleTyp,
  Rechtsgrundlage,
} from '../persistence/einfluss/einfluss-intervall.repository';
import { EinflussBefundRepository } from '../persistence/einfluss/einfluss-befund.repository';
import { hatPgErrorCode } from '../persistence/pg-error.util';
import { konflikt, nichtGefunden, ungueltigeEingabe } from '../common/problem.util';
import { STAMMDATEN_EVENT_CODES } from '../audit/stammdaten-audit-events';
import { ANLASS_CODE_KORREKTUR, NUTZUNGSZWECK_CODE_WERTE } from './einflussgroesse.constants';
import { mapEinflussgroesseBefundItem, mapEinflussgroesseDetail } from './einflussgroesse.mapper';
import type {
  EinflussgroesseBefundItem,
  EinflussgroesseDetail,
  EinflussgroesseKorrekturErgebnis,
} from './einflussgroesse.types';
import type { EinflussgroesseErfassenDto } from './dto/einflussgroesse-erfassen.dto';
import type { EinflussgroesseKorrigierenDto } from './dto/einflussgroesse-korrigieren.dto';

/** Gemeinsame Eingabe-Form für `validiereWerte()` — Ober-Schnittmenge von Erfassen- UND Korrektur-DTO (`groesseCode` ist bei einer Korrektur IMMER das geerbte, s. `korrigieren()`). */
interface WerteEingabe {
  readonly groesseCode: string;
  readonly wertNum?: number;
  readonly wertCode?: string;
  readonly gueltigAbMonat: string;
  readonly gueltigBisMonat?: string;
  readonly betroffenerTyp: BetroffenerTyp;
  readonly quelleTyp: QuelleTyp;
  readonly rechtsgrundlage: Rechtsgrundlage;
  readonly abwaegungRef?: string;
  readonly art14InformationAt?: string;
  readonly standortId?: string;
}

interface KorrigierenTxErgebnis {
  readonly geschlossen: EinflussIntervall;
  readonly neu: EinflussIntervall | undefined;
}

/**
 * ADR-0006 Teil B (B8/B10) — Fach-Service für die Einflussgrößen-CRUD-Familie
 * (`create:/read:/update:einflussgroesse`). Controller dünn
 * (`.claude/rules/backend-nestjs.md`).
 *
 * v1-Scope-Grenze (s. finale Antwort dieses Arbeitspakets): NUR Einflussgrößen-
 * CRUD + Befund-LESEN. Die Schwellwert-**Erkennung** (schreibt `einfluss.befund`
 * + emittiert `einflussgroesse.schwellwert.ueberschritten`) ist NICHT Teil
 * dieses Pakets — `tb03_schwellwert` ist im Katalog noch überall `NULL`
 * (TB-03-Fachvorgabe fehlt, `migrations/V0020`-Kopf D-KATALOG-SEED).
 *
 * PII-Härte (A5/B10, ZENTRALE Auflage dieses Pakets): `wertNum`/`wertCode`
 * erscheinen NIE in einer `ungueltigeEingabe()`/`konflikt()`-Fehlermeldung
 * (nur FELDNAMEN, niemals der Wert selbst) und NIE in einem Audit-Kontext
 * (`baseKontext()` unten liest AUSSCHLIESSLICH die V0021-Whitelist-Felder).
 */
@Injectable()
export class EinflussgroesseService {
  constructor(
    private readonly systemRepository: EnergySystemRepository,
    private readonly endkundeRepository: EnergyEndkundeRepository,
    private readonly standortRepository: EnergyStandortRepository,
    private readonly zaehlerStandortRepository: EnergyZaehlerStandortRepository,
    private readonly katalogRepository: EinflussKatalogRepository,
    private readonly intervallRepository: EinflussIntervallRepository,
    private readonly befundRepository: EinflussBefundRepository,
    private readonly auditService: AuditService,
  ) {}

  /**
   * `create:einflussgroesse` (`POST .../systeme/{systemId}/einflussgroessen`).
   * `endkundeId` wird AUSSCHLIESSLICH aus dem System abgeleitet (RL-B1) — das
   * DTO trägt bewusst KEIN `endkundeId`-Feld. Audit `.erfasst` läuft über
   * `@AuditAction` auf dem Controller (EIN Event je Aufruf, kein manueller
   * Emit nötig — anders als `korrigieren()`, s. dort).
   */
  async erfassen(systemId: string, dto: EinflussgroesseErfassenDto): Promise<EinflussgroesseDetail> {
    const system = await this.systemRepository.findById(systemId);
    if (system === undefined) {
      throw nichtGefunden('System');
    }
    const endkundeId = system.endkundeId;

    await this.validiereWerte(endkundeId, dto);

    const offenerVorgaenger = await this.intervallRepository.findOffenBySystemUndGroesse(systemId, dto.groesseCode);
    if (offenerVorgaenger !== undefined && Date.parse(dto.gueltigAbMonat) <= Date.parse(offenerVorgaenger.gueltigAbMonat)) {
      throw ungueltigeEingabe(
        'gueltigAbMonat muss NACH dem Beginn des aktuell offenen Intervalls derselben Groesse liegen (sonst invertierte Zeitscheibe).',
      );
    }

    const neuInput: InsertEinflussIntervallInput = {
      id: randomUUID(),
      endkundeId,
      systemId,
      standortId: dto.standortId ?? null,
      groesseCode: dto.groesseCode,
      wertNum: dto.wertNum ?? null,
      wertCode: dto.wertCode ?? null,
      gueltigAbMonat: dto.gueltigAbMonat,
      gueltigBisMonat: dto.gueltigBisMonat ?? null,
      betroffenerTyp: dto.betroffenerTyp,
      quelleTyp: dto.quelleTyp,
      rechtsgrundlage: dto.rechtsgrundlage,
      abwaegungRef: dto.abwaegungRef ?? null,
      art14InformationAt: dto.art14InformationAt ?? null,
      anlassCode: dto.anlassCode ?? null,
    };

    try {
      const intervall = await this.erfassenInTx(offenerVorgaenger, neuInput);
      return mapEinflussgroesseDetail(intervall);
    } catch (error: unknown) {
      if (hatPgErrorCode(error, PG_EXCLUSION_VIOLATION)) {
        throw konflikt(
          'Zeitlicher Overlap: es existiert bereits ein ueberlappendes Intervall fuer dieses System/diese Groesse (EXCLUDE-Constraint).',
        );
      }
      throw error;
    }
  }

  @Transactional(Propagation.Nested)
  private async erfassenInTx(
    offenerVorgaenger: EinflussIntervall | undefined,
    neu: InsertEinflussIntervallInput,
  ): Promise<EinflussIntervall> {
    if (offenerVorgaenger !== undefined) {
      await this.intervallRepository.schliessen(offenerVorgaenger.id, neu.gueltigAbMonat);
    }
    return this.intervallRepository.insert(neu);
  }

  /**
   * `update:einflussgroesse` (`PATCH .../einflussgroessen/{id}`). Schliesst
   * IMMER das adressierte Intervall (`gueltigBisMonat`, V0020 D-UPDATE-SCOPE
   * — die EINZIGE erlaubte UPDATE-Spalte) UND legt — sofern `dto.korrektur`
   * gesetzt ist — in DERSELBEN Transaktion eine NEUE Zeile an (append-only,
   * "Wert NIE überschreiben"). Emittiert MANUELL (KEIN `@AuditAction` auf der
   * Route, analog `BerechnungslaufService`/`ShredAntragService` — bis zu
   * ZWEI Event-TYPEN je Aufruf): IMMER `.geaendert` (das Schliessen), UND
   * — nur wenn eine Korrektur-Zeile entstand — ZUSÄTZLICH `.erfasst` für die
   * NEUE Zeile (V0021 wörtlich: "eine fachliche Korrektur legt zusätzlich
   * eine NEUE Zeile an, die dann Code (9) [.erfasst] emittiert").
   */
  async korrigieren(
    einflussgroesseId: string,
    dto: EinflussgroesseKorrigierenDto,
    subject: SecurityContext,
    synthetic: boolean,
  ): Promise<EinflussgroesseKorrekturErgebnis> {
    const original = await this.intervallRepository.findById(einflussgroesseId);
    if (original === undefined) {
      throw nichtGefunden('Einflussgroesse');
    }
    if (original.gueltigBisMonat !== null) {
      throw konflikt('Intervall ist bereits geschlossen — eine erneute Schliessung ueber diese Route ist nicht vorgesehen.');
    }
    if (Date.parse(dto.gueltigBisMonat) <= Date.parse(original.gueltigAbMonat)) {
      throw ungueltigeEingabe('gueltigBisMonat muss NACH gueltigAbMonat des Intervalls liegen (V0020-CHECK gespiegelt).');
    }

    let neuInput: InsertEinflussIntervallInput | undefined;
    if (dto.korrektur !== undefined) {
      const korrektur = dto.korrektur;
      await this.validiereWerte(original.endkundeId, {
        groesseCode: original.groesseCode,
        ...(korrektur.wertNum !== undefined ? { wertNum: korrektur.wertNum } : {}),
        ...(korrektur.wertCode !== undefined ? { wertCode: korrektur.wertCode } : {}),
        gueltigAbMonat: korrektur.gueltigAbMonat,
        ...(korrektur.gueltigBisMonat !== undefined ? { gueltigBisMonat: korrektur.gueltigBisMonat } : {}),
        betroffenerTyp: korrektur.betroffenerTyp,
        quelleTyp: korrektur.quelleTyp,
        rechtsgrundlage: korrektur.rechtsgrundlage,
        ...(korrektur.abwaegungRef !== undefined ? { abwaegungRef: korrektur.abwaegungRef } : {}),
        ...(korrektur.art14InformationAt !== undefined ? { art14InformationAt: korrektur.art14InformationAt } : {}),
        ...(korrektur.standortId !== undefined ? { standortId: korrektur.standortId } : {}),
      });

      neuInput = {
        id: randomUUID(),
        endkundeId: original.endkundeId,
        systemId: original.systemId,
        standortId: korrektur.standortId ?? null,
        groesseCode: original.groesseCode,
        wertNum: korrektur.wertNum ?? null,
        wertCode: korrektur.wertCode ?? null,
        gueltigAbMonat: korrektur.gueltigAbMonat,
        gueltigBisMonat: korrektur.gueltigBisMonat ?? null,
        betroffenerTyp: korrektur.betroffenerTyp,
        quelleTyp: korrektur.quelleTyp,
        rechtsgrundlage: korrektur.rechtsgrundlage,
        abwaegungRef: korrektur.abwaegungRef ?? null,
        art14InformationAt: korrektur.art14InformationAt ?? null,
        anlassCode: ANLASS_CODE_KORREKTUR,
      };
    }

    let ergebnis: KorrigierenTxErgebnis;
    try {
      ergebnis = await this.korrigierenInTx(einflussgroesseId, dto.gueltigBisMonat, neuInput);
    } catch (error: unknown) {
      if (hatPgErrorCode(error, PG_EXCLUSION_VIOLATION)) {
        throw konflikt('Zeitlicher Overlap: die Korrektur-Zeile ueberlappt ein bestehendes Intervall (EXCLUDE-Constraint).');
      }
      throw error;
    }

    await this.auditService.append({
      eventTyp: STAMMDATEN_EVENT_CODES.EINFLUSSGROESSE_GEAENDERT,
      actorTyp: subject.actorTyp,
      actorSub: subject.sub,
      ergebnis: 'ok',
      objektRef: ergebnis.geschlossen.id,
      kontext: this.baseKontext(ergebnis.geschlossen, synthetic),
    });

    if (ergebnis.neu !== undefined) {
      await this.auditService.append({
        eventTyp: STAMMDATEN_EVENT_CODES.EINFLUSSGROESSE_ERFASST,
        actorTyp: subject.actorTyp,
        actorSub: subject.sub,
        ergebnis: 'ok',
        objektRef: ergebnis.neu.id,
        kontext: this.baseKontext(ergebnis.neu, synthetic),
      });
    }

    return {
      geschlossen: mapEinflussgroesseDetail(ergebnis.geschlossen),
      neu: ergebnis.neu !== undefined ? mapEinflussgroesseDetail(ergebnis.neu) : null,
    };
  }

  @Transactional(Propagation.Nested)
  private async korrigierenInTx(
    id: string,
    gueltigBisMonat: string,
    neuInput: InsertEinflussIntervallInput | undefined,
  ): Promise<KorrigierenTxErgebnis> {
    const geschlossen = await this.intervallRepository.schliessen(id, gueltigBisMonat);
    if (geschlossen === undefined) {
      // Race-Backstop (analog `ZaehlerStandortRepository.beenden()`s
      // WHERE-Guard) — der Service hat VOR dem Tx-Start bereits geprueft,
      // dass das Intervall offen ist; ein nebenlaeufiger zweiter Aufruf
      // koennte das Fenster theoretisch schliessen.
      throw konflikt('Intervall wurde nebenlaeufig bereits geschlossen (Race, Backstop).');
    }

    const neu = neuInput !== undefined ? await this.intervallRepository.insert(neuInput) : undefined;
    return { geschlossen, neu };
  }

  /**
   * `read:einflussgroesse` (`GET .../systeme/{systemId}/einflussgroessen`) —
   * Klartext-Intervalle (D5-analoge PII-Lesestufe). Audit `.einsicht` läuft
   * über `@AuditAction` auf dem Controller (`rolle_erfassen=true`).
   */
  async listeFuerSystem(systemId: string): Promise<EinflussgroesseDetail[]> {
    const system = await this.systemRepository.findById(systemId);
    if (system === undefined) {
      throw nichtGefunden('System');
    }

    const intervalle = await this.intervallRepository.listBySystem(systemId);
    return intervalle.map(mapEinflussgroesseDetail);
  }

  /**
   * `read:einflussgroesse` (`GET .../endkunden/{endkundeId}/einflussgroessen/befunde`) —
   * v1 NUR LESEND (Scope-Grenze, s. Klassen-Dok). Löst `endkundeId -> system_id[]`
   * über `EnergySystemRepository.listIdsByEndkunde()` auf STATT eines
   * Cross-Schema-JOINs (`EinflussBefundRepository`-Klassen-Dok).
   */
  async befundeFuerEndkunde(endkundeId: string): Promise<EinflussgroesseBefundItem[]> {
    const endkunde = await this.endkundeRepository.findById(endkundeId);
    if (endkunde === undefined) {
      throw nichtGefunden('Endkunde');
    }

    const systemIds = await this.systemRepository.listIdsByEndkunde(endkundeId);
    const befunde = await this.befundRepository.findBySystemIds(systemIds);
    return befunde.map(mapEinflussgroesseBefundItem);
  }

  /**
   * Spiegelt die V0020-CHECKs im Code (`.claude/rules/backend-nestjs.md`) —
   * NICHT nur auf den DB-Fehler verlassen. Reihenfolge: (1) Katalog-Code
   * existiert+aktiv, (2) `wert_art`-Konsistenz (numerisch XOR codiert,
   * fachlich STRENGER als die DB-CHECK "mindestens einer"), (3) B12.5-
   * Werteliste bei `groesseCode='nutzungszweck'`, (4) Art.-14-Regel bei
   * `betroffenerTyp='anschlussnutzer'`, (5) `gueltigBisMonat > gueltigAbMonat`,
   * (6) RL-B1 (nur wenn `standortId` gesetzt).
   */
  private async validiereWerte(endkundeId: string, eingabe: WerteEingabe): Promise<void> {
    const katalog = await this.katalogRepository.findByCode(eingabe.groesseCode);
    if (katalog === undefined || !katalog.aktiv) {
      throw ungueltigeEingabe(`Unbekannter oder inaktiver Einflussgroessen-Code '${eingabe.groesseCode}'.`);
    }

    if (katalog.wertArt === 'numerisch') {
      if (eingabe.wertNum === undefined || eingabe.wertCode !== undefined) {
        throw ungueltigeEingabe(
          `groesseCode '${eingabe.groesseCode}' ist numerisch — wertNum ist Pflicht, wertCode ist unzulaessig.`,
        );
      }
    } else {
      if (eingabe.wertCode === undefined || eingabe.wertNum !== undefined) {
        throw ungueltigeEingabe(
          `groesseCode '${eingabe.groesseCode}' ist codiert — wertCode ist Pflicht, wertNum ist unzulaessig.`,
        );
      }
      if (
        eingabe.groesseCode === 'nutzungszweck' &&
        !(NUTZUNGSZWECK_CODE_WERTE as readonly string[]).includes(eingabe.wertCode)
      ) {
        throw ungueltigeEingabe(
          "wertCode fuer groesseCode 'nutzungszweck' muss aus der geschlossenen Liste stammen (B12.5, V0020-CHECK gespiegelt).",
        );
      }
    }

    if (eingabe.betroffenerTyp === 'anschlussnutzer') {
      if (
        eingabe.rechtsgrundlage !== 'art6_1f' ||
        eingabe.abwaegungRef === undefined ||
        eingabe.art14InformationAt === undefined
      ) {
        throw ungueltigeEingabe(
          'Bei betroffenerTyp=anschlussnutzer sind rechtsgrundlage=art6_1f, abwaegungRef und art14InformationAt zwingend (Art. 14 DSGVO, V0020-CHECK gespiegelt).',
        );
      }
    }

    if (eingabe.gueltigBisMonat !== undefined && Date.parse(eingabe.gueltigBisMonat) <= Date.parse(eingabe.gueltigAbMonat)) {
      throw ungueltigeEingabe('gueltigBisMonat muss NACH gueltigAbMonat liegen (V0020-CHECK gespiegelt).');
    }

    if (eingabe.standortId !== undefined) {
      await this.pruefeRlB1(endkundeId, eingabe.standortId, eingabe.gueltigAbMonat, eingabe.gueltigBisMonat ?? null);
    }
  }

  /**
   * RL-B1 (Arbeitsauftrag, ADR-0010 D3): "an/unter diesem Knoten besteht im
   * Intervall eine aktive Zaehler-Verortung" — sonst 400. Prueft ZUSAETZLICH
   * die Mandantentreue (`standort.endkundeId === endkundeId`, analog
   * `StandortService.verschieben()` D2.1).
   */
  private async pruefeRlB1(endkundeId: string, standortId: string, von: string, bis: string | null): Promise<void> {
    const standort = await this.standortRepository.findById(standortId);
    if (standort === undefined) {
      throw nichtGefunden('Standort');
    }
    if (standort.endkundeId !== endkundeId) {
      throw ungueltigeEingabe('standortId gehoert nicht zum selben Endkunden wie das System (Mandantentreue, RL-B1).');
    }

    const hatVerortung = await this.zaehlerStandortRepository.hatVerortungImTeilbaumUndZeitraum(standortId, von, bis);
    if (!hatVerortung) {
      throw ungueltigeEingabe(
        'An/unter diesem Standort besteht im angegebenen Zeitraum keine Zaehler-Verortung (RL-B1, ADR-0010 D3).',
      );
    }
  }

  /** `kontext`-Grundgerüst — V0021-Whitelist, s. `stammdaten-audit-events.ts`-Kommentar. AUSDRUECKLICH KEIN wert_num/wert_code/anlass_code. */
  private baseKontext(intervall: EinflussIntervall, synthetic: boolean): Record<string, string | number | boolean> {
    return {
      synthetic,
      einflussgroesse_id: intervall.id,
      endkunde_id: intervall.endkundeId,
      system_id: intervall.systemId,
      groesse_code: intervall.groesseCode,
      gueltig_ab_monat: intervall.gueltigAbMonat,
      ...(intervall.gueltigBisMonat !== null ? { gueltig_bis_monat: intervall.gueltigBisMonat } : {}),
      betroffener_typ: intervall.betroffenerTyp,
      quelle_typ: intervall.quelleTyp,
      rechtsgrundlage: intervall.rechtsgrundlage,
    };
  }
}
