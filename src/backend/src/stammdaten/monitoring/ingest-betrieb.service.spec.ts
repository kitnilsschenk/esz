import { beforeAll, describe, expect, it, vi } from 'vitest';
import { IngestBetriebService } from './ingest-betrieb.service';
import { ensureNoOpTransactionHost } from '../test-support/init-noop-transaction-host';
import type {
  IngestBetriebRepository,
  IngestQuarantaeneZeile,
} from '../persistence/ingest/ingest-betrieb.repository';

function zeile(overrides: Partial<IngestQuarantaeneZeile> = {}): IngestQuarantaeneZeile {
  return {
    id: '0198c3aa-aaaa-7000-8000-000000000001',
    grund: 'devEUI_unbekannt',
    zaehlerId: null,
    messkanalKey: null,
    fPort: 30,
    quelleCode: 'netz-a',
    chirpstackTenantId: '36755464-acd4-4746-b8eb-e339a84e6ed8',
    chirpstackApplicationId: '7b0c677e-e837-43d8-aa28-3f309e604538',
    topicRedacted: 'application/+/device/<redigiert>/event/up',
    empfangenAt: '2026-08-28T14:32:03.594Z',
    zaehlerMessgroessen: null,
    createdAt: '2026-08-28T14:32:03.700Z',
    ...overrides,
  };
}

function createService(overrides: {
  readonly aktivitaet?: Awaited<ReturnType<IngestBetriebRepository['findAktivitaet']>>;
  readonly gesamt?: string;
  readonly jeGrund?: Awaited<ReturnType<IngestBetriebRepository['countQuarantaeneJeGrund']>>;
  readonly zeilen?: readonly IngestQuarantaeneZeile[];
  readonly quellen?: readonly Awaited<ReturnType<IngestBetriebRepository['findQuellen']>>[number][];
  readonly verwurfTage?: readonly Awaited<ReturnType<IngestBetriebRepository['findVerwurfTage']>>[number][];
} = {}): { service: IngestBetriebService; listQuarantaenePage: ReturnType<typeof vi.fn> } {
  // Die Abfrage-Attrappe wird als eigene Referenz gehalten und
  // zurückgegeben, statt sie später vom Repository-Objekt zu pflücken —
  // eine losgelöste Methode ist genau das, wovor `unbound-method` warnt.
  const listQuarantaenePage = vi.fn(() =>
    Promise.resolve({ daten: [...(overrides.zeilen ?? [])], naechsterCursor: null }),
  );

  const repo = {
    findQuellen: vi.fn(() => Promise.resolve([...(overrides.quellen ?? [])])),
    findAktivitaet: vi.fn(() =>
      Promise.resolve(
        overrides.aktivitaet ?? { letzterMesswertAt: null, letzteSchreibungAt: null, letzteQuarantaeneAt: null },
      ),
    ),
    countQuarantaene: vi.fn(() => Promise.resolve(overrides.gesamt ?? '0')),
    countQuarantaeneJeGrund: vi.fn(() => Promise.resolve(overrides.jeGrund ?? [])),
    findVerwurfTage: vi.fn(() => Promise.resolve([...(overrides.verwurfTage ?? [])])),
    listQuarantaenePage,
  } as unknown as IngestBetriebRepository;

  return { service: new IngestBetriebService(repo), listQuarantaenePage };
}

describe('IngestBetriebService (ADR-0011 A2)', () => {
  beforeAll(() => {
    ensureNoOpTransactionHost();
  });

  it('meldet die drei Aktivitäts-Zeitpunkte und die Quarantäne-Verteilung', async () => {
    const { service } = createService({
      aktivitaet: {
        letzterMesswertAt: '2026-08-28T14:32:03.594Z',
        letzteSchreibungAt: '2026-08-28T14:32:04.100Z',
        letzteQuarantaeneAt: '2026-08-28T13:00:00.000Z',
      },
      gesamt: '7',
      jeGrund: [
        { grund: 'devEUI_unbekannt', anzahl: '5' },
        { grund: 'decode_fehler', anzahl: '2' },
      ],
    });

    const status = await service.status();

    expect(status.letzterMesswertAt).toBe('2026-08-28T14:32:03.594Z');
    expect(status.letzteSchreibungAt).toBe('2026-08-28T14:32:04.100Z');
    expect(status.quarantaeneGesamt).toBe('7');
    expect(status.quarantaeneJeGrund).toHaveLength(2);
  });

  it('gibt die vereinbarten Felder aus — nicht mehr', async () => {
    const { service } = createService();

    const status = await service.status();

    // Seit Auflage C-6 gehoeren zwei Verwurf-Felder dazu. Die Aussage
    // dieses Tests aendert sich dadurch NICHT — er haelt weiterhin fest,
    // dass die Betriebssicht genau die vereinbarten Felder ausgibt und nicht
    // beilaeufig weitere. Die Liste ist gewachsen, nicht aufgeweicht.
    expect(Object.keys(status)).toEqual([
      'quellen',
      'letzterMesswertAt',
      'letzteSchreibungAt',
      'letzteQuarantaeneAt',
      'quarantaeneGesamt',
      'quarantaeneJeGrund',
      'verwurfTage',
      'verwurfSumme',
    ]);
  });

  it('kommt mit einer leeren Datenbank zurecht, statt zu scheitern', async () => {
    const { service } = createService();

    await expect(service.status()).resolves.toMatchObject({
      letzterMesswertAt: null,
      letzteSchreibungAt: null,
      quarantaeneGesamt: '0',
      quarantaeneJeGrund: [],
    });
  });

  it('gibt weder Blind-Index noch Rohpayload noch den Cursor-Zeitstempel heraus', async () => {
    // Der Blind-Index ist ein über alle Uplinks eines Geräts stabiler
    // Korrelations-Schlüssel — in einer Betriebsliste derselbe
    // Quasi-Identifier wie die DevEUI selbst (RL-2).
    const { service } = createService({ zeilen: [zeile({ zaehlerId: '0198c3bb-bbbb-7000-8000-000000000002' })] });

    const seite = await service.quarantaene({ limit: 50 });

    expect(Object.keys(seite.daten[0] ?? {})).toEqual([
      'id',
      'grund',
      'zaehlerId',
      'messkanalKey',
      'fPort',
      'quelleCode',
      'chirpstackTenantId',
      'chirpstackApplicationId',
      'topicRedacted',
      'empfangenAt',
      // Die Messgroessen des Zaehlers — technische Groessen wie
      // `wirkarbeit (kWh)`, kein Personenbezug und kein Korrelations-
      // Schluessel. Sie stehen hier, weil der Kanal-Lookup EXAKT vergleicht:
      // ohne sie war eine abweichende Schreibweise nur zu finden, indem man
      // die Nutzlast von Hand dekodierte.
      'zaehlerMessgroessen',
    ]);
    expect(JSON.stringify(seite)).not.toContain('createdAt');
  });

  it('reicht den Grund-Filter an die Abfrage durch', async () => {
    const { service, listQuarantaenePage } = createService();

    await service.quarantaene({ grund: 'decode_fehler', limit: 25 });

    expect(listQuarantaenePage).toHaveBeenCalledWith({ grund: 'decode_fehler', limit: 25 });
  });
});

describe('IngestBetriebService — Zustand je Quelle (ADR-0011 O8/D8)', () => {
  beforeAll(() => {
    ensureNoOpTransactionHost();
  });

  function quelle(overrides: Record<string, unknown> = {}) {
    return {
      quelleCode: 'standard',
      brokerHost: 'broker.example:8883',
      topic: 'application/+/device/+/event/up',
      clientId: 'edms-ingest-worker',
      verbunden: true,
      letzteVerbindungAt: '2026-08-28T16:00:00.000Z',
      letzterHerzschlagAt: new Date().toISOString(),
      gepflegt: true,
      gepflegtInaktiv: false,
      abweichendeFelder: [],
      ...overrides,
    };
  }

  it('reicht durch, dass der laufende Prozess von der gepflegten Konfiguration abweicht', async () => {
    // Der Worker laedt seine Quelle NUR beim Start. Wird sie danach
    // geaendert, faehrt er mit der alten weiter — und die Oberflaeche zeigte
    // die gepflegten Werte, waehrend er andere benutzt. Dann sagt sie das
    // Gegenteil von dem, wofuer man sie aufruft.
    const { service } = createService({
      quellen: [quelle({ abweichendeFelder: ['brokerHost', 'topic'] })],
    });

    const [erste] = (await service.status()).quellen;

    expect(erste?.abweichendeFelder).toEqual(['brokerHost', 'topic']);
  });

  it('reicht durch, dass ein Worker OHNE gepflegte Quelle laeuft', async () => {
    // Zulaessig (Verhalten vor V0059, Konfiguration aus der Umgebung), aber
    // es soll sichtbar sein: In der Plattform steht dann nichts, woran sich
    // jemand orientieren koennte.
    const { service } = createService({ quellen: [quelle({ gepflegt: false })] });

    expect((await service.status()).quellen[0]?.gepflegt).toBe(false);
  });

  it('reicht durch, dass ein Prozess trotz deaktivierter Quelle noch laeuft', async () => {
    // Kein Widerspruch, sondern der Normalfall direkt nach dem Deaktivieren:
    // Ein laufender Worker liest nicht neu. Erst beim naechsten Start bleibt
    // er stehen.
    const { service } = createService({ quellen: [quelle({ gepflegtInaktiv: true })] });

    expect((await service.status()).quellen[0]?.gepflegtInaktiv).toBe(true);
  });

  it('gilt nur bei gemeldeter Verbindung UND frischem Herzschlag als lebendig', async () => {
    const { service } = createService({ quellen: [quelle()] });

    const [erste] = (await service.status()).quellen;

    expect(erste?.lebendig).toBe(true);
  });

  it('gilt NICHT als lebendig, wenn der Herzschlag veraltet ist — auch bei `verbunden: true`', async () => {
    // Genau der Fall eines abgestürzten Prozesses: Er kann sein Flag nicht
    // mehr zurücksetzen, die Zeile bliebe sonst für immer grün.
    const { service } = createService({
      quellen: [quelle({ letzterHerzschlagAt: new Date(Date.now() - 10 * 60_000).toISOString() })],
    });

    const [erste] = (await service.status()).quellen;

    expect(erste?.verbunden).toBe(true);
    expect(erste?.lebendig).toBe(false);
  });

  it('gilt NICHT als lebendig, wenn der Worker meldet, dass die Verbindung steht nicht', async () => {
    const { service } = createService({ quellen: [quelle({ verbunden: false })] });

    expect((await service.status()).quellen[0]?.lebendig).toBe(false);
  });

  it('weist mehrere Quellen einzeln aus — eine tote darf nicht von einer lebenden verdeckt werden', async () => {
    const { service } = createService({
      quellen: [
        quelle({ quelleCode: 'netz-a' }),
        quelle({ quelleCode: 'netz-b', letzterHerzschlagAt: new Date(Date.now() - 86_400_000).toISOString() }),
      ],
    });

    const { quellen } = await service.status();

    expect(quellen.map((q) => [q.quelleCode, q.lebendig])).toEqual([
      ['netz-a', true],
      ['netz-b', false],
    ]);
  });

  it('gibt keine Zugangsdaten aus', async () => {
    const { service } = createService({ quellen: [quelle()] });

    const serialisiert = JSON.stringify((await service.status()).quellen);

    expect(serialisiert).not.toContain('password');
    expect(serialisiert).not.toContain('@');
  });

  it('kommt mit „noch nie ein Worker gelaufen" zurecht', async () => {
    const { service } = createService();

    expect((await service.status()).quellen).toEqual([]);
  });
});

describe('IngestBetriebService — Herkunft am Arbeitsvorrat (ADR-0011 D8/D1)', () => {
  beforeAll(() => {
    ensureNoOpTransactionHost();
  });

  it('gibt Quelle und Netzserver-Kennungen aus — bei mehreren Netzen der erste Handgriff', () => {
    // Ohne sie traegt eine `devEUI_unbekannt`-Zeile nur einen redigierten
    // Topic-String, mit dem niemand ein Geraet findet.
    const { service } = createService({ zeilen: [zeile()] });

    return service.quarantaene({ limit: 50 }).then((seite) => {
      expect(seite.daten[0]?.quelleCode).toBe('netz-a');
      expect(seite.daten[0]?.chirpstackApplicationId).toBe('7b0c677e-e837-43d8-aa28-3f309e604538');
    });
  });

  it('gibt KEINE Namen des Netzservers aus — nur opake Kennungen', async () => {
    // `tenantName`/`applicationName`/`deviceName` sind Freitext aus einem
    // fremden System; im Beispielbeleg stand dort eine Anschrift.
    const { service } = createService({ zeilen: [zeile()] });

    const serialisiert = JSON.stringify(await service.quarantaene({ limit: 50 }));

    expect(serialisiert).not.toContain('Name');
    expect(serialisiert).not.toContain('Lahnstein');
  });

  it('reicht den Quellen-Filter an die Abfrage durch', async () => {
    const { service, listQuarantaenePage } = createService();

    await service.quarantaene({ quelleCode: 'netz-b', limit: 25 });

    expect(listQuarantaenePage).toHaveBeenCalledWith({ quelleCode: 'netz-b', limit: 25 });
  });

  it('kommt mit Altzeilen ohne Herkunft zurecht', async () => {
    // Zeilen von vor V0041 tragen die Spalten nicht — ein Default waere eine
    // Behauptung ueber Vergangenes.
    const { service } = createService({
      zeilen: [zeile({ quelleCode: null, chirpstackTenantId: null, chirpstackApplicationId: null })],
    });

    const seite = await service.quarantaene({ limit: 50 });

    expect(seite.daten[0]?.quelleCode).toBeNull();
  });

  // ---- Auflage C-6 ---------------------------------------------------
  it('meldet verworfene Uplinks — sie hinterlassen KEINE Quarantaene-Zeile', async () => {
    // Ohne diese Zahlen haette die Betriebssicht eine Luecke genau dort, wo
    // Daten verschwinden: ein Verwurf mangels Rechtsgrundlage legt bewusst
    // keine Quarantaene an (A12-13).
    const { service } = createService({
      verwurfTage: [
        { tag: '2026-09-17', grund: 'rechtsgrundlage_fehlt', anzahl: '12' },
        { tag: '2026-09-16', grund: 'rechtsgrundlage_fehlt', anzahl: '30' },
      ],
    });

    const status = await service.status();

    expect(status.verwurfTage).toHaveLength(2);
    expect(status.verwurfSumme).toBe('42');
  });

  it('liefert Summe 0, solange nichts verworfen wurde — und nicht etwa nichts', async () => {
    // Eine fehlende Angabe liesse offen, ob nichts verworfen wurde oder
    // niemand nachgesehen hat. Genau diese Zweideutigkeit ist der Grund,
    // aus dem es den Zaehler ueberhaupt gibt (R-0008).
    const { service } = createService();

    const status = await service.status();

    expect(status.verwurfTage).toEqual([]);
    expect(status.verwurfSumme).toBe('0');
  });

  it('rechnet die Summe ohne Genauigkeitsverlust (bigint, nicht number)', async () => {
    const { service } = createService({
      verwurfTage: [
        { tag: '2026-09-17', grund: 'rechtsgrundlage_fehlt', anzahl: '9007199254740993' },
        { tag: '2026-09-16', grund: 'rechtsgrundlage_fehlt', anzahl: '1' },
      ],
    });

    const status = await service.status();

    // Mit `number` waere hier 9007199254740994 herausgekommen — der Wert
    // liegt jenseits von Number.MAX_SAFE_INTEGER.
    expect(status.verwurfSumme).toBe('9007199254740994');
  });
});
