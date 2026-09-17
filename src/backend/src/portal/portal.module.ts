import { Module } from '@nestjs/common';
import { CryptoModule } from '../common/crypto/crypto.module';
import { ConsentModule } from '../consent/consent.module';
import { NutzerinfoModule } from '../nutzerinfo/nutzerinfo.module';
import { EnergyEndkundeRepository } from '../stammdaten/persistence/energy/energy-endkunde.repository';
import { SyntheticOnlyConfigService } from '../stammdaten/synthetic/synthetic-only.config';
import { SyntheticOnlyInterceptor } from '../stammdaten/synthetic/synthetic-only.interceptor';
import { PortalCodeIndexService } from './crypto/portal-code-index.service';
import { PortalAuthGuard } from './guards/portal-auth.guard';
import { PortalSitzungRepository } from './persistence/portal-sitzung.repository';
import { PortalZugangRepository } from './persistence/portal-zugang.repository';
import { PortalAnmeldungService } from './portal-anmeldung.service';
import { PortalAuthController } from './portal-auth.controller';
import { PortalZugangController } from './portal-zugang.controller';
import { PortalZugangService } from './portal-zugang.service';
import { PortalKundeController } from './portal-kunde.controller';
import { PortalKundeService } from './portal-kunde.service';
import { PortalConfigService } from './portal.config';

/**
 * Das Nutzerportal ([Q3] Kap. 6) — eigener fachlicher Kontext, analog
 * `nachweis`, `berechnung`, `consent` und `nutzerinfo`.
 *
 * **Zwei Adressaten, zwei Türen.** `PortalZugangController` ist Betrieb
 * (Rollen, ABAC, Keycloak-Token); `PortalAuthController` ist der Endkunde
 * (Sitzungs-Cookie, `PortalAuthGuard`). Sie liegen im selben Modul, weil sie
 * dieselben zwei Tabellen bedienen — aber sie teilen keine
 * Berechtigungskette, und das ist Absicht.
 *
 * `NutzerinfoModule` und `ConsentModule` werden IMPORTIERT (nicht
 * nachgebaut): Der Kunde soll dieselben Zahlen sehen wie der Betrieb und die
 * Bewilligungsbehoerde, und sein Widerspruch soll dieselbe Zeile schreiben
 * wie ein nachgetragener. Ein eigener Rechenweg im Portal waere die zweite
 * Wahrheit — und die Stelle, an der sie abweicht, waere ausgerechnet die
 * Auskunft an die betroffene Person.
 *
 * `CryptoModule` liefert den `BlindIndexPepperPort`; der
 * `PortalCodeIndexService` leitet daraus per HKDF einen eigenen Schlüssel für
 * den Code-Index ab (Zweck-Trennung, s. dortige Doku) — ein zweites
 * verwaltetes Geheimnis wäre dieselbe Betriebslast für nichts.
 *
 * `EnergyEndkundeRepository`/`SyntheticOnly*` werden HIER erneut deklariert
 * (zustandslose Wrapper bzw. Env-Leser) — das etablierte Muster, das schon
 * `MesswerteModule`, `BerechnungModule` und `NutzerinfoModule` verwenden:
 * kein Import von `StammdatenModule` samt dessen gesamter
 * Provider-Oberfläche.
 */
@Module({
  imports: [CryptoModule, NutzerinfoModule, ConsentModule],
  controllers: [PortalAuthController, PortalKundeController, PortalZugangController],
  providers: [
    PortalZugangService,
    PortalAnmeldungService,
    PortalKundeService,
    PortalZugangRepository,
    PortalSitzungRepository,
    PortalCodeIndexService,
    PortalConfigService,
    PortalAuthGuard,
    EnergyEndkundeRepository,
    SyntheticOnlyConfigService,
    SyntheticOnlyInterceptor,
  ],
  exports: [PortalAnmeldungService, PortalAuthGuard],
})
export class PortalModule {}
