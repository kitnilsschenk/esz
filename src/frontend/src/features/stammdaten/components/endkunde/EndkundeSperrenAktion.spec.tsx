import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { EndkundeSperrenAktion } from './EndkundeSperrenAktion';

const { useEndkundeSperrenViewMock, useKannStammdatenAnlegenMock } = vi.hoisted(() => ({
  useEndkundeSperrenViewMock: vi.fn(),
  useKannStammdatenAnlegenMock: vi.fn(),
}));

vi.mock('../../hooks/endkunde', () => ({ useEndkundeSperrenView: useEndkundeSperrenViewMock }));
vi.mock('../../hooks/shared/useKannStammdatenAnlegen', () => ({ useKannStammdatenAnlegen: useKannStammdatenAnlegenMock }));

const ENDKUNDE_ID = '0198c3aa-aaaa-7000-8000-000000000001';

describe('EndkundeSperrenAktion', () => {
  afterEach(() => {
    useEndkundeSperrenViewMock.mockReset();
    useKannStammdatenAnlegenMock.mockReset();
  });

  /** Der Auslöser ist gesperrt, bis ein Grund gewählt wurde (Art. 18 Abs. 1, Pflichtangabe). */
  function waehleGrund(wert: string): void {
    fireEvent.change(screen.getByLabelText(/Grund der Einschränkung/), { target: { value: wert } });
  }

  /**
   * Auflage C-8 — bei lit. b und lit. d erscheint ein zweites Pflichtfeld.
   * Ohne es bleibt der Auslöser gesperrt; das ist Absicht, nicht Zufall.
   */
  function waehleErhebung(wert: 'fortsetzen' | 'stoppen'): void {
    fireEvent.change(screen.getByLabelText(/Messdaten-Erhebung während der Einschränkung/), {
      target: { value: wert },
    });
  }

  it('öffnet einen Bestätigungsdialog beim Klick auf „Sperren" und ruft die Sperren-Aktion erst NACH Bestätigung auf', () => {
    const sperren = vi.fn();
    useEndkundeSperrenViewMock.mockReturnValue({ isSubmitting: false, submitErrorMessage: undefined, sperren });
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    render(<EndkundeSperrenAktion endkundeId={ENDKUNDE_ID} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    waehleGrund('art18_1a_richtigkeit');
    fireEvent.click(screen.getByRole('button', { name: 'Sperren' }));
    expect(sperren).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: 'Endkunde sperren' });

    // Trigger-Button UND Dialog-Bestätigen-Button tragen beide das Label
    // „Sperren" — `within(dialog)` grenzt eindeutig auf den Bestätigen-Button ein.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sperren' }));
    expect(sperren).toHaveBeenCalledTimes(1);
    expect(sperren).toHaveBeenCalledWith('art18_1a_richtigkeit');
  });

  it('bricht ab, ohne die Sperren-Aktion aufzurufen, wenn der Dialog abgebrochen wird', () => {
    const sperren = vi.fn();
    useEndkundeSperrenViewMock.mockReturnValue({ isSubmitting: false, submitErrorMessage: undefined, sperren });
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    render(<EndkundeSperrenAktion endkundeId={ENDKUNDE_ID} />);

    waehleGrund('art18_1d_widerspruch');
    waehleErhebung('fortsetzen');
    fireEvent.click(screen.getByRole('button', { name: 'Sperren' }));
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));

    expect(sperren).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // ADR-0007 A11.1: der Grund hat bewusst KEINEN Vorgabewert — er steuert eine
  // materielle Rechtsfolge (1a/1c => Ausweis mit Kennzeichnung, 1b/1d =>
  // Paar-Ausschluss im Nachweis) und ist eine fachliche Feststellung, kein
  // Formular-Default.
  it('sperrt den Auslöser, solange kein Grund gewählt wurde', () => {
    useEndkundeSperrenViewMock.mockReturnValue({ isSubmitting: false, submitErrorMessage: undefined, sperren: vi.fn() });
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    render(<EndkundeSperrenAktion endkundeId={ENDKUNDE_ID} />);

    expect(screen.getByRole('button', { name: 'Sperren' })).toBeDisabled();
    waehleGrund('art18_1a_richtigkeit');
    expect(screen.getByRole('button', { name: 'Sperren' })).toBeEnabled();
  });

  // ---- Auflage C-8 -----------------------------------------------------
  it('verlangt bei lit. b zusätzlich die Entscheidung über die weitere Erhebung', () => {
    useEndkundeSperrenViewMock.mockReturnValue({ isSubmitting: false, submitErrorMessage: undefined, sperren: vi.fn() });
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    render(<EndkundeSperrenAktion endkundeId={ENDKUNDE_ID} />);

    waehleGrund('art18_1b_unrechtmaessig');
    // Grund allein genügt hier NICHT — anders als bei lit. a.
    expect(screen.getByRole('button', { name: 'Sperren' })).toBeDisabled();
    waehleErhebung('stoppen');
    expect(screen.getByRole('button', { name: 'Sperren' })).toBeEnabled();
  });

  it('zeigt das Erhebungs-Feld bei lit. a und lit. c NICHT — dort stellt sich die Frage nicht', () => {
    useEndkundeSperrenViewMock.mockReturnValue({ isSubmitting: false, submitErrorMessage: undefined, sperren: vi.fn() });
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    render(<EndkundeSperrenAktion endkundeId={ENDKUNDE_ID} />);

    waehleGrund('art18_1a_richtigkeit');
    expect(screen.queryByLabelText(/Messdaten-Erhebung während der Einschränkung/)).not.toBeInTheDocument();
    waehleGrund('art18_1c_rechtsverteidigung_betroffener');
    expect(screen.queryByLabelText(/Messdaten-Erhebung während der Einschränkung/)).not.toBeInTheDocument();
  });

  it('reicht die Entscheidung als boolean durch — und bei lit. a gar nicht', () => {
    const sperren = vi.fn();
    useEndkundeSperrenViewMock.mockReturnValue({ isSubmitting: false, submitErrorMessage: undefined, sperren });
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    render(<EndkundeSperrenAktion endkundeId={ENDKUNDE_ID} />);

    waehleGrund('art18_1d_widerspruch');
    waehleErhebung('stoppen');
    fireEvent.click(screen.getByRole('button', { name: 'Sperren' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sperren' }));
    expect(sperren).toHaveBeenCalledWith('art18_1d_widerspruch', false);

    // Bei lit. a darf KEIN zweites Argument mitgehen — der Server weist eine
    // Angabe dort mit 400 zurück.
    waehleGrund('art18_1a_richtigkeit');
    fireEvent.click(screen.getByRole('button', { name: 'Sperren' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sperren' }));
    expect(sperren).toHaveBeenLastCalledWith('art18_1a_richtigkeit');
  });

  it('setzt eine getroffene Entscheidung zurück, wenn der Grund gewechselt wird', () => {
    // Sonst trüge die Sperre eine Antwort, die zu einem anderen Tatbestand
    // gegeben wurde.
    useEndkundeSperrenViewMock.mockReturnValue({ isSubmitting: false, submitErrorMessage: undefined, sperren: vi.fn() });
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    render(<EndkundeSperrenAktion endkundeId={ENDKUNDE_ID} />);

    waehleGrund('art18_1b_unrechtmaessig');
    waehleErhebung('fortsetzen');
    expect(screen.getByRole('button', { name: 'Sperren' })).toBeEnabled();

    waehleGrund('art18_1d_widerspruch');
    expect(screen.getByRole('button', { name: 'Sperren' })).toBeDisabled();
  });

  it('bietet genau die vier Tatbestände des Art. 18 Abs. 1 an — ohne Auffangoption', () => {
    useEndkundeSperrenViewMock.mockReturnValue({ isSubmitting: false, submitErrorMessage: undefined, sperren: vi.fn() });
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    render(<EndkundeSperrenAktion endkundeId={ENDKUNDE_ID} />);

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

  it('benennt den gewählten Grund im Bestätigungsdialog', () => {
    useEndkundeSperrenViewMock.mockReturnValue({ isSubmitting: false, submitErrorMessage: undefined, sperren: vi.fn() });
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    render(<EndkundeSperrenAktion endkundeId={ENDKUNDE_ID} />);

    waehleGrund('art18_1c_rechtsverteidigung_betroffener');
    fireEvent.click(screen.getByRole('button', { name: 'Sperren' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('Rechtsverteidigung');
  });

  it('deaktiviert den auslösenden Button während der Übermittlung', () => {
    useEndkundeSperrenViewMock.mockReturnValue({ isSubmitting: true, submitErrorMessage: undefined, sperren: vi.fn() });
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    render(<EndkundeSperrenAktion endkundeId={ENDKUNDE_ID} />);

    expect(screen.getByRole('button', { name: 'Sperren' })).toBeDisabled();
  });

  it('zeigt eine Server-Fehlermeldung, wenn die Mutation fehlschlägt', () => {
    useEndkundeSperrenViewMock.mockReturnValue({
      isSubmitting: false,
      submitErrorMessage: 'Endkunde konnte nicht gesperrt werden.',
      sperren: vi.fn(),
    });
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    render(<EndkundeSperrenAktion endkundeId={ENDKUNDE_ID} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Endkunde konnte nicht gesperrt werden.');
  });

  it('blendet die Aktion für Rollen ohne Berechtigung (kein `betrieb`) aus', () => {
    useEndkundeSperrenViewMock.mockReturnValue({ isSubmitting: false, submitErrorMessage: undefined, sperren: vi.fn() });
    useKannStammdatenAnlegenMock.mockReturnValue(false);

    const { container } = render(<EndkundeSperrenAktion endkundeId={ENDKUNDE_ID} />);

    expect(screen.queryByRole('button', { name: 'Sperren' })).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('hat keine erkennbaren axe-Verstöße (Dialog offen)', async () => {
    useEndkundeSperrenViewMock.mockReturnValue({ isSubmitting: false, submitErrorMessage: undefined, sperren: vi.fn() });
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    const { container } = render(<EndkundeSperrenAktion endkundeId={ENDKUNDE_ID} />);
    waehleGrund('art18_1a_richtigkeit');
    fireEvent.click(screen.getByRole('button', { name: 'Sperren' }));

    expect(await runAxe(container)).toEqual([]);
  });
});
