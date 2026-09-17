import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Propagation, Transactional } from '@nestjs-cls/transactional';
import {
  EnergyZaehlerStandortRepository,
  PG_EXCLUSION_VIOLATION,
} from '../persistence/energy/energy-zaehler-standort.repository';
import type { ZaehlerStandort } from '../persistence/energy/energy-zaehler-standort.repository';
import { EnergyStandortRepository } from '../persistence/energy/energy-standort.repository';
import { EnergyZaehlerRepository } from '../persistence/energy/energy-zaehler.repository';
import { hatPgErrorCode } from '../persistence/pg-error.util';
import { konflikt, nichtGefunden, ungueltigeEingabe } from '../common/problem.util';
import {
  mapZaehlerAktuellVerortet,
  mapZaehlerStandortDetail,
  mapZaehlerUnterKnotenItem,
  mapZaehlerUnverortet,
} from './standort.mapper';
import type { ZaehlerStandortAktuellDetail, ZaehlerStandortDetail, ZaehlerUnterKnotenItem } from './standort.types';
import type { ZaehlerVerortungAnlegenDto } from './dto/zaehler-verortung-anlegen.dto';
import type { ZaehlerVerortungBeendenDto } from './dto/zaehler-verortung-beenden.dto';

/**
 * ADR-0010 D3/D6 — temporale Zähler-Verortung (`energy.zaehler_standort`)
 * PLUS die Kern-Query (D6, "alle Zähler unter Knoten X zum Stichtag T").
 *
 * "Umsetzen" (kritischer Punkt des Arbeitsauftrags): das Anlegen einer NEUEN
 * Verortung SCHLIESST die offene Vorgänger-Verortung DERSELBEN Transaktion
 * — niemals ein stilles Überschreiben (das würde rückwirkende Auswertungen
 * lautlos verfälschen). Zwei Zeitscheiben entstehen: die alte
 * (`gueltig_bis` = neue `gueltig_von`) und die neue (`gueltig_bis IS NULL`).
 * Das `EXCLUDE`-Constraint (D-EXCL, `ex_zaehler_standort_no_overlap`) bleibt
 * der ATOMARE, unumgehbare Garant gegen Overlap — der Vorab-Check hier ist
 * reine UX (sprechender 409/400 statt eines rohen Constraint-Fehlers).
 */
@Injectable()
export class ZaehlerVerortungService {
  constructor(
    private readonly zaehlerStandortRepository: EnergyZaehlerStandortRepository,
    private readonly standortRepository: EnergyStandortRepository,
    private readonly zaehlerRepository: EnergyZaehlerRepository,
  ) {}

  async erstelleVerortung(zaehlerId: string, dto: ZaehlerVerortungAnlegenDto): Promise<ZaehlerStandortDetail> {
    const [zaehler, standort] = await Promise.all([
      this.zaehlerRepository.findById(zaehlerId),
      this.standortRepository.findById(dto.standortId),
    ]);
    if (zaehler === undefined) {
      throw nichtGefunden('Zaehler');
    }
    if (standort === undefined) {
      throw nichtGefunden('Standort');
    }

    const offeneVerortung = await this.zaehlerStandortRepository.findAktivByZaehlerId(zaehlerId);
    if (offeneVerortung !== undefined && Date.parse(dto.gueltigVon) <= Date.parse(offeneVerortung.gueltigVon)) {
      throw ungueltigeEingabe(
        'gueltigVon muss NACH dem Beginn der aktuell offenen Verortung liegen (sonst invertierte Zeitscheibe).',
      );
    }

    try {
      const zaehlerStandort = await this.erstelleVerortungInTx(zaehlerId, dto.standortId, dto.gueltigVon, offeneVerortung);
      return mapZaehlerStandortDetail(zaehlerStandort);
    } catch (error: unknown) {
      if (hatPgErrorCode(error, PG_EXCLUSION_VIOLATION)) {
        throw konflikt('Zeitlicher Overlap: es existiert bereits eine ueberlappende Verortung fuer diesen Zaehler (D-EXCL).');
      }
      throw error;
    }
  }

  @Transactional(Propagation.Nested)
  private async erstelleVerortungInTx(
    zaehlerId: string,
    standortId: string,
    gueltigVon: string,
    offeneVerortung: ZaehlerStandort | undefined,
  ): Promise<ZaehlerStandort> {
    if (offeneVerortung !== undefined) {
      await this.zaehlerStandortRepository.beenden(offeneVerortung.id, gueltigVon);
    }

    return this.zaehlerStandortRepository.insert({ id: randomUUID(), zaehlerId, standortId, gueltigVon });
  }

  /**
   * IDEMPOTENT bezüglich DESSELBEN Endzeitpunkts, analog
   * `NutzungsverhaeltnisService.beenden()`.
   */
  async beendenVerortung(zaehlerId: string, dto: ZaehlerVerortungBeendenDto): Promise<ZaehlerStandortDetail> {
    const offeneVerortung = await this.zaehlerStandortRepository.findAktivByZaehlerId(zaehlerId);
    if (offeneVerortung === undefined) {
      throw nichtGefunden('Offene Zaehler-Verortung');
    }

    const updated = await this.zaehlerStandortRepository.beenden(offeneVerortung.id, dto.gueltigBis);
    if (updated === undefined) {
      throw nichtGefunden('Offene Zaehler-Verortung');
    }
    return mapZaehlerStandortDetail(updated);
  }

  /**
   * `GET .../zaehler/{zaehlerId}/verortung` (UX-Konzept „Wo hängt dieser
   * Zähler?" — Backend-Lücke 1, die Umkehrrichtung zur Kern-Query D6):
   * liefert die AKTUELL offene Verortung (`gueltig_bis IS NULL`) eines
   * Zählers inklusive Breadcrumb-Pfad (materialisierter Pfad, D6, WURZEL
   * ZUERST) — VOLLSTÄNDIG PII-frei (D5, `read:standort`), NIEMALS Label/
   * Adresse. Nutzt AUSSCHLIESSLICH bereits vorhandene `energy.*`-Repository-
   * Methoden (`findAktivByZaehlerId`/`findById`/`findManyByIdsAndEndkunde`)
   * — kein neuer SQL-Pfad nötig, dieselbe strukturelle Trennung wie
   * `StandortBaumService` (kein `identity`-Zugriff).
   *
   * EMPTY-STATE (`verortet=false`, KEIN Fehler/404) in ZWEI Fällen, die
   * beide über dieselbe Abfrage abgedeckt werden: (a) der Zähler war noch
   * NIE verortet, (b) der Zähler hat AUSSCHLIESSLICH bereits beendete
   * (historische) Verortungen — `findAktivByZaehlerId` liefert in BEIDEN
   * Fällen `undefined` (die Methode filtert bereits auf
   * `gueltig_bis IS NULL`), eine historische Verortung wird also NIEMALS
   * fälschlich als "aktuell" ausgewiesen.
   */
  async aktuelleVerortung(zaehlerId: string): Promise<ZaehlerStandortAktuellDetail> {
    const zaehler = await this.zaehlerRepository.findById(zaehlerId);
    if (zaehler === undefined) {
      throw nichtGefunden('Zaehler');
    }

    const offeneVerortung = await this.zaehlerStandortRepository.findAktivByZaehlerId(zaehlerId);
    if (offeneVerortung === undefined) {
      return mapZaehlerUnverortet(zaehlerId);
    }

    const standort = await this.standortRepository.findById(offeneVerortung.standortId);
    if (standort === undefined) {
      // Strukturell ausgeschlossen (FK `energy.zaehler_standort.standort_id
      // REFERENCES energy.standort(id)` + D2.6 verbietet ein Hart-Löschen
      // von Standorten MIT Verortungshistorie) — reiner Fail-closed-Backstop.
      throw nichtGefunden('Standort');
    }

    // D6: `pfad` ist die Vorfahrenkette INKLUSIVE eigener `id`, bereits
    // WURZEL-ZUERST befüllt (Trigger-Konkatenation `Eltern-pfad || eigene
    // id`) — der Batch-Lookup selbst liefert KEINE garantierte Reihenfolge,
    // daher zusätzlich explizit nach `ebene` sortiert (Wurzel = ebene 0).
    const pfadKnoten = await this.standortRepository.findManyByIdsAndEndkunde(standort.pfad, standort.endkundeId);
    const pfadSortiert = [...pfadKnoten].sort((a, b) => a.ebene - b.ebene);

    return mapZaehlerAktuellVerortet({
      zaehlerId,
      standortId: standort.id,
      verortetSeit: offeneVerortung.gueltigVon,
      pfadKnoten: pfadSortiert,
    });
  }

  /**
   * Kern-Query (D6, ADR-0010 §5 `GET .../standorte/{id}/zaehler`) — Default
   * `stichtag=now()`, `inklusiveUnterknoten=true` (ADR wörtlich).
   */
  async zaehlerUnterKnoten(
    standortId: string,
    options: { readonly stichtag?: string; readonly inklusiveUnterknoten?: boolean },
  ): Promise<ZaehlerUnterKnotenItem[]> {
    const standort = await this.standortRepository.findById(standortId);
    if (standort === undefined) {
      throw nichtGefunden('Standort');
    }

    const zaehler = await this.standortRepository.findZaehlerUnterKnoten({
      knotenId: standortId,
      stichtag: options.stichtag ?? new Date().toISOString(),
      inklusiveUnterknoten: options.inklusiveUnterknoten ?? true,
    });

    return zaehler.map(mapZaehlerUnterKnotenItem);
  }
}
