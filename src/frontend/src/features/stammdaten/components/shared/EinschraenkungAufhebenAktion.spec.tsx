import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { EinschraenkungAufhebenAktion } from './EinschraenkungAufhebenAktion';

function props(overrides: {
  readonly unterrichten?: ReturnType<typeof vi.fn>;
  readonly entsperren?: ReturnType<typeof vi.fn>;
  readonly aufhebungFehler?: string;
} = {}) {
  return {
    unterrichtung: {
      isSubmitting: false,
      submitErrorMessage: undefined,
      erfolgsMeldung: undefined,
      unterrichten: overrides.unterrichten ?? vi.fn(),
    },
    aufhebung: {
      isSubmitting: false,
      submitErrorMessage: overrides.aufhebungFehler,
      erfolgsMeldung: undefined,
      entsperren: overrides.entsperren ?? vi.fn(),
    },
  };
}

describe('EinschraenkungAufhebenAktion (Art. 18 Abs. 3, ADR-0007 A11.10)', () => {
  it('reicht den gewählten Weg der Unterrichtung durch', () => {
    const unterrichten = vi.fn();

    render(<EinschraenkungAufhebenAktion {...props({ unterrichten })} />);

    fireEvent.change(screen.getByLabelText('Weg der Unterrichtung'), { target: { value: 'telefonisch' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unterrichtung dokumentieren' }));

    expect(unterrichten).toHaveBeenCalledTimes(1);
    expect(unterrichten).toHaveBeenCalledWith('telefonisch');
  });

  // Wie beim Sperrgrund: keine Vorbelegung — auf welchem Weg unterrichtet
  // wurde, ist eine Feststellung, kein Formular-Default.
  it('sperrt die Dokumentation, solange kein Weg gewählt wurde', () => {
    render(<EinschraenkungAufhebenAktion {...props()} />);

    expect(screen.getByRole('button', { name: 'Unterrichtung dokumentieren' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Weg der Unterrichtung'), { target: { value: 'postalisch' } });
    expect(screen.getByRole('button', { name: 'Unterrichtung dokumentieren' })).toBeEnabled();
  });

  it('bietet genau die vier Wege der geschlossenen Liste an', () => {
    render(<EinschraenkungAufhebenAktion {...props()} />);

    const werte = screen
      .getAllByRole('option')
      .map((option) => (option as HTMLOptionElement).value)
      .filter((wert) => wert !== '');
    expect(werte).toEqual(['postalisch', 'elektronisch', 'telefonisch', 'persoenlich']);
  });

  it('hebt erst nach Bestätigung auf', () => {
    const entsperren = vi.fn();

    render(<EinschraenkungAufhebenAktion {...props({ entsperren })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Einschränkung aufheben' }));
    expect(entsperren).not.toHaveBeenCalled();

    const dialog = screen.getByRole('dialog', { name: 'Einschränkung aufheben' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Einschränkung aufheben' }));
    expect(entsperren).toHaveBeenCalledTimes(1);
  });

  /**
   * Der Aufhebungs-Knopf bleibt bewusst anklickbar, auch ohne dokumentierte
   * Unterrichtung: die Kontrolle liegt serverseitig (fail-closed, 409). Ihn
   * clientseitig zu sperren würde eine Kontrolle vortäuschen, die er nicht
   * ist — und aus veraltetem Cache falsch sein können.
   */
  it('zeigt die Server-Begründung, wenn die Aufhebung mangels Unterrichtung scheitert', () => {
    render(
      <EinschraenkungAufhebenAktion
        {...props({ aufhebungFehler: 'Die Aufhebung setzt voraus, dass die betroffene Person zuvor unterrichtet wurde.' })}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('zuvor unterrichtet wurde');
    expect(screen.getByRole('button', { name: 'Einschränkung aufheben' })).toBeEnabled();
  });

  it('benennt beide Schritte und ihre Abhängigkeit', () => {
    render(<EinschraenkungAufhebenAktion {...props()} />);

    expect(screen.getByText(/Schritt 1/)).toBeInTheDocument();
    expect(screen.getByText(/Schritt 2/)).toBeInTheDocument();
    expect(screen.getByText(/erst möglich, nachdem die Unterrichtung/)).toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße (Dialog offen)', async () => {
    const { container } = render(<EinschraenkungAufhebenAktion {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Einschränkung aufheben' }));

    expect(await runAxe(container)).toEqual([]);
  });
});
