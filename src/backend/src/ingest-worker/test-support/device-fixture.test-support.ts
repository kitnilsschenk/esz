import { randomUUID } from 'node:crypto';
import { connect } from '@edms/migrate';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { LocalDevKmsAdapter } from '../../common/crypto/local-dev-kms.adapter';
import { FieldCipherService } from '../../common/crypto/field-cipher.service';
import { LocalDevPepperAdapter } from '../../common/crypto/local-dev-pepper.adapter';
import { BlindIndexService } from '../../common/crypto/blind-index.service';
import { FELD_DEVEUI } from '../../stammdaten/geraet-zuordnung/geraet-zuordnung.constants';
import { SYNTHETISCH_REFERENZ_V1_GERAETETYP } from '../decoder/synthetisch-referenz-v1.decoder';

export interface ProvisioniereTestGeraetInput {
  readonly devEui: string;
  readonly messgroesse?: string;
  readonly einheit?: string;
  readonly art?: 'kumulativ_zaehlerstand' | 'intervall_verbrauch';
  readonly obisKennzahl?: string | null;
}

export interface ProvisioniertesTestGeraet {
  readonly endkundeId: string;
  readonly systemId: string;
  readonly zaehlerId: string;
  readonly messkanalId: string;
  readonly messkanalKey: number;
  readonly devEui: string;
}

interface MesskanalKeyRow {
  readonly kanal_key: number;
}

/**
 * ADR-0005 Aufgabe E — provisioniert EIN Test-Geraet End-to-End (Stammdaten
 * `energy.*` + `device.*` inkl. echter Feld-Verschluesselung/Blind-Index,
 * EXAKT wie `DeviceProvisioningService` es taete) — direkt per SQL gegen den
 * Testcontainer-Superuser (KEIN Nest-Bootstrap der vollen `StammdatenModule`
 * noetig fuer diesen Testaufbau). Krypto-Bausteine werden PLAIN instanziiert
 * (kein DI) — lesen `EDMS_DEV_KMS_MASTER_KEY`/`EDMS_DEV_BLIND_INDEX_PEPPER`
 * aus ENV, die der Aufrufer VOR diesem Aufruf gesetzt haben MUSS (dieselben
 * Werte, die auch der zu testende Worker-Prozess liest — sonst Blind-Index-
 * Lookup-Miss, ADR-0005 §26.3 Konsistenzpflicht).
 */
export async function provisioniereTestGeraet(
  container: StartedPostgreSqlContainer,
  input: ProvisioniereTestGeraetInput,
): Promise<ProvisioniertesTestGeraet> {
  const kms = new LocalDevKmsAdapter();
  const fieldCipher = new FieldCipherService();
  const pepper = new LocalDevPepperAdapter();
  const blindIndexService = new BlindIndexService(pepper);

  const endkundeId = randomUUID();
  const systemId = randomUUID();
  const zaehlerId = randomUUID();
  const messkanalId = randomUUID();
  const schluesselId = randomUUID();
  const geraetZuordnungId = randomUUID();

  const generatedKey = await kms.generateDataKey();
  const deveuiEnc = fieldCipher.encrypt(generatedKey.dek, zaehlerId, FELD_DEVEUI, input.devEui);
  const { blindIndex, pepperVersion } = await blindIndexService.berechne(input.devEui);

  const client = await connect({ connectionString: container.getConnectionUri() });
  try {
    await client.query(`INSERT INTO energy.endkunde (id) VALUES ($1)`, [endkundeId]);
    await client.query(
      `INSERT INTO energy.system (id, endkunde_id, bezeichnung, systemgrenze) VALUES ($1, $2, $3, $4)`,
      [systemId, endkundeId, 'E2E-Test-System', 'E2E-Test-Systemgrenze'],
    );
    await client.query(
      `INSERT INTO energy.zaehler (id, system_id, geraetetyp, energietraeger) VALUES ($1, $2, $3, $4)`,
      [zaehlerId, systemId, SYNTHETISCH_REFERENZ_V1_GERAETETYP, 'strom'],
    );

    const messkanalResult = await client.query<MesskanalKeyRow>(
      `INSERT INTO energy.messkanal (id, zaehler_id, messgroesse, einheit, art, obis_kennzahl)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING kanal_key`,
      [
        messkanalId,
        zaehlerId,
        input.messgroesse ?? 'wirkarbeit',
        input.einheit ?? 'kWh',
        input.art ?? 'kumulativ_zaehlerstand',
        input.obisKennzahl ?? null,
      ],
    );
    const messkanalKey = messkanalResult.rows[0]?.kanal_key;
    if (messkanalKey === undefined) {
      throw new Error('energy.messkanal-INSERT hat keinen kanal_key zurueckgegeben.');
    }

    await client.query(
      `INSERT INTO device.schluessel (id, wrapped_dek, kms_key_id, alg_version) VALUES ($1, $2, $3, $4)`,
      [schluesselId, generatedKey.wrappedDek, generatedKey.kmsKeyId, generatedKey.algVersion],
    );
    await client.query(
      `INSERT INTO device.geraet_zuordnung (id, zaehler_id, crypto_key_id, deveui_enc, deveui_blind_index, pepper_version)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [geraetZuordnungId, zaehlerId, schluesselId, deveuiEnc, blindIndex, pepperVersion],
    );

    return { endkundeId, systemId, zaehlerId, messkanalId, messkanalKey, devEui: input.devEui };
  } finally {
    await client.end();
  }
}
