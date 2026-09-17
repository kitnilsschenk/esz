import { Module } from '@nestjs/common';
import { KEY_MANAGEMENT_PORT } from './key-management.port';
import { LocalDevKmsAdapter } from './local-dev-kms.adapter';
import { FieldCipherService } from './field-cipher.service';
import { BLIND_INDEX_PEPPER_PORT } from './blind-index-pepper.port';
import { LocalDevPepperAdapter } from './local-dev-pepper.adapter';
import { BlindIndexService } from './blind-index.service';

/**
 * ADR-0005 §18 (Modul-Refactoring, `technical-director`: "refaktor-arm") —
 * bündelt die domänen-freien Krypto-Bausteine (bisher dupliziert/nur in
 * `StammdatenModule` verdrahtet) für die Wiederverwendung durch
 * `StammdatenModule` UND den künftigen Ingest-Worker (ADR-0005 §26.2/§26.3).
 *
 * Enthält BEWUSST NICHT `KryptoShreddingService`: der ist an
 * `IdentitySubjektSchluesselRepository` gekoppelt (NICHT domänen-frei) und
 * bleibt in `stammdaten/crypto/` (s. dortiger Kommentar).
 *
 * Dev-Bindings (genau wie zuvor in `StammdatenModule` verdrahtet, jetzt
 * hierher verschoben):
 *   - `KEY_MANAGEMENT_PORT` → `LocalDevKmsAdapter` (ADR-0008 §19, D7).
 *   - `BLIND_INDEX_PEPPER_PORT` → `LocalDevPepperAdapter` (ADR-0005 §26.3,
 *     D14, neu).
 *
 * Beide Dev-Adapter sind fail-closed Startup-Self-Checks (werfen bereits
 * beim Konstruieren bei fehlendem/ungueltigem ENV-Wert) — jede volle
 * Nest-App-Instanziierung, die (transitiv) dieses Modul importiert, braucht
 * daher `EDMS_DEV_KMS_MASTER_KEY` UND `EDMS_DEV_BLIND_INDEX_PEPPER` gesetzt
 * (s. `.env.example`, Test-Bootstraps in den `test-support`-Verzeichnissen,
 * z. B. `health-test-app.ts`/`stammdaten-test-app.ts`).
 */
@Module({
  providers: [
    { provide: KEY_MANAGEMENT_PORT, useClass: LocalDevKmsAdapter },
    FieldCipherService,
    { provide: BLIND_INDEX_PEPPER_PORT, useClass: LocalDevPepperAdapter },
    BlindIndexService,
  ],
  exports: [KEY_MANAGEMENT_PORT, FieldCipherService, BLIND_INDEX_PEPPER_PORT, BlindIndexService],
})
export class CryptoModule {}
