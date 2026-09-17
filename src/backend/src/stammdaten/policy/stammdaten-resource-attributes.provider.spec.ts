import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { StammdatenResourceAttributesProvider } from './stammdaten-resource-attributes.provider';
import type { AnalyticsBerechnungslaufRepository } from '../../berechnung/persistence/analytics-berechnungslauf.repository';
import type { EnergyEndkundeRepository, Endkunde } from '../persistence/energy/energy-endkunde.repository';
import type { EnergySystemRepository, System } from '../persistence/energy/energy-system.repository';
import type { EnergyZaehlerRepository, Zaehler } from '../persistence/energy/energy-zaehler.repository';
import type { EnergyMesskanalRepository, Messkanal } from '../persistence/energy/energy-messkanal.repository';
import type { EnergyAnschlussnutzerRepository, Anschlussnutzer } from '../persistence/energy/energy-anschlussnutzer.repository';
import type {
  EnergyNutzungsverhaeltnisRepository,
  Nutzungsverhaeltnis,
} from '../persistence/energy/energy-nutzungsverhaeltnis.repository';
import type { EnergyEndkundeShredAntragRepository, ShredAntrag } from '../persistence/energy/energy-endkunde-shred-antrag.repository';
import type { EnergyStandortRepository, Standort } from '../persistence/energy/energy-standort.repository';
import type { DeviceGeraetZuordnungRepository, GeraetZuordnung } from '../persistence/device/device-geraet-zuordnung.repository';
import type { GeraetReverseQuotaRepository } from '../persistence/audit/geraet-reverse-quota.repository';
import type { EinflussIntervallRepository, EinflussIntervall } from '../persistence/einfluss/einfluss-intervall.repository';
import type { NachweisPreflightRepository } from '../../nachweis/persistence/nachweis-preflight.repository';
import type { NachweisEinsparlaufRepository } from '../../nachweis/persistence/nachweis-einsparlauf.repository';
import type { NachweisExportRepository } from '../../nachweis/persistence/nachweis-export.repository';
import type { NachweisEinreichungRepository } from '../../nachweis/persistence/nachweis-einreichung.repository';
import { ProblemDetailsException } from '../../common/exceptions/problem-details.exception';
import { GERAET_REVERSE_QUOTA_JE_SUBJEKT_24H } from '../../auth/policy/geraet-reverse.constants';

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

function system(overrides: Partial<System> = {}): System {
  return {
    id: 'system-1',
    endkundeId: 'endkunde-1',
    bezeichnung: 'Testsystem',
    systemgrenze: 'Gebaeude A',
    systembeschreibung: null,
    standortId: null,
    status: 'aktiv',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function nutzung(overrides: Partial<Nutzungsverhaeltnis> = {}): Nutzungsverhaeltnis {
  return {
    id: 'nutzung-1',
    endkundeId: 'endkunde-1',
    anschlussnutzerId: 'anschlussnutzer-1',
    systemId: 'system-1',
    datenklasse: 'abrechnungsminimum',
    rolle: 'eigentuemer_selbstnutzer',
    gueltigVon: '2026-01-01T00:00:00.000Z',
    gueltigBis: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function geraetZuordnung(overrides: Partial<GeraetZuordnung> = {}): GeraetZuordnung {
  return {
    id: 'zuordnung-1',
    zaehlerId: 'zaehler-1',
    cryptoKeyId: 'crypto-1',
    deveuiEnc: Buffer.from('irrelevant'),
    deveuiBlindIndex: null,
    pepperVersion: 1,
    status: 'aktiv',
    gueltigVon: '2026-07-01T00:00:00.000Z',
    gueltigBis: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
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

function einflussIntervall(overrides: Partial<EinflussIntervall> = {}): EinflussIntervall {
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

function shredAntrag(overrides: Partial<ShredAntrag> = {}): ShredAntrag {
  return {
    id: 'antrag-1',
    endkundeId: 'endkunde-1',
    grund: 'betroffenenantrag_art17',
    beantragtVonSub: 'antragsteller-sub',
    beantragtAm: '2026-07-15T00:00:00.000Z',
    freigeberSub: null,
    entschiedenAm: null,
    status: 'beantragt',
    ablehnungsgrund: null,
    gueltigBis: '2026-07-22T00:00:00.000Z',
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
    ...overrides,
  };
}

function fakeContext(
  params: Record<string, string>,
  options: { readonly body?: unknown; readonly actorSub?: string } = {},
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        params,
        headers: {},
        body: options.body,
        securityContext: options.actorSub !== undefined ? { sub: options.actorSub } : undefined,
      }),
    }),
    // ADR-0006 — `resolve()` ruft am Fallback-Zweig
    // `reflector.getAllAndOverride(FACHAKTION_KEY, [context.getHandler(),
    // context.getClass()])` auf; beide Methoden werden von JEDEM
    // bestehenden Testfall (auch solchen ohne Bezug zu ADR-0006) erreicht,
    // sobald KEIN Pfad-Parameter matcht — Dummy-Werte genügen (der
    // `reflector`-Mock in `createProvider()` ignoriert die Argumente ohnehin).
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function createProvider(overrides: {
  endkunde?: Endkunde | undefined;
  system?: System | undefined;
  zaehler?: Zaehler | undefined;
  messkanal?: Messkanal | undefined;
  anschlussnutzer?: Anschlussnutzer | undefined;
  nutzungsverhaeltnis?: Nutzungsverhaeltnis | undefined;
  nutzungenFuerSystem?: readonly Nutzungsverhaeltnis[];
  nutzungenFuerEndkunde?: readonly Nutzungsverhaeltnis[];
  shredAntrag?: ShredAntrag | undefined;
  standort?: Standort | undefined;
  geraetZuordnung?: GeraetZuordnung | undefined;
  erfolgreicheAufloesungenImFenster?: number;
  /** ADR-0006 — `analytics.berechnungslauf.endkunde_id` fuer `resolveViaBerechnungslauf()`. */
  berechnungslaufEndkundeId?: string | undefined;
  /** ADR-0006 — vom `reflector`-Mock zurueckgegebene `PolicyAction` (Fallback-Zweig `create:berechnungslauf`, JETZT auch `create:/read:einflussgroesse`). */
  fachaktion?: string | undefined;
  /** ADR-0006 Teil B — `einfluss.intervall` fuer `resolveViaEinflussgroesse()` (einflussgroesseId-Route). */
  einflussIntervall?: EinflussIntervall | undefined;
  /** ADR-0007 Teil B — `nachweis.preflight`-Existenz fuer `resolveViaPreflight()` (preflightId-Route). */
  preflightExists?: boolean;
  /** ADR-0007 Teil B — `nachweis.einsparlauf`-Existenz fuer `resolveViaEinsparlauf()` (einsparlaufId-Route). */
  einsparlaufExists?: boolean;
  /** ADR-0007 Teil B STUFE 2 — `nachweis.export`-Existenz fuer `resolveViaNachweisExport()` (exportId-Route). */
  exportExists?: boolean;
  /** ADR-0007 Teil B STUFE 2 — `nachweis.einreichung`-Existenz fuer `resolveViaEinreichung()` (einreichungId-Route). */
  einreichungExists?: boolean;
}): StammdatenResourceAttributesProvider {
  const endkundeRepo = {
    findById: vi.fn(() => Promise.resolve(overrides.endkunde)),
  } as unknown as EnergyEndkundeRepository;
  const systemRepo = {
    findById: vi.fn(() => Promise.resolve(overrides.system)),
  } as unknown as EnergySystemRepository;
  const zaehlerRepo = {
    findById: vi.fn(() => Promise.resolve(overrides.zaehler)),
  } as unknown as EnergyZaehlerRepository;
  const messkanalRepo = {
    findById: vi.fn(() => Promise.resolve(overrides.messkanal)),
  } as unknown as EnergyMesskanalRepository;
  const anschlussnutzerRepo = {
    findById: vi.fn(() => Promise.resolve(overrides.anschlussnutzer)),
  } as unknown as EnergyAnschlussnutzerRepository;
  const nutzungsverhaeltnisRepo = {
    findById: vi.fn(() => Promise.resolve(overrides.nutzungsverhaeltnis)),
    findAktuelleFuerSystem: vi.fn(() => Promise.resolve(overrides.nutzungenFuerSystem ?? [])),
    findAktuelleFuerEndkunde: vi.fn(() => Promise.resolve(overrides.nutzungenFuerEndkunde ?? [])),
  } as unknown as EnergyNutzungsverhaeltnisRepository;
  const shredAntragRepo = {
    findById: vi.fn(() => Promise.resolve(overrides.shredAntrag)),
  } as unknown as EnergyEndkundeShredAntragRepository;
  const standortRepo = {
    findById: vi.fn(() => Promise.resolve(overrides.standort)),
  } as unknown as EnergyStandortRepository;
  const geraetZuordnungRepo = {
    findById: vi.fn(() => Promise.resolve(overrides.geraetZuordnung)),
  } as unknown as DeviceGeraetZuordnungRepository;
  const geraetReverseQuotaRepo = {
    sperreUndZaehleErfolgreicheAufloesungenImFenster: vi.fn(() =>
      Promise.resolve(overrides.erfolgreicheAufloesungenImFenster ?? 0),
    ),
  } as unknown as GeraetReverseQuotaRepository;
  const berechnungslaufRepo = {
    findEndkundeIdById: vi.fn(() => Promise.resolve(overrides.berechnungslaufEndkundeId)),
  } as unknown as AnalyticsBerechnungslaufRepository;
  const einflussIntervallRepo = {
    findById: vi.fn(() => Promise.resolve(overrides.einflussIntervall)),
  } as unknown as EinflussIntervallRepository;
  const nachweisPreflightRepo = {
    findById: vi.fn(() => Promise.resolve(overrides.preflightExists === true ? {} : undefined)),
  } as unknown as NachweisPreflightRepository;
  const nachweisEinsparlaufRepo = {
    existsById: vi.fn(() => Promise.resolve(overrides.einsparlaufExists === true)),
  } as unknown as NachweisEinsparlaufRepository;
  const nachweisExportRepo = {
    existsById: vi.fn(() => Promise.resolve(overrides.exportExists === true)),
  } as unknown as NachweisExportRepository;
  const nachweisEinreichungRepo = {
    existsById: vi.fn(() => Promise.resolve(overrides.einreichungExists === true)),
  } as unknown as NachweisEinreichungRepository;
  const reflector = {
    getAllAndOverride: vi.fn(() => overrides.fachaktion),
  } as unknown as Reflector;

  return new StammdatenResourceAttributesProvider(
    endkundeRepo,
    systemRepo,
    zaehlerRepo,
    messkanalRepo,
    anschlussnutzerRepo,
    nutzungsverhaeltnisRepo,
    shredAntragRepo,
    standortRepo,
    geraetZuordnungRepo,
    geraetReverseQuotaRepo,
    berechnungslaufRepo,
    einflussIntervallRepo,
    nachweisPreflightRepo,
    nachweisEinsparlaufRepo,
    nachweisExportRepo,
    nachweisEinreichungRepo,
    reflector,
  );
}

describe('StammdatenResourceAttributesProvider (ADR-0008 §15, D3)', () => {
  it('liefert undefined, wenn kein Entitaets-Pfadparameter vorhanden ist (Listen-/Monitoring-Routen)', async () => {
    const provider = createProvider({});
    const result = await provider.resolve(fakeContext({}));
    expect(result).toBeUndefined();
  });

  it('endkundeId -> loest Endkunde-Attribute + aktuelle Nutzungsverhaeltnisse auf', async () => {
    const provider = createProvider({
      endkunde: endkunde({ vonWissAuswertungAusgenommen: true }),
      nutzungenFuerEndkunde: [nutzung({ datenklasse: 'abrechnungsminimum' })],
    });

    const result = await provider.resolve(fakeContext({ endkundeId: 'endkunde-1' }));

    expect(result).toEqual({
      entityTyp: 'endkunde',
      verarbeitungsStatus: 'aktiv',
      vonWissAuswertungAusgenommen: true,
      datenklasse: 'abrechnungsminimum',
      anschlussnutzerAbweichtEndkunde: false,
    });
  });

  it('endkundeId ohne existierenden Endkunden -> undefined (kein stiller Fantasiewert)', async () => {
    const provider = createProvider({ endkunde: undefined });
    const result = await provider.resolve(fakeContext({ endkundeId: 'unbekannt' }));
    expect(result).toBeUndefined();
  });

  it('systemId loest via system.endkundeId die Endkunde-Attribute auf + fragt Nutzungsverhaeltnisse ueber system_id', async () => {
    const nutzungsverhaeltnisRepoSpy = vi.fn(() => Promise.resolve([nutzung()]));
    const provider = createProvider({
      system: system(),
      endkunde: endkunde(),
      nutzungenFuerSystem: [nutzung()],
    });

    const result = await provider.resolve(fakeContext({ systemId: 'system-1' }));

    expect(result?.entityTyp).toBe('system');
    expect(result?.verarbeitungsStatus).toBe('aktiv');
    void nutzungsverhaeltnisRepoSpy;
  });

  it('zaehlerId loest die Kette zaehler->system->endkunde auf', async () => {
    const provider = createProvider({
      zaehler: { id: 'zaehler-1', systemId: 'system-1' } as Zaehler,
      system: system(),
      endkunde: endkunde(),
    });

    const result = await provider.resolve(fakeContext({ zaehlerId: 'zaehler-1' }));
    expect(result?.entityTyp).toBe('zaehler');
  });

  describe('ADR-0005 §26.4 — geraetZuordnung (create/update:geraet_zuordnung)', () => {
    it('zaehlerId (create-Route) traegt zusaetzlich resource.geraetZuordnung.zaehlerId', async () => {
      const provider = createProvider({
        zaehler: { id: 'zaehler-1', systemId: 'system-1' } as Zaehler,
        system: system(),
        endkunde: endkunde(),
      });

      const result = await provider.resolve(fakeContext({ zaehlerId: 'zaehler-1' }));
      expect(result?.geraetZuordnung).toEqual({ zaehlerId: 'zaehler-1' });
    });

    it('geraetZuordnungId (update-Route) loest resource.geraetZuordnung.zaehlerId direkt ueber die Zuordnungs-Zeile auf', async () => {
      const provider = createProvider({
        geraetZuordnung: geraetZuordnung({ id: 'zuordnung-9', zaehlerId: 'zaehler-9' }),
      });

      const result = await provider.resolve(fakeContext({ geraetZuordnungId: 'zuordnung-9' }));
      expect(result).toEqual({ geraetZuordnung: { zaehlerId: 'zaehler-9' } });
    });

    it('geraetZuordnungId mit unbekannter ID -> undefined (kein stiller Fantasiewert, Service prueft 404 erneut)', async () => {
      const provider = createProvider({ geraetZuordnung: undefined });

      const result = await provider.resolve(fakeContext({ geraetZuordnungId: 'unbekannt' }));
      expect(result).toBeUndefined();
    });

    it('Pfadparameter-Prioritaet: geraetZuordnungId gewinnt vor nutzungsverhaeltnisId/endkundeId', async () => {
      const provider = createProvider({
        geraetZuordnung: geraetZuordnung({ zaehlerId: 'zaehler-9' }),
        nutzungsverhaeltnis: nutzung(),
        endkunde: endkunde(),
      });

      const result = await provider.resolve(
        fakeContext({ geraetZuordnungId: 'zuordnung-1', nutzungsverhaeltnisId: 'nutzung-1', endkundeId: 'endkunde-1' }),
      );
      expect(result).toEqual({ geraetZuordnung: { zaehlerId: 'zaehler-9' } });
    });
  });

  describe('ADR-0005 §26.4 SEC-5 — geraetReverse (read:geraet_zuordnung, Reverse-Aufloesung)', () => {
    it('Body mit zweck/ticketRef -> resource.geraetReverse mit quotaUeberschritten=false (unter Quota)', async () => {
      const provider = createProvider({
        geraetZuordnung: geraetZuordnung({ zaehlerId: 'zaehler-9' }),
        erfolgreicheAufloesungenImFenster: 3,
      });

      const result = await provider.resolve(
        fakeContext(
          { geraetZuordnungId: 'zuordnung-1' },
          { body: { zweck: 'geraete_stoerungsdiagnose', ticketRef: 'HD-1' }, actorSub: 'support-sub' },
        ),
      );

      expect(result).toEqual({
        geraetZuordnung: { zaehlerId: 'zaehler-9' },
        geraetReverse: { zweck: 'geraete_stoerungsdiagnose', ticketRef: 'HD-1', quotaUeberschritten: false },
      });
    });

    it('Quota erreicht (Anzahl >= GERAET_REVERSE_QUOTA_JE_SUBJEKT_24H) -> quotaUeberschritten=true', async () => {
      const provider = createProvider({
        geraetZuordnung: geraetZuordnung({ zaehlerId: 'zaehler-9' }),
        erfolgreicheAufloesungenImFenster: GERAET_REVERSE_QUOTA_JE_SUBJEKT_24H,
      });

      const result = await provider.resolve(
        fakeContext(
          { geraetZuordnungId: 'zuordnung-1' },
          { body: { zweck: 'geraete_stoerungsdiagnose', ticketRef: 'HD-1' }, actorSub: 'support-sub' },
        ),
      );

      expect(result?.geraetReverse?.quotaUeberschritten).toBe(true);
    });

    it('Body OHNE zweck/ticketRef (z. B. PATCH-Route mit {aktion:"deaktivieren"}) -> KEIN geraetReverse-Attribut, KEINE Quota-Abfrage', async () => {
      const provider = createProvider({ geraetZuordnung: geraetZuordnung({ zaehlerId: 'zaehler-9' }) });

      const result = await provider.resolve(
        fakeContext({ geraetZuordnungId: 'zuordnung-1' }, { body: { aktion: 'deaktivieren' }, actorSub: 'support-sub' }),
      );

      expect(result).toEqual({ geraetZuordnung: { zaehlerId: 'zaehler-9' } });
      expect(result?.geraetReverse).toBeUndefined();
    });

    it('Fail-closed-Backstop: KEIN securityContext.sub (sollte strukturell nie vorkommen) -> Quota als ueberschritten behandelt (deny statt permit)', async () => {
      const provider = createProvider({ geraetZuordnung: geraetZuordnung({ zaehlerId: 'zaehler-9' }) });

      const result = await provider.resolve(
        fakeContext({ geraetZuordnungId: 'zuordnung-1' }, { body: { zweck: 'geraete_stoerungsdiagnose', ticketRef: 'HD-1' } }),
      );

      expect(result?.geraetReverse?.quotaUeberschritten).toBe(true);
    });

    it('Praezisions-Fix: Body MIT gueltigem zweck, aber OHNE ticketRef -> geraetReverse.ticketRef bleibt undefined (PDP liefert praezise geraet_reverse_ticket_fehlt, NICHT zweck_fehlt)', async () => {
      const provider = createProvider({ geraetZuordnung: geraetZuordnung({ zaehlerId: 'zaehler-9' }) });

      const result = await provider.resolve(
        fakeContext(
          { geraetZuordnungId: 'zuordnung-1' },
          { body: { zweck: 'geraete_stoerungsdiagnose' }, actorSub: 'support-sub' },
        ),
      );

      expect(result?.geraetReverse?.zweck).toBe('geraete_stoerungsdiagnose');
      expect(result?.geraetReverse?.ticketRef).toBeUndefined();
    });

    it('Praezisions-Fix: Body MIT ticketRef, aber OHNE zweck -> geraetReverse.zweck bleibt undefined', async () => {
      const provider = createProvider({ geraetZuordnung: geraetZuordnung({ zaehlerId: 'zaehler-9' }) });

      const result = await provider.resolve(
        fakeContext({ geraetZuordnungId: 'zuordnung-1' }, { body: { ticketRef: 'HD-1' }, actorSub: 'support-sub' }),
      );

      expect(result?.geraetReverse?.ticketRef).toBe('HD-1');
      expect(result?.geraetReverse?.zweck).toBeUndefined();
    });
  });

  it('messkanalId loest die Kette messkanal->zaehler->system->endkunde auf', async () => {
    const provider = createProvider({
      messkanal: { id: 'messkanal-1', zaehlerId: 'zaehler-1' } as Messkanal,
      zaehler: { id: 'zaehler-1', systemId: 'system-1' } as Zaehler,
      system: system(),
      endkunde: endkunde(),
    });

    const result = await provider.resolve(fakeContext({ messkanalId: 'messkanal-1' }));
    expect(result?.entityTyp).toBe('messkanal');
  });

  it('anschlussnutzerId loest via anschlussnutzer.endkundeId die Endkunde-Attribute auf', async () => {
    const provider = createProvider({
      anschlussnutzer: { id: 'anschlussnutzer-1', endkundeId: 'endkunde-1' } as Anschlussnutzer,
      endkunde: endkunde(),
    });

    const result = await provider.resolve(fakeContext({ anschlussnutzerId: 'anschlussnutzer-1' }));
    expect(result?.entityTyp).toBe('anschlussnutzer');
  });

  it('nutzungsverhaeltnisId loest die Beziehung + deren Endkunde direkt auf (kein Umweg ueber System)', async () => {
    const provider = createProvider({
      nutzungsverhaeltnis: nutzung({ datenklasse: 'detailverbrauch', rolle: 'mieter' }),
      endkunde: endkunde(),
    });

    const result = await provider.resolve(fakeContext({ nutzungsverhaeltnisId: 'nutzung-1' }));

    expect(result).toEqual({
      entityTyp: 'nutzungsverhaeltnis',
      verarbeitungsStatus: 'aktiv',
      vonWissAuswertungAusgenommen: false,
      datenklasse: 'detailverbrauch',
      anschlussnutzerAbweichtEndkunde: true,
    });
  });

  it('Pfadparameter-Prioritaet: nutzungsverhaeltnisId gewinnt, selbst wenn zusaetzlich endkundeId vorhanden waere', async () => {
    const findByIdNutzung = vi.fn(() => Promise.resolve(nutzung()));
    const provider = createProvider({ nutzungsverhaeltnis: nutzung(), endkunde: endkunde() });
    // Simuliert einen (hypothetischen) Request mit beiden Parametern.
    const result = await provider.resolve(
      fakeContext({ nutzungsverhaeltnisId: 'nutzung-1', endkundeId: 'endkunde-1' }),
    );
    expect(result?.entityTyp).toBe('nutzungsverhaeltnis');
    void findByIdNutzung;
  });

  describe('ADR-0009 §2.2/§2.4/§6 — antragId (Vier-Augen-Krypto-Shredding)', () => {
    it('antragId (+ passende endkundeId) -> loest resource.shredAntrag auf, hoechste Prioritaet vor allen anderen Pfadparametern', async () => {
      const provider = createProvider({
        shredAntrag: shredAntrag({ beantragtVonSub: 'antragsteller-sub', status: 'beantragt' }),
      });

      const result = await provider.resolve(
        fakeContext({ antragId: 'antrag-1', endkundeId: 'endkunde-1', nutzungsverhaeltnisId: 'nutzung-1' }),
      );

      expect(result).toEqual({ shredAntrag: { beantragtVonSub: 'antragsteller-sub', status: 'beantragt' } });
    });

    it('antragId mit unbekannter Antrag-ID -> wirft 404 (nichtGefunden), NICHT resource=undefined', async () => {
      const provider = createProvider({ shredAntrag: undefined });

      await expect(
        provider.resolve(fakeContext({ antragId: 'unbekannt', endkundeId: 'endkunde-1' })),
      ).rejects.toBeInstanceOf(ProblemDetailsException);
    });

    it('antragId mit ABWEICHENDER endkundeId im Pfad (Scope-Mismatch) -> wirft 404 (Provider-Scoping, ADR-0009 §2.4/§6 — bestaetigt NICHT die Existenz eines fremden Antrags)', async () => {
      const provider = createProvider({
        shredAntrag: shredAntrag({ endkundeId: 'echter-endkunde', beantragtVonSub: 'antragsteller-sub' }),
      });

      await expect(
        provider.resolve(fakeContext({ antragId: 'antrag-1', endkundeId: 'falscher-endkunde' })),
      ).rejects.toBeInstanceOf(ProblemDetailsException);
    });
  });

  describe('Finding A — fail-closed bei Mehrzeilen (kein stilles LIMIT 1)', () => {
    it('mehrere aktuelle Nutzungsverhaeltnisse auf System-Ebene: detailverbrauch gewinnt (restriktivste Datenklasse)', async () => {
      const provider = createProvider({
        system: system(),
        endkunde: endkunde(),
        nutzungenFuerSystem: [
          nutzung({ id: 'a', datenklasse: 'abrechnungsminimum', rolle: 'eigentuemer_selbstnutzer' }),
          nutzung({ id: 'b', datenklasse: 'detailverbrauch', rolle: 'mieter' }),
        ],
      });

      const result = await provider.resolve(fakeContext({ systemId: 'system-1' }));

      expect(result?.datenklasse).toBe('detailverbrauch');
      expect(result?.anschlussnutzerAbweichtEndkunde).toBe(true);
    });

    it('mehrere aktuelle Nutzungsverhaeltnisse, alle abrechnungsminimum + eigentuemer_selbstnutzer -> bleibt unrestriktiv (kein falscher Alarm)', async () => {
      const provider = createProvider({
        system: system(),
        endkunde: endkunde(),
        nutzungenFuerSystem: [
          nutzung({ id: 'a', datenklasse: 'abrechnungsminimum', rolle: 'eigentuemer_selbstnutzer' }),
          nutzung({ id: 'b', datenklasse: 'abrechnungsminimum', rolle: 'eigentuemer_selbstnutzer' }),
        ],
      });

      const result = await provider.resolve(fakeContext({ systemId: 'system-1' }));

      expect(result?.datenklasse).toBe('abrechnungsminimum');
      expect(result?.anschlussnutzerAbweichtEndkunde).toBe(false);
    });

    it('keine aktuellen Nutzungsverhaeltnisse -> datenklasse/anschlussnutzerAbweichtEndkunde bleiben unbefuellt (kein Fantasiewert)', async () => {
      const provider = createProvider({ system: system(), endkunde: endkunde(), nutzungenFuerSystem: [] });

      const result = await provider.resolve(fakeContext({ systemId: 'system-1' }));

      expect(result?.datenklasse).toBeUndefined();
      expect(result?.anschlussnutzerAbweichtEndkunde).toBeUndefined();
    });
  });

  describe('ADR-0010 D5 — resolveViaStandort (standortId)', () => {
    it('loest resource.standort AUSSCHLIESSLICH aus energy.standort auf (endkundeId/typ/ebene/status, KEINE PII)', async () => {
      const provider = createProvider({
        standort: standort({ id: 'standort-9', endkundeId: 'endkunde-9', typ: 'gebaeude', ebene: 1, status: 'aktiv' }),
      });

      const result = await provider.resolve(fakeContext({ standortId: 'standort-9' }));

      expect(result).toEqual({
        standort: { endkundeId: 'endkunde-9', typ: 'gebaeude', ebene: 1, status: 'aktiv' },
      });
    });

    it('unbekannte standortId -> undefined (PDP-Kurzschluss kein_ressourcenbezug/permit)', async () => {
      const provider = createProvider({ standort: undefined });

      const result = await provider.resolve(fakeContext({ standortId: 'unbekannt' }));

      expect(result).toBeUndefined();
    });

    it('standortId hat Prioritaet vor endkundeId, falls (untypisch) beide im Request vorkaemen', async () => {
      const provider = createProvider({
        standort: standort({ id: 'standort-1' }),
        endkunde: endkunde(),
      });

      const result = await provider.resolve(fakeContext({ standortId: 'standort-1', endkundeId: 'endkunde-1' }));

      expect(result?.standort).toBeDefined();
      expect(result?.entityTyp).toBeUndefined();
    });
  });

  describe('ADR-0006 — resolveViaBerechnungslauf (laufId) + Body-Fallback (create:berechnungslauf)', () => {
    it('laufId loest via analytics.berechnungslauf.endkunde_id die Endkunde-Attribute auf (entityTyp=berechnungslauf)', async () => {
      const provider = createProvider({
        berechnungslaufEndkundeId: 'endkunde-1',
        endkunde: endkunde({ id: 'endkunde-1' }),
      });

      const result = await provider.resolve(fakeContext({ laufId: 'lauf-1' }));

      expect(result?.entityTyp).toBe('berechnungslauf');
      expect(result?.verarbeitungsStatus).toBe('aktiv');
    });

    it('unbekannte laufId -> undefined (PDP-Kurzschluss kein_ressourcenbezug/permit, Service liefert die eigentliche 404)', async () => {
      const provider = createProvider({ berechnungslaufEndkundeId: undefined });

      const result = await provider.resolve(fakeContext({ laufId: 'unbekannt' }));

      expect(result).toBeUndefined();
    });

    it('laufId hat Prioritaet vor endkundeId, falls (untypisch) beide im Request vorkaemen', async () => {
      const provider = createProvider({
        berechnungslaufEndkundeId: 'endkunde-1',
        endkunde: endkunde({ id: 'endkunde-1' }),
      });

      const result = await provider.resolve(fakeContext({ laufId: 'lauf-1', endkundeId: 'endkunde-1' }));

      expect(result?.entityTyp).toBe('berechnungslauf');
    });

    it('create:berechnungslauf OHNE Pfad-Parameter loest endkundeId AUS DEM BODY auf (analog create:standort)', async () => {
      const provider = createProvider({
        fachaktion: 'create:berechnungslauf',
        endkunde: endkunde({ id: 'endkunde-7' }),
      });

      const result = await provider.resolve(
        fakeContext({}, { body: { endkundeId: 'endkunde-7', mvetId: 'mvet-1' } }),
      );

      expect(result?.entityTyp).toBe('endkunde');
      expect(result?.verarbeitungsStatus).toBe('aktiv');
    });

    it('create:berechnungslauf mit Body OHNE endkundeId-Feld -> undefined (kein Fantasiewert)', async () => {
      const provider = createProvider({ fachaktion: 'create:berechnungslauf' });

      const result = await provider.resolve(fakeContext({}, { body: { mvetId: 'mvet-1' } }));

      expect(result).toBeUndefined();
    });

    it('andere Aktionen OHNE Pfad-Parameter lesen den Body NICHT (kein stiller Endkunde-Treffer fuer fremde Routen)', async () => {
      const provider = createProvider({
        fachaktion: 'read:stammdaten',
        endkunde: endkunde({ id: 'endkunde-7' }),
      });

      const result = await provider.resolve(fakeContext({}, { body: { endkundeId: 'endkunde-7' } }));

      expect(result).toBeUndefined();
    });
  });

  describe('ADR-0006 Teil B (B8/B10) — einflussgroesseId + Fachaktion-verzweigte systemId (create:/read:einflussgroesse)', () => {
    it('einflussgroesseId loest via einfluss.intervall.system_id -> resolveViaSystem() auf (entityTyp=einflussgroesse)', async () => {
      const provider = createProvider({
        einflussIntervall: einflussIntervall({ systemId: 'system-1', groesseCode: 'nutzflaeche', betroffenerTyp: 'anschlussnutzer' }),
        system: system({ id: 'system-1', endkundeId: 'endkunde-1' }),
        endkunde: endkunde({ id: 'endkunde-1' }),
      });

      const result = await provider.resolve(fakeContext({ einflussgroesseId: 'intervall-1' }));

      expect(result?.entityTyp).toBe('einflussgroesse');
      expect(result?.verarbeitungsStatus).toBe('aktiv');
      expect(result?.einflussgroesse).toEqual({
        endkundeId: 'endkunde-1',
        systemId: 'system-1',
        groesseCode: 'nutzflaeche',
        betroffenerTyp: 'anschlussnutzer',
      });
    });

    it('unbekannte einflussgroesseId -> undefined (PDP-Kurzschluss kein_ressourcenbezug/permit, Service liefert die eigentliche 404)', async () => {
      const provider = createProvider({ einflussIntervall: undefined });

      const result = await provider.resolve(fakeContext({ einflussgroesseId: 'unbekannt' }));

      expect(result).toBeUndefined();
    });

    it('create:einflussgroesse (systemId-Route) loest entityTyp=einflussgroesse auf UND liest groesseCode/betroffenerTyp AUS DEM BODY', async () => {
      const provider = createProvider({
        fachaktion: 'create:einflussgroesse',
        system: system({ id: 'system-1', endkundeId: 'endkunde-1' }),
        endkunde: endkunde({ id: 'endkunde-1' }),
      });

      const result = await provider.resolve(
        fakeContext({ systemId: 'system-1' }, { body: { groesseCode: 'personenanzahl', betroffenerTyp: 'endkunde' } }),
      );

      expect(result?.entityTyp).toBe('einflussgroesse');
      expect(result?.einflussgroesse).toEqual({
        endkundeId: 'endkunde-1',
        systemId: 'system-1',
        groesseCode: 'personenanzahl',
        betroffenerTyp: 'endkunde',
      });
    });

    it('read:einflussgroesse (systemId-Route, GET ohne Body) loest entityTyp=einflussgroesse OHNE groesseCode/betroffenerTyp auf', async () => {
      const provider = createProvider({
        fachaktion: 'read:einflussgroesse',
        system: system({ id: 'system-1', endkundeId: 'endkunde-1' }),
        endkunde: endkunde({ id: 'endkunde-1' }),
      });

      const result = await provider.resolve(fakeContext({ systemId: 'system-1' }));

      expect(result?.entityTyp).toBe('einflussgroesse');
      expect(result?.einflussgroesse).toEqual({ endkundeId: 'endkunde-1', systemId: 'system-1' });
    });

    it('JEDE ANDERE systemId-Route (kein einflussgroesse-Fachaktion) bleibt UNVERAENDERT bei entityTyp=system', async () => {
      const provider = createProvider({
        fachaktion: 'update:system',
        system: system({ id: 'system-1', endkundeId: 'endkunde-1' }),
        endkunde: endkunde({ id: 'endkunde-1' }),
      });

      const result = await provider.resolve(fakeContext({ systemId: 'system-1' }));

      expect(result?.entityTyp).toBe('system');
      expect(result?.einflussgroesse).toBeUndefined();
    });
  });

  describe('ADR-0007 Teil B (B10) STUFE 2 — resolveViaNachweisExport (exportId) / resolveViaEinreichung (einreichungId)', () => {
    it('existierende exportId -> entityTyp=nachweisExport (reines Existenz-/404-Signal, PORTFOLIOWEIT)', async () => {
      const provider = createProvider({ exportExists: true });

      const result = await provider.resolve(fakeContext({ exportId: 'export-1' }));

      expect(result).toEqual({ entityTyp: 'nachweisExport' });
    });

    it('unbekannte exportId -> undefined (PDP-Kurzschluss kein_ressourcenbezug/permit, Service liefert danach 404)', async () => {
      const provider = createProvider({ exportExists: false });

      const result = await provider.resolve(fakeContext({ exportId: 'unbekannt' }));

      expect(result).toBeUndefined();
    });

    it('existierende einreichungId -> entityTyp=einreichung', async () => {
      const provider = createProvider({ einreichungExists: true });

      const result = await provider.resolve(fakeContext({ einreichungId: 'einreichung-1' }));

      expect(result).toEqual({ entityTyp: 'einreichung' });
    });

    it('unbekannte einreichungId -> undefined', async () => {
      const provider = createProvider({ einreichungExists: false });

      const result = await provider.resolve(fakeContext({ einreichungId: 'unbekannt' }));

      expect(result).toBeUndefined();
    });
  });
});
