import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../shared/testing/axe';
import { HealthAmpel } from './HealthAmpel';

const { useHealthStatusViewMock } = vi.hoisted(() => ({ useHealthStatusViewMock: vi.fn() }));

vi.mock('../hooks/useHealthStatusView', () => ({ useHealthStatusView: useHealthStatusViewMock }));

function mockView(livenessTone: 'pending' | 'ok' | 'error', readinessTone: 'pending' | 'ok' | 'error'): void {
  useHealthStatusViewMock.mockReturnValue({
    liveness: { label: 'Erreichbarkeit', message: 'System erreichbar', tone: livenessTone },
    readiness: { label: 'Bereitschaft', message: 'Datenbank bereit', tone: readinessTone },
    isRefreshing: false,
    refresh: vi.fn(),
  });
}

describe('HealthAmpel', () => {
  afterEach(() => {
    useHealthStatusViewMock.mockReset();
  });

  it('verlinkt auf `/verwaltung/systemstatus` — Health bleibt für jede Rolle über den Ampel-Punkt erreichbar', () => {
    mockView('ok', 'ok');

    render(
      <MemoryRouter>
        <HealthAmpel />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link')).toHaveAttribute('href', '/verwaltung/systemstatus');
  });

  it('trägt eine sprechende `aria-label`, die BEIDE Teilstatus zusammenfasst', () => {
    mockView('error', 'ok');

    render(
      <MemoryRouter>
        <HealthAmpel />
      </MemoryRouter>,
    );

    const link = screen.getByRole('link');
    expect(link.getAttribute('aria-label')).toMatch(/Erreichbarkeit/);
    expect(link.getAttribute('aria-label')).toMatch(/Bereitschaft/);
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    mockView('ok', 'ok');

    const { container } = render(
      <MemoryRouter>
        <HealthAmpel />
      </MemoryRouter>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
