import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ensureNoOpTransactionHost } from '../../stammdaten/test-support/init-noop-transaction-host';
import type { NutzerinfoRepository } from '../persistence/nutzerinfo.repository';
import type { NutzerinformationService } from '../nutzerinformation.service';
import type { NutzerinfoBericht, NutzerinformationItem } from '../nutzerinfo.types';
import { ProblemDetailsException } from '../../common/exceptions/problem-details.exception';
import type { PortalConfigService } from '../../portal/portal.config';
import { NutzerinfoDokumentService } from './nutzerinfo-dokument.service';

/** Synthetische Portal-Adresse — der Dienst braucht nur die Zeichenkette, nicht den echten Env-Leser. */
const PORTAL_CONFIG = { portalUrl: 'https://portal.beispiel-edms.test/portal' } as unknown as PortalConfigService;

/**
 * NUR die Platzhalter-Frage wird umschaltbar gemacht, die Vermerkstexte
 * bleiben die echten. Seit der A-1-Freigabe (2026-09-09) ist die Antwort
 * `false`; der Riegel bleibt trotzdem im Code und muss deshalb weiter
 * pruefbar sein — sonst faellt niemandem auf, wenn er kaputtgeht, bis
 * jemand den Text wieder durch einen Entwurf ersetzt.
 */
const { platzhalter } = vi.hoisted(() => ({ platzhalter: { aktiv: false } }));

vi.mock('../../berechnung/klima/dwd-quellenvermerk.const', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  istQuellenvermerkPlatzhalter: (): boolean => platzhalter.aktiv,
}));

const LAUF_ID = '0198c3aa-aaaa-7000-8000-000000000009';
const INFO_ID = '0198c3aa-aaaa-7000-8000-000000000001';

function information(): NutzerinformationItem {
  return {
    id: INFO_ID,
    endkundeId: '0198c3aa-aaaa-7000-8000-00000000000e',
    energietraeger: 'gas',
    monat: '2026-03-01',
    berechnungslaufId: LAUF_ID,
    referenzKwh: 1500,
    istKwh: 1234,
    deltaKwh: 266,
    qualitaetsStufe: 'belastbar',
    abdeckungPct: 100,
    tageFehlend: 0,
    kandidatenAnzahl: 1,
    inhaltHashHex: 'ab'.repeat(32),
    erzeugtAt: '2026-04-01T06:00:00.000Z',
    zugestelltAt: null,
    zustellweg: null,
  };
}

function bericht(): NutzerinfoBericht {
  return {
    information: information(),
    vonTag: '2026-03-01',
    bisTag: '2026-03-31',
    gruppen: [],
    zugeordnetKwh: 0,
    nichtZugeordnetKwh: 1234,
    ohneTageswerte: false,
    vormonatDeltaKwh: null,
    vormonatIstKwh: null,
  };
}

function baue(mitDwdKlima: boolean): NutzerinfoDokumentService {
  const repository = {
    findLaeufeMitDwdKlima: vi.fn(() => Promise.resolve(mitDwdKlima ? new Set([LAUF_ID]) : new Set<string>())),
    findByMonat: vi.fn(() => Promise.resolve([information()])),
  } as unknown as NutzerinfoRepository;
  const service = { bericht: vi.fn(() => Promise.resolve(bericht())) } as unknown as NutzerinformationService;
  return new NutzerinfoDokumentService(repository, service, PORTAL_CONFIG);
}

describe('NutzerinfoDokumentService — Quellenvermerk am Kundendokument (Auflage A-1/A-2)', () => {
  beforeAll(() => {
    ensureNoOpTransactionHost();
  });

  afterEach(() => {
    platzhalter.aktiv = false;
  });

  it('erzeugt das Dokument bei synthetischem Klima — dort gehört gar kein Vermerk hin', async () => {
    // A20: Bei synthetischem Klima wäre eine DWD-Attribution eine
    // Falschangabe. Der heutige Dev-/Testbetrieb ist deshalb unberührt.
    const dokument = await baue(false).einzeln(INFO_ID);

    expect(dokument.html).toContain('Ihre Energieinformation');
    expect(dokument.html).not.toContain('Wetterdienst');
  });

  it('traegt die Portal-Adresse aus PortalConfigService im Dokument — nicht fest verdrahtet', async () => {
    // Bindeglied zum Renderer-Test: hier wird die Verkabelung geprueft
    // (Service reicht `portalConfig.portalUrl` durch), nicht der Inhalt
    // des Hinweises selbst — der ist Sache von
    // `nutzerinfo-dokument.renderer.spec.ts`.
    const dokument = await baue(false).einzeln(INFO_ID);

    expect(dokument.html).toContain(PORTAL_CONFIG.portalUrl);
  });

  it('erzeugt das Dokument mit DWD-Werten und traegt den Vermerk — seit der A-1-Freigabe', async () => {
    // Auflage A-2, Punkt 3: kundengerichtete Ausgaben bereinigter Werte
    // tragen Quellen- UND Aenderungsvermerk.
    const dokument = await baue(true).einzeln(INFO_ID);

    expect(dokument.html).toContain('Quelle: Deutscher Wetterdienst');
    expect(dokument.html).toContain('Gradtagzahlen nach VDI 3807');
  });

  it('verweigert das Dokument, sollte der Vermerk je wieder ein Platzhalter sein', async () => {
    // FJ-08 blockt den FÖRDERJAHR-Preflight — das Kundendokument geht daran
    // vorbei. Ohne diesen Riegel stuende in der Fusszeile eines Briefes
    // woertlich „PLATZHALTER". Der Riegel greift heute nicht mehr; er bleibt
    // als Rueckfallsicherung stehen und wird deshalb weiter geprueft.
    platzhalter.aktiv = true;

    const fehler = await baue(true)
      .einzeln(INFO_ID)
      .catch((e: unknown) => e);

    expect(fehler).toBeInstanceOf(ProblemDetailsException);
    expect((fehler as ProblemDetailsException).problemDetail).toMatch(/Platzhalter \(Auflage A-1/);
  });

  it('greift dann auch für die Monatsmappe, nicht nur für das Einzeldokument', async () => {
    platzhalter.aktiv = true;

    const fehler = await baue(true)
      .monatsmappe('2026-03-01')
      .catch((e: unknown) => e);

    expect((fehler as ProblemDetailsException).problemDetail).toMatch(/Auflage A-1/);
  });

  it('weist einen Monat ohne Monatsersten ab', async () => {
    await expect(baue(false).monatsmappe('2026-03-15')).rejects.toThrow(/Monatserster/);
  });

  // Der Zustand NACH der A-1-Freigabe — Dokument MIT Vermerk — ist im
  // Renderer-Test abgedeckt („trägt den DWD-Quellenvermerk, wenn echte
  // Klimadaten in die Rechnung eingingen"). Ihn hier ueber einen
  // Modul-Mock nachzustellen brauchte einen dynamischen Import und brachte
  // fuer dieselbe Aussage nur Reibung.
});

