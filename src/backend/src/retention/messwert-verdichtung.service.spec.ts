import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { ensureNoOpTransactionHost } from '../stammdaten/test-support/init-noop-transaction-host';
import {
  MesswertVerdichtungService,
  VERDICHTUNG_ZEITZONE,
  type VerdichtungsLaufOptionen,
} from './messwert-verdichtung.service';
import {
  KANAL_BATCH,
  MesswertVerdichtungRepository,
} from './persistence/messwert-verdichtung.repository';

describe('MesswertVerdichtungService (Stufe-B-Bestand, Retention O2)', () => {
  let findKanaele: Mock;
  let schreibe: Mock;
  let zaehle: Mock;
  let zaehleAbweichend: Mock;
  let service: MesswertVerdichtungService;

  /** 2026-09-07, 10:00 Uhr Berliner Zeit — „heute" ist der 7. September. */
  const JETZT = new Date('2026-09-07T08:00:00.000Z');

  const BASIS: VerdichtungsLaufOptionen = {
    vonTag: '2026-09-01',
    bisTag: '2026-09-07',
    jetzt: JETZT,
  };

  beforeAll(() => {
    ensureNoOpTransactionHost();
  });

  beforeEach(() => {
    findKanaele = vi.fn().mockResolvedValue([7, 8, 9]);
    schreibe = vi.fn().mockResolvedValue(18);
    zaehle = vi.fn().mockResolvedValue(18);
    zaehleAbweichend = vi.fn().mockResolvedValue(0);

    service = new MesswertVerdichtungService({
      findKanaeleMitRohwerten: findKanaele,
      schreibeTageszeilen: schreibe,
      zaehleTageszeilen: zaehle,
      zaehleAbweichendeZeitzone: zaehleAbweichend,
    } as unknown as MesswertVerdichtungRepository);
  });

  describe('Probelauf', () => {
    it('zaehlt, ohne zu schreiben', async () => {
      const ergebnis = await service.probelauf(BASIS);

      expect(ergebnis.modus).toBe('probelauf');
      expect(ergebnis.anzahlTageszeilen).toBe(18);
      expect(zaehle).toHaveBeenCalledTimes(1);
      expect(schreibe).not.toHaveBeenCalled();
    });
  });

  describe('Ausfuehrung', () => {
    it('schreibt die Tageszeilen und meldet, wie viele', async () => {
      const ergebnis = await service.fuehreAus(BASIS);

      expect(ergebnis.modus).toBe('ausfuehrung');
      expect(ergebnis.anzahlTageszeilen).toBe(18);
      expect(ergebnis.anzahlKanaele).toBe(3);
      expect(zaehle).not.toHaveBeenCalled();
    });

    it('reicht Fenster und Zeitzone unveraendert an das Repository durch', async () => {
      await service.fuehreAus(BASIS);

      expect(schreibe).toHaveBeenCalledWith({
        messkanalKeys: [7, 8, 9],
        vonTag: '2026-09-01',
        bisTag: '2026-09-07',
        zeitzone: VERDICHTUNG_ZEITZONE,
      });
    });
  });

  describe('Batching (der Aufrufer wiederholt)', () => {
    it('meldet weitere Durchgaenge, solange der Batch voll ist', async () => {
      const voll = Array.from({ length: KANAL_BATCH }, (_, i) => i + 1);
      findKanaele.mockResolvedValue(voll);

      const ergebnis = await service.fuehreAus(BASIS);

      expect(ergebnis.weitere).toBe(true);
      expect(ergebnis.letzterKanalKey).toBe(KANAL_BATCH);
    });

    it('meldet das Ende bei einem Teilbatch', async () => {
      const ergebnis = await service.fuehreAus(BASIS);

      expect(ergebnis.weitere).toBe(false);
      expect(ergebnis.letzterKanalKey).toBe(9);
    });

    it('behaelt den Cursor, wenn gar kein Kanal mehr kommt', async () => {
      findKanaele.mockResolvedValue([]);

      const ergebnis = await service.fuehreAus({ ...BASIS, nachKanalKey: 42 });

      expect(ergebnis.anzahlKanaele).toBe(0);
      expect(ergebnis.letzterKanalKey).toBe(42);
      expect(ergebnis.weitere).toBe(false);
    });

    it('gibt den Cursor an das Repository weiter', async () => {
      await service.fuehreAus({ ...BASIS, nachKanalKey: 42 });

      expect(findKanaele).toHaveBeenCalledWith(
        expect.objectContaining({ nachKanalKey: 42, limit: KANAL_BATCH }),
      );
    });
  });

  describe('Sicherung 1 — kein unvollstaendiger Tag', () => {
    it('laesst ein Fenster bis einschliesslich gestern zu', async () => {
      // bisTag ist halboffen: 2026-09-07 heisst „bis einschliesslich 06.".
      await expect(service.fuehreAus({ ...BASIS, bisTag: '2026-09-07' })).resolves.toBeDefined();
    });

    it('lehnt ein Fenster ab, das den laufenden Tag einschliesst', async () => {
      const fehler = await service.fuehreAus({ ...BASIS, bisTag: '2026-09-08' }).catch((e: unknown) => e);

      expect((fehler as Error).message).toContain('2026-09-08');
      expect((fehler as Error).message).toContain('heutigen Tag');
      expect(schreibe).not.toHaveBeenCalled();
    });

    it('rechnet den heutigen Tag in der Zielzeitzone, nicht in UTC', async () => {
      // 2026-09-07T23:30Z ist in Europe/Berlin bereits der 8. September.
      const spaetAbends = new Date('2026-09-07T23:30:00.000Z');

      await expect(
        service.fuehreAus({ ...BASIS, bisTag: '2026-09-08', jetzt: spaetAbends }),
      ).resolves.toBeDefined();
    });
  });

  describe('Sicherung 2 — keine gemischten Zeitzonen', () => {
    it('bricht ab, wenn der Bestand unter einer anderen Zeitzone gebildet wurde', async () => {
      zaehleAbweichend.mockResolvedValue(4);

      const fehler = await service.fuehreAus(BASIS).catch((e: unknown) => e);

      expect((fehler as Error).message).toContain('andere');
      expect((fehler as Error).message).toContain(VERDICHTUNG_ZEITZONE);
      expect(schreibe).not.toHaveBeenCalled();
    });

    it('prueft das auch im Probelauf', async () => {
      zaehleAbweichend.mockResolvedValue(1);

      await expect(service.probelauf(BASIS)).rejects.toThrow();
      expect(zaehle).not.toHaveBeenCalled();
    });
  });

  describe('Fenster-Validierung', () => {
    it('lehnt ein leeres Fenster ab', async () => {
      const fehler = await service
        .fuehreAus({ ...BASIS, vonTag: '2026-09-05', bisTag: '2026-09-05' })
        .catch((e: unknown) => e);

      expect((fehler as Error).message).toContain('Leeres Fenster');
    });

    it('lehnt ein rueckwaerts laufendes Fenster ab', async () => {
      await expect(
        service.fuehreAus({ ...BASIS, vonTag: '2026-09-06', bisTag: '2026-09-02' }),
      ).rejects.toThrow(/Leeres Fenster/);
    });

    it('lehnt ein Datum in falscher Form ab', async () => {
      await expect(service.fuehreAus({ ...BASIS, vonTag: '01.09.2026' })).rejects.toThrow(
        /YYYY-MM-DD/,
      );
    });
  });
});
