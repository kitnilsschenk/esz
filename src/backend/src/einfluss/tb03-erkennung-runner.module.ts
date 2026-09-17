import { Module } from '@nestjs/common';
import { PersistenceModule } from '../common/persistence/persistence.module';
import { SyntheticOnlyConfigService } from '../stammdaten/synthetic/synthetic-only.config';
import { EinflussErkennungPgModule } from './persistence/einfluss-erkennung-pg.module';
import { Tb03BezugRepository } from './persistence/tb03-bezug.repository';
import { Tb03EinflussRepository } from './persistence/tb03-einfluss.repository';
import { Tb03BefundRepository } from './persistence/tb03-befund.repository';
import { Tb03ErkennungService } from './tb03-erkennung.service';

/**
 * Der Modulschnitt des TB-03-Erkennungslaufs (`tb03-erkennung-main.ts`).
 *
 * **Bewusst NICHT `AppModule`** — derselbe Zuschnitt wie beim Retention-
 * Runner und beim Ingest-Worker: Datenbank ja, HTTP-Server und Keycloak
 * nein. Ein Erkennungslauf, der ohne erreichbaren Keycloak nicht startet,
 * hätte eine Abhängigkeit, die fachlich nicht besteht.
 *
 * **Zwei Verbindungen, bewusst getrennt sichtbar** (A17/A20):
 * `PersistenceModule` bringt die App-Verbindung für `energy.*` mit,
 * `EinflussErkennungPgModule` den eigenen, least-privilege Pool für
 * `einfluss.*`. Dass beide hier nebeneinander stehen, ist der Ort, an dem
 * die Trennung im Code sichtbar wird.
 *
 * **Kein `AuditModule`** — und das ist keine Auslassung: Die Audit-
 * Ereignisse dieses Laufs müssen auf der Erkennungs-Verbindung entstehen,
 * damit sie in derselben Transaktion wie der Befund liegen (A19b). Sie
 * laufen deshalb über `Tb03BefundRepository`, nicht über `AuditService`.
 */
@Module({
  imports: [PersistenceModule, EinflussErkennungPgModule],
  providers: [
    Tb03BezugRepository,
    Tb03EinflussRepository,
    Tb03BefundRepository,
    Tb03ErkennungService,
    SyntheticOnlyConfigService,
  ],
  exports: [Tb03ErkennungService],
})
export class Tb03ErkennungRunnerModule {}
