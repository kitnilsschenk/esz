import { Module } from '@nestjs/common';
import { CryptoModule } from '../common/crypto/crypto.module';
import { KryptoShreddingService } from './crypto/krypto-shredding.service';
import { DeviceKryptoShreddingService } from './crypto/device-krypto-shredding.service';
import { PiiProjektionsPolicy } from './pii/pii-projektions.policy';
import { SyntheticOnlyConfigService } from './synthetic/synthetic-only.config';
import { IngestFreigabeRepository } from './synthetic/ingest-freigabe.repository';
import { IngestFreigabeBootstrapService } from './synthetic/ingest-freigabe-bootstrap.service';
import { SyntheticOnlyInterceptor } from './synthetic/synthetic-only.interceptor';
import { StammdatenResourceAttributesProvider } from './policy/stammdaten-resource-attributes.provider';
import { CompositeResourceAttributesProvider } from './policy/composite-resource-attributes.provider';

import { EnergyEndkundeRepository } from './persistence/energy/energy-endkunde.repository';
import { EnergySystemRepository } from './persistence/energy/energy-system.repository';
import { EnergyZaehlerRepository } from './persistence/energy/energy-zaehler.repository';
import { EnergyMesskanalRepository } from './persistence/energy/energy-messkanal.repository';
import { EnergyMesskonzeptRepository } from './persistence/energy/energy-messkonzept.repository';
import { EnergyAnschlussnutzerRepository } from './persistence/energy/energy-anschlussnutzer.repository';
import { EnergyEinschraenkungUnterrichtungRepository } from './persistence/energy/energy-einschraenkung-unterrichtung.repository';
import { EnergyEinschraenkungFristRepository } from './persistence/energy/energy-einschraenkung-frist.repository';
import { EinschraenkungFristService } from './monitoring/einschraenkung-frist.service';
import { EinschraenkungFristController } from './monitoring/einschraenkung-frist.controller';
import { ErhebungsEntscheidungService } from './monitoring/erhebungs-entscheidung.service';
import { ErhebungsEntscheidungController } from './monitoring/erhebungs-entscheidung.controller';
import { EnergyNutzungsverhaeltnisRepository } from './persistence/energy/energy-nutzungsverhaeltnis.repository';
import { EnergyMonitoringRepository } from './persistence/energy/energy-monitoring.repository';
import { EnergyEndkundeShredAntragRepository } from './persistence/energy/energy-endkunde-shred-antrag.repository';
import { EnergyStandortRepository } from './persistence/energy/energy-standort.repository';
import { EnergyZaehlerStandortRepository } from './persistence/energy/energy-zaehler-standort.repository';
import { IngestFreshnessRepository } from './persistence/ingest/ingest-freshness.repository';
import { IdentityEndkundePiiRepository } from './persistence/identity/identity-endkunde-pii.repository';
import { IdentityAnschlussnutzerPiiRepository } from './persistence/identity/identity-anschlussnutzer-pii.repository';
import { IdentitySubjektSchluesselRepository } from './persistence/identity/identity-subjekt-schluessel.repository';
import { IdentityStandortPiiRepository } from './persistence/identity/identity-standort-pii.repository';
import { DeviceSchluesselRepository } from './persistence/device/device-schluessel.repository';
import { DeviceGeraetZuordnungRepository } from './persistence/device/device-geraet-zuordnung.repository';
import { GeraetReverseQuotaRepository } from './persistence/audit/geraet-reverse-quota.repository';
// ADR-0006 Teil B (B8/B10, Einflussgrößen) — `einfluss.*` (V0020), eigener Namensraum.
import { EinflussKatalogRepository } from './persistence/einfluss/einfluss-katalog.repository';
import { EinflussIntervallRepository } from './persistence/einfluss/einfluss-intervall.repository';
import { EinflussBefundRepository } from './persistence/einfluss/einfluss-befund.repository';
// ADR-0006 — s. `StammdatenResourceAttributesProvider`-Klassen-Dok
// "Provider-Scoping (ADR-0006)": zweite, zustandslose Instanz (analog
// `EnergyStandortRepository`/`EnergyMesskanalRepository` in
// `messwerte.module.ts`), KEIN `BerechnungModule`-Import.
import { AnalyticsBerechnungslaufRepository } from '../berechnung/persistence/analytics-berechnungslauf.repository';
import { NachweisBestandRepository } from './persistence/nachweis-bestand.repository';
// ADR-0007 Teil B (B10) — s. `StammdatenResourceAttributesProvider`-Klassen-
// Dok "Provider-Scoping (ADR-0007)": zweite, zustandslose Instanz, KEIN
// `NachweisModule`-Import (GENAU ANALOG der `AnalyticsBerechnungslaufRepository`-
// Zeile oben). NICHT zu verwechseln mit `NachweisBestandRepository`
// (unverwandt, s. dortiger Import — anderer Namensraum, anderer Zweck).
import { NachweisPreflightRepository } from '../nachweis/persistence/nachweis-preflight.repository';
import { NachweisEinsparlaufRepository } from '../nachweis/persistence/nachweis-einsparlauf.repository';
// ADR-0007 Teil B (B10) STUFE 2 — GENAU ANALOG der beiden Zeilen oben.
import { NachweisExportRepository } from '../nachweis/persistence/nachweis-export.repository';
import { NachweisEinreichungRepository } from '../nachweis/persistence/nachweis-einreichung.repository';

import { EndkundeController } from './endkunde/endkunde.controller';
import { EndkundeService } from './endkunde/endkunde.service';
import { EndkundeLabelService } from './endkunde/endkunde-label.service';
import { SystemController } from './system/system.controller';
import { SystemService } from './system/system.service';
import { ZaehlerController } from './zaehler/zaehler.controller';
import { ZaehlerService } from './zaehler/zaehler.service';
import { MesskanalController } from './messkanal/messkanal.controller';
import { MesskanalUnterZaehlerController } from './messkanal/messkanal-unter-zaehler.controller';
import { MesskanalService } from './messkanal/messkanal.service';
import { MesskonzeptController } from './messkonzept/messkonzept.controller';
import { MesskonzeptService } from './messkonzept/messkonzept.service';
import { SystemgrenzeService } from './messkonzept/systemgrenze.service';
import { SystemgrenzeController } from './messkonzept/systemgrenze.controller';
import { EnergyMvetSystemRepository } from './persistence/energy/energy-mvet-system.repository';
import { BaselinePeriodeService } from './messkonzept/baseline-periode.service';
import { BaselinePeriodeController } from './messkonzept/baseline-periode.controller';
import { EnergyBaselinePeriodeRepository } from './persistence/energy/energy-baseline-periode.repository';
import { AnschlussnutzerController } from './anschlussnutzer/anschlussnutzer.controller';
import { AnschlussnutzerService } from './anschlussnutzer/anschlussnutzer.service';
import { NutzungsverhaeltnisController } from './nutzungsverhaeltnis/nutzungsverhaeltnis.controller';
import { NutzungsverhaeltnisService } from './nutzungsverhaeltnis/nutzungsverhaeltnis.service';
import { MonitoringController } from './monitoring/monitoring.controller';
import { MonitoringService } from './monitoring/monitoring.service';
import { AusfallController } from './monitoring/ausfall.controller';
import { IngestBetriebController } from './monitoring/ingest-betrieb.controller';
import { HerkunftMappingController } from './monitoring/herkunft-mapping.controller';
import { GeraetetypKatalogController } from './zaehler/geraetetyp-katalog.controller';
import { DECODER_REGISTRY_PROVIDER } from '../ingest-worker/decoder/decoder-registry.provider';
import { IngestBetriebService } from './monitoring/ingest-betrieb.service';
import { HerkunftMappingService } from './monitoring/herkunft-mapping.service';
import { IngestQuelleController } from './monitoring/ingest-quelle.controller';
import { IngestQuelleService } from './monitoring/ingest-quelle.service';
import { IngestQuelleRepository } from './persistence/ingest/ingest-quelle.repository';
import { IngestQuelleSchluesselRepository } from './persistence/ingest/ingest-quelle-schluessel.repository';
import { IngestBetriebRepository } from './persistence/ingest/ingest-betrieb.repository';
import { HerkunftMappingRepository } from './persistence/ingest/herkunft-mapping.repository';
import { IngestFreshnessService } from './monitoring/ingest-freshness.service';
import { ZaehlerFreshnessController } from './zaehler/zaehler-freshness.controller';
import { ShredAntragController } from './shred-antrag/shred-antrag.controller';
import { ShredAntragService } from './shred-antrag/shred-antrag.service';
import { GeraetZuordnungUnterZaehlerController } from './geraet-zuordnung/geraet-zuordnung-unter-zaehler.controller';
import { DeviceGeraetZuordnungController } from './geraet-zuordnung/device-geraet-zuordnung.controller';
import { DeviceProvisioningService } from './geraet-zuordnung/device-provisioning.service';
import { DeviceReverseAufloesungService } from './geraet-zuordnung/device-reverse-aufloesung.service';
import { GERAET_REVERSE_ALERT_PORT } from './geraet-zuordnung/geraet-reverse-alert.port';
import { LogGeraetReverseAlertAdapter } from './geraet-zuordnung/log-geraet-reverse-alert.adapter';
import { StandortUnterEndkundeController } from './standort/standort-unter-endkunde.controller';
import { StandortController } from './standort/standort.controller';
import { ZaehlerVerortungController } from './standort/zaehler-verortung.controller';
import { StandortBaumService } from './standort/standort-baum.service';
import { StandortLabelService } from './standort/standort-label.service';
import { StandortService } from './standort/standort.service';
import { ZaehlerVerortungService } from './standort/zaehler-verortung.service';
import { EinflussgroesseUnterSystemController } from './einflussgroesse/einflussgroesse-unter-system.controller';
import { EinflussgroesseController } from './einflussgroesse/einflussgroesse.controller';
import { EinflussgroesseBefundUnterEndkundeController } from './einflussgroesse/einflussgroesse-befund-unter-endkunde.controller';
import { EinflussgroesseService } from './einflussgroesse/einflussgroesse.service';

/**
 * ADR-0008 Teil B (Phase 4) — `StammdatenModule`: erste Fach-Nutzung der
 * ADR-0002-Maschinerie. Importiert `CryptoModule` (ADR-0005 §18, Modul-
 * Refactoring — die domänen-freien Krypto-Bausteine `KeyManagementPort`/
 * `LocalDevKmsAdapter`/`FieldCipherService` sind nach `common/crypto/`
 * ausgelagert, damit der künftige Ingest-Worker sie ohne Duplikat
 * mitbenutzen kann) und exportiert den `StammdatenResourceAttributesProvider`
 * + `CompositeResourceAttributesProvider` zur Bindung am globalen
 * `RESOURCE_ATTRIBUTES_PROVIDER`-Token — die Bindung SELBST liegt bewusst in
 * `AppModule` (Kompositionswurzel, `backend-lead`-Votum 6, ADR-0008 §15/A5),
 * NICHT hier und NICHT im `AuthModule` (keine cross-cutting→Fach-
 * Rückwärtsabhängigkeit).
 *
 * `KryptoShreddingService` bleibt HIER (nicht in `CryptoModule`): er ist an
 * `IdentitySubjektSchluesselRepository` gekoppelt, also NICHT domänen-frei
 * (ADR-0005 §18, `technical-director`-Bestätigung).
 *
 * `SyntheticOnlyConfigService` wird HIER instanziiert (Provider-Konstruktion
 * = Startup-Self-Check, ADR-0008 §22/D10) — ein fehlendes/inkonsistentes
 * `EDMS_ENV_CLASS`/`EDMS_SYNTHETIC_ONLY` lässt die App-Instanziierung
 * fail-closed scheitern.
 */
@Module({
  imports: [CryptoModule],
  controllers: [
    EndkundeController,
    SystemController,
    ZaehlerController,
    MesskanalUnterZaehlerController,
    MesskanalController,
    MesskonzeptController,
    SystemgrenzeController,
    BaselinePeriodeController,
    AnschlussnutzerController,
    NutzungsverhaeltnisController,
    MonitoringController,
    AusfallController,
    IngestBetriebController,
    HerkunftMappingController,
    IngestQuelleController,
    GeraetetypKatalogController,
    ShredAntragController,
    GeraetZuordnungUnterZaehlerController,
    DeviceGeraetZuordnungController,
    StandortUnterEndkundeController,
    StandortController,
    ZaehlerVerortungController,
    ZaehlerFreshnessController,
    // ADR-0006 Teil B (B8/B10, Einflussgrößen)
    EinflussgroesseUnterSystemController,
    EinflussgroesseController,
    EinflussgroesseBefundUnterEndkundeController,
    EinschraenkungFristController,
    ErhebungsEntscheidungController,
  ],
  providers: [
    // Krypto-Shredding (ADR-0008 §19, D7) — bleibt hier, s. Kommentar oben.
    KryptoShreddingService,
    // Krypto-Shredding, device-Dimension (ADR-0005 §26.5) — analog oben,
    // an `DeviceGeraetZuordnungRepository`/`DeviceSchluesselRepository`
    // gekoppelt, daher ebenfalls NICHT in `CryptoModule`.
    DeviceKryptoShreddingService,

    // PII-Projektion (ADR-0008 §18, D6)
    PiiProjektionsPolicy,

    // Synthetic-only (ADR-0008 §22, D10)
    SyntheticOnlyConfigService,
    SyntheticOnlyInterceptor,

    // Ingest-Gate-Marker (ADR-0008 §22, offener Punkt C3; V0083).
    // Der Startup-Check laeuft NUR bei EDMS_SYNTHETIC_ONLY=false — solange
    // das Gate zu ist, fasst er die Datenbank nicht an.
    IngestFreigabeRepository,
    IngestFreigabeBootstrapService,

    // ABAC-Ressourcen-Attribute (ADR-0008 §15, D3)
    StammdatenResourceAttributesProvider,
    CompositeResourceAttributesProvider,

    // Persistence — energy (query-basiert, kein cross-namespace-JOIN, D8)
    EnergyEndkundeRepository,
    EnergySystemRepository,
    EnergyZaehlerRepository,
    EnergyMesskanalRepository,
    EnergyMesskonzeptRepository,
    EnergyAnschlussnutzerRepository,
    EnergyEinschraenkungUnterrichtungRepository,
    EnergyEinschraenkungFristRepository,
    EinschraenkungFristService,
    ErhebungsEntscheidungService,
    EnergyNutzungsverhaeltnisRepository,
    EnergyMonitoringRepository,
    EnergyEndkundeShredAntragRepository,
    // ADR-0010 (Standort-/Gebaeudestruktur) — energy.standort/energy.zaehler_standort.
    EnergyStandortRepository,
    EnergyZaehlerStandortRepository,
    // ADR-0006 — s. Import-Kommentar oben.
    AnalyticsBerechnungslaufRepository,
    // ADR-0006 P5b/A7 — Nachweis-Bestands-Ausweis für den Shred-Report.
    NachweisBestandRepository,
    // ADR-0007 Teil B (B10) — s. Import-Kommentar oben.
    NachweisPreflightRepository,
    NachweisEinsparlaufRepository,
    // ADR-0007 Teil B (B10) STUFE 2 — s. Import-Kommentar oben.
    NachweisExportRepository,
    NachweisEinreichungRepository,

    // ADR-0005 §27 (D15, TB-04) — ingest.kanal_status/ingest.ausfall_vorgang
    // (bislang NUR geschrieben, jetzt erster Lesepfad, Betriebs-UI-Konzept
    // Backend-Luecke 2).
    IngestFreshnessRepository,

    // Persistence — identity (query-basiert, D8)
    IdentityEndkundePiiRepository,
    IdentityAnschlussnutzerPiiRepository,
    IdentitySubjektSchluesselRepository,
    // ADR-0010 D4 — identity.standort_pii (Standort-DEK == Endkunden-DEK, A2).
    IdentityStandortPiiRepository,

    // Persistence — device (query-basiert, D8, ADR-0005 §26 O4-Kernkorrelation)
    DeviceSchluesselRepository,
    DeviceGeraetZuordnungRepository,

    // Persistence — audit-Query (ADR-0005 §26.4 SEC-5 (d), Velocity/Quota
    // ueber den Audit-Trail als Quelle der Wahrheit, KEIN neuer State)
    GeraetReverseQuotaRepository,

    // Persistence — einfluss (ADR-0006 Teil B, B8/B10, eigener Namensraum, V0020)
    EinflussKatalogRepository,
    EinflussIntervallRepository,
    EinflussBefundRepository,

    // SEC-5 (e) — Echtzeit-Alert-Port, Dev-Binding (strukturiertes
    // Logger.warn, analog SecurityLoggerService). Prod-Adapter (SIEM/
    // Alerting-System-Anbindung) folgt spaeter, NICHT Teil dieses Pakets.
    { provide: GERAET_REVERSE_ALERT_PORT, useClass: LogGeraetReverseAlertAdapter },

    // Fach-Services
    EndkundeService,
    EndkundeLabelService,
    SystemService,
    ZaehlerService,
    MesskanalService,
    MesskonzeptService,
    SystemgrenzeService,
    EnergyMvetSystemRepository,
    BaselinePeriodeService,
    EnergyBaselinePeriodeRepository,
    AnschlussnutzerService,
    NutzungsverhaeltnisService,
    MonitoringService,
    IngestFreshnessService,
    IngestBetriebService,
    IngestBetriebRepository,
    HerkunftMappingService,
    IngestQuelleService,
    IngestQuelleRepository,
    IngestQuelleSchluesselRepository,
    HerkunftMappingRepository,
    DECODER_REGISTRY_PROVIDER,
    ShredAntragService,
    DeviceProvisioningService,
    DeviceReverseAufloesungService,
    // ADR-0010 (Standort-/Gebaeudestruktur) — physisch getrennte Services je
    // Lesestufe (D5): StandortBaumService bleibt garantiert identity-frei.
    StandortBaumService,
    StandortLabelService,
    StandortService,
    ZaehlerVerortungService,
    // ADR-0006 Teil B (B8/B10, Einflussgrößen)
    EinflussgroesseService,
  ],
  exports: [StammdatenResourceAttributesProvider, CompositeResourceAttributesProvider],
})
export class StammdatenModule {}
