import { beforeAll, describe, expect, it, vi } from 'vitest';
import { BerechnungslaufService } from './berechnungslauf.service';
import { BerechnungFehlerException } from './berechnung-fehler.exception';
import { BERECHNUNG_EVENT_CODES } from './audit/berechnung-audit-events';
import { ProblemDetailsException } from '../common/exceptions/problem-details.exception';
import { ensureNoOpTransactionHost } from '../stammdaten/test-support/init-noop-transaction-host';
import type { EnergyEndkundeRepository, Endkunde } from '../stammdaten/persistence/energy/energy-endkunde.repository';
import type { MvetLookupRepository, MvetInfo } from './persistence/mvet-lookup.repository';
import type { AnalyticsBaselinePeriodeRepository } from './persistence/analytics-baseline-periode.repository';
import type { AnalyticsKlimaTagRepository } from './persistence/analytics-klima-tag.repository';
import type { AnalyticsMesswertMonatRepository } from './persistence/analytics-messwert-monat.repository';
import type { AnalyticsEingangSnapshotRepository } from './persistence/analytics-eingang-snapshot.repository';
import type { EinflussIntervallLeseRepository, EinflussIntervallProjektionZeile } from './persistence/einfluss-intervall-lese.repository';
import type { AnalyticsVerfahrenRepository, VerfahrenVersion } from './persistence/analytics-verfahren.repository';
import type {
  AnalyticsBerechnungslaufRepository,
  BerechnungslaufRow,
  LaufergebnisZeileInput,
} from './persistence/analytics-berechnungslauf.repository';
import type { AuditService } from '../audit/audit.service';
import type { KlimaQuellePort } from './klima/klima-quelle.port';
import type { SecurityContext } from '../common/security/security-context';
import { referenzMonat } from './domain/witterung-gtz';
import { enumerateDays } from './zeit.util';
import { sha256Canonical } from './hash.util';
import type { BerechnungslaufAnlegenDto } from './dto/berechnungslauf-anlegen.dto';

function endkunde(overrides: Partial<Endkunde> = {}): Endkunde {
  return {
    id: 'endkunde-1',
    verarbeitungsStatus: 'aktiv',
    consentStatus: 'fehlt',
    consentTextVersion: null,
    vonWissAuswertungAusgenommen: false,
    endkundengruppe: null,
    createdAt: '2027-01-01T00:00:00.000Z',
    updatedAt: '2027-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function mvet(overrides: Partial<MvetInfo> = {}): MvetInfo {
  return {
    id: 'mvet-1',
    endkundeId: 'endkunde-1',
    energietraeger: 'gas',
    baselineWertKwh: 20000,
    baselineEinheit: 'kWh',
    messkonzeptTyp: 'vereinfacht',
    ...overrides,
  };
}

function verfahren(): VerfahrenVersion {
  return { id: 'verfahren-1', code: 'witterung_gtz_vdi3807', version: 1, parameterSchema: {}, goldenVectors: [] };
}

function laufRow(overrides: Partial<BerechnungslaufRow> = {}): BerechnungslaufRow {
  return {
    id: 'lauf-1',
    endkundeId: 'endkunde-1',
    energietraeger: 'gas',
    mvetId: 'mvet-1',
    verfahrenCode: 'witterung_gtz_vdi3807',
    verfahrenVersion: 1,
    periodeVon: '2027-01-01',
    periodeBis: '2027-02-01',
    baselineWertKwh: 20000,
    grundlastAnteil: 0.2,
    gtzBase: 3500,
    gtzNorm: null,
    baselineNormKwh: null,
    qualitaetsStufeMin: 'nicht_ausweisbar',
    stationRef: 'TEST-STATION',
    ausloeser: 'manuell',
    ersetztLaufId: null,
    messkonzeptTyp: 'vereinfacht',
    gueteR2: null,
    gueteCvRmsePct: null,
    gueteNmbePct: null,
    guetePunkte: null,
    baselineAbweichungPct: null,
    erstelltAt: '2027-02-01T00:00:00.000Z',
    ...overrides,
  };
}

function betrieb(): SecurityContext {
  return { sub: 'betrieb-sub', actorTyp: 'benutzer', roles: ['betrieb'], azp: 'edms-bff' };
}

/**
 * KEIN `gtzBaseOverride`-Default (`exactOptionalPropertyTypes`: ein
 * `undefined`-Override-Wert wäre ein Typfehler, das Feld muss bei Bedarf
 * ganz FEHLEN, nicht `undefined` sein) — Tests, die einen GTZ_base-Override
 * brauchen, setzen ihn EXPLIZIT über `overrides`.
 */
function januarDto(overrides: Partial<BerechnungslaufAnlegenDto> = {}): BerechnungslaufAnlegenDto {
  return {
    endkundeId: 'endkunde-1',
    mvetId: 'mvet-1',
    periodeVon: '2027-01-01',
    periodeBis: '2027-02-01',
    grundlastAnteil: 0.2,
    stationRef: 'TEST-STATION',
    ...overrides,
  };
}

interface Overrides {
  endkunde?: Endkunde | undefined;
  mvet?: MvetInfo | undefined;
  klimaTage?: readonly { readonly tag: string; readonly tMittelC: number }[];
  erwarteteKanalzahl?: number;
  laufInsertWirftFehler?: boolean;
  einflussSystemIds?: readonly string[];
  einflussZeilen?: readonly EinflussIntervallProjektionZeile[];
  fremdeEinheiten?: readonly string[];
}

function createService(overrides: Overrides): {
  service: BerechnungslaufService;
  insertLaufMock: ReturnType<typeof vi.fn>;
  insertLaufergebnisZeilenMock: ReturnType<typeof vi.fn>;
  auditAppendMock: ReturnType<typeof vi.fn>;
  findeOderErstelleMock: ReturnType<typeof vi.fn>;
  insertEinflussgroesseZeilenMock: ReturnType<typeof vi.fn>;
  findAktiveZaehlerIdsMock: ReturnType<typeof vi.fn>;
  findAktiveZaehlerIdsFuerSystemeMock: ReturnType<typeof vi.fn>;
} {
  const endkundeRepo = { findById: vi.fn(() => Promise.resolve(overrides.endkunde)) } as unknown as EnergyEndkundeRepository;
  const mvetLookupRepo = {
    findById: vi.fn(() => Promise.resolve(overrides.mvet)),
    listSystemIdsByMvetId: vi.fn(() => Promise.resolve(overrides.einflussSystemIds ?? [])),
  } as unknown as MvetLookupRepository;
  const einflussIntervallLeseRepo = {
    findGueltigeFuerSysteme: vi.fn(() => Promise.resolve(overrides.einflussZeilen ?? [])),
  } as unknown as EinflussIntervallLeseRepository;
  const baselinePeriodeRepo = { listByMvet: vi.fn(() => Promise.resolve([])) } as unknown as AnalyticsBaselinePeriodeRepository;
  const klimaTagRepo = {
    // Ohne Override liefert die Station eine LUECKENLOSE Reihe ueber 15 °C —
    // realistisch (eine echte Station liefert jeden Tag) und ergebnisneutral:
    // oberhalb der Heizgrenze ist die Tages-GTZ 0, die Summen bleiben also
    // dieselben wie bei einer leeren Reihe. Eine leere Reihe waere dagegen ein
    // Zustand, den es mit einem gebundenen Adapter gar nicht geben kann.
    findTage: vi.fn((_stationRef: string, von: string, bis: string) =>
      Promise.resolve(overrides.klimaTage ?? enumerateDays(von, bis).map((tag) => ({ tag, tMittelC: 25 }))),
    ),
    insertAbruf: vi.fn(() => Promise.resolve(0)),
  } as unknown as AnalyticsKlimaTagRepository;
  const findAktiveZaehlerIdsMock = vi.fn(() => Promise.resolve(['zaehler-endkunde']));
  const findAktiveZaehlerIdsFuerSystemeMock = vi.fn(() => Promise.resolve(['zaehler-system']));
  const messwertMonatRepo = {
    findAktiveZaehlerIds: findAktiveZaehlerIdsMock,
    findAktiveZaehlerIdsFuerSysteme: findAktiveZaehlerIdsFuerSystemeMock,
    berechneTagesaggregation: vi.fn(() => Promise.resolve([])),
    ermittleAktiveMesskanaele: vi.fn(() =>
      Promise.resolve({
        verwertbar: overrides.erwarteteKanalzahl ?? 0,
        fremdeEinheiten: overrides.fremdeEinheiten ?? [],
      }),
    ),
  } as unknown as AnalyticsMesswertMonatRepository;
  const findeOderErstelleMock = vi.fn((input: { readonly art: string }) =>
    Promise.resolve({ id: `snap-${input.art}`, neuErstellt: true }),
  );
  const insertEinflussgroesseZeilenMock = vi.fn(() => Promise.resolve(undefined));
  const eingangSnapshotRepo = {
    findeOderErstelle: findeOderErstelleMock,
    insertMesswertTagZeilen: vi.fn(() => Promise.resolve(undefined)),
    insertKlimaTagZeilen: vi.fn(() => Promise.resolve(undefined)),
    insertEinflussgroesseZeilen: insertEinflussgroesseZeilenMock,
  } as unknown as AnalyticsEingangSnapshotRepository;
  const verfahrenRepo = { findAktiveVersion: vi.fn(() => Promise.resolve(verfahren())) } as unknown as AnalyticsVerfahrenRepository;

  const insertLaufMock = vi.fn(() => {
    if (overrides.laufInsertWirftFehler === true) {
      throw new Error('DB-Fehler (synthetisch, Testfall)');
    }
    return Promise.resolve(laufRow());
  });
  const insertLaufergebnisZeilenMock = vi.fn(() => Promise.resolve(undefined));
  const berechnungslaufRepo = {
    insertLauf: insertLaufMock,
    insertLaufergebnisZeilen: insertLaufergebnisZeilenMock,
    insertRetentionStatus: vi.fn(() => Promise.resolve(undefined)),
    findById: vi.fn(() => Promise.resolve(undefined)),
    findEndkundeIdById: vi.fn(() => Promise.resolve(undefined)),
    findErgebnisseByLaufId: vi.fn(() => Promise.resolve([] as LaufergebnisZeileInput[])),
  } as unknown as AnalyticsBerechnungslaufRepository;

  const auditAppendMock = vi.fn(() =>
    Promise.resolve({ eventId: 'evt', lane: 0, tagUtc: '2027-01-01', seq: '1', ts: '2027-01-01T00:00:00.000Z', eventTyp: 'x', ergebnis: 'ok' as const }),
  );
  const auditService = { append: auditAppendMock } as unknown as AuditService;

  const klimaQuellePort = {
    holeTageswerte: vi.fn(() =>
      Promise.resolve({ werte: [], herkunft: { quelle: 'synthetic_dev', dateiVersion: null, lizenzId: null } }),
    ),
  } as unknown as KlimaQuellePort;

  const service = new BerechnungslaufService(
    endkundeRepo,
    mvetLookupRepo,
    baselinePeriodeRepo,
    klimaTagRepo,
    messwertMonatRepo,
    eingangSnapshotRepo,
    einflussIntervallLeseRepo,
    verfahrenRepo,
    berechnungslaufRepo,
    auditService,
    klimaQuellePort,
  );

  return {
    service,
    insertLaufMock,
    insertLaufergebnisZeilenMock,
    auditAppendMock,
    findeOderErstelleMock,
    insertEinflussgroesseZeilenMock,
    findAktiveZaehlerIdsMock,
    findAktiveZaehlerIdsFuerSystemeMock,
  };
}

describe('BerechnungslaufService (ADR-0006 B12.1)', () => {
  beforeAll(() => {
    ensureNoOpTransactionHost();
  });

  it('A10: gesperrter Endkunde -> 409, KEIN Schreibzugriff (auch kein Audit-Event)', async () => {
    const { service, insertLaufMock, auditAppendMock } = createService({
      endkunde: endkunde({ verarbeitungsStatus: 'gesperrt' }),
    });

    await expect(service.starten(januarDto(), betrieb(), true)).rejects.toBeInstanceOf(BerechnungFehlerException);
    expect(insertLaufMock).not.toHaveBeenCalled();
    expect(auditAppendMock).not.toHaveBeenCalled();
  });

  it('unbekannte endkundeId -> 404 (nichtGefunden), KEIN Schreibzugriff', async () => {
    const { service, insertLaufMock } = createService({ endkunde: undefined });

    await expect(service.starten(januarDto(), betrieb(), true)).rejects.toBeInstanceOf(ProblemDetailsException);
    expect(insertLaufMock).not.toHaveBeenCalled();
  });

  it('mvetId gehoert zu einem ANDEREN Endkunden als der Request -> 400, KEIN Schreibzugriff', async () => {
    const { service, insertLaufMock, auditAppendMock } = createService({
      endkunde: endkunde(),
      mvet: mvet({ endkundeId: 'endkunde-FREMD' }),
    });

    await expect(service.starten(januarDto(), betrieb(), true)).rejects.toBeInstanceOf(ProblemDetailsException);
    expect(insertLaufMock).not.toHaveBeenCalled();
    expect(auditAppendMock).not.toHaveBeenCalled();
  });

  it('baseline_wert fehlt -> 400 (BASELINE_FEHLT), KEIN Schreibzugriff', async () => {
    const { service, insertLaufMock } = createService({
      endkunde: endkunde(),
      mvet: mvet({ baselineWertKwh: null }),
    });

    await expect(service.starten(januarDto(), betrieb(), true)).rejects.toBeInstanceOf(BerechnungFehlerException);
    expect(insertLaufMock).not.toHaveBeenCalled();
  });

  it('baseline_einheit != kWh -> 400 (fail-closed, KEINE stille Umrechnung)', async () => {
    const { service } = createService({
      endkunde: endkunde(),
      mvet: mvet({ baselineEinheit: 'MWh' }),
    });

    await expect(service.starten(januarDto(), betrieb(), true)).rejects.toBeInstanceOf(BerechnungFehlerException);
  });

  it('Happy Path: referenzKwh entspricht referenzMonat() mit denselben Eingaben (Service verfaelscht die Formel nicht)', async () => {
    // 31 Januar-Tage à t_mittel=10°C -> gradtagzahlTag(10, {tInnenC:20, tHeizgrenzeC:15}) = 10 Kd/Tag -> GTZ_m_ist = 310 Kd.
    const klimaTage = enumerateDays('2027-01-01', '2027-02-01').map((tag) => ({ tag, tMittelC: 10 }));
    const { service, insertLaufMock, insertLaufergebnisZeilenMock, auditAppendMock } = createService({
      endkunde: endkunde(),
      mvet: mvet(),
      klimaTage,
    });

    const erwartetesRm = referenzMonat({
      baselineJahresWertKwh: 20000,
      grundlastAnteil: 0.2,
      tageImMonat: 31,
      tageProJahr: 365.25,
      gtzMonatIst: 310,
      gtzBase: 3500,
    });

    await service.starten(januarDto({ gtzBaseOverride: 3500 }), betrieb(), true);

    expect(insertLaufMock).toHaveBeenCalledTimes(1);
    const ergebnisZeilen = insertLaufergebnisZeilenMock.mock.calls[0]?.[1] as LaufergebnisZeileInput[];
    expect(ergebnisZeilen).toHaveLength(1);
    expect(ergebnisZeilen[0]?.referenzKwh).toBeCloseTo(Number(erwartetesRm.toFixed(3)), 3);
    expect(ergebnisZeilen[0]?.gtzIst).toBeCloseTo(310, 2);

    // Audit-Reihenfolge: angefordert (VOR der Berechnung) -> abgeschlossen (NACH Erfolg).
    const eventTypen = auditAppendMock.mock.calls.map((call) => (call[0] as { eventTyp: string }).eventTyp);
    expect(eventTypen).toEqual([
      'berechnungslauf.bereinigung.angefordert',
      'berechnungslauf.bereinigung.abgeschlossen',
    ]);
    // kontext.synthetic uebernimmt den vom Controller uebergebenen Wert 1:1.
    const angefordertKontext = auditAppendMock.mock.calls[0]?.[0] as { kontext: { synthetic: boolean } };
    expect(angefordertKontext.kontext.synthetic).toBe(true);
  });

  it('Fehler WAEHREND der Berechnung -> .fehlgeschlagen wird auditiert, Fehler wird weitergeworfen (angefordert bleibt bereits geschrieben)', async () => {
    const { service, auditAppendMock } = createService({
      endkunde: endkunde(),
      mvet: mvet(),
      laufInsertWirftFehler: true,
    });

    await expect(
      service.starten(januarDto({ gtzBaseOverride: 3500 }), betrieb(), false),
    ).rejects.toThrow('DB-Fehler (synthetisch, Testfall)');

    const eventTypen = auditAppendMock.mock.calls.map((call) => (call[0] as { eventTyp: string }).eventTyp);
    expect(eventTypen).toEqual([
      'berechnungslauf.bereinigung.angefordert',
      'berechnungslauf.bereinigung.fehlgeschlagen',
    ]);
    const fehlgeschlagenKontext = auditAppendMock.mock.calls[1]?.[0] as {
      kontext: { fehler_code: string; synthetic: boolean };
    };
    expect(fehlgeschlagenKontext.kontext.fehler_code).toBe('unerwarteter_fehler');
    expect(fehlgeschlagenKontext.kontext.synthetic).toBe(false);
  });

  it('g=1 (reiner Grundlast-Verbraucher): GTZ_base ist NICHT erforderlich, auch ohne Baseline-Periode/Override', async () => {
    const { service, insertLaufergebnisZeilenMock } = createService({
      endkunde: endkunde(),
      mvet: mvet({ baselineWertKwh: 3000 }),
    });

    await service.starten(januarDto({ grundlastAnteil: 1 }), betrieb(), true);

    const ergebnisZeilen = insertLaufergebnisZeilenMock.mock.calls[0]?.[1] as LaufergebnisZeileInput[];
    // Reiner Proration-Fall (V2-Analogon): 3000 * (31/365.25).
    expect(ergebnisZeilen[0]?.referenzKwh).toBeCloseTo(Number((3000 * (31 / 365.25)).toFixed(3)), 3);
  });

  it('g<1 OHNE Baseline-Periode UND OHNE gtzBaseOverride -> 400 (GTZ_base nicht ermittelbar), auditiert als fehlgeschlagen', async () => {
    const { service, auditAppendMock } = createService({
      endkunde: endkunde(),
      mvet: mvet(),
    });

    await expect(service.starten(januarDto(), betrieb(), true)).rejects.toBeInstanceOf(BerechnungFehlerException);

    const eventTypen = auditAppendMock.mock.calls.map((call) => (call[0] as { eventTyp: string }).eventTyp);
    expect(eventTypen).toEqual([
      'berechnungslauf.bereinigung.angefordert',
      'berechnungslauf.bereinigung.fehlgeschlagen',
    ]);
  });

  /** ADR-0006 D7/A5 — dritte Snapshot-Art. Findet die drei relevanten `findeOderErstelle()`-Aufrufe unabhängig von ihrer Reihenfolge. */
  function findeSnapshotAufruf(findeOderErstelleMock: ReturnType<typeof vi.fn>, art: string): { readonly inhaltHash: Buffer } | undefined {
    const treffer = findeOderErstelleMock.mock.calls.find((call) => (call[0] as { readonly art: string }).art === art);
    return treffer?.[0] as { readonly inhaltHash: Buffer } | undefined;
  }

  describe('Einflussgrößen-Snapshot (ADR-0006 D7/A5/B7)', () => {
    it('KEINE Zuordnung (mvet -> System) -> KEIN Snapshot, einflussgroesseSnapshotId bleibt NULL, rohdaten_hash bleibt die Zwei-Komponenten-Formel', async () => {
      const { service, insertLaufMock, insertEinflussgroesseZeilenMock, findeOderErstelleMock } = createService({
        endkunde: endkunde(),
        mvet: mvet(),
        einflussSystemIds: [],
      });

      await service.starten(januarDto({ gtzBaseOverride: 3500 }), betrieb(), true);

      expect(findeOderErstelleMock.mock.calls.some((c) => (c[0] as { art: string }).art === 'einflussgroesse')).toBe(false);
      expect(insertEinflussgroesseZeilenMock).not.toHaveBeenCalled();
      const insertInput = insertLaufMock.mock.calls[0]?.[0] as { einflussgroesseSnapshotId: string | null; rohdatenHash: Buffer };
      expect(insertInput.einflussgroesseSnapshotId).toBeNull();

      const messwertHash = findeSnapshotAufruf(findeOderErstelleMock, 'messwert_tag')?.inhaltHash;
      const klimaHash = findeSnapshotAufruf(findeOderErstelleMock, 'klima_tag')?.inhaltHash;
      expect(messwertHash).toBeDefined();
      expect(klimaHash).toBeDefined();
      const erwarteterHash = sha256Canonical([(messwertHash as Buffer).toString('hex'), (klimaHash as Buffer).toString('hex')]);
      expect(insertInput.rohdatenHash.equals(erwarteterHash)).toBe(true);
    });

    it('Zuordnung vorhanden, aber KEINE gültigen Intervalle im Lauf-Zeitraum -> weiterhin KEIN Snapshot', async () => {
      const { service, findeOderErstelleMock, insertLaufMock } = createService({
        endkunde: endkunde(),
        mvet: mvet(),
        einflussSystemIds: ['system-1'],
        einflussZeilen: [],
      });

      await service.starten(januarDto({ gtzBaseOverride: 3500 }), betrieb(), true);

      expect(findeOderErstelleMock.mock.calls.some((c) => (c[0] as { art: string }).art === 'einflussgroesse')).toBe(false);
      const insertInput = insertLaufMock.mock.calls[0]?.[0] as { einflussgroesseSnapshotId: string | null };
      expect(insertInput.einflussgroesseSnapshotId).toBeNull();
    });

    it('Zuordnung + gültige Intervalle -> Snapshot wird eingefroren, einflussgroesseSnapshotId gesetzt, rohdaten_hash bekommt eine DRITTE Komponente', async () => {
      const einflussZeilen: EinflussIntervallProjektionZeile[] = [
        { systemId: 'system-1', groesseCode: 'personenanzahl', wertNum: 3, wertCode: null, gueltigAbMonat: '2020-01-01', gueltigBisMonat: null },
      ];
      const { service, findeOderErstelleMock, insertEinflussgroesseZeilenMock, insertLaufMock } = createService({
        endkunde: endkunde(),
        mvet: mvet(),
        einflussSystemIds: ['system-1'],
        einflussZeilen,
      });

      await service.starten(januarDto({ gtzBaseOverride: 3500 }), betrieb(), true);

      expect(findeOderErstelleMock.mock.calls.some((c) => (c[0] as { art: string }).art === 'einflussgroesse')).toBe(true);
      expect(insertEinflussgroesseZeilenMock).toHaveBeenCalledWith('snap-einflussgroesse', einflussZeilen);

      const insertInput = insertLaufMock.mock.calls[0]?.[0] as { einflussgroesseSnapshotId: string | null; rohdatenHash: Buffer };
      expect(insertInput.einflussgroesseSnapshotId).toBe('snap-einflussgroesse');

      const messwertHash = findeSnapshotAufruf(findeOderErstelleMock, 'messwert_tag')?.inhaltHash as Buffer;
      const klimaHash = findeSnapshotAufruf(findeOderErstelleMock, 'klima_tag')?.inhaltHash as Buffer;
      const einflussHash = findeSnapshotAufruf(findeOderErstelleMock, 'einflussgroesse')?.inhaltHash as Buffer;
      const erwarteterHash = sha256Canonical([messwertHash.toString('hex'), klimaHash.toString('hex'), einflussHash.toString('hex')]);
      expect(insertInput.rohdatenHash.equals(erwarteterHash)).toBe(true);
    });
  });
  describe('Systemgrenze der Zaehler-Menge (V0028)', () => {
    /** Der Audit-Eintrag des ABGESCHLOSSENEN Laufs — dort steht die Quelle. */
    function abschlussKontext(auditAppendMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
      const aufruf = auditAppendMock.mock.calls
        .map((call) => call[0] as { readonly eventTyp: string; readonly kontext?: Record<string, unknown> })
        .find((eintrag) => eintrag.eventTyp === BERECHNUNG_EVENT_CODES.LAUF_ABGESCHLOSSEN);
      expect(aufruf).toBeDefined();
      return (aufruf as { readonly kontext: Record<string, unknown> }).kontext;
    }

    it('nimmt bei gepflegter Zuordnung NUR die Zaehler der zugeordneten Systeme', async () => {
      const { service, findAktiveZaehlerIdsMock, findAktiveZaehlerIdsFuerSystemeMock, auditAppendMock } = createService({
        endkunde: endkunde(),
        mvet: mvet(),
        einflussSystemIds: ['system-1', 'system-2'],
      });

      await service.starten(januarDto({ gtzBaseOverride: 3500 }), betrieb(), true);

      expect(findAktiveZaehlerIdsFuerSystemeMock).toHaveBeenCalledWith(['system-1', 'system-2'], 'gas');
      // Der Kunden-weite Fallback darf dann GAR NICHT mehr greifen — genau er
      // hat zwei unabhaengige Messkonzepte desselben Kunden vermischt.
      expect(findAktiveZaehlerIdsMock).not.toHaveBeenCalled();
      expect(abschlussKontext(auditAppendMock)['systemgrenze_quelle']).toBe('mvet_system');
    });

    it('bricht ab, wenn ein einbezogener Kanal eine nicht verwertbare Einheit fuehrt', async () => {
      const { service, auditAppendMock } = createService({
        endkunde: endkunde(),
        mvet: mvet(),
        einflussSystemIds: ['system-1'],
        fremdeEinheiten: ['m³'],
      });

      // Weder mitsummieren (falsche kWh-Zahl) noch weglassen (zu hohe
      // Einsparung) — der Lauf verweigert die Aussage.
      await expect(service.starten(januarDto({ gtzBaseOverride: 3500 }), betrieb(), true)).rejects.toThrow(
        BerechnungFehlerException,
      );

      const fehlerEintrag = auditAppendMock.mock.calls
        .map((call) => call[0] as { readonly eventTyp: string; readonly kontext?: Record<string, unknown> })
        .find((eintrag) => eintrag.eventTyp === BERECHNUNG_EVENT_CODES.LAUF_FEHLGESCHLAGEN);
      expect(fehlerEintrag?.kontext?.['fehler_code']).toBe('messkanal_einheit_ungueltig');
    });

    it('faellt ohne Zuordnung auf den Endkunden zurueck und weist das im Audit aus', async () => {
      const { service, findAktiveZaehlerIdsMock, findAktiveZaehlerIdsFuerSystemeMock, auditAppendMock } = createService({
        endkunde: endkunde(),
        mvet: mvet(),
        einflussSystemIds: [],
      });

      await service.starten(januarDto({ gtzBaseOverride: 3500 }), betrieb(), true);

      expect(findAktiveZaehlerIdsMock).toHaveBeenCalledWith('endkunde-1', 'gas');
      expect(findAktiveZaehlerIdsFuerSystemeMock).not.toHaveBeenCalled();
      expect(abschlussKontext(auditAppendMock)['systemgrenze_quelle']).toBe('endkunde_fallback');
    });
  });
});
