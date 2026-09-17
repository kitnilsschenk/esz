import { Module } from '@nestjs/common';
import { SyntheticOnlyConfigService } from '../stammdaten/synthetic/synthetic-only.config';
import { SyntheticOnlyInterceptor } from '../stammdaten/synthetic/synthetic-only.interceptor';
import { AnalyticsLaufLookupRepository } from '../nachweis/persistence/analytics-lauf-lookup.repository';
import { PortalConfigService } from '../portal/portal.config';
import { NutzerinformationController } from './nutzerinformation.controller';
import { NutzerinformationService } from './nutzerinformation.service';
import { NutzerinfoRepository } from './persistence/nutzerinfo.repository';
import { NutzerinfoDokumentService } from './dokument/nutzerinfo-dokument.service';
import { GeraeteerkennungRepository } from '../geraeteerkennung/persistence/geraeteerkennung.repository';

/**
 * TB-06 — die monatliche Nutzerinformation. Eigener fachlicher Kontext,
 * analog `nachweis`, `berechnung` und `consent`.
 *
 * **Warum nicht in `nachweis`**, obwohl beide dieselben Zahlen ausweisen: Sie
 * haben verschiedene Adressaten, verschiedene Fristen und verschiedene
 * Rundungsregeln. Der Nachweis geht an die Bewilligungsbehoerde und wendet
 * die Vorzeichen-/Lueckenregel an; die Nutzerinformation geht an den Kunden
 * und zeigt Mehrverbraeuche als das, was sie sind. Zusammengelegt waere die
 * naechste Aenderung an der einen Seite stillschweigend eine an der anderen.
 *
 * **Was sie verbindet, ist die Bindung an denselben Berechnungslauf.**
 * `AnalyticsLaufLookupRepository` wird deshalb hier erneut als Provider
 * deklariert (zustandsloser `TransactionHost`-Wrapper, dasselbe etablierte
 * Muster wie bei den PII-Repositories in `consent`/`nachweis`) — die
 * Kandidaten-Aufloesung selbst (`loeseBindungAuf`) ist eine reine Funktion
 * und wird direkt importiert. Saehe der Kunde eine andere Einsparung als die
 * Behoerde, waere jede Erklaerung dafuer schlechter als der Fehler.
 *
 * `PortalConfigService` (zustandsloser `EDMS_PORTAL_URL`-Leser aus
 * `portal/portal.config.ts`) wird nach demselben Muster erneut deklariert:
 * `NutzerinfoDokumentService` braucht nur die Portal-Adresse fuer den
 * Portal-Hinweis im Kundendokument (TB-06 Opt-out-Erreichbarkeit), nicht die
 * gesamte `PortalModule`-Oberflaeche (Controller, Guards, Sitzungs-/
 * Zugangs-Repositories). Kein Zirkelbezug: `PortalModule` importiert
 * `NutzerinfoModule`, nicht umgekehrt.
 */
@Module({
  controllers: [NutzerinformationController],
  providers: [
    NutzerinformationService,
    NutzerinfoDokumentService,
    NutzerinfoRepository,
    AnalyticsLaufLookupRepository,
    // TB-05 liefert die Gruppen-Aufteilung, die Kap. 6 fuer den Bericht
    // verlangt (zustandsloser `TransactionHost`-Wrapper, dasselbe Muster wie
    // `AnalyticsLaufLookupRepository` oben).
    GeraeteerkennungRepository,
    PortalConfigService,
    SyntheticOnlyConfigService,
    SyntheticOnlyInterceptor,
  ],
  exports: [NutzerinformationService, NutzerinfoDokumentService],
})
export class NutzerinfoModule {}
