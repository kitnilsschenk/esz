import { Module } from '@nestjs/common';
import { EnergyEndkundeRepository } from '../stammdaten/persistence/energy/energy-endkunde.repository';
import { SyntheticOnlyConfigService } from '../stammdaten/synthetic/synthetic-only.config';
import { SyntheticOnlyInterceptor } from '../stammdaten/synthetic/synthetic-only.interceptor';
import { BerechnungslaufController } from './berechnungslauf.controller';
import { BerechnungslaufUnterEndkundeController } from './berechnungslauf-unter-endkunde.controller';
import { BerechnungslaufService } from './berechnungslauf.service';
import { ParametervorschlagController } from './parametervorschlag.controller';
import { ParametervorschlagService } from './parametervorschlag.service';
import { GoldenVectorBootstrapService } from './golden-vector-bootstrap.service';
import { MvetLookupRepository } from './persistence/mvet-lookup.repository';
import { AnalyticsBaselinePeriodeRepository } from './persistence/analytics-baseline-periode.repository';
import { AnalyticsKlimaTagRepository } from './persistence/analytics-klima-tag.repository';
import { AnalyticsMesswertMonatRepository } from './persistence/analytics-messwert-monat.repository';
import { AnalyticsEingangSnapshotRepository } from './persistence/analytics-eingang-snapshot.repository';
import { EinflussIntervallLeseRepository } from './persistence/einfluss-intervall-lese.repository';
import { AnalyticsVerfahrenRepository } from './persistence/analytics-verfahren.repository';
import { AnalyticsBerechnungslaufRepository } from './persistence/analytics-berechnungslauf.repository';
import { KLIMA_QUELLE_PORT } from './klima/klima-quelle.port';
import type { KlimaQuellePort } from './klima/klima-quelle.port';
import { KlimaQuelleConfigService } from './klima/klima-quelle.config';
import { SyntheticKlimaQuelleAdapter } from './klima/synthetic-klima-quelle.adapter';
import { DwdKlimaQuelleAdapter } from './klima/dwd/dwd-klima-quelle.adapter';

/**
 * ADR-0006 Teil B (Phase 4) — eigener, fachlicher Top-Level-Kontext
 * `berechnung` (Baseline & Witterungsbereinigung), bewusst NEBEN
 * `StammdatenModule` (nicht darin), analog `MesswerteModule`
 * (Projektleitlinien "Modul-Struktur ... eins pro fachlichem Kontext").
 *
 * `EnergyEndkundeRepository`/`SyntheticOnlyConfigService`/
 * `SyntheticOnlyInterceptor` werden HIER ERNEUT als Provider deklariert
 * (zweite Instanz neben `StammdatenModule`) — exakt das in
 * `messwerte.module.ts` dokumentierte, bereits etablierte Muster:
 * "bewusst KEIN Import von `StammdatenModule`" (keine Rückwärtsabhängigkeit
 * `berechnung -> stammdaten` samt dessen gesamter Provider-Oberfläche),
 * "zweite Instanziierung ist folgenlos" — `EnergyEndkundeRepository` ist ein
 * zustandsloser `TransactionHost`-Wrapper (derselbe globale
 * `ClsModule`/`DataSource`-Singleton), `SyntheticOnlyConfigService` liest
 * ausschließlich Env-Variablen (ihr Startup-Self-Check läuft ein zweites
 * Mal, mit identischem Ergebnis — kein Seiteneffekt außerhalb ihrer eigenen
 * Instanz).
 *
 * `AuditService` braucht KEINEN expliziten Modul-Import — `AuditModule` ist
 * `@Global()` (bereits von `AppModule` importiert) und damit überall
 * injizierbar, exakt das bestehende Muster in `ShredAntragService`
 * (`stammdaten/shred-antrag/shred-antrag.service.ts`, ebenfalls ohne
 * `AuditModule`-Import in seinem Modul). `BerechnungslaufService` ruft
 * `AuditService.append()` manuell auf (kein `@AuditAction`, s. Controller-Doc).
 *
 * `KLIMA_QUELLE_PORT` wird HIER zur Startzeit an EINEN der beiden Adapter
 * gebunden, entschieden von `KlimaQuelleConfigService` (`EDMS_KLIMA_QUELLE`,
 * Default `synthetic`): `SyntheticKlimaQuelleAdapter` für Dev/Test/CI,
 * `DwdKlimaQuelleAdapter` für den realen CDC-Abruf. `BerechnungslaufService`
 * bleibt davon unberührt — er kennt nur den Port (ADR-0006 D4).
 *
 * Die Entscheidung fällt EINMAL beim Hochfahren, nicht je Anfrage. Ein
 * Umschalten zur Laufzeit hieße, dass zwei Läufe desselben Zeitraums aus
 * verschiedenen Quellen stammen könnten, ohne dass es jemandem auffällt —
 * mit einem Neustart als Zäsur ist im Log und in `analytics.klima_tag.quelle`
 * ablesbar, ab wann welche Quelle galt.
 *
 * `GoldenVectorBootstrapService` als Provider genügt für den
 * `OnModuleInit`-Fail-closed-Check (Priorität 6) — KEIN eigener Controller.
 */
@Module({
  controllers: [BerechnungslaufController, BerechnungslaufUnterEndkundeController, ParametervorschlagController],
  providers: [
    EnergyEndkundeRepository,
    SyntheticOnlyConfigService,
    SyntheticOnlyInterceptor,

    MvetLookupRepository,
    AnalyticsBaselinePeriodeRepository,
    AnalyticsKlimaTagRepository,
    AnalyticsMesswertMonatRepository,
    AnalyticsEingangSnapshotRepository,
    EinflussIntervallLeseRepository,
    AnalyticsVerfahrenRepository,
    AnalyticsBerechnungslaufRepository,

    KlimaQuelleConfigService,
    SyntheticKlimaQuelleAdapter,
    DwdKlimaQuelleAdapter,
    {
      provide: KLIMA_QUELLE_PORT,
      inject: [KlimaQuelleConfigService, SyntheticKlimaQuelleAdapter, DwdKlimaQuelleAdapter],
      useFactory: (
        config: KlimaQuelleConfigService,
        synthetisch: SyntheticKlimaQuelleAdapter,
        dwd: DwdKlimaQuelleAdapter,
      ): KlimaQuellePort => (config.quelle === 'dwd' ? dwd : synthetisch),
    },

    BerechnungslaufService,
    ParametervorschlagService,
    GoldenVectorBootstrapService,
  ],
})
export class BerechnungModule {}
