import { describe, expect, it, vi } from 'vitest';
import { EinschraenkungFristService } from './einschraenkung-frist.service';
import { BEFRISTETE_EINSCHRAENKUNG_GRUENDE } from './einschraenkung-frist.constants';
import type { EnergyEinschraenkungFristRepository } from '../persistence/energy/energy-einschraenkung-frist.repository';

function zeile(overrides: Partial<{
  subjektTyp: 'endkunde' | 'anschlussnutzer';
  subjektId: string;
  endkundeId: string;
  einschraenkungGrundCode: string;
  gesperrtSeit: string;
  tageOffen: number;
}> = {}) {
  return {
    subjektTyp: 'endkunde' as const,
    subjektId: 'endkunde-1',
    endkundeId: 'endkunde-1',
    einschraenkungGrundCode: 'art18_1a_richtigkeit',
    gesperrtSeit: '2026-07-01T00:00:00.000Z',
    tageOffen: 10,
    ...overrides,
  };
}

function createService(zeilen: readonly ReturnType<typeof zeile>[]) {
  const findOffeneFristen = vi.fn(() => Promise.resolve([...zeilen]));
  const repo = { findOffeneFristen } as unknown as EnergyEinschraenkungFristRepository;
  return { service: new EinschraenkungFristService(repo), findOffeneFristen };
}

describe('EinschraenkungFristService (Wiedervorlage, ADR-0007 A11.11)', () => {
  it('fragt das Repository mit GENAU den befristeten Tatbestaenden ab', async () => {
    const { service, findOffeneFristen } = createService([]);

    await service.report();

    expect(findOffeneFristen).toHaveBeenCalledWith(BEFRISTETE_EINSCHRAENKUNG_GRUENDE);
    // 1b und 1c sind dem Wortlaut nach NICHT befristet — sie hier
    // mitzuueberwachen wuerde regelkonform fortbestehende Vorgaenge als
    // ueberfaellig melden und die Liste zu Rauschen machen.
    expect(BEFRISTETE_EINSCHRAENKUNG_GRUENDE).toEqual(['art18_1a_richtigkeit', 'art18_1d_widerspruch']);
  });

  it('markiert ab der Schwelle als ueberfaellig, darunter nicht', async () => {
    const { service } = createService([
      zeile({ subjektId: 'a', tageOffen: 29 }),
      zeile({ subjektId: 'b', tageOffen: 30 }),
      zeile({ subjektId: 'c', tageOffen: 31 }),
    ]);

    const report = await service.report(30);

    expect(report.items.map((i) => i.ueberfaellig)).toEqual([false, true, true]);
    expect(report.ueberfaelligAnzahl).toBe(2);
    expect(report.schwelleTage).toBe(30);
  });

  // Die Liste zeigt bewusst ALLE offenen befristeten Einschraenkungen, nicht
  // nur die ueberfaelligen — sonst saehe die Sachbearbeitung nie, was
  // demnaechst faellig wird.
  it('liefert auch noch nicht ueberfaellige Vorgaenge', async () => {
    const { service } = createService([zeile({ tageOffen: 1 })]);

    const report = await service.report(30);

    expect(report.items).toHaveLength(1);
    expect(report.ueberfaelligAnzahl).toBe(0);
  });

  it('respektiert eine abweichende Schwelle', async () => {
    const { service } = createService([zeile({ tageOffen: 8 })]);

    expect((await service.report(7)).ueberfaelligAnzahl).toBe(1);
    expect((await service.report(90)).ueberfaelligAnzahl).toBe(0);
  });

  it('nutzt ohne Angabe die dokumentierte Vorgabe-Schwelle', async () => {
    const { service } = createService([zeile({ tageOffen: 30 })]);

    const report = await service.report();

    expect(report.schwelleTage).toBe(30);
    expect(report.ueberfaelligAnzahl).toBe(1);
  });

  // Fail-closed: ein Grund-Code, den die Anwendung nicht kennt, wird NICHT
  // als befristet gemeldet — eine erfundene Frist waere schlimmer als eine
  // fehlende Zeile.
  it('laesst einen unbekannten Grund-Code aus, statt ihn als befristet zu fuehren', async () => {
    const { service } = createService([
      zeile({ subjektId: 'gut', einschraenkungGrundCode: 'art18_1d_widerspruch' }),
      zeile({ subjektId: 'unbekannt', einschraenkungGrundCode: 'art18_1z_erfunden' }),
    ]);

    const report = await service.report();

    expect(report.items.map((i) => i.subjektId)).toEqual(['gut']);
  });

  it('fuehrt Endkunde und Anschlussnutzer in EINER Liste', async () => {
    const { service } = createService([
      zeile({ subjektTyp: 'endkunde', subjektId: 'e1', endkundeId: 'e1' }),
      zeile({ subjektTyp: 'anschlussnutzer', subjektId: 'a1', endkundeId: 'e1' }),
    ]);

    const report = await service.report();

    expect(report.items.map((i) => i.subjektTyp)).toEqual(['endkunde', 'anschlussnutzer']);
    // Der Bezugs-Endkunde ist beim Anschlussnutzer der Einstieg fuer die
    // Sachbearbeitung.
    expect(report.items[1]?.endkundeId).toBe('e1');
  });
});
