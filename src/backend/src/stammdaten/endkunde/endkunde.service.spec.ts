import { HttpStatus } from '@nestjs/common';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { EndkundeService } from './endkunde.service';
import { ProblemDetailsException } from '../../common/exceptions/problem-details.exception';
import type { AuditService } from '../../audit/audit.service';
import type { EnergyEinschraenkungUnterrichtungRepository } from '../persistence/energy/energy-einschraenkung-unterrichtung.repository';
import { ensureNoOpTransactionHost } from '../test-support/init-noop-transaction-host';
import type { EnergyEndkundeRepository, Endkunde } from '../persistence/energy/energy-endkunde.repository';
import type { EnergyZaehlerRepository } from '../persistence/energy/energy-zaehler.repository';
import type { IdentityEndkundePiiRepository, EndkundePii } from '../persistence/identity/identity-endkunde-pii.repository';
import type {
  IdentitySubjektSchluesselRepository,
  SubjektSchluessel,
} from '../persistence/identity/identity-subjekt-schluessel.repository';
import type { DeviceGeraetZuordnungRepository } from '../persistence/device/device-geraet-zuordnung.repository';
import type { IdentityStandortPiiRepository } from '../persistence/identity/identity-standort-pii.repository';
import type { NachweisBestandRepository } from '../persistence/nachweis-bestand.repository';
import type { KeyManagementPort } from '../../common/crypto/key-management.port';
import { FieldCipherService } from '../../common/crypto/field-cipher.service';
import type { KryptoShreddingService } from '../crypto/krypto-shredding.service';
import type { DeviceKryptoShreddingService } from '../crypto/device-krypto-shredding.service';
import { PiiProjektionsPolicy } from '../pii/pii-projektions.policy';
import type { SecurityContext } from '../../common/security/security-context';

function endkunde(overrides: Partial<Endkunde> = {}): Endkunde {
  return {
    id: 'endkunde-1',
    verarbeitungsStatus: 'aktiv',
    consentStatus: 'fehlt',
    consentTextVersion: null,
    vonWissAuswertungAusgenommen: false,
    endkundengruppe: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function betrieb(): SecurityContext {
  return { sub: 'betrieb-sub', actorTyp: 'benutzer', roles: ['betrieb'], azp: 'edms-bff' };
}

function auditor(): SecurityContext {
  return { sub: 'auditor-sub', actorTyp: 'benutzer', roles: ['compliance-auditor'], azp: 'edms-bff' };
}

const dek = Buffer.alloc(32, 7);
const fieldCipher = new FieldCipherService();

function createService(overrides: {
  endkunde?: Endkunde | undefined;
  pii?: EndkundePii | undefined;
  subjektSchluessel?: SubjektSchluessel | undefined;
  zaehlerIds?: readonly string[];
  geraetZuordnungen?: readonly { readonly cryptoKeyId: string; readonly zaehlerId: string }[];
  standortPiiNeutralisiert?: number;
  analyticsLaeufe?: number;
  einflussIntervalle?: number;
  /** Unterrichtungs-Nachweis (Art. 18 Abs. 3); `undefined` = keiner vorhanden, Entsperren ist dann fail-closed. */
  unterrichtung?: { readonly gesperrtSeit: string } | undefined;
}): {
  service: EndkundeService;
  endkundeRepo: EnergyEndkundeRepository;
  endkundeMarkGesperrt: ReturnType<typeof vi.fn>;
  endkundeMarkEntsperrt: ReturnType<typeof vi.fn>;
  piiRepo: IdentityEndkundePiiRepository;
  deviceKryptoShreddingShred: ReturnType<typeof vi.fn>;
  standortPiiNeutralisiereShred: ReturnType<typeof vi.fn>;
} {
  // Eigene Spy-Konstante statt Zugriff ueber `endkundeRepo.markGesperrt` --
  // dasselbe Muster wie `deviceKryptoShreddingShred`/`standortPiiNeutralisiere
  // Shred` unten. Der Zugriff auf eine Methode des TYPISIERTEN Repositories
  // loest sonst `@typescript-eslint/unbound-method` aus.
  //
  // Der Fake bildet den echten UPDATE nach: Status UND Grund werden gemeinsam
  // gesetzt (`ck_endkunde_einschraenkung_kohaerenz`, V0024) -- wuerde er den
  // Grund ignorieren, pruefte der Persistenz-Test nichts.
  // Gegenstueck zu markGesperrt: bildet nach, dass Status, Grund UND
  // gesperrt_seit GEMEINSAM zurueckgesetzt werden (Kohaerenz-CHECK V0024).
  const endkundeMarkEntsperrt = vi.fn(() =>
    Promise.resolve(
      overrides.endkunde !== undefined
        ? {
            ...overrides.endkunde,
            verarbeitungsStatus: 'aktiv' as const,
            einschraenkungGrundCode: null,
            gesperrtSeit: null,
          }
        : undefined,
    ),
  );

  const endkundeMarkGesperrt = vi.fn((_id: string, grund: string) =>
    Promise.resolve(
      overrides.endkunde !== undefined
        ? {
            ...overrides.endkunde,
            verarbeitungsStatus: 'gesperrt' as const,
            einschraenkungGrundCode: grund,
            gesperrtSeit: '2026-08-26T00:00:00.000Z',
          }
        : undefined,
    ),
  );

  const endkundeRepo = {
    findById: vi.fn(() => Promise.resolve(overrides.endkunde)),
    listPage: vi.fn(() => Promise.resolve([])),
    insert: vi.fn((input: { id: string; vonWissAuswertungAusgenommen: boolean }) =>
      Promise.resolve(endkunde({ id: input.id, vonWissAuswertungAusgenommen: input.vonWissAuswertungAusgenommen })),
    ),
    updateVonWissAuswertungAusgenommen: vi.fn(() => Promise.resolve(overrides.endkunde)),
    markGesperrt: endkundeMarkGesperrt, endkundeMarkEntsperrt,
    markEntsperrt: endkundeMarkEntsperrt,
    markGeloescht: vi.fn(() => Promise.resolve(overrides.endkunde)),
  } as unknown as EnergyEndkundeRepository;

  const piiRepo = {
    findByPseudonymId: vi.fn(() => Promise.resolve(overrides.pii)),
    insert: vi.fn((input: { id: string; pseudonymId: string; cryptoKeyId: string; nameEnc: Buffer; anschriftEnc: Buffer; kontaktEnc: Buffer | null }) =>
      Promise.resolve({
        id: input.id,
        pseudonymId: input.pseudonymId,
        cryptoKeyId: input.cryptoKeyId,
        nameEnc: input.nameEnc,
        anschriftEnc: input.anschriftEnc,
        kontaktEnc: input.kontaktEnc,
        piiStatus: 'aktiv' as const,
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      }),
    ),
    updateByPseudonymId: vi.fn(() => Promise.resolve(overrides.pii)),
    markGesperrt: vi.fn(() => Promise.resolve(overrides.pii)),
    markAktiv: vi.fn(() => Promise.resolve(overrides.pii)),
    neutralisiereUndMarkGeloescht: vi.fn(() => Promise.resolve(overrides.pii)),
  } as unknown as IdentityEndkundePiiRepository;

  const subjektSchluesselRepo = {
    insert: vi.fn(() => Promise.resolve(overrides.subjektSchluessel)),
    findById: vi.fn(() => Promise.resolve(overrides.subjektSchluessel)),
  } as unknown as IdentitySubjektSchluesselRepository;

  const kms: KeyManagementPort = {
    generateDataKey: vi.fn(() =>
      Promise.resolve({ dek, wrappedDek: Buffer.from('wrapped'), kmsKeyId: 'dev-local:v1', algVersion: 1 }),
    ),
    unwrapDek: vi.fn(() => Promise.resolve(dek)),
  };

  const kryptoShreddingService = { shred: vi.fn(() => Promise.resolve({ subjektSchluesselId: 'x', geschreddert: true })) } as unknown as KryptoShreddingService;

  const zaehlerRepo = {
    listIdsByEndkundeId: vi.fn(() => Promise.resolve(overrides.zaehlerIds ?? [])),
  } as unknown as EnergyZaehlerRepository;

  const geraetZuordnungRepo = {
    findByZaehlerIds: vi.fn(() =>
      Promise.resolve(
        (overrides.geraetZuordnungen ?? []).map((z) => ({
          id: `zuordnung-${z.cryptoKeyId}`,
          zaehlerId: z.zaehlerId,
          cryptoKeyId: z.cryptoKeyId,
          deveuiEnc: Buffer.from('irrelevant'),
          deveuiBlindIndex: Buffer.from('irrelevant'),
          pepperVersion: 1,
          status: 'aktiv' as const,
          gueltigVon: '2026-07-01T00:00:00.000Z',
          gueltigBis: null,
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        })),
      ),
    ),
  } as unknown as DeviceGeraetZuordnungRepository;

  const deviceKryptoShreddingShred = vi.fn(() =>
    Promise.resolve({ geraetZuordnungId: 'zuordnung-1', cryptoKeyId: 'crypto-1', geschreddert: true }),
  );
  const deviceKryptoShreddingService = { shred: deviceKryptoShreddingShred } as unknown as DeviceKryptoShreddingService;

  const standortPiiNeutralisiereShred = vi.fn(() => Promise.resolve(overrides.standortPiiNeutralisiert ?? 0));
  const standortPiiRepo = {
    neutralisiereAlleUndMarkGeloeschtByCryptoKeyId: standortPiiNeutralisiereShred,
  } as unknown as IdentityStandortPiiRepository;

  const nachweisBestandRepo = {
    zaehleNachweisgebundeneBestaende: vi.fn(() =>
      Promise.resolve({
        analyticsLaeufe: overrides.analyticsLaeufe ?? 0,
        einflussIntervalle: overrides.einflussIntervalle ?? 0,
      }),
    ),
  } as unknown as NachweisBestandRepository;

  // ADR-0007 A11.10 — Unterrichtungs-Nachweis (Art. 18 Abs. 3) und die
  // service-seitige Audit-Emission. `findFuerSperre` liefert per Default
  // `undefined`: der Entsperr-Pfad ist damit im Test standardmaessig
  // fail-closed, und ein Test, der ihn oeffnen will, muss das AUSDRUECKLICH
  // tun.
  const unterrichtungFindFuerSperre = vi.fn(() => Promise.resolve(overrides.unterrichtung));
  const unterrichtungInsert = vi.fn(() => Promise.resolve(undefined));
  const unterrichtungRepo = {
    insert: unterrichtungInsert,
    findFuerSperre: unterrichtungFindFuerSperre,
  } as unknown as EnergyEinschraenkungUnterrichtungRepository;

  const auditAppend = vi.fn(() => Promise.resolve(undefined));
  const auditServiceFake = { append: auditAppend } as unknown as AuditService;

  const service = new EndkundeService(
    endkundeRepo,
    piiRepo,
    subjektSchluesselRepo,
    kms,
    fieldCipher,
    kryptoShreddingService,
    new PiiProjektionsPolicy(),
    zaehlerRepo,
    geraetZuordnungRepo,
    deviceKryptoShreddingService,
    standortPiiRepo,
    nachweisBestandRepo,
    unterrichtungRepo,
    auditServiceFake,
  );

  return { service, endkundeRepo, endkundeMarkGesperrt, piiRepo, deviceKryptoShreddingShred, standortPiiNeutralisiereShred, endkundeMarkEntsperrt };
}

describe('EndkundeService (ADR-0008 §20, D8)', () => {
  beforeAll(() => {
    ensureNoOpTransactionHost();
  });

  it('anlegen(): generiert einen DEK VOR der Schreib-Tx und liefert die PII fuer betrieb sichtbar zurueck', async () => {
    const { service } = createService({});

    const result = await service.anlegen(
      { stammdatenPii: { name: 'Testkunde Musterfirma', anschrift: 'Musterstrasse 1' } },
      betrieb(),
    );

    expect(result.stammdatenPii).toEqual({ name: 'Testkunde Musterfirma', anschrift: 'Musterstrasse 1', kontakt: null });
    expect(result.verarbeitungsStatus).toBe('aktiv');
  });

  it('anlegen(): maskiert die PII in der Antwort, wenn der Aufrufer compliance-auditor ist (D6 fail-closed)', async () => {
    const { service } = createService({});

    const result = await service.anlegen(
      { stammdatenPii: { name: 'Testkunde Musterfirma', anschrift: 'Musterstrasse 1' } },
      auditor(),
    );

    expect(result.stammdatenPii).toBeNull();
  });

  it('detail(): wirft 404, wenn der Endkunde nicht existiert', async () => {
    const { service } = createService({ endkunde: undefined });

    await expect(service.detail('unbekannt', betrieb())).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('detail(): betrieb bei aktivem Subjekt sieht die entschluesselte PII', async () => {
    const plaintextEnc = fieldCipher.encrypt(dek, 'endkunde-1', 'name', 'Musterkunde GmbH');
    const anschriftEnc = fieldCipher.encrypt(dek, 'endkunde-1', 'anschrift', 'Musterstrasse 1');

    const { service } = createService({
      endkunde: endkunde(),
      pii: {
        id: 'pii-1',
        pseudonymId: 'endkunde-1',
        cryptoKeyId: 'schluessel-1',
        nameEnc: plaintextEnc,
        anschriftEnc,
        kontaktEnc: null,
        piiStatus: 'aktiv',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
      subjektSchluessel: {
        id: 'schluessel-1',
        wrappedDek: Buffer.from('wrapped'),
        kmsKeyId: 'dev-local:v1',
        algVersion: 1,
        keyState: 'aktiv',
        createdAt: '2026-07-01T00:00:00.000Z',
        geschreddertAt: null,
      },
    });

    const result = await service.detail('endkunde-1', betrieb());

    expect(result.stammdatenPii).toEqual({ name: 'Musterkunde GmbH', anschrift: 'Musterstrasse 1', kontakt: null });
  });

  it('detail(): compliance-auditor erreicht die Route (kein 403), sieht aber stammdatenPii=null (D2/D6-Aufloesung)', async () => {
    const { service } = createService({
      endkunde: endkunde(),
      pii: {
        id: 'pii-1',
        pseudonymId: 'endkunde-1',
        cryptoKeyId: 'schluessel-1',
        nameEnc: Buffer.from('irrelevant'),
        anschriftEnc: Buffer.from('irrelevant'),
        kontaktEnc: null,
        piiStatus: 'aktiv',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
    });

    const result = await service.detail('endkunde-1', auditor());

    expect(result.stammdatenPii).toBeNull();
  });

  it('detail(): gesperrtes Subjekt -> stammdatenPii=null auch fuer betrieb (fail-closed)', async () => {
    const { service } = createService({ endkunde: endkunde({ verarbeitungsStatus: 'gesperrt' }) });

    const result = await service.detail('endkunde-1', betrieb());

    expect(result.stammdatenPii).toBeNull();
  });

  it('sperren(): setzt den Grund und liefert ihn im Detail zurueck (A11.1/A11.4)', async () => {
    const { service, endkundeMarkGesperrt } = createService({ endkunde: endkunde({ verarbeitungsStatus: 'aktiv' }) });

    const result = await service.sperren('endkunde-1', 'art18_1a_richtigkeit', undefined, betrieb());

    expect(endkundeMarkGesperrt).toHaveBeenCalledWith('endkunde-1', 'art18_1a_richtigkeit', null);
    expect(result.verarbeitungsStatus).toBe('gesperrt');
    expect(result.einschraenkungGrundCode).toBe('art18_1a_richtigkeit');
  });

  it('sperren(): ist idempotent bei GLEICHEM Grund (kein zweiter Schreibvorgang)', async () => {
    const { service, endkundeMarkGesperrt } = createService({
      // Auflage C-8: lit. d verlangt die Erhebungs-Entscheidung, und
      // idempotent ist der Aufruf nur, wenn sie zur gespeicherten passt.
      endkunde: endkunde({
        verarbeitungsStatus: 'gesperrt',
        einschraenkungGrundCode: 'art18_1d_widerspruch',
        neuerhebungFortsetzen: true,
      }),
    });

    const result = await service.sperren('endkunde-1', 'art18_1d_widerspruch', true, betrieb());

    expect(result.verarbeitungsStatus).toBe('gesperrt');
    expect(result.einschraenkungGrundCode).toBe('art18_1d_widerspruch');
    expect(endkundeMarkGesperrt).not.toHaveBeenCalled();
  });

  // Regressionstest zu A11.2 — DAS ist der gefaehrliche Fall: vor dem
  // C8-Umbau lief `markGesperrt()` bei bereits gesperrtem Subjekt ins Leere,
  // `findById()` lieferte die Zeile, und die Antwort war 200. Mit einem
  // Grund-Parameter waere der mitgelieferte Grund damit STILL verworfen
  // worden — der Sachbearbeiter glaubt dokumentiert zu haben, die Datenbank
  // haelt nichts, der Preflight schliesst weiter fail-closed aus (FJ-07c).
  it('sperren(): lehnt einen ABWEICHENDEN Grund mit 409 ab und schreibt nicht (A11.2)', async () => {
    const { service, endkundeMarkGesperrt } = createService({
      endkunde: endkunde({ verarbeitungsStatus: 'gesperrt', einschraenkungGrundCode: 'art18_1a_richtigkeit' }),
    });

    await expect(service.sperren('endkunde-1', 'art18_1d_widerspruch', true, betrieb())).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
    });
    expect(endkundeMarkGesperrt).not.toHaveBeenCalled();
  });

  it('sperren(): lehnt eine bestehende Sperre OHNE Grund mit 409 ab (Nacherfassung ist ein eigener Vorgang, A11.9)', async () => {
    const { service, endkundeMarkGesperrt } = createService({
      endkunde: endkunde({ verarbeitungsStatus: 'gesperrt', einschraenkungGrundCode: null }),
    });

    await expect(service.sperren('endkunde-1', 'art18_1a_richtigkeit', undefined, betrieb())).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
    });
    expect(endkundeMarkGesperrt).not.toHaveBeenCalled();
  });

  it('sperren(): lehnt ein bereits geloeschtes Subjekt mit 409 ab statt idempotent zu quittieren', async () => {
    const { service } = createService({ endkunde: endkunde({ verarbeitungsStatus: 'geloescht' }) });

    await expect(service.sperren('endkunde-1', 'art18_1a_richtigkeit', undefined, betrieb())).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
    });
  });


  // ADR-0007 A11.7/A11.10 — Art. 18 Abs. 3 ist eine Ordnungsvorschrift MIT
  // Reihenfolge. Die Tests pruefen genau das: ohne Nachweis kein Aufheben.
  it('entsperren(): lehnt OHNE Unterrichtungs-Nachweis mit 409 ab und schreibt nicht', async () => {
    const { service, endkundeMarkEntsperrt } = createService({
      endkunde: endkunde({
        verarbeitungsStatus: 'gesperrt',
        einschraenkungGrundCode: 'art18_1a_richtigkeit',
        gesperrtSeit: '2026-08-01T00:00:00.000Z',
      }),
      unterrichtung: undefined,
    });

    await expect(service.entsperren('endkunde-1', betrieb())).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
    });
    expect(endkundeMarkEntsperrt).not.toHaveBeenCalled();
  });

  it('entsperren(): hebt auf, sobald ein an DIESE Einschraenkung gebundener Nachweis vorliegt', async () => {
    const { service, endkundeMarkEntsperrt } = createService({
      endkunde: endkunde({
        verarbeitungsStatus: 'gesperrt',
        einschraenkungGrundCode: 'art18_1d_widerspruch',
        gesperrtSeit: '2026-08-01T00:00:00.000Z',
      }),
      unterrichtung: { gesperrtSeit: '2026-08-01T00:00:00.000Z' },
    });

    const result = await service.entsperren('endkunde-1', betrieb());

    expect(endkundeMarkEntsperrt).toHaveBeenCalledWith('endkunde-1');
    expect(result.verarbeitungsStatus).toBe('aktiv');
    expect(result.einschraenkungGrundCode).toBeNull();
    expect(result.gesperrtSeit).toBeNull();
  });

  it('entsperren(): ist idempotent auf einem bereits aktiven Subjekt', async () => {
    const { service, endkundeMarkEntsperrt } = createService({
      endkunde: endkunde({ verarbeitungsStatus: 'aktiv' }),
    });

    const result = await service.entsperren('endkunde-1', betrieb());

    expect(result.verarbeitungsStatus).toBe('aktiv');
    expect(endkundeMarkEntsperrt).not.toHaveBeenCalled();
  });

  it('entsperren(): lehnt ein geloeschtes Subjekt mit 409 ab statt idempotent zu quittieren', async () => {
    const { service } = createService({ endkunde: endkunde({ verarbeitungsStatus: 'geloescht' }) });

    await expect(service.entsperren('endkunde-1', betrieb())).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
    });
  });

  it('unterrichten(): lehnt ab, wenn gar keine Einschraenkung besteht', async () => {
    const { service } = createService({ endkunde: endkunde({ verarbeitungsStatus: 'aktiv' }) });

    await expect(service.unterrichten('endkunde-1', 'postalisch', betrieb())).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
    });
  });

  it('shred(): ist idempotent (zweiter Aufruf auf bereits geloeschtem Subjekt liefert denselben Erfolg ohne erneuten Shredding-Versuch)', async () => {
    const { service, deviceKryptoShreddingShred } = createService({
      endkunde: endkunde({ verarbeitungsStatus: 'geloescht' }),
    });

    const result = await service.shred('endkunde-1', 'antrag-1', betrieb());

    expect(result).toEqual({
      id: 'endkunde-1',
      verarbeitungsStatus: 'geloescht',
      geschreddert: true,
      standortPiiNeutralisiert: 0,
      analyticsLaeufeUnveraendert: 0,
      einflussIntervalleUnveraendert: 0,
    });
    // Bereits geloescht -> shredInTx() wird gar nicht erst betreten, also auch
    // KEIN Geraete-Shred-Versuch (Idempotenz-Anker bleibt verarbeitungsStatus).
    expect(deviceKryptoShreddingShred).not.toHaveBeenCalled();
  });

  it('shred(): weist die Nachweis-gebundenen Bestaende aus, die den Shred bewusst ueberleben (P5b/A7, Art. 17(3)(b))', async () => {
    const { service } = createService({
      endkunde: endkunde({ verarbeitungsStatus: 'aktiv' }),
      analyticsLaeufe: 4,
      einflussIntervalle: 2,
    });

    const result = await service.shred('endkunde-1', 'antrag-1', betrieb());

    expect(result.geschreddert).toBe(true);
    expect(result.analyticsLaeufeUnveraendert).toBe(4);
    expect(result.einflussIntervalleUnveraendert).toBe(2);
  });

  describe('shred(): ADR-0010 D4 — Standort-PII-Shred-Kopplung (neue Dimension, analog GB-C)', () => {
    it('ruft IdentityStandortPiiRepository.neutralisiereAlleUndMarkGeloeschtByCryptoKeyId() MIT dem Endkunden-crypto_key_id auf und reicht die Anzahl im Ergebnis durch', async () => {
      const { service, standortPiiNeutralisiereShred } = createService({
        endkunde: endkunde({ verarbeitungsStatus: 'aktiv' }),
        pii: {
          id: 'pii-1',
          pseudonymId: 'endkunde-1',
          cryptoKeyId: 'schluessel-1',
          nameEnc: Buffer.from('irrelevant'),
          anschriftEnc: Buffer.from('irrelevant'),
          kontaktEnc: null,
          piiStatus: 'aktiv',
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
        standortPiiNeutralisiert: 3,
      });

      const result = await service.shred('endkunde-1', 'antrag-1', betrieb());

      expect(standortPiiNeutralisiereShred).toHaveBeenCalledWith('schluessel-1');
      expect(result.standortPiiNeutralisiert).toBe(3);
    });

    it('kein identity.endkunde_pii-Datensatz (Grenzfall) -> KEIN Standort-PII-Neutralisierungs-Versuch, standortPiiNeutralisiert=0', async () => {
      const { service, standortPiiNeutralisiereShred } = createService({
        endkunde: endkunde({ verarbeitungsStatus: 'aktiv' }),
        pii: undefined,
      });

      const result = await service.shred('endkunde-1', 'antrag-1', betrieb());

      expect(standortPiiNeutralisiereShred).not.toHaveBeenCalled();
      expect(result.standortPiiNeutralisiert).toBe(0);
    });
  });

  describe('shred(): ADR-0005 §26.5 — Geraete-Zuordnungs-Shred-Kopplung (device-Dimension)', () => {
    it('ruft DeviceKryptoShreddingService.shred() fuer jede Zuordnung der Zaehler dieses Endkunden auf, mit antragId/subject aus dem Aufruf', async () => {
      const subject = betrieb();
      const { service, deviceKryptoShreddingShred } = createService({
        endkunde: endkunde({ verarbeitungsStatus: 'aktiv' }),
        zaehlerIds: ['zaehler-1', 'zaehler-2'],
        geraetZuordnungen: [
          { cryptoKeyId: 'crypto-1', zaehlerId: 'zaehler-1' },
          { cryptoKeyId: 'crypto-2', zaehlerId: 'zaehler-2' },
        ],
      });

      await service.shred('endkunde-1', 'antrag-1', subject);

      expect(deviceKryptoShreddingShred).toHaveBeenCalledTimes(2);
      expect(deviceKryptoShreddingShred).toHaveBeenCalledWith({
        cryptoKeyId: 'crypto-1',
        zaehlerId: 'zaehler-1',
        antragId: 'antrag-1',
        subject,
      });
      expect(deviceKryptoShreddingShred).toHaveBeenCalledWith({
        cryptoKeyId: 'crypto-2',
        zaehlerId: 'zaehler-2',
        antragId: 'antrag-1',
        subject,
      });
    });

    it('keine Zaehler beim Endkunden -> kein Geraete-Shred-Versuch (leere Liste, kein Fehler)', async () => {
      const { service, deviceKryptoShreddingShred } = createService({
        endkunde: endkunde({ verarbeitungsStatus: 'aktiv' }),
        zaehlerIds: [],
      });

      const result = await service.shred('endkunde-1', 'antrag-1', betrieb());

      expect(result.geschreddert).toBe(true);
      expect(deviceKryptoShreddingShred).not.toHaveBeenCalled();
    });
  });

  it('aendern(): wirft 400, wenn weder stammdatenPii noch vonWissAuswertungAusgenommen gesetzt sind (minProperties:1)', async () => {
    const { service } = createService({ endkunde: endkunde() });

    await expect(service.aendern('endkunde-1', {}, betrieb())).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  /*
   * AW-27 (V0052): Das DE-04-Ausnahme-Attribut folgt seit dem Widerspruch der
   * ERKLAERUNG und wird nicht mehr von Hand gesetzt. Ein von Hand gesetztes
   * Flag behauptet einen Vorgang, den niemand belegen kann.
   *
   * Die Abweisung war gebaut, aber ungeprueft — und die Oberflaeche bot das
   * Haekchen weiter an. Weil ein `boolean` nie `undefined` ist, schickte ihr
   * Mapper das Feld bei JEDEM Absenden mit: Anlegen und Aendern waren damit
   * vollstaendig unbenutzbar. Diese beiden Tests halten die Grenze fest, auf
   * die sich das Formular jetzt verlaesst.
   */
  it('anlegen(): weist das DE-04-Flag ab — es wird ueber den Widerspruch gesetzt (AW-27)', async () => {
    const { service } = createService({});

    await expect(
      service.anlegen(
        { stammdatenPii: { name: 'Test GmbH', anschrift: 'Teststrasse 1' }, vonWissAuswertungAusgenommen: true },
        betrieb(),
      ),
    ).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('anlegen(): weist das DE-04-Flag AUCH bei `false` ab — nicht nur beim Setzen', async () => {
    // Genau der Fall, der die Oberflaeche lahmgelegt hat: Das Formular
    // schickte den unveraenderten Vorgabewert mit.
    const { service } = createService({});

    await expect(
      service.anlegen(
        { stammdatenPii: { name: 'Test GmbH', anschrift: 'Teststrasse 1' }, vonWissAuswertungAusgenommen: false },
        betrieb(),
      ),
    ).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('aendern(): weist das DE-04-Flag ebenso ab', async () => {
    const { service } = createService({ endkunde: endkunde() });

    await expect(
      service.aendern(
        'endkunde-1',
        { stammdatenPii: { name: 'Neu GmbH', anschrift: 'Neuweg 2' }, vonWissAuswertungAusgenommen: false },
        betrieb(),
      ),
    ).rejects.toBeInstanceOf(ProblemDetailsException);
  });
});
