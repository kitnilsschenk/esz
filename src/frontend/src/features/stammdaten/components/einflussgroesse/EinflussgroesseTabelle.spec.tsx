import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { EinflussgroesseTabelle } from './EinflussgroesseTabelle';

const { useEinflussgroesseListeViewMock } = vi.hoisted(() => ({ useEinflussgroesseListeViewMock: vi.fn() }));

vi.mock('../../hooks/einflussgroesse', () => ({ useEinflussgroesseListeView: useEinflussgroesseListeViewMock }));

const SYSTEM_ID = '0198c3aa-aaaa-7000-8000-000000000001';

function baseView(overrides: Record<string, unknown> = {}) {
  return {
    kannLesen: true,
    angefordert: false,
    anzeigen: vi.fn(),
    isPending: false,
    isError: false,
    zeilen: [],
    ...overrides,
  };
}

describe('EinflussgroesseTabelle', () => {
  afterEach(() => {
    useEinflussgroesseListeViewMock.mockReset();
  });

  it('zeigt einen Zugriffsverweigert-Hinweis ohne read:einflussgroesse', () => {
    useEinflussgroesseListeViewMock.mockReturnValue(baseView({ kannLesen: false }));

    render(
      <MemoryRouter>
        <EinflussgroesseTabelle systemId={SYSTEM_ID} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Kein Zugriff');
    expect(screen.queryByRole('button', { name: 'Einflussgrößen anzeigen' })).not.toBeInTheDocument();
  });

  it('zeigt vor dem ersten Klick nur den CTA „Einflussgrößen anzeigen" (kein automatischer Aufruf)', () => {
    const anzeigen = vi.fn();
    useEinflussgroesseListeViewMock.mockReturnValue(baseView({ anzeigen }));

    render(
      <MemoryRouter>
        <EinflussgroesseTabelle systemId={SYSTEM_ID} />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Einflussgrößen anzeigen' });
    fireEvent.click(button);
    expect(anzeigen).toHaveBeenCalledTimes(1);
  });

  it('zeigt nach Anforderung die Klartext-Zeilen inkl. Korrigieren-Link mit ?groesseCode=', () => {
    useEinflussgroesseListeViewMock.mockReturnValue(
      baseView({
        angefordert: true,
        zeilen: [
          {
            id: '0198c3aa-cccc-7000-8000-000000000003',
            groesseCode: 'personenanzahl',
            groesseCodeLabel: 'Personenanzahl',
            wertAnzeige: '3 Personen',
            gueltigAbMonat: '2026-01-01',
            gueltigBisMonat: 'aktuell (kein Enddatum)',
            betroffenerTypLabel: 'Endkunde',
            quelleTypLabel: 'Betriebs-Team',
            rechtsgrundlageLabel: 'Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung)',
            anlassCodeLabel: 'Ersterfassung',
          },
        ],
      }),
    );

    render(
      <MemoryRouter>
        <EinflussgroesseTabelle systemId={SYSTEM_ID} />
      </MemoryRouter>,
    );

    expect(screen.getByText('3 Personen')).toBeInTheDocument();
    expect(screen.getByText(/Auditierte Klartext-Einsicht/)).toBeInTheDocument();
    const korrigierenLink = screen.getByRole('link', { name: /Korrigieren/ });
    expect(korrigierenLink).toHaveAttribute(
      'href',
      `/stammdaten/systeme/${SYSTEM_ID}/einflussgroessen/0198c3aa-cccc-7000-8000-000000000003/korrigieren?groesseCode=personenanzahl`,
    );
  });

  it('hat keine erkennbaren axe-Verstöße (CTA-Zustand)', async () => {
    useEinflussgroesseListeViewMock.mockReturnValue(baseView());

    const { container } = render(
      <MemoryRouter>
        <EinflussgroesseTabelle systemId={SYSTEM_ID} />
      </MemoryRouter>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
