import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../shared/testing/axe';
import { NachweisExportDateienTabelle } from './NachweisExportDateienTabelle';

const { useExportDateiDownloadViewMock } = vi.hoisted(() => ({ useExportDateiDownloadViewMock: vi.fn() }));

vi.mock('../hooks', () => ({ useExportDateiDownloadView: useExportDateiDownloadViewMock }));

const DATEIEN = [
  {
    dateiname: 'einspardaten_jahr.csv',
    kategorieLabel: 'Einspardaten',
    zeilenAnzahlLabel: '42',
    // Hex, wie der Server sie liefert und wie sie in `manifest.csv` stehen.
    dateiHash: '3b1f7c0a9d4e2b6580af13c7d92e4f6a0b8c5d1e7f2a3b4c5d6e7f8091a2b3c4',
  },
];

function download(overrides: Record<string, unknown> = {}) {
  return {
    laufenderDateiname: undefined,
    fehlerMeldung: undefined,
    erfolgsMeldung: undefined,
    herunterladen: vi.fn(),
    ...overrides,
  };
}

function rendere(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <NachweisExportDateienTabelle exportId="export-1" dateien={DATEIEN} />
    </MemoryRouter>,
  );
}

describe('NachweisExportDateienTabelle', () => {
  afterEach(() => {
    useExportDateiDownloadViewMock.mockReset();
  });

  it('bietet den Abruf als Schaltfläche an, nicht als Link', () => {
    // Es gibt keine Adresse, unter der die Datei liegt: Sie wird bei jedem
    // Abruf neu erzeugt, geprüft und protokolliert. Ein Link würde eine
    // teilbare Adresse suggerieren.
    const view = download();
    useExportDateiDownloadViewMock.mockReturnValue(view);

    rendere();

    expect(screen.queryByRole('link', { name: /einspardaten_jahr\.csv/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Herunterladen einspardaten_jahr.csv' }));
    expect(view.herunterladen).toHaveBeenCalledWith('einspardaten_jahr.csv');
  });

  it('zeigt die Prüfsumme ungekürzt — gekürzt taugte sie nicht zum Abgleich', () => {
    useExportDateiDownloadViewMock.mockReturnValue(download());

    rendere();

    expect(screen.getByText(DATEIEN[0]!.dateiHash)).toBeInTheDocument();
  });

  it('markiert den laufenden Abruf und sperrt weitere', () => {
    useExportDateiDownloadViewMock.mockReturnValue(download({ laufenderDateiname: 'einspardaten_jahr.csv' }));

    rendere();

    expect(screen.getByRole('button', { name: /einspardaten_jahr\.csv/ })).toBeDisabled();
    expect(screen.getByText('Wird geladen …')).toBeInTheDocument();
  });

  it('zeigt die Begründung des Servers, wenn ein Abruf verweigert wurde', () => {
    useExportDateiDownloadViewMock.mockReturnValue(
      download({ fehlerMeldung: 'Der neu erzeugte Inhalt weicht von der hinterlegten Prüfsumme ab.' }),
    );

    rendere();

    expect(screen.getByRole('alert')).toHaveTextContent('weicht von der hinterlegten Prüfsumme ab');
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useExportDateiDownloadViewMock.mockReturnValue(download());

    const { container } = rendere();

    expect(await runAxe(container)).toEqual([]);
  });
});
