import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { EndkundeShreddenAktion } from './EndkundeShreddenAktion';

const { useEndkundeShredBeantragenViewMock, useKannStammdatenAnlegenMock } = vi.hoisted(() => ({
  useEndkundeShredBeantragenViewMock: vi.fn(),
  useKannStammdatenAnlegenMock: vi.fn(),
}));

vi.mock('../../hooks/endkunde', () => ({ useEndkundeShredBeantragenView: useEndkundeShredBeantragenViewMock }));
vi.mock('../../hooks/shared/useKannStammdatenAnlegen', () => ({ useKannStammdatenAnlegen: useKannStammdatenAnlegenMock }));

const ENDKUNDE_ID = '0198c3aa-aaaa-7000-8000-000000000001';

describe('EndkundeShreddenAktion', () => {
  afterEach(() => {
    useEndkundeShredBeantragenViewMock.mockReset();
    useKannStammdatenAnlegenMock.mockReset();
  });

  it('öffnet einen Bestätigungsdialog mit Type-to-confirm, dessen Bestätigen-Button erst nach exakter Eingabe von „BEANTRAGEN" aktiv wird', () => {
    const beantragen = vi.fn();
    useEndkundeShredBeantragenViewMock.mockReturnValue({ isSubmitting: false, submitErrorMessage: undefined, beantragen });
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    render(<EndkundeShreddenAktion endkundeId={ENDKUNDE_ID} />);

    fireEvent.click(screen.getByRole('button', { name: 'Krypto-Shredding beantragen' }));
    const dialog = screen.getByRole('dialog', { name: 'Krypto-Shredding beantragen' });
    const bestaetigenButton = within(dialog).getByRole('button', { name: 'Antrag stellen' });

    expect(bestaetigenButton).toBeDisabled();
    expect(beantragen).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText('Zur Bestätigung „BEANTRAGEN" eingeben'), {
      target: { value: 'falsch' },
    });
    expect(bestaetigenButton).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText('Zur Bestätigung „BEANTRAGEN" eingeben'), {
      target: { value: 'BEANTRAGEN' },
    });
    expect(bestaetigenButton).not.toBeDisabled();

    fireEvent.click(bestaetigenButton);
    expect(beantragen).toHaveBeenCalledTimes(1);
    // Default-Grund (erste Option), solange der Nutzer keinen anderen wählt.
    expect(beantragen).toHaveBeenCalledWith('betroffenenantrag_art17');
  });

  it('übergibt den vom Nutzer gewählten Löschgrund an die Beantragen-Aktion', () => {
    const beantragen = vi.fn();
    useEndkundeShredBeantragenViewMock.mockReturnValue({ isSubmitting: false, submitErrorMessage: undefined, beantragen });
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    render(<EndkundeShreddenAktion endkundeId={ENDKUNDE_ID} />);

    fireEvent.click(screen.getByRole('button', { name: 'Krypto-Shredding beantragen' }));
    const dialog = screen.getByRole('dialog', { name: 'Krypto-Shredding beantragen' });

    fireEvent.change(within(dialog).getByLabelText('Löschgrund'), { target: { value: 'aufbewahrung_abgelaufen' } });
    fireEvent.change(within(dialog).getByLabelText('Zur Bestätigung „BEANTRAGEN" eingeben'), {
      target: { value: 'BEANTRAGEN' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Antrag stellen' }));

    expect(beantragen).toHaveBeenCalledWith('aufbewahrung_abgelaufen');
  });

  it('erklärt im Dialog, dass ein ANTRAG gestellt wird, der erst durch eine zweite Person freigegeben werden muss', () => {
    useEndkundeShredBeantragenViewMock.mockReturnValue({ isSubmitting: false, submitErrorMessage: undefined, beantragen: vi.fn() });
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    render(<EndkundeShreddenAktion endkundeId={ENDKUNDE_ID} />);
    fireEvent.click(screen.getByRole('button', { name: 'Krypto-Shredding beantragen' }));

    expect(
      screen.getByText(
        'Es wird ein Antrag auf endgültige Löschung (Art. 17 DSGVO) gestellt. Der Endkunde wird dadurch NICHT sofort geschreddert — eine zweite Person muss den Antrag freigeben (Vier-Augen-Prinzip), bevor der Verschlüsselungsschlüssel vernichtet wird.',
      ),
    ).toBeInTheDocument();
  });

  it('bricht ab, ohne die Beantragen-Aktion aufzurufen, wenn der Dialog abgebrochen wird', () => {
    const beantragen = vi.fn();
    useEndkundeShredBeantragenViewMock.mockReturnValue({ isSubmitting: false, submitErrorMessage: undefined, beantragen });
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    render(<EndkundeShreddenAktion endkundeId={ENDKUNDE_ID} />);

    fireEvent.click(screen.getByRole('button', { name: 'Krypto-Shredding beantragen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));

    expect(beantragen).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('zeigt eine Server-Fehlermeldung, wenn die Mutation fehlschlägt', () => {
    useEndkundeShredBeantragenViewMock.mockReturnValue({
      isSubmitting: false,
      submitErrorMessage: 'Antrag konnte nicht gestellt werden.',
      beantragen: vi.fn(),
    });
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    render(<EndkundeShreddenAktion endkundeId={ENDKUNDE_ID} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Antrag konnte nicht gestellt werden.');
  });

  it('blendet die Aktion für Rollen ohne Berechtigung (kein `betrieb`) aus', () => {
    useEndkundeShredBeantragenViewMock.mockReturnValue({ isSubmitting: false, submitErrorMessage: undefined, beantragen: vi.fn() });
    useKannStammdatenAnlegenMock.mockReturnValue(false);

    const { container } = render(<EndkundeShreddenAktion endkundeId={ENDKUNDE_ID} />);

    expect(screen.queryByRole('button', { name: 'Krypto-Shredding beantragen' })).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('hat keine erkennbaren axe-Verstöße (Dialog offen)', async () => {
    useEndkundeShredBeantragenViewMock.mockReturnValue({ isSubmitting: false, submitErrorMessage: undefined, beantragen: vi.fn() });
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    const { container } = render(<EndkundeShreddenAktion endkundeId={ENDKUNDE_ID} />);
    fireEvent.click(screen.getByRole('button', { name: 'Krypto-Shredding beantragen' }));

    expect(await runAxe(container)).toEqual([]);
  });
});
