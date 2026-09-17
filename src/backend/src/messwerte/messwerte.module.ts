import { Module } from '@nestjs/common';
import { EnergyStandortRepository } from '../stammdaten/persistence/energy/energy-standort.repository';
import { EnergyMesskanalRepository } from '../stammdaten/persistence/energy/energy-messkanal.repository';
import { MeasurementMesswertRepository } from './persistence/measurement-messwert.repository';
import { VerbrauchAggregatController } from './verbrauch-aggregat.controller';
import { VerbrauchAggregatService } from './verbrauch-aggregat.service';
import { MesskanalZeitreiheController } from './messkanal-zeitreihe.controller';
import { MesskanalZeitreiheService } from './messkanal-zeitreihe.service';

/**
 * Letztes fehlendes Ausliefer-Stück (Verbrauchs-/Messwert-Endpoint,
 * ADR-0005/-0010): eigener, fachlicher Kontext `measurement` (Messwerte),
 * bewusst NEBEN `StammdatenModule` (nicht darin) — analog zur bereits
 * etablierten Trennung `stammdaten`/`ingest-worker` (eigene
 * Top-Level-Verzeichnisse je fachlichem Kontext, Projektleitlinien
 * "Modul-Struktur ... eins pro fachlichem Kontext").
 *
 * `EnergyStandortRepository`/`EnergyMesskanalRepository` werden HIER ERNEUT
 * als Provider deklariert (zweite Instanz neben der in `StammdatenModule`) —
 * bewusst KEIN Import von `StammdatenModule` (das würde eine Rückwärts-
 * abhängigkeit `messwerte -> stammdaten` samt dessen gesamter
 * Provider-Oberfläche erzeugen). Beide Repositories sind zustandslose,
 * reine `TransactionHost`-Wrapper (derselbe globale `ClsModule`/`DataSource`-
 * Singleton, `PersistenceModule`) — eine zweite Instanziierung ist
 * folgenlos, exakt das bereits etablierte Muster mehrfach instanziierter
 * Energy-Repositories innerhalb von `stammdaten/**` selbst.
 *
 * ABAC-Verdrahtung (`read:verbrauch_aggregat`/`read:verbrauch_detail`)
 * braucht KEINE Modul-lokale Ergänzung: `CompositeResourceAttributesProvider`
 * (in `AppModule` an `RESOURCE_ATTRIBUTES_PROVIDER` gebunden) dispatcht
 * bereits rein über `@Fachaktion(...)` + Pfad-Parameter
 * (`standortId`/`messkanalId`) an den bestehenden
 * `StammdatenResourceAttributesProvider` — unabhängig davon, in welchem
 * Modul die aufrufende Route liegt (ADR-0008 §15 A5).
 */
@Module({
  controllers: [VerbrauchAggregatController, MesskanalZeitreiheController],
  providers: [
    EnergyStandortRepository,
    EnergyMesskanalRepository,
    MeasurementMesswertRepository,
    VerbrauchAggregatService,
    MesskanalZeitreiheService,
  ],
})
export class MesswerteModule {}
