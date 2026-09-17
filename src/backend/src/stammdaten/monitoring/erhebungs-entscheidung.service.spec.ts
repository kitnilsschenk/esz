import { describe, expect, it, vi } from 'vitest';
import { ErhebungsEntscheidungService } from './erhebungs-entscheidung.service';
import { GRUENDE_MIT_NEUERHEBUNGSFRAGE } from '../common/sperr-entscheidung.util';
import type { EnergyEinschraenkungFristRepository } from '../persistence/energy/energy-einschraenkung-frist.repository';

function zeile(
  overrides: Partial<{
    subjektTyp: 'endkunde' | 'anschlussnutzer';
    subjektId: string;
    endkundeId: string;
    einschraenkungGrundCode: string;
    gesperrtSeit: string;
    tageOffen: number;
    neuerhebungFortsetzen: boolean | null;
  }> = {},
) {
  return {
    subjektTyp: 'endkunde' as const,
    subjektId: 'endkunde-1',
    endkundeId: 'endkunde-1',
    einschraenkungGrundCode: 'art18_1b_unrechtmaessig',
    gesperrtSeit: '2026-07-01T00:00:00.000Z',
    tageOffen: 10,
    neuerhebungFortsetzen: true as boolean | null,
    ...overrides,
  };
}

function createService(zeilen: readonly ReturnType<typeof zeile>[]) {
  const findErhebungsEntscheidungen = vi.fn(() => Promise.resolve([...zeilen]));
  const repo = { findErhebungsEntscheidungen } as unknown as EnergyEinschraenkungFristRepository;
  return { service: new ErhebungsEntscheidungService(repo), findErhebungsEntscheidungen };
}

describe('ErhebungsEntscheidungService (Auflage C-8, Behandlungsschritt R-0008)', () => {
  it('fragt GENAU die beiden Gruende ab, bei denen sich die Frage stellt', async () => {
    const { service, findErhebungsEntscheidungen } = createService([]);

    await service.report();

    // lit. a und lit. c gehoeren NICHT dazu: Art. 18 Abs. 2 nimmt die
    // Speicherung aus, die Messung laeuft dort ohne Weiteres weiter.
    expect(findErhebungsEntscheidungen).toHaveBeenCalledWith(GRUENDE_MIT_NEUERHEBUNGSFRAGE);
  });

  it('unterscheidet „nicht entschieden" von „entschieden, nicht zu erheben"', async () => {
    // Das ist der Kern: `null` ist KEIN `false`. Wer beides gleich behandelt,
    // macht aus einer offenen Frage eine getroffene Entscheidung.
    const { service } = createService([
      zeile({ subjektId: 'offen', neuerhebungFortsetzen: null }),
      zeile({ subjektId: 'gestoppt', neuerhebungFortsetzen: false }),
      zeile({ subjektId: 'laeuft', neuerhebungFortsetzen: true }),
    ]);

    const report = await service.report();

    expect(report.items.map((item) => [item.subjektId, item.lage])).toEqual([
      ['offen', 'entscheidung_offen'],
      ['gestoppt', 'erhebung_gestoppt'],
      ['laeuft', 'erhebung_laeuft'],
    ]);
  });

  it('zaehlt die beiden Zustaende, die Aufmerksamkeit brauchen — und nur die', async () => {
    const { service } = createService([
      zeile({ subjektId: 'a', neuerhebungFortsetzen: null }),
      zeile({ subjektId: 'b', neuerhebungFortsetzen: null }),
      zeile({ subjektId: 'c', neuerhebungFortsetzen: false }),
      zeile({ subjektId: 'd', neuerhebungFortsetzen: true }),
      zeile({ subjektId: 'e', neuerhebungFortsetzen: true }),
    ]);

    const report = await service.report();

    expect(report.entscheidungOffenAnzahl).toBe(2);
    expect(report.erhebungGestopptAnzahl).toBe(1);
    // Die unauffaelligen bleiben in der Liste, damit die Bezugsgroesse
    // sichtbar ist — gezaehlt werden sie nicht.
    expect(report.items).toHaveLength(5);
  });

  it('nimmt beide Subjektarten in DIESELBE Liste', async () => {
    // Ein Anschlussnutzer ist eine eigenstaendige betroffene Person; seine
    // gestoppte Erhebung stoppt ueber `bool_and` zudem die Messung fuer das
    // ganze System. Zwei getrennte Listen wuerden zwei Gewohnheiten erzeugen
    // und eine davon wuerde seltener gelesen.
    const { service } = createService([
      zeile({ subjektTyp: 'anschlussnutzer', subjektId: 'an-1', endkundeId: 'ek-1', neuerhebungFortsetzen: false }),
      zeile({ subjektTyp: 'endkunde', subjektId: 'ek-2', endkundeId: 'ek-2', neuerhebungFortsetzen: null }),
    ]);

    const report = await service.report();

    expect(report.items.map((item) => item.subjektTyp)).toEqual(['anschlussnutzer', 'endkunde']);
    expect(report.erhebungGestopptAnzahl).toBe(1);
    expect(report.entscheidungOffenAnzahl).toBe(1);
  });

  it('laesst eine Zeile mit unbekanntem Grund-Code weg, statt sie zu raten', async () => {
    const { service } = createService([
      zeile({ subjektId: 'gueltig' }),
      zeile({ subjektId: 'unbekannt', einschraenkungGrundCode: 'art18_1z_erfunden' }),
    ]);

    const report = await service.report();

    expect(report.items.map((item) => item.subjektId)).toEqual(['gueltig']);
  });
});
