import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { BerechnungUebersichtAnsicht } from './BerechnungUebersichtAnsicht';

const { useBerechnungUebersichtViewMock } = vi.hoisted(() => ({ useBerechnungUebersichtViewMock: vi.fn() }));

vi.mock('../../hooks/berechnung', () => ({ useBerechnungUebersichtView: useBerechnungUebersichtViewMock }));
// Beide eingebetteten Tabellen haben eigene Tests; hier zählt die Auswahl.
vi.mock('../endkunde', () => ({
  EndkundenTabelle: ({ renderRowAction }: { renderRowAction?: (item: { id: string }) => unknown }) => (
    <div>{renderRowAction?.({ id: '0198c3aa-aaaa-7000-8000-000000000001' }) as never}</div>
  ),
}));
vi.mock('./BerechnungslaufTabelle', () => ({
  BerechnungslaufTabelle: ({ endkundeId }: { endkundeId: string }) => <div data-testid="laeufe">{endkundeId}</div>,
}));

const ENDKUNDE_ID = '0198c3aa-aaaa-7000-8000-000000000001';

function view(overrides: Record<string, unknown> = {}) {
  return {
    isPending: false,
    isError: false,
    endkunden: [{ id: ENDKUNDE_ID }],
    istVollstaendigGeladen: true,
    nurEinEndkunde: false,
    ausgewaehlteEndkundeId: undefined,
    waehleEndkunde: vi.fn(),
    wechsleEndkunde: vi.fn(),
    ...overrides,
  };
}

function rendere(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <BerechnungUebersichtAnsicht />
    </MemoryRouter>,
  );
}

describe('BerechnungUebersichtAnsicht', () => {
  afterEach(() => {
    useBerechnungUebersichtViewMock.mockReset();
  });

  it('lässt den Endkunden HIER wählen, statt vier Ebenen tief zu verweisen', () => {
    const aktuell = view();
    useBerechnungUebersichtViewMock.mockReturnValue(aktuell);

    rendere();

    fireEvent.click(screen.getByRole('button', { name: /Auswählen/ }));
    expect(aktuell.waehleEndkunde).toHaveBeenCalledWith(ENDKUNDE_ID);
  });

  it('zeigt nach der Auswahl die bestehende Lauf-Liste desselben Endkunden', () => {
    useBerechnungUebersichtViewMock.mockReturnValue(view({ ausgewaehlteEndkundeId: ENDKUNDE_ID }));

    rendere();

    expect(screen.getByTestId('laeufe')).toHaveTextContent(ENDKUNDE_ID);
    expect(screen.getByRole('button', { name: 'Anderen Endkunden wählen' })).toBeInTheDocument();
  });

  it('bietet bei genau einem Endkunden keinen Wechsel an', () => {
    useBerechnungUebersichtViewMock.mockReturnValue(
      view({ ausgewaehlteEndkundeId: ENDKUNDE_ID, nurEinEndkunde: true }),
    );

    rendere();

    expect(screen.queryByRole('button', { name: 'Anderen Endkunden wählen' })).not.toBeInTheDocument();
  });

  it('führt weiter zum Nachweis — dort werden diese Berechnungen zusammengefasst', () => {
    useBerechnungUebersichtViewMock.mockReturnValue(view({ ausgewaehlteEndkundeId: ENDKUNDE_ID }));

    rendere();

    expect(screen.getByRole('link', { name: 'Zu den Förderjahren' })).toHaveAttribute('href', '/nachweis/foerderjahre');
  });

  it('sagt im Leerzustand, woran es liegt, dass es noch keine Berechnungen gibt', () => {
    useBerechnungUebersichtViewMock.mockReturnValue(view({ endkunden: [] }));

    rendere();

    expect(screen.getByText(/Messkonzept, Zähler und Messwerte/)).toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useBerechnungUebersichtViewMock.mockReturnValue(view({ ausgewaehlteEndkundeId: ENDKUNDE_ID }));

    const { container } = rendere();

    expect(await runAxe(container)).toEqual([]);
  });
});
