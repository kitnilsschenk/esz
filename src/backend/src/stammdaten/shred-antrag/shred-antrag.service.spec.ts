import { ForbiddenException } from '@nestjs/common';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ShredAntragService } from './shred-antrag.service';
import { ProblemDetailsException } from '../../common/exceptions/problem-details.exception';
import { ensureNoOpTransactionHost } from '../test-support/init-noop-transaction-host';
import type { EnergyEndkundeShredAntragRepository, ShredAntrag } from '../persistence/energy/energy-endkunde-shred-antrag.repository';
import type { EnergyEndkundeRepository, Endkunde } from '../persistence/energy/energy-endkunde.repository';
import type { EndkundeService } from '../endkunde/endkunde.service';
import type { ShreddingErgebnis } from '../endkunde/endkunde.types';
import type { AuditService } from '../../audit/audit.service';
import { STAMMDATEN_EVENT_CODES } from '../audit/stammdaten-audit-events';
import type { SecurityContext } from '../../common/security/security-context';

function antragsteller(): SecurityContext {
  return { sub: 'antragsteller-sub', actorTyp: 'benutzer', roles: ['betrieb'], azp: 'edms-bff' };
}

function zweitePerson(): SecurityContext {
  return { sub: 'zweite-person-sub', actorTyp: 'benutzer', roles: ['betrieb'], azp: 'edms-bff' };
}

function endkunde(overrides: Partial<Endkunde> = {}): Endkunde {
  return {
    id: 'endkunde-1',
    verarbeitungsStatus: 'aktiv',
    consentStatus: 'fehlt',
    consentTextVersion: null,
    vonWissAuswertungAusgenommen: false,
    endkundengruppe: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function shredAntrag(overrides: Partial<ShredAntrag> = {}): ShredAntrag {
  return {
    id: 'antrag-1',
    endkundeId: 'endkunde-1',
    grund: 'betroffenenantrag_art17',
    beantragtVonSub: 'antragsteller-sub',
    beantragtAm: '2026-07-15T00:00:00.000Z',
    freigeberSub: null,
    entschiedenAm: null,
    status: 'beantragt',
    ablehnungsgrund: null,
    gueltigBis: '2026-07-22T00:00:00.000Z',
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
    ...overrides,
  };
}

function shredding(): ShreddingErgebnis {
  return {
    id: 'endkunde-1',
    verarbeitungsStatus: 'geloescht',
    geschreddert: true,
    standortPiiNeutralisiert: 0,
    analyticsLaeufeUnveraendert: 0,
    einflussIntervalleUnveraendert: 0,
  };
}

interface InsertInput {
  readonly id: string;
  readonly endkundeId: string;
  readonly grund: string;
  readonly beantragtVonSub: string;
  readonly gueltigBis: string;
}

/**
 * Die einzelnen `vi.fn()`-Instanzen werden HIER, als lokale, NICHT auf den
 * Klassentyp gebundene Konstanten, erzeugt und zurückgegeben — Zugriffe wie
 * `expect(shredAntragRepo.insert)`/`vi.mocked(shredAntragRepo.freigeben)`
 * lösen sonst `@typescript-eslint/unbound-method` aus (die Repository-
 * Klassen deklarieren reguläre Methoden, keine Arrow-Klassenfelder wie
 * `AuditService.append`, s. dortigen Kommentar). Tests greifen ausschließlich
 * über dieses `mocks`-Objekt auf die einzelnen Spione zu.
 */
interface Mocks {
  readonly service: ShredAntragService;
  readonly mocks: {
    readonly findById: ReturnType<typeof vi.fn>;
    readonly findOffenByEndkunde: ReturnType<typeof vi.fn>;
    readonly insert: ReturnType<typeof vi.fn>;
    readonly freigeben: ReturnType<typeof vi.fn>;
    readonly markAusgefuehrt: ReturnType<typeof vi.fn>;
    readonly ablehnen: ReturnType<typeof vi.fn>;
    readonly endkundeFindById: ReturnType<typeof vi.fn>;
    readonly shred: ReturnType<typeof vi.fn>;
    readonly append: ReturnType<typeof vi.fn>;
  };
}

function createService(overrides: {
  endkunde?: Endkunde | undefined;
  antrag?: ShredAntrag | undefined;
  offenerAntrag?: ShredAntrag | undefined;
}): Mocks {
  const findById = vi.fn(() => Promise.resolve(overrides.antrag));
  const findOffenByEndkunde = vi.fn(() => Promise.resolve(overrides.offenerAntrag));
  const listPage = vi.fn(() => Promise.resolve([]));
  const insert = vi.fn((input: InsertInput) =>
    Promise.resolve(
      shredAntrag({
        id: input.id,
        endkundeId: input.endkundeId,
        grund: input.grund,
        beantragtVonSub: input.beantragtVonSub,
        gueltigBis: input.gueltigBis,
      }),
    ),
  );
  const freigeben = vi.fn(() => Promise.resolve(shredAntrag({ status: 'freigegeben', freigeberSub: 'zweite-person-sub' })));
  const markAusgefuehrt = vi.fn(() => Promise.resolve(shredAntrag({ status: 'ausgefuehrt', freigeberSub: 'zweite-person-sub' })));
  const ablehnen = vi.fn(() =>
    Promise.resolve(shredAntrag({ status: 'abgelehnt', freigeberSub: 'zweite-person-sub', ablehnungsgrund: 'sonstiges' })),
  );

  const shredAntragRepo = {
    findById,
    findOffenByEndkunde,
    listPage,
    insert,
    freigeben,
    markAusgefuehrt,
    ablehnen,
  } as unknown as EnergyEndkundeShredAntragRepository;

  const endkundeFindById = vi.fn(() => Promise.resolve(overrides.endkunde));
  const endkundeRepo = { findById: endkundeFindById } as unknown as EnergyEndkundeRepository;

  const shred = vi.fn(() => Promise.resolve(shredding()));
  const endkundeService = { shred } as unknown as EndkundeService;

  const append = vi.fn(() =>
    Promise.resolve({ eventId: 'evt-1', lane: 0, tagUtc: '2026-07-15', seq: '1', ts: '2026-07-15T00:00:00.000Z', eventTyp: 'x', ergebnis: 'ok' as const }),
  );
  const auditService = { append } as unknown as AuditService;

  const service = new ShredAntragService(shredAntragRepo, endkundeRepo, endkundeService, auditService);
  return {
    service,
    mocks: { findById, findOffenByEndkunde, insert, freigeben, markAusgefuehrt, ablehnen, endkundeFindById, shred, append },
  };
}

describe('ShredAntragService (ADR-0009 — Vier-Augen-Krypto-Shredding-Workflow)', () => {
  beforeAll(() => {
    ensureNoOpTransactionHost();
  });

  describe('beantragen()', () => {
    it('wirft 404, wenn der Endkunde nicht existiert', async () => {
      const { service } = createService({ endkunde: undefined });

      await expect(
        service.beantragen('endkunde-1', { bestaetigung: 'ENDGUELTIG_LOESCHEN', grund: 'betroffenenantrag_art17' }, antragsteller()),
      ).rejects.toBeInstanceOf(ProblemDetailsException);
    });

    it('legt einen neuen Antrag an, wenn kein offener Antrag existiert', async () => {
      const { service, mocks } = createService({ endkunde: endkunde(), offenerAntrag: undefined });

      const result = await service.beantragen(
        'endkunde-1',
        { bestaetigung: 'ENDGUELTIG_LOESCHEN', grund: 'betroffenenantrag_art17' },
        antragsteller(),
      );

      expect(result.status).toBe('beantragt');
      expect(result.grund).toBe('betroffenenantrag_art17');
      expect(mocks.insert).toHaveBeenCalledTimes(1);
    });

    it('Idempotency-Replay: derselbe Antragsteller bei bereits offenem Antrag -> liefert den bestehenden Antrag, KEIN neuer Insert', async () => {
      const bestehend = shredAntrag({ beantragtVonSub: 'antragsteller-sub' });
      const { service, mocks } = createService({ endkunde: endkunde(), offenerAntrag: bestehend });

      const result = await service.beantragen(
        'endkunde-1',
        { bestaetigung: 'ENDGUELTIG_LOESCHEN', grund: 'betroffenenantrag_art17' },
        antragsteller(),
      );

      expect(result.id).toBe(bestehend.id);
      expect(mocks.insert).not.toHaveBeenCalled();
    });

    it('Ein ANDERER Antragsteller bei bereits offenem Antrag -> 409 Konflikt (hoechstens ein offener Antrag je Endkunde)', async () => {
      const bestehend = shredAntrag({ beantragtVonSub: 'jemand-anderes-sub' });
      const { service, mocks } = createService({ endkunde: endkunde(), offenerAntrag: bestehend });

      await expect(
        service.beantragen('endkunde-1', { bestaetigung: 'ENDGUELTIG_LOESCHEN', grund: 'betroffenenantrag_art17' }, antragsteller()),
      ).rejects.toBeInstanceOf(ProblemDetailsException);
      expect(mocks.insert).not.toHaveBeenCalled();
    });
  });

  describe('freigeben() — Antrag-Scoping (404)', () => {
    it('wirft 404, wenn der Antrag nicht existiert', async () => {
      const { service } = createService({ antrag: undefined });

      await expect(service.freigeben('endkunde-1', 'antrag-1', zweitePerson())).rejects.toBeInstanceOf(ProblemDetailsException);
    });

    it('wirft 404, wenn der Antrag zu einem ANDEREN Endkunden gehoert (antrag.endkundeId != Pfad-endkundeId)', async () => {
      const { service } = createService({ antrag: shredAntrag({ endkundeId: 'anderer-endkunde' }) });

      await expect(service.freigeben('endkunde-1', 'antrag-1', zweitePerson())).rejects.toBeInstanceOf(ProblemDetailsException);
    });
  });

  describe('freigeben() — Selbst-Freigabe verboten (ADR-0009 §2.2, Fail-closed-Backstop)', () => {
    it('wirft ForbiddenException(vier_augen_selbstfreigabe_verboten), wenn Antragsteller === Freigeber', async () => {
      const { service, mocks } = createService({
        antrag: shredAntrag({ beantragtVonSub: 'antragsteller-sub' }),
      });

      await expect(service.freigeben('endkunde-1', 'antrag-1', antragsteller())).rejects.toMatchObject({
        message: 'vier_augen_selbstfreigabe_verboten',
      });
      expect(mocks.freigeben).not.toHaveBeenCalled();
    });

    it('ist eine echte ForbiddenException-Instanz (403)', async () => {
      const { service } = createService({ antrag: shredAntrag({ beantragtVonSub: 'antragsteller-sub' }) });

      await expect(service.freigeben('endkunde-1', 'antrag-1', antragsteller())).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('freigeben() — TOCTOU (ADR-0009 §2.1/§6): zwei parallele Freigaben, nur eine wirkt', () => {
    it('die ZWEITE Freigabe auf denselben Antrag (0 Zeilen betroffen) -> 409, NICHT stillschweigend uebernommen', async () => {
      const { service, mocks } = createService({
        antrag: shredAntrag({ beantragtVonSub: 'antragsteller-sub', status: 'beantragt' }),
      });
      // Simuliert den DB-seitigen Affected-Rows-Check: der ERSTE parallele
      // Freigabe-Versuch gewinnt (RETURNING liefert die Zeile), der ZWEITE
      // (bereits woanders entschieden) liefert 0 Zeilen (`undefined`).
      mocks.freigeben
        .mockResolvedValueOnce(shredAntrag({ status: 'freigegeben', freigeberSub: 'zweite-person-sub' }))
        .mockResolvedValueOnce(undefined);

      const erste = await service.freigeben('endkunde-1', 'antrag-1', zweitePerson());
      expect(erste.antrag.status).toBe('ausgefuehrt');

      await expect(service.freigeben('endkunde-1', 'antrag-1', zweitePerson())).rejects.toBeInstanceOf(ProblemDetailsException);
    });
  });

  describe('freigeben() — Audit-Ordering (ADR-0009 §2.3 Finding P2): shred_freigegeben VOR geschreddert', () => {
    it('ruft AuditService.append() in der Reihenfolge shred_freigegeben, DANN (nach dem Shred-Aufruf) geschreddert auf', async () => {
      const { service, mocks } = createService({
        antrag: shredAntrag({ beantragtVonSub: 'antragsteller-sub', status: 'beantragt' }),
      });

      await service.freigeben('endkunde-1', 'antrag-1', zweitePerson());

      expect(mocks.append).toHaveBeenCalledTimes(2);
      expect(mocks.append.mock.calls[0]?.[0]).toMatchObject({ eventTyp: STAMMDATEN_EVENT_CODES.SHRED_FREIGEGEBEN });
      expect(mocks.append.mock.calls[1]?.[0]).toMatchObject({ eventTyp: STAMMDATEN_EVENT_CODES.ENDKUNDE_GESCHREDDERT });

      // Reihenfolge ueber Mock-Aufrufindizes hinweg: shred_freigegeben (append
      // #1) -> shred() -> markAusgefuehrt() -> geschreddert (append #2).
      expect(mocks.append.mock.invocationCallOrder[0]).toBeLessThan(mocks.shred.mock.invocationCallOrder[0] ?? Infinity);
      expect(mocks.shred.mock.invocationCallOrder[0]).toBeLessThan(mocks.markAusgefuehrt.mock.invocationCallOrder[0] ?? Infinity);
      expect(mocks.markAusgefuehrt.mock.invocationCallOrder[0]).toBeLessThan(mocks.append.mock.invocationCallOrder[1] ?? Infinity);
    });

    it('beide Audit-Eintraege tragen kontext.antrag_id + kontext.synthetic=true und objektRef=endkundeId', async () => {
      const { service, mocks } = createService({
        antrag: shredAntrag({ beantragtVonSub: 'antragsteller-sub', status: 'beantragt' }),
      });

      await service.freigeben('endkunde-1', 'antrag-1', zweitePerson());

      for (const call of mocks.append.mock.calls) {
        expect(call[0]).toMatchObject({ objektRef: 'endkunde-1', kontext: { synthetic: true, antrag_id: 'antrag-1' } });
      }
    });
  });

  describe('freigeben() — sonstiger ungueltiger Uebergang (409)', () => {
    it('wirft 409, wenn freigeben() 0 Zeilen liefert (Antrag bereits entschieden/abgelaufen)', async () => {
      const { service, mocks } = createService({
        antrag: shredAntrag({ beantragtVonSub: 'antragsteller-sub', status: 'beantragt' }),
      });
      mocks.freigeben.mockResolvedValueOnce(undefined);

      await expect(service.freigeben('endkunde-1', 'antrag-1', zweitePerson())).rejects.toBeInstanceOf(ProblemDetailsException);
    });
  });

  describe('ablehnen()', () => {
    it('lehnt einen offenen Antrag ab (Happy Path)', async () => {
      const { service } = createService({ antrag: shredAntrag({ beantragtVonSub: 'antragsteller-sub' }) });

      const result = await service.ablehnen('endkunde-1', 'antrag-1', { ablehnungsgrund: 'sonstiges' }, zweitePerson());

      expect(result.status).toBe('abgelehnt');
      expect(result.ablehnungsgrund).toBe('sonstiges');
    });

    it('wirft 404 bei Antrag-Scoping-Mismatch', async () => {
      const { service } = createService({ antrag: shredAntrag({ endkundeId: 'anderer-endkunde' }) });

      await expect(
        service.ablehnen('endkunde-1', 'antrag-1', { ablehnungsgrund: 'sonstiges' }, zweitePerson()),
      ).rejects.toBeInstanceOf(ProblemDetailsException);
    });

    it('wirft ForbiddenException bei Selbst-Ablehnung (Vier-Augen gilt auch fuer Ablehnen)', async () => {
      const { service } = createService({ antrag: shredAntrag({ beantragtVonSub: 'antragsteller-sub' }) });

      await expect(
        service.ablehnen('endkunde-1', 'antrag-1', { ablehnungsgrund: 'sonstiges' }, antragsteller()),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('wirft 409, wenn ablehnen() 0 Zeilen liefert (bereits entschieden/abgelaufen)', async () => {
      const { service, mocks } = createService({ antrag: shredAntrag({ beantragtVonSub: 'antragsteller-sub' }) });
      mocks.ablehnen.mockResolvedValueOnce(undefined);

      await expect(
        service.ablehnen('endkunde-1', 'antrag-1', { ablehnungsgrund: 'sonstiges' }, zweitePerson()),
      ).rejects.toBeInstanceOf(ProblemDetailsException);
    });
  });

  describe('liste()', () => {
    it('wirft 404, wenn der Endkunde nicht existiert', async () => {
      const { service } = createService({ endkunde: undefined });

      await expect(service.liste('unbekannt', { limit: 50 })).rejects.toBeInstanceOf(ProblemDetailsException);
    });
  });
});
