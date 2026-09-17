import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { IngestFlowService } from './ingest-flow.service';
import { IngestLoggerService } from './ingest-logger.service';
import { IngestMetricsService } from './ingest-metrics.service';
import { BlindIndexService } from '../../common/crypto/blind-index.service';
import { DecoderRegistry } from '../decoder/decoder-registry';
import { SynthetischReferenzV1Decoder, SYNTHETISCH_REFERENZ_V1_GERAETETYP } from '../decoder/synthetisch-referenz-v1.decoder';
import { DeviceForwardLookupRepository } from '../persistence/device-forward-lookup.repository';
import { EnergyStammdatenLookupRepository } from '../persistence/energy-stammdaten-lookup.repository';
import { HerkunftAbgleichRepository } from '../persistence/herkunft-abgleich.repository';
import { MesswertSchreibpfadRepository } from '../persistence/messwert-schreibpfad.repository';
import { IngestQuarantaeneRepository } from '../persistence/ingest-quarantaene.repository';
import type { QuarantaeneInsertInput } from '../persistence/ingest-quarantaene.repository';
import { ConsentGateRepository } from '../persistence/consent-gate.repository';
import { VerwurfAggregatRepository } from '../persistence/verwurf-aggregat.repository';
import { ConsentEnforcementConfig } from '../config/consent-enforcement.config';

const ZAEHLER_ID = '018f1e2d-0000-7000-8000-000000000001';
const BLIND_INDEX = Buffer.from('blind-index-fake');

function buildEnvelopePayload(input: {
  devEui?: string;
  fPort?: number;
  data: unknown;
  tenantId?: string;
}): Buffer {
  return Buffer.from(
    JSON.stringify({
      deviceInfo: {
        devEui: input.devEui ?? 'AA-AA-AA-AA-AA-AA-AA-01',
        ...(input.tenantId !== undefined ? { tenantId: input.tenantId } : {}),
      },
      fPort: input.fPort ?? 1,
      data: Buffer.from(JSON.stringify(input.data)).toString('base64'),
    }),
    'utf8',
  );
}

describe('IngestFlowService (ADR-0005 §20, D8 — Ingest-Flow-Pipeline)', () => {
  let blindIndexService: BlindIndexService;
  let forwardLookupRepository: DeviceForwardLookupRepository;
  let energyRepository: EnergyStammdatenLookupRepository;
  let herkunftAbgleichRepository: HerkunftAbgleichRepository;
  let pruefeMock: Mock;
  let findGeraetetypMock: Mock;
  let decoderRegistry: DecoderRegistry;
  let schreibpfadRepository: MesswertSchreibpfadRepository;
  let quarantaeneRepository: IngestQuarantaeneRepository;
  let service: IngestFlowService;
  let insertMock: Mock;
  let upsertMock: Mock;
  let metrics: IngestMetricsService;

  /**
   * Auflage C-6: Die dauerhafte Verwurf-Zaehlung (V0085) laeuft ueber eine
   * eigene Verbindung. In den Unit-Tests steht dafuer ein Mock — geprueft
   * wird hier die ENTSCHEIDUNG des Gates, nicht der Schreibpfad der
   * Zaehlung; der haengt am echten PostgreSQL und gehoert in den
   * Integrationstest.
   */
  const verwurfZaehleMock: Mock = vi.fn().mockResolvedValue(undefined);
  const verwurfAggregatMock = {
    zaehle: verwurfZaehleMock,
  } as unknown as VerwurfAggregatRepository;

  /**
   * ADR-0012 E5/Stufe C — baut eine eigene `IngestFlowService`-Instanz mit
   * austauschbarem `ConsentEnforcementConfig`/`ConsentGateRepository`,
   * wiederverwendet aber alle uebrigen Mocks aus dem aeusseren `beforeEach`.
   * Getrennt vom Standard-`service` (Schalter AUS), damit die
   * Alt-Tests weiterhin unveraendert gegen den bisherigen Default laufen.
   */
  function buildService(options: {
    readonly enforced: boolean;
    readonly messdatenVerarbeitungErlaubt?: Mock;
  }): { readonly service: IngestFlowService; readonly consentGateMock: Mock } {
    const consentGateMock = options.messdatenVerarbeitungErlaubt ?? vi.fn().mockResolvedValue(true);
    const consentGateRepository = {
      messdatenVerarbeitungErlaubt: consentGateMock,
    } as unknown as ConsentGateRepository;
    const consentEnforcementConfig = { enforced: options.enforced } as unknown as ConsentEnforcementConfig;

    return {
      service: new IngestFlowService(
        blindIndexService,
        forwardLookupRepository,
        energyRepository,
        herkunftAbgleichRepository,
        decoderRegistry,
        schreibpfadRepository,
        quarantaeneRepository,
        new IngestLoggerService(),
        metrics,
        consentGateRepository,
        verwurfAggregatMock,
        consentEnforcementConfig,
      ),
      consentGateMock,
    };
  }

  beforeEach(() => {
    insertMock = vi.fn().mockResolvedValue(undefined);
    upsertMock = vi.fn().mockResolvedValue({ geschrieben: true });

    blindIndexService = {
      berechne: vi.fn().mockResolvedValue({ blindIndex: BLIND_INDEX, pepperVersion: 1 }),
    } as unknown as BlindIndexService;

    forwardLookupRepository = {
      findAktivenZaehler: vi.fn().mockResolvedValue(ZAEHLER_ID),
    } as unknown as DeviceForwardLookupRepository;

    findGeraetetypMock = vi.fn().mockResolvedValue(SYNTHETISCH_REFERENZ_V1_GERAETETYP);
    energyRepository = {
      findGeraetetyp: findGeraetetypMock,
      findAktivenMesskanal: vi.fn().mockResolvedValue({ kanalKey: 42, einheit: 'kWh', art: 'kumulativ_zaehlerstand' }),
    } as unknown as EnergyStammdatenLookupRepository;

    // Default: kein Mapping gepflegt -- der Abgleich haelt niemanden auf.
    // Genau so verhaelt sich eine Instanz, in der ADR-0011 B2 noch nicht
    // benutzt wird; alle Alt-Tests laufen damit unveraendert.
    pruefeMock = vi.fn().mockResolvedValue({ art: 'kein_mapping' });
    herkunftAbgleichRepository = { pruefe: pruefeMock } as unknown as HerkunftAbgleichRepository;

    decoderRegistry = new DecoderRegistry();
    decoderRegistry.register(new SynthetischReferenzV1Decoder());

    schreibpfadRepository = {
      findNachbarwerte: vi.fn().mockResolvedValue({ vorherige: [], naechster: undefined }),
      upsertMesswertUndFreshness: upsertMock,
    } as unknown as MesswertSchreibpfadRepository;

    quarantaeneRepository = { insert: insertMock } as unknown as IngestQuarantaeneRepository;

    metrics = new IngestMetricsService();

    // Schalter AUS (Default, ADR-0012 §9) — dieselbe Konstruktion wie
    // `buildService({ enforced: false })`, hier inline gehalten, damit ALLE
    // bestehenden Tests unten unveraendert (und ohne Kenntnis von Consent)
    // funktionieren.
    const consentGateRepository = {
      messdatenVerarbeitungErlaubt: vi.fn().mockResolvedValue(true),
    } as unknown as ConsentGateRepository;
    const consentEnforcementConfig = { enforced: false } as unknown as ConsentEnforcementConfig;

    service = new IngestFlowService(
      blindIndexService,
      forwardLookupRepository,
      energyRepository,
      herkunftAbgleichRepository,
      decoderRegistry,
      schreibpfadRepository,
      quarantaeneRepository,
      new IngestLoggerService(),
      metrics,
      consentGateRepository,
      verwurfAggregatMock,
      consentEnforcementConfig,
    );
  });

  function gueltigerMesswert(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      messgroesse: 'wirkarbeit',
      wertRoh: 10,
      einheit: 'kWh',
      art: 'kumulativ_zaehlerstand',
      deviceTimestampIso: new Date().toISOString(),
      ...overrides,
    };
  }

  it('schreibt einen gueltigen Messwert idempotent (kein Dead-Letter)', async () => {
    await service.verarbeiteUplink({ topicRedacted: 'application/1/device/***/event/up', payload: buildEnvelopePayload({ data: gueltigerMesswert() }) });

    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(insertMock).not.toHaveBeenCalled();
    const call = upsertMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call['messkanalKey']).toBe(42);
    expect(call['qualitaet']).toBe(0);
    expect(call['herkunft']).toBe(0); // ingest_live Default
  });

  it('herkunft=backfill wird an den Schreibpfad durchgereicht', async () => {
    await service.verarbeiteUplink({
      topicRedacted: 'application/1/device/***/event/up',
      payload: buildEnvelopePayload({ data: gueltigerMesswert() }),
      herkunft: 'backfill',
    });

    const call = upsertMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call['herkunft']).toBe(1);
  });

  it('envelope_parse_fehler bei kaputtem JSON — SEC-1: kein redigiertes JSON, nur Laenge+Hash', async () => {
    await service.verarbeiteUplink({ topicRedacted: 'application/1/device/***/event/up', payload: Buffer.from('{kaputt', 'utf8') });

    expect(insertMock).toHaveBeenCalledTimes(1);
    const input = insertMock.mock.calls[0]?.[0] as QuarantaeneInsertInput;
    expect(input.grund).toBe('envelope_parse_fehler');
    expect(input.payload.art).toBe('secOne');
    expect(input.zaehlerId).toBeUndefined();
    expect(input.deveuiBlindIndex).toBeUndefined();
  });

  it('envelope_parse_fehler bei malformter DevEUI (BlindIndexService wirft) — ebenfalls SEC-1-Sonderform', async () => {
    (blindIndexService.berechne as Mock).mockRejectedValueOnce(new Error('ungueltiges Format'));

    await service.verarbeiteUplink({
      topicRedacted: 'application/1/device/***/event/up',
      payload: buildEnvelopePayload({ data: gueltigerMesswert() }),
    });

    const input = insertMock.mock.calls[0]?.[0] as QuarantaeneInsertInput;
    expect(input.grund).toBe('envelope_parse_fehler');
    expect(input.payload.art).toBe('secOne');
  });

  it('devEUI_unbekannt bei Forward-Lookup-Miss', async () => {
    (forwardLookupRepository.findAktivenZaehler as Mock).mockResolvedValueOnce(undefined);

    await service.verarbeiteUplink({
      topicRedacted: 'application/1/device/***/event/up',
      payload: buildEnvelopePayload({ data: gueltigerMesswert() }),
    });

    const input = insertMock.mock.calls[0]?.[0] as QuarantaeneInsertInput;
    expect(input.grund).toBe('devEUI_unbekannt');
    expect(input.payload.art).toBe('redacted');
    expect(input.deveuiBlindIndex).toEqual(BLIND_INDEX);
    expect(input.zaehlerId).toBeUndefined();
  });

  it('unbekannter_geraetetyp, wenn energy.zaehler.geraetetyp keinen registrierten Decoder hat', async () => {
    (energyRepository.findGeraetetyp as Mock).mockResolvedValueOnce('nie-registrierter-typ');

    await service.verarbeiteUplink({
      topicRedacted: 'application/1/device/***/event/up',
      payload: buildEnvelopePayload({ data: gueltigerMesswert() }),
    });

    const input = insertMock.mock.calls[0]?.[0] as QuarantaeneInsertInput;
    expect(input.grund).toBe('unbekannter_geraetetyp');
    expect(input.zaehlerId).toBe(ZAEHLER_ID);
  });

  it('unbekannter_geraetetyp, wenn energy.zaehler gar nicht aufloesbar ist (Orphan-Fall)', async () => {
    (energyRepository.findGeraetetyp as Mock).mockResolvedValueOnce(undefined);

    await service.verarbeiteUplink({
      topicRedacted: 'application/1/device/***/event/up',
      payload: buildEnvelopePayload({ data: gueltigerMesswert() }),
    });

    const input = insertMock.mock.calls[0]?.[0] as QuarantaeneInsertInput;
    expect(input.grund).toBe('unbekannter_geraetetyp');
  });

  it('decode_fehler, wenn der Decoder wirft', async () => {
    await service.verarbeiteUplink({
      topicRedacted: 'application/1/device/***/event/up',
      payload: buildEnvelopePayload({ data: { messgroesse: 'x' /* fehlende Pflichtfelder */ } }),
    });

    const input = insertMock.mock.calls[0]?.[0] as QuarantaeneInsertInput;
    expect(input.grund).toBe('decode_fehler');
    expect(input.zaehlerId).toBe(ZAEHLER_ID);
  });

  it('QA-6: decode_fehler fuer den GESAMTEN Uplink, wenn EIN Eintrag eines gemischten Arrays (1 valide + 1 kaputt) kaputt ist — kein Teilerfolg fuer den validen Eintrag', async () => {
    await service.verarbeiteUplink({
      topicRedacted: 'application/1/device/***/event/up',
      payload: buildEnvelopePayload({
        data: [gueltigerMesswert({ messgroesse: 'a' }), { messgroesse: 'nur-teilweise-ausgefuellt' }],
      }),
    });

    expect(insertMock).toHaveBeenCalledTimes(1);
    const input = insertMock.mock.calls[0]?.[0] as QuarantaeneInsertInput;
    expect(input.grund).toBe('decode_fehler');
    // KEIN Upsert — auch nicht fuer den an sich validen ersten Eintrag
    // ("a"): der Decoder-Aufruf selbst ist atomar je Uplink (s. Praezisierung
    // in `ingest-flow.service.ts`/`synthetisch-referenz-v1.decoder.ts`).
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('kanal_unbekannt, wenn kein aktiver Messkanal gefunden wird', async () => {
    (energyRepository.findAktivenMesskanal as Mock).mockResolvedValueOnce(undefined);

    await service.verarbeiteUplink({
      topicRedacted: 'application/1/device/***/event/up',
      payload: buildEnvelopePayload({ data: gueltigerMesswert() }),
    });

    const input = insertMock.mock.calls[0]?.[0] as QuarantaeneInsertInput;
    expect(input.grund).toBe('kanal_unbekannt');
  });

  it('einheit_inkonsistent, wenn decodierte Einheit != Kanal-Einheit', async () => {
    await service.verarbeiteUplink({
      topicRedacted: 'application/1/device/***/event/up',
      payload: buildEnvelopePayload({ data: gueltigerMesswert({ einheit: 'MWh' }) }),
    });

    const input = insertMock.mock.calls[0]?.[0] as QuarantaeneInsertInput;
    expect(input.grund).toBe('einheit_inkonsistent');
    expect(input.messkanalKey).toBe(42);
  });

  it('unplausibel_monotonie_verletzt bei negativem Wert (Wertebereich)', async () => {
    await service.verarbeiteUplink({
      topicRedacted: 'application/1/device/***/event/up',
      payload: buildEnvelopePayload({ data: gueltigerMesswert({ wertRoh: -1 }) }),
    });

    const input = insertMock.mock.calls[0]?.[0] as QuarantaeneInsertInput;
    expect(input.grund).toBe('unplausibel_monotonie_verletzt');
  });

  it('unplausibel_monotonie_verletzt, wenn der neue Wert unter dem letzten bekannten Wert liegt', async () => {
    (schreibpfadRepository.findNachbarwerte as Mock).mockResolvedValueOnce({ vorherige: [100], naechster: undefined });

    await service.verarbeiteUplink({
      topicRedacted: 'application/1/device/***/event/up',
      payload: buildEnvelopePayload({ data: gueltigerMesswert({ wertRoh: 50 }) }),
    });

    const input = insertMock.mock.calls[0]?.[0] as QuarantaeneInsertInput;
    expect(input.grund).toBe('unplausibel_monotonie_verletzt');
  });

  it('skalensprung_verdacht schlaegt VOR der Monotonie zu (ADR-0011 O3 Punkt 3)', async () => {
    // Ein Jahr Betrieb bei 20 kWh je Viertelstunde, danach ein verdoppelter
    // Wandlerfaktor. Der Stand STEIGT — die Monotonie wuerde ihn durchlassen.
    const historie = Array.from({ length: 48 }, (_, i) => 700_800 - i * 20);
    (schreibpfadRepository.findNachbarwerte as Mock).mockResolvedValueOnce({ vorherige: historie, naechster: undefined });

    await service.verarbeiteUplink({
      topicRedacted: 'application/1/device/***/event/up',
      payload: buildEnvelopePayload({ data: gueltigerMesswert({ wertRoh: 1_401_600 }) }),
    });

    const input = insertMock.mock.calls[0]?.[0] as QuarantaeneInsertInput;
    expect(input.grund).toBe('skalensprung_verdacht');
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('kein Monotonie-Check bei art=intervall_verbrauch (fallender Wert ist dort erlaubt)', async () => {
    (schreibpfadRepository.findNachbarwerte as Mock).mockResolvedValueOnce({ vorherige: [100], naechster: undefined });

    await service.verarbeiteUplink({
      topicRedacted: 'application/1/device/***/event/up',
      payload: buildEnvelopePayload({ data: gueltigerMesswert({ wertRoh: 5, art: 'intervall_verbrauch' }) }),
    });

    expect(insertMock).not.toHaveBeenCalled();
    expect(upsertMock).toHaveBeenCalledTimes(1);
  });

  it('zeitstempel_fehlt, wenn deviceTimestampIso fehlt (KEIN Server-Zeit-Fallback, TD-2)', async () => {
    const daten = gueltigerMesswert();
    delete daten['deviceTimestampIso'];

    await service.verarbeiteUplink({
      topicRedacted: 'application/1/device/***/event/up',
      payload: buildEnvelopePayload({ data: daten }),
    });

    const input = insertMock.mock.calls[0]?.[0] as QuarantaeneInsertInput;
    expect(input.grund).toBe('zeitstempel_fehlt');
    expect(input.messkanalKey).toBe(42);
  });

  it('verarbeitet mehrere Messwerte eines Uplinks unabhaengig (ein Kanalfehler blockiert die anderen nicht)', async () => {
    (energyRepository.findAktivenMesskanal as Mock)
      .mockResolvedValueOnce(undefined) // erster Messwert: kanal_unbekannt
      .mockResolvedValueOnce({ kanalKey: 7, einheit: 'kWh', art: 'kumulativ_zaehlerstand' }); // zweiter: ok

    await service.verarbeiteUplink({
      topicRedacted: 'application/1/device/***/event/up',
      payload: buildEnvelopePayload({
        data: [gueltigerMesswert({ messgroesse: 'a' }), gueltigerMesswert({ messgroesse: 'b' })],
      }),
    });

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock).toHaveBeenCalledTimes(1);
  });

  it('propagiert einen echten Infra-Fehler (DB nicht erreichbar) NACH OBEN statt ihn zu verschlucken', async () => {
    (forwardLookupRepository.findAktivenZaehler as Mock).mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(
      service.verarbeiteUplink({
        topicRedacted: 'application/1/device/***/event/up',
        payload: buildEnvelopePayload({ data: gueltigerMesswert() }),
      }),
    ).rejects.toThrow('ECONNREFUSED');
  });

  it('propagiert einen Fehler beim Quarantaene-Insert selbst (kein stiller Datenverlust)', async () => {
    insertMock.mockRejectedValueOnce(new Error('DB down'));

    await expect(
      service.verarbeiteUplink({ topicRedacted: 'application/1/device/***/event/up', payload: Buffer.from('{kaputt') }),
    ).rejects.toThrow('DB down');
  });
  describe('Herkunfts-Abgleich (ADR-0011 B3/D4)', () => {
    const TENANT_ID = '7a000000-0000-0000-0000-00000000000a';
    const TOPIC = 'application/1/device/***/event/up';

    it('quarantaeniert statt einzuspeisen, wenn der Tenant zu einem ANDEREN Endkunden gehoert', async () => {
      pruefeMock.mockResolvedValueOnce({
        art: 'widerspruch',
        erwarteterEndkundeId: 'e0000000-0000-0000-0000-00000000000a',
        tatsaechlicherEndkundeId: 'e0000000-0000-0000-0000-00000000000b',
      });

      await service.verarbeiteUplink({
        topicRedacted: TOPIC,
        payload: buildEnvelopePayload({ data: gueltigerMesswert(), tenantId: TENANT_ID }),
      });

      const input = insertMock.mock.calls[0]?.[0] as QuarantaeneInsertInput;
      expect(input.grund).toBe('herkunft_widerspruechlich');
      expect(input.zaehlerId).toBe(ZAEHLER_ID);
      // Der Kern der Sache: KEIN Messwert beim falschen Endkunden.
      expect(upsertMock).not.toHaveBeenCalled();
    });

    it('dekodiert bei einem Widerspruch gar nicht erst — der Abgleich sitzt VOR dem Decode', async () => {
      pruefeMock.mockResolvedValueOnce({
        art: 'widerspruch',
        erwarteterEndkundeId: 'e0000000-0000-0000-0000-00000000000a',
        tatsaechlicherEndkundeId: 'e0000000-0000-0000-0000-00000000000b',
      });

      await service.verarbeiteUplink({
        topicRedacted: TOPIC,
        payload: buildEnvelopePayload({ data: gueltigerMesswert(), tenantId: TENANT_ID }),
      });

      expect(findGeraetetypMock).not.toHaveBeenCalled();
    });

    it('speist ein, wenn Tenant und Zaehler auf denselben Endkunden zeigen', async () => {
      pruefeMock.mockResolvedValueOnce({ art: 'stimmig' });

      await service.verarbeiteUplink({
        topicRedacted: TOPIC,
        payload: buildEnvelopePayload({ data: gueltigerMesswert(), tenantId: TENANT_ID }),
      });

      expect(insertMock).not.toHaveBeenCalled();
      expect(upsertMock).toHaveBeenCalledTimes(1);
    });

    it('speist ein, solange der Tenant NICHT zugeordnet ist — die Zuordnung wird nach und nach gepflegt', async () => {
      pruefeMock.mockResolvedValueOnce({ art: 'kein_mapping' });

      await service.verarbeiteUplink({
        topicRedacted: TOPIC,
        payload: buildEnvelopePayload({ data: gueltigerMesswert(), tenantId: TENANT_ID }),
      });

      expect(insertMock).not.toHaveBeenCalled();
      expect(upsertMock).toHaveBeenCalledTimes(1);
    });

    it('prueft gar nicht erst, wenn der Uplink keine Mandanten-Kennung traegt', async () => {
      await service.verarbeiteUplink({
        topicRedacted: TOPIC,
        payload: buildEnvelopePayload({ data: gueltigerMesswert() }),
      });

      // Aeltere ChirpStack-Fassungen und andere Netzserver senden keine
      // tenantId. Aus ihrem Fehlen einen Widerspruch abzuleiten, waere eine
      // Behauptung ueber etwas, das gar nicht mitgeteilt wurde.
      expect(pruefeMock).not.toHaveBeenCalled();
      expect(upsertMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('Rechtsgrundlagen-Gate (ADR-0012 E5, Stufe C — A12-11..A12-19)', () => {
    it('Schalter AUS (Default) — Verhalten unveraendert: kein Aufruf des Consent-Gate, Messwert wird geschrieben', async () => {
      // `service` aus dem aeusseren beforeEach hat bereits enforced=false --
      // dieser Test macht die Erwartung nur EXPLIZIT, die alle uebrigen
      // Tests in dieser Datei bereits stillschweigend voraussetzen.
      const { service: aus, consentGateMock } = buildService({ enforced: false });

      await aus.verarbeiteUplink({
        topicRedacted: 'application/1/device/***/event/up',
        payload: buildEnvelopePayload({ data: gueltigerMesswert() }),
      });

      expect(consentGateMock).not.toHaveBeenCalled();
      expect(insertMock).not.toHaveBeenCalled();
      expect(upsertMock).toHaveBeenCalledTimes(1);
    });

    it('Schalter AN + Rechtsgrundlage wirksam (Gate liefert true) — der Wert wird geschrieben', async () => {
      const { service: an, consentGateMock } = buildService({
        enforced: true,
        messdatenVerarbeitungErlaubt: vi.fn().mockResolvedValue(true),
      });

      await an.verarbeiteUplink({
        topicRedacted: 'application/1/device/***/event/up',
        payload: buildEnvelopePayload({ data: gueltigerMesswert() }),
      });

      expect(consentGateMock).toHaveBeenCalledTimes(1);
      // C-2: GENAU EIN Argument — die Zaehler-ID. Kein Zeitpunkt, den der
      // Aufrufer waehlen koennte (s. Test unten "kein Zeitpunkt-Argument").
      expect(consentGateMock.mock.calls[0]).toEqual([ZAEHLER_ID]);
      expect(insertMock).not.toHaveBeenCalled();
      expect(upsertMock).toHaveBeenCalledTimes(1);
    });

    it('Schalter AN + keine wirksame Rechtsgrundlage (Gate liefert false) — verworfen, GEZAEHLT, NICHT quarantaeniert', async () => {
      const { service: an } = buildService({
        enforced: true,
        messdatenVerarbeitungErlaubt: vi.fn().mockResolvedValue(false),
      });

      await an.verarbeiteUplink({
        topicRedacted: 'application/1/device/***/event/up',
        payload: buildEnvelopePayload({ data: gueltigerMesswert() }),
      });

      // A12-13: KEINE Zeile in ingest.eingang_quarantaene.
      expect(insertMock).not.toHaveBeenCalled();
      // Kein Messwert wird geschrieben.
      expect(upsertMock).not.toHaveBeenCalled();
      // A12-14: trotzdem zaehlbar — der Unterschied zwischen "niemand hat
      // eingewilligt" und "das Gate ist stumm ausgefallen".
      expect(metrics.snapshot().ingestConsentVerworfenTotal).toBe(1);
      // Auflage C-6: und zwar DAUERHAFT. Der Zaehler oben lebt im Prozess und
      // ist nach einem Neustart weg -- genau dann waere ein Totalausfall
      // wieder unsichtbar.
      expect(verwurfZaehleMock).toHaveBeenCalledWith('rechtsgrundlage_fehlt');
    });

    it('scheitert die dauerhafte Zaehlung, bleibt der Uplink trotzdem verworfen (C-6)', async () => {
      // Die Reihenfolge ist der Punkt: Der Uplink ist entschieden, BEVOR
      // gezaehlt wird. Eine Datenbank, die im falschen Moment kurz weg ist,
      // darf den Verwurf nicht in einen Fehler verwandeln -- und erst recht
      // nicht dazu fuehren, dass der Messwert doch geschrieben wird.
      const { service: an } = buildService({
        enforced: true,
        messdatenVerarbeitungErlaubt: vi.fn().mockResolvedValue(false),
      });
      verwurfZaehleMock.mockRejectedValueOnce(new Error('DB kurz weg'));

      await expect(
        an.verarbeiteUplink({
          topicRedacted: 'application/1/device/***/event/up',
          payload: buildEnvelopePayload({ data: gueltigerMesswert() }),
        }),
      ).resolves.toBeUndefined();

      expect(upsertMock).not.toHaveBeenCalled();
      expect(insertMock).not.toHaveBeenCalled();
    });

    it('Backfill eines ALTEN `ts` nach einem Widerruf wird verworfen — der Aufrufer kann der Funktion GAR KEINEN Zeitpunkt uebergeben (A12-12/C-2)', async () => {
      // Ein Backfill weit in der Vergangenheit — z. B. ein Nachlauf, der
      // Messwerte von VOR einem laengst erklaerten Widerruf liefert. Die
      // urspruengliche Fassung dieses Tests pruefte, dass der Service einen
      // "frischen" Zeitpunkt statt des alten `deviceTimestampIso` uebergibt.
      // Nach Auflage C-2 gibt es diesen Parameter nicht mehr — die Pruefung
      // ist jetzt staerker: Der Service kann der Funktion technisch KEINEN
      // Zeitpunkt mitgeben, gewaehlt oder nicht. Das eigentliche `now()`-
      // Verhalten steht seit Migration V0084 in der SQL-Funktion selbst und
      // wird dort per Integrationstest gegen echtes PostgreSQL verifiziert
      // (`consent-ingest-rechtsgrundlage-gate.integration.spec.ts`,
      // Szenario "Widerruf genau auf der Sekunde").
      const messdatenVerarbeitungErlaubt = vi.fn().mockResolvedValue(false);
      const { service: an } = buildService({ enforced: true, messdatenVerarbeitungErlaubt });

      const altesDeviceTimestamp = '2020-01-01T00:00:00.000Z';

      await an.verarbeiteUplink({
        topicRedacted: 'application/1/device/***/event/up',
        payload: buildEnvelopePayload({
          data: gueltigerMesswert({ deviceTimestampIso: altesDeviceTimestamp }),
        }),
        herkunft: 'backfill',
      });

      expect(messdatenVerarbeitungErlaubt).toHaveBeenCalledTimes(1);
      // GENAU EIN Argument (die Zaehler-ID) — kein zweites, ueber das ein
      // Zeitpunkt (alt, neu, oder sonst frei gewaehlt) hereinkommen koennte.
      expect(messdatenVerarbeitungErlaubt.mock.calls[0]).toEqual([ZAEHLER_ID]);

      // Verworfen, nicht quarantaeniert.
      expect(insertMock).not.toHaveBeenCalled();
      expect(upsertMock).not.toHaveBeenCalled();
    });
  });
});
