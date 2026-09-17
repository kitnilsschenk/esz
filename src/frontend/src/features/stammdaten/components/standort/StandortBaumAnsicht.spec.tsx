import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { StandortBaumAnsicht } from './StandortBaumAnsicht';

const { useStandortBaumViewMock, useKannStammdatenAnlegenMock } = vi.hoisted(() => ({
  useStandortBaumViewMock: vi.fn(),
  useKannStammdatenAnlegenMock: vi.fn(),
}));

vi.mock('../../hooks/standort', () => ({ useStandortBaumView: useStandortBaumViewMock }));
vi.mock('../../hooks/shared/useKannStammdatenAnlegen', () => ({ useKannStammdatenAnlegen: useKannStammdatenAnlegenMock }));
// Eigene Testdateien: `StandortKindAnlegenFormular.spec.tsx`,
// `StandortKnotenAktionen`-Verhalten wird über seine eigenen Unterkomponenten
// abgedeckt — hier bewusst als No-Op gemockt (analog
// `EndkundeDetailAnsicht.spec.tsx`s Mocks für `EndkundeSperrenAktion` etc.),
// damit dieser Test AUSSCHLIESSLICH die Verdrahtung von
// `StandortBaumAnsicht` selbst prüft.
vi.mock('./StandortKindAnlegenFormular', () => ({ StandortKindAnlegenFormular: () => <p>Wurzel-Anlegen-Formular (Stub)</p> }));
vi.mock('./StandortKnotenAktionen', () => ({ StandortKnotenAktionen: () => <p>Aktions-Panel (Stub)</p> }));
// `VerbrauchAnsicht` bräuchte (echt gerendert) einen `QueryClientProvider`
// (eigene TanStack-Query-Hooks) — bewusst als No-Op gemockt, analog den
// beiden Stubs oben; eigene Tests: `VerbrauchAnsicht.spec.tsx`.
vi.mock('../verbrauch', () => ({ VerbrauchAnsicht: () => <p>Verbrauchsanzeige (Stub)</p> }));

const ENDKUNDE_ID = '0198c3aa-aaaa-7000-8000-000000000001';

const WURZEL = {
  id: 'std-wurzel',
  endkundeId: ENDKUNDE_ID,
  parentId: null,
  typ: 'liegenschaft' as const,
  pfad: ['std-wurzel'],
  ebene: 0,
  sortierung: 0,
  status: 'aktiv' as const,
  klimareferenz: null,
    hatAdresse: true,
  zaehlerAnzahl: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const WURZEL_VIEW = {
  id: 'std-wurzel',
  parentId: null,
  typ: 'liegenschaft' as const,
  ebene: 0,
  status: 'aktiv' as const,
  klimareferenz: null,
    hatAdresse: true,
  zaehlerAnzahl: 0,
  hatKinder: false,
  istExpandiert: false,
  anzeigeName: 'Hauptstandort',
  istPlatzhalter: false,
  posInSet: 1,
  setSize: 1,
};

function baseView(overrides: Record<string, unknown> = {}) {
  return {
    isPending: false,
    isError: false,
    errorMessage: undefined,
    knoten: [WURZEL_VIEW],
    istLeer: false,
    aktiveId: 'std-wurzel',
    setAktiveId: vi.fn(),
    toggleExpand: vi.fn(),
    kannPiiLesen: true,
    anzeigeNameFuer: () => 'Hauptstandort',
    labelItemFuer: () => undefined,
    alleKnoten: [WURZEL],
    refetchBaum: vi.fn(),
    ...overrides,
  };
}

describe('StandortBaumAnsicht (Verdrahtung: Baum + Aktions-Panel)', () => {
  afterEach(() => {
    useStandortBaumViewMock.mockReset();
    useKannStammdatenAnlegenMock.mockReset();
  });

  it('rendert den Baum, das Aktions-Panel UND die Verbrauchsanzeige des ausgewählten Knotens', () => {
    useStandortBaumViewMock.mockReturnValue(baseView());
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    render(<StandortBaumAnsicht endkundeId={ENDKUNDE_ID} />);

    expect(screen.getByRole('tree')).toBeInTheDocument();
    expect(screen.getByText('Aktions-Panel (Stub)')).toBeInTheDocument();
    expect(screen.getByText('Verbrauchsanzeige (Stub)')).toBeInTheDocument();
  });

  it('zeigt WEDER Aktions-Panel NOCH Verbrauchsanzeige, solange kein Knoten ausgewählt ist (z. B. leerer Baum)', () => {
    useStandortBaumViewMock.mockReturnValue(baseView({ knoten: [], alleKnoten: [], aktiveId: undefined, istLeer: true }));
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    render(<StandortBaumAnsicht endkundeId={ENDKUNDE_ID} />);

    expect(screen.queryByText('Aktions-Panel (Stub)')).not.toBeInTheDocument();
    expect(screen.queryByText('Verbrauchsanzeige (Stub)')).not.toBeInTheDocument();
  });

  it('blendet den „Wurzel anlegen"-Button für Rollen ohne Schreibrecht aus', () => {
    useStandortBaumViewMock.mockReturnValue(baseView());
    useKannStammdatenAnlegenMock.mockReturnValue(false);

    render(<StandortBaumAnsicht endkundeId={ENDKUNDE_ID} />);

    expect(screen.queryByRole('button', { name: 'Wurzel anlegen' })).not.toBeInTheDocument();
  });

  it('zeigt das Wurzel-Anlegen-Formular erst nach Klick auf „Wurzel anlegen"', () => {
    useStandortBaumViewMock.mockReturnValue(baseView());
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    render(<StandortBaumAnsicht endkundeId={ENDKUNDE_ID} />);

    expect(screen.queryByText('Wurzel-Anlegen-Formular (Stub)')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Wurzel anlegen' }));
    expect(screen.getByText('Wurzel-Anlegen-Formular (Stub)')).toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useStandortBaumViewMock.mockReturnValue(baseView());
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    const { container } = render(<StandortBaumAnsicht endkundeId={ENDKUNDE_ID} />);

    expect(await runAxe(container)).toEqual([]);
  });
});
