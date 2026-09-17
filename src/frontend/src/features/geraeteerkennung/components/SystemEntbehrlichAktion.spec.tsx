import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../shared/testing/axe';
import { SystemEntbehrlichAktion } from './SystemEntbehrlichAktion';

const { viewMock } = vi.hoisted(() => ({ viewMock: vi.fn() }));

vi.mock('../hooks/useSystemEntbehrlichView', () => ({ useSystemEntbehrlichView: viewMock }));

const SYSTEM_ID = '018f1e2d-0000-7000-8000-0000000000c1';

const setzeEntbehrlich = vi.fn();
const setzeGrund = vi.fn();
const speichere = vi.fn();

function mockView(overrides: Record<string, unknown> = {}): void {
  viewMock.mockReturnValue({
    isPending: false,
    isError: false,
    ladeFehlerMeldung: 'Ladefehler',
    entbehrlich: false,
    setzeEntbehrlich,
    grund: '',
    setzeGrund,
    absendbar: true,
    speichere,
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
    <>
      <h1>System</h1>
      <SystemEntbehrlichAktion systemId={SYSTEM_ID} />
    </>,
  );
  return container;
}

describe('SystemEntbehrlichAktion', () => {
  it('zeigt einen bereits gesetzten Vermerk samt Begründung', () => {
    // Ohne den gelesenen Stand waere die Checkbox schreib-only: Wer sie setzt
    // und speichert, ueberschriebe die Begruendung eines anderen.
    mockView({ entbehrlich: true, grund: 'System umfasst nur ein Gerät.' });

    rendere();

    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(screen.getByLabelText('Begründung')).toHaveValue('System umfasst nur ein Gerät.');
  });

  it('blendet die Begründung ohne Häkchen aus', () => {
    mockView({ entbehrlich: false });

    rendere();

    expect(screen.queryByLabelText('Begründung')).not.toBeInTheDocument();
  });

  it('warnt sichtbar, dass der Vermerk eine Förderauflage für erfüllt erklärt', () => {
    mockView({ entbehrlich: true, grund: 'nur ein Gerät' });

    rendere();

    expect(
      screen.getByText(/erklärt eine Förderauflage für dieses System als erfüllt/),
    ).toBeInTheDocument();
  });

  it('sperrt das Speichern, solange die Begründung fehlt', () => {
    mockView({ entbehrlich: true, grund: '', absendbar: false });

    rendere();

    expect(screen.getByRole('button', { name: 'Vermerk speichern' })).toBeDisabled();
  });

  it('speichert auf Klick', () => {
    mockView({ entbehrlich: true, grund: 'nur ein Gerät', absendbar: true });

    rendere();
    fireEvent.click(screen.getByRole('button', { name: 'Vermerk speichern' }));

    expect(speichere).toHaveBeenCalledTimes(1);
  });

  it('reicht das Häkchen an die View weiter', () => {
    mockView();

    rendere();
    fireEvent.click(screen.getByRole('checkbox'));

    expect(setzeEntbehrlich).toHaveBeenCalledWith(true);
  });

  it('meldet einen Ladefehler und zeigt dann keine Aktion', () => {
    mockView({ isError: true });

    rendere();

    expect(screen.getByRole('alert')).toHaveTextContent('Ladefehler');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('ist barrierefrei', async () => {
    mockView({ entbehrlich: true, grund: 'nur ein Gerät' });

    expect(await runAxe(rendere())).toEqual([]);
  });
});
