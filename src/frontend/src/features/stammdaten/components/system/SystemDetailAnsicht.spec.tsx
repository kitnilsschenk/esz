import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { SystemDetailAnsicht } from './SystemDetailAnsicht';

const { useSystemDetailViewMock, useKannEinflussgroesseLesenMock } = vi.hoisted(() => ({
  useSystemDetailViewMock: vi.fn(),
  useKannEinflussgroesseLesenMock: vi.fn(),
}));

vi.mock('../../hooks/system', () => ({ useSystemDetailView: useSystemDetailViewMock }));
// `useKannEinflussgroesseLesen` gated die CTA-Sektion (s. eigene Tests unten)
// — Default `false`, damit die bestehenden Nicht-PII-Rendering-Tests
// unverändert bleiben (kein zusätzliches CTA-Paar im DOM).
vi.mock('../../hooks/einflussgroesse', () => ({ useKannEinflussgroesseLesen: useKannEinflussgroesseLesenMock }));
// Eigene Testdateien: `SystemAendernFormular.spec.tsx`,
// `SystemStilllegenAktion.spec.tsx` — hier bewusst als No-Op gemockt
// (analog `ZaehlerDetailAnsicht.spec.tsx`), damit dieser Test ausschließlich
// das Detail-Rendering prüft.
// Eingebettete Zähler-Liste des Systems — gestubbt (dieser Test prüft die
// Detail-Ansicht, nicht die Liste; ungestubbt bräuchte sie einen QueryClientProvider).
vi.mock('../zaehler', () => ({ ZaehlerTabelle: () => null }));
vi.mock('../../../geraeteerkennung', () => ({ SystemEntbehrlichAktion: () => null }));
vi.mock('./SystemAendernFormular', () => ({ SystemAendernFormular: () => null }));
vi.mock('./SystemStilllegenAktion', () => ({ SystemStilllegenAktion: () => null }));

const SYSTEM_ID = '0198c3aa-aaaa-7000-8000-000000000001';

describe('SystemDetailAnsicht', () => {
  afterEach(() => {
    useSystemDetailViewMock.mockReset();
    useKannEinflussgroesseLesenMock.mockReset();
  });

  it('zeigt die Nicht-PII-Kernfelder eines Systems', () => {
    useSystemDetailViewMock.mockReturnValue({
      isPending: false,
      isError: false,
      fields: [
        { key: 'id', label: 'ID', value: '0198c3aa' },
        { key: 'bezeichnung', label: 'Bezeichnung', value: 'Bürogebäude Hauptstraße' },
        { key: 'systembeschreibung', label: 'Systembeschreibung', value: 'keine Angabe' },
      ],
      istStillgelegt: false,
    });

    render(
      <MemoryRouter>
        <SystemDetailAnsicht systemId={SYSTEM_ID} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Bürogebäude Hauptstraße')).toBeInTheDocument();
    expect(screen.getByText('keine Angabe')).toBeInTheDocument();
  });

  it('zeigt die Fehlermeldung, wenn das Laden fehlschlägt', () => {
    useSystemDetailViewMock.mockReturnValue({ isPending: false, isError: true, fields: [], istStillgelegt: false });

    render(
      <MemoryRouter>
        <SystemDetailAnsicht systemId={SYSTEM_ID} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Daten konnten nicht geladen werden.');
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useSystemDetailViewMock.mockReturnValue({
      isPending: false,
      isError: false,
      fields: [{ key: 'id', label: 'ID', value: '0198c3aa' }],
      istStillgelegt: false,
    });

    const { container } = render(
      <MemoryRouter>
        <SystemDetailAnsicht systemId={SYSTEM_ID} />
      </MemoryRouter>,
    );

    expect(await runAxe(container)).toEqual([]);
  });

  it('sagt erfolgreiches Stilllegen über eine aria-live-Region an, sobald `istStillgelegt` von false auf true wechselt', () => {
    const baseView = {
      isPending: false,
      isError: false,
      fields: [{ key: 'id', label: 'ID', value: '0198c3aa' }],
      istStillgelegt: false,
    };
    useSystemDetailViewMock.mockReturnValue(baseView);

    const { rerender } = render(
      <MemoryRouter>
        <SystemDetailAnsicht systemId={SYSTEM_ID} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('');

    useSystemDetailViewMock.mockReturnValue({ ...baseView, istStillgelegt: true });
    rerender(
      <MemoryRouter>
        <SystemDetailAnsicht systemId={SYSTEM_ID} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('System wurde erfolgreich stillgelegt.');
  });

  it('sagt NICHT an, wenn ein bereits stillgelegtes System direkt geladen wird (keine false→true-Flanke)', () => {
    useSystemDetailViewMock.mockReturnValue({
      isPending: false,
      isError: false,
      fields: [{ key: 'id', label: 'ID', value: '0198c3aa' }],
      istStillgelegt: true,
    });

    render(
      <MemoryRouter>
        <SystemDetailAnsicht systemId={SYSTEM_ID} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('blendet die Einflussgrößen-CTA-Sektion ohne read:einflussgroesse aus (Default-Mock `false`)', () => {
    useSystemDetailViewMock.mockReturnValue({
      isPending: false,
      isError: false,
      fields: [{ key: 'id', label: 'ID', value: '0198c3aa' }],
      istStillgelegt: false,
    });

    render(
      <MemoryRouter>
        <SystemDetailAnsicht systemId={SYSTEM_ID} />
      </MemoryRouter>,
    );

    expect(screen.queryByText('Einflussgrößen')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Einflussgrößen anzeigen' })).not.toBeInTheDocument();
  });

  it('zeigt die Einflussgrößen-CTA-Sektion für das Betriebs-Team (`useKannEinflussgroesseLesen=true`)', () => {
    useSystemDetailViewMock.mockReturnValue({
      isPending: false,
      isError: false,
      fields: [{ key: 'id', label: 'ID', value: '0198c3aa' }],
      istStillgelegt: false,
    });
    useKannEinflussgroesseLesenMock.mockReturnValue(true);

    render(
      <MemoryRouter>
        <SystemDetailAnsicht systemId={SYSTEM_ID} />
      </MemoryRouter>,
    );

    const anzeigenLink = screen.getByRole('link', { name: 'Einflussgrößen anzeigen' });
    expect(anzeigenLink).toHaveAttribute('href', `/stammdaten/systeme/${SYSTEM_ID}/einflussgroessen`);
    const erfassenLink = screen.getByRole('link', { name: 'Einflussgröße erfassen' });
    expect(erfassenLink).toHaveAttribute('href', `/stammdaten/systeme/${SYSTEM_ID}/einflussgroessen/neu`);
  });
});
