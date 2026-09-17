import type { ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FACHAKTION_KEY } from '../../common/decorators/fachaktion.decorator';
import type { PolicyAction, ResourceAttributes, ZugriffszweckAttribut } from '../../auth/policy/policy-decision-port';
import type { ResourceAttributesProvider } from '../../auth/policy/resource-attributes-provider';
import type { AuthenticatedRequest } from '../../common/security/authenticated-request';
import { EnergyEndkundeRepository } from '../persistence/energy/energy-endkunde.repository';
import { EnergySystemRepository } from '../persistence/energy/energy-system.repository';
import { EnergyZaehlerRepository } from '../persistence/energy/energy-zaehler.repository';
import { EnergyMesskanalRepository } from '../persistence/energy/energy-messkanal.repository';
import { EnergyAnschlussnutzerRepository } from '../persistence/energy/energy-anschlussnutzer.repository';
import type { Nutzungsverhaeltnis, Datenklasse } from '../persistence/energy/energy-nutzungsverhaeltnis.repository';
import { EnergyNutzungsverhaeltnisRepository } from '../persistence/energy/energy-nutzungsverhaeltnis.repository';
import { EnergyEndkundeShredAntragRepository } from '../persistence/energy/energy-endkunde-shred-antrag.repository';
import { EnergyStandortRepository } from '../persistence/energy/energy-standort.repository';
import { DeviceGeraetZuordnungRepository } from '../persistence/device/device-geraet-zuordnung.repository';
import { GeraetReverseQuotaRepository } from '../persistence/audit/geraet-reverse-quota.repository';
// ADR-0006 — Cross-Modul-Abhängigkeit `stammdaten -> berechnung` (NUR diese
// EINE Repository-Klasse, KEIN Modul-Import) — s. Klassen-Dok unten
// "Provider-Scoping (ADR-0006)" für die Begründung.
import { AnalyticsBerechnungslaufRepository } from '../../berechnung/persistence/analytics-berechnungslauf.repository';
// ADR-0006 Teil B (B8/B10, Einflussgrößen) — `einflussgroesseId`-Zweig
// (`resolveViaEinflussgroesse()`, s. Klassen-Dok "Provider-Scoping
// (ADR-0006 Teil B)").
import { EinflussIntervallRepository } from '../persistence/einfluss/einfluss-intervall.repository';
// ADR-0007 Teil B (B10) — Cross-Modul-Abhängigkeit `stammdaten -> nachweis`
// (NUR diese ZWEI Repository-Klassen, KEIN Modul-Import) — s. Klassen-Dok
// "Provider-Scoping (ADR-0007)", GENAU ANALOG der bestehenden
// `stammdaten -> berechnung`-Abhängigkeit oben.
import { NachweisPreflightRepository } from '../../nachweis/persistence/nachweis-preflight.repository';
import { NachweisEinsparlaufRepository } from '../../nachweis/persistence/nachweis-einsparlauf.repository';
// ADR-0007 Teil B (B10) STUFE 2 — s. Klassen-Dok "Provider-Scoping
// (ADR-0007 STUFE 2)", GENAU ANALOG der Stufe-1-Ergänzung oben.
import { NachweisExportRepository } from '../../nachweis/persistence/nachweis-export.repository';
import { NachweisEinreichungRepository } from '../../nachweis/persistence/nachweis-einreichung.repository';
import { GERAET_REVERSE_QUOTA_JE_SUBJEKT_24H } from '../../auth/policy/geraet-reverse.constants';
import { nichtGefunden } from '../common/problem.util';
import { extractZugriffszweck } from './zugriffszweck.util';
import { extractGeraetReverseZugriff } from './geraet-reverse-zugriff.util';

interface NutzungReduktion {
  readonly datenklasse?: Datenklasse;
  readonly anschlussnutzerAbweichtEndkunde?: boolean;
}

/**
 * ADR-0008 §15 (D3) — der ERSTE echte `ResourceAttributesProvider`. Fragt
 * AUSSCHLIESSLICH den `energy`-Namensraum (NIE `identity` — Linie 2, der PDP
 * zieht selbst keine PII). Läuft in derselben ambienten Tx (`TransactionHost.
 * tx`, über die injizierten Repositories) — liest also konsistent zur
 * Fachoperation.
 *
 * Auflösung "welche Entität ist gemeint" über die vom Controller vergebenen
 * Pfad-Parameter (`request.params`) — Priorität von spezifisch zu allgemein:
 * `antragId` (ADR-0009 §2.2) > `geraetZuordnungId` (ADR-0005 §26.4, NEU) >
 * `nutzungsverhaeltnisId` > `anschlussnutzerId` > `messkanalId` > `zaehlerId`
 * > `systemId` > `endkundeId`. Listen-/Monitoring-Routen OHNE Entitäts-Pfad-
 * Parameter liefern bewusst KEIN Ressourcen-Attribut (`undefined` → PDP-
 * Kurzschluss `kein_ressourcenbezug`/permit — durch `@Roles` bereits
 * RBAC-gated, Listen sind ohnehin schema-erzwungen PII-frei, Linie 2).
 *
 * Provider-Scoping (ADR-0009 §2.4/§6, `antragId`-Routen): `resolveViaShredAntrag()`
 * verifiziert `antrag.endkundeId === params.endkundeId` SELBST und wirft bei
 * Abweichung/fehlendem Antrag ein `nichtGefunden()` (404) DIREKT aus
 * `resolve()` heraus — VOR jeder PDP-Auswertung. Das ist bewusst KEIN
 * `resource===undefined`-Rückgabewert: eine `PolicyInterceptor`-Ablehnung ist
 * strukturell IMMER ein `ForbiddenException` (403); ein 404 kann nur VOR der
 * PDP-Auswertung geworfen werden, s. `PolicyInterceptor.authorize()`
 * (`resource = await ...resolve(context)` läuft VOR `pdp.evaluate(...)`).
 * So bestätigt eine falsche `endkundeId` im Pfad NIE die Existenz eines
 * fremden Antrags (weder über eine 403-ABAC-Ablehnung noch über einen
 * abweichenden Fehlergrund).
 *
 * Provider-Scoping (ADR-0006) — `resolveViaBerechnungslauf()`/die
 * body-basierte `create:berechnungslauf`-Auflösung sind die ERSTEN
 * Konsumenten AUSSERHALB von `stammdaten/**`, die dieser Provider bedient
 * (der `BerechnungModule`-Controller trägt `@Fachaktion('read:
 * berechnungslauf')`/`@Fachaktion('create:berechnungslauf')`, s. dortigen
 * Controller-Kommentar "CompositeResourceAttributesProvider dispatcht rein
 * über @Fachaktion(...) + Pfad-Parameter/Body — modulunabhängig", bereits
 * für `MesswerteModule` etabliert). Das erzeugt eine bewusste, NEUE
 * Rückwärtsabhängigkeit `stammdaten -> berechnung` (NUR die eine Klasse
 * `AnalyticsBerechnungslaufRepository`, KEIN Modul-Import) — Kehrseite der
 * ADR-0008-§15-Entscheidung, ABAC-Ressourcenauflösung an EINER zentralen
 * Stelle zu bündeln, statt sie je Fach-Modul zu duplizieren. Diese Datei ist
 * eine Policy-Datei (freigabepflichtig, s. finale Antwort dieses
 * Arbeitspakets) — der Import ist bewusst MINIMAL (eine einzelne,
 * zustandslose `TransactionHost`-Repository-Klasse, kein `BerechnungModule`-
 * Import, keine zyklische NestJS-Modul-Abhängigkeit: `stammdaten.module.ts`
 * deklariert `AnalyticsBerechnungslaufRepository` ERNEUT als eigenen
 * Provider, exakt das bereits etablierte "zweite, zustandslose Instanz"-
 * Muster aus `messwerte.module.ts`).
 *
 * Provider-Scoping (ADR-0006 Teil B, B8/B10, Einflussgrößen) —
 * `resolveViaEinflussgroesse()` löst `params['einflussgroesseId']`
 * (`PATCH .../einflussgroessen/{id}`, `update:einflussgroesse`) über
 * `einfluss.intervall.system_id -> resolveViaSystem()` auf (Muster
 * `resolveViaBerechnungslauf()`, EIN zusätzlicher Repository-Zugriff,
 * DIESMAL innerhalb `stammdaten/**` selbst — `EinflussIntervallRepository`
 * liegt in `stammdaten/persistence/einfluss/**`, KEINE Cross-Modul-Abhängigkeit).
 * `create:einflussgroesse`/`read:einflussgroesse` (`POST`/`GET
 * .../systeme/{systemId}/einflussgroessen`) teilen sich den Pfad-Parameter
 * `systemId` mit JEDER ANDEREN `systemId`-Route in diesem Repo (z. B.
 * `update:system`) — die generische `params['systemId']`-Verzweigung
 * dispatcht dort HART auf `entityTyp='system'`; für GENAU diese zwei neuen
 * Aktionen wird deshalb VORAB die Fachaktion geprüft (Reflector, Muster
 * `create:berechnungslauf` unten) und auf `resolveEinflussgroesseAttribut()`
 * umgeleitet (`entityTyp='einflussgroesse'`) — JEDE ANDERE `systemId`-Route
 * bleibt UNVERÄNDERT bei `entityTyp='system'`.
 *
 * Provider-Scoping (ADR-0007 Teil B, B10) — `resolveViaPreflight()`
 * (`params['preflightId']`, `read:nachweis_preflight`) und
 * `resolveViaEinsparlauf()` (`params['einsparlaufId']`, `read:einsparlauf`)
 * sind die ERSTEN Konsumenten aus `nachweis/**` (GENAU ANALOG
 * `resolveViaBerechnungslauf()` oben, „ERSTE Konsumenten AUSSERHALB von
 * stammdaten/**"). ANDERS als `resolveViaBerechnungslauf()` münden BEIDE
 * NICHT in `resolveViaEndkunde()` — B10 ist hier ausdrücklich: die beiden
 * Nachweis-Leseaktionen sind PORTFOLIOWEIT, es gibt KEINEN Endkunden-Scope
 * ("wer einen Förderjahr-Nachweis erzeugen/lesen darf, sieht das
 * Portfolio"). Beide Methoden liefern daher NUR `{entityTyp}` (Existenz-
 * Signal für die 404-vs-403-Reihenfolge, s. `resolveViaBerechnungslauf()`-
 * Dok) oder `undefined`, NIE ein `endkundeId`-/`verarbeitungsStatus`-
 * Attribut. `create:foerderjahr`/`create:nachweis_preflight`/
 * `create:einsparlauf` haben KEINEN Pfad-Parameter (Ressource existiert vor
 * dem Request noch nicht, PORTFOLIOWEIT, KEIN Body-`endkundeId`-Analogon zu
 * `resolveViaBerechnungslaufBody()`) — sie erreichen `resolve()`s
 * Fallthrough (`return undefined`) unverändert, GENAU WIE `create:endkunde`.
 *
 * Finding A (`access-control-engineer`, ADR-0008 §15) — FAIL-CLOSED bei
 * Mehrzeilen: eine Abfrage `WHERE system_id=? AND gueltig_bis IS NULL` (bzw.
 * analog auf Endkunde-Ebene) kann MEHRERE aktuelle
 * `energy.nutzungsverhaeltnis`-Zeilen liefern (mehrere Anschlussnutzer an
 * derselben Messstelle) — KEIN stilles `LIMIT 1`. Diese Klasse löst das
 * konsistent-restriktiv: `datenklasse='detailverbrauch'` gewinnt, sobald
 * MINDESTENS eine der aktuellen Beziehungen `detailverbrauch` ist;
 * `anschlussnutzerAbweichtEndkunde=true`, sobald MINDESTENS eine Beziehung
 * eine Rolle ≠ `eigentuemer_selbstnutzer` trägt. Beides ist die JEWEILS
 * RESTRIKTIVERE Auflösung bei Mehrdeutigkeit (führt im PDP zu `deny`, nicht
 * zu `permit`, wo diese Attribute eine Rolle spielen) — nie eine
 * unbegründete, freizügigere Annahme.
 */
@Injectable()
export class StammdatenResourceAttributesProvider implements ResourceAttributesProvider {
  constructor(
    private readonly endkundeRepository: EnergyEndkundeRepository,
    private readonly systemRepository: EnergySystemRepository,
    private readonly zaehlerRepository: EnergyZaehlerRepository,
    private readonly messkanalRepository: EnergyMesskanalRepository,
    private readonly anschlussnutzerRepository: EnergyAnschlussnutzerRepository,
    private readonly nutzungsverhaeltnisRepository: EnergyNutzungsverhaeltnisRepository,
    private readonly shredAntragRepository: EnergyEndkundeShredAntragRepository,
    private readonly standortRepository: EnergyStandortRepository,
    private readonly geraetZuordnungRepository: DeviceGeraetZuordnungRepository,
    private readonly geraetReverseQuotaRepository: GeraetReverseQuotaRepository,
    // ADR-0006 — s. Klassen-Dok "Provider-Scoping (ADR-0006)".
    private readonly berechnungslaufRepository: AnalyticsBerechnungslaufRepository,
    // ADR-0006 Teil B (B8/B10) — s. Klassen-Dok "Provider-Scoping (ADR-0006 Teil B)".
    private readonly einflussIntervallRepository: EinflussIntervallRepository,
    // ADR-0007 Teil B (B10) — s. Klassen-Dok "Provider-Scoping (ADR-0007)".
    private readonly nachweisPreflightRepository: NachweisPreflightRepository,
    private readonly nachweisEinsparlaufRepository: NachweisEinsparlaufRepository,
    // ADR-0007 Teil B (B10) STUFE 2 — s. Klassen-Dok "Provider-Scoping (ADR-0007 STUFE 2)".
    private readonly nachweisExportRepository: NachweisExportRepository,
    private readonly nachweisEinreichungRepository: NachweisEinreichungRepository,
    private readonly reflector: Reflector,
  ) {}

  async resolve(context: ExecutionContext): Promise<ResourceAttributes | undefined> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const params = (request.params ?? {}) as Record<string, string | undefined>;
    const zugriffszweck = extractZugriffszweck(request);
    // Vorab berechnet (statt wie zuvor NUR am Ende der Kaskade) — wird JETZT
    // BEREITS in der `systemId`-Verzweigung gebraucht (ADR-0006 Teil B,
    // `create:/read:einflussgroesse`, s. Klassen-Dok "Provider-Scoping
    // (ADR-0006 Teil B)"), zusätzlich weiterhin am Ende für
    // `create:berechnungslauf` (unverändert).
    const fachaktion = this.reflector.getAllAndOverride<PolicyAction | undefined>(FACHAKTION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (params['antragId'] !== undefined) {
      return this.resolveViaShredAntrag(params['antragId'], params['endkundeId']);
    }
    if (params['geraetZuordnungId'] !== undefined) {
      return this.resolveViaGeraetZuordnung(params['geraetZuordnungId'], request);
    }
    if (params['standortId'] !== undefined) {
      return this.resolveViaStandort(params['standortId']);
    }
    // ADR-0006 — `GET /berechnung/laeufe/{laufId}` (`read:berechnungslauf`).
    if (params['laufId'] !== undefined) {
      return this.resolveViaBerechnungslauf(params['laufId']);
    }
    // ADR-0006 Teil B (B8/B10) — `PATCH .../einflussgroessen/{id}`
    // (`update:einflussgroesse`), s. Klassen-Dok "Provider-Scoping (ADR-0006 Teil B)".
    if (params['einflussgroesseId'] !== undefined) {
      return this.resolveViaEinflussgroesse(params['einflussgroesseId']);
    }
    // ADR-0007 Teil B (B10) — `GET /nachweis/preflights/{id}[/befunde]`
    // (`read:nachweis_preflight`).
    if (params['preflightId'] !== undefined) {
      return this.resolveViaPreflight(params['preflightId']);
    }
    // ADR-0007 Teil B (B10) — `GET /nachweis/einsparlaeufe/{id}[/ergebnisse|/bindungen]`
    // (`read:einsparlauf`).
    if (params['einsparlaufId'] !== undefined) {
      return this.resolveViaEinsparlauf(params['einsparlaufId']);
    }
    // ADR-0007 Teil B (B10) STUFE 2 — `GET /nachweis/exporte/{id}[/dateien/{dateiname}]`
    // (`read:nachweis_export`).
    if (params['exportId'] !== undefined) {
      return this.resolveViaNachweisExport(params['exportId']);
    }
    // ADR-0007 Teil B (B10) STUFE 2 — `GET /nachweis/einreichungen/{id}[/differenzen]`
    // (`read:einreichung`).
    if (params['einreichungId'] !== undefined) {
      return this.resolveViaEinreichung(params['einreichungId']);
    }
    if (params['nutzungsverhaeltnisId'] !== undefined) {
      return this.resolveViaNutzungsverhaeltnis(params['nutzungsverhaeltnisId'], zugriffszweck);
    }
    if (params['anschlussnutzerId'] !== undefined) {
      return this.resolveViaAnschlussnutzer(params['anschlussnutzerId'], zugriffszweck);
    }
    if (params['messkanalId'] !== undefined) {
      return this.resolveViaMesskanal(params['messkanalId'], zugriffszweck);
    }
    if (params['zaehlerId'] !== undefined) {
      return this.resolveViaZaehler(params['zaehlerId'], zugriffszweck);
    }
    if (params['systemId'] !== undefined) {
      // ADR-0006 Teil B (B8/B10) — `create:/read:einflussgroesse` teilen den
      // Pfad-Parameter `systemId` mit JEDER ANDEREN `systemId`-Route in
      // diesem Repo (z. B. `update:system`) — s. Klassen-Dok "Provider-
      // Scoping (ADR-0006 Teil B)". NUR für GENAU diese zwei Aktionen wird
      // auf `entityTyp='einflussgroesse'` umgeleitet; jede andere
      // `systemId`-Route bleibt UNVERÄNDERT bei `entityTyp='system'`.
      if (fachaktion === 'create:einflussgroesse' || fachaktion === 'read:einflussgroesse') {
        return this.resolveEinflussgroesseAttribut(params['systemId'], request);
      }
      return this.resolveViaSystem(params['systemId'], 'system', zugriffszweck);
    }
    if (params['endkundeId'] !== undefined) {
      return this.resolveViaEndkunde(params['endkundeId'], 'endkunde', zugriffszweck);
    }

    // ADR-0006 — `POST /berechnung/laeufe` (`create:berechnungslauf`) hat
    // KEINEN Pfad-Parameter (die Ressource existiert vor dem Request noch
    // nicht, analog `create:endkunde`) — `endkundeId` kommt redundant aus
    // dem Request-BODY (`BerechnungslaufAnlegenDto.endkundeId`, V0019-
    // Kommentar "redundant, ABAC-Filter ohne Join"). AUSSCHLIESSLICH für
    // GENAU diese eine Aktion geprüft (Reflector-Check, NICHT generisch für
    // jeden Body mit einem `endkundeId`-Feld) — verhindert, dass ein
    // künftiger, andersartiger Body mit zufällig gleichnamigem Feld
    // versehentlich ABAC-Attribute bekommt, die für ihn nie gedacht waren.
    if (fachaktion === 'create:berechnungslauf') {
      return this.resolveViaBerechnungslaufBody(request);
    }

    return undefined;
  }

  /**
   * ADR-0009 §2.2/§2.4/§6 — löst `resource.shredAntrag` für
   * `shred:endkunde:freigeben`/`shred:endkunde:ablehnen` auf. Provider-Scoping
   * (s. Klassen-Dok): fehlt der Antrag ODER weicht `antrag.endkundeId` vom
   * Pfad-`endkundeId` ab, wirft diese Methode DIREKT ein `nichtGefunden()`
   * (404) — KEIN `undefined`-Rückgabewert (der würde beim PDP als
   * `resource===undefined` ankommen und in der neuen Vier-Augen-Prüfung
   * fälschlich zu einem 403 `shred_antrag_ungueltig` statt 404 führen).
   */
  private async resolveViaShredAntrag(
    antragId: string,
    endkundeIdAusPfad: string | undefined,
  ): Promise<ResourceAttributes> {
    const antrag = await this.shredAntragRepository.findById(antragId);
    if (antrag === undefined || antrag.endkundeId !== endkundeIdAusPfad) {
      throw nichtGefunden('Shred-Antrag');
    }

    return { shredAntrag: { beantragtVonSub: antrag.beantragtVonSub, status: antrag.status } };
  }

  /**
   * ADR-0005 §26.4 (D14) — loest `resource.geraetZuordnung` fuer
   * `update:geraet_zuordnung` (PATCH `.../geraet-zuordnungen/{id}`) UND
   * `read:geraet_zuordnung` (POST `.../geraet-zuordnungen/{id}/reverse-
   * aufloesung`, SEC-5, NEU) auf — BEIDE Routen teilen sich denselben
   * Pfad-Parameter `geraetZuordnungId`, `resolve()` dispatcht unabhaengig
   * von der Aktion rein ueber Pfad-Parameter (s. Klassen-Dok). Anders als
   * `resolveViaShredAntrag` (Vier-Augen-Scoping) gibt es hier KEINEN
   * zusaetzlichen Pfad-Parameter zum Gegenpruefen — ein Mismatch ist
   * strukturell ausgeschlossen (die Zuordnung wird direkt ueber ihre EIGENE
   * `id` aufgeloest). Existiert die Zuordnung nicht, liefert diese Methode
   * `undefined` (→ PDP-Kurzschluss `kein_ressourcenbezug`/permit fuer
   * `update:geraet_zuordnung` bzw. `geraet_reverse_ressource_ungueltig`/deny
   * fuer `read:geraet_zuordnung`, s. `evaluateGeraetReverse()`).
   *
   * SEC-5 — `geraetReverse`-Attribut (Aufloesungs-/Quota-Zusatz): wird NUR
   * berechnet, wenn der Request-BODY tatsaechlich `zweck`/`ticketRef` traegt
   * (`extractGeraetReverseZugriff`) — das ist bei der PATCH-Route (Body
   * `{aktion:'deaktivieren'}`) strukturell NIE der Fall, daher entfaellt dort
   * die zusaetzliche Audit-Quota-Zaehlabfrage (kein unnoetiger DB-Roundtrip
   * fuer eine Aktion, die `resource.geraetReverse` ohnehin nie konsultiert).
   *
   * SA-1-Fix (Security-Review Phase 5, TOCTOU-Race) — die Quota-Zaehlung
   * laeuft ueber `GeraetReverseQuotaRepository.
   * sperreUndZaehleErfolgreicheAufloesungenImFenster()` (NICHT mehr eine
   * reine, unsynchronisierte Zaehlung): diese Methode sperrt VORHER
   * transaktionsgebunden je `actor_sub` (`pg_advisory_xact_lock`, gehalten
   * bis zum Commit/Rollback der ambienten Request-Transaktion, die auch
   * Decrypt+Audit-Append traegt, s. dortigen Klassen-Kommentar) — dadurch
   * koennen N parallele Anfragen DESSELBEN Subjekts die Quota nicht mehr
   * durch gleichzeitiges Lesen desselben alten Zaehlerstands umgehen.
   */
  private async resolveViaGeraetZuordnung(
    geraetZuordnungId: string,
    request: AuthenticatedRequest,
  ): Promise<ResourceAttributes | undefined> {
    const zuordnung = await this.geraetZuordnungRepository.findById(geraetZuordnungId);
    if (zuordnung === undefined) {
      return undefined;
    }

    const reverseZugriff = extractGeraetReverseZugriff(request);
    if (reverseZugriff === undefined) {
      return { geraetZuordnung: { zaehlerId: zuordnung.zaehlerId } };
    }

    const actorSub = request.securityContext?.sub;
    // Strukturell sollte actorSub hier immer gesetzt sein (PolicyInterceptor
    // wirft vorher `kein_security_context`, s. dortigen Kommentar) — der
    // Fail-closed-Fallback (Quota als "ueberschritten" behandeln) ist ein
    // reiner Backstop, kein erwarteter Pfad.
    const anzahlLetzteFensterZeit =
      actorSub === undefined
        ? Number.POSITIVE_INFINITY
        : await this.geraetReverseQuotaRepository.sperreUndZaehleErfolgreicheAufloesungenImFenster(actorSub);
    const quotaUeberschritten = anzahlLetzteFensterZeit >= GERAET_REVERSE_QUOTA_JE_SUBJEKT_24H;

    return {
      geraetZuordnung: { zaehlerId: zuordnung.zaehlerId },
      geraetReverse: {
        ...(reverseZugriff.zweck !== undefined ? { zweck: reverseZugriff.zweck } : {}),
        ...(reverseZugriff.ticketRef !== undefined ? { ticketRef: reverseZugriff.ticketRef } : {}),
        quotaUeberschritten,
      },
    };
  }

  /**
   * ADR-0010 D5 — löst `resource.standort` für ALLE `standort`-/
   * `zaehler_standort`-Fachaktionen auf, die über den Pfad-Parameter
   * `standortId` adressiert werden (`/stammdaten/standorte/{standortId}/**`).
   * AUSSCHLIESSLICH `energy.standort`-Spalten (Linie 2 — der PDP zieht keine
   * PII): `endkundeId`, `typ`, `ebene`, `status`. Bewusst KEIN Merge mit der
   * `entityTyp`/`vonWissAuswertungAusgenommen`-Familie der übrigen
   * Ressourcentypen — ADR-0010 D5 definiert `standort` als eigenständiges,
   * in sich geschlossenes Attribut.
   */
  private async resolveViaStandort(standortId: string): Promise<ResourceAttributes | undefined> {
    const standort = await this.standortRepository.findById(standortId);
    if (standort === undefined) {
      return undefined;
    }

    return {
      standort: {
        endkundeId: standort.endkundeId,
        typ: standort.typ,
        ebene: standort.ebene,
        status: standort.status,
      },
    };
  }

  /**
   * ADR-0006 — löst `read:berechnungslauf` (`GET /berechnung/laeufe/{laufId}`)
   * auf: `laufId -> analytics.berechnungslauf.endkunde_id -> resolveViaEndkunde()`.
   * Existiert der Lauf nicht, liefert diese Methode `undefined`
   * (→ PDP-Kurzschluss `kein_ressourcenbezug`/permit, DANACH liefert der
   * SERVICE selbst ein `nichtGefunden()` (404) — dieselbe Reihenfolge wie
   * bei jeder anderen entitätslosen ID, kein Informations-Leck).
   */
  private async resolveViaBerechnungslauf(laufId: string): Promise<ResourceAttributes | undefined> {
    const endkundeId = await this.berechnungslaufRepository.findEndkundeIdById(laufId);
    if (endkundeId === undefined) {
      return undefined;
    }
    return this.resolveViaEndkunde(endkundeId, 'berechnungslauf', undefined);
  }

  /**
   * ADR-0006 — löst `create:berechnungslauf` (`POST /berechnung/laeufe`)
   * AUSSCHLIESSLICH aus dem Request-BODY auf (`endkundeId`-Feld,
   * `BerechnungslaufAnlegenDto`) — ungeprüfter Rohwert (Format-/Existenz-
   * Prüfung ist Service-Sache, `BerechnungslaufService.starten()`); ein
   * nicht-existierender/fremder Endkunde liefert hier `undefined`
   * (→ `kein_ressourcenbezug`/permit, der Service liefert danach die
   * eigentliche 404/409 — analog `create:endkunde` selbst, das ebenfalls
   * ohne Ressourcen-Vorabprüfung auskommt, weil die Zielentität noch nicht
   * existiert).
   */
  private async resolveViaBerechnungslaufBody(request: AuthenticatedRequest): Promise<ResourceAttributes | undefined> {
    const body = request.body as Record<string, unknown> | undefined;
    const endkundeId = typeof body?.['endkundeId'] === 'string' ? body['endkundeId'] : undefined;
    if (endkundeId === undefined) {
      return undefined;
    }
    return this.resolveViaEndkunde(endkundeId, 'endkunde', undefined);
  }

  /**
   * ADR-0007 Teil B (B10) — löst `read:nachweis_preflight` mit Pfad-ID auf.
   * PORTFOLIOWEIT (s. Klassen-Dok "Provider-Scoping (ADR-0007)"): KEIN
   * `resolveViaEndkunde()`-Aufruf, NUR ein Existenz-Signal. Existiert der
   * Preflight nicht, liefert diese Methode `undefined` (→ PDP-Kurzschluss
   * `kein_ressourcenbezug`/permit, DANACH liefert der SERVICE selbst ein
   * `nichtGefunden()` (404) — dieselbe Reihenfolge wie bei
   * `resolveViaBerechnungslauf()`).
   */
  private async resolveViaPreflight(preflightId: string): Promise<ResourceAttributes | undefined> {
    const preflight = await this.nachweisPreflightRepository.findById(preflightId);
    if (preflight === undefined) {
      return undefined;
    }
    return { entityTyp: 'preflight' };
  }

  /**
   * ADR-0007 Teil B (B10) — löst `read:einsparlauf` mit Pfad-ID auf. GENAU
   * ANALOG `resolveViaPreflight()` — PORTFOLIOWEIT, KEIN Endkunden-Scope.
   */
  private async resolveViaEinsparlauf(einsparlaufId: string): Promise<ResourceAttributes | undefined> {
    const existiert = await this.nachweisEinsparlaufRepository.existsById(einsparlaufId);
    if (!existiert) {
      return undefined;
    }
    return { entityTyp: 'einsparlauf' };
  }

  /**
   * ADR-0007 Teil B (B10) STUFE 2 — löst `read:nachweis_export` mit Pfad-ID
   * auf. GENAU ANALOG `resolveViaPreflight()`/`resolveViaEinsparlauf()` —
   * PORTFOLIOWEIT, KEIN Endkunden-Scope, reines Existenz-/404-Signal (die
   * eigentliche Härtung ist die resource-lose Auditor-Deny-Regel im
   * `InCodePolicyAdapter`, s. dort).
   */
  private async resolveViaNachweisExport(exportId: string): Promise<ResourceAttributes | undefined> {
    const existiert = await this.nachweisExportRepository.existsById(exportId);
    if (!existiert) {
      return undefined;
    }
    return { entityTyp: 'nachweisExport' };
  }

  /** ADR-0007 Teil B (B10) STUFE 2 — löst `read:einreichung` mit Pfad-ID auf. GENAU ANALOG `resolveViaNachweisExport()`. */
  private async resolveViaEinreichung(einreichungId: string): Promise<ResourceAttributes | undefined> {
    const existiert = await this.nachweisEinreichungRepository.existsById(einreichungId);
    if (!existiert) {
      return undefined;
    }
    return { entityTyp: 'einreichung' };
  }

  /**
   * ADR-0006 Teil B (B8/B10) — löst `update:einflussgroesse`
   * (`PATCH .../einflussgroessen/{id}`) auf:
   * `einflussgroesseId -> einfluss.intervall.system_id/.groesse_code/
   * .betroffener_typ -> resolveEinflussgroesseAttribut()`. Existiert das
   * Intervall nicht, liefert diese Methode `undefined` (→ PDP-Kurzschluss
   * `kein_ressourcenbezug`/permit, DANACH liefert der SERVICE selbst ein
   * `nichtGefunden()` (404) — dieselbe Reihenfolge wie bei
   * `resolveViaBerechnungslauf()`).
   */
  private async resolveViaEinflussgroesse(einflussgroesseId: string): Promise<ResourceAttributes | undefined> {
    const intervall = await this.einflussIntervallRepository.findById(einflussgroesseId);
    if (intervall === undefined) {
      return undefined;
    }
    return this.resolveEinflussgroesseAttribut(intervall.systemId, undefined, {
      groesseCode: intervall.groesseCode,
      betroffenerTyp: intervall.betroffenerTyp,
    });
  }

  /**
   * ADR-0006 Teil B (B8/B10) — gemeinsamer Resolver für
   * `create:/read:/update:einflussgroesse` (`entityTyp='einflussgroesse'`,
   * s. Klassen-Dok "Provider-Scoping (ADR-0006 Teil B)"). `extra.groesseCode`/
   * `.betroffenerTyp` kommen ENTWEDER aus dem Request-BODY (`create:
   * einflussgroesse`, `EinflussgroesseErfassenDto` — ungeprüfte Rohwerte,
   * analog `geraetReverse.zweck`) ODER — wenn `request` `undefined` ist —
   * bereits AUFGELÖST vom Aufrufer (`resolveViaEinflussgroesse()`, aus dem
   * `einfluss.intervall`-Datensatz selbst). `read:einflussgroesse` (GET,
   * kein Body) liefert `request` zwar, aber der Body ist leer — `extra`
   * bleibt dann `undefined`/`undefined` (harmlos, s. `ResourceAttributes.
   * einflussgroesse`-Kommentar: aktuell von KEINER `evaluate()`-Regel
   * konsultiert).
   */
  private async resolveEinflussgroesseAttribut(
    systemId: string,
    request: AuthenticatedRequest | undefined,
    vorabAufgeloest?: { readonly groesseCode: string; readonly betroffenerTyp: 'endkunde' | 'anschlussnutzer' },
  ): Promise<ResourceAttributes | undefined> {
    const system = await this.systemRepository.findById(systemId);
    if (system === undefined) {
      return undefined;
    }
    const endkunde = await this.endkundeRepository.findById(system.endkundeId);
    if (endkunde === undefined) {
      return undefined;
    }

    let groesseCode: string | undefined = vorabAufgeloest?.groesseCode;
    let betroffenerTyp: 'endkunde' | 'anschlussnutzer' | undefined = vorabAufgeloest?.betroffenerTyp;
    if (vorabAufgeloest === undefined && request !== undefined) {
      const body = request.body as Record<string, unknown> | undefined;
      groesseCode = typeof body?.['groesseCode'] === 'string' ? body['groesseCode'] : undefined;
      const betroffenerTypRaw = body?.['betroffenerTyp'];
      betroffenerTyp =
        betroffenerTypRaw === 'endkunde' || betroffenerTypRaw === 'anschlussnutzer' ? betroffenerTypRaw : undefined;
    }

    return {
      entityTyp: 'einflussgroesse',
      verarbeitungsStatus: endkunde.verarbeitungsStatus,
      vonWissAuswertungAusgenommen: endkunde.vonWissAuswertungAusgenommen,
      einflussgroesse: {
        endkundeId: system.endkundeId,
        systemId,
        ...(groesseCode !== undefined ? { groesseCode } : {}),
        ...(betroffenerTyp !== undefined ? { betroffenerTyp } : {}),
      },
    };
  }

  private async resolveViaEndkunde(
    endkundeId: string,
    entityTyp: NonNullable<ResourceAttributes['entityTyp']>,
    zugriffszweck: ZugriffszweckAttribut | undefined,
  ): Promise<ResourceAttributes | undefined> {
    const endkunde = await this.endkundeRepository.findById(endkundeId);
    if (endkunde === undefined) {
      return undefined;
    }

    const nutzungen = await this.nutzungsverhaeltnisRepository.findAktuelleFuerEndkunde(endkundeId);
    const reduktion = this.reduziereNutzungen(nutzungen);

    return this.buildResourceAttributes({
      entityTyp,
      verarbeitungsStatus: endkunde.verarbeitungsStatus,
      vonWissAuswertungAusgenommen: endkunde.vonWissAuswertungAusgenommen,
      ...reduktion,
      ...(zugriffszweck !== undefined ? { zugriffszweck } : {}),
    });
  }

  private async resolveViaAnschlussnutzer(
    anschlussnutzerId: string,
    zugriffszweck: ZugriffszweckAttribut | undefined,
  ): Promise<ResourceAttributes | undefined> {
    const anschlussnutzer = await this.anschlussnutzerRepository.findById(anschlussnutzerId);
    if (anschlussnutzer === undefined) {
      return undefined;
    }

    return this.resolveViaEndkunde(anschlussnutzer.endkundeId, 'anschlussnutzer', zugriffszweck);
  }

  private async resolveViaNutzungsverhaeltnis(
    nutzungsverhaeltnisId: string,
    zugriffszweck: ZugriffszweckAttribut | undefined,
  ): Promise<ResourceAttributes | undefined> {
    const nutzungsverhaeltnis = await this.nutzungsverhaeltnisRepository.findById(nutzungsverhaeltnisId);
    if (nutzungsverhaeltnis === undefined) {
      return undefined;
    }

    const endkunde = await this.endkundeRepository.findById(nutzungsverhaeltnis.endkundeId);
    if (endkunde === undefined) {
      return undefined;
    }

    return this.buildResourceAttributes({
      entityTyp: 'nutzungsverhaeltnis',
      verarbeitungsStatus: endkunde.verarbeitungsStatus,
      vonWissAuswertungAusgenommen: endkunde.vonWissAuswertungAusgenommen,
      datenklasse: nutzungsverhaeltnis.datenklasse,
      anschlussnutzerAbweichtEndkunde: nutzungsverhaeltnis.rolle !== 'eigentuemer_selbstnutzer',
      ...(zugriffszweck !== undefined ? { zugriffszweck } : {}),
    });
  }

  private async resolveViaSystem(
    systemId: string,
    entityTyp: NonNullable<ResourceAttributes['entityTyp']>,
    zugriffszweck: ZugriffszweckAttribut | undefined,
  ): Promise<ResourceAttributes | undefined> {
    const system = await this.systemRepository.findById(systemId);
    if (system === undefined) {
      return undefined;
    }

    const endkunde = await this.endkundeRepository.findById(system.endkundeId);
    if (endkunde === undefined) {
      return undefined;
    }

    // Finding A — GENAU das im ADR beschriebene Abfragemuster (system_id +
    // gueltig_bis IS NULL, KEIN LIMIT 1).
    const nutzungen = await this.nutzungsverhaeltnisRepository.findAktuelleFuerSystem(systemId);
    const reduktion = this.reduziereNutzungen(nutzungen);

    return this.buildResourceAttributes({
      entityTyp,
      verarbeitungsStatus: endkunde.verarbeitungsStatus,
      vonWissAuswertungAusgenommen: endkunde.vonWissAuswertungAusgenommen,
      ...reduktion,
      ...(zugriffszweck !== undefined ? { zugriffszweck } : {}),
    });
  }

  private async resolveViaZaehler(
    zaehlerId: string,
    zugriffszweck: ZugriffszweckAttribut | undefined,
  ): Promise<ResourceAttributes | undefined> {
    const zaehler = await this.zaehlerRepository.findById(zaehlerId);
    if (zaehler === undefined) {
      return undefined;
    }

    const attrs = await this.resolveViaSystem(zaehler.systemId, 'zaehler', zugriffszweck);
    if (attrs === undefined) {
      return undefined;
    }

    // ADR-0005 §26.4 — `create:geraet_zuordnung` haengt am selben Pfad-
    // Parameter `:zaehlerId` (POST .../zaehler/{zaehlerId}/geraet-
    // zuordnungen) wie die bestehenden `zaehler`/`messkanal`-Aktionen;
    // `geraetZuordnung.zaehlerId` ist fuer diese anderen Aktionen ein
    // harmloses, ungenutztes Zusatz-Attribut (kein Verhaltensunterschied).
    return { ...attrs, geraetZuordnung: { zaehlerId } };
  }

  private async resolveViaMesskanal(
    messkanalId: string,
    zugriffszweck: ZugriffszweckAttribut | undefined,
  ): Promise<ResourceAttributes | undefined> {
    const messkanal = await this.messkanalRepository.findById(messkanalId);
    if (messkanal === undefined) {
      return undefined;
    }

    const zaehler = await this.zaehlerRepository.findById(messkanal.zaehlerId);
    if (zaehler === undefined) {
      return undefined;
    }

    return this.resolveViaSystem(zaehler.systemId, 'messkanal', zugriffszweck);
  }

  private reduziereNutzungen(nutzungen: readonly Nutzungsverhaeltnis[]): NutzungReduktion {
    if (nutzungen.length === 0) {
      return {};
    }

    const datenklasse: Datenklasse = nutzungen.some((n) => n.datenklasse === 'detailverbrauch')
      ? 'detailverbrauch'
      : 'abrechnungsminimum';
    const anschlussnutzerAbweichtEndkunde = nutzungen.some((n) => n.rolle !== 'eigentuemer_selbstnutzer');

    return { datenklasse, anschlussnutzerAbweichtEndkunde };
  }

  private buildResourceAttributes(input: {
    readonly entityTyp: NonNullable<ResourceAttributes['entityTyp']>;
    readonly verarbeitungsStatus: NonNullable<ResourceAttributes['verarbeitungsStatus']>;
    readonly vonWissAuswertungAusgenommen: boolean;
    readonly datenklasse?: Datenklasse;
    readonly anschlussnutzerAbweichtEndkunde?: boolean;
    readonly zugriffszweck?: ZugriffszweckAttribut;
  }): ResourceAttributes {
    return {
      entityTyp: input.entityTyp,
      verarbeitungsStatus: input.verarbeitungsStatus,
      vonWissAuswertungAusgenommen: input.vonWissAuswertungAusgenommen,
      ...(input.datenklasse !== undefined ? { datenklasse: input.datenklasse } : {}),
      ...(input.anschlussnutzerAbweichtEndkunde !== undefined
        ? { anschlussnutzerAbweichtEndkunde: input.anschlussnutzerAbweichtEndkunde }
        : {}),
      ...(input.zugriffszweck !== undefined ? { zugriffszweck: input.zugriffszweck } : {}),
    };
  }
}
