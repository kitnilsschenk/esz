import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { Propagation, Transactional } from '@nestjs-cls/transactional';
import type { SecurityContext } from '../common/security/security-context';
import { nichtGefunden } from '../stammdaten/common/problem.util';
import { AuditService } from '../audit/audit.service';
import { NACHWEIS_EVENT_CODES, NACHWEIS_FEHLER_CODES } from './audit/nachweis-audit-events';
import type { NachweisFehlerCode } from './audit/nachweis-audit-events';
import { NachweisFehlerException } from './nachweis-fehler.exception';
import { EnergyEndkundeRepository } from '../stammdaten/persistence/energy/energy-endkunde.repository';
import type { Endkunde } from '../stammdaten/persistence/energy/energy-endkunde.repository';
import { AnalyticsVerfahrenRepository } from '../berechnung/persistence/analytics-verfahren.repository';
import { AnalyticsLaufLookupRepository } from './persistence/analytics-lauf-lookup.repository';
import type { ScopePaar } from './persistence/analytics-lauf-lookup.repository';
import { NachweisFoerderjahrRepository } from './persistence/nachweis-foerderjahr.repository';
import type { Foerderjahr } from './persistence/nachweis-foerderjahr.repository';
import { NachweisPreflightRepository } from './persistence/nachweis-preflight.repository';
import { NachweisEinsparlaufRepository } from './persistence/nachweis-einsparlauf.repository';
import type {
  Einsparlauf,
  EinsparlaufErgebnis,
  EinsparlaufListItem,
  InsertBindungInput,
  InsertErgebnisInput,
} from './persistence/nachweis-einsparlauf.repository';
import { klassifiziereAnschlussnutzerEinschraenkung, klassifiziereEndkundeEinschraenkung } from './domain/paar-einschraenkung';
import { klassifiziereMonat } from './domain/monats-behandlung';
import { loeseBindungAuf } from './domain/bindung-resolver';
import type { BindungsKandidat } from './domain/bindung-resolver';
import { einsparungJahr } from './domain/einsparung';
import type { AusweisbarerMonat, JahresStatus, MonatsQualitaetsStufe } from './domain/einsparung';
import { SubstitutionErkennungService } from './substitution-erkennung';
import { naechsterMonat, scheibenDesFoerderjahres } from './zeit.util';
import type { Monatsscheibe } from './zeit.util';
import { ABDECKUNGSFLOOR_PCT_DEFAULT, EINSPARAGGREGATION_VERFAHREN_CODE, LUECKENREGEL, RUNDUNG_NACHKOMMASTELLEN, VORZEICHENREGEL } from './verfahren.const';
import { sha256Canonical } from '../berechnung/hash.util';
import { mapEinsparlaufAntwort } from './einsparlauf.types';
import type { EinsparlaufAntwort } from './einsparlauf.types';
import type { EinsparlaufAnlegenDto } from './dto/einsparlauf-anlegen.dto';
import { toSeite } from '../stammdaten/common/seite.dto';
import type { Seite } from '../stammdaten/common/seite.dto';

const QUALITAET_RANG: Record<MonatsQualitaetsStufe, number> = { belastbar: 2, eingeschraenkt: 1, nicht_ausweisbar: 0 };

function istAusweisbareQualitaet(q: MonatsQualitaetsStufe): q is 'belastbar' | 'eingeschraenkt' {
  return q !== 'nicht_ausweisbar';
}

interface PaarEinfuegeErgebnis {
  readonly bindungen: readonly InsertBindungInput[];
  readonly hashZeilen: readonly string[];
  readonly ergebnis: InsertErgebnisInput;
  readonly gebundeneLaeufeIds: readonly string[];
  /** Je Monat aus `monatsmenge`: `true`, wenn DIESES Paar für diesen Monat eine Bindung aufloesen konnte (fuer `monate_gebunden`-Header, s. Service-Dok). */
  readonly monatAufgeloest: ReadonlySet<string>;
}

/**
 * `POST /nachweis/einsparlaeufe` (`create:einsparlauf`, ADR-0007 D1/B1/B2/B13)
 * — Orchestrierung des Rechenkerns (`domain/einsparung.ts`) + der D2-
 * Bindungsauswahl (`domain/bindung-resolver.ts`) gegen die reale DB.
 * Vorbedingung (D4, fail-closed): `art=foerderjahr_nachweis` verlangt einen
 * GRÜNEN Preflight — `art=zwischenstand` darf auf einem roten aufsetzen
 * (D4 wörtlich).
 */
@Injectable()
export class EinsparlaufService {
  constructor(
    private readonly foerderjahrRepository: NachweisFoerderjahrRepository,
    private readonly preflightRepository: NachweisPreflightRepository,
    private readonly verfahrenRepository: AnalyticsVerfahrenRepository,
    private readonly laufLookupRepository: AnalyticsLaufLookupRepository,
    private readonly endkundeRepository: EnergyEndkundeRepository,
    private readonly einsparlaufRepository: NachweisEinsparlaufRepository,
    private readonly auditService: AuditService,
    private readonly substitutionErkennungService: SubstitutionErkennungService,
  ) {}

  /**
   * Verbindliche Reihenfolge (Muster `BerechnungslaufService.starten()`):
   *   1. Rein LESENDE Validierung (Förderjahr, Preflight, grüner-Preflight-
   *      Vorbedingung, `ersetztEinsparlaufId`, Verfahrenskatalog) — NOCH KEIN
   *      Schreibzugriff.
   *   2. `einsparlauf.nachweis.angefordert` — DER ERSTE Schreibzugriff.
   *   3. Rechenkern + Persistenz in EINER `@Transactional(Propagation.
   *      Nested)`-Klammer (Savepoint) — schlägt sie fehl, rollt NUR dieser
   *      Savepoint zurück, während `.angefordert` in der äußeren Request-Tx
   *      erhalten bleibt.
   *   4. Erfolg: `.abgeschlossen` (+ `.ersetzt`, falls `ersetztEinsparlaufId`
   *      gesetzt) — Misserfolg: `.fehlgeschlagen`, dann Rethrow.
   */
  async starten(dto: EinsparlaufAnlegenDto, subject: SecurityContext, synthetic: boolean): Promise<EinsparlaufAntwort> {
    const foerderjahr = await this.foerderjahrRepository.findById(dto.foerderjahrId);
    if (foerderjahr === undefined) {
      throw nichtGefunden('Foerderjahr');
    }
    const preflight = await this.preflightRepository.findById(dto.preflightId);
    if (preflight === undefined) {
      throw nichtGefunden('Preflight');
    }
    if (preflight.foerderjahrId !== dto.foerderjahrId) {
      throw new NachweisFehlerException(
        NACHWEIS_FEHLER_CODES.PREFLIGHT_FOERDERJAHR_ABWEICHUNG,
        HttpStatus.BAD_REQUEST,
        'preflightId gehoert zu einem ANDEREN Foerderjahr als foerderjahrId.',
      );
    }
    // D4, FAIL-CLOSED: NUR art=foerderjahr_nachweis verlangt einen gruenen
    // Preflight (art=zwischenstand darf auf einem roten aufsetzen, D4
    // woertlich) — OHNE gruenen Preflight KEIN foerderjahr_nachweis-Lauf.
    if (dto.art === 'foerderjahr_nachweis' && preflight.ergebnis !== 'gruen') {
      throw new NachweisFehlerException(
        NACHWEIS_FEHLER_CODES.PREFLIGHT_NICHT_GRUEN,
        HttpStatus.CONFLICT,
        `Preflight ${preflight.id} hat ergebnis='${preflight.ergebnis}' — art=foerderjahr_nachweis verlangt einen gruenen Preflight (D4).`,
      );
    }

    if (dto.ersetztEinsparlaufId !== undefined) {
      const ersetzt = await this.einsparlaufRepository.findById(dto.ersetztEinsparlaufId);
      if (ersetzt === undefined || ersetzt.foerderjahrId !== dto.foerderjahrId) {
        throw new NachweisFehlerException(
          NACHWEIS_FEHLER_CODES.ERSETZTER_LAUF_UNGUELTIG,
          HttpStatus.BAD_REQUEST,
          'ersetztEinsparlaufId verweist auf keinen existierenden Lauf desselben Foerderjahres.',
        );
      }
    }

    const verfahren = await this.verfahrenRepository.findAktiveVersion(EINSPARAGGREGATION_VERFAHREN_CODE);
    if (verfahren === undefined) {
      throw new Error(`Kein aktives Verfahren '${EINSPARAGGREGATION_VERFAHREN_CODE}' im Katalog (analytics.verfahren_version).`);
    }

    // Zeitscheiben statt Monatserster (V0070) — s. `scheibenDesFoerderjahres`.
    const monatsmenge = scheibenDesFoerderjahres(foerderjahr.vonTag, foerderjahr.bisTag);

    const baseKontext = {
      synthetic,
      foerderjahr_code: foerderjahr.code,
      art: dto.art,
      verfahren_code: verfahren.code,
      verfahren_version: verfahren.version,
      preflight_id: preflight.id,
      monate_erwartet: monatsmenge.length,
    };

    // --- 2. ERSTER Schreibzugriff ---
    await this.auditService.append({
      eventTyp: NACHWEIS_EVENT_CODES.EINSPARLAUF_ANGEFORDERT,
      actorTyp: subject.actorTyp,
      actorSub: subject.sub,
      ergebnis: 'ok',
      kontext: baseKontext,
    });

    // --- 3. Rechenkern + Persistenz (Savepoint) ---
    let ergebnis: { readonly lauf: Einsparlauf; readonly ergebnisse: readonly EinsparlaufErgebnis[] };
    try {
      ergebnis = await this.berechneUndSpeichernInTx({
        foerderjahr,
        preflightId: preflight.id,
        verfahren,
        monatsmenge,
        dto,
        synthetic,
        erstelltVonSub: subject.sub,
      });
    } catch (error: unknown) {
      const fehlerCode = this.klassifiziereFehler(error);
      await this.auditService.append({
        eventTyp: NACHWEIS_EVENT_CODES.EINSPARLAUF_FEHLGESCHLAGEN,
        actorTyp: subject.actorTyp,
        actorSub: subject.sub,
        ergebnis: 'error',
        kontext: { ...baseKontext, fehler_code: fehlerCode },
      });
      throw error;
    }

    // --- 4. Erfolg ---
    await this.auditService.append({
      eventTyp: NACHWEIS_EVENT_CODES.EINSPARLAUF_ABGESCHLOSSEN,
      actorTyp: subject.actorTyp,
      actorSub: subject.sub,
      ergebnis: 'ok',
      objektRef: ergebnis.lauf.id,
      kontext: {
        ...baseKontext,
        einsparlauf_id: ergebnis.lauf.id,
        umfang_paare_anzahl: ergebnis.lauf.umfangPaareAnzahl,
        gebundene_laeufe_anzahl: ergebnis.lauf.gebundeneLaeufeAnzahl,
        monate_gebunden: ergebnis.lauf.monateGebunden,
        qualitaets_stufe_min: ergebnis.lauf.qualitaetsStufeMin,
      },
    });
    if (dto.ersetztEinsparlaufId !== undefined) {
      await this.auditService.append({
        eventTyp: NACHWEIS_EVENT_CODES.EINSPARLAUF_ERSETZT,
        actorTyp: subject.actorTyp,
        actorSub: subject.sub,
        ergebnis: 'ok',
        objektRef: ergebnis.lauf.id,
        kontext: { ...baseKontext, einsparlauf_id: ergebnis.lauf.id, ersetzt_einsparlauf_id: dto.ersetztEinsparlaufId },
      });
    }

    return mapEinsparlaufAntwort(ergebnis.lauf, ergebnis.ergebnisse);
  }

  async finden(id: string): Promise<EinsparlaufAntwort> {
    const lauf = await this.einsparlaufRepository.findById(id);
    if (lauf === undefined) {
      throw nichtGefunden('Einsparlauf');
    }
    return mapEinsparlaufAntwort(lauf, await this.alleErgebnisse(id));
  }

  async liste(optionen: {
    readonly foerderjahrId?: string;
    readonly art?: EinsparlaufAnlegenDto['art'];
    readonly nurAktuelle?: boolean;
    readonly cursor?: string;
    readonly limit: number;
  }): Promise<Seite<EinsparlaufListItem>> {
    const result = await this.einsparlaufRepository.listPage(optionen);
    return toSeite(result.daten, result.naechsterCursor, optionen.limit);
  }

  async ergebnisse(
    einsparlaufId: string,
    optionen: { readonly cursorEndkundeId?: string; readonly cursorEnergietraeger?: string; readonly limit: number },
  ): Promise<Seite<Awaited<ReturnType<NachweisEinsparlaufRepository['findErgebnisseByLaufId']>>['daten'][number]>> {
    await this.finden(einsparlaufId);
    const cursorPaar =
      optionen.cursorEndkundeId !== undefined && optionen.cursorEnergietraeger !== undefined
        ? { endkundeId: optionen.cursorEndkundeId, energietraeger: optionen.cursorEnergietraeger }
        : undefined;
    const result = await this.einsparlaufRepository.findErgebnisseByLaufId(einsparlaufId, { ...(cursorPaar !== undefined ? { cursorPaar } : {}), limit: optionen.limit });
    const naechsterCursor = result.naechsterCursor === null ? null : `${result.naechsterCursor.endkundeId}:${result.naechsterCursor.energietraeger}`;
    return toSeite(result.daten, naechsterCursor, optionen.limit);
  }

  async bindungen(
    einsparlaufId: string,
    optionen: { readonly cursorEndkundeId?: string; readonly cursorEnergietraeger?: string; readonly cursorMonat?: string; readonly limit: number },
  ): Promise<Seite<Awaited<ReturnType<NachweisEinsparlaufRepository['findBindungenByLaufId']>>['daten'][number]>> {
    await this.finden(einsparlaufId);
    const cursorPaar =
      optionen.cursorEndkundeId !== undefined && optionen.cursorEnergietraeger !== undefined && optionen.cursorMonat !== undefined
        ? { endkundeId: optionen.cursorEndkundeId, energietraeger: optionen.cursorEnergietraeger, monat: optionen.cursorMonat }
        : undefined;
    const result = await this.einsparlaufRepository.findBindungenByLaufId(einsparlaufId, { ...(cursorPaar !== undefined ? { cursorPaar } : {}), limit: optionen.limit });
    const naechsterCursor = result.naechsterCursor === null ? null : `${result.naechsterCursor.endkundeId}:${result.naechsterCursor.energietraeger}:${result.naechsterCursor.monat}`;
    return toSeite(result.daten, naechsterCursor, optionen.limit);
  }

  private async alleErgebnisse(einsparlaufId: string): Promise<Awaited<ReturnType<NachweisEinsparlaufRepository['findErgebnisseByLaufId']>>['daten']> {
    // v1-Umfang (10^3-10^4 Paare, B9) — EINE Seite genügt für die
    // Antwort-Zusammensetzung nach dem Schreiben; Cursor-Pagination bleibt
    // die Regel für die dedizierte `/ergebnisse`-Route.
    const result = await this.einsparlaufRepository.findErgebnisseByLaufId(einsparlaufId, { limit: 10_000 });
    return result.daten;
  }

  /**
   * ALLES in einer Tx (Arbeitsauftrag Punkt 3, wörtlich: „EINE Transaktion").
   */
  @Transactional(Propagation.Nested)
  private async berechneUndSpeichernInTx(kontext: {
    readonly foerderjahr: Foerderjahr;
    readonly preflightId: string;
    readonly verfahren: { readonly code: string; readonly version: number };
    readonly monatsmenge: readonly Monatsscheibe[];
    readonly dto: EinsparlaufAnlegenDto;
    readonly synthetic: boolean;
    readonly erstelltVonSub: string;
  }): Promise<{ readonly lauf: Einsparlauf; readonly ergebnisse: readonly EinsparlaufErgebnis[] }> {
    const { foerderjahr, monatsmenge } = kontext;
    const bisMonatExklusiv = naechsterMonat(foerderjahr.bisMonat);
    const scopePaare = await this.laufLookupRepository.findScopePaare(foerderjahr.vonMonat, bisMonatExklusiv);

    const endkundeCache = new Map<string, Endkunde | undefined>();
    const getEndkunde = async (endkundeId: string): Promise<Endkunde | undefined> => {
      if (!endkundeCache.has(endkundeId)) {
        endkundeCache.set(endkundeId, await this.endkundeRepository.findById(endkundeId));
      }
      return endkundeCache.get(endkundeId);
    };

    const alleBindungen: InsertBindungInput[] = [];
    const alleHashZeilen: string[] = [];
    const alleErgebnisse: InsertErgebnisInput[] = [];
    const gebundeneLaeufeIds = new Set<string>();
    const monatAufgeloestJeMonat = new Map<string, number>(); // monat -> Anzahl Paare, die diesen Monat aufloesen konnten
    let schlechtesteBindungQualitaet: MonatsQualitaetsStufe = 'belastbar';

    for (const paar of scopePaare) {
      const endkunde = await getEndkunde(paar.endkundeId);
      if (endkunde === undefined) {
        // FK-Inkonsistenz — sollte strukturell nie eintreten (energy.endkunde ist FK-Ziel von analytics.berechnungslauf.endkunde_id).
        throw new Error(`Endkunde ${paar.endkundeId} nicht auffindbar (FK-Inkonsistenz, analytics.berechnungslauf -> energy.endkunde).`);
      }

      const paarErgebnis = await this.verarbeitePaar(paar, endkunde, monatsmenge, { vonMonat: foerderjahr.vonMonat, bisMonatExklusiv });
      alleBindungen.push(...paarErgebnis.bindungen);
      alleHashZeilen.push(...paarErgebnis.hashZeilen);
      alleErgebnisse.push(paarErgebnis.ergebnis);
      for (const id of paarErgebnis.gebundeneLaeufeIds) {
        gebundeneLaeufeIds.add(id);
      }
      for (const monat of paarErgebnis.monatAufgeloest) {
        monatAufgeloestJeMonat.set(monat, (monatAufgeloestJeMonat.get(monat) ?? 0) + 1);
      }
      for (const b of paarErgebnis.bindungen) {
        if (QUALITAET_RANG[b.qualitaetsStufe] < QUALITAET_RANG[schlechtesteBindungQualitaet]) {
          schlechtesteBindungQualitaet = b.qualitaetsStufe;
        }
      }
    }

    // Design-Entscheidung (s. finale Antwort): `monate_gebunden` zaehlt
    // Monate aus `monatsmenge`, fuer die ALLE Scope-Paare eine Bindung
    // aufloesen konnten (portfolioweite Vollstaendigkeit je Monat) —
    // konsistent mit `monate_erwartet = monatsmenge.length` (identische
    // Definition wie am Preflight-Kopf, NICHT mit der Paaranzahl skaliert).
    const monateGebunden = monatsmenge.filter(
      (s) => (monatAufgeloestJeMonat.get(s.monat) ?? 0) === scopePaare.length,
    ).length;

    // Kanonische, deterministische Ordnung des Siegels (D2): sortiert bereits
    // durch die Paar-/Monats-Iterationsreihenfolge (scopePaare ist bereits
    // `ORDER BY endkunde_id, energietraeger`, `monatsmenge` ist aufsteigend
    // sortiert) — zusaetzliche explizite Sortierung als Absicherung gegen
    // eine kuenftige Aenderung der Iterationsreihenfolge.
    const bindungsHashZeilenSortiert = [...alleHashZeilen].sort();
    const bindungsHash = sha256Canonical(bindungsHashZeilenSortiert);

    const parameter = {
      abdeckungsfloor_pct: ABDECKUNGSFLOOR_PCT_DEFAULT,
      vorzeichenregel: VORZEICHENREGEL,
      lueckenregel: LUECKENREGEL,
      portfolio_verrechnung: true,
      rundung_nachkommastellen: RUNDUNG_NACHKOMMASTELLEN,
    };
    const parameterHash = sha256Canonical([JSON.stringify(parameter)]);

    const lauf = await this.einsparlaufRepository.insertLauf({
      id: randomUUID(),
      foerderjahrId: foerderjahr.id,
      art: kontext.dto.art,
      verfahrenCode: kontext.verfahren.code,
      verfahrenVersion: kontext.verfahren.version,
      parameter,
      parameterHash,
      preflightId: kontext.preflightId,
      bindungsHash,
      umfangPaareAnzahl: scopePaare.length,
      monateErwartet: monatsmenge.length,
      monateGebunden,
      gebundeneLaeufeAnzahl: gebundeneLaeufeIds.size,
      qualitaetsStufeMin: alleBindungen.length === 0 ? 'belastbar' : schlechtesteBindungQualitaet,
      ausloeser: kontext.dto.ausloeser ?? 'manuell',
      codeRevision: process.env['EDMS_CODE_REVISION'] ?? 'dev-unbekannt',
      synthetic: kontext.synthetic,
      ersetztEinsparlaufId: kontext.dto.ersetztEinsparlaufId ?? null,
      erstelltVonSub: kontext.erstelltVonSub,
    });

    await this.einsparlaufRepository.insertBindungen(lauf.id, alleBindungen);
    await this.einsparlaufRepository.insertErgebnisse(lauf.id, alleErgebnisse);

    // D7 — Nachweis-Bindung MONOTON setzen, bei der ERSTELLUNG des
    // Einspar-Laufs (nicht erst bei einer spaeteren Einreichung, Stufe 2).
    for (const berechnungslaufId of gebundeneLaeufeIds) {
      await this.laufLookupRepository.markiereNachweisGebunden(berechnungslaufId, `einsparlauf:${lauf.id}`);
    }

    const ergebnisseGespeichert = await this.einsparlaufRepository.findErgebnisseByLaufId(lauf.id, { limit: 10_000 });
    return { lauf, ergebnisse: ergebnisseGespeichert.daten };
  }

  /**
   * Verarbeitet EIN (Endkunde, Energieträger)-Paar: löst JEDEN erwarteten
   * Monat einzeln über `loeseBindungAuf()` auf, klassifiziert ihn
   * (`klassifiziereMonat()`), prüft Art.-18-Einschränkung des Endkunden
   * (`FJ-07a/b/c`) UND des Anschlussnutzers (`FJ-11a/b/c`, ADR-0006 P4/
   * ADR-0007 A12, seit V0028 über die Kette `mvet_id` →
   * `messkonzept_version_energietraeger_system` → `system_id` →
   * `nutzungsverhaeltnis` auflösbar) sowie Substitution (`FJ-06`, real
   * verdrahtet über `SubstitutionErkennungService`) und ruft — sofern das
   * Paar NICHT ausgeschlossen ist — den Rechenkern `einsparungJahr()`.
   *
   * Design-Entscheidung (Fail-closed-Verhalten bei FRISCH — zur
   * Lauf-Erstellungszeit, NICHT zur Preflight-Zeit — auftretendem `FJ-02`
   * [kein Kandidat] ODER `FJ-05` [abweichende Werte]): ein grüner Preflight
   * garantiert NUR den Zustand ZUM PREFLIGHT-ZEITPUNKT; zwischen Preflight
   * und Lauf-Erstellung KÖNNEN sich die zugrunde liegenden ADR-0006-Läufe
   * ändern (neuer Lauf, Ersatzlauf). Statt die GESAMTE, portfolioweite
   * Lauf-Erstellung an EINEM einzelnen betroffenen Paar scheitern zu lassen
   * (schlechter für M1/DE-02 als eine einzelne, sichtbar ausgewiesene
   * Ausnahme — dieselbe A11-Logik wie bei Art.-18), wird das Paar
   * `status='ausgeschlossen'`, `ausschluss_grund_code='nicht_nachweisbar'`
   * geführt — GENAU der Fall, den `nachweis.einsparlauf_ergebnis`s
   * Migrations-Kommentar (D-A11-AUSSCHLUSSGRUND) für diesen Code nennt:
   * „das Paar konnte aus ANDEREN strukturellen Gründen gar nicht in die
   * Aggregation eingehen (z. B. kein bindbarer Berechnungslauf trotz
   * FJ-02-Ausnahme)".
   */
  private async verarbeitePaar(
    paar: ScopePaar,
    endkunde: Endkunde,
    monatsmenge: readonly Monatsscheibe[],
    foerderjahrFenster: { readonly vonMonat: string; readonly bisMonatExklusiv: string },
  ): Promise<PaarEinfuegeErgebnis> {
    const einschraenkung = klassifiziereEndkundeEinschraenkung({
      verarbeitungsStatus: endkunde.verarbeitungsStatus,
      einschraenkungGrundCode: endkunde.einschraenkungGrundCode ?? null,
    });
    const substitution = await this.substitutionErkennungService.pruefen(paar.endkundeId, paar.energietraeger);

    // ADR-0006 P4 / ADR-0007 A12 — dieselbe Dreiteilung wie beim Endkunden,
    // erneut zur LAUF-Erstellungszeit ausgewertet (NICHT nur am Preflight
    // gespiegelt — dasselbe „re-validiere fail-closed zum eigenen
    // Schreibzeitpunkt"-Prinzip wie bei `einschraenkung` oben). NUR die
    // TATSÄCHLICH gefundenen Sperren fließen in die Ausschluss-Entscheidung
    // ein — eine strukturell NICHT auflösbare Kette (`ketteNichtAufloesbar`)
    // blockiert NICHT den Einspar-Lauf (das wäre ein neuer, hier NICHT
    // beauftragter Förderjahr-Blocker; V0028 dokumentiert eine leere
    // Zuordnung als GÜLTIGEN Übergangszustand) — sie gate't ausschließlich
    // die spätere Export-Kategorie `rohdaten` (FJ-10, s. `PreflightService`).
    const anschlussnutzerPruefung = await this.laufLookupRepository.findAnschlussnutzerSperrenFuerPaar(
      paar.endkundeId,
      paar.energietraeger,
      foerderjahrFenster.vonMonat,
      foerderjahrFenster.bisMonatExklusiv,
    );
    const anschlussnutzerAusschluss = anschlussnutzerPruefung.gesperrteAnschlussnutzer.some(
      (an) =>
        klassifiziereAnschlussnutzerEinschraenkung({
          verarbeitungsStatus: an.verarbeitungsStatus,
          einschraenkungGrundCode: an.einschraenkungGrundCode,
        }).paarAusschluss,
    );

    const bindungen: InsertBindungInput[] = [];
    const hashZeilen: string[] = [];
    const monatAufgeloest = new Set<string>();
    const ausweisbareMonate: AusweisbarerMonat[] = [];
    let unaufloesbareMonate = 0;

    for (const scheibe of monatsmenge) {
      const monat = scheibe.monat;
      const kandidaten = await this.laufLookupRepository.findKandidatenFuerScheibe(
        paar.endkundeId,
        paar.energietraeger,
        scheibe,
      );
      const aufloesung = loeseBindungAuf(kandidaten);

      if (aufloesung.art === 'kein_kandidat' || aufloesung.art === 'abweichend') {
        unaufloesbareMonate += 1;
        continue;
      }

      monatAufgeloest.add(monat);
      const gewaehlt: BindungsKandidat = aufloesung.gewaehlt;
      const monatsKlassifikation = klassifiziereMonat(gewaehlt.qualitaetsStufe);
      const deltaKwh = this.runde(gewaehlt.referenzKwh - gewaehlt.istKwh);
      const deltaAusgewiesenKwh = monatsKlassifikation.behandlung === 'ausgeschlossen' ? 0 : deltaKwh;

      bindungen.push({
        endkundeId: paar.endkundeId,
        energietraeger: paar.energietraeger,
        monat,
        berechnungslaufId: gewaehlt.berechnungslaufId,
        referenzKwh: this.runde(gewaehlt.referenzKwh),
        istKwh: this.runde(gewaehlt.istKwh),
        deltaKwh,
        deltaAusgewiesenKwh,
        qualitaetsStufe: gewaehlt.qualitaetsStufe,
        behandlung: monatsKlassifikation.behandlung,
        kandidatenAnzahl: aufloesung.kandidatenAnzahl,
      });
      hashZeilen.push(
        `${paar.endkundeId}|${paar.energietraeger}|${monat}|${gewaehlt.berechnungslaufId}|${gewaehlt.parameterHash}|${gewaehlt.rohdatenHash}|${gewaehlt.referenzKwh.toFixed(3)}|${gewaehlt.istKwh.toFixed(3)}`,
      );

      if (monatsKlassifikation.behandlung === 'gemessen' && istAusweisbareQualitaet(gewaehlt.qualitaetsStufe)) {
        ausweisbareMonate.push({ monat, deltaKwh, qualitaetsStufe: gewaehlt.qualitaetsStufe });
      }
    }

    const referenzKwhSumme = bindungen.length === 0 ? null : this.runde(bindungen.reduce((s, b) => s + b.referenzKwh, 0));
    const istKwhSumme = bindungen.length === 0 ? null : this.runde(bindungen.reduce((s, b) => s + b.istKwh, 0));
    const monateErsatz = 0; // v1: Lueckenregel kennt KEINE Ersatz-/Hochrechnung (B13.3/B14).

    if (einschraenkung.paarAusschluss || anschlussnutzerAusschluss) {
      return this.paarErgebnis(paar, bindungen, hashZeilen, monatAufgeloest, {
        status: 'ausgeschlossen',
        ausschlussGrundCode: 'datenschutzrechtliche_einschraenkung',
        referenzKwhSumme: null,
        istKwhSumme: null,
        einsparungKwhEndenergie: null,
        monateAusgewiesen: 0,
        monateErsatz,
        monateFehlend: monatsmenge.length,
        qualitaetsStufeMin: 'nicht_nachweisbar',
        wissAuswertungAusgenommen: endkunde.vonWissAuswertungAusgenommen,
      });
    }

    if (substitution) {
      return this.paarErgebnis(paar, bindungen, hashZeilen, monatAufgeloest, {
        status: 'ausgeschlossen',
        ausschlussGrundCode: 'energietraeger_substitution_v1_nicht_unterstuetzt',
        referenzKwhSumme: null,
        istKwhSumme: null,
        einsparungKwhEndenergie: null,
        monateAusgewiesen: 0,
        monateErsatz,
        monateFehlend: monatsmenge.length,
        qualitaetsStufeMin: 'nicht_nachweisbar',
        wissAuswertungAusgenommen: endkunde.vonWissAuswertungAusgenommen,
      });
    }

    if (unaufloesbareMonate > 0) {
      return this.paarErgebnis(paar, bindungen, hashZeilen, monatAufgeloest, {
        status: 'ausgeschlossen',
        ausschlussGrundCode: 'nicht_nachweisbar',
        referenzKwhSumme,
        istKwhSumme,
        einsparungKwhEndenergie: null,
        monateAusgewiesen: ausweisbareMonate.length,
        monateErsatz,
        monateFehlend: monatsmenge.length - ausweisbareMonate.length,
        qualitaetsStufeMin: 'nicht_nachweisbar',
        wissAuswertungAusgenommen: endkunde.vonWissAuswertungAusgenommen,
      });
    }

    // Die Domaenenfunktion rechnet auf MONATSKENNUNGEN und bleibt unangetastet
    // (Golden Vectors): Innerhalb EINES Foerderjahres kommt jeder Kalendermonat
    // hoechstens einmal vor, die Abbildung ist also eindeutig. Erst ueber zwei
    // Foerderjahre hinweg teilt sich ein Monat — und die werden nie gemeinsam
    // gerechnet.
    const jahresErgebnis = einsparungJahr({
      monatsDeltas: ausweisbareMonate,
      monatsmenge: monatsmenge.map((scheibe) => scheibe.monat),
      floorProzent: ABDECKUNGSFLOOR_PCT_DEFAULT,
    });
    const jahresStatus: JahresStatus = jahresErgebnis.status;
    const monateFehlend = monatsmenge.length - ausweisbareMonate.length;

    if (jahresErgebnis.status === 'nicht_nachweisbar') {
      return this.paarErgebnis(paar, bindungen, hashZeilen, monatAufgeloest, {
        status: 'nicht_nachweisbar',
        ausschlussGrundCode: null,
        referenzKwhSumme,
        istKwhSumme,
        einsparungKwhEndenergie: null,
        monateAusgewiesen: ausweisbareMonate.length,
        monateErsatz,
        monateFehlend,
        qualitaetsStufeMin: jahresStatus,
        wissAuswertungAusgenommen: endkunde.vonWissAuswertungAusgenommen,
      });
    }

    return this.paarErgebnis(paar, bindungen, hashZeilen, monatAufgeloest, {
      status: 'ausgewiesen',
      ausschlussGrundCode: null,
      referenzKwhSumme,
      istKwhSumme,
      einsparungKwhEndenergie: this.runde(jahresErgebnis.einsparungKwh as number),
      monateAusgewiesen: ausweisbareMonate.length,
      monateErsatz,
      monateFehlend,
      qualitaetsStufeMin: jahresStatus,
      wissAuswertungAusgenommen: endkunde.vonWissAuswertungAusgenommen,
    });
  }

  private paarErgebnis(
    paar: ScopePaar,
    bindungen: readonly InsertBindungInput[],
    hashZeilen: readonly string[],
    monatAufgeloest: ReadonlySet<string>,
    ergebnisInput: Omit<InsertErgebnisInput, 'endkundeId' | 'energietraeger'>,
  ): PaarEinfuegeErgebnis {
    return {
      bindungen,
      hashZeilen,
      monatAufgeloest,
      gebundeneLaeufeIds: [...new Set(bindungen.map((b) => b.berechnungslaufId))],
      ergebnis: { endkundeId: paar.endkundeId, energietraeger: paar.energietraeger, ...ergebnisInput },
    };
  }

  private runde(wert: number): number {
    const faktor = 10 ** RUNDUNG_NACHKOMMASTELLEN;
    return Math.round(wert * faktor) / faktor;
  }

  private klassifiziereFehler(error: unknown): NachweisFehlerCode {
    if (error instanceof NachweisFehlerException) {
      return error.fehlerCode;
    }
    return NACHWEIS_FEHLER_CODES.UNERWARTETER_FEHLER;
  }
}
