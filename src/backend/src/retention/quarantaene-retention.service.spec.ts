import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import {
  LOESCHUNG_NACH_TAGEN,
  NULLUNG_NACH_TAGEN,
  OBERGRENZE_TAGE,
  QuarantaeneRetentionService,
} from './quarantaene-retention.service';
import { ensureNoOpTransactionHost } from '../stammdaten/test-support/init-noop-transaction-host';
import type { QuarantaeneRetentionRepository } from './persistence/quarantaene-retention.repository';
import type { AuditService } from '../audit/audit.service';
import type { SyntheticOnlyConfigService } from '../stammdaten/synthetic/synthetic-only.config';

const JETZT = new Date('2026-09-05T12:00:00.000Z');

function tageVor(tage: number): string {
  return new Date(JETZT.getTime() - tage * 24 * 60 * 60 * 1000).toISOString();
}

describe('QuarantaeneRetentionService (Votum 2026-09-05, Punkt 3)', () => {
  let nulleBlindIndex: Mock;
  let loescheZeilen: Mock;
  let zaehleNullungsKandidaten: Mock;
  let zaehleLoeschKandidaten: Mock;
  let zaehleUebersprungene: Mock;
  let append: Mock;
  let service: QuarantaeneRetentionService;

  beforeAll(() => {
    ensureNoOpTransactionHost();
  });

  beforeEach(() => {
    nulleBlindIndex = vi.fn().mockResolvedValue(7);
    loescheZeilen = vi.fn().mockResolvedValue(3);
    zaehleNullungsKandidaten = vi.fn().mockResolvedValue(7);
    zaehleLoeschKandidaten = vi.fn().mockResolvedValue(3);
    zaehleUebersprungene = vi.fn().mockResolvedValue(2);
    append = vi.fn().mockResolvedValue({ eventId: 'e1' });

    service = new QuarantaeneRetentionService(
      {
        nulleBlindIndex,
        loescheZeilen,
        zaehleNullungsKandidaten,
        zaehleLoeschKandidaten,
        zaehleUebersprungeneWegenOffenemVorgang: zaehleUebersprungene,
      } as unknown as QuarantaeneRetentionRepository,
      { append } as unknown as AuditService,
      { syntheticOnly: true } as unknown as SyntheticOnlyConfigService,
    );
  });

  describe('Probelauf', () => {
    it('aendert NICHTS und zaehlt nur', async () => {
      const ergebnis = await service.probelauf(JETZT);

      expect(nulleBlindIndex).not.toHaveBeenCalled();
      expect(loescheZeilen).not.toHaveBeenCalled();
      expect(ergebnis.modus).toBe('probelauf');
      expect(ergebnis.anzahlGenullt).toBe(7);
      expect(ergebnis.anzahlGeloescht).toBe(3);
    });

    it('nennt beide Stichtage, damit die Zahlen nachvollziehbar sind', async () => {
      const ergebnis = await service.probelauf(JETZT);

      expect(ergebnis.stichtagNullung).toBe(tageVor(NULLUNG_NACH_TAGEN));
      expect(ergebnis.stichtagLoeschung).toBe(tageVor(LOESCHUNG_NACH_TAGEN));
    });
  });

  describe('Ausfuehrung', () => {
    it('verweigert den Lauf ohne ausdrueckliche Bestaetigung', async () => {
      // Ein Loeschjob, den man versehentlich scharf schalten kann, ist kein
      // Probelauf — dieselbe Linie wie das `--yes` des Migrations-Runners.
      await expect(service.fuehreAus(false, JETZT)).rejects.toThrow('bewusster Schritt');
      expect(loescheZeilen).not.toHaveBeenCalled();
    });

    it('nullt ZUERST und loescht danach', async () => {
      // Umgekehrt waeren die Zahlen irrefuehrend: Die geloeschten Zeilen
      // zaehlten dann nicht als genullt, obwohl ihr Korrelat sehr wohl
      // verschwunden ist.
      await service.fuehreAus(true, JETZT);

      expect(nulleBlindIndex.mock.invocationCallOrder[0]).toBeLessThan(
        loescheZeilen.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
      );
    });

    it('nullt nach 30 und loescht nach 90 Tagen', async () => {
      await service.fuehreAus(true, JETZT);

      const [nullStichtag] = nulleBlindIndex.mock.calls[0] as [Date];
      const [loeschStichtag] = loescheZeilen.mock.calls[0] as [Date];

      expect(nullStichtag.toISOString()).toBe(tageVor(30));
      expect(loeschStichtag.toISOString()).toBe(tageVor(90));
    });

    it('reicht die absolute Obergrenze von 12 Monaten durch', async () => {
      // Ein Ausfall-Vorgang, der nach einem Jahr offen ist, ist ein
      // Organisationsproblem, kein Aufbewahrungsgrund.
      await service.fuehreAus(true, JETZT);

      const [, obergrenze] = loescheZeilen.mock.calls[0] as [Date, Date];
      expect(obergrenze.toISOString()).toBe(tageVor(OBERGRENZE_TAGE));
    });

    it('meldet, wie viel wegen offener Vorgaenge stehen blieb', async () => {
      // Ohne diese Zahl waere ein blockierter Lauf von einem leeren nicht zu
      // unterscheiden.
      const ergebnis = await service.fuehreAus(true, JETZT);

      expect(ergebnis.uebersprungenOffenerVorgang).toBe(2);
    });
  });

  describe('Audit-Ereignis je Lauf (Q.3, V0048)', () => {
    it('protokolliert die Ausfuehrung -- der Katalogeintrag hatte bis 2026-09-07 keinen Emitter', async () => {
      await service.fuehreAus(true, JETZT);

      expect(append).toHaveBeenCalledTimes(1);
      const envelope = append.mock.calls[0]?.[0] as {
        eventTyp: string;
        actorTyp: string;
        kontext: Record<string, unknown>;
      };
      expect(envelope.eventTyp).toBe('ingest.quarantaene.retention_lauf');
      // Kein Token-Kontext: Der Lauf startet ueber den Runner, nicht ueber HTTP.
      expect(envelope.actorTyp).toBe('system');
      expect(envelope.kontext['modus']).toBe('ausfuehrung');
      expect(envelope.kontext['anzahl_geloescht']).toBe(3);
      expect(envelope.kontext['synthetic']).toBe(true);
    });

    it('haelt die Kontext-Whitelist ein -- keine Kennungen, keine Blind-Indizes, keine Topics', async () => {
      await service.fuehreAus(true, JETZT);

      const envelope = append.mock.calls[0]?.[0] as { kontext: Record<string, unknown> };
      // Ein Loeschprotokoll, das die geloeschten Korrelate auffuehrt, hebt die
      // Loeschung wieder auf.
      expect(Object.keys(envelope.kontext).sort()).toEqual([
        'anzahl_geloescht',
        'anzahl_genullt',
        'modus',
        'stichtag_loeschung',
        'stichtag_nullung',
        'synthetic',
        'uebersprungen_offener_vorgang',
      ]);
    });

    it('protokolliert einen Probelauf NICHT -- er hat nichts veraendert', async () => {
      await service.probelauf(JETZT);

      expect(append).not.toHaveBeenCalled();
    });
  });
});
