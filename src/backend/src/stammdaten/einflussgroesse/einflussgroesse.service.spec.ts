import { beforeAll, describe, expect, it, vi } from 'vitest';
import { EinflussgroesseService } from './einflussgroesse.service';
import { ensureNoOpTransactionHost } from '../test-support/init-noop-transaction-host';
import { ProblemDetailsException } from '../../common/exceptions/problem-details.exception';
import type { SecurityContext } from '../../common/security/security-context';
import type { EnergySystemRepository, System } from '../persistence/energy/energy-system.repository';
import type { EnergyEndkundeRepository, Endkunde } from '../persistence/energy/energy-endkunde.repository';
import type { EnergyStandortRepository, Standort } from '../persistence/energy/energy-standort.repository';
import type { EnergyZaehlerStandortRepository } from '../persistence/energy/energy-zaehler-standort.repository';
import type { EinflussKatalogRepository, EinflussKatalog } from '../persistence/einfluss/einfluss-katalog.repository';
import type { EinflussIntervall, InsertEinflussIntervallInput } from '../persistence/einfluss/einfluss-intervall.repository';
import { EinflussIntervallRepository, PG_EXCLUSION_VIOLATION } from '../persistence/einfluss/einfluss-intervall.repository';
import type { EinflussBefundRepository, EinflussBefund } from '../persistence/einfluss/einfluss-befund.repository';
import type { AuditService } from '../../audit/audit.service';
import type { EinflussgroesseErfassenDto } from './dto/einflussgroesse-erfassen.dto';
import type { EinflussgroesseKorrigierenDto } from './dto/einflussgroesse-korrigieren.dto';

function system(overrides: Partial<System> = {}): System {
  return {
    id: 'system-1',
    endkundeId: 'endkunde-1',
    bezeichnung: 'Testsystem',
    systemgrenze: 'Gebaeude A',
    systembeschreibung: null,
    standortId: null,
    status: 'aktiv',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function endkunde(overrides: Partial<Endkunde> = {}): Endkunde {
  return {
    id: 'endkunde-1',
    verarbeitungsStatus: 'aktiv',
    consentStatus: 'fehlt',
    consentTextVersion: null,
    vonWissAuswertungAusgenommen: false,
    endkundengruppe: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
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
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function katalog(overrides: Partial<EinflussKatalog> = {}): EinflussKatalog {
  return {
    code: 'personenanzahl',
    wertArt: 'numerisch',
    einheit: 'Personen',
    aktiv: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function intervall(overrides: Partial<EinflussIntervall> = {}): EinflussIntervall {
  return {
    id: 'intervall-1',
    endkundeId: 'endkunde-1',
    systemId: 'system-1',
    standortId: null,
    groesseCode: 'personenanzahl',
    wertNum: '5.000',
    wertCode: null,
    gueltigAbMonat: '2026-01-01',
    gueltigBisMonat: null,
    betroffenerTyp: 'endkunde',
    quelleTyp: 'betriebsteam',
    rechtsgrundlage: 'art6_1b',
    abwaegungRef: null,
    art14InformationAt: null,
    anlassCode: 'ersterfassung',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function befund(overrides: Partial<EinflussBefund> = {}): EinflussBefund {
  return {
    id: 'befund-1',
    systemId: 'system-1',
    groesseCode: 'personenanzahl',
    zeitraumVon: '2026-01-01',
    zeitraumBis: '2026-02-01',
    ueberschreitungKlasse: 'schwelle_ueberschritten',
    erkanntAt: '2026-02-05T00:00:00.000Z',
    ...overrides,
  };
}

/** `wertNum`/`wertCode` erlauben hier ausnahmsweise ein EXPLIZITES `undefined` (Test-Overrides, die den jeweils ANDEREN Wert-Typ erzwingen wollen) — `exactOptionalPropertyTypes` verbietet das sonst auf `Partial<T>`. */
type ErfassenDtoOverrides = Omit<Partial<EinflussgroesseErfassenDto>, 'wertNum' | 'wertCode'> & {
  wertNum?: number | undefined;
  wertCode?: string | undefined;
};

function erfassenDto(overrides: ErfassenDtoOverrides = {}): EinflussgroesseErfassenDto {
  return {
    groesseCode: 'personenanzahl',
    wertNum: 5,
    gueltigAbMonat: '2026-01-01',
    betroffenerTyp: 'endkunde',
    quelleTyp: 'betriebsteam',
    rechtsgrundlage: 'art6_1b',
    ...overrides,
  } as EinflussgroesseErfassenDto;
}

function subject(overrides: Partial<SecurityContext> = {}): SecurityContext {
  return { sub: 'betrieb-sub', actorTyp: 'benutzer', roles: ['betrieb'], azp: 'edms-bff', ...overrides };
}

interface ServiceMocks {
  readonly service: EinflussgroesseService;
  readonly insertMock: ReturnType<typeof vi.fn>;
  readonly schliessenMock: ReturnType<typeof vi.fn>;
  readonly findOffenMock: ReturnType<typeof vi.fn>;
  readonly hatVerortungMock: ReturnType<typeof vi.fn>;
  readonly auditAppendMock: ReturnType<typeof vi.fn>;
}

function createService(overrides: {
  system?: System | undefined;
  endkunde?: Endkunde | undefined;
  standort?: Standort | undefined;
  katalog?: EinflussKatalog | undefined;
  /** `true` simuliert einen unbekannten/nicht existierenden Katalog-Code (`findByCode()` -> `undefined`) — sonst greift der `katalog()`-Default. */
  katalogNichtGefunden?: boolean;
  offenerVorgaenger?: EinflussIntervall | undefined;
  original?: EinflussIntervall | undefined;
  hatVerortung?: boolean;
  systemIds?: readonly string[];
  befunde?: readonly EinflussBefund[];
  insertThrows?: Error;
}): ServiceMocks {
  const insertMock = vi.fn((input: InsertEinflussIntervallInput) => {
    if (overrides.insertThrows !== undefined) {
      return Promise.reject(overrides.insertThrows);
    }
    return Promise.resolve(
      intervall({
        ...input,
        // `EinflussIntervallRepository`/`EinflussIntervall` traegt `wertNum` als
        // STRING (numeric(18,3)-Praezisionserhalt aus `pg`) — der Insert-Input
        // dagegen als `number` (Service-/DTO-seitig). Der Mock spiegelt exakt
        // diese Persistenz-Roundtrip-Konvertierung.
        wertNum: input.wertNum === null ? null : String(input.wertNum),
      }),
    );
  });
  const schliessenMock = vi.fn((id: string, gueltigBisMonat: string) =>
    Promise.resolve(intervall({ id, gueltigBisMonat })),
  );
  const findOffenMock = vi.fn(() => Promise.resolve(overrides.offenerVorgaenger));
  const findByIdMock = vi.fn(() => Promise.resolve(overrides.original));
  const listBySystemMock = vi.fn(() => Promise.resolve([intervall()]));

  const intervallRepo = {
    insert: insertMock,
    findById: findByIdMock,
    findOffenBySystemUndGroesse: findOffenMock,
    schliessen: schliessenMock,
    listBySystem: listBySystemMock,
  } as unknown as EinflussIntervallRepository;

  const systemRepo = {
    findById: vi.fn(() => Promise.resolve(overrides.system)),
    listIdsByEndkunde: vi.fn(() => Promise.resolve(overrides.systemIds ?? [])),
  } as unknown as EnergySystemRepository;

  const endkundeRepo = {
    findById: vi.fn(() => Promise.resolve(overrides.endkunde)),
  } as unknown as EnergyEndkundeRepository;

  const standortRepo = {
    findById: vi.fn(() => Promise.resolve(overrides.standort)),
  } as unknown as EnergyStandortRepository;

  const hatVerortungMock = vi.fn(() => Promise.resolve(overrides.hatVerortung ?? true));
  const zaehlerStandortRepo = {
    hatVerortungImTeilbaumUndZeitraum: hatVerortungMock,
  } as unknown as EnergyZaehlerStandortRepository;

  const katalogRepo = {
    findByCode: vi.fn(() =>
      Promise.resolve(overrides.katalogNichtGefunden === true ? undefined : (overrides.katalog ?? katalog())),
    ),
  } as unknown as EinflussKatalogRepository;

  const befundRepo = {
    findBySystemIds: vi.fn(() => Promise.resolve(overrides.befunde ?? [])),
  } as unknown as EinflussBefundRepository;

  const auditAppendMock = vi.fn(() => Promise.resolve({}));
  const auditService = { append: auditAppendMock } as unknown as AuditService;

  const service = new EinflussgroesseService(
    systemRepo,
    endkundeRepo,
    standortRepo,
    zaehlerStandortRepo,
    katalogRepo,
    intervallRepo,
    befundRepo,
    auditService,
  );

  return { service, insertMock, schliessenMock, findOffenMock, hatVerortungMock, auditAppendMock };
}

describe('EinflussgroesseService.erfassen() (ADR-0006 Teil B, B8/B10)', () => {
  beforeAll(() => {
    ensureNoOpTransactionHost();
  });

  it('Happy-Path: legt ein Intervall an, wenn kein offener Vorgaenger existiert', async () => {
    const { service, insertMock, schliessenMock } = createService({ system: system(), offenerVorgaenger: undefined });

    const result = await service.erfassen('system-1', erfassenDto());

    expect(schliessenMock).not.toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ endkundeId: 'endkunde-1', systemId: 'system-1' }));
    expect(result.endkundeId).toBe('endkunde-1');
  });

  it('lehnt ab (404), wenn das System nicht existiert', async () => {
    const { service } = createService({ system: undefined });

    await expect(service.erfassen('system-1', erfassenDto())).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('wert_art-Konsistenz: numerisch + wertCode statt wertNum -> 400', async () => {
    const { service } = createService({ system: system(), katalog: katalog({ wertArt: 'numerisch' }) });

    await expect(
      service.erfassen('system-1', erfassenDto({ wertNum: undefined, wertCode: 'x' })),
    ).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('wert_art-Konsistenz: codiert + wertNum statt wertCode -> 400', async () => {
    const { service } = createService({
      system: system(),
      katalog: katalog({ code: 'energietraeger_mix', wertArt: 'codiert' }),
    });

    await expect(
      service.erfassen('system-1', erfassenDto({ groesseCode: 'energietraeger_mix', wertNum: 5, wertCode: undefined })),
    ).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('nutzungszweck: wertCode ausserhalb der B12.5-Liste -> 400', async () => {
    const { service } = createService({
      system: system(),
      katalog: katalog({ code: 'nutzungszweck', wertArt: 'codiert' }),
    });

    await expect(
      service.erfassen(
        'system-1',
        erfassenDto({ groesseCode: 'nutzungszweck', wertNum: undefined, wertCode: 'garten' }),
      ),
    ).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('unbekannter Katalog-Code -> 400', async () => {
    const { service } = createService({ system: system(), katalogNichtGefunden: true });

    await expect(service.erfassen('system-1', erfassenDto())).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('Art. 14: betroffenerTyp=anschlussnutzer OHNE abwaegungRef/art14InformationAt -> 400', async () => {
    const { service } = createService({ system: system() });

    await expect(
      service.erfassen('system-1', erfassenDto({ betroffenerTyp: 'anschlussnutzer' })),
    ).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('Art. 14: betroffenerTyp=anschlussnutzer MIT rechtsgrundlage=art6_1f + abwaegungRef + art14InformationAt -> 201 (erfolgreich)', async () => {
    const { service, insertMock } = createService({ system: system() });

    const result = await service.erfassen(
      'system-1',
      erfassenDto({
        betroffenerTyp: 'anschlussnutzer',
        rechtsgrundlage: 'art6_1f',
        abwaegungRef: 'LIA-2026-001',
        art14InformationAt: '2026-01-05T00:00:00.000Z',
      }),
    );

    expect(insertMock).toHaveBeenCalled();
    expect(result.betroffenerTyp).toBe('anschlussnutzer');
  });

  it('RL-B1: standortId gesetzt, aber KEINE Zaehler-Verortung im Zeitraum -> 400', async () => {
    const { service, hatVerortungMock } = createService({
      system: system(),
      standort: standort({ endkundeId: 'endkunde-1' }),
      hatVerortung: false,
    });

    await expect(
      service.erfassen('system-1', erfassenDto({ standortId: 'standort-1' })),
    ).rejects.toBeInstanceOf(ProblemDetailsException);
    expect(hatVerortungMock).toHaveBeenCalledWith('standort-1', '2026-01-01', null);
  });

  it('RL-B1: standortId gehoert zu einem ANDEREN Endkunden (Mandantentreue) -> 400', async () => {
    const { service } = createService({
      system: system({ endkundeId: 'endkunde-1' }),
      standort: standort({ endkundeId: 'endkunde-fremd' }),
    });

    await expect(
      service.erfassen('system-1', erfassenDto({ standortId: 'standort-1' })),
    ).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('RL-B1: standortId gesetzt UND Zaehler-Verortung vorhanden -> erfolgreich', async () => {
    const { service, insertMock } = createService({
      system: system(),
      standort: standort({ endkundeId: 'endkunde-1' }),
      hatVerortung: true,
    });

    await service.erfassen('system-1', erfassenDto({ standortId: 'standort-1' }));

    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ standortId: 'standort-1' }));
  });

  it('Overlap: offener Vorgaenger derselben (system,groesse) wird geschlossen, DANACH die neue Zeile angelegt', async () => {
    const vorgaenger = intervall({ id: 'vorgaenger-1', gueltigAbMonat: '2025-01-01', gueltigBisMonat: null });
    const { service, schliessenMock, insertMock } = createService({
      system: system(),
      offenerVorgaenger: vorgaenger,
    });

    await service.erfassen('system-1', erfassenDto({ gueltigAbMonat: '2026-03-01' }));

    expect(schliessenMock).toHaveBeenCalledWith('vorgaenger-1', '2026-03-01');
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ gueltigAbMonat: '2026-03-01' }));
  });

  it('Overlap: gueltigAbMonat NICHT nach dem Beginn des offenen Vorgaengers -> 400 (invertierte Zeitscheibe)', async () => {
    const vorgaenger = intervall({ id: 'vorgaenger-1', gueltigAbMonat: '2026-05-01', gueltigBisMonat: null });
    const { service } = createService({ system: system(), offenerVorgaenger: vorgaenger });

    await expect(
      service.erfassen('system-1', erfassenDto({ gueltigAbMonat: '2026-01-01' })),
    ).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('EXCLUDE-Constraint-Verletzung (echter Overlap) -> 409', async () => {
    const pgError = Object.assign(new Error('exclusion'), { code: PG_EXCLUSION_VIOLATION });
    const { service } = createService({ system: system(), insertThrows: pgError });

    await expect(service.erfassen('system-1', erfassenDto())).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('gueltigBisMonat <= gueltigAbMonat -> 400 (V0020-CHECK gespiegelt)', async () => {
    const { service } = createService({ system: system() });

    await expect(
      service.erfassen('system-1', erfassenDto({ gueltigBisMonat: '2026-01-01' })),
    ).rejects.toBeInstanceOf(ProblemDetailsException);
  });
});

describe('EinflussgroesseService.korrigieren()', () => {
  beforeAll(() => {
    ensureNoOpTransactionHost();
  });

  it('setzt NUR gueltigBisMonat (KEIN korrektur) -> EIN Audit-Event (.geaendert), neu=null, Werte NICHT ueberschrieben', async () => {
    const original = intervall({ id: 'intervall-1', gueltigAbMonat: '2026-01-01', gueltigBisMonat: null });
    const { service, schliessenMock, insertMock, auditAppendMock } = createService({ original });

    const dto: EinflussgroesseKorrigierenDto = { gueltigBisMonat: '2026-06-01' };
    const result = await service.korrigieren('intervall-1', dto, subject(), false);

    expect(schliessenMock).toHaveBeenCalledWith('intervall-1', '2026-06-01');
    expect(insertMock).not.toHaveBeenCalled();
    expect(result.neu).toBeNull();
    expect(auditAppendMock).toHaveBeenCalledTimes(1);
    expect(auditAppendMock).toHaveBeenCalledWith(
      expect.objectContaining({ eventTyp: 'einflussgroesse.stammdaten.geaendert', objektRef: 'intervall-1' }),
    );
  });

  it('MIT korrektur -> ZWEI Audit-Events (.geaendert fuer das Schliessen, .erfasst fuer die neue Zeile), groesseCode/endkundeId/systemId GEERBT', async () => {
    const original = intervall({
      id: 'intervall-1',
      systemId: 'system-1',
      standortId: null,
      endkundeId: 'endkunde-1',
      groesseCode: 'personenanzahl',
      gueltigAbMonat: '2026-01-01',
      gueltigBisMonat: null,
    });
    const { service, insertMock, auditAppendMock } = createService({ original, katalog: katalog() });

    const dto: EinflussgroesseKorrigierenDto = {
      gueltigBisMonat: '2026-06-01',
      korrektur: {
        wertNum: 7,
        gueltigAbMonat: '2026-06-01',
        betroffenerTyp: 'endkunde',
        quelleTyp: 'betriebsteam',
        rechtsgrundlage: 'art6_1b',
      },
    };
    const result = await service.korrigieren('intervall-1', dto, subject(), true);

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        systemId: 'system-1',
        standortId: null,
        endkundeId: 'endkunde-1',
        groesseCode: 'personenanzahl',
        anlassCode: 'korrektur',
        gueltigAbMonat: '2026-06-01',
      }),
    );
    expect(result.neu).not.toBeNull();
    expect(auditAppendMock).toHaveBeenCalledTimes(2);
    expect(auditAppendMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ eventTyp: 'einflussgroesse.stammdaten.geaendert' }),
    );
    expect(auditAppendMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ eventTyp: 'einflussgroesse.stammdaten.erfasst' }),
    );
  });

  it('lehnt ab (404), wenn das Intervall nicht existiert', async () => {
    const { service } = createService({ original: undefined });

    await expect(
      service.korrigieren('unbekannt', { gueltigBisMonat: '2026-06-01' }, subject(), false),
    ).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('lehnt ab (409), wenn das Intervall BEREITS geschlossen ist', async () => {
    const original = intervall({ id: 'intervall-1', gueltigBisMonat: '2026-03-01' });
    const { service } = createService({ original });

    await expect(
      service.korrigieren('intervall-1', { gueltigBisMonat: '2026-06-01' }, subject(), false),
    ).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('lehnt ab (400), wenn gueltigBisMonat NICHT nach gueltigAbMonat des Intervalls liegt', async () => {
    const original = intervall({ id: 'intervall-1', gueltigAbMonat: '2026-06-01', gueltigBisMonat: null });
    const { service } = createService({ original });

    await expect(
      service.korrigieren('intervall-1', { gueltigBisMonat: '2026-01-01' }, subject(), false),
    ).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('Audit-Kontext enthaelt NIEMALS wertNum/wertCode/anlassCode (PII-Haerte, A5/B10)', async () => {
    const original = intervall({ id: 'intervall-1', gueltigAbMonat: '2026-01-01', gueltigBisMonat: null });
    const { service, auditAppendMock } = createService({ original });

    await service.korrigieren('intervall-1', { gueltigBisMonat: '2026-06-01' }, subject(), false);

    const kontext = (auditAppendMock.mock.calls[0]?.[0] as { kontext: Record<string, unknown> }).kontext;
    expect(kontext).not.toHaveProperty('wertNum');
    expect(kontext).not.toHaveProperty('wertCode');
    expect(kontext).not.toHaveProperty('wert_num');
    expect(kontext).not.toHaveProperty('wert_code');
    expect(kontext).not.toHaveProperty('anlassCode');
    expect(kontext).not.toHaveProperty('anlass_code');
  });
});

describe('EinflussgroesseService.listeFuerSystem()', () => {
  beforeAll(() => {
    ensureNoOpTransactionHost();
  });

  it('liefert die Klartext-Liste (Happy-Path erfassen -> lesen)', async () => {
    const { service } = createService({ system: system() });

    const result = await service.listeFuerSystem('system-1');

    expect(result).toHaveLength(1);
  });

  it('lehnt ab (404), wenn das System nicht existiert', async () => {
    const { service } = createService({ system: undefined });

    await expect(service.listeFuerSystem('system-1')).rejects.toBeInstanceOf(ProblemDetailsException);
  });
});

describe('EinflussgroesseService.befundeFuerEndkunde()', () => {
  beforeAll(() => {
    ensureNoOpTransactionHost();
  });

  it('loest endkundeId -> system_id[] -> Befunde auf (KEIN Cross-Schema-JOIN)', async () => {
    const { service } = createService({ endkunde: endkunde(), systemIds: ['system-1', 'system-2'], befunde: [befund()] });

    const result = await service.befundeFuerEndkunde('endkunde-1');

    expect(result).toHaveLength(1);
    expect(result[0]?.ueberschreitungKlasse).toBe('schwelle_ueberschritten');
  });

  it('lehnt ab (404), wenn der Endkunde nicht existiert', async () => {
    const { service } = createService({ endkunde: undefined });

    await expect(service.befundeFuerEndkunde('endkunde-1')).rejects.toBeInstanceOf(ProblemDetailsException);
  });
});
