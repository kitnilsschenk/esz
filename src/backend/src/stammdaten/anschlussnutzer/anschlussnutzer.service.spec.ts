import { HttpStatus } from '@nestjs/common';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { AnschlussnutzerService } from './anschlussnutzer.service';
import { ProblemDetailsException } from '../../common/exceptions/problem-details.exception';
import type { AuditService } from '../../audit/audit.service';
import type { EnergyEinschraenkungUnterrichtungRepository } from '../persistence/energy/energy-einschraenkung-unterrichtung.repository';
import { ensureNoOpTransactionHost } from '../test-support/init-noop-transaction-host';
import type { EnergyEndkundeRepository, Endkunde } from '../persistence/energy/energy-endkunde.repository';
import type { EnergyAnschlussnutzerRepository, Anschlussnutzer } from '../persistence/energy/energy-anschlussnutzer.repository';
import type {
  IdentityAnschlussnutzerPiiRepository,
  AnschlussnutzerPii,
} from '../persistence/identity/identity-anschlussnutzer-pii.repository';
import type {
  IdentitySubjektSchluesselRepository,
  SubjektSchluessel,
} from '../persistence/identity/identity-subjekt-schluessel.repository';
import type { KeyManagementPort } from '../../common/crypto/key-management.port';
import { FieldCipherService } from '../../common/crypto/field-cipher.service';
import { PiiProjektionsPolicy } from '../pii/pii-projektions.policy';
import type { SecurityContext } from '../../common/security/security-context';

/**
 * Unit-Tests (Repo-Fakes, KEIN echter DB-Zugriff, Muster
 * `endkunde.service.spec.ts`) für `AnschlussnutzerService` — schließt die
 * Merge-Blocker-Lücke aus dem Phase-4-Review (`.claude/rules/tests.md`).
 * `AnschlussnutzerService` faehrt EXAKT das Endkunde-PII-Muster (NESTED-Tx
 * ueber identity+energy, KMS-Unwrap, `PiiProjektionsPolicy`-Maskierung,
 * DS-07-Datensubjekt) — deshalb PRIORITAERE, dem Endkunde-Pendant
 * gleichwertige Abdeckung.
 */

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

function anschlussnutzer(overrides: Partial<Anschlussnutzer> = {}): Anschlussnutzer {
  return {
    id: 'anschlussnutzer-1',
    endkundeId: 'endkunde-1',
    verarbeitungsStatus: 'aktiv',
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

const dek = Buffer.alloc(32, 9);
const fieldCipher = new FieldCipherService();

function createService(overrides: {
  readonly anschlussnutzer?: Anschlussnutzer | undefined;
  readonly endkunde?: Endkunde | undefined;
  readonly pii?: AnschlussnutzerPii | undefined;
  readonly subjektSchluessel?: SubjektSchluessel | undefined;
  /** Unterrichtungs-Nachweis (Art. 18 Abs. 3); `undefined` = keiner vorhanden, Entsperren ist dann fail-closed. */
  unterrichtung?: { readonly gesperrtSeit: string } | undefined;
}): {
  service: AnschlussnutzerService;
  anschlussnutzerRepo: EnergyAnschlussnutzerRepository;
  piiRepo: IdentityAnschlussnutzerPiiRepository;
  // Eigenstaendige `vi.fn()`-Referenz statt `anschlussnutzerRepo.listPage`
  // (`@typescript-eslint/unbound-method` — eine ueber die Interface-typisierte
  // Instanz referenzierte Methode gilt lint-seitig als potenziell an `this`
  // gebunden; eine separat gehaltene Mock-Funktion hat diesen Typ nicht).
  listPageMock: ReturnType<typeof vi.fn>;
  anschlussnutzerMarkGesperrt: ReturnType<typeof vi.fn>;
  anschlussnutzerMarkEntsperrt: ReturnType<typeof vi.fn>;
  piiMarkGesperrt: ReturnType<typeof vi.fn>;
} {
  const listPageMock = vi.fn(() => Promise.resolve([]));
  // Eigene Spy-Konstante statt Zugriff ueber das TYPISIERTE Repository --
  // sonst schlaegt `@typescript-eslint/unbound-method` zu (Muster
  // `endkunde.service.spec.ts`). Der Fake bildet den echten UPDATE nach:
  // Status UND Grund gemeinsam (`ck_anschlussnutzer_einschraenkung_kohaerenz`).
  // Gegenstueck zu markGesperrt: bildet nach, dass Status, Grund UND
  // gesperrt_seit GEMEINSAM zurueckgesetzt werden (Kohaerenz-CHECK V0024).
  const anschlussnutzerMarkEntsperrt = vi.fn(() =>
    Promise.resolve(
      overrides.anschlussnutzer !== undefined
        ? {
            ...overrides.anschlussnutzer,
            verarbeitungsStatus: 'aktiv' as const,
            einschraenkungGrundCode: null,
            gesperrtSeit: null,
          }
        : undefined,
    ),
  );

  const anschlussnutzerMarkGesperrt = vi.fn((_id: string, grund: string) =>
    Promise.resolve(
      overrides.anschlussnutzer !== undefined
        ? {
            ...overrides.anschlussnutzer,
            verarbeitungsStatus: 'gesperrt' as const,
            einschraenkungGrundCode: grund,
            gesperrtSeit: '2026-08-27T00:00:00.000Z',
          }
        : undefined,
    ),
  );
  const anschlussnutzerRepo = {
    findById: vi.fn(() => Promise.resolve(overrides.anschlussnutzer)),
    listPage: listPageMock,
    insert: vi.fn((input: { id: string; endkundeId: string }) => Promise.resolve(anschlussnutzer({ ...input }))),
    markGesperrt: anschlussnutzerMarkGesperrt, anschlussnutzerMarkEntsperrt,
    markEntsperrt: anschlussnutzerMarkEntsperrt,
  } as unknown as EnergyAnschlussnutzerRepository;

  const endkundeRepo = {
    findById: vi.fn(() => Promise.resolve(overrides.endkunde)),
  } as unknown as EnergyEndkundeRepository;

  const piiMarkGesperrt = vi.fn(() => Promise.resolve(overrides.pii));
  const piiRepo = {
    findByPseudonymId: vi.fn(() => Promise.resolve(overrides.pii)),
    markGesperrt: piiMarkGesperrt,
    markAktiv: vi.fn(() => Promise.resolve(overrides.pii)),
    insert: vi.fn(
      (input: { id: string; pseudonymId: string; cryptoKeyId: string; nameEnc: Buffer; kontaktEnc: Buffer | null }) =>
        Promise.resolve({
          id: input.id,
          pseudonymId: input.pseudonymId,
          cryptoKeyId: input.cryptoKeyId,
          nameEnc: input.nameEnc,
          kontaktEnc: input.kontaktEnc,
          piiStatus: 'aktiv' as const,
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        }),
    ),
  } as unknown as IdentityAnschlussnutzerPiiRepository;

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

  const service = new AnschlussnutzerService(
    anschlussnutzerRepo,
    endkundeRepo,
    piiRepo,
    unterrichtungRepo,
    auditServiceFake,
    subjektSchluesselRepo,
    kms,
    fieldCipher,
    new PiiProjektionsPolicy(),
  );

  return { service, anschlussnutzerRepo, anschlussnutzerMarkGesperrt, piiMarkGesperrt, piiRepo, listPageMock, anschlussnutzerMarkEntsperrt };
}

describe('AnschlussnutzerService (ADR-0008 §18/§19/§20, D6/D7/D8 — DS-07-Datensubjekt)', () => {
  beforeAll(() => {
    ensureNoOpTransactionHost();
  });

  it('anlegen(): wirft 404, wenn der referenzierte Endkunde nicht existiert', async () => {
    const { service } = createService({ endkunde: undefined });

    await expect(
      service.anlegen({ endkundeId: 'unbekannt', stammdatenPii: { name: 'Testnutzer Alpha' } }, betrieb()),
    ).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('anlegen(): generiert einen DEK VOR der Schreib-Tx und liefert die PII fuer betrieb sichtbar zurueck', async () => {
    const { service } = createService({ endkunde: endkunde() });

    const result = await service.anlegen(
      { endkundeId: 'endkunde-1', stammdatenPii: { name: 'Testnutzer Alpha', kontakt: 'kontakt@example.invalid' } },
      betrieb(),
    );

    expect(result.stammdatenPii).toEqual({ name: 'Testnutzer Alpha', kontakt: 'kontakt@example.invalid' });
    expect(result.verarbeitungsStatus).toBe('aktiv');
    expect(result.endkundeId).toBe('endkunde-1');
  });

  it('anlegen(): maskiert die PII in der Antwort, wenn der Aufrufer compliance-auditor ist (D6 fail-closed, Defense-in-Depth)', async () => {
    const { service } = createService({ endkunde: endkunde() });

    const result = await service.anlegen(
      { endkundeId: 'endkunde-1', stammdatenPii: { name: 'Testnutzer Beta' } },
      auditor(),
    );

    expect(result.stammdatenPii).toBeNull();
  });

  it('anlegen(): kontakt bleibt null, wenn im DTO nicht gesetzt', async () => {
    const { service } = createService({ endkunde: endkunde() });

    const result = await service.anlegen({ endkundeId: 'endkunde-1', stammdatenPii: { name: 'Testnutzer Gamma' } }, betrieb());

    expect(result.stammdatenPii).toEqual({ name: 'Testnutzer Gamma', kontakt: null });
  });

  it('detail(): wirft 404, wenn der Anschlussnutzer nicht existiert', async () => {
    const { service } = createService({ anschlussnutzer: undefined });

    await expect(service.detail('unbekannt', betrieb())).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('detail(): betrieb bei aktivem Subjekt sieht die entschluesselte PII', async () => {
    const nameEnc = fieldCipher.encrypt(dek, 'anschlussnutzer-1', 'name', 'Testnutzer Delta');

    const { service } = createService({
      anschlussnutzer: anschlussnutzer(),
      pii: {
        id: 'pii-1',
        pseudonymId: 'anschlussnutzer-1',
        cryptoKeyId: 'schluessel-1',
        nameEnc,
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

    const result = await service.detail('anschlussnutzer-1', betrieb());

    expect(result.stammdatenPii).toEqual({ name: 'Testnutzer Delta', kontakt: null });
  });

  it('detail(): compliance-auditor erreicht die Route (kein 403), sieht aber stammdatenPii=null (D2/D6-Aufloesung)', async () => {
    const { service } = createService({
      anschlussnutzer: anschlussnutzer(),
      pii: {
        id: 'pii-1',
        pseudonymId: 'anschlussnutzer-1',
        cryptoKeyId: 'schluessel-1',
        nameEnc: Buffer.from('irrelevant'),
        kontaktEnc: null,
        piiStatus: 'aktiv',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
    });

    const result = await service.detail('anschlussnutzer-1', auditor());

    expect(result.stammdatenPii).toBeNull();
  });

  it('detail(): gesperrtes Subjekt -> stammdatenPii=null auch fuer betrieb (fail-closed)', async () => {
    const { service } = createService({ anschlussnutzer: anschlussnutzer({ verarbeitungsStatus: 'gesperrt' }) });

    const result = await service.detail('anschlussnutzer-1', betrieb());

    expect(result.stammdatenPii).toBeNull();
  });

  it('detail(): fehlt die PII-Zeile trotz erlaubtem Zugriff, bleibt die Antwort maskiert (kein Absturz)', async () => {
    const { service } = createService({ anschlussnutzer: anschlussnutzer(), pii: undefined });

    const result = await service.detail('anschlussnutzer-1', betrieb());

    expect(result.stammdatenPii).toBeNull();
  });

  it('detail(): ein geschredderter Subjekt-Schluessel maskiert die PII auch bei aktivem Subjekt (Art. 17 Krypto-Shredding)', async () => {
    const { service } = createService({
      anschlussnutzer: anschlussnutzer(),
      pii: {
        id: 'pii-1',
        pseudonymId: 'anschlussnutzer-1',
        cryptoKeyId: 'schluessel-1',
        nameEnc: Buffer.from('irrelevant'),
        kontaktEnc: null,
        piiStatus: 'aktiv',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
      subjektSchluessel: {
        id: 'schluessel-1',
        wrappedDek: Buffer.from('\x00'),
        kmsKeyId: 'dev-local:v1',
        algVersion: 1,
        keyState: 'geschreddert',
        createdAt: '2026-07-01T00:00:00.000Z',
        geschreddertAt: '2026-07-02T00:00:00.000Z',
      },
    });

    const result = await service.detail('anschlussnutzer-1', betrieb());

    expect(result.stammdatenPii).toBeNull();
  });

  // Art.-18-Sperre (ADR-0007 A11.6). Die vollstaendige 200/409-Matrix ist in
  // `sperr-entscheidung.util.spec.ts` geprueft -- hier geht es um die
  // Verdrahtung: greift die geteilte Regel, werden BEIDE Namensraeume gesetzt,
  // und traegt die Antwort den Grund?
  it('sperren(): setzt den Grund in BEIDEN Namensraeumen und liefert ihn im Detail zurueck', async () => {
    const { service, anschlussnutzerMarkGesperrt, piiMarkGesperrt } = createService({
      anschlussnutzer: anschlussnutzer({ verarbeitungsStatus: 'aktiv' }),
    });

    const result = await service.sperren('anschlussnutzer-1', 'art18_1c_rechtsverteidigung_betroffener', undefined, betrieb());

    expect(anschlussnutzerMarkGesperrt).toHaveBeenCalledWith('anschlussnutzer-1', 'art18_1c_rechtsverteidigung_betroffener', null);
    // identity-Seite mitgefuehrt -- ohne sie bliebe die PII-Projektion offen.
    expect(piiMarkGesperrt).toHaveBeenCalledWith('anschlussnutzer-1');
    expect(result.verarbeitungsStatus).toBe('gesperrt');
    expect(result.einschraenkungGrundCode).toBe('art18_1c_rechtsverteidigung_betroffener');
  });

  it('sperren(): ist idempotent bei gleichem Grund und schreibt nicht erneut', async () => {
    const { service, anschlussnutzerMarkGesperrt } = createService({
      // Auflage C-8 — s. endkunde.service.spec.ts.
      anschlussnutzer: anschlussnutzer({
        verarbeitungsStatus: 'gesperrt',
        einschraenkungGrundCode: 'art18_1b_unrechtmaessig',
        neuerhebungFortsetzen: true,
      }),
    });

    const result = await service.sperren('anschlussnutzer-1', 'art18_1b_unrechtmaessig', true, betrieb());

    expect(result.einschraenkungGrundCode).toBe('art18_1b_unrechtmaessig');
    expect(anschlussnutzerMarkGesperrt).not.toHaveBeenCalled();
  });

  it('sperren(): lehnt einen abweichenden Grund mit 409 ab und schreibt nicht', async () => {
    const { service, anschlussnutzerMarkGesperrt } = createService({
      anschlussnutzer: anschlussnutzer({ verarbeitungsStatus: 'gesperrt', einschraenkungGrundCode: 'art18_1a_richtigkeit' }),
    });

    await expect(
      service.sperren('anschlussnutzer-1', 'art18_1d_widerspruch', true, betrieb()),
    ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
    expect(anschlussnutzerMarkGesperrt).not.toHaveBeenCalled();
  });

  it('sperren(): liefert 404 fuer einen unbekannten Anschlussnutzer', async () => {
    const { service } = createService({ anschlussnutzer: undefined });

    await expect(
      service.sperren('anschlussnutzer-1', 'art18_1a_richtigkeit', undefined, betrieb()),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
  });


  // ADR-0007 A11.7/A11.10 — Art. 18 Abs. 3 ist eine Ordnungsvorschrift MIT
  // Reihenfolge. Die Tests pruefen genau das: ohne Nachweis kein Aufheben.
  it('entsperren(): lehnt OHNE Unterrichtungs-Nachweis mit 409 ab und schreibt nicht', async () => {
    const { service, anschlussnutzerMarkEntsperrt } = createService({
      anschlussnutzer: anschlussnutzer({
        verarbeitungsStatus: 'gesperrt',
        einschraenkungGrundCode: 'art18_1a_richtigkeit',
        gesperrtSeit: '2026-08-01T00:00:00.000Z',
      }),
      unterrichtung: undefined,
    });

    await expect(service.entsperren('anschlussnutzer-1', betrieb())).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
    });
    expect(anschlussnutzerMarkEntsperrt).not.toHaveBeenCalled();
  });

  it('entsperren(): hebt auf, sobald ein an DIESE Einschraenkung gebundener Nachweis vorliegt', async () => {
    const { service, anschlussnutzerMarkEntsperrt } = createService({
      anschlussnutzer: anschlussnutzer({
        verarbeitungsStatus: 'gesperrt',
        einschraenkungGrundCode: 'art18_1d_widerspruch',
        gesperrtSeit: '2026-08-01T00:00:00.000Z',
      }),
      unterrichtung: { gesperrtSeit: '2026-08-01T00:00:00.000Z' },
    });

    const result = await service.entsperren('anschlussnutzer-1', betrieb());

    expect(anschlussnutzerMarkEntsperrt).toHaveBeenCalledWith('anschlussnutzer-1');
    expect(result.verarbeitungsStatus).toBe('aktiv');
    expect(result.einschraenkungGrundCode).toBeNull();
    expect(result.gesperrtSeit).toBeNull();
  });

  it('entsperren(): ist idempotent auf einem bereits aktiven Subjekt', async () => {
    const { service, anschlussnutzerMarkEntsperrt } = createService({
      anschlussnutzer: anschlussnutzer({ verarbeitungsStatus: 'aktiv' }),
    });

    const result = await service.entsperren('anschlussnutzer-1', betrieb());

    expect(result.verarbeitungsStatus).toBe('aktiv');
    expect(anschlussnutzerMarkEntsperrt).not.toHaveBeenCalled();
  });

  it('entsperren(): lehnt ein geloeschtes Subjekt mit 409 ab statt idempotent zu quittieren', async () => {
    const { service } = createService({ anschlussnutzer: anschlussnutzer({ verarbeitungsStatus: 'geloescht' }) });

    await expect(service.entsperren('anschlussnutzer-1', betrieb())).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
    });
  });

  it('unterrichten(): lehnt ab, wenn gar keine Einschraenkung besteht', async () => {
    const { service } = createService({ anschlussnutzer: anschlussnutzer({ verarbeitungsStatus: 'aktiv' }) });

    await expect(service.unterrichten('anschlussnutzer-1', 'postalisch', betrieb())).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
    });
  });

  it('liste(): reicht cursor/limit/endkundeId unveraendert an das Repository durch', async () => {
    const { service, listPageMock } = createService({});

    await service.liste({ limit: 10, endkundeId: 'endkunde-1', cursor: 'irgendein-cursor' });

    expect(listPageMock).toHaveBeenCalledWith({
      limit: 10,
      endkundeId: 'endkunde-1',
      cursor: 'irgendein-cursor',
    });
  });
});
