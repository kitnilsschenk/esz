import { beforeAll, describe, expect, it, vi } from 'vitest';
import { StandortService } from './standort.service';
import { ensureNoOpTransactionHost } from '../test-support/init-noop-transaction-host';
import { ProblemDetailsException } from '../../common/exceptions/problem-details.exception';
import { FieldCipherService } from '../../common/crypto/field-cipher.service';
import type { KeyManagementPort } from '../../common/crypto/key-management.port';
import type { EnergyStandortRepository, Standort } from '../persistence/energy/energy-standort.repository';
import type { EnergyZaehlerStandortRepository } from '../persistence/energy/energy-zaehler-standort.repository';
import type { IdentityStandortPiiRepository, StandortPii } from '../persistence/identity/identity-standort-pii.repository';
import type { EnergyEndkundeRepository, Endkunde } from '../persistence/energy/energy-endkunde.repository';
import type { EndkundePii, IdentityEndkundePiiRepository } from '../persistence/identity/identity-endkunde-pii.repository';
import type {
  IdentitySubjektSchluesselRepository,
  SubjektSchluessel,
} from '../persistence/identity/identity-subjekt-schluessel.repository';
import type { StandortAnlegenDto } from './dto/standort-anlegen.dto';

const dek = Buffer.alloc(32, 9);
const fieldCipher = new FieldCipherService();

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

function endkundePii(overrides: Partial<EndkundePii> = {}): EndkundePii {
  return {
    id: 'endkunde-pii-1',
    pseudonymId: 'endkunde-1',
    cryptoKeyId: 'endkunden-dek-1',
    nameEnc: Buffer.from('irrelevant'),
    anschriftEnc: Buffer.from('irrelevant'),
    kontaktEnc: null,
    piiStatus: 'aktiv',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function subjektSchluessel(overrides: Partial<SubjektSchluessel> = {}): SubjektSchluessel {
  return {
    id: 'endkunden-dek-1',
    wrappedDek: Buffer.from('wrapped'),
    kmsKeyId: 'dev-local:v1',
    algVersion: 1,
    keyState: 'aktiv',
    createdAt: '2026-07-01T00:00:00.000Z',
    geschreddertAt: null,
    ...overrides,
  };
}

function standort(overrides: Partial<Standort> = {}): Standort {
  return {
    id: 'standort-1',
    endkundeId: 'endkunde-1',
    parentId: null,
    typ: 'liegenschaft',
    pfad: ['standort-1'],
    ebene: 0,
    sortierung: 0,
    klimareferenz: null,
    status: 'aktiv',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function standortPii(overrides: Partial<StandortPii> = {}): StandortPii {
  return {
    id: 'standort-pii-1',
    pseudonymId: 'standort-1',
    cryptoKeyId: 'endkunden-dek-1',
    bezeichnungEnc: Buffer.from('irrelevant'),
    anschriftEnc: null,
    geoEnc: null,
    piiStatus: 'aktiv',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

interface Setup {
  readonly service: StandortService;
  readonly standortPiiInsert: ReturnType<typeof vi.fn>;
  readonly standortInsert: ReturnType<typeof vi.fn>;
  readonly deleteByIdMock: ReturnType<typeof vi.fn>;
  readonly hatAktiveKinderMock: ReturnType<typeof vi.fn>;
  readonly hatOffeneVerortungMock: ReturnType<typeof vi.fn>;
  readonly deletePiiByPseudonymIdMock: ReturnType<typeof vi.fn>;
}

function createService(overrides: {
  endkunde?: Endkunde | undefined;
  endkundePii?: EndkundePii | undefined;
  subjektSchluessel?: SubjektSchluessel | undefined;
  standorteById?: Record<string, Standort | undefined>;
  standortPiiByPseudonymId?: Record<string, StandortPii | undefined>;
  hatAktiveKinder?: boolean;
  hatOffeneVerortung?: boolean;
  hatKinder?: boolean;
  hatJemalsVerortung?: boolean;
  nachfahrenAnzahl?: number;
  nachfahrenMaxEbene?: number | undefined;
}): Setup {
  const standorteById = overrides.standorteById ?? {};
  const standortPiiByPseudonymId = overrides.standortPiiByPseudonymId ?? {};

  const deleteByIdMock = vi.fn(() => Promise.resolve(true));
  const hatAktiveKinderMock = vi.fn(() => Promise.resolve(overrides.hatAktiveKinder ?? false));
  const hatOffeneVerortungMock = vi.fn(() => Promise.resolve(overrides.hatOffeneVerortung ?? false));

  const standortInsert = vi.fn((input: { id: string; endkundeId: string; parentId: string | null; typ: Standort['typ']; sortierung: number }) =>
    Promise.resolve(
      standort({
        id: input.id,
        endkundeId: input.endkundeId,
        parentId: input.parentId,
        typ: input.typ,
        sortierung: input.sortierung,
        pfad: input.parentId === null ? [input.id] : [...(standorteById[input.parentId]?.pfad ?? []), input.id],
        ebene: input.parentId === null ? 0 : (standorteById[input.parentId]?.ebene ?? 0) + 1,
      }),
    ),
  );

  const standortRepo = {
    findById: vi.fn((id: string) => Promise.resolve(standorteById[id])),
    insert: standortInsert,
    updateStruktur: vi.fn((id: string, input: { typ?: Standort['typ']; sortierung?: number }) => {
      const existing = standorteById[id];
      return Promise.resolve(existing === undefined ? undefined : { ...existing, ...input });
    }),
    updateParent: vi.fn((id: string, neuerParentId: string | null) => {
      const existing = standorteById[id];
      return Promise.resolve(existing === undefined ? undefined : { ...existing, parentId: neuerParentId });
    }),
    stilllegen: vi.fn((id: string) => {
      const existing = standorteById[id];
      return Promise.resolve(existing === undefined ? undefined : { ...existing, status: 'stillgelegt' as const });
    }),
    deleteById: deleteByIdMock,
    hatAktiveKinder: hatAktiveKinderMock,
    hatKinder: vi.fn(() => Promise.resolve(overrides.hatKinder ?? false)),
    findNachfahrenStatistik: vi.fn(() =>
      Promise.resolve({ anzahl: overrides.nachfahrenAnzahl ?? 0, maxEbene: overrides.nachfahrenMaxEbene }),
    ),
  } as unknown as EnergyStandortRepository;

  const zaehlerStandortRepo = {
    countAktivByStandortId: vi.fn(() => Promise.resolve(0)),
    hatOffeneVerortungAmStandort: hatOffeneVerortungMock,
    hatJemalsVerortungAmStandort: vi.fn(() => Promise.resolve(overrides.hatJemalsVerortung ?? false)),
  } as unknown as EnergyZaehlerStandortRepository;

  const standortPiiInsert = vi.fn((input: { id: string; pseudonymId: string; cryptoKeyId: string; bezeichnungEnc: Buffer; anschriftEnc: Buffer | null; geoEnc: Buffer | null }) =>
    Promise.resolve(standortPii({ ...input })),
  );
  const deletePiiByPseudonymIdMock = vi.fn(() => Promise.resolve(true));
  const standortPiiRepo = {
    insert: standortPiiInsert,
    findByPseudonymId: vi.fn((pseudonymId: string) => Promise.resolve(standortPiiByPseudonymId[pseudonymId])),
    updateByPseudonymId: vi.fn(() => Promise.resolve(undefined)),
    deleteByPseudonymId: deletePiiByPseudonymIdMock,
  } as unknown as IdentityStandortPiiRepository;

  const endkundeRepo = {
    findById: vi.fn(() => Promise.resolve(overrides.endkunde)),
  } as unknown as EnergyEndkundeRepository;

  const endkundePiiRepo = {
    findByPseudonymId: vi.fn(() => Promise.resolve(overrides.endkundePii)),
  } as unknown as IdentityEndkundePiiRepository;

  const subjektSchluesselRepo = {
    findById: vi.fn(() => Promise.resolve(overrides.subjektSchluessel)),
  } as unknown as IdentitySubjektSchluesselRepository;

  const kms: KeyManagementPort = {
    generateDataKey: vi.fn(() =>
      Promise.resolve({ dek, wrappedDek: Buffer.from('wrapped'), kmsKeyId: 'dev-local:v1', algVersion: 1 }),
    ),
    unwrapDek: vi.fn(() => Promise.resolve(dek)),
  };

  const service = new StandortService(
    standortRepo,
    zaehlerStandortRepo,
    standortPiiRepo,
    endkundeRepo,
    endkundePiiRepo,
    subjektSchluesselRepo,
    kms,
    fieldCipher,
  );

  return {
    service,
    standortPiiInsert,
    standortInsert,
    deleteByIdMock,
    hatAktiveKinderMock,
    hatOffeneVerortungMock,
    deletePiiByPseudonymIdMock,
  };
}

describe('StandortService (ADR-0010) — anlegen()', () => {
  beforeAll(() => {
    ensureNoOpTransactionHost();
  });

  const dto: StandortAnlegenDto = { typ: 'liegenschaft', bezeichnung: 'Werk Nord', adresse: 'Musterstr. 1' };

  it('legt einen Wurzelknoten an, verwendet den ENDKUNDEN-DEK (KEIN neuer DEK), AAD bindet die generierte standortId', async () => {
    const { service, standortPiiInsert } = createService({
      endkunde: endkunde(),
      endkundePii: endkundePii({ cryptoKeyId: 'endkunden-dek-1' }),
      subjektSchluessel: subjektSchluessel({ id: 'endkunden-dek-1' }),
    });

    const result = await service.anlegen('endkunde-1', dto);

    expect(result.typ).toBe('liegenschaft');
    expect(result.hatAdresse).toBe(true);
    expect(result).not.toHaveProperty('bezeichnung');

    // DEK-Wiederverwendung (D4/A2): kein neuer subjekt_schluessel generiert,
    // der Standort-PII-Datensatz traegt DENSELBEN crypto_key_id wie der Endkunde.
    expect(standortPiiInsert).toHaveBeenCalledTimes(1);
    const firstCall = standortPiiInsert.mock.calls[0];
    if (firstCall === undefined) {
      throw new Error('standortPiiInsert wurde nicht aufgerufen.');
    }
    const insertCall = firstCall[0] as { pseudonymId: string; cryptoKeyId: string; bezeichnungEnc: Buffer };
    expect(insertCall.cryptoKeyId).toBe('endkunden-dek-1');

    // AAD-Bindung (D4, zentrale Sicherheitsauflage): die AAD bindet die
    // STANDORT-id (subjektId), NICHT die endkundeId — decrypt() mit der
    // richtigen standortId gelingt, mit einer FALSCHEN (z. B. endkundeId) schlaegt es fehl.
    const dekBytes = dek;
    const decrypted = fieldCipher.decrypt(dekBytes, insertCall.pseudonymId, 'bezeichnung', insertCall.bezeichnungEnc);
    expect(decrypted).toBe('Werk Nord');
    expect(() => fieldCipher.decrypt(dekBytes, 'endkunde-1', 'bezeichnung', insertCall.bezeichnungEnc)).toThrow();
  });

  it('lehnt ab (404), wenn der Endkunde nicht existiert', async () => {
    const { service } = createService({ endkunde: undefined });

    await expect(service.anlegen('endkunde-1', dto)).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('lehnt ab (400), wenn parentId zu einem ANDEREN Endkunden gehoert (D2.1, Mandantentreue)', async () => {
    const { service } = createService({
      endkunde: endkunde(),
      endkundePii: endkundePii(),
      subjektSchluessel: subjektSchluessel(),
      standorteById: { 'fremd-1': standort({ id: 'fremd-1', endkundeId: 'endkunde-FREMD' }) },
    });

    await expect(service.anlegen('endkunde-1', { ...dto, parentId: 'fremd-1' })).rejects.toBeInstanceOf(
      ProblemDetailsException,
    );
  });

  it('lehnt ab (400), wenn ein Wurzelknoten (kein parentId) NICHT liegenschaft/gebaeude ist (D2.4)', async () => {
    const { service } = createService({ endkunde: endkunde(), endkundePii: endkundePii(), subjektSchluessel: subjektSchluessel() });

    await expect(service.anlegen('endkunde-1', { ...dto, typ: 'raum' })).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('lehnt ab (400), wenn ein Wurzelknoten OHNE adresse angelegt wird (D4: Adresse Pflicht auf Wurzelknoten)', async () => {
    const { service } = createService({ endkunde: endkunde(), endkundePii: endkundePii(), subjektSchluessel: subjektSchluessel() });

    await expect(
      service.anlegen('endkunde-1', { typ: 'liegenschaft', bezeichnung: 'Ohne Adresse' }),
    ).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('lehnt ab (400), wenn eine adresse auf einer NICHT-adressfaehigen Ebene angegeben wird (D4: raum verboten)', async () => {
    const { service } = createService({
      endkunde: endkunde(),
      endkundePii: endkundePii(),
      subjektSchluessel: subjektSchluessel(),
      standorteById: { wurzel: standort({ id: 'wurzel', typ: 'liegenschaft', parentId: null }) },
    });

    await expect(
      service.anlegen('endkunde-1', { typ: 'raum', parentId: 'wurzel', bezeichnung: 'Serverraum', adresse: 'unzulaessig' }),
    ).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('erlaubt eine OPTIONALE adresse auf typ=gebaeude unterhalb einer Liegenschaft (D4)', async () => {
    const { service } = createService({
      endkunde: endkunde(),
      endkundePii: endkundePii(),
      subjektSchluessel: subjektSchluessel(),
      standorteById: { wurzel: standort({ id: 'wurzel', typ: 'liegenschaft', parentId: null }) },
    });

    const result = await service.anlegen('endkunde-1', {
      typ: 'gebaeude',
      parentId: 'wurzel',
      bezeichnung: 'Halle B',
      adresse: 'Nebenstrasse 2',
    });

    expect(result.hatAdresse).toBe(true);
  });

  it('lehnt ab (409), wenn der Endkunde bereits krypto-geschreddert ist (kein neuer Standort ohne DEK)', async () => {
    const { service } = createService({
      endkunde: endkunde(),
      endkundePii: endkundePii(),
      subjektSchluessel: subjektSchluessel({ keyState: 'geschreddert' }),
    });

    await expect(service.anlegen('endkunde-1', dto)).rejects.toBeInstanceOf(ProblemDetailsException);
  });
});

describe('StandortService — aendern() (Struktur)', () => {
  beforeAll(() => {
    ensureNoOpTransactionHost();
  });

  it('lehnt ab (400), wenn ein Wurzelknoten per PATCH auf einen NICHT-adressfaehigen typ geaendert werden soll (D2.4)', async () => {
    const { service } = createService({ standorteById: { s1: standort({ id: 's1', parentId: null, typ: 'liegenschaft' }) } });

    await expect(service.aendern('s1', { typ: 'raum' })).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('aendert sortierung erfolgreich (Happy Path)', async () => {
    const { service } = createService({ standorteById: { s1: standort({ id: 's1' }) } });

    const result = await service.aendern('s1', { sortierung: 5 });

    expect(result.sortierung).toBe(5);
  });

  it('lehnt ab (400), wenn kein Feld gesetzt ist', async () => {
    const { service } = createService({ standorteById: { s1: standort({ id: 's1' }) } });

    await expect(service.aendern('s1', {})).rejects.toBeInstanceOf(ProblemDetailsException);
  });
});

describe('StandortService — verschieben() (Reparent, D6)', () => {
  beforeAll(() => {
    ensureNoOpTransactionHost();
  });

  it('verschiebt einen Knoten und liefert parentIdAlt + nachfahrenAktualisiert', async () => {
    const { service } = createService({
      standorteById: {
        knoten: standort({ id: 'knoten', parentId: 'alter-parent', typ: 'raum', ebene: 2, pfad: ['w', 'alter-parent', 'knoten'] }),
        'neuer-parent': standort({ id: 'neuer-parent', typ: 'etage', ebene: 1, pfad: ['w', 'neuer-parent'] }),
      },
      nachfahrenAnzahl: 3,
      nachfahrenMaxEbene: 4,
    });

    const result = await service.verschieben('knoten', 'neuer-parent');

    expect(result.parentIdAlt).toBe('alter-parent');
    expect(result.nachfahrenAktualisiert).toBe(3);
  });

  it('lehnt ab (409), wenn der Ziel-Parent ein Nachfahre (oder der Knoten selbst) ist — Zyklus (D2.2/D6)', async () => {
    const { service } = createService({
      standorteById: {
        knoten: standort({ id: 'knoten', pfad: ['knoten'] }),
        nachfahre: standort({ id: 'nachfahre', pfad: ['knoten', 'nachfahre'] }),
      },
    });

    await expect(service.verschieben('knoten', 'nachfahre')).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('lehnt ab (400), wenn der Ziel-Parent zu einem ANDEREN Endkunden gehoert (D2.1, Mandantentreue)', async () => {
    const { service } = createService({
      standorteById: {
        knoten: standort({ id: 'knoten', endkundeId: 'endkunde-A' }),
        fremd: standort({ id: 'fremd', endkundeId: 'endkunde-B' }),
      },
    });

    await expect(service.verschieben('knoten', 'fremd')).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('lehnt ab (409), wenn das Tiefenlimit (0-9) durch den Move ueberschritten wuerde (D2.3)', async () => {
    const { service } = createService({
      standorteById: {
        knoten: standort({ id: 'knoten', ebene: 2 }),
        'tiefer-parent': standort({ id: 'tiefer-parent', ebene: 8 }),
      },
      nachfahrenAnzahl: 1,
      nachfahrenMaxEbene: 3, // relative Tiefe = 3 - 2 = 1 -> 8+1+1 = 10 > 9
    });

    await expect(service.verschieben('knoten', 'tiefer-parent')).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('lehnt ab (400), wenn ein NICHT-liegenschaft/gebaeude-Knoten an die Wurzel verschoben wird (D2.4)', async () => {
    const { service } = createService({ standorteById: { knoten: standort({ id: 'knoten', typ: 'raum' }) } });

    await expect(service.verschieben('knoten', null)).rejects.toBeInstanceOf(ProblemDetailsException);
  });
});

describe('StandortService — stilllegen() (D2.6)', () => {
  beforeAll(() => {
    ensureNoOpTransactionHost();
  });

  it('legt still (Happy Path), statusAlt=aktiv', async () => {
    const { service } = createService({ standorteById: { s1: standort({ id: 's1', status: 'aktiv' }) } });

    const result = await service.stilllegen('s1');

    expect(result.statusAlt).toBe('aktiv');
    expect(result.standort.status).toBe('stillgelegt');
  });

  it('lehnt ab (409), wenn aktive Kinder existieren (D2.6(a))', async () => {
    const { service } = createService({ standorteById: { s1: standort({ id: 's1' }) }, hatAktiveKinder: true });

    await expect(service.stilllegen('s1')).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('lehnt ab (409), wenn eine offene Verortung existiert (D2.6(b))', async () => {
    const { service } = createService({ standorteById: { s1: standort({ id: 's1' }) }, hatOffeneVerortung: true });

    await expect(service.stilllegen('s1')).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('ist idempotent: bereits stillgelegt -> KEINE Vorbedingungspruefung, statusAlt=stillgelegt', async () => {
    const { service, hatAktiveKinderMock, hatOffeneVerortungMock } = createService({
      standorteById: { s1: standort({ id: 's1', status: 'stillgelegt' }) },
    });

    const result = await service.stilllegen('s1');

    expect(result.statusAlt).toBe('stillgelegt');
    expect(hatAktiveKinderMock).not.toHaveBeenCalled();
    expect(hatOffeneVerortungMock).not.toHaveBeenCalled();
  });
});

describe('StandortService — loeschen() (hartes DELETE, D2.6)', () => {
  beforeAll(() => {
    ensureNoOpTransactionHost();
  });

  it('loescht einen Blattknoten OHNE Verortungshistorie (Happy Path)', async () => {
    const { service, deleteByIdMock, deletePiiByPseudonymIdMock } = createService({
      standorteById: { s1: standort({ id: 's1', endkundeId: 'endkunde-1', typ: 'liegenschaft', parentId: null }) },
    });

    const result = await service.loeschen('s1');

    expect(result).toEqual({
      id: 's1',
      geloescht: true,
      endkundeId: 'endkunde-1',
      typ: 'liegenschaft',
      parentIdAlt: null,
    });
    expect(deletePiiByPseudonymIdMock).toHaveBeenCalledWith('s1');
    expect(deleteByIdMock).toHaveBeenCalledWith('s1');
  });

  it('lehnt ab (409), wenn der Knoten Kinder hat (D2.6)', async () => {
    const { service } = createService({ standorteById: { s1: standort({ id: 's1' }) }, hatKinder: true });

    await expect(service.loeschen('s1')).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('lehnt ab (409), wenn der Knoten (auch historisch) eine Verortung traegt (D2.6)', async () => {
    const { service } = createService({ standorteById: { s1: standort({ id: 's1' }) }, hatJemalsVerortung: true });

    await expect(service.loeschen('s1')).rejects.toBeInstanceOf(ProblemDetailsException);
  });
});
