import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { MesskanalDetailAnsicht } from './MesskanalDetailAnsicht';

const { useMesskanalDetailViewMock } = vi.hoisted(() => ({
  useMesskanalDetailViewMock: vi.fn(),
}));

vi.mock('../../hooks/messkanal', () => ({ useMesskanalDetailView: useMesskanalDetailViewMock }));
// Eigene Testdateien: `MesskanalAendernFormular.spec.tsx`,
// `MesskanalStilllegenAktion.spec.tsx` — hier bewusst als No-Op gemockt.
vi.mock('../../../geraeteerkennung', () => ({ MesskanalZuordnungAktion: () => null }));
vi.mock('./MesskanalAendernFormular', () => ({ MesskanalAendernFormular: () => null }));
vi.mock('./MesskanalStilllegenAktion', () => ({ MesskanalStilllegenAktion: () => null }));

const MESSKANAL_ID = '0298c3bb-bbbb-7000-8000-000000000002';
const ZAEHLER_ID = '0198c3aa-aaaa-7000-8000-000000000001';

describe('MesskanalDetailAnsicht', () => {
  afterEach(() => {
    useMesskanalDetailViewMock.mockReset();
  });

  it('zeigt die Nicht-PII-Kernfelder eines Messkanals und den Rücksprung zum Zähler', () => {
    useMesskanalDetailViewMock.mockReturnValue({
      isPending: false,
      isError: false,
      fields: [
        { key: 'id', label: 'ID', value: '0298c3bb' },
        { key: 'messgroesse', label: 'Messgröße', value: 'wirkarbeit' },
      ],
      zaehlerId: ZAEHLER_ID,
      istStillgelegt: false,
    });

    render(
      <MemoryRouter>
        <MesskanalDetailAnsicht messkanalId={MESSKANAL_ID} />
      </MemoryRouter>,
    );

    expect(screen.getByText('wirkarbeit')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zurück zum Zähler' })).toHaveAttribute(
      'href',
      `/stammdaten/zaehler/${ZAEHLER_ID}`,
    );
  });

  it('zeigt die Fehlermeldung, wenn das Laden fehlschlägt', () => {
    useMesskanalDetailViewMock.mockReturnValue({
      isPending: false,
      isError: true,
      fields: [],
      zaehlerId: undefined,
      istStillgelegt: false,
    });

    render(
      <MemoryRouter>
        <MesskanalDetailAnsicht messkanalId={MESSKANAL_ID} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Daten konnten nicht geladen werden.');
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useMesskanalDetailViewMock.mockReturnValue({
      isPending: false,
      isError: false,
      fields: [{ key: 'id', label: 'ID', value: '0298c3bb' }],
      zaehlerId: ZAEHLER_ID,
      istStillgelegt: false,
    });

    const { container } = render(
      <MemoryRouter>
        <MesskanalDetailAnsicht messkanalId={MESSKANAL_ID} />
      </MemoryRouter>,
    );

    expect(await runAxe(container)).toEqual([]);
  });

  it('sagt erfolgreiches Stilllegen über eine aria-live-Region an, sobald `istStillgelegt` von false auf true wechselt', () => {
    const baseView = {
      isPending: false,
      isError: false,
      fields: [{ key: 'id', label: 'ID', value: '0298c3bb' }],
      zaehlerId: ZAEHLER_ID,
      istStillgelegt: false,
    };
    useMesskanalDetailViewMock.mockReturnValue(baseView);

    const { rerender } = render(
      <MemoryRouter>
        <MesskanalDetailAnsicht messkanalId={MESSKANAL_ID} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('');

    useMesskanalDetailViewMock.mockReturnValue({ ...baseView, istStillgelegt: true });
    rerender(
      <MemoryRouter>
        <MesskanalDetailAnsicht messkanalId={MESSKANAL_ID} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Messkanal wurde erfolgreich stillgelegt.');
  });
});
