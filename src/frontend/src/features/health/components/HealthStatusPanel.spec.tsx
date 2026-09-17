import type { UseQueryResult } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ApiProblemError, LivenessStatus, ReadinessStatus } from '@edms/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../shared/testing/axe';
import { HealthStatusPanel } from './HealthStatusPanel';

// `vi.mock`-Fabriken werden vor Imports gehoisted — `vi.hoisted` macht die
// Mock-Funktionen bereits zu diesem Zeitpunkt referenzierbar.
const { useLivenessMock, useReadinessMock } = vi.hoisted(() => ({
  useLivenessMock: vi.fn(),
  useReadinessMock: vi.fn(),
}));

vi.mock('../api/useLiveness', () => ({ useLiveness: useLivenessMock }));
vi.mock('../api/useReadiness', () => ({ useReadiness: useReadinessMock }));

interface FakeQueryState<TData> {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly isFetching: boolean;
  readonly data?: TData;
  readonly refetch: () => void;
}

/**
 * Baut einen gemockten TanStack-Query-Zustand — die Komponente wird also
 * ausschließlich aus vorgegebenem Query-State gerendert, kein echter
 * QueryClient/Netzwerk nötig (Testing-Library-Unit-Test, .claude/rules/frontend-react.md).
 */
function asQueryResult<TData>(state: FakeQueryState<TData>): UseQueryResult<TData, ApiProblemError> {
  return state as unknown as UseQueryResult<TData, ApiProblemError>;
}

function mockOkState(): void {
  useLivenessMock.mockReturnValue(
    asQueryResult<LivenessStatus>({
      isPending: false,
      isError: false,
      isFetching: false,
      data: { status: 'ok', version: '0.1.0', uptimeSeconds: 1, timestamp: '2026-07-09T10:00:00.000Z' },
      refetch: vi.fn(),
    }),
  );
  useReadinessMock.mockReturnValue(
    asQueryResult<ReadinessStatus>({
      isPending: false,
      isError: false,
      isFetching: false,
      data: {
        status: 'ok',
        checks: { database: { status: 'up', detail: 'ready' } },
        timestamp: '2026-07-09T10:00:00.000Z',
      },
      refetch: vi.fn(),
    }),
  );
}

describe('HealthStatusPanel', () => {
  afterEach(() => {
    useLivenessMock.mockReset();
    useReadinessMock.mockReset();
  });

  it('zeigt "System erreichbar" und "Datenbank bereit" in zwei role="status"-Elementen, wenn beide Prüfungen ok sind', () => {
    mockOkState();

    render(<HealthStatusPanel />);

    expect(screen.getAllByRole('status')).toHaveLength(2);
    expect(screen.getByText('System erreichbar')).toBeInTheDocument();
    expect(screen.getByText('Datenbank bereit')).toBeInTheDocument();
  });

  it('zeigt "Datenbank nicht bereit", wenn die Readiness-Prüfung status "error" liefert', () => {
    useLivenessMock.mockReturnValue(
      asQueryResult<LivenessStatus>({
        isPending: false,
        isError: false,
        isFetching: false,
        data: { status: 'ok', version: '0.1.0', uptimeSeconds: 1, timestamp: '2026-07-09T10:00:00.000Z' },
        refetch: vi.fn(),
      }),
    );
    useReadinessMock.mockReturnValue(
      asQueryResult<ReadinessStatus>({
        isPending: false,
        isError: false,
        isFetching: false,
        data: {
          status: 'error',
          checks: { database: { status: 'down', detail: 'not_ready' } },
          timestamp: '2026-07-09T10:00:00.000Z',
        },
        refetch: vi.fn(),
      }),
    );

    render(<HealthStatusPanel />);

    expect(screen.getByText('Datenbank nicht bereit')).toBeInTheDocument();
  });

  it('hat im ok-Zustand keine erkennbaren axe-Verstöße', async () => {
    mockOkState();

    const { container } = render(<HealthStatusPanel />);

    expect(await runAxe(container)).toEqual([]);
  });
});
