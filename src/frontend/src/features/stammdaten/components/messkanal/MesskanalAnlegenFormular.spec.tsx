import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { MesskanalAnlegenFormular } from './MesskanalAnlegenFormular';

const { useMesskanalAnlegenViewMock } = vi.hoisted(() => ({
  useMesskanalAnlegenViewMock: vi.fn(),
}));

vi.mock('../../hooks/messkanal', () => ({ useMesskanalAnlegenView: useMesskanalAnlegenViewMock }));

const ZAEHLER_ID = '0198c3aa-aaaa-7000-8000-000000000001';
const ART_OPTIONEN = [{ value: 'kumulativ_zaehlerstand', label: 'kumulativer Zählerstand' }];

describe('MesskanalAnlegenFormular', () => {
  afterEach(() => {
    useMesskanalAnlegenViewMock.mockReset();
  });

  it('ruft submit erst NACH erfolgreicher Zod-Validierung auf (Messgröße/Einheit/Art Pflicht)', () => {
    const submit = vi.fn();
    useMesskanalAnlegenViewMock.mockReturnValue({
      isSubmitting: false,
      submitErrorMessage: undefined,
      artOptionen: ART_OPTIONEN,
      richtungOptionen: [{ value: 'bezug', label: 'Bezug (Verbrauch)' }],
      submit,
    });

    render(<MesskanalAnlegenFormular zaehlerId={ZAEHLER_ID} />);

    fireEvent.click(screen.getByRole('button', { name: 'Anlegen' }));
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByText('Messgröße ist erforderlich.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Messgröße'), { target: { value: 'wirkarbeit' } });
    fireEvent.change(screen.getByLabelText('Einheit'), { target: { value: 'kWh' } });
    fireEvent.change(screen.getByLabelText('Art'), { target: { value: 'kumulativ_zaehlerstand' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anlegen' }));

    expect(submit).toHaveBeenCalledWith({
      messgroesse: 'wirkarbeit',
      einheit: 'kWh',
      art: 'kumulativ_zaehlerstand',
      obisKennzahl: '',
      // Hauptmessung ist der Vorgabewert — ein stilles `true` naehme den Kanal
      // unbemerkt aus der Einsparberechnung (V0058).
      istUntermessung: false,
      richtung: 'bezug',
    });
  });

  it('zeigt eine Server-Fehlermeldung, wenn die Mutation fehlschlägt', () => {
    useMesskanalAnlegenViewMock.mockReturnValue({
      isSubmitting: false,
      submitErrorMessage: 'Messkanal konnte nicht angelegt werden.',
      artOptionen: ART_OPTIONEN,
      richtungOptionen: [{ value: 'bezug', label: 'Bezug (Verbrauch)' }],
      submit: vi.fn(),
    });

    render(<MesskanalAnlegenFormular zaehlerId={ZAEHLER_ID} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Messkanal konnte nicht angelegt werden.');
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useMesskanalAnlegenViewMock.mockReturnValue({
      isSubmitting: false,
      submitErrorMessage: undefined,
      artOptionen: ART_OPTIONEN,
      richtungOptionen: [{ value: 'bezug', label: 'Bezug (Verbrauch)' }],
      submit: vi.fn(),
    });

    const { container } = render(<MesskanalAnlegenFormular zaehlerId={ZAEHLER_ID} />);

    expect(await runAxe(container)).toEqual([]);
  });
});
