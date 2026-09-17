import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { WiderspruchService, type WiderspruchErklaerenInput } from './widerspruch.service';
import { ensureNoOpTransactionHost } from '../stammdaten/test-support/init-noop-transaction-host';
import type { WiderspruchRepository } from './persistence/widerspruch.repository';
import type { ConsentRepository } from './persistence/consent.repository';
import type { WiderspruchItem, ZweckSubjektRegel } from './consent.types';
import { FieldCipherService } from '../common/crypto/field-cipher.service';

const ENDKUNDE_ID = '018f1e2d-0000-7000-8000-0000000000a1';
const WIDERSPRUCH_ID = '018f1e2d-0000-7000-8000-0000000000b2';

const MATRIX: ZweckSubjektRegel[] = [
  {
    zweckCode: 'nutzerinformation',
    subjektTyp: 'endkunde',
    rechtsgrundlage: 'vertrag_art6_1b',
    erlaubnismodus: 'opt_out',
    verweigerbar: false,
    begruendung: 'TB-06: geschuldete Leistung mit Opt-out.',
  },
  {
    zweckCode: 'geraeteerkennung',
    subjektTyp: 'endkunde',
    rechtsgrundlage: 'einwilligung_art6_1a',
    erlaubnismodus: 'opt_in',
    verweigerbar: true,
    begruendung: 'Zusaetzlich, freiwillig.',
  },
  {
    zweckCode: 'wiss_auswertung',
    subjektTyp: 'endkunde',
    rechtsgrundlage: 'vertrag_art6_1b',
    erlaubnismodus: 'opt_out',
    verweigerbar: false,
    begruendung: 'DE-04 ist als Opt-out konstruiert.',
  },
];

function widerspruch(overrides: Partial<WiderspruchItem> = {}): WiderspruchItem {
  return {
    id: WIDERSPRUCH_ID,
    subjektTyp: 'endkunde',
    subjektId: ENDKUNDE_ID,
    zweckCode: 'nutzerinformation',
    erlaubnismodus: 'opt_out',
    erklaertAt: '2026-09-01T10:00:00.000Z',
    erfassungsweg: 'vertrag_schriftlich',
    quelleRef: 'AZ-2026-0815',
    zurueckgenommenAt: null,
    ruecknahmeErfassungsweg: null,
    ruecknahmeQuelleRef: null,
    wirksam: true,
    ...overrides,
  };
}

describe('WiderspruchService (AW-27)', () => {
  let insert: Mock;
  let findFuerSubjekt: Mock;
  let findById: Mock;
  let nimmZurueck: Mock;
  let setzeAttribut: Mock;
  let subjektExistiert: Mock;
  let belegInsert: Mock;
  let findPii: Mock;
  let findSchluessel: Mock;
  let service: WiderspruchService;

  beforeAll(() => {
    ensureNoOpTransactionHost();
  });

  beforeEach(() => {
    insert = vi.fn().mockResolvedValue(undefined);
    findFuerSubjekt = vi.fn().mockResolvedValue([]);
    findById = vi.fn().mockResolvedValue(widerspruch());
    nimmZurueck = vi.fn().mockResolvedValue(true);
    setzeAttribut = vi.fn().mockResolvedValue(undefined);
    subjektExistiert = vi.fn().mockResolvedValue(true);
    belegInsert = vi.fn().mockResolvedValue(undefined);
    findPii = vi.fn().mockResolvedValue({ cryptoKeyId: 'key-1' });
    findSchluessel = vi
      .fn()
      .mockResolvedValue({ keyState: 'aktiv', wrappedDek: Buffer.alloc(1), kmsKeyId: 'kms', algVersion: 1 });

    service = new WiderspruchService(
      {
        insert,
        findFuerSubjekt,
        findById,
        nimmZurueck,
        setzeWissAuswertungAusgenommen: setzeAttribut,
        subjektExistiert,
      } as unknown as WiderspruchRepository,
      { findMatrixFuerSubjektTyp: vi.fn().mockResolvedValue(MATRIX) } as unknown as ConsentRepository,
      // Die vier Bausteine des DIGITALEN Wegs. Diese Datei prueft die
      // Betriebssicht — dort werden sie nie erreicht (`pruefeErfassungsweg`
      // weist `digital_opt_in` vorher ab). Sie stehen als Attrappen da, weil
      // der Konstruktor sie verlangt; der digitale Pfad hat seinen eigenen
      // Test (`portal.integration.spec.ts`) mit echter Verschluesselung.
      { insert: belegInsert } as never,
      { findByPseudonymId: findPii } as never,
      { findById: findSchluessel } as never,
      new FieldCipherService(),
      { unwrapDek: vi.fn().mockResolvedValue(Buffer.alloc(32)) } as never,
    );
  });

  function erklaeren(overrides: Partial<WiderspruchErklaerenInput> = {}): Promise<WiderspruchItem> {
    return service.erklaere({
      subjektTyp: 'endkunde',
      subjektId: ENDKUNDE_ID,
      zweckCode: 'nutzerinformation',
      erklaertAt: '2026-09-01T10:00:00.000Z',
      erfassungsweg: 'vertrag_schriftlich',
      quelleRef: 'AZ-2026-0815',
      ...overrides,
    });
  }

  describe('die Luecke, die AW-27 schliesst', () => {
    it('erfasst einen Widerspruch gegen die monatliche Nutzerinformation', async () => {
      // Bis 2026-09-07 gab es dafuer keinen Weg: Der Widerruf ist bei einer
      // vertraglichen Grundlage gesperrt (V0047), und das Gegenstueck fehlte.
      const ergebnis = await erklaeren();

      expect(insert).toHaveBeenCalledTimes(1);
      expect(ergebnis.wirksam).toBe(true);
    });

    it('nimmt den Erlaubnismodus aus der Matrix — der Aufrufer waehlt ihn nicht', async () => {
      await erklaeren();

      const eingabe = insert.mock.calls[0]?.[0] as { erlaubnismodus: string };
      expect(eingabe.erlaubnismodus).toBe('opt_out');
    });
  });

  describe('Widerspruch und Widerruf sind nicht dasselbe', () => {
    it('lehnt einen Widerspruch gegen einen Opt-in-Zweck ab und nennt den richtigen Weg', async () => {
      const fehler = await erklaeren({ zweckCode: 'geraeteerkennung' }).catch((e: unknown) => e);

      expect(fehler).toBeInstanceOf(BadRequestException);
      expect((fehler as Error).message).toContain('widerruft');
      expect((fehler as Error).message).toContain('/consent/einwilligungen');
      expect(insert).not.toHaveBeenCalled();
    });

    it('lehnt einen Zweck ab, den es fuer diese Subjektart nicht gibt', async () => {
      await expect(erklaeren({ zweckCode: 'gibt_es_nicht' })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('Wirkung auf das DE-04-Attribut', () => {
    it('setzt das Attribut bei wiss_auswertung', async () => {
      await erklaeren({ zweckCode: 'wiss_auswertung' });

      expect(setzeAttribut).toHaveBeenCalledWith('endkunde', ENDKUNDE_ID, true);
    });

    it('laesst das Attribut bei anderen Zwecken unberuehrt', async () => {
      await erklaeren();

      expect(setzeAttribut).not.toHaveBeenCalled();
    });

    it('setzt es bei der Ruecknahme zurueck', async () => {
      findById.mockResolvedValue(widerspruch({ zweckCode: 'wiss_auswertung' }));

      await service.nimmZurueck(WIDERSPRUCH_ID, {
        zurueckgenommenAt: '2026-09-05T10:00:00.000Z',
        erfassungsweg: 'vertrag_schriftlich',
        quelleRef: 'AZ-2026-0900',
      });

      expect(setzeAttribut).toHaveBeenCalledWith('endkunde', ENDKUNDE_ID, false);
    });
  });

  describe('Erfassungsweg', () => {
    it('lehnt ein digitales Opt-in ueber die Betriebssicht ab', async () => {
      await expect(erklaeren({ erfassungsweg: 'digital_opt_in' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('lehnt den gesperrten Weg uebernahme_altbestand ab (AW-20)', async () => {
      const fehler = await erklaeren({ erfassungsweg: 'uebernahme_altbestand' }).catch((e: unknown) => e);

      expect((fehler as Error).message).toContain('gesperrt');
    });
  });

  describe('Zeitpunkte', () => {
    it('lehnt einen Erklaerungszeitpunkt in der Zukunft ab', async () => {
      const morgen = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      await expect(erklaeren({ erklaertAt: morgen })).rejects.toThrow(/Zukunft/);
    });

    it('lehnt eine Ruecknahme vor der Erklaerung ab', async () => {
      await expect(
        service.nimmZurueck(WIDERSPRUCH_ID, {
          zurueckgenommenAt: '2026-08-01T10:00:00.000Z',
          erfassungsweg: 'vertrag_schriftlich',
          quelleRef: 'AZ-1',
        }),
      ).rejects.toThrow(/nicht vor der Erklaerung/);
    });
  });

  describe('Doppelte Vorgaenge', () => {
    it('lehnt einen zweiten wirksamen Widerspruch zum selben Zweck ab', async () => {
      findFuerSubjekt.mockResolvedValue([widerspruch()]);

      const fehler = await erklaeren().catch((e: unknown) => e);

      expect(fehler).toBeInstanceOf(ConflictException);
      expect(insert).not.toHaveBeenCalled();
    });

    it('lehnt eine zweite Ruecknahme ab und laesst den ersten Zeitpunkt stehen', async () => {
      findById.mockResolvedValue(
        widerspruch({ zurueckgenommenAt: '2026-09-03T10:00:00.000Z', wirksam: false }),
      );

      const fehler = await service
        .nimmZurueck(WIDERSPRUCH_ID, {
          zurueckgenommenAt: '2026-09-05T10:00:00.000Z',
          erfassungsweg: 'vertrag_schriftlich',
          quelleRef: 'AZ-1',
        })
        .catch((e: unknown) => e);

      expect(fehler).toBeInstanceOf(ConflictException);
      expect(nimmZurueck).not.toHaveBeenCalled();
    });

    it('meldet einen unbekannten Widerspruch als nicht gefunden', async () => {
      findById.mockResolvedValue(undefined);

      await expect(
        service.nimmZurueck(WIDERSPRUCH_ID, {
          zurueckgenommenAt: '2026-09-05T10:00:00.000Z',
          erfassungsweg: 'vertrag_schriftlich',
          quelleRef: 'AZ-1',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('verlangt ein existierendes Subjekt', async () => {
    subjektExistiert.mockResolvedValue(false);

    await expect(erklaeren()).rejects.toBeInstanceOf(NotFoundException);
  });
});
