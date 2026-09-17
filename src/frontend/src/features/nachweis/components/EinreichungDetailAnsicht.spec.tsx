import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../shared/testing/axe';
import { EinreichungDetailAnsicht } from './EinreichungDetailAnsicht';

const { useEinreichungDetailViewMock } = vi.hoisted(() => ({ useEinreichungDetailViewMock: vi.fn() }));

vi.mock('../hooks', () => ({ useEinreichungDetailView: useEinreichungDetailViewMock }));
vi.mock('./EinreichungDifferenzenTabelle', () => ({
  EinreichungDifferenzenTabelle: () => <div data-testid="differenzen" />,
}));

const BASIS = {
  isPending: false,
  isError: false,
  exportId: '0198c3dd-dddd-7000-8000-000000000004',
  einsparlaufId: '0198c3cc-cccc-7000-8000-000000000003',
  ersetztEinreichungId: null,
  istKorrektur: false,
  fields: [{ key: 'art', label: 'Art', value: 'Verwendungsnachweis' }],
};

function rendere(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <EinreichungDetailAnsicht einreichungId="einreichung-1" />
    </MemoryRouter>,
  );
}

describe('EinreichungDetailAnsicht', () => {
  afterEach(() => {
    useEinreichungDetailViewMock.mockReset();
  });

  it('sagt, dass der Eintrag eine erklärte Übermittlung bezeugt und keinen Empfang', () => {
    useEinreichungDetailViewMock.mockReturnValue(BASIS);

    rendere();

    expect(screen.getByText(/belegt nicht, dass die Bewilligungsbehörde die Unterlagen erhalten hat/)).toBeInTheDocument();
  });

  it('zeigt den Differenz-Report NUR bei einer Korrektur', () => {
    useEinreichungDetailViewMock.mockReturnValue(BASIS);
    const { unmount } = rendere();
    expect(screen.queryByTestId('differenzen')).not.toBeInTheDocument();
    unmount();

    useEinreichungDetailViewMock.mockReturnValue({
      ...BASIS,
      istKorrektur: true,
      ersetztEinreichungId: '0198c3ee-eeee-7000-8000-000000000005',
    });
    rendere();
    expect(screen.getByTestId('differenzen')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abgelöste Einreichung ansehen' })).toHaveAttribute(
      'href',
      '/nachweis/einreichungen/0198c3ee-eeee-7000-8000-000000000005',
    );
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useEinreichungDetailViewMock.mockReturnValue(BASIS);

    const { container } = rendere();

    expect(await runAxe(container)).toEqual([]);
  });
});
