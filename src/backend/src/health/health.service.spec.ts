import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HealthService } from './health.service';

// pg-Pool wird komplett gemockt (Unit-Test-Ebene — echte DB-Anbindung wird in
// health.integration.spec.ts gegen Testcontainers geprüft, .claude/rules/tests.md:
// "keine DB-Mocks für Integration-Tests" gilt hier explizit NICHT, da dies ein
// Unit-Test ist).
const queryMock = vi.fn();
const endMock = vi.fn();
const onMock = vi.fn();

vi.mock('pg', () => ({
  // Implementierung DIREKT an vi.fn(impl) übergeben — nicht via
  // .mockImplementation(): `restoreMocks: true` (vitest.config.ts) setzt vor
  // jedem Test auf die Erstellungs-Implementierung zurück; eine nachträglich
  // gesetzte mockImplementation würde dabei entfernt und `new Pool()` lieferte
  // ein leeres Objekt ohne query/end/on.
  Pool: vi.fn(() => ({
    query: queryMock,
    end: endMock,
    on: onMock,
  })),
}));

describe('HealthService (ADR-0001 §10.7, backend-lead-Votum 3 — DB-Check ausschließlich im Service)', () => {
  let service: HealthService;

  beforeEach(() => {
    queryMock.mockReset();
    endMock.mockReset();
    onMock.mockReset();
    service = new HealthService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getLiveness', () => {
    it('liefert einen statischen ok-Status mit UTC-Zeitstempel (Z-Suffix)', () => {
      const result = service.getLiveness();

      expect(result.status).toBe('ok');
      expect(result.timestamp.endsWith('Z')).toBe(true);
      expect(typeof result.uptimeSeconds).toBe('number');
    });
  });

  describe('checkReadiness', () => {
    it('meldet ready, wenn SELECT 1 gegen PostgreSQL erfolgreich ist', async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });

      const result = await service.checkReadiness();

      expect(result.status).toBe('ok');
      expect(result.checks.database).toEqual({ status: 'up', detail: 'ready' });
      expect(queryMock).toHaveBeenCalledWith('SELECT 1');
    });

    it('meldet not_ready OHNE Durchreichen der Fehlerdetails, wenn die Verbindung fehlschlägt', async () => {
      const rawError = new Error(
        'password authentication failed for user "edms" at host 10.0.5.12:5432',
      );
      queryMock.mockRejectedValueOnce(rawError);

      const result = await service.checkReadiness();

      expect(result.status).toBe('error');
      expect(result.checks.database).toEqual({ status: 'down', detail: 'not_ready' });

      // Regressions-Guard gegen Topologie-/Connection-String-Leak
      // (backend-lead-Finding "hoch", schemas/openapi/health.openapi.yaml):
      // die rohe Fehlermeldung darf in der API-Antwort NIRGENDS auftauchen.
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('10.0.5.12');
      expect(serialized).not.toContain('password authentication failed');
    });
  });

  describe('onModuleDestroy', () => {
    it('schließt den Pool, wenn er zuvor lazy initialisiert wurde', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });
      await service.checkReadiness(); // initialisiert den Pool lazy

      await service.onModuleDestroy();

      expect(endMock).toHaveBeenCalledOnce();
    });

    it('tut nichts, wenn der Pool nie initialisiert wurde (kein Liveness-Check nutzt ihn)', async () => {
      await service.onModuleDestroy();

      expect(endMock).not.toHaveBeenCalled();
    });
  });
});
