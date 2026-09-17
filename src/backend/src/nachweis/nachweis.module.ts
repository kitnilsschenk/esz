import { Art19Controller } from './art19.controller';
import { Art19Service } from './art19.service';
import { Art19PflichtRepository } from './persistence/art19-pflicht.repository';
import { Module } from '@nestjs/common';
import { GeraeteerkennungRepository } from '../geraeteerkennung/persistence/geraeteerkennung.repository';
import { EnergyEndkundeRepository } from '../stammdaten/persistence/energy/energy-endkunde.repository';
import { EnergyMesskonzeptRepository } from '../stammdaten/persistence/energy/energy-messkonzept.repository';
import { SyntheticOnlyConfigService } from '../stammdaten/synthetic/synthetic-only.config';
import { SyntheticOnlyInterceptor } from '../stammdaten/synthetic/synthetic-only.interceptor';
import { AnalyticsVerfahrenRepository } from '../berechnung/persistence/analytics-verfahren.repository';
import { FoerderjahrController } from './foerderjahr.controller';
import { FoerderjahrService } from './foerderjahr.service';
import { PreflightController } from './preflight.controller';
import { PreflightService } from './preflight.service';
import { EinsparlaufController } from './einsparlauf.controller';
import { EinsparlaufService } from './einsparlauf.service';
import { SubstitutionErkennungService } from './substitution-erkennung';
import { NachweisFoerderjahrRepository } from './persistence/nachweis-foerderjahr.repository';
import { NachweisPreflightRepository } from './persistence/nachweis-preflight.repository';
import { NachweisEinsparlaufRepository } from './persistence/nachweis-einsparlauf.repository';
import { AnalyticsLaufLookupRepository } from './persistence/analytics-lauf-lookup.repository';
// STUFE 2 (ADR-0007 Phase 4, Export/Einreichung) — additiv.
import { AnalyticsExportLaufRepository } from './persistence/analytics-export-lauf.repository';
import { NachweisExportPseudonymRepository } from './persistence/nachweis-export-pseudonym.repository';
import { NachweisExportRepository } from './persistence/nachweis-export.repository';
import { NachweisEinreichungRepository } from './persistence/nachweis-einreichung.repository';
import { NachweisExportController } from './export/nachweis-export.controller';
import { NachweisExportService } from './export/nachweis-export.service';
import { EinreichungController } from './einreichung.controller';
import { EinreichungService } from './einreichung.service';

/**
 * ADR-0007 Teil B (Phase 4, Stufe 1) — eigener, fachlicher Top-Level-Kontext
 * `nachweis` (Vollständigkeits-Preflight + Einspar-Lauf), analog `berechnung`
 * (Projektleitlinien „Modul-Struktur ... eins pro fachlichem Kontext"). Bewusst KEIN
 * `StammdatenModule`-Import (Arbeitsauftrag) UND KEIN `BerechnungModule`-
 * Import — genau das bereits etablierte Muster aus `berechnung.module.ts`
 * ("zweite Instanziierung ist folgenlos"): `EnergyEndkundeRepository`/
 * `EnergyMesskonzeptRepository` (`stammdaten/**`, letztere seit ADR-0007
 * O-B3b für `SubstitutionErkennungService`) und `AnalyticsVerfahrenRepository`
 * (`berechnung/**`) sind alle zustandslose `TransactionHost`-Wrapper
 * (derselbe globale `ClsModule`/`DataSource`-Singleton) — eine zweite
 * Provider-Deklaration hier erzeugt KEINE Rückwärtsabhängigkeit `nachweis ->
 * stammdaten|berechnung` (nur die einzelnen Repository-KLASSEN werden
 * importiert, kein Modul-Import).
 *
 * `AuditService` braucht keinen expliziten Modul-Import (`AuditModule` ist
 * `@Global()`) — `PreflightService`/`EinsparlaufService`/`FoerderjahrService`
 * rufen `AuditService.append()` manuell auf (kein `@AuditAction`, s. die
 * jeweiligen Controller-Kommentare).
 *
 * `SyntheticOnlyConfigService`/`SyntheticOnlyInterceptor` (ADR-0008 §22, D10)
 * werden — GENAU wie in `berechnung.module.ts` — HIER ERNEUT als Provider
 * deklariert (zweite Instanz) und auf ALLEN DREI Schreibrouten
 * (`create:foerderjahr`/`create:nachweis_preflight`/`create:einsparlauf`)
 * angewendet: sie setzen `request.synthetic`, das JEDER Service 1:1 in
 * `kontext.synthetic` übernimmt (Pflicht-Tag, A9) — UND `FJ-09`
 * (`PreflightService`) hängt strukturell davon ab (s. dortiger Kommentar:
 * „solange `EDMS_SYNTHETIC_ONLY=true` gilt, ist ein grüner Preflight für
 * `art=foerderjahr_nachweis` unerreichbar — beabsichtigt").
 *
 * STUFE 2 (ADR-0007 Phase 4, Export/Einreichung, `nachweis.export*`/
 * `nachweis.einreichung*`) — JETZT Teil dieses Moduls. Die vier zugehörigen
 * `PolicyAction`s (`create:/read:nachweis_export`, `create:/read:
 * einreichung`) sind in `auth/policy/classify-action.ts` ergänzt (Diff
 * FREIGABEPFLICHTIG, s. finale Antwort dieses Arbeitspakets). `create:
 * nachweis_export`/`create:einreichung` bekommen BEWUSST KEIN
 * `SyntheticOnlyInterceptor` — `synthetic` wird stattdessen vom gebundenen
 * `nachweis.einsparlauf.synthetic` GEERBT (Konsistenz-Argument: ein Export/
 * eine Einreichung kann nicht "weniger synthetisch" sein als ihr
 * Ursprungslauf, s. `NachweisExportService`/`EinreichungService`-Dok).
 * `AnalyticsExportLaufRepository` liest zusätzlich aus `analytics.
 * eingang_klima_tag`/`analytics.klima_tag` — GENAU dieselbe
 * "zweite, zustandslose Instanz"-Begründung wie oben für
 * `AnalyticsVerfahrenRepository`.
 */
@Module({
  controllers: [FoerderjahrController, PreflightController, EinsparlaufController, NachweisExportController, EinreichungController,
    Art19Controller,
  ],
  providers: [
    // TB-05 (V0064): Der Export weist die Geraeteerkennungs-Quote aus und
    // holt sie aus DERSELBEN Abfrage wie Betrieb und Kundendokument.
    // Zweite Deklaration desselben zustandslosen `TransactionHost`-Wrappers
    // — das etablierte Muster (s. `AnalyticsLaufLookupRepository` hier und in
    // `NutzerinfoModule`), kein Import des ganzen Geraeteerkennungs-Moduls.
    GeraeteerkennungRepository,
    EnergyEndkundeRepository,
    EnergyMesskonzeptRepository,
    SyntheticOnlyConfigService,
    SyntheticOnlyInterceptor,
    AnalyticsVerfahrenRepository,

    NachweisFoerderjahrRepository,
    NachweisPreflightRepository,
    NachweisEinsparlaufRepository,
    AnalyticsLaufLookupRepository,

    SubstitutionErkennungService,
    FoerderjahrService,
    PreflightService,
    EinsparlaufService,

    // Stufe 2
    AnalyticsExportLaufRepository,
    NachweisExportPseudonymRepository,
    NachweisExportRepository,
    NachweisEinreichungRepository,
    NachweisExportService,
    EinreichungService,
    Art19Service,
    Art19PflichtRepository,
  ],
})
export class NachweisModule {}
