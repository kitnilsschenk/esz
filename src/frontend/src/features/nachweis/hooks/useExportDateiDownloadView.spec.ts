import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProblemError } from '@edms/shared';
import { useExportDateiDownloadView } from './useExportDateiDownloadView';

const { fetchNachweisExportDateiMock, bieteDateiZumSpeichernAnMock } = vi.hoisted(() => ({
  fetchNachweisExportDateiMock: vi.fn(),
  bieteDateiZumSpeichernAnMock: vi.fn(),
}));

vi.mock('../api', () => ({ fetchNachweisExportDatei: fetchNachweisExportDateiMock }));
vi.mock('../../../shared/lib/dateiDownload', () => ({ bieteDateiZumSpeichernAn: bieteDateiZumSpeichernAnMock }));

const EXPORT_ID = '0198c3dd-dddd-7000-8000-000000000004';
const DATEINAME = 'einspardaten_jahr.csv';

describe('useExportDateiDownloadView', () => {
  afterEach(() => {
    fetchNachweisExportDateiMock.mockReset();
    bieteDateiZumSpeichernAnMock.mockReset();
  });

  it('bietet den geholten Inhalt als CSV-Datei zum Speichern an', async () => {
    fetchNachweisExportDateiMock.mockResolvedValue('kopf;wert\r\n1;2\r\n');

    const { result } = renderHook(() => useExportDateiDownloadView(EXPORT_ID));
    act(() => {
      result.current.herunterladen(DATEINAME);
    });

    await waitFor(() => {
      expect(result.current.erfolgsMeldung).toBe('Die Datei wurde zum Speichern angeboten.');
    });
    expect(fetchNachweisExportDateiMock).toHaveBeenCalledWith(EXPORT_ID, DATEINAME);
    expect(bieteDateiZumSpeichernAnMock).toHaveBeenCalledWith(DATEINAME, 'kopf;wert\r\n1;2\r\n', 'text/csv;charset=utf-8');
  });

  it('markiert den laufenden Abruf und gibt ihn danach wieder frei', async () => {
    let aufloesen: (inhalt: string) => void = () => undefined;
    fetchNachweisExportDateiMock.mockReturnValue(
      new Promise<string>((resolve) => {
        aufloesen = resolve;
      }),
    );

    const { result } = renderHook(() => useExportDateiDownloadView(EXPORT_ID));
    act(() => {
      result.current.herunterladen(DATEINAME);
    });
    expect(result.current.laufenderDateiname).toBe(DATEINAME);

    act(() => {
      aufloesen('inhalt');
    });
    await waitFor(() => {
      expect(result.current.laufenderDateiname).toBeUndefined();
    });
  });

  it('zeigt die fachliche Begründung des Servers, wenn die Auslieferung verweigert wurde', async () => {
    fetchNachweisExportDateiMock.mockRejectedValue(
      new ApiProblemError({
        type: 'about:blank',
        title: 'Internal Server Error',
        status: 500,
        detail: 'Der neu erzeugte Inhalt weicht vom hinterlegten Hash ab.',
      }),
    );

    const { result } = renderHook(() => useExportDateiDownloadView(EXPORT_ID));
    act(() => {
      result.current.herunterladen(DATEINAME);
    });

    await waitFor(() => {
      expect(result.current.fehlerMeldung).toBe('Der neu erzeugte Inhalt weicht vom hinterlegten Hash ab.');
    });
    expect(bieteDateiZumSpeichernAnMock).not.toHaveBeenCalled();
  });

  it('fällt auf einen allgemeinen Text zurück, wenn der Fehler keine Begründung trägt', async () => {
    fetchNachweisExportDateiMock.mockRejectedValue(new Error('Netzwerk'));

    const { result } = renderHook(() => useExportDateiDownloadView(EXPORT_ID));
    act(() => {
      result.current.herunterladen(DATEINAME);
    });

    await waitFor(() => {
      expect(result.current.fehlerMeldung).toBe('Die Datei konnte nicht abgerufen werden.');
    });
  });
});
