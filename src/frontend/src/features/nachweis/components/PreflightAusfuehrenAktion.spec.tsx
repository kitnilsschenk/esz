import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../shared/testing/axe';
import { PreflightAusfuehrenAktion } from './PreflightAusfuehrenAktion';

const { useKannNachweisFuehrenMock, usePreflightAusfuehrenViewMock } = vi.hoisted(() => ({
  useKannNachweisFuehrenMock: vi.fn(),
  usePreflightAusfuehrenViewMock: vi.fn(),
}));

vi.mock('../hooks', () => ({
  useKannNachweisFuehren: useKannNachweisFuehrenMock,
  usePreflightAusfuehrenView: usePreflightAusfuehrenViewMock,
}));

const FOERDERJAHR_ID = '0198c3aa-aaaa-7000-8000-000000000001';

function rendere(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <PreflightAusfuehrenAktion foerderjahrId={FOERDERJAHR_ID} headingId="preflight-heading" />
    </MemoryRouter>,
  );
}

describe('PreflightAusfuehrenAktion', () => {
  afterEach(() => {
    useKannNachweisFuehrenMock.mockReset();
    usePreflightAusfuehrenViewMock.mockReset();
  });

  it('löst die Prüfung aus', () => {
    const ausfuehren = vi.fn();
    useKannNachweisFuehrenMock.mockReturnValue(true);
    usePreflightAusfuehrenViewMock.mockReturnValue({ isSubmitting: false, submitErrorMessage: undefined, ausfuehren });

    rendere();
    fireEvent.click(screen.getByRole('button', { name: 'Vollständigkeit prüfen' }));

    expect(ausfuehren).toHaveBeenCalledTimes(1);
  });

  it('blendet die Aktion für Rollen ohne Schreibrecht aus', () => {
    useKannNachweisFuehrenMock.mockReturnValue(false);
    usePreflightAusfuehrenViewMock.mockReturnValue({
      isSubmitting: false,
      submitErrorMessage: undefined,
      ausfuehren: vi.fn(),
    });

    rendere();

    expect(screen.queryByRole('button', { name: 'Vollständigkeit prüfen' })).not.toBeInTheDocument();
  });

  it('sperrt die Schaltfläche, solange die Prüfung läuft', () => {
    useKannNachweisFuehrenMock.mockReturnValue(true);
    usePreflightAusfuehrenViewMock.mockReturnValue({
      isSubmitting: true,
      submitErrorMessage: undefined,
      ausfuehren: vi.fn(),
    });

    rendere();

    expect(screen.getByRole('button', { name: 'Vollständigkeit prüfen' })).toBeDisabled();
  });

  it('zeigt einen Server-Fehler an', () => {
    useKannNachweisFuehrenMock.mockReturnValue(true);
    usePreflightAusfuehrenViewMock.mockReturnValue({
      isSubmitting: false,
      submitErrorMessage: 'Förderjahr nicht gefunden.',
      ausfuehren: vi.fn(),
    });

    rendere();

    expect(screen.getByRole('alert')).toHaveTextContent('Förderjahr nicht gefunden.');
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useKannNachweisFuehrenMock.mockReturnValue(true);
    usePreflightAusfuehrenViewMock.mockReturnValue({
      isSubmitting: false,
      submitErrorMessage: undefined,
      ausfuehren: vi.fn(),
    });

    const { container } = rendere();

    expect(await runAxe(container)).toEqual([]);
  });
});
