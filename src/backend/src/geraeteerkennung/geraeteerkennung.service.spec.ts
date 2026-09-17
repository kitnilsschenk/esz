import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { GeraeteerkennungService, sollQuotePct } from './geraeteerkennung.service';
import { ensureNoOpTransactionHost } from '../stammdaten/test-support/init-noop-transaction-host';
import type { GeraeteerkennungRepository } from './persistence/geraeteerkennung.repository';
import type { NachweisFoerderjahrRepository } from '../nachweis/persistence/nachweis-foerderjahr.repository';

const ENDKUNDE_ID = '018f1e2d-0000-7000-8000-0000000000f1';
const GRUPPE_ID = '018f1e2d-0000-7000-8000-0000000000f2';
const KANAL_ID = '018f1e2d-0000-7000-8000-0000000000f3';
const FOERDERJAHR_ID = '018f1e2d-0000-7000-8000-0000000000f4';

function foerderjahr(nummer = 1): Record<string, unknown> {
  return {
    id: FOERDERJAHR_ID,
    code: `FJ-${String(nummer)}`,
    nummer,
    vonMonat: '2026-01-01',
    bisMonat: '2026-12-01',
  };
}

describe('sollQuotePct ([Q3] Kap. 5)', () => {
  it('steigt von 20 auf 40 Prozent', () => {
    expect([1, 2, 3, 4, 5].map(sollQuotePct)).toEqual([20, 25, 30, 35, 40]);
  });

  it('ist NICHT kumulativ — Jahr 5 verlangt 40, nicht 150 Prozent', () => {
    // Das Merkblatt sagt es ausdruecklich. Wer die Quoten addiert, baut eine
    // Anforderung, die niemand erfuellen kann.
    const summe = [1, 2, 3, 4, 5].reduce((s, jahr) => s + sollQuotePct(jahr), 0);
    expect(summe).toBe(150);
    expect(sollQuotePct(5)).toBe(40);
  });

  it('bleibt jenseits von Jahr 5 bei 40 statt frei fortzuschreiben', () => {
    expect(sollQuotePct(9)).toBe(40);
  });

  it('lehnt ein Jahr vor 1 ab', () => {
    expect(() => sollQuotePct(0)).toThrow(BadRequestException);
  });
});

describe('GeraeteerkennungService (TB-05)', () => {
  let summiereVerbrauch: Mock;
  let summiereJeGruppe: Mock;
  let zaehleSysteme: Mock;
  let insertZuordnung: Mock;
  let beendeZuordnungRepo: Mock;
  let setzeEntbehrlich: Mock;
  let findEntbehrlich: Mock;
  let findGruppeById: Mock;
  let findZuordnungen: Mock;
  let findByIdFj: Mock;
  let service: GeraeteerkennungService;

  beforeAll(() => {
    ensureNoOpTransactionHost();
  });

  beforeEach(() => {
    summiereVerbrauch = vi.fn().mockResolvedValue({ gesamtKwh: 1000, zugeordnetKwh: 250, tageMitWerten: 365 });
    summiereJeGruppe = vi.fn().mockResolvedValue([
      { geraetegruppeId: GRUPPE_ID, bezeichnung: 'Beleuchtung', kwh: 250 },
    ]);
    zaehleSysteme = vi.fn().mockResolvedValue({ gesamt: 2, entbehrlich: 0 });
    insertZuordnung = vi.fn().mockResolvedValue(undefined);
    beendeZuordnungRepo = vi.fn().mockResolvedValue(true);
    setzeEntbehrlich = vi.fn().mockResolvedValue(true);
    findEntbehrlich = vi.fn().mockResolvedValue({ entbehrlich: true, grund: 'System umfasst nur ein Geraet.' });
    findGruppeById = vi.fn().mockResolvedValue({ id: GRUPPE_ID, endkundeId: ENDKUNDE_ID, bezeichnung: 'Beleuchtung', beschreibung: null });
    findZuordnungen = vi.fn().mockResolvedValue([
      {
        geraetegruppeId: GRUPPE_ID,
        geraetegruppeBezeichnung: 'Beleuchtung',
        messkanalId: KANAL_ID,
        methode: 'direktmessung' as const,
        genauigkeitPct: null,
        anteilProzent: 100,
        imGesamtverbrauchEnthalten: true,
        gueltigVon: '2026-01-01',
        gueltigBis: null,
        beendetGrund: null,
        wirksam: true,
      },
    ]);
    findByIdFj = vi.fn().mockResolvedValue(foerderjahr(1));

    service = new GeraeteerkennungService(
      {
        summiereVerbrauch,
        summiereJeGruppe,
        zaehleSysteme,
        insertZuordnung,
        beendeZuordnung: beendeZuordnungRepo,
        setzeEntbehrlich,
        findEntbehrlich,
        findGruppeById,
        findZuordnungen,
        findGruppen: vi.fn().mockResolvedValue([]),
        insertGruppe: vi.fn(),
      } as unknown as GeraeteerkennungRepository,
      { findById: findByIdFj } as unknown as NachweisFoerderjahrRepository,
    );
  });

  function quote(): Promise<Awaited<ReturnType<GeraeteerkennungService['quote']>>> {
    return service.quote({ endkundeId: ENDKUNDE_ID, energietraeger: 'strom', foerderjahrId: FOERDERJAHR_ID });
  }

  describe('Die Quote', () => {
    it('rechnet zugeordnet durch gesamt', async () => {
      const ergebnis = await quote();

      expect(ergebnis.quotePct).toBe(25);
      expect(ergebnis.sollQuotePct).toBe(20);
      expect(ergebnis.erreicht).toBe(true);
    });

    it('meldet ein Verfehlen der Sollquote', async () => {
      summiereVerbrauch.mockResolvedValue({ gesamtKwh: 1000, zugeordnetKwh: 120, tageMitWerten: 365 });

      const ergebnis = await quote();

      expect(ergebnis.quotePct).toBe(12);
      expect(ergebnis.erreicht).toBe(false);
    });

    it('rechnet das Fenster bis zum Ersten des Folgemonats', async () => {
      await quote();

      // bisMonat 2026-12-01 ist der LETZTE Monat des Foerderjahres --
      // die Tageswerte laufen bis einschliesslich 31.12.
      expect(summiereVerbrauch).toHaveBeenCalledWith(ENDKUNDE_ID, 'strom', '2026-01-01', '2027-01-01');
    });

    it('gibt die Aufteilung je Gruppe aus (Kap. 6: getrennt nach Gruppen)', async () => {
      const ergebnis = await quote();

      expect(ergebnis.gruppen).toEqual([
        { geraetegruppeId: GRUPPE_ID, bezeichnung: 'Beleuchtung', zugeordnetKwh: 250, anteilPct: 25 },
      ]);
    });
  });

  describe('Wann die Quote NICHT null Prozent ist, sondern unbekannt', () => {
    it('meldet fehlende Tageswerte statt einer 0', async () => {
      summiereVerbrauch.mockResolvedValue({ gesamtKwh: 0, zugeordnetKwh: 0, tageMitWerten: 0 });

      const ergebnis = await quote();

      // Eine 0 sieht aus wie ein Ergebnis und wird als eines gelesen. Der
      // haeufigste Grund ist, dass die Verdichtung noch nicht gelaufen ist.
      expect(ergebnis.quotePct).toBeNull();
      expect(ergebnis.erreicht).toBeNull();
      expect(ergebnis.ohneTageswerte).toBe(true);
    });

    it('meldet einen Nenner von null als unbekannt', async () => {
      summiereVerbrauch.mockResolvedValue({ gesamtKwh: 0, zugeordnetKwh: 0, tageMitWerten: 12 });

      const ergebnis = await quote();

      expect(ergebnis.quotePct).toBeNull();
      expect(ergebnis.ohneTageswerte).toBe(false);
    });
  });

  describe('Die Entbehrlichkeit steht NEBEN der Quote, nicht in ihr', () => {
    it('veraendert die berechnete Quote nicht', async () => {
      zaehleSysteme.mockResolvedValue({ gesamt: 2, entbehrlich: 2 });
      summiereVerbrauch.mockResolvedValue({ gesamtKwh: 1000, zugeordnetKwh: 120, tageMitWerten: 365 });

      const ergebnis = await quote();

      // Eine Quote, die sich durch ein Haekchen von 12 % auf „erfuellt" hebt,
      // waere genau die Zahl, der niemand mehr trauen kann.
      expect(ergebnis.quotePct).toBe(12);
      expect(ergebnis.erreicht).toBe(false);
      expect(ergebnis.alleSystemeEntbehrlich).toBe(true);
    });

    it('meldet Teil-Entbehrlichkeit nicht als vollstaendig', async () => {
      zaehleSysteme.mockResolvedValue({ gesamt: 3, entbehrlich: 2 });

      expect((await quote()).alleSystemeEntbehrlich).toBe(false);
    });

    it('gibt den gesetzten Vermerk mit Begruendung zurueck', async () => {
      // Ohne diese Lese-Moeglichkeit waere das Vermerken schreib-only: Die
      // Betriebssicht koennte ein Haekchen setzen, aber nicht zeigen, ob schon
      // eines gesetzt IST — und der naechste Bearbeiter uebersaehe eine
      // bestehende Feststellung samt ihrer Begruendung.
      expect(await service.findeEntbehrlichkeit('sys-1')).toEqual({
        systemId: 'sys-1',
        entbehrlich: true,
        grund: 'System umfasst nur ein Geraet.',
      });
    });

    it('meldet ein unbekanntes System als nicht gefunden', async () => {
      findEntbehrlich.mockResolvedValue(null);

      await expect(service.findeEntbehrlichkeit('sys-9')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('verlangt eine Begruendung', async () => {
      const fehler = await service.vermerkeEntbehrlich('sys-1', true).catch((e: unknown) => e);

      expect(fehler).toBeInstanceOf(BadRequestException);
      expect((fehler as Error).message).toContain('Begruendung');
      expect(setzeEntbehrlich).not.toHaveBeenCalled();
    });

    it('braucht fuer die Ruecknahme keine Begruendung', async () => {
      await service.vermerkeEntbehrlich('sys-1', false);

      expect(setzeEntbehrlich).toHaveBeenCalledWith('sys-1', false, undefined);
    });
  });

  describe('Zuordnen', () => {
    const eingabe = {
      geraetegruppeId: GRUPPE_ID,
      messkanalId: KANAL_ID,
      methode: 'direktmessung' as const,
      imGesamtverbrauchEnthalten: true,
      gueltigVon: '2026-01-01',
    };

    it('verlangt die Genauigkeit, sobald nicht direkt gemessen wird', async () => {
      const fehler = await service
        .legeZuordnungAn({ ...eingabe, methode: 'algorithmus' })
        .catch((e: unknown) => e);

      expect(fehler).toBeInstanceOf(BadRequestException);
      expect((fehler as Error).message).toContain('Genauigkeit');
      expect(insertZuordnung).not.toHaveBeenCalled();
    });

    it('laesst die Genauigkeit bei Direktmessung offen', async () => {
      await service.legeZuordnungAn(eingabe);

      expect(insertZuordnung).toHaveBeenCalledTimes(1);
    });

    it('setzt den Anteil auf 100, wenn keiner angegeben ist', async () => {
      await service.legeZuordnungAn(eingabe);

      expect((insertZuordnung.mock.calls[0]?.[0] as { anteilProzent: number }).anteilProzent).toBe(100);
    });

    it('meldet eine ueberlappende Zuordnung als Konflikt', async () => {
      insertZuordnung.mockRejectedValue(
        Object.assign(new Error('exclusion'), {
          code: '23P01',
          constraint: 'ex_geraetegruppe_kanal_ein_kanal_eine_gruppe',
        }),
      );

      const fehler = await service.legeZuordnungAn(eingabe).catch((e: unknown) => e);

      expect(fehler).toBeInstanceOf(ConflictException);
      expect((fehler as Error).message).toContain('doppelt');
    });
  });

  describe('Beenden', () => {
    it('meldet eine nicht wirksame Zuordnung als nicht gefunden', async () => {
      beendeZuordnungRepo.mockResolvedValue(false);

      await expect(
        service.beendeZuordnung({
          geraetegruppeId: GRUPPE_ID,
          messkanalId: KANAL_ID,
          gueltigBis: '2026-06-01',
          grund: 'Zaehler umgeklemmt',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
