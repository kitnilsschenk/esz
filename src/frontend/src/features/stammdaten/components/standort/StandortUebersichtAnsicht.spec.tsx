import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { StandortUebersichtAnsicht } from './StandortUebersichtAnsicht';

const { useStandortUebersichtViewMock } = vi.hoisted(() => ({ useStandortUebersichtViewMock: vi.fn() }));

vi.mock('../../hooks/standort', () => ({ useStandortUebersichtView: useStandortUebersichtViewMock }));

// `EndkundenTabelle` bräuchte (echt gerendert) einen `QueryClientProvider`
// (eigene TanStack-Query-Hooks, `useEndkundenListeView`) — bewusst als Stub,
// analog `StandortBaumAnsicht.spec.tsx`s Mock von `VerbrauchAnsicht`. Der
// Stub ruft die übergebene `renderRowAction` FÜR EINEN Fake-Eintrag auf, um
// die Verdrahtung Klick → `waehleEndkunde(id)` zu prüfen (eigene Tests der
// Aktion selbst: `EndkundenTabelle.spec.tsx`).
vi.mock('../endkunde', () => ({
  EndkundenTabelle: ({ renderRowAction }: { renderRowAction: (item: { id: string }) => ReactNode }) => (
    <div>
      <p>Endkunden-Tabelle (Stub)</p>
      {renderRowAction({ id: 'ek-2' })}
    </div>
  ),
}));

// Eigene Testdatei: `StandortBaumAnsicht.spec.tsx` — hier bewusst als Stub,
// damit dieser Test AUSSCHLIESSLICH die Verdrahtung von
// `StandortUebersichtAnsicht` selbst prüft (kein `QueryClientProvider` nötig).
vi.mock('./StandortBaumAnsicht', () => ({
  StandortBaumAnsicht: ({ endkundeId }: { endkundeId: string }) => <p>Standort-Baum für {endkundeId} (Stub)</p>,
}));

function baseView(overrides: Record<string, unknown> = {}) {
  return {
    isPending: false,
    isError: false,
    endkunden: [] as readonly { id: string }[],
    istVollstaendigGeladen: true,
    nurEinEndkunde: false,
    ausgewaehlteEndkundeId: undefined as string | undefined,
    waehleEndkunde: vi.fn(),
    wechsleEndkunde: vi.fn(),
    ...overrides,
  };
}

describe('StandortUebersichtAnsicht (globaler Einstiegspunkt `/stammdaten/standorte`)', () => {
  afterEach(() => {
    useStandortUebersichtViewMock.mockReset();
  });

  it('zeigt die Lade-Meldung, solange die Endkunden-Liste noch lädt', () => {
    useStandortUebersichtViewMock.mockReturnValue(baseView({ isPending: true }));

    render(<StandortUebersichtAnsicht />);

    expect(screen.getByRole('status')).toHaveTextContent('Daten werden geladen …');
  });

  it('zeigt eine Fehlermeldung, wenn die Endkunden-Liste nicht geladen werden konnte', () => {
    useStandortUebersichtViewMock.mockReturnValue(baseView({ isError: true }));

    render(<StandortUebersichtAnsicht />);

    expect(screen.getByRole('alert')).toHaveTextContent('Daten konnten nicht geladen werden.');
  });

  it('zeigt einen Leerzustand, solange noch KEIN Endkunde angelegt ist', () => {
    useStandortUebersichtViewMock.mockReturnValue(baseView({ endkunden: [] }));

    render(<StandortUebersichtAnsicht />);

    expect(screen.getByText(/noch keine Endkunden angelegt/)).toBeInTheDocument();
    expect(screen.queryByText('Endkunden-Tabelle (Stub)')).not.toBeInTheDocument();
  });

  it('zeigt die Endkunden-Auswahl, solange kein Endkunde ausgewählt ist', () => {
    useStandortUebersichtViewMock.mockReturnValue(baseView({ endkunden: [{ id: 'ek-1' }, { id: 'ek-2' }] }));

    render(<StandortUebersichtAnsicht />);

    expect(screen.getByText('Endkunden-Tabelle (Stub)')).toBeInTheDocument();
    expect(screen.queryByText(/Standort-Baum für/)).not.toBeInTheDocument();
  });

  it('wählt beim Klick auf die Zeilen-Aktion den Endkunden über den Hook aus (Verdrahtung Auswahl → Baum)', () => {
    const waehleEndkunde = vi.fn();
    useStandortUebersichtViewMock.mockReturnValue(baseView({ endkunden: [{ id: 'ek-1' }, { id: 'ek-2' }], waehleEndkunde }));

    render(<StandortUebersichtAnsicht />);
    fireEvent.click(screen.getByRole('button', { name: /Standorte anzeigen/ }));

    expect(waehleEndkunde).toHaveBeenCalledWith('ek-2');
  });

  it('zeigt bei GENAU EINEM Endkunden DIREKT den Standort-Baum, OHNE Auswahl-Liste UND OHNE Wechsel-Button', () => {
    useStandortUebersichtViewMock.mockReturnValue(
      baseView({ endkunden: [{ id: 'ek-1' }], nurEinEndkunde: true, ausgewaehlteEndkundeId: 'ek-1' }),
    );

    render(<StandortUebersichtAnsicht />);

    expect(screen.getByText('Standort-Baum für ek-1 (Stub)')).toBeInTheDocument();
    expect(screen.queryByText('Endkunden-Tabelle (Stub)')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Anderen Endkunden wählen' })).not.toBeInTheDocument();
  });

  it('bietet bei MEHREREN Endkunden nach einer Auswahl eine Möglichkeit, den Endkunden zu wechseln', () => {
    const wechsleEndkunde = vi.fn();
    useStandortUebersichtViewMock.mockReturnValue(
      baseView({ endkunden: [{ id: 'ek-1' }, { id: 'ek-2' }], ausgewaehlteEndkundeId: 'ek-1', wechsleEndkunde }),
    );

    render(<StandortUebersichtAnsicht />);
    expect(screen.getByText('Standort-Baum für ek-1 (Stub)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Anderen Endkunden wählen' }));
    expect(wechsleEndkunde).toHaveBeenCalled();
  });

  it('hat keine erkennbaren axe-Verstöße (Auswahl-Ansicht)', async () => {
    useStandortUebersichtViewMock.mockReturnValue(baseView({ endkunden: [{ id: 'ek-1' }, { id: 'ek-2' }] }));

    const { container } = render(<StandortUebersichtAnsicht />);

    expect(await runAxe(container)).toEqual([]);
  });

  it('hat keine erkennbaren axe-Verstöße (Baum-Ansicht)', async () => {
    useStandortUebersichtViewMock.mockReturnValue(
      baseView({ endkunden: [{ id: 'ek-1' }], nurEinEndkunde: true, ausgewaehlteEndkundeId: 'ek-1' }),
    );

    const { container } = render(<StandortUebersichtAnsicht />);

    expect(await runAxe(container)).toEqual([]);
  });
});
