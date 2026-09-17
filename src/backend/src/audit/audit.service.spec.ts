import { describe, expect, it, vi } from 'vitest';
import type { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { AuditEnvelopeValidationError, AuditService } from './audit.service';

function createTxHostMock(rows: readonly unknown[]): {
  txHost: TransactionHost<TransactionalAdapterTypeOrm>;
  query: ReturnType<typeof vi.fn>;
} {
  const query = vi.fn(() => Promise.resolve(rows));
  const txHost = { tx: { query } } as unknown as TransactionHost<TransactionalAdapterTypeOrm>;
  return { txHost, query };
}

describe('AuditService (ADR-0003 §17.1, ADR-0002 §15)', () => {
  it('ruft audit.append_event(...) über den ambienten EntityManager mit GENAU EINEM Aufruf auf', async () => {
    const row = {
      event_id: 'e1',
      lane: 3,
      tag_utc: '2026-07-13',
      seq: '1',
      ts: '2026-07-13T10:00:00.000Z',
      event_typ: 'test.objekt.erstellt',
      ergebnis: 'ok',
    };
    const { txHost, query } = createTxHostMock([row]);
    const service = new AuditService(txHost);

    const result = await service.append({
      eventTyp: 'test.objekt.erstellt',
      actorTyp: 'benutzer',
      ergebnis: 'ok',
      actorSub: 'sub-1',
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith('SELECT * FROM audit.append_event($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)', [
      'test.objekt.erstellt',
      'benutzer',
      'ok',
      'sub-1',
      null,
      null,
      '{}',
      null,
      null,
      1,
    ]);
    expect(result).toEqual({
      eventId: 'e1',
      lane: 3,
      tagUtc: '2026-07-13',
      seq: '1',
      ts: '2026-07-13T10:00:00.000Z',
      eventTyp: 'test.objekt.erstellt',
      ergebnis: 'ok',
    });
  });

  it('serialisiert kontext als JSON', async () => {
    const row = {
      event_id: 'e2',
      lane: 1,
      tag_utc: '2026-07-13',
      seq: '2',
      ts: '2026-07-13T10:00:01.000Z',
      event_typ: 'authz.zugriff.verweigert',
      ergebnis: 'denied',
    };
    const { txHost, query } = createTxHostMock([row]);
    const service = new AuditService(txHost);

    await service.append({
      eventTyp: 'authz.zugriff.verweigert',
      actorTyp: 'system',
      ergebnis: 'denied',
      kontext: { grund: 'rolle_fehlt' },
    });

    expect(query).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining(['{"grund":"rolle_fehlt"}']));
  });

  it('wirft AuditEnvelopeValidationError bei verschachteltem kontext, OHNE die DB aufzurufen (Defense-in-Depth)', async () => {
    const { txHost, query } = createTxHostMock([]);
    const service = new AuditService(txHost);

    await expect(
      service.append({
        eventTyp: 'test.objekt.erstellt',
        actorTyp: 'benutzer',
        ergebnis: 'ok',
        kontext: { verschachtelt: { a: 1 } as unknown as string },
      }),
    ).rejects.toBeInstanceOf(AuditEnvelopeValidationError);
    expect(query).not.toHaveBeenCalled();
  });

  it('wirft AuditEnvelopeValidationError bei unbekanntem actorTyp', async () => {
    const { txHost } = createTxHostMock([]);
    const service = new AuditService(txHost);

    await expect(
      service.append({
        eventTyp: 'test.objekt.erstellt',
        actorTyp: 'unbekannt' as never,
        ergebnis: 'ok',
      }),
    ).rejects.toBeInstanceOf(AuditEnvelopeValidationError);
  });

  it('wirft, wenn append_event(...) unerwartet keine Zeile liefert', async () => {
    const { txHost } = createTxHostMock([]);
    const service = new AuditService(txHost);

    await expect(
      service.append({ eventTyp: 'test.objekt.erstellt', actorTyp: 'benutzer', ergebnis: 'ok' }),
    ).rejects.toThrow(/keine Zeile/);
  });
});
