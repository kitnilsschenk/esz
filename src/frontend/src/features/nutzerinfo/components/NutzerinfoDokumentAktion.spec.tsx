import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProblemError } from '@edms/shared';
import { NutzerinfoDokumentAktion } from './NutzerinfoDokumentAktion';

const { fetchDokumentMock, speichernMock } = vi.hoisted(() => ({
  fetchDokumentMock: vi.fn(),
  speichernMock: vi.fn(),
}));

vi.mock('../api', () => ({ fetchNutzerinfoDokument: fetchDokumentMock }));
// `URL.createObjectURL` fehlt in jsdom — der Helfer ist genau deshalb ein
// eigenes Modul (s. dortiger Kommentar).
vi.mock('../../../shared/lib/dateiDownload', () => ({ bieteDateiZumSpeichernAn: speichernMock }));

const INFO_ID = '0198c3aa-aaaa-7000-8000-000000000001';

describe('NutzerinfoDokumentAktion (TB-06 — der Gegenstand, der den Kunden erreicht)', () => {
  afterEach(() => {
    fetchDokumentMock.mockReset();
    speichernMock.mockReset();
  });

  it('bietet das geholte Dokument zum Speichern an', async () => {
    fetchDokumentMock.mockResolvedValue('<html>…</html>');

    render(<NutzerinfoDokumentAktion informationId={INFO_ID} />);
    fireEvent.click(screen.getByRole('button', { name: 'Kundendokument speichern' }));

    await waitFor(() => {
      expect(speichernMock).toHaveBeenCalledWith(
        `energieinformation_${INFO_ID}.html`,
        '<html>…</html>',
        'text/html;charset=utf-8',
      );
    });
    expect(await screen.findByText('Das Kundendokument wurde gespeichert.')).toBeInTheDocument();
  });

  it('holt das Dokument NICHT beiläufig beim Rendern', () => {
    // Jeder Abruf ist ein Vorgang am Kundendokument — er gehört an einen
    // ausdrücklichen Klick, nicht an das Anzeigen einer Seite.
    fetchDokumentMock.mockResolvedValue('<html></html>');

    render(<NutzerinfoDokumentAktion informationId={INFO_ID} />);

    expect(fetchDokumentMock).not.toHaveBeenCalled();
  });

  it('zeigt die fachliche Begründung des Servers, nicht nur „fehlgeschlagen"', async () => {
    fetchDokumentMock.mockRejectedValue(
      new ApiProblemError({
        type: 'about:blank',
        status: 404,
        title: 'Not Found',
        detail: 'Nutzerinformation existiert nicht.',
      }),
    );

    render(<NutzerinfoDokumentAktion informationId={INFO_ID} />);
    fireEvent.click(screen.getByRole('button', { name: 'Kundendokument speichern' }));

    expect(await screen.findByText('Nutzerinformation existiert nicht.')).toBeInTheDocument();
    expect(speichernMock).not.toHaveBeenCalled();
  });
});
