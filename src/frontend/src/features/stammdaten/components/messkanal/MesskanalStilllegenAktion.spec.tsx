import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { MesskanalStilllegenAktion } from './MesskanalStilllegenAktion';

const { useMesskanalStilllegenViewMock } = vi.hoisted(() => ({
  useMesskanalStilllegenViewMock: vi.fn(),
}));

vi.mock('../../hooks/messkanal', () => ({ useMesskanalStilllegenView: useMesskanalStilllegenViewMock }));

const MESSKANAL_ID = '0198c3aa-aaaa-7000-8000-000000000001';

describe('MesskanalStilllegenAktion', () => {
  afterEach(() => {
    useMesskanalStilllegenViewMock.mockReset();
  });

  it('ruft die Stilllegen-Aktion beim Klick auf', () => {
    const stilllegen = vi.fn();
    useMesskanalStilllegenViewMock.mockReturnValue({ isSubmitting: false, submitErrorMessage: undefined, stilllegen });

    render(<MesskanalStilllegenAktion messkanalId={MESSKANAL_ID} />);

    fireEvent.click(screen.getByRole('button', { name: 'Stilllegen' }));

    expect(stilllegen).toHaveBeenCalled();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useMesskanalStilllegenViewMock.mockReturnValue({ isSubmitting: false, submitErrorMessage: undefined, stilllegen: vi.fn() });

    const { container } = render(<MesskanalStilllegenAktion messkanalId={MESSKANAL_ID} />);

    expect(await runAxe(container)).toEqual([]);
  });
});
