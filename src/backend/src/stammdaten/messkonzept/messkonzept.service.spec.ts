import { beforeAll, describe, expect, it, vi } from 'vitest';
import { MesskonzeptService } from './messkonzept.service';
import { ProblemDetailsException } from '../../common/exceptions/problem-details.exception';
import { ensureNoOpTransactionHost } from '../test-support/init-noop-transaction-host';
import type {
  EnergyMesskonzeptRepository,
  MesskonzeptHeader,
  MesskonzeptVersion,
} from '../persistence/energy/energy-messkonzept.repository';
import type { EnergyEndkundeRepository, Endkunde } from '../persistence/energy/energy-endkunde.repository';

/**
 * Unit-Tests (Repo-Fakes, KEIN echter DB-Zugriff, Muster
 * `endkunde.service.spec.ts`) für `MesskonzeptService` — schließt die
 * Merge-Blocker-Lücke aus dem Phase-4-Review (`.claude/rules/tests.md`).
 * Deckt insbesondere die Append-only-Versionierungs-Invariante ab: eine
 * neue Version SCHLIESST die bisher aktuelle (Linie 3, kein Editieren).
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

function header(overrides: Partial<MesskonzeptHeader> = {}): MesskonzeptHeader {
  return { id: 'messkonzept-1', endkundeId: 'endkunde-1', createdAt: '2026-07-01T00:00:00.000Z', ...overrides };
}

function version(overrides: Partial<MesskonzeptVersion> = {}): MesskonzeptVersion {
  return {
    id: 'version-1',
    messkonzeptId: 'messkonzept-1',
    versionNr: 1,
    typ: 'standard',
    systemgrenze: 'Gebaeude A',
    systembeschreibung: 'Testbeschreibung',
    bereinigungsverfahren: 'Testverfahren',
    messgeraeteWahl: 'Testwahl',
    geraeteerkennungsVerfahren: 'Testverfahren',
    aenderungsgrund: null,
    gueltigVon: '2026-07-01T00:00:00.000Z',
    gueltigBis: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

const gueltigeDto = {
  typ: 'standard' as const,
  systemgrenze: 'Gebaeude A',
  systembeschreibung: 'Testbeschreibung',
  bereinigungsverfahren: 'Testverfahren',
  messgeraeteWahl: 'Testwahl',
  geraeteerkennungsVerfahren: 'Testverfahren',
  energietraeger: [{ energietraeger: 'strom' as const }],
};

function createService(overrides: {
  readonly endkunde?: Endkunde | undefined;
  readonly header?: MesskonzeptHeader | undefined;
  readonly maxVersionNr?: number;
  readonly version?: MesskonzeptVersion | undefined;
}): {
  service: MesskonzeptService;
  messkonzeptRepo: EnergyMesskonzeptRepository;
  // Eigenstaendige `vi.fn()`-Referenzen statt `messkonzeptRepo.closeCurrentVersion`/
  // `.insertHeader` (`@typescript-eslint/unbound-method` — eine ueber die
  // Interface-typisierte Instanz referenzierte Methode gilt lint-seitig als
  // potenziell an `this` gebunden; separat gehaltene Mock-Funktionen haben
  // diesen Typ nicht).
  closeCurrentVersionMock: ReturnType<typeof vi.fn>;
  insertHeaderMock: ReturnType<typeof vi.fn>;
  insertEnergietraegerMock: ReturnType<typeof vi.fn>;
} {
  const closeCurrentVersion = vi.fn(() => Promise.resolve(undefined));
  const insertHeader = vi.fn((input: { id: string; endkundeId: string }) => Promise.resolve(header({ ...input })));
  const insertEnergietraeger = vi.fn((input: { energietraeger: string; energietraegerSubstitution?: boolean }) =>
    Promise.resolve({
      energietraeger: input.energietraeger,
      baselineWert: null,
      baselineEinheit: null,
      baselineMethode: null,
      baselineBegruendung: null,
      baselineBelegRef: null,
      energietraegerSubstitution: input.energietraegerSubstitution ?? false,
    }),
  );

  const messkonzeptRepo = {
    findHeaderByEndkundeId: vi.fn(() => Promise.resolve(overrides.header)),
    insertHeader,
    findMaxVersionNr: vi.fn(() => Promise.resolve(overrides.maxVersionNr ?? 0)),
    closeCurrentVersion,
    insertVersion: vi.fn(
      (input: { id: string; messkonzeptId: string; versionNr: number; typ: MesskonzeptVersion['typ']; gueltigVon: string }) =>
        Promise.resolve(version({ ...input })),
    ),
    insertEnergietraeger,
    listEnergietraeger: vi.fn(() => Promise.resolve([])),
    findVersionByNr: vi.fn(() => Promise.resolve(overrides.version)),
    listVersions: vi.fn(() => Promise.resolve([])),
  } as unknown as EnergyMesskonzeptRepository;

  const endkundeRepo = {
    findById: vi.fn(() => Promise.resolve(overrides.endkunde)),
  } as unknown as EnergyEndkundeRepository;

  return {
    service: new MesskonzeptService(messkonzeptRepo, endkundeRepo),
    messkonzeptRepo,
    closeCurrentVersionMock: closeCurrentVersion,
    insertHeaderMock: insertHeader,
    insertEnergietraegerMock: insertEnergietraeger,
  };
}

describe('MesskonzeptService (ADR-0008 §13/§20 — Append-only-Versionierung, Linie 3)', () => {
  beforeAll(() => {
    ensureNoOpTransactionHost();
  });

  it('anlegenVersion(): wirft 404, wenn der Endkunde nicht existiert', async () => {
    const { service } = createService({ endkunde: undefined });

    await expect(service.anlegenVersion('unbekannt', gueltigeDto)).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('anlegenVersion(): legt beim ERSTEN Aufruf Header + Version 1 an, OHNE eine Vorgaengerversion zu schliessen', async () => {
    const { service, closeCurrentVersionMock, insertHeaderMock } = createService({
      endkunde: endkunde(),
      header: undefined,
      maxVersionNr: 0,
    });

    const result = await service.anlegenVersion('endkunde-1', gueltigeDto);

    expect(result.versionNr).toBe(1);
    expect(closeCurrentVersionMock).not.toHaveBeenCalled();
    expect(insertHeaderMock).toHaveBeenCalledWith(expect.objectContaining({ endkundeId: 'endkunde-1' }));
  });

  it('anlegenVersion(): schliesst bei einem WEITEREN Aufruf die bisherige Version und vergibt versionNr+1 (Append-only, KEIN Editieren)', async () => {
    const { service, closeCurrentVersionMock, insertHeaderMock } = createService({
      endkunde: endkunde(),
      header: header(),
      maxVersionNr: 1,
    });

    const result = await service.anlegenVersion('endkunde-1', gueltigeDto);

    expect(result.versionNr).toBe(2);
    expect(closeCurrentVersionMock).toHaveBeenCalledWith('messkonzept-1', expect.any(String));
    expect(insertHeaderMock).not.toHaveBeenCalled();
  });

  it('anlegenVersion(): reicht energietraegerSubstitution durch, DEFAULT false bei Abwesenheit (ADR-0007 O-B3b)', async () => {
    const { service, insertEnergietraegerMock } = createService({ endkunde: endkunde(), header: undefined, maxVersionNr: 0 });

    const ohneAngabe = await service.anlegenVersion('endkunde-1', gueltigeDto);
    expect(ohneAngabe.energietraeger[0]?.energietraegerSubstitution).toBe(false);

    const mitSubstitution = await service.anlegenVersion('endkunde-1', {
      ...gueltigeDto,
      energietraeger: [{ energietraeger: 'strom' as const, energietraegerSubstitution: true }],
    });
    expect(mitSubstitution.energietraeger[0]?.energietraegerSubstitution).toBe(true);
    expect(insertEnergietraegerMock).toHaveBeenCalledWith(expect.objectContaining({ energietraegerSubstitution: true }));
  });

  describe('TB-02 — Begruendungspflicht bei weniger als drei Jahresabrechnungen (V0065)', () => {
    it('weist eine Baseline aus zwei Abrechnungen OHNE Begruendung ab und nennt die Auflage', async () => {
      // Die Pflicht stand seit V0002 als Kommentar im Schema und war nie
      // erzwungen — es fehlte die ANZAHL, an der sie haengt.
      const { service, insertEnergietraegerMock } = createService({ endkunde: endkunde(), header: undefined, maxVersionNr: 0 });

      const fehler = await service
        .anlegenVersion('endkunde-1', {
          ...gueltigeDto,
          energietraeger: [{ energietraeger: 'strom' as const, baselineAbrechnungenAnzahl: 2 }],
        })
        .catch((e: unknown) => e);

      expect(fehler).toBeInstanceOf(ProblemDetailsException);
      expect((fehler as ProblemDetailsException).problemDetail).toMatch(/TB-02/);
      // VOR dem Schreiben — kein halb angelegtes Messkonzept.
      expect(insertEnergietraegerMock).not.toHaveBeenCalled();
    });

    it('laesst zwei Abrechnungen MIT Begruendung zu — genau das sieht die Auflage vor', async () => {
      const { service } = createService({ endkunde: endkunde(), header: undefined, maxVersionNr: 0 });

      const ergebnis = await service.anlegenVersion('endkunde-1', {
        ...gueltigeDto,
        energietraeger: [
          {
            energietraeger: 'strom' as const,
            baselineAbrechnungenAnzahl: 2,
            baselineBegruendung: 'Anschluss erst 2025 hergestellt, es gibt keine dritte Abrechnung.',
          },
        ],
      });

      expect(ergebnis.energietraeger).toHaveLength(1);
    });

    it('wertet eine Begruendung aus Leerzeichen NICHT als Begruendung', async () => {
      const { service } = createService({ endkunde: endkunde(), header: undefined, maxVersionNr: 0 });

      await expect(
        service.anlegenVersion('endkunde-1', {
          ...gueltigeDto,
          energietraeger: [{ energietraeger: 'strom' as const, baselineAbrechnungenAnzahl: 1, baselineBegruendung: '   ' }],
        }),
      ).rejects.toBeInstanceOf(ProblemDetailsException);
    });

    it('laesst drei Abrechnungen ohne Begruendung zu', async () => {
      const { service } = createService({ endkunde: endkunde(), header: undefined, maxVersionNr: 0 });

      const ergebnis = await service.anlegenVersion('endkunde-1', {
        ...gueltigeDto,
        energietraeger: [{ energietraeger: 'strom' as const, baselineAbrechnungenAnzahl: 3 }],
      });

      expect(ergebnis.energietraeger).toHaveLength(1);
    });

    it('laesst Bestandsfaelle OHNE Angabe der Anzahl unberuehrt', async () => {
      // Eine Erfassungspflicht einzufuehren, indem vorhandene Messkonzepte
      // rueckwirkend ungueltig werden, waere der falsche Weg.
      const { service } = createService({ endkunde: endkunde(), header: undefined, maxVersionNr: 0 });

      const ergebnis = await service.anlegenVersion('endkunde-1', gueltigeDto);

      expect(ergebnis.energietraeger).toHaveLength(1);
    });

    it('reicht Aktenzeichen und Ablageort an die Persistenz durch', async () => {
      const { service, insertEnergietraegerMock } = createService({ endkunde: endkunde(), header: undefined, maxVersionNr: 0 });

      await service.anlegenVersion('endkunde-1', {
        ...gueltigeDto,
        energietraeger: [
          {
            energietraeger: 'strom' as const,
            baselineAbrechnungenAnzahl: 3,
            baselineBelegAktenzeichen: 'AZ-2024-0815',
            baselineBelegAblageort: 'Aktenordner Baseline 2024, Register 7',
          },
        ],
      });

      expect(insertEnergietraegerMock).toHaveBeenCalledWith(
        expect.objectContaining({
          baselineAbrechnungenAnzahl: 3,
          baselineBelegAktenzeichen: 'AZ-2024-0815',
          baselineBelegAblageort: 'Aktenordner Baseline 2024, Register 7',
        }),
      );
    });
  });

  it('listVersionen(): wirft 404, wenn der Endkunde nicht existiert', async () => {
    const { service } = createService({ endkunde: undefined });

    await expect(service.listVersionen('unbekannt', { limit: 50 })).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('listVersionen(): liefert eine leere Seite, wenn (noch) kein Messkonzept-Header existiert', async () => {
    const { service } = createService({ endkunde: endkunde(), header: undefined });

    const result = await service.listVersionen('endkunde-1', { limit: 50 });

    expect(result.daten).toEqual([]);
    expect(result.seite.naechsterCursor).toBeNull();
  });

  it('getVersion(): wirft 404, wenn der Endkunde nicht existiert', async () => {
    const { service } = createService({ endkunde: undefined });

    await expect(service.getVersion('unbekannt', 1)).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('getVersion(): wirft 404, wenn (noch) kein Messkonzept-Header existiert', async () => {
    const { service } = createService({ endkunde: endkunde(), header: undefined });

    await expect(service.getVersion('endkunde-1', 1)).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('getVersion(): wirft 404, wenn die angefragte Versionsnummer nicht existiert', async () => {
    const { service } = createService({ endkunde: endkunde(), header: header(), version: undefined });

    await expect(service.getVersion('endkunde-1', 99)).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('getVersion(): liefert die gemappte Version inkl. Energietraeger, wenn sie existiert', async () => {
    const { service } = createService({ endkunde: endkunde(), header: header(), version: version() });

    const result = await service.getVersion('endkunde-1', 1);

    expect(result).toMatchObject({ versionNr: 1, typ: 'standard' });
    expect(result.energietraeger).toEqual([]);
  });
});
