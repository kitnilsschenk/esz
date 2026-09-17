import { Module } from '@nestjs/common';
import { PersistenceModule } from '../common/persistence/persistence.module';
import { AuditModule } from '../audit/audit.module';
import { StammdatenModule } from '../stammdaten/stammdaten.module';
import { IngestPersistenceModule } from '../ingest-worker/persistence/ingest-persistence.module';
import { ImportStammdatenRepository } from './persistence/import-stammdaten.repository';
import { ImportMesswertRepository } from './persistence/import-messwert.repository';

/**
 * Der Modulschnitt des Messreihen-Imports (`import-main.ts`).
 *
 * **Bewusst NICHT `AppModule`** — dieselbe Begründung wie beim
 * Retention-Runner und beim Demo-Generator: Ein Ladelauf braucht Datenbank,
 * CLS-Transaktion, Audit und die Stammdaten-Dienste. Er braucht keinen
 * HTTP-Server und keine Keycloak-Konfiguration, und ein fehlender Keycloak
 * darf einen Import nicht verhindern.
 *
 * **Warum ZWEI Datenbank-Verbindungen.** `PersistenceModule` bringt die
 * Anwendungsverbindung für die Stammdaten mit, `IngestPersistenceModule` den
 * least-privilege Pool des Ingest-Workers für die Messwerte — denn
 * `measurement.messwert` ist für `edms_app` nicht beschreibbar (V0013). Das
 * ist keine Umständlichkeit, sondern genau die Rollentrennung, die verhindert,
 * dass die Fach-API Messwerte verändern kann. Der Import ordnet sich ihr
 * unter, statt sich eine Ausnahme zu verschaffen.
 *
 * Dass beides nebeneinander läuft, geht ohne Reibung: Der Ingest-Pool ist ein
 * schlichter `pg.Pool` und hängt nicht am Transaktionskontext der Anwendung.
 * Die Folge ist bewusst in Kauf genommen — Stammdaten und Messwerte liegen
 * nicht in EINER Transaktion. Für einen Import ist Wiederaufnehmbarkeit
 * ohnehin das wichtigere Gut als Alles-oder-nichts: Er ist idempotent, ein
 * abgebrochener Lauf wird einfach wiederholt.
 */
@Module({
  imports: [PersistenceModule, AuditModule, StammdatenModule, IngestPersistenceModule],
  providers: [ImportStammdatenRepository, ImportMesswertRepository],
  exports: [ImportStammdatenRepository, ImportMesswertRepository],
})
export class ImportRunnerModule {}
