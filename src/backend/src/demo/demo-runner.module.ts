import { Module } from '@nestjs/common';
import { PersistenceModule } from '../common/persistence/persistence.module';
import { AuditModule } from '../audit/audit.module';
import { StammdatenModule } from '../stammdaten/stammdaten.module';
import { BerechnungModule } from '../berechnung/berechnung.module';
import { NachweisModule } from '../nachweis/nachweis.module';
import { RetentionModule } from '../retention/retention.module';
import { GeraeteerkennungModule } from '../geraeteerkennung/geraeteerkennung.module';
import { NutzerinfoModule } from '../nutzerinfo/nutzerinfo.module';

/**
 * Der Modulschnitt des Demo-Datengenerators (`demo-main.ts`).
 *
 * **Bewusst NICHT `AppModule`**, aus demselben Grund wie beim
 * Retention-Runner: Der Generator braucht Datenbank, CLS-Transaktion und die
 * Fachdienste — er braucht keinen HTTP-Server, keine Keycloak-Konfiguration
 * und keine Auth-Kette. Baute er auf `AppModule`, verlangte ein Testlauf
 * gültige OIDC-Umgebungsvariablen, und ein fehlender Keycloak brächte ihn zum
 * Stehen — eine Abhängigkeit, die fachlich nicht besteht.
 *
 * **Er ruft die ECHTEN Fachdienste**, nicht SQL. Ein Generator, der die
 * Tabellen direkt füllt, prüft nichts: Er würde auch dann laufen, wenn die
 * Anlege-Wege des Systems kaputt sind — und genau die soll er vorführen.
 * Vorbedingungen, Constraints und Berechnungen greifen damit unverändert.
 */
@Module({
  imports: [
    PersistenceModule,
    AuditModule,
    StammdatenModule,
    BerechnungModule,
    NachweisModule,
    RetentionModule,
    GeraeteerkennungModule,
    NutzerinfoModule,
  ],
})
export class DemoRunnerModule {}
