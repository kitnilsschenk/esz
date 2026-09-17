import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GeraetAnbindung } from '@edms/shared';
import { runAxe } from '../../../../shared/testing/axe';
import { GeraetAnbindungAbschnitt } from './GeraetAnbindungAbschnitt';

const { useKannStammdatenAnlegenMock, anlegenViewMock, beendenViewMock } = vi.hoisted(() => ({
  useKannStammdatenAnlegenMock: vi.fn(),
  anlegenViewMock: vi.fn(),
  beendenViewMock: vi.fn(),
}));

vi.mock('../../hooks/shared/useKannStammdatenAnlegen', () => ({
  useKannStammdatenAnlegen: useKannStammdatenAnlegenMock,
}));
vi.mock('../../hooks/geraetZuordnung', async () => {
  const echt = await vi.importActual<typeof import('../../hooks/geraetZuordnung/useGeraetAnbindungView')>(
    '../../hooks/geraetZuordnung/useGeraetAnbindungView',
  );
  return {
    geraetAnbindungAnzeige: echt.geraetAnbindungAnzeige,
    useGeraetAnbindungAnlegenView: anlegenViewMock,
    useGeraetAnbindungBeendenView: beendenViewMock,
  };
});

const ZAEHLER_ID = '0198c3aa-aaaa-7000-8000-000000000001';

const AKTIV: GeraetAnbindung = {
  id: '0198c3bb-bbbb-7000-8000-000000000002',
  status: 'aktiv',
  gueltigVon: '2026-03-12T09:00:00.000Z',
  gueltigBis: null,
  pepperVersion: 1,
};

function rendere(anbindung: GeraetAnbindung | null): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <GeraetAnbindungAbschnitt zaehlerId={ZAEHLER_ID} anbindung={anbindung} headingId="anbindung-heading" />
    </MemoryRouter>,
  );
}

describe('GeraetAnbindungAbschnitt', () => {
  afterEach(() => {
    useKannStammdatenAnlegenMock.mockReset();
    anlegenViewMock.mockReset();
    beendenViewMock.mockReset();
  });

  function mockViews(overrides: { anbinden?: () => void; beenden?: () => void; anlegenFehler?: string } = {}): void {
    anlegenViewMock.mockReturnValue({
      isSubmitting: false,
      submitErrorMessage: overrides.anlegenFehler,
      erfolgsMeldung: undefined,
      anbinden: overrides.anbinden ?? vi.fn(),
    });
    beendenViewMock.mockReturnValue({
      isSubmitting: false,
      submitErrorMessage: undefined,
      erfolgsMeldung: undefined,
      beenden: overrides.beenden ?? vi.fn(),
    });
  }

  it('bietet ohne Anbindung das Formular an und sagt, was fehlt', () => {
    useKannStammdatenAnlegenMock.mockReturnValue(true);
    mockViews();

    rendere(null);

    expect(screen.getByText(/Ohne Anbindung kommen keine Messwerte an/)).toBeInTheDocument();
    expect(screen.getByLabelText('Gerätekennung (DevEUI)')).toBeInTheDocument();
  });

  it('normalisiert die eingegebene Kennung, bevor sie abgeschickt wird', () => {
    const anbinden = vi.fn();
    useKannStammdatenAnlegenMock.mockReturnValue(true);
    mockViews({ anbinden });

    rendere(null);
    fireEvent.change(screen.getByLabelText('Gerätekennung (DevEUI)'), {
      target: { value: '00:80:E1:15:05:70:E0:60' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gerät anbinden' }));

    // Die Normalisierung selbst liegt im View-Hook; hier zählt, dass das
    // Formular den Rohwert unverändert durchreicht und nicht selbst bastelt.
    expect(anbinden).toHaveBeenCalledWith({ devEui: '00:80:E1:15:05:70:E0:60' });
  });

  it('weist eine unvollständige Kennung ab, bevor sie den Browser verlässt', () => {
    const anbinden = vi.fn();
    useKannStammdatenAnlegenMock.mockReturnValue(true);
    mockViews({ anbinden });

    rendere(null);
    fireEvent.change(screen.getByLabelText('Gerätekennung (DevEUI)'), { target: { value: '0080e115' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerät anbinden' }));

    expect(anbinden).not.toHaveBeenCalled();
    expect(screen.getByText(/besteht aus 16 Zeichen/)).toBeInTheDocument();
  });

  it('zeigt bei bestehender Anbindung Beginn und Beenden-Aktion statt des Formulars', () => {
    useKannStammdatenAnlegenMock.mockReturnValue(true);
    mockViews();

    rendere(AKTIV);

    expect(screen.getByText(/Angebunden seit 12\.03\.2026, 10:00/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anbindung beenden' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Gerätekennung (DevEUI)')).not.toBeInTheDocument();
  });

  it('zeigt die Gerätekennung NIE an — sie kommt vom Server auch gar nicht zurück', () => {
    useKannStammdatenAnlegenMock.mockReturnValue(true);
    mockViews();

    const { container } = rendere(AKTIV);

    expect(container.textContent).not.toContain('0080e1');
    expect(screen.getByText(/wird aus Datenschutzgründen nicht angezeigt/)).toBeInTheDocument();
  });

  it('löst das Beenden aus', () => {
    const beenden = vi.fn();
    useKannStammdatenAnlegenMock.mockReturnValue(true);
    mockViews({ beenden });

    rendere(AKTIV);
    fireEvent.click(screen.getByRole('button', { name: 'Anbindung beenden' }));

    expect(beenden).toHaveBeenCalledTimes(1);
  });

  it('zeigt Rollen ohne Schreibrecht nur den Zustand, keine Aktionen', () => {
    useKannStammdatenAnlegenMock.mockReturnValue(false);
    mockViews();

    const { unmount } = rendere(AKTIV);
    expect(screen.getByText(/Angebunden seit 12\.03\.2026, 10:00/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Anbindung beenden' })).not.toBeInTheDocument();
    unmount();

    rendere(null);
    expect(screen.queryByLabelText('Gerätekennung (DevEUI)')).not.toBeInTheDocument();
  });

  it('zeigt eine Server-Ablehnung an (z. B. Kennung bereits an einem anderen Zähler)', () => {
    useKannStammdatenAnlegenMock.mockReturnValue(true);
    mockViews({ anlegenFehler: 'Diese Gerätekennung ist bereits einem anderen Zähler zugeordnet.' });

    rendere(null);

    expect(screen.getByRole('alert')).toHaveTextContent('bereits einem anderen Zähler zugeordnet');
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useKannStammdatenAnlegenMock.mockReturnValue(true);
    mockViews();

    const { container } = rendere(null);

    expect(await runAxe(container)).toEqual([]);
  });
});
