import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BerechnungslaufNeuBerechnenAktion } from './BerechnungslaufNeuBerechnenAktion';

const { neuBerechnenMock, useKannStammdatenAnlegenMock, navigateMock } = vi.hoisted(() => ({
  neuBerechnenMock: vi.fn(),
  useKannStammdatenAnlegenMock: vi.fn(),
  navigateMock: vi.fn(),
}));

vi.mock('../../api/berechnung', () => ({ useBerechnungslaufNeuBerechnen: neuBerechnenMock }));
vi.mock('../../hooks/shared/useKannStammdatenAnlegen', () => ({
  useKannStammdatenAnlegen: useKannStammdatenAnlegenMock,
}));
vi.mock('react-router-dom', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  useNavigate: () => navigateMock,
}));

const ENDKUNDE_ID = '0198c3aa-aaaa-7000-8000-00000000000e';
const LAUF_ID = '0198c3aa-aaaa-7000-8000-000000000001';
const NEUER_LAUF_ID = '0198c3aa-aaaa-7000-8000-000000000002';

function mutation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { mutate: vi.fn(), isPending: false, error: null, ...overrides };
}

function rendere(istErsetzt = false): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <BerechnungslaufNeuBerechnenAktion endkundeId={ENDKUNDE_ID} laufId={LAUF_ID} istErsetzt={istErsetzt} />
    </MemoryRouter>,
  );
}

describe('BerechnungslaufNeuBerechnenAktion', () => {
  afterEach(() => {
    neuBerechnenMock.mockReset();
    useKannStammdatenAnlegenMock.mockReset();
    navigateMock.mockReset();
  });

  it('fragt vor dem Rechnen nach — die Folge reicht über diesen Lauf hinaus', () => {
    // Der neue Lauf wird ab dann für Nachweis UND Monatsbericht herangezogen.
    // Ein Klick ohne Rückfrage wäre für eine solche Wirkung zu wenig.
    const mutate = vi.fn();
    neuBerechnenMock.mockReturnValue(mutation({ mutate }));
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    rendere();

    fireEvent.click(screen.getByRole('button', { name: 'Neu rechnen' }));
    expect(mutate).not.toHaveBeenCalled();

    expect(screen.getByText('Diesen Lauf neu rechnen?')).toBeInTheDocument();
    // Der Dialog sagt ausdrücklich, dass nichts überschrieben wird.
    expect(screen.getByText(/bleibt erhalten und bleibt einsehbar/)).toBeInTheDocument();
  });

  it('führt nach der Korrektur zum NEUEN Lauf', () => {
    // Sonst stünde man weiter vor der alten Zahl und wüsste nicht, ob etwas
    // passiert ist.
    const mutate = vi.fn((_laufId: string, optionen: { onSuccess: (lauf: { id: string }) => void }) => {
      optionen.onSuccess({ id: NEUER_LAUF_ID });
    });
    neuBerechnenMock.mockReturnValue(mutation({ mutate }));
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    rendere();

    fireEvent.click(screen.getByRole('button', { name: 'Neu rechnen' }));
    // Auslöser und Bestätigung tragen bewusst VERSCHIEDENE Namen — sonst
    // stünden im Dialog zwei gleichnamige Schaltflächen mit verschiedener
    // Wirkung.
    fireEvent.click(screen.getByRole('button', { name: 'Jetzt neu rechnen' }));

    expect(navigateMock).toHaveBeenCalledWith(
      `/stammdaten/endkunden/${ENDKUNDE_ID}/berechnungen/${NEUER_LAUF_ID}`,
    );
  });

  it('bietet an einem bereits ersetzten Lauf KEINE Korrektur an, sondern sagt warum', () => {
    // Sonst hätte das Original zwei gleichrangige Nachfolger.
    neuBerechnenMock.mockReturnValue(mutation());
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    rendere(true);

    expect(screen.queryByRole('button', { name: 'Neu rechnen' })).not.toBeInTheDocument();
    expect(screen.getByText(/wurde durch einen neueren ersetzt/)).toBeInTheDocument();
  });

  it('zeigt die Aktion für Rollen ohne Schreibrecht gar nicht erst', () => {
    neuBerechnenMock.mockReturnValue(mutation());
    useKannStammdatenAnlegenMock.mockReturnValue(false);

    const { container } = rendere();

    expect(container).toBeEmptyDOMElement();
  });

  it('zeigt einen Serverfehler im Klartext', () => {
    neuBerechnenMock.mockReturnValue(
      mutation({ error: { detail: 'Dieser Lauf wurde bereits durch einen neueren ersetzt.' } }),
    );
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    rendere();

    expect(screen.getByText(/bereits durch einen neueren ersetzt/)).toBeInTheDocument();
  });
});
