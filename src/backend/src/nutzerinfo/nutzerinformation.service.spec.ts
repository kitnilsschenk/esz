import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { NutzerinformationService } from './nutzerinformation.service';
import { ensureNoOpTransactionHost } from '../stammdaten/test-support/init-noop-transaction-host';
import type { NutzerinfoRepository, KandidatenPaar } from './persistence/nutzerinfo.repository';
import type { AnalyticsLaufLookupRepository } from '../nachweis/persistence/analytics-lauf-lookup.repository';
import type { GeraeteerkennungRepository } from '../geraeteerkennung/persistence/geraeteerkennung.repository';
import type { AuditService } from '../audit/audit.service';
import type { NutzerinformationItem } from './nutzerinfo.types';

const ENDKUNDE_ID = '018f1e2d-0000-7000-8000-0000000000c1';
const GRUPPE_ID = '018f1e2d-0000-7000-8000-0000000000a1';
const LAUF_ID = '018f1e2d-0000-7000-8000-0000000000d2';
const INFO_ID = '018f1e2d-0000-7000-8000-0000000000e3';

/** 2026-09-07 — der laufende Monat ist September, August ist abgeschlossen. */
const JETZT = new Date('2026-09-07T10:00:00.000Z');
const MONAT = '2026-08-01';

function paar(overrides: Partial<KandidatenPaar> = {}): KandidatenPaar {
  return {
    endkundeId: ENDKUNDE_ID,
    energietraeger: 'strom',
    verarbeitungsStatus: 'aktiv',
    hatWiderspruch: false,
    ...overrides,
  };
}

function kandidat(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    berechnungslaufId: LAUF_ID,
    erstelltAt: '2026-09-01T00:00:00.000Z',
    parameterHash: 'ph',
    rohdatenHash: 'rh',
    referenzKwh: 1000,
    istKwh: 800,
    qualitaetsStufe: 'belastbar',
    ...overrides,
  };
}

function information(overrides: Partial<NutzerinformationItem> = {}): NutzerinformationItem {
  return {
    id: INFO_ID,
    endkundeId: ENDKUNDE_ID,
    energietraeger: 'strom',
    monat: MONAT,
    berechnungslaufId: LAUF_ID,
    referenzKwh: 1000,
    istKwh: 800,
    deltaKwh: 200,
    qualitaetsStufe: 'belastbar',
    abdeckungPct: 100,
    tageFehlend: 0,
    kandidatenAnzahl: 1,
    inhaltHashHex: 'ab'.repeat(32),
    erzeugtAt: '2026-09-02T00:00:00.000Z',
    zugestelltAt: null,
    zustellweg: null,
    ...overrides,
  };
}

describe('NutzerinformationService (TB-06, monatliche Nutzerinformation)', () => {
  let findKandidatenPaare: Mock;
  let findGuete: Mock;
  let schreibe: Mock;
  let findById: Mock;
  let findFuerEndkunde: Mock;
  let vermerkeZustellung: Mock;
  let findKandidatenFuerMonat: Mock;
  let findVormonat: Mock;
  let summiereVerbrauch: Mock;
  let summiereJeGruppe: Mock;
  let auditAppend: Mock;
  let findByMonat: Mock;
  let zaehleMonatsstand: Mock;
  let service: NutzerinformationService;

  beforeAll(() => {
    ensureNoOpTransactionHost();
  });

  beforeEach(() => {
    findKandidatenPaare = vi.fn().mockResolvedValue([paar()]);
    findGuete = vi.fn().mockResolvedValue({ abdeckungPct: 100, tageFehlend: 0 });
    zaehleMonatsstand = vi.fn().mockResolvedValue({ erzeugt: 12, zugestellt: 7 });
    schreibe = vi.fn().mockResolvedValue(true);
    findById = vi.fn().mockResolvedValue(information());
    findFuerEndkunde = vi.fn().mockResolvedValue([information()]);
    vermerkeZustellung = vi.fn().mockResolvedValue(true);
    findKandidatenFuerMonat = vi.fn().mockResolvedValue([kandidat()]);
    findVormonat = vi.fn().mockResolvedValue(undefined);
    summiereVerbrauch = vi.fn().mockResolvedValue({ gesamtKwh: 1200, zugeordnetKwh: 300, tageMitWerten: 31 });
    summiereJeGruppe = vi
      .fn()
      .mockResolvedValue([{ geraetegruppeId: GRUPPE_ID, bezeichnung: 'Beleuchtung', kwh: 300 }]);
    auditAppend = vi.fn().mockResolvedValue({});
    findByMonat = vi.fn().mockResolvedValue([information()]);

    service = new NutzerinformationService(
      {
        findKandidatenPaare,
        findGuete,
        schreibe,
        findById,
        findFuerEndkunde,
        vermerkeZustellung,
        zaehleMonatsstand,
        findVormonat,
        findByMonat,
      } as unknown as NutzerinfoRepository,
      { findKandidatenFuerMonat } as unknown as AnalyticsLaufLookupRepository,
      { summiereVerbrauch, summiereJeGruppe } as unknown as GeraeteerkennungRepository,
      { append: auditAppend } as unknown as AuditService,
    );
  });

  describe('Erzeugung', () => {
    it('erzeugt eine Information je informierbarem Paar', async () => {
      const ergebnis = await service.fuehreAus(MONAT, JETZT);

      expect(ergebnis.anzahlErzeugt).toBe(1);
      expect(schreibe).toHaveBeenCalledTimes(1);
    });

    it('bindet an DENSELBEN Berechnungslauf wie der Nachweis', async () => {
      await service.fuehreAus(MONAT, JETZT);

      const geschrieben = schreibe.mock.calls[0]?.[0] as { berechnungslaufId: string };
      expect(geschrieben.berechnungslaufId).toBe(LAUF_ID);
      // Die Auswahl kommt aus der Nachweis-Abfrage, nicht aus einer eigenen.
      expect(findKandidatenFuerMonat).toHaveBeenCalledWith(ENDKUNDE_ID, 'strom', MONAT);
    });

    it('zeigt einen Mehrverbrauch als negatives Delta — ohne Vorzeichenregel', async () => {
      // Ist > Referenz: der Kunde hat MEHR verbraucht als erwartet.
      findKandidatenFuerMonat.mockResolvedValue([kandidat({ referenzKwh: 800, istKwh: 1000 })]);

      await service.fuehreAus(MONAT, JETZT);

      const geschrieben = schreibe.mock.calls[0]?.[0] as { deltaKwh: number };
      // Kap. 6 verlangt „Einsparungen UND/ODER Mehrverbraeuche". Eine 0 hier
      // waere eine Beschoenigung gegenueber dem Kunden.
      expect(geschrieben.deltaKwh).toBe(-200);
    });

    it('schreibt im Probelauf nichts, zaehlt aber gleich', async () => {
      const ergebnis = await service.probelauf(MONAT, JETZT);

      expect(ergebnis.modus).toBe('probelauf');
      expect(ergebnis.anzahlErzeugt).toBe(1);
      expect(schreibe).not.toHaveBeenCalled();
    });
  });

  describe('Wer NICHT informiert wird — und warum das getrennt gezaehlt wird', () => {
    it('ueberspringt einen Kunden mit wirksamem Widerspruch (Opt-out, TB-06)', async () => {
      findKandidatenPaare.mockResolvedValue([paar({ hatWiderspruch: true })]);

      const ergebnis = await service.fuehreAus(MONAT, JETZT);

      expect(ergebnis.uebersprungenWiderspruch).toBe(1);
      expect(ergebnis.anzahlErzeugt).toBe(0);
      expect(schreibe).not.toHaveBeenCalled();
    });

    it('ueberspringt einen nach Art. 18 gesperrten Kunden', async () => {
      findKandidatenPaare.mockResolvedValue([paar({ verarbeitungsStatus: 'gesperrt' })]);

      const ergebnis = await service.fuehreAus(MONAT, JETZT);

      expect(ergebnis.uebersprungenGesperrt).toBe(1);
      expect(schreibe).not.toHaveBeenCalled();
    });

    it('zaehlt einen Kunden ohne Berechnungslauf als BEFUND, nicht als Erfolg', async () => {
      findKandidatenFuerMonat.mockResolvedValue([]);

      const ergebnis = await service.fuehreAus(MONAT, JETZT);

      // Das ist die Zahl, die eine Auflagenverletzung sichtbar macht: Er
      // MUESSTE informiert werden und kann es nicht.
      expect(ergebnis.ohneBerechnung).toBe(1);
      expect(ergebnis.uebersprungenWiderspruch).toBe(0);
      expect(ergebnis.uebersprungenGesperrt).toBe(0);
    });

    it('loest widerspruechliche Berechnungslaeufe NICHT auf', async () => {
      // Zwei nicht-ersetzte Laeufe mit verschiedenen Werten — nach ADR-0006 D4
      // ist „nimm den ersten" verboten.
      findKandidatenFuerMonat.mockResolvedValue([
        kandidat({ referenzKwh: 1000, istKwh: 800 }),
        kandidat({ berechnungslaufId: 'anderer', referenzKwh: 900, istKwh: 850 }),
      ]);

      const ergebnis = await service.fuehreAus(MONAT, JETZT);

      expect(ergebnis.ohneBerechnung).toBe(1);
      expect(schreibe).not.toHaveBeenCalled();
    });
  });

  describe('Nur abgeschlossene Monate', () => {
    it('lehnt den laufenden Monat ab', async () => {
      const fehler = await service.fuehreAus('2026-09-01', JETZT).catch((e: unknown) => e);

      expect(fehler).toBeInstanceOf(BadRequestException);
      expect((fehler as Error).message).toContain('nicht abgeschlossen');
    });

    it('lehnt einen kuenftigen Monat ab', async () => {
      await expect(service.fuehreAus('2026-12-01', JETZT)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lehnt ein Datum ab, das kein Monatserster ist', async () => {
      await expect(service.fuehreAus('2026-08-15', JETZT)).rejects.toThrow(/YYYY-MM-01/);
    });
  });

  describe('Zustellungsnachweis (TB-06)', () => {
    it('vermerkt die Zustellung', async () => {
      findById
        .mockResolvedValueOnce(information())
        .mockResolvedValueOnce(information({ zugestelltAt: '2026-09-03T08:00:00.000Z', zustellweg: 'brief' }));

      const ergebnis = await service.vermerkeZustellung(INFO_ID, 'brief', '2026-09-03T08:00:00.000Z');

      expect(vermerkeZustellung).toHaveBeenCalledTimes(1);
      expect(ergebnis.zugestelltAt).toBe('2026-09-03T08:00:00.000Z');
    });

    it('lehnt eine zweite Zustellung ab und laesst den ersten Zeitpunkt stehen', async () => {
      findById.mockResolvedValue(
        information({ zugestelltAt: '2026-09-03T08:00:00.000Z', zustellweg: 'brief' }),
      );

      const fehler = await service
        .vermerkeZustellung(INFO_ID, 'email', '2026-09-05T08:00:00.000Z')
        .catch((e: unknown) => e);

      expect(fehler).toBeInstanceOf(ConflictException);
      expect(vermerkeZustellung).not.toHaveBeenCalled();
    });

    it('lehnt einen Zustellzeitpunkt in der Zukunft ab', async () => {
      const morgen = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      await expect(service.vermerkeZustellung(INFO_ID, 'brief', morgen)).rejects.toThrow(/Zukunft/);
    });

    it('meldet eine unbekannte Information als nicht gefunden', async () => {
      findById.mockResolvedValue(undefined);

      await expect(
        service.vermerkeZustellung(INFO_ID, 'brief', '2026-09-03T08:00:00.000Z'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('Sammelzustellung — der Stapel, den der Postversand braucht', () => {
    const BETRIEB = { sub: 'betrieb-sub', actorTyp: 'benutzer', roles: ['betrieb'], azp: 'edms-bff' } as const;
    const ZEITPUNKT = '2026-09-03T08:00:00.000Z';

    it('vermerkt alle offenen Informationen des Monats', async () => {
      findByMonat.mockResolvedValue([
        information({ id: 'a' }),
        information({ id: 'b' }),
        information({ id: 'c' }),
      ]);

      const ergebnis = await service.vermerkeSammelZustellung(MONAT, 'brief', ZEITPUNKT, BETRIEB, true);

      expect(vermerkeZustellung).toHaveBeenCalledTimes(3);
      expect(ergebnis.anzahlVermerkt).toBe(3);
      expect(ergebnis.anzahlGesamt).toBe(3);
    });

    it('laesst bereits zugestellte Informationen unberuehrt und zaehlt sie', async () => {
      // Ein Nachzuegler, der vorab einzeln zugestellt wurde, ist kein Fehler —
      // sein erster Zeitpunkt bleibt der Nachweis.
      findByMonat.mockResolvedValue([
        information({ id: 'a' }),
        information({ id: 'b', zugestelltAt: '2026-09-01T08:00:00.000Z', zustellweg: 'email' }),
      ]);

      const ergebnis = await service.vermerkeSammelZustellung(MONAT, 'brief', ZEITPUNKT, BETRIEB, true);

      expect(vermerkeZustellung).toHaveBeenCalledTimes(1);
      expect(ergebnis.anzahlVermerkt).toBe(1);
      expect(ergebnis.anzahlBereitsZugestellt).toBe(1);
    });

    it('schreibt ein Audit-Ereignis JE INFORMATION, nicht eines fuer den Stapel', async () => {
      // Die Frage lautet spaeter immer „wurde DIESER Kunde informiert?" —
      // ein Sammelereignis koennte sie nicht beantworten (V0055-Zuschnitt).
      findByMonat.mockResolvedValue([information({ id: 'a' }), information({ id: 'b' })]);

      await service.vermerkeSammelZustellung(MONAT, 'brief', ZEITPUNKT, BETRIEB, true);

      expect(auditAppend).toHaveBeenCalledTimes(2);
      expect(auditAppend.mock.calls[0]?.[0]).toMatchObject({
        eventTyp: 'nutzerinfo.information.zugestellt',
        objektRef: 'a',
        kontext: { synthetic: true, monat: MONAT, zustellweg: 'brief' },
      });
    });

    it('bricht nicht ab, wenn eine Zeile zwischenzeitlich zugestellt wurde', async () => {
      // Zwei Betriebs-Sitzungen gleichzeitig: die verlorene Zeile wird
      // uebersprungen, der Rest des Stapels laeuft durch.
      findByMonat.mockResolvedValue([information({ id: 'a' }), information({ id: 'b' })]);
      vermerkeZustellung.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

      const ergebnis = await service.vermerkeSammelZustellung(MONAT, 'brief', ZEITPUNKT, BETRIEB, true);

      expect(ergebnis.anzahlVermerkt).toBe(1);
      expect(auditAppend).toHaveBeenCalledTimes(1);
    });

    it('lehnt einen Monat ohne erzeugte Informationen ab, statt Erfolg zu melden', async () => {
      findByMonat.mockResolvedValue([]);

      await expect(
        service.vermerkeSammelZustellung(MONAT, 'brief', ZEITPUNKT, BETRIEB, true),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lehnt einen Zustellzeitpunkt in der Zukunft ab', async () => {
      const morgen = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      await expect(
        service.vermerkeSammelZustellung(MONAT, 'brief', morgen, BETRIEB, true),
      ).rejects.toThrow(/Zukunft/);
    });
  });

  describe('Monatsstand („Ist der Monat durch?")', () => {
    it('rechnet die offene Zahl aus erzeugt minus zugestellt', async () => {
      const stand = await service.monatsstand(MONAT, JETZT);

      expect(stand.anzahlErzeugt).toBe(12);
      expect(stand.anzahlZugestellt).toBe(7);
      expect(stand.anzahlOffen).toBe(5);
    });

    it('waehlt ohne Angabe den letzten ABGESCHLOSSENEN Monat', async () => {
      // JETZT ist der 7. September — auszuwerten ist der August.
      const stand = await service.monatsstand(undefined, JETZT);

      expect(stand.monat).toBe('2026-08-01');
      expect(zaehleMonatsstand).toHaveBeenCalledWith('2026-08-01');
    });

    it('nennt den ausgewerteten Monat in der Antwort', async () => {
      // Eine Zahl ohne ihren Monat ist keine Auskunft — schon gar nicht,
      // wenn der Server den Monat selbst bestimmt hat.
      const stand = await service.monatsstand(undefined, JETZT);

      expect(stand.monat).toBeDefined();
    });

    it('lehnt ein Datum ab, das kein Monatserster ist', async () => {
      await expect(service.monatsstand('2026-08-15', JETZT)).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
