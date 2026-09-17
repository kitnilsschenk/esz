import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { AnschlussnutzerSperrenAktion } from './AnschlussnutzerSperrenAktion';

const { useAnschlussnutzerSperrenViewMock, useKannStammdatenAnlegenMock } = vi.hoisted(() => ({
  useAnschlussnutzerSperrenViewMock: vi.fn(),
  useKannStammdatenAnlegenMock: vi.fn(),
}));

vi.mock('../../hooks/anschlussnutzer', () => ({ useAnschlussnutzerSperrenView: useAnschlussnutzerSperrenViewMock }));
vi.mock('../../hooks/shared/useKannStammdatenAnlegen', () => ({ useKannStammdatenAnlegen: useKannStammdatenAnlegenMock }));

const ANSCHLUSSNUTZER_ID = '0198c3aa-bbbb-7000-8000-000000000001';

describe('AnschlussnutzerSperrenAktion', () => {
  afterEach(() => {
    useAnschlussnutzerSperrenViewMock.mockReset();
    useKannStammdatenAnlegenMock.mockReset();
  });

  function waehleGrund(wert: string): void {
    fireEvent.change(screen.getByLabelText(/Grund der Einschränkung/), { target: { value: wert } });
  }

  /** Auflage C-8 — zweites Pflichtfeld bei lit. b und lit. d. */
  function waehleErhebung(wert: 'fortsetzen' | 'stoppen'): void {
    fireEvent.change(screen.getByLabelText(/Messdaten-Erhebung während der Einschränkung/), {
      target: { value: wert },
    });
  }

  function mockView(overrides: Record<string, unknown> = {}): ReturnType<typeof vi.fn> {
    const sperren = vi.fn();
    useAnschlussnutzerSperrenViewMock.mockReturnValue({
      isSubmitting: false,
      submitErrorMessage: undefined,
      sperren,
      ...overrides,
    });
    useKannStammdatenAnlegenMock.mockReturnValue(true);
    return sperren;
  }

  it('reicht den gewählten Grund erst NACH Bestätigung durch', () => {
    const sperren = mockView();

    render(<AnschlussnutzerSperrenAktion anschlussnutzerId={ANSCHLUSSNUTZER_ID} />);

    waehleGrund('art18_1d_widerspruch');
    waehleErhebung('fortsetzen');
    fireEvent.click(screen.getByRole('button', { name: 'Sperren' }));
    expect(sperren).not.toHaveBeenCalled();

    const dialog = screen.getByRole('dialog', { name: 'Anschlussnutzer sperren' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sperren' }));

    expect(sperren).toHaveBeenCalledTimes(1);
    expect(sperren).toHaveBeenCalledWith('art18_1d_widerspruch', true);
  });

  // Auflage C-8 — beim Anschlussnutzer wiegt die Entscheidung schwerer als
  // beim Endkunden: das Ingest-Gate wertet alle aktiven Nutzungsverhaeltnisse
  // eines Systems gemeinsam aus, ein „stoppen" trifft deshalb auch die
  // uebrigen Bewohner desselben Systems.
  it('verlangt bei lit. b zusätzlich die Entscheidung über die weitere Erhebung', () => {
    mockView();

    render(<AnschlussnutzerSperrenAktion anschlussnutzerId={ANSCHLUSSNUTZER_ID} />);

    waehleGrund('art18_1b_unrechtmaessig');
    expect(screen.getByRole('button', { name: 'Sperren' })).toBeDisabled();
    waehleErhebung('stoppen');
    expect(screen.getByRole('button', { name: 'Sperren' })).toBeEnabled();
  });

  it('zeigt das Erhebungs-Feld bei lit. a nicht', () => {
    mockView();

    render(<AnschlussnutzerSperrenAktion anschlussnutzerId={ANSCHLUSSNUTZER_ID} />);

    waehleGrund('art18_1a_richtigkeit');
    expect(screen.queryByLabelText(/Messdaten-Erhebung während der Einschränkung/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sperren' })).toBeEnabled();
  });

  // ADR-0007 A11.1 — kein Vorgabewert: der Grund steuert eine materielle
  // Rechtsfolge (1a/1c => Ausweis mit Kennzeichnung unter FJ-11b, 1b/1d =>
  // Paar-Ausschluss unter FJ-11c).
  it('sperrt den Auslöser, solange kein Grund gewählt wurde', () => {
    mockView();

    render(<AnschlussnutzerSperrenAktion anschlussnutzerId={ANSCHLUSSNUTZER_ID} />);

    expect(screen.getByRole('button', { name: 'Sperren' })).toBeDisabled();
    waehleGrund('art18_1a_richtigkeit');
    expect(screen.getByRole('button', { name: 'Sperren' })).toBeEnabled();
  });

  it('bietet genau die vier Tatbestände des Art. 18 Abs. 1 an — ohne Auffangoption', () => {
    mockView();

    render(<AnschlussnutzerSperrenAktion anschlussnutzerId={ANSCHLUSSNUTZER_ID} />);

    const werte = screen
      .getAllByRole('option')
      .map((option) => (option as HTMLOptionElement).value)
      .filter((wert) => wert !== '');
    expect(werte).toEqual([
      'art18_1a_richtigkeit',
      'art18_1b_unrechtmaessig',
      'art18_1c_rechtsverteidigung_betroffener',
      'art18_1d_widerspruch',
    ]);
  });

  it('benennt im Dialog, dass die Einschränkung unabhängig vom Endkunden wirkt', () => {
    mockView();

    render(<AnschlussnutzerSperrenAktion anschlussnutzerId={ANSCHLUSSNUTZER_ID} />);

    waehleGrund('art18_1a_richtigkeit');
    fireEvent.click(screen.getByRole('button', { name: 'Sperren' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('unabhängig von der des Endkunden');
  });

  it('zeigt eine Server-Fehlermeldung, wenn die Mutation fehlschlägt', () => {
    mockView({ submitErrorMessage: 'Anschlussnutzer konnte nicht gesperrt werden.' });

    render(<AnschlussnutzerSperrenAktion anschlussnutzerId={ANSCHLUSSNUTZER_ID} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Anschlussnutzer konnte nicht gesperrt werden.');
  });

  it('blendet die Aktion für Rollen ohne Berechtigung aus', () => {
    mockView();
    useKannStammdatenAnlegenMock.mockReturnValue(false);

    const { container } = render(<AnschlussnutzerSperrenAktion anschlussnutzerId={ANSCHLUSSNUTZER_ID} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('hat keine erkennbaren axe-Verstöße (Dialog offen)', async () => {
    mockView();

    const { container } = render(<AnschlussnutzerSperrenAktion anschlussnutzerId={ANSCHLUSSNUTZER_ID} />);
    waehleGrund('art18_1a_richtigkeit');
    fireEvent.click(screen.getByRole('button', { name: 'Sperren' }));

    expect(await runAxe(container)).toEqual([]);
  });
});
