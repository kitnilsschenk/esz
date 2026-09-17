import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../shared/testing/axe';
import { PreflightBefundeTabelle } from './PreflightBefundeTabelle';

const { usePreflightBefundeListeViewMock } = vi.hoisted(() => ({ usePreflightBefundeListeViewMock: vi.fn() }));

vi.mock('../hooks', () => ({ usePreflightBefundeListeView: usePreflightBefundeListeViewMock }));

const BASIS = {
  items: [],
  isPending: false,
  isError: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  loadMore: vi.fn(),
  zeigePaarHinweis: false,
  zeigeSystemHinweis: false,
};

const ECHTER_BLOCKER = {
  key: 'p:1',
  lfdLabel: '1',
  regelCode: 'FJ-05',
  regelCodeLabel: 'Widersprüchliche Rechenhistorie',
  schwereLabel: 'Blocker',
  schwereBadgeVariante: 'destructive' as const,
  nurPaarBezogen: false,
  systembedingt: false,
  endkundeIdLabel: '0198c3aa',
  energietraegerLabel: 'Wärme',
  monatLabel: '01.03.2027',
  kennzahlKlasseLabel: 'kandidaten_2',
};

const PAAR_BLOCKER = {
  ...ECHTER_BLOCKER,
  key: 'p:2',
  lfdLabel: '2',
  regelCode: 'FJ-07c',
  regelCodeLabel: 'Endkunde gesperrt — Paar wird ausgeschlossen',
  nurPaarBezogen: true,
};

const SYSTEM_BLOCKER = {
  ...ECHTER_BLOCKER,
  key: 'p:3',
  lfdLabel: '3',
  regelCode: 'FJ-09',
  regelCodeLabel: 'Umfang enthält synthetische Daten',
  systembedingt: true,
  endkundeIdLabel: 'ohne Bezug',
  energietraegerLabel: 'ohne Bezug',
  monatLabel: 'ohne Bezug',
  kennzahlKlasseLabel: 'ohne Bezug',
};

describe('PreflightBefundeTabelle', () => {
  afterEach(() => {
    usePreflightBefundeListeViewMock.mockReset();
  });

  it('zeigt neben dem Regel-Code auch dessen Klartext', () => {
    usePreflightBefundeListeViewMock.mockReturnValue({ ...BASIS, items: [ECHTER_BLOCKER] });

    render(
      <MemoryRouter>
        <PreflightBefundeTabelle preflightId="p" />
      </MemoryRouter>,
    );

    expect(screen.getByText('Widersprüchliche Rechenhistorie')).toBeInTheDocument();
    expect(screen.getByText('FJ-05')).toBeInTheDocument();
  });

  it('kennzeichnet einen Blocker, der nur ein Paar ausschließt, und erklärt ihn', () => {
    // Ohne diese Kennzeichnung stünde eine rote Zeile unter einer grünen
    // Ampel und die Ansicht widerspräche sich selbst.
    usePreflightBefundeListeViewMock.mockReturnValue({
      ...BASIS,
      items: [PAAR_BLOCKER],
      zeigePaarHinweis: true,
    });

    render(
      <MemoryRouter>
        <PreflightBefundeTabelle preflightId="p" />
      </MemoryRouter>,
    );

    expect(screen.getByText('nur dieses Paar')).toBeInTheDocument();
    expect(screen.getByText(/halten den Nachweis für das Förderjahr aber nicht auf/)).toBeInTheDocument();
  });

  it('zeigt den Hinweis NICHT, wenn kein Befund paarbezogen ist', () => {
    usePreflightBefundeListeViewMock.mockReturnValue({ ...BASIS, items: [ECHTER_BLOCKER] });

    render(
      <MemoryRouter>
        <PreflightBefundeTabelle preflightId="p" />
      </MemoryRouter>,
    );

    expect(screen.queryByText('nur dieses Paar')).not.toBeInTheDocument();
  });

  it('kennzeichnet einen systembedingten Blocker und sagt, dass Datenpflege ihn nicht behebt', () => {
    // Die Ampel fordert „Beheben Sie die unten gelisteten Blocker". Bei FJ-08/
    // FJ-09 geht diese Aufforderung ins Leere: Sie hängen am Betriebszustand,
    // nicht an den Daten. Ohne die Kennzeichnung sucht das Betriebs-Team im
    // Stammdatenbestand nach einer Ursache, die dort nicht liegt.
    usePreflightBefundeListeViewMock.mockReturnValue({
      ...BASIS,
      items: [SYSTEM_BLOCKER],
      zeigeSystemHinweis: true,
    });

    render(
      <MemoryRouter>
        <PreflightBefundeTabelle preflightId="p" />
      </MemoryRouter>,
    );

    expect(screen.getByText('systembedingt')).toBeInTheDocument();
    expect(screen.getByText(/Durch Datenpflege lassen sie sich nicht beheben/)).toBeInTheDocument();
  });

  it('zeigt die systembedingte Kennzeichnung NICHT an einem gewoehnlichen Blocker', () => {
    usePreflightBefundeListeViewMock.mockReturnValue({ ...BASIS, items: [ECHTER_BLOCKER] });

    render(
      <MemoryRouter>
        <PreflightBefundeTabelle preflightId="p" />
      </MemoryRouter>,
    );

    expect(screen.queryByText('systembedingt')).not.toBeInTheDocument();
  });

  it('wertet den Leerzustand als Entwarnung, nicht als Mangel', () => {
    usePreflightBefundeListeViewMock.mockReturnValue(BASIS);

    render(
      <MemoryRouter>
        <PreflightBefundeTabelle preflightId="p" />
      </MemoryRouter>,
    );

    expect(screen.getByText(/vollständige und widerspruchsfreie Berechnungen/)).toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    usePreflightBefundeListeViewMock.mockReturnValue({
      ...BASIS,
      items: [ECHTER_BLOCKER, PAAR_BLOCKER, SYSTEM_BLOCKER],
      zeigePaarHinweis: true,
      zeigeSystemHinweis: true,
    });

    const { container } = render(
      <MemoryRouter>
        <PreflightBefundeTabelle preflightId="p" />
      </MemoryRouter>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
