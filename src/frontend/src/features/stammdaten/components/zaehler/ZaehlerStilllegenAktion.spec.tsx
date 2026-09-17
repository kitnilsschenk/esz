import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { ZaehlerStilllegenAktion } from './ZaehlerStilllegenAktion';

const { useZaehlerStilllegenViewMock } = vi.hoisted(() => ({
  useZaehlerStilllegenViewMock: vi.fn(),
}));

vi.mock('../../hooks/zaehler', () => ({ useZaehlerStilllegenView: useZaehlerStilllegenViewMock }));

const ZAEHLER_ID = '0198c3aa-aaaa-7000-8000-000000000001';

describe('ZaehlerStilllegenAktion', () => {
  afterEach(() => {
    useZaehlerStilllegenViewMock.mockReset();
  });

  it('ruft die Stilllegen-Aktion beim Klick auf', () => {
    const stilllegen = vi.fn();
    useZaehlerStilllegenViewMock.mockReturnValue({ isSubmitting: false, submitErrorMessage: undefined, stilllegen });

    render(<ZaehlerStilllegenAktion zaehlerId={ZAEHLER_ID} />);

    fireEvent.click(screen.getByRole('button', { name: 'Stilllegen' }));

    expect(stilllegen).toHaveBeenCalled();
  });

  it('deaktiviert den Button während der Übermittlung', () => {
    useZaehlerStilllegenViewMock.mockReturnValue({ isSubmitting: true, submitErrorMessage: undefined, stilllegen: vi.fn() });

    render(<ZaehlerStilllegenAktion zaehlerId={ZAEHLER_ID} />);

    expect(screen.getByRole('button', { name: 'Stilllegen' })).toBeDisabled();
  });

  it('zeigt eine Server-Fehlermeldung, wenn die Mutation fehlschlägt', () => {
    useZaehlerStilllegenViewMock.mockReturnValue({
      isSubmitting: false,
      submitErrorMessage: 'Zähler konnte nicht stillgelegt werden.',
      stilllegen: vi.fn(),
    });

    render(<ZaehlerStilllegenAktion zaehlerId={ZAEHLER_ID} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Zähler konnte nicht stillgelegt werden.');
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useZaehlerStilllegenViewMock.mockReturnValue({ isSubmitting: false, submitErrorMessage: undefined, stilllegen: vi.fn() });

    const { container } = render(<ZaehlerStilllegenAktion zaehlerId={ZAEHLER_ID} />);

    expect(await runAxe(container)).toEqual([]);
  });
});
