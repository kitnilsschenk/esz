import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../shared/testing/axe';
import { MesskanalZuordnungAktion } from './MesskanalZuordnungAktion';

const { viewMock } = vi.hoisted(() => ({ viewMock: vi.fn() }));

vi.mock('../hooks/useMesskanalZuordnungView', () => ({ useMesskanalZuordnungView: viewMock }));

const MESSKANAL_ID = '018f1e2d-0000-7000-8000-0000000000d1';
const ENDKUNDE_ID = '018f1e2d-0000-7000-8000-0000000000f1';
const GRUPPE_ID = '018f1e2d-0000-7000-8000-0000000000f2';

const zuordnen = vi.fn();

function mockView(overrides: Record<string, unknown> = {}): void {
  viewMock.mockReturnValue({
    endkundeId: ENDKUNDE_ID,
    isPending: false,
    isError: false,
    ladeFehlerMeldung: 'Ladefehler',
    ohneGruppen: false,
    ohneGruppenMeldung: 'Noch keine Gerätegruppe angelegt.',
    gruppenOptionen: [{ value: GRUPPE_ID, label: 'Beleuchtung' }],
    methodenOptionen: [
      { value: 'direktmessung', label: 'Direktmessung' },
      { value: 'algorithmus', label: 'Algorithmus-Erkennung' },
    ],
    zuordnen,
    isSubmitting: false,
    submitErrorMessage: undefined,
    erfolgsMeldung: undefined,
    ...overrides,
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

function rendere(): HTMLElement {
  const { container } = render(
    <MemoryRouter>
      <h1>Messkanal</h1>
      <MesskanalZuordnungAktion messkanalId={MESSKANAL_ID} />
    </MemoryRouter>,
  );
  return container;
}

describe('MesskanalZuordnungAktion', () => {
  it('bietet Gruppe und Methode zur Auswahl', () => {
    mockView();

    rendere();

    expect(screen.getByRole('option', { name: 'Beleuchtung' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Direktmessung' })).toBeInTheDocument();
  });

  it('zeigt statt eines leeren Formulars den Weg zur Gruppe', () => {
    // Ein Formular, dessen Pflichtfeld nichts zur Auswahl hat, ist eine
    // Sackgasse mit Absende-Knopf.
    mockView({ ohneGruppen: true });

    rendere();

    expect(screen.getByText(/Noch keine Gerätegruppe angelegt/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zum Endkunden' })).toHaveAttribute(
      'href',
      `/stammdaten/endkunden/${ENDKUNDE_ID}`,
    );
    expect(screen.queryByRole('button', { name: 'Zuordnung anlegen' })).not.toBeInTheDocument();
  });

  it('verlangt die Genauigkeit, sobald nicht direkt gemessen wird', () => {
    mockView();
    rendere();

    fireEvent.change(screen.getByLabelText(/Erhebungsmethode/), { target: { value: 'algorithmus' } });
    fireEvent.change(screen.getByLabelText(/Gerätegruppe/), { target: { value: GRUPPE_ID } });
    fireEvent.change(screen.getByLabelText(/Gültig ab/), { target: { value: '2026-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Zuordnung anlegen' }));

    expect(
      screen.getByText('Ohne Direktmessung ist die Genauigkeit anzugeben (größer 0 bis 100).'),
    ).toBeInTheDocument();
    expect(zuordnen).not.toHaveBeenCalled();
  });

  it('lässt die Genauigkeit bei Direktmessung offen und sendet ab', () => {
    mockView();
    rendere();

    fireEvent.change(screen.getByLabelText(/Gerätegruppe/), { target: { value: GRUPPE_ID } });
    fireEvent.change(screen.getByLabelText(/Erhebungsmethode/), { target: { value: 'direktmessung' } });
    fireEvent.change(screen.getByLabelText(/Gültig ab/), { target: { value: '2026-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Zuordnung anlegen' }));

    expect(zuordnen).toHaveBeenCalledTimes(1);
    expect(zuordnen.mock.calls[0]?.[0]).toMatchObject({
      geraetegruppeId: GRUPPE_ID,
      methode: 'direktmessung',
      anteilProzent: '100',
      gueltigVon: '2026-01-01',
    });
  });

  it('meldet einen Ladefehler', () => {
    mockView({ isError: true });

    rendere();

    expect(screen.getByRole('alert')).toHaveTextContent('Ladefehler');
  });

  it('ist barrierefrei', async () => {
    mockView();

    expect(await runAxe(rendere())).toEqual([]);
  });
});
