import { Module } from '@nestjs/common';
import { CryptoModule } from '../common/crypto/crypto.module';
import { IdentityEndkundePiiRepository } from '../stammdaten/persistence/identity/identity-endkunde-pii.repository';
import { IdentityAnschlussnutzerPiiRepository } from '../stammdaten/persistence/identity/identity-anschlussnutzer-pii.repository';
import { SyntheticOnlyConfigService } from '../stammdaten/synthetic/synthetic-only.config';
import { SyntheticOnlyInterceptor } from '../stammdaten/synthetic/synthetic-only.interceptor';
import { EinwilligungController } from './einwilligung.controller';
import { EinwilligungService } from './einwilligung.service';
import { ConsentRepository } from './persistence/consent.repository';
import { WiderspruchService } from './widerspruch.service';
import { WiderspruchRepository } from './persistence/widerspruch.repository';
import { WiderspruchBelegRepository } from './persistence/widerspruch-beleg.repository';
import { IdentitySubjektSchluesselRepository } from '../stammdaten/persistence/identity/identity-subjekt-schluessel.repository';

/**
 * ADR-0012 B1 — eigener fachlicher Top-Level-Kontext `consent`, analog
 * `nachweis` und `berechnung` (Projektleitlinien: „ein Modul pro fachlichem
 * Kontext").
 *
 * Bewusst KEIN `StammdatenModule`-Import, sondern nur die beiden
 * PII-Repository-KLASSEN — dasselbe etablierte Muster wie in
 * `nachweis.module.ts`: Es sind zustandslose `TransactionHost`-Wrapper auf
 * demselben globalen `ClsModule`/`DataSource`-Singleton, eine zweite
 * Provider-Deklaration ist folgenlos und erzeugt KEINE Rueckwaertsabhaengigkeit
 * `consent -> stammdaten`.
 *
 * `SyntheticOnlyConfigService`/`SyntheticOnlyInterceptor` ebenfalls erneut
 * deklariert (zweite Instanz, wie in `berechnung`/`nachweis`): Sie setzen
 * `request.synthetic`, das jede Schreibroute 1:1 in `kontext.synthetic`
 * uebernimmt (Pflicht-Tag).
 *
 * `AuditService` braucht keinen Import — `AuditModule` ist `@Global()`, und
 * die Routen nutzen den `@AuditAction`-Decorator.
 */
@Module({
  // `CryptoModule` seit dem digitalen Opt-out (V0069): Der Beleg einer
  // digital abgegebenen Erklaerung traegt die IP der erklaerenden Person, und
  // die liegt feldverschluesselt unter dem Subjekt-Schluessel — dieselbe
  // Kette wie bei den Stammdaten-PII, damit ein Krypto-Shred (ADR-0009) auch
  // die Belege in einem Zug unlesbar macht.
  imports: [CryptoModule],
  controllers: [EinwilligungController],
  providers: [
    EinwilligungService,
    // Der Widerspruch teilt den Controller mit der Einwilligung, nicht den
    // Dienst: Beides sind Erklaerungen derselben Person zu demselben
    // Zweck-Katalog, aber die eine begruendet eine Verarbeitung und die
    // andere beendet sie. Zwei Dienste, eine Oberflaeche.
    WiderspruchService,
    ConsentRepository,
    WiderspruchRepository,
    WiderspruchBelegRepository,
    IdentitySubjektSchluesselRepository,
    IdentityEndkundePiiRepository,
    IdentityAnschlussnutzerPiiRepository,
    SyntheticOnlyConfigService,
    SyntheticOnlyInterceptor,
  ],
  exports: [EinwilligungService, WiderspruchService],
})
export class ConsentModule {}
