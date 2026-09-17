import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { SystemgrenzeAbschnitt } from './SystemgrenzeAbschnitt';

const { grenzeMock, setzenMock } = vi.hoisted(() => ({ grenzeMock: vi.fn(), setzenMock: vi.fn() }));

vi.mock('../../api/messkonzept', () => ({
  useSystemgrenze: grenzeMock,
  useSystemgrenzeSetzen: setzenMock,
}));

const MVET_ID = '018f1e2d-0000-7000-8000-0000000000a1';
const SYSTEM_A = '018f1e2d-0000-7000-8000-0000000000b1';
const SYSTEM_B = '018f1e2d-0000-7000-8000-0000000000b2';

function mutation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { mutate: vi.fn(), isPending: false, isError: false, isSuccess: false, ...overrides };
}

afterEach(() => {
  vi.clearAllMocks();
});

function rendere(daten: Record<string, unknown>, setzen = mutation()): HTMLElement {
  grenzeMock.mockReturnValue({ isPending: false, isError: false, ...daten });
  setzenMock.mockReturnValue(setzen);
  const { container } = render(
    <>
      <h1>Messkonzept</h1>
      <h2>Energietraeger</h2>
      <SystemgrenzeAbschnitt mvetId={MVET_ID} energietraegerLabel="Strom" headingId="grenze-heading" />
    </>,
  );
  return container;
}

const LEER = {
  data: {
    mvetId: MVET_ID,
    energietraeger: 'strom',
    systeme: [],
    waehlbar: [
      { systemId: SYSTEM_A, bezeichnung: 'Halle A' },
      { systemId: SYSTEM_B, bezeichnung: 'Halle B' },
    ],
    greiftFallback: true,
  },
};

const GESETZT = {
  data: {
    ...LEER.data,
    systeme: [{ systemId: SYSTEM_A, bezeichnung: 'Halle A' }],
    greiftFallback: false,
  },
};

describe('SystemgrenzeAbschnitt', () => {
  it('warnt bei leerer Grenze — sie ist kein neutraler Anfangszustand', () => {
    // Ohne Zuordnung nimmt der Berechnungslauf ALLE Zaehler des Endkunden.
    // Bei mehreren Messkonzepten fliesst dabei fremder Verbrauch ein.
    rendere(LEER);

    expect(screen.getByRole('alert')).toHaveTextContent('kein System zugeordnet');
    expect(screen.getByRole('alert')).toHaveTextContent('fremder Verbrauch');
  });

  it('zeigt die zugeordneten Systeme und warnt dann NICHT', () => {
    rendere(GESETZT);

    expect(screen.getByText('Halle A')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('nennt den Energietraeger in der Ueberschrift — Strom und Waerme haben eigene Grenzen', () => {
    rendere(GESETZT);

    expect(screen.getByRole('heading', { name: /Systemgrenze · Strom/ })).toBeInTheDocument();
  });

  it('oeffnet die Bearbeitung mit dem AKTUELLEN Stand als Vorauswahl', () => {
    rendere(GESETZT);

    fireEvent.click(screen.getByRole('button', { name: 'Systemgrenze ändern' }));

    expect(screen.getByRole('checkbox', { name: 'Halle A' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Halle B' })).not.toBeChecked();
  });

  it('sendet die ganze Menge, nicht die Aenderung', () => {
    const setzen = mutation();
    rendere(GESETZT, setzen);

    fireEvent.click(screen.getByRole('button', { name: 'Systemgrenze ändern' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Halle B' }));
    fireEvent.click(screen.getByRole('button', { name: 'Systemgrenze speichern' }));

    expect(setzen['mutate']).toHaveBeenCalled();
    const argumente = (setzen['mutate'] as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string[];
    expect([...argumente].sort()).toEqual([SYSTEM_A, SYSTEM_B].sort());
  });

  it('laesst sich abbrechen, ohne zu speichern', () => {
    const setzen = mutation();
    rendere(GESETZT, setzen);

    fireEvent.click(screen.getByRole('button', { name: 'Systemgrenze ändern' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Halle B' }));
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));

    expect(setzen['mutate']).not.toHaveBeenCalled();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('sagt, dass bereits gerechnete Laeufe unveraendert bleiben', () => {
    rendere(GESETZT);

    expect(screen.getByText(/Bereits gerechnete Läufe bleiben unverändert/)).toBeInTheDocument();
  });

  it('sagt es, wenn es gar kein System zum Zuordnen gibt', () => {
    rendere({ data: { ...LEER.data, waehlbar: [] } });

    expect(screen.getByText(/noch kein System angelegt/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Systemgrenze ändern' })).not.toBeInTheDocument();
  });

  it('meldet einen Ladefehler', () => {
    rendere({ isError: true, data: undefined });

    expect(screen.getByRole('alert')).toHaveTextContent('konnte nicht geladen werden');
  });

  it('meldet einen fehlgeschlagenen Speicherversuch', () => {
    rendere(GESETZT, mutation({ isError: true }));

    expect(screen.getByRole('alert')).toHaveTextContent('konnte nicht gespeichert werden');
  });

  it('ist barrierefrei', async () => {
    expect(await runAxe(rendere(GESETZT))).toEqual([]);
  });
});
