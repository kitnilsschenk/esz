import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ZaehlerVerortungService } from './zaehler-verortung.service';
import { ensureNoOpTransactionHost } from '../test-support/init-noop-transaction-host';
import { ProblemDetailsException } from '../../common/exceptions/problem-details.exception';
import type {
  EnergyZaehlerStandortRepository,
  ZaehlerStandort,
} from '../persistence/energy/energy-zaehler-standort.repository';
import type { EnergyStandortRepository, Standort } from '../persistence/energy/energy-standort.repository';
import type { EnergyZaehlerRepository, Zaehler } from '../persistence/energy/energy-zaehler.repository';

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

function zaehler(overrides: Partial<Zaehler> = {}): Zaehler {
  return {
    id: 'zaehler-1',
    systemId: 'system-1',
    geraetetyp: 'Testzaehler',
    energietraeger: 'strom',
    status: 'aktiv',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function zaehlerStandort(overrides: Partial<ZaehlerStandort> = {}): ZaehlerStandort {
  return {
    id: 'verortung-1',
    zaehlerId: 'zaehler-1',
    standortId: 'standort-1',
    gueltigVon: '2026-01-01T00:00:00.000Z',
    gueltigBis: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function createService(overrides: {
  zaehler?: Zaehler | undefined;
  standort?: Standort | undefined;
  offeneVerortung?: ZaehlerStandort | undefined;
  zaehlerUnterKnoten?: readonly Zaehler[];
  pfadKnoten?: readonly Standort[];
}): {
  service: ZaehlerVerortungService;
  beendenMock: ReturnType<typeof vi.fn>;
  insertMock: ReturnType<typeof vi.fn>;
  findManyByIdsAndEndkundeMock: ReturnType<typeof vi.fn>;
} {
  const beendenMock = vi.fn((id: string, gueltigBis: string) =>
    Promise.resolve({ ...(overrides.offeneVerortung ?? zaehlerStandort()), id, gueltigBis }),
  );
  const insertMock = vi.fn((input: { id: string; zaehlerId: string; standortId: string; gueltigVon: string }) =>
    Promise.resolve(zaehlerStandort({ ...input })),
  );
  const findManyByIdsAndEndkundeMock = vi.fn(() => Promise.resolve(overrides.pfadKnoten ?? []));

  const zaehlerStandortRepo = {
    findAktivByZaehlerId: vi.fn(() => Promise.resolve(overrides.offeneVerortung)),
    beenden: beendenMock,
    insert: insertMock,
  } as unknown as EnergyZaehlerStandortRepository;

  const standortRepo = {
    findById: vi.fn(() => Promise.resolve(overrides.standort)),
    findZaehlerUnterKnoten: vi.fn(() => Promise.resolve(overrides.zaehlerUnterKnoten ?? [])),
    findManyByIdsAndEndkunde: findManyByIdsAndEndkundeMock,
  } as unknown as EnergyStandortRepository;

  const zaehlerRepo = {
    findById: vi.fn(() => Promise.resolve(overrides.zaehler)),
  } as unknown as EnergyZaehlerRepository;

  const service = new ZaehlerVerortungService(zaehlerStandortRepo, standortRepo, zaehlerRepo);

  return { service, beendenMock, insertMock, findManyByIdsAndEndkundeMock };
}

describe('ZaehlerVerortungService (ADR-0010 D3) — erstelleVerortung() ("Umsetzen")', () => {
  beforeAll(() => {
    ensureNoOpTransactionHost();
  });

  it('OHNE offene Vorgaenger-Verortung: legt NUR die neue Zeitscheibe an (kein beenden())', async () => {
    const { service, beendenMock, insertMock } = createService({
      zaehler: zaehler(),
      standort: standort(),
      offeneVerortung: undefined,
    });

    const result = await service.erstelleVerortung('zaehler-1', { standortId: 'standort-1', gueltigVon: '2026-02-01T00:00:00.000Z' });

    expect(beendenMock).not.toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ zaehlerId: 'zaehler-1', standortId: 'standort-1', gueltigVon: '2026-02-01T00:00:00.000Z' }),
    );
    expect(result.gueltigBis).toBeNull();
  });

  it('MIT offener Vorgaenger-Verortung ("Umsetzen"): schliesst die ALTE Zeitscheibe GENAU an der neuen Startzeit UND oeffnet die NEUE — zwei Zeitscheiben ohne Overlap', async () => {
    const alteVerortung = zaehlerStandort({ id: 'alte-verortung', standortId: 'alter-standort', gueltigVon: '2026-01-01T00:00:00.000Z', gueltigBis: null });
    const { service, beendenMock, insertMock } = createService({
      zaehler: zaehler(),
      standort: standort({ id: 'neuer-standort' }),
      offeneVerortung: alteVerortung,
    });

    const result = await service.erstelleVerortung('zaehler-1', {
      standortId: 'neuer-standort',
      gueltigVon: '2026-03-01T00:00:00.000Z',
    });

    // (1) Alte Zeitscheibe wird GENAU an der neuen Startzeit geschlossen (keine Luecke, kein Overlap).
    expect(beendenMock).toHaveBeenCalledWith('alte-verortung', '2026-03-01T00:00:00.000Z');
    // (2) Neue Zeitscheibe wird geoeffnet (gueltig_bis=NULL).
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ zaehlerId: 'zaehler-1', standortId: 'neuer-standort', gueltigVon: '2026-03-01T00:00:00.000Z' }),
    );
    expect(result.gueltigBis).toBeNull();
    expect(result.standortId).toBe('neuer-standort');
  });

  it('lehnt ab (400), wenn gueltigVon NICHT nach dem Beginn der aktuell offenen Verortung liegt (invertierte Zeitscheibe)', async () => {
    const { service } = createService({
      zaehler: zaehler(),
      standort: standort(),
      offeneVerortung: zaehlerStandort({ gueltigVon: '2026-05-01T00:00:00.000Z' }),
    });

    await expect(
      service.erstelleVerortung('zaehler-1', { standortId: 'standort-1', gueltigVon: '2026-01-01T00:00:00.000Z' }),
    ).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('lehnt ab (404), wenn der Zaehler nicht existiert', async () => {
    const { service } = createService({ zaehler: undefined, standort: standort() });

    await expect(
      service.erstelleVerortung('zaehler-1', { standortId: 'standort-1', gueltigVon: '2026-01-01T00:00:00.000Z' }),
    ).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('lehnt ab (404), wenn der Standort nicht existiert', async () => {
    const { service } = createService({ zaehler: zaehler(), standort: undefined });

    await expect(
      service.erstelleVerortung('zaehler-1', { standortId: 'standort-1', gueltigVon: '2026-01-01T00:00:00.000Z' }),
    ).rejects.toBeInstanceOf(ProblemDetailsException);
  });
});

describe('ZaehlerVerortungService — beendenVerortung()', () => {
  beforeAll(() => {
    ensureNoOpTransactionHost();
  });

  it('beendet die aktuell offene Verortung', async () => {
    const { service } = createService({ offeneVerortung: zaehlerStandort() });

    const result = await service.beendenVerortung('zaehler-1', { gueltigBis: '2026-06-01T00:00:00.000Z' });

    expect(result.gueltigBis).toBe('2026-06-01T00:00:00.000Z');
  });

  it('lehnt ab (404), wenn keine offene Verortung existiert', async () => {
    const { service } = createService({ offeneVerortung: undefined });

    await expect(service.beendenVerortung('zaehler-1', { gueltigBis: '2026-06-01T00:00:00.000Z' })).rejects.toBeInstanceOf(
      ProblemDetailsException,
    );
  });
});

describe('ZaehlerVerortungService — aktuelleVerortung() (Backend-Lücke 1, "Wo hängt dieser Zähler?")', () => {
  beforeAll(() => {
    ensureNoOpTransactionHost();
  });

  it('liefert bei einem Zaehler OHNE jede Verortung verortet=false, standortId=null, pfad=[] (Empty-State, KEIN Fehler)', async () => {
    const { service } = createService({ zaehler: zaehler(), offeneVerortung: undefined });

    const result = await service.aktuelleVerortung('zaehler-1');

    expect(result).toEqual({ zaehlerId: 'zaehler-1', verortet: false, standortId: null, verortetSeit: null, pfad: [] });
  });

  it('liefert bei einem Zaehler MIT NUR historischen (bereits beendeten) Verortungen ebenfalls verortet=false (findAktivByZaehlerId liefert undefined)', async () => {
    // findAktivByZaehlerId filtert bereits auf gueltig_bis IS NULL — eine
    // rein historische Verortung erscheint hier NIE, das ist genau der
    // Randfall aus dem Arbeitsauftrag.
    const { service } = createService({ zaehler: zaehler(), offeneVerortung: undefined });

    const result = await service.aktuelleVerortung('zaehler-1');

    expect(result.verortet).toBe(false);
  });

  it('liefert bei einer aktuellen Verortung den VOLLSTAENDIGEN Wurzel-Pfad, WURZEL ZUERST, unabhaengig von der Rueckgabereihenfolge des Batch-Lookups', async () => {
    const wurzel = standort({ id: 'wurzel', ebene: 0, pfad: ['wurzel'] });
    const gebaeude = standort({ id: 'gebaeude', parentId: 'wurzel', ebene: 1, pfad: ['wurzel', 'gebaeude'] });
    const raum = standort({ id: 'raum', parentId: 'gebaeude', ebene: 2, pfad: ['wurzel', 'gebaeude', 'raum'] });
    const offeneVerortung = zaehlerStandort({ standortId: 'raum', gueltigVon: '2026-03-01T00:00:00.000Z' });

    const { service, findManyByIdsAndEndkundeMock } = createService({
      zaehler: zaehler(),
      standort: raum,
      offeneVerortung,
      // Batch-Lookup liefert bewusst NICHT in Pfad-Reihenfolge zurueck —
      // der Service muss selbst nach `ebene` sortieren (Wurzel zuerst).
      pfadKnoten: [raum, wurzel, gebaeude],
    });

    const result = await service.aktuelleVerortung('zaehler-1');

    expect(result.verortet).toBe(true);
    expect(result.standortId).toBe('raum');
    expect(result.verortetSeit).toBe('2026-03-01T00:00:00.000Z');
    expect(result.pfad.map((eintrag) => eintrag.id)).toEqual(['wurzel', 'gebaeude', 'raum']);
    expect(findManyByIdsAndEndkundeMock).toHaveBeenCalledWith(['wurzel', 'gebaeude', 'raum'], 'endkunde-1');
  });

  it('das Struktur-Pfad-Element enthaelt NIEMALS eine Bezeichnung/Adresse (nur id/parentId/typ/ebene/status)', async () => {
    const wurzel = standort({ id: 'wurzel', ebene: 0, pfad: ['wurzel'] });
    const offeneVerortung = zaehlerStandort({ standortId: 'wurzel', gueltigVon: '2026-03-01T00:00:00.000Z' });
    const { service } = createService({
      zaehler: zaehler(),
      standort: wurzel,
      offeneVerortung,
      pfadKnoten: [wurzel],
    });

    const result = await service.aktuelleVerortung('zaehler-1');

    expect(Object.keys(result.pfad[0] as object).sort()).toEqual(['ebene', 'id', 'parentId', 'status', 'typ'].sort());
    expect(JSON.stringify(result)).not.toContain('bezeichnung');
    expect(JSON.stringify(result)).not.toContain('anschrift');
  });

  it('lehnt ab (404), wenn der Zaehler nicht existiert', async () => {
    const { service } = createService({ zaehler: undefined });

    await expect(service.aktuelleVerortung('zaehler-1')).rejects.toBeInstanceOf(ProblemDetailsException);
  });
});

describe('ZaehlerVerortungService — zaehlerUnterKnoten() (Kern-Query D6)', () => {
  beforeAll(() => {
    ensureNoOpTransactionHost();
  });

  it('liefert die Zaehler unter dem Knoten mit Default stichtag=now()/inklusiveUnterknoten=true', async () => {
    const { service } = createService({ standort: standort(), zaehlerUnterKnoten: [zaehler()] });

    const result = await service.zaehlerUnterKnoten('standort-1', {});

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('zaehler-1');
  });

  it('lehnt ab (404), wenn der Standort nicht existiert', async () => {
    const { service } = createService({ standort: undefined });

    await expect(service.zaehlerUnterKnoten('standort-1', {})).rejects.toBeInstanceOf(ProblemDetailsException);
  });
});
