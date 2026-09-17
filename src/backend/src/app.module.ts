import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { HealthModule } from './health/health.module';
import { PersistenceModule } from './common/persistence/persistence.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { TransactionInterceptor } from './common/interceptors/transaction.interceptor';
import { AuditActionInterceptor } from './common/interceptors/audit-action.interceptor';
import { PolicyInterceptor } from './common/interceptors/policy.interceptor';
import { SecurityLoggerService } from './common/logging/security-logger.service';
import { RESOURCE_ATTRIBUTES_PROVIDER } from './auth/policy/policy.constants';
import { StammdatenModule } from './stammdaten/stammdaten.module';
import { MesswerteModule } from './messwerte/messwerte.module';
import { BerechnungModule } from './berechnung/berechnung.module';
import { ConsentModule } from './consent/consent.module';
import { RetentionModule } from './retention/retention.module';
import { NutzerinfoModule } from './nutzerinfo/nutzerinfo.module';
import { PortalModule } from './portal/portal.module';
import { GeraeteerkennungModule } from './geraeteerkennung/geraeteerkennung.module';
import { NachweisModule } from './nachweis/nachweis.module';
import { CompositeResourceAttributesProvider } from './stammdaten/policy/composite-resource-attributes.provider';

/**
 * Root-Modul (ADR-0002 Teil B, Phase 4 AP-BCD — AuthN/AuthZ + Audit-Emitter
 * + BFF). Der `DenyByDefaultGuard`-Stub aus ADR-0001 §10.7 ist VOLLSTÄNDIG
 * ERSETZT durch `JwtAuthGuard` (`@Public()`/`IS_PUBLIC_KEY` bleiben
 * unverändert respektiert — ADR-0002 §17 dokumentiert den Guard-Swap als
 * folgenlosen Breaking Change: bisher existierten nur `/health`+
 * `/health/ready`, beide `@Public()`).
 *
 * KRITISCHE Interceptor-/Guard-Registrierungs-Reihenfolge (ADR-0002 §15,
 * Konflikt A + B) — Reihenfolge in `providers` unten entspricht der
 * TATSÄCHLICHEN Ausführungsreihenfolge außen->innen (Guards laufen IMMER
 * vollständig vor JEDEM Interceptor, NestJS-Lifecycle):
 *
 *   1. `JwtAuthGuard`            (APP_GUARD) — AuthN, läuft vor allem
 *                                  anderen; 401 bei fehlendem/ungültigem
 *                                  Token, sonst `securityContext` gesetzt.
 *   2. `TransactionInterceptor`  (APP_INTERCEPTOR, äußerste Ebene) —
 *                                  öffnet die Request-Transaktion
 *                                  (`Propagation.Required`, `nestjs-cls`).
 *   3. `AuditActionInterceptor`  (APP_INTERCEPTOR) — fängt Erfolg/Fehler/
 *                                  Denials der gesamten nachgelagerten Kette
 *                                  ab und schreibt `ok`/`denied`/`error` in
 *                                  den ambienten (äußeren) Tx-Scope.
 *   4. `PolicyInterceptor`       (APP_INTERCEPTOR, innerste Ebene) — RBAC
 *                                  (`@Roles`) + ABAC (PDP), wirft bei
 *                                  Denial `ForbiddenException` — genau DIESE
 *                                  Exception ist für 3. (`AuditActionInterceptor
 *                                  .catchError`) sichtbar (Konflikt A).
 *
 * NICHT vertauschen: würde 3. vor 2. laufen, gäbe es keine Transaktion, in
 * die die Audit-Zeile committen könnte; würde 4. vor 3. laufen (aktuelle
 * Reihenfolge ist korrekt: 3 AUSSEN, 4 INNEN), wäre eine Denial aus 4.
 * unsichtbar für 3. — exakt das Problem, das Konflikt A gelöst hat.
 *
 * ADR-0008 Teil B §15 (D3, A5) — `RESOURCE_ATTRIBUTES_PROVIDER` wird HIER,
 * in der Kompositionswurzel (NICHT im `AuthModule`), vom `AuthModule`-Default
 * (`NullResourceAttributesProvider`, liefert immer `undefined`) auf den
 * `CompositeResourceAttributesProvider` (aus `StammdatenModule`) umgebogen —
 * ein lokaler Provider-Eintrag in `AppModule.providers` hat Vorrang vor dem
 * über `AuthModule` importierten Binding für denselben Token (`useExisting`
 * referenziert die bereits von `StammdatenModule` exportierte Instanz, KEINE
 * zweite Instanziierung). Verhaltensadditiv (§25 Breaking-Changes-Gate):
 * für Nicht-Stammdaten-Routen (kein `@Fachaktion(...)`) liefert der
 * Composite weiterhin `undefined` — identisch zum bisherigen Null-Provider.
 */
@Module({
  imports: [HealthModule, PersistenceModule, AuditModule, AuthModule, StammdatenModule, MesswerteModule, BerechnungModule, NachweisModule, ConsentModule, RetentionModule, NutzerinfoModule, GeraeteerkennungModule, PortalModule],
  providers: [
    SecurityLoggerService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransactionInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditActionInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: PolicyInterceptor,
    },
    {
      provide: RESOURCE_ATTRIBUTES_PROVIDER,
      useExisting: CompositeResourceAttributesProvider,
    },
  ],
})
export class AppModule {}
