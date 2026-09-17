import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { BerechnungUebersichtAnsicht } from '../../components/berechnung/BerechnungUebersichtAnsicht';

/**
 * **Warum dieser Test mit dem ECHTEN Hook arbeitet.**
 *
 * Die vorhandenen Tests der Übersicht mocken `useBerechnungUebersichtView`
 * weg und prüfen nur, dass ein Klick die Rückruffunktion aufruft. Ob die
 * Auswahl danach tatsächlich WIRKT — ob also die Lauf-Liste erscheint —
 * hat damit niemand geprüft. Genau das ist im Browser aufgefallen: Der Klick
 * auf „Auswählen" tat sichtbar nichts.
 *
 * Hier läuft deshalb der echte Zustandsfluss; gemockt wird nur die
 * Datenquelle darunter.
 */

const { endkundenListeMock, labelsMock } = vi.hoisted(() => ({
  endkundenListeMock: vi.fn(),
  labelsMock: vi.fn(),
}));

vi.mock('../endkunde', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  useEndkundenListeView: endkundenListeMock,
}));

vi.mock('../../components/endkunde', async (original) => ({
  ...(await original<Record<string, unknown>>()),
}));

vi.mock('../endkunde/useEndkundeLabelsView', () => ({ useEndkundeLabelsView: labelsMock }));

vi.mock('../../components/berechnung/BerechnungslaufTabelle', () => ({
  BerechnungslaufTabelle: ({ endkundeId }: { endkundeId: string }) => (
    <p data-testid="laeufe">{`Laeufe von ${endkundeId}`}</p>
  ),
}));

const ENDKUNDE_A = '0198c3aa-aaaa-7000-8000-00000000000a';
const ENDKUNDE_B = '0198c3aa-aaaa-7000-8000-00000000000b';

function listeMitZweiEndkunden(): void {
  endkundenListeMock.mockReturnValue({
    items: [
      { id: ENDKUNDE_A, verarbeitungsStatus: 'aktiv', vonWissAuswertungAusgenommen: false, createdAt: '2026-07-01T00:00:00.000Z' },
      { id: ENDKUNDE_B, verarbeitungsStatus: 'aktiv', vonWissAuswertungAusgenommen: false, createdAt: '2026-07-02T00:00:00.000Z' },
    ],
    isPending: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    loadMore: vi.fn(),
  });
  labelsMock.mockReturnValue({ anzeigeName: (id: string) => id.slice(0, 8), isPending: false, zeigtKlartext: false });
}

describe('Baseline-/Einsparungs-Übersicht — echter Auswahl-Zustand', () => {
  it('zeigt nach dem Klick auf „Auswählen" die Läufe DIESES Endkunden', () => {
    listeMitZweiEndkunden();

    render(
      <MemoryRouter>
        <BerechnungUebersichtAnsicht />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId('laeufe')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /Auswählen/ })[0]!);

    expect(screen.getByTestId('laeufe')).toHaveTextContent(ENDKUNDE_A);
  });
});
