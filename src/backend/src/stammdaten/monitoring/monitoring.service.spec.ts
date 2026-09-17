import { describe, expect, it, vi } from 'vitest';
import { MonitoringService } from './monitoring.service';
import type { EnergyMonitoringRepository, VollstaendigkeitEintrag } from '../persistence/energy/energy-monitoring.repository';

/**
 * Unit-Tests (Repo-Fake, KEIN echter DB-Zugriff, Muster
 * `endkunde.service.spec.ts`) für `MonitoringService` — schließt die
 * Merge-Blocker-Lücke aus dem Phase-4-Review (`.claude/rules/tests.md`).
 * Deckt insbesondere ab, dass die Antwort AUSSCHLIESSLICH Lücken-Metadaten
 * enthält (§6.5, DE-02) — kein PII-/Verbrauchsfeld.
 */

function eintrag(overrides: Partial<VollstaendigkeitEintrag> = {}): VollstaendigkeitEintrag {
  return {
    endkundeId: 'endkunde-1',
    ebene: 'endkunde',
    luecken: ['kein_messkonzept'],
    createdAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function createService(rows: readonly VollstaendigkeitEintrag[]): {
  service: MonitoringService;
  monitoringRepo: EnergyMonitoringRepository;
  // Eigenstaendige `vi.fn()`-Referenz statt
  // `monitoringRepo.listVollstaendigkeit` (`@typescript-eslint/unbound-method`
  // — eine ueber die Interface-typisierte Instanz referenzierte Methode gilt
  // lint-seitig als potenziell an `this` gebunden; eine separat gehaltene
  // Mock-Funktion hat diesen Typ nicht).
  listVollstaendigkeitMock: ReturnType<typeof vi.fn>;
} {
  const listVollstaendigkeitMock = vi.fn(() => Promise.resolve([...rows]));
  const monitoringRepo = {
    listVollstaendigkeit: listVollstaendigkeitMock,
  } as unknown as EnergyMonitoringRepository;

  return { service: new MonitoringService(monitoringRepo), monitoringRepo, listVollstaendigkeitMock };
}

describe('MonitoringService (ADR-0008 §6.5/§13, DE-02 — Metadaten-only)', () => {
  it('vollstaendigkeit(): reicht cursor/limit/endkundeId/nurMitLuecken unveraendert an das Repository durch', async () => {
    const { service, listVollstaendigkeitMock } = createService([]);

    await service.vollstaendigkeit({ limit: 25, endkundeId: 'endkunde-1', nurMitLuecken: true, cursor: 'irgendein-cursor' });

    expect(listVollstaendigkeitMock).toHaveBeenCalledWith({
      limit: 25,
      endkundeId: 'endkunde-1',
      nurMitLuecken: true,
      cursor: 'irgendein-cursor',
    });
  });

  it('vollstaendigkeit(): mappt jede Zeile auf ebene=endkunde mit systemId/zaehlerId=null (v1-Scope, Endkunde-Rollup)', async () => {
    const { service } = createService([eintrag()]);

    const result = await service.vollstaendigkeit({ limit: 50, nurMitLuecken: true });

    expect(result.daten).toEqual([
      { endkundeId: 'endkunde-1', systemId: null, zaehlerId: null, ebene: 'endkunde', luecken: ['kein_messkonzept'], geprueftAm: '2026-07-01T00:00:00.000Z' },
    ]);
  });

  it('vollstaendigkeit(): die Antwort enthaelt AUSSCHLIESSLICH die Whitelist-Felder — kein PII-/Verbrauchsfeld (§6.5)', async () => {
    const { service } = createService([eintrag({ luecken: ['kein_zaehler', 'kein_aktiver_consent'] })]);

    const result = await service.vollstaendigkeit({ limit: 50, nurMitLuecken: true });

    const item = result.daten[0];
    expect(item).toBeDefined();
    expect(Object.keys(item as object).sort()).toEqual(
      ['endkundeId', 'ebene', 'geprueftAm', 'luecken', 'systemId', 'zaehlerId'].sort(),
    );
  });

  it('vollstaendigkeit(): liefert eine leere Seite, wenn keine Luecken-Eintraege vorliegen', async () => {
    const { service } = createService([]);

    const result = await service.vollstaendigkeit({ limit: 50, nurMitLuecken: true });

    expect(result.daten).toEqual([]);
    expect(result.seite.naechsterCursor).toBeNull();
  });

  it('vollstaendigkeit(): liefert einen naechsterCursor, wenn mehr Zeilen vorliegen als limit (Look-ahead-Muster)', async () => {
    const rows = [
      eintrag({ endkundeId: 'endkunde-1', createdAt: '2026-07-01T00:00:00.000Z' }),
      eintrag({ endkundeId: 'endkunde-2', createdAt: '2026-07-02T00:00:00.000Z' }),
    ];
    const { service } = createService(rows);

    const result = await service.vollstaendigkeit({ limit: 1, nurMitLuecken: true });

    expect(result.daten).toHaveLength(1);
    expect(result.seite.naechsterCursor).not.toBeNull();
  });
});
