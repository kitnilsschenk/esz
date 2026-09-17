import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { SystemStilllegenAktion } from './SystemStilllegenAktion';

const { useSystemStilllegenViewMock, useKannStammdatenAnlegenMock } = vi.hoisted(() => ({
  useSystemStilllegenViewMock: vi.fn(),
  useKannStammdatenAnlegenMock: vi.fn(),
}));

vi.mock('../../hooks/system', () => ({ useSystemStilllegenView: useSystemStilllegenViewMock }));
vi.mock('../../hooks/shared/useKannStammdatenAnlegen', () => ({ useKannStammdatenAnlegen: useKannStammdatenAnlegenMock }));

const SYSTEM_ID = '0198c3aa-aaaa-7000-8000-000000000001';

describe('SystemStilllegenAktion', () => {
  afterEach(() => {
    useSystemStilllegenViewMock.mockReset();
    useKannStammdatenAnlegenMock.mockReset();
  });

  it('ruft die Stilllegen-Aktion beim Klick auf', () => {
    const stilllegen = vi.fn();
    useSystemStilllegenViewMock.mockReturnValue({ isSubmitting: false, submitErrorMessage: undefined, stilllegen });
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    render(<SystemStilllegenAktion systemId={SYSTEM_ID} />);

    fireEvent.click(screen.getByRole('button', { name: 'Stilllegen' }));

    expect(stilllegen).toHaveBeenCalled();
  });

  it('deaktiviert den Button während der Übermittlung', () => {
    useSystemStilllegenViewMock.mockReturnValue({ isSubmitting: true, submitErrorMessage: undefined, stilllegen: vi.fn() });
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    render(<SystemStilllegenAktion systemId={SYSTEM_ID} />);

    expect(screen.getByRole('button', { name: 'Stilllegen' })).toBeDisabled();
  });

  it('zeigt eine Server-Fehlermeldung, wenn die Mutation fehlschlägt', () => {
    useSystemStilllegenViewMock.mockReturnValue({
      isSubmitting: false,
      submitErrorMessage: 'System konnte nicht stillgelegt werden.',
      stilllegen: vi.fn(),
    });
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    render(<SystemStilllegenAktion systemId={SYSTEM_ID} />);

    expect(screen.getByRole('alert')).toHaveTextContent('System konnte nicht stillgelegt werden.');
  });

  it('blendet die Aktion für Rollen ohne Anlegen-/Stilllegen-Berechtigung (kein `betrieb`) aus', () => {
    useSystemStilllegenViewMock.mockReturnValue({ isSubmitting: false, submitErrorMessage: undefined, stilllegen: vi.fn() });
    useKannStammdatenAnlegenMock.mockReturnValue(false);

    const { container } = render(<SystemStilllegenAktion systemId={SYSTEM_ID} />);

    expect(screen.queryByRole('button', { name: 'Stilllegen' })).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useSystemStilllegenViewMock.mockReturnValue({ isSubmitting: false, submitErrorMessage: undefined, stilllegen: vi.fn() });
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    const { container } = render(<SystemStilllegenAktion systemId={SYSTEM_ID} />);

    expect(await runAxe(container)).toEqual([]);
  });
});
