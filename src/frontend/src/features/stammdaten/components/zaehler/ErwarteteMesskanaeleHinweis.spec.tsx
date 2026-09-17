import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { ErwarteteMesskanaeleHinweis } from './ErwarteteMesskanaeleHinweis';

const { useErwarteteKanaeleViewMock, useKannStammdatenAnlegenMock } = vi.hoisted(() => ({
  useErwarteteKanaeleViewMock: vi.fn(),
  useKannStammdatenAnlegenMock: vi.fn(),
}));

vi.mock('../../hooks/zaehler', () => ({ useErwarteteKanaeleView: useErwarteteKanaeleViewMock }));
vi.mock('../../hooks/shared/useKannStammdatenAnlegen', () => ({
  useKannStammdatenAnlegen: useKannStammdatenAnlegenMock,
}));

const KANAL = {
  key: 'wirkarbeit:kWh:kumulativ_zaehlerstand',
  messgroesse: 'wirkarbeit',
  einheit: 'kWh',
  art: 'kumulativ_zaehlerstand' as const,
  beschreibung: 'Wirkarbeit über alle drei Phasen (Summenzählwerk)',
  artLabel: 'kumulativer Zählerstand',
  istAngelegt: false,
};

function view(overrides: Record<string, unknown> = {}) {
  return {
    isSubmitting: false,
    submitErrorMessage: undefined,
    erfolgsMeldung: undefined,
    isPending: false,
    geraetetypUnbekannt: false,
    ohneVorlage: false,
    kanaele: [KANAL],
    alleAngelegt: false,
    anlegen: vi.fn(),
    ...overrides,
  };
}

function rendere(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <ErwarteteMesskanaeleHinweis zaehlerId="zaehler-1" geraetetyp="DeZem Harvey 2" />
    </MemoryRouter>,
  );
}

describe('ErwarteteMesskanaeleHinweis', () => {
  afterEach(() => {
    useErwarteteKanaeleViewMock.mockReset();
    useKannStammdatenAnlegenMock.mockReset();
  });

  it('nennt Messgröße und Einheit ZEICHENGENAU, so wie sie anzulegen sind', () => {
    // Genau daran scheitert es sonst: „Wirkarbeit" oder „kwh" ergeben einen
    // Kanal, der nie befüllt wird.
    useErwarteteKanaeleViewMock.mockReturnValue(view());
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    rendere();

    expect(screen.getByText('wirkarbeit')).toBeInTheDocument();
    expect(screen.getByText(/kWh/)).toBeInTheDocument();
    expect(screen.getByText('fehlt')).toBeInTheDocument();
  });

  it('legt den fehlenden Kanal auf Knopfdruck an', () => {
    const aktuell = view();
    useErwarteteKanaeleViewMock.mockReturnValue(aktuell);
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    rendere();
    fireEvent.click(screen.getByRole('button', { name: /Kanal anlegen wirkarbeit/ }));

    expect(aktuell.anlegen).toHaveBeenCalledWith(KANAL);
  });

  it('markiert einen bereits vorhandenen Kanal und bietet ihn nicht erneut an', () => {
    useErwarteteKanaeleViewMock.mockReturnValue(
      view({ kanaele: [{ ...KANAL, istAngelegt: true }], alleAngelegt: true }),
    );
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    rendere();

    expect(screen.getByText('angelegt')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Kanal anlegen/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Alle Kanäle, die dieser Gerätetyp liefert, sind angelegt/)).toBeInTheDocument();
  });

  it('warnt, wenn der Gerätetyp gar nicht ausgewertet werden kann', () => {
    // Ohne Decoder kommen von diesem Zähler nie Messwerte an — das gehört
    // gesagt, bevor jemand ihn montiert.
    useErwarteteKanaeleViewMock.mockReturnValue(view({ geraetetypUnbekannt: true, kanaele: [] }));
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    rendere();

    expect(screen.getByText(/keine Auswertung hinterlegt/)).toBeInTheDocument();
  });

  it('hält sich zurück, solange nichts zu sagen ist', () => {
    useErwarteteKanaeleViewMock.mockReturnValue(view({ ohneVorlage: true, kanaele: [] }));
    useKannStammdatenAnlegenMock.mockReturnValue(true);
    const { container } = rendere();
    expect(container).toBeEmptyDOMElement();

    useErwarteteKanaeleViewMock.mockReturnValue(view({ isPending: true }));
    const zweiter = rendere();
    expect(zweiter.container).toBeEmptyDOMElement();
  });

  it('zeigt Rollen ohne Schreibrecht den Bedarf, aber keine Schaltfläche', () => {
    useErwarteteKanaeleViewMock.mockReturnValue(view());
    useKannStammdatenAnlegenMock.mockReturnValue(false);

    rendere();

    expect(screen.getByText('fehlt')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Kanal anlegen/ })).not.toBeInTheDocument();
  });

  it('zeigt eine Server-Ablehnung an', () => {
    useErwarteteKanaeleViewMock.mockReturnValue(view({ submitErrorMessage: 'Kanal existiert bereits.' }));
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    rendere();

    expect(screen.getByRole('alert')).toHaveTextContent('Kanal existiert bereits.');
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useErwarteteKanaeleViewMock.mockReturnValue(view());
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    const { container } = rendere();

    expect(await runAxe(container)).toEqual([]);
  });
});
