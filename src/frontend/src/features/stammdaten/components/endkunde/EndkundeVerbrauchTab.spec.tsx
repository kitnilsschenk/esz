import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { EndkundeVerbrauchTab } from './EndkundeVerbrauchTab';

const { useEndkundeVerbrauchViewMock, VerbrauchAnsichtMock } = vi.hoisted(() => ({
  useEndkundeVerbrauchViewMock: vi.fn(),
  VerbrauchAnsichtMock: vi.fn((props: { standortId: string }) => <p>Verbrauchsanzeige für {props.standortId}</p>),
}));

vi.mock('../../hooks/endkunde', () => ({ useEndkundeVerbrauchView: useEndkundeVerbrauchViewMock }));
// `VerbrauchAnsicht` bräuchte (echt gerendert) einen `QueryClientProvider` —
// hier als Stub, der NUR die übergebene `standortId` sichtbar macht (genügt,
// um zu prüfen, WIE VIELE Instanzen mit WELCHER `standortId` gerendert werden).
vi.mock('../verbrauch', () => ({ VerbrauchAnsicht: VerbrauchAnsichtMock }));

const ENDKUNDE_ID = '0198c3aa-aaaa-7000-8000-000000000001';

describe('EndkundeVerbrauchTab', () => {
  afterEach(() => {
    useEndkundeVerbrauchViewMock.mockReset();
    VerbrauchAnsichtMock.mockClear();
  });

  it('bettet bei GENAU EINEM Wurzelstandort `VerbrauchAnsicht` DIREKT ein (kein Kachel-Grid)', () => {
    useEndkundeVerbrauchViewMock.mockReturnValue({
      isPending: false,
      isError: false,
      istLeer: false,
      hatMehrereWurzeln: false,
      wurzeln: [{ standortId: 'wurzel-1', typLabel: 'Liegenschaft', anzeigeName: 'Campus Nord', istPlatzhalter: false }],
    });

    render(<EndkundeVerbrauchTab endkundeId={ENDKUNDE_ID} />);

    expect(screen.getByText('Verbrauchsanzeige für wurzel-1')).toBeInTheDocument();
    expect(VerbrauchAnsichtMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('heading', { name: 'Campus Nord' })).not.toBeInTheDocument();
  });

  it('zeigt bei MEHREREN Liegenschaften EINE Kachel JE Liegenschaft — KEINE Gesamtsumme', () => {
    useEndkundeVerbrauchViewMock.mockReturnValue({
      isPending: false,
      isError: false,
      istLeer: false,
      hatMehrereWurzeln: true,
      wurzeln: [
        { standortId: 'wurzel-1', typLabel: 'Liegenschaft', anzeigeName: 'Campus Nord', istPlatzhalter: false },
        { standortId: 'wurzel-2', typLabel: 'Gebäude', anzeigeName: 'Campus Süd', istPlatzhalter: false },
      ],
    });

    render(<EndkundeVerbrauchTab endkundeId={ENDKUNDE_ID} />);

    // ZWEI eigenständige `VerbrauchAnsicht`-Instanzen (eine je Liegenschaft) …
    expect(VerbrauchAnsichtMock).toHaveBeenCalledTimes(2);
    expect(VerbrauchAnsichtMock.mock.calls.map((call) => call[0]?.standortId)).toEqual(['wurzel-1', 'wurzel-2']);
    // … je eigener Kachel-Überschrift mit dem Liegenschafts-Namen — GENAU
    // ZWEI `VerbrauchAnsicht`-Aufrufe oben (nicht mehr, nicht weniger) sind
    // bereits der Beleg für „keine zusätzliche Gesamt-/Summen-Kachel".
    expect(screen.getByRole('heading', { name: /Campus Nord/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Campus Süd/ })).toBeInTheDocument();
  });

  it('zeigt einen Leer-Hinweis, wenn der Endkunde noch keinen Standort hat', () => {
    useEndkundeVerbrauchViewMock.mockReturnValue({ isPending: false, isError: false, istLeer: true, hatMehrereWurzeln: false, wurzeln: [] });

    render(<EndkundeVerbrauchTab endkundeId={ENDKUNDE_ID} />);

    expect(screen.getByText(/noch kein Standort angelegt/)).toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße (Kachel-Ansicht)', async () => {
    useEndkundeVerbrauchViewMock.mockReturnValue({
      isPending: false,
      isError: false,
      istLeer: false,
      hatMehrereWurzeln: true,
      wurzeln: [
        { standortId: 'wurzel-1', typLabel: 'Liegenschaft', anzeigeName: 'Campus Nord', istPlatzhalter: false },
        { standortId: 'wurzel-2', typLabel: 'Gebäude', anzeigeName: 'Campus Süd', istPlatzhalter: false },
      ],
    });

    const { container } = render(<EndkundeVerbrauchTab endkundeId={ENDKUNDE_ID} />);

    expect(await runAxe(container)).toEqual([]);
  });
});
