import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { HerkunftMappingService } from './herkunft-mapping.service';
import { ensureNoOpTransactionHost } from '../test-support/init-noop-transaction-host';
import type { HerkunftMappingRepository, HerkunftMappingZeile } from '../persistence/ingest/herkunft-mapping.repository';

const ZEILE: HerkunftMappingZeile = {
  id: '018f1e2d-0000-7000-8000-0000000000aa',
  quelleCode: 'netz-a',
  chirpstackTenantId: '7a000000-0000-4000-8000-00000000000a',
  chirpstackApplicationId: 'a9000000-0000-4000-8000-000000000001',
  endkundeId: '018f1e2d-0000-7000-8000-00000000000e',
  standortId: '018f1e2d-0000-7000-8000-000000000051',
  standortTyp: 'gebaeude',
  createdAt: '2026-09-05T12:00:00.000Z',
};

/** Fehler, wie der `pg`-Treiber ihn bei einer Constraint-Verletzung wirft. */
function pgFehler(code: string, constraint: string): Error & { code: string; constraint: string } {
  return Object.assign(new Error('constraint violation'), { code, constraint });
}

describe('HerkunftMappingService (ADR-0011 B2/D3)', () => {
  let insertMock: Mock;
  let deleteMock: Mock;
  let findByIdMock: Mock;
  let service: HerkunftMappingService;

  beforeAll(() => {
    ensureNoOpTransactionHost();
  });

  beforeEach(() => {
    process.env['EDMS_INGEST_QUELLE_CODE'] = 'netz-a';
    insertMock = vi.fn().mockResolvedValue(ZEILE);
    deleteMock = vi.fn().mockResolvedValue(true);
    findByIdMock = vi.fn().mockResolvedValue(ZEILE);

    service = new HerkunftMappingService({
      findAlle: vi.fn().mockResolvedValue([ZEILE]),
      findById: findByIdMock,
      insert: insertMock,
      delete: deleteMock,
    } as unknown as HerkunftMappingRepository);
  });

  it('uebernimmt ohne Angabe die Quellen-Kennung dieses Deployments', async () => {
    // Bei genau einem Netzserver soll sie niemand tippen muessen (D8).
    await service.anlegen({
      chirpstackTenantId: ZEILE.chirpstackTenantId,
      chirpstackApplicationId: ZEILE.chirpstackApplicationId,
      endkundeId: ZEILE.endkundeId,
      standortId: ZEILE.standortId,
    });

    expect((insertMock.mock.calls[0]?.[0] as { quelleCode: string }).quelleCode).toBe('netz-a');
  });

  it('nimmt eine ausdruecklich angegebene Quellen-Kennung vorrangig', async () => {
    await service.anlegen({
      quelleCode: 'netz-b',
      chirpstackTenantId: ZEILE.chirpstackTenantId,
      chirpstackApplicationId: ZEILE.chirpstackApplicationId,
      endkundeId: ZEILE.endkundeId,
      standortId: ZEILE.standortId,
    });

    expect((insertMock.mock.calls[0]?.[0] as { quelleCode: string }).quelleCode).toBe('netz-b');
  });

  describe('Constraint-Verletzungen werden zu brauchbaren Antworten', () => {
    async function anlegenMitFehler(error: Error): Promise<unknown> {
      insertMock.mockRejectedValueOnce(error);
      return service
        .anlegen({
          chirpstackTenantId: ZEILE.chirpstackTenantId,
          chirpstackApplicationId: ZEILE.chirpstackApplicationId,
          endkundeId: ZEILE.endkundeId,
          standortId: ZEILE.standortId,
        })
        .catch((e: unknown) => e);
    }

    it('doppelte Application -> 409 mit Hinweis auf die bestehende Zuordnung', async () => {
      const fehler = await anlegenMitFehler(pgFehler('23505', 'ux_herkunft_mapping_application'));

      expect(fehler).toBeInstanceOf(ConflictException);
      expect((fehler as Error).message).toContain('bereits zugeordnet');
    });

    it('Tenant schon bei anderem Endkunden -> 409, nennt die Ein-Tenant-ein-Endkunde-Regel', async () => {
      const fehler = await anlegenMitFehler(pgFehler('23P01', 'ex_herkunft_mapping_tenant_ein_endkunde'));

      expect(fehler).toBeInstanceOf(ConflictException);
      expect((fehler as Error).message).toContain('ANDEREN Endkunden');
    });

    it('Standort gehoert nicht zum Endkunden -> 400, nennt beide Felder', async () => {
      const fehler = await anlegenMitFehler(pgFehler('23503', 'fk_herkunft_mapping_standort_mandant'));

      expect(fehler).toBeInstanceOf(BadRequestException);
      expect((fehler as Error).message).toContain('standortId');
    });

    it('unbekannter DB-Fehler bleibt ein Fehler — KEINE erfundene 4xx', async () => {
      // Aus einem Fehler unbekannter Ursache eine 4xx zu machen hiesse, dem
      // Aufrufer die Schuld fuer etwas zu geben, das wir nicht verstanden
      // haben.
      const fehler = await anlegenMitFehler(pgFehler('08006', 'egal'));

      expect(fehler).not.toBeInstanceOf(ConflictException);
      expect(fehler).not.toBeInstanceOf(BadRequestException);
      expect(fehler).toBeInstanceOf(Error);
    });
  });

  describe('Entfernen', () => {
    it('liest die Zeile VOR dem Loeschen und gibt sie zurueck', async () => {
      // Der Audit-Kontext (V0043) braucht die Kennungen einer Zeile, die es
      // danach nicht mehr gibt.
      const entfernt = await service.entfernen(ZEILE.id);

      expect(findByIdMock).toHaveBeenCalledWith(ZEILE.id);
      expect(deleteMock).toHaveBeenCalledWith(ZEILE.id);
      expect(entfernt).toEqual(ZEILE);
    });

    it('meldet 404 fuer eine unbekannte Kennung und loescht nichts', async () => {
      findByIdMock.mockResolvedValueOnce(undefined);

      await expect(service.entfernen('018f1e2d-0000-7000-8000-0000000000ff')).rejects.toBeInstanceOf(NotFoundException);
      expect(deleteMock).not.toHaveBeenCalled();
    });
  });
});
