import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PortalDruckAktion } from './PortalDruckAktion';

const { dokumentMock } = vi.hoisted(() => ({ dokumentMock: vi.fn() }));

vi.mock('../api', () => ({ fetchEigenesDokument: dokumentMock }));

const INFO_ID = '018f1e2d-0000-7000-8000-0000000000e3';

afterEach(() => {
  vi.clearAllMocks();
});

describe('PortalDruckAktion', () => {
  it('holt das Blatt und legt es in den Druckrahmen', async () => {
    dokumentMock.mockResolvedValue('<!DOCTYPE html><html lang="de"><body>Ihre Energieinformation</body></html>');

    const { container } = render(<PortalDruckAktion informationId={INFO_ID} />);
    screen.getByRole('button', { name: 'Diese Seite drucken' }).click();

    await waitFor(() => {
      const rahmen = container.querySelector('iframe');
      expect(rahmen?.getAttribute('srcdoc')).toContain('Ihre Energieinformation');
    });
    expect(dokumentMock).toHaveBeenCalledWith(INFO_ID);
  });

  it('meldet einen Fehlschlag auf Deutsch, statt eine Fehlerseite zu drucken', async () => {
    dokumentMock.mockRejectedValue(new Error('kaputt'));

    render(<PortalDruckAktion informationId={INFO_ID} />);
    screen.getByRole('button', { name: 'Diese Seite drucken' }).click();

    expect(await screen.findByRole('alert')).toHaveTextContent('Das Dokument konnte nicht erstellt werden.');
  });

  it('benennt den Druckrahmen — ein unbenannter Frame ist fuer Screenreader eine Sackgasse', () => {
    const { container } = render(<PortalDruckAktion informationId={INFO_ID} />);

    expect(container.querySelector('iframe')).toHaveAttribute('title', 'Druckansicht Ihrer Energieinformation');
  });
});
