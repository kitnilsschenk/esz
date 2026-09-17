import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { ZaehlerFreshnessStatus } from './ZaehlerFreshnessStatus';

const { useZaehlerFreshnessStatusViewMock } = vi.hoisted(() => ({ useZaehlerFreshnessStatusViewMock: vi.fn() }));

vi.mock('../../hooks/zaehler', () => ({ useZaehlerFreshnessStatusView: useZaehlerFreshnessStatusViewMock }));

const ZAEHLER_ID = '0198c3aa-aaaa-7000-8000-000000000001';

describe('ZaehlerFreshnessStatus', () => {
  afterEach(() => {
    useZaehlerFreshnessStatusViewMock.mockReset();
  });

  it('zeigt den OK-Status, wenn keine Übertragung überfällig ist', () => {
    useZaehlerFreshnessStatusViewMock.mockReturnValue({
      isPending: false,
      isError: false,
      hatMesskanaele: true,
      label: 'Letzte Übertragung: vor 3 Std.',
      ueberfaellig: false,
    });

    render(<ZaehlerFreshnessStatus zaehlerId={ZAEHLER_ID} />);

    expect(screen.getByText('Letzte Übertragung: vor 3 Std.')).toBeInTheDocument();
    expect(screen.getByText('läuft')).toBeInTheDocument();
  });

  it('zeigt den Überfällig-Status, wenn mindestens ein Kanal überfällig ist', () => {
    useZaehlerFreshnessStatusViewMock.mockReturnValue({
      isPending: false,
      isError: false,
      hatMesskanaele: true,
      label: 'Letzte Übertragung: vor 3 Tagen',
      ueberfaellig: true,
    });

    render(<ZaehlerFreshnessStatus zaehlerId={ZAEHLER_ID} />);

    expect(screen.getByText('überfällig')).toBeInTheDocument();
  });

  it('zeigt einen neutralen Hinweis, wenn der Zähler keine Messkanäle hat', () => {
    useZaehlerFreshnessStatusViewMock.mockReturnValue({
      isPending: false,
      isError: false,
      hatMesskanaele: false,
      label: '',
      ueberfaellig: false,
    });

    render(<ZaehlerFreshnessStatus zaehlerId={ZAEHLER_ID} />);

    expect(screen.getByText('Kein Messkanal vorhanden — für diesen Zähler werden derzeit keine Messwerte erwartet.')).toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useZaehlerFreshnessStatusViewMock.mockReturnValue({
      isPending: false,
      isError: false,
      hatMesskanaele: true,
      label: 'Letzte Übertragung: vor 3 Std.',
      ueberfaellig: false,
    });

    const { container } = render(<ZaehlerFreshnessStatus zaehlerId={ZAEHLER_ID} />);

    expect(await runAxe(container)).toEqual([]);
  });
});
