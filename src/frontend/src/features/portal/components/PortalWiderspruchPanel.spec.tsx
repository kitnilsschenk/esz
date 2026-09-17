import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../shared/testing/axe';
import { PortalWiderspruchPanel } from './PortalWiderspruchPanel';

const { standMock, widersprechenMock, ruecknahmeMock } = vi.hoisted(() => ({
  standMock: vi.fn(),
  widersprechenMock: vi.fn(),
  ruecknahmeMock: vi.fn(),
}));

vi.mock('../api', () => ({
  usePortalWiderspruch: standMock,
  usePortalWidersprechen: widersprechenMock,
  usePortalWiderspruchRuecknahme: ruecknahmeMock,
}));

function mutation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { mutate: vi.fn(), isPending: false, isError: false, isSuccess: false, ...overrides };
}

afterEach(() => {
  vi.clearAllMocks();
});

function rendere(
  stand: Record<string, unknown>,
  widersprechen = mutation(),
  ruecknahme = mutation(),
): HTMLElement {
  standMock.mockReturnValue({ isPending: false, isError: false, ...stand });
  widersprechenMock.mockReturnValue(widersprechen);
  ruecknahmeMock.mockReturnValue(ruecknahme);
  const { container } = render(
    <>
      <h1>Portal</h1>
      <PortalWiderspruchPanel />
    </>,
  );
  return container;
}

const OHNE_WIDERSPRUCH = {
  data: { zweckCode: 'nutzerinformation', wirksam: false, erklaertAt: null, widerspruchId: null },
};
const MIT_WIDERSPRUCH = {
  data: {
    zweckCode: 'nutzerinformation',
    wirksam: true,
    erklaertAt: '2026-08-14T09:12:00.000Z',
    widerspruchId: '018f1e2d-0000-7000-8000-0000000000a1',
  },
};

describe('PortalWiderspruchPanel (TB-06 Opt-out)', () => {
  it('sagt im Normalfall, dass monatlich informiert wird', () => {
    rendere(OHNE_WIDERSPRUCH);

    expect(screen.getByText(/bekommen jeden Monat eine Information/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keine monatliche Information mehr erhalten' })).toBeInTheDocument();
  });

  it('fragt vor dem Widerspruch nach — und erklaert erst nach der Bestaetigung', () => {
    const widersprechen = mutation();
    rendere(OHNE_WIDERSPRUCH, widersprechen);

    fireEvent.click(screen.getByRole('button', { name: 'Keine monatliche Information mehr erhalten' }));
    expect(widersprechen['mutate']).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Ja, nicht mehr informieren' }));
    expect(widersprechen['mutate']).toHaveBeenCalledTimes(1);
  });

  it('erklaert nichts, wenn der Dialog abgebrochen wird', () => {
    const widersprechen = mutation();
    rendere(OHNE_WIDERSPRUCH, widersprechen);

    fireEvent.click(screen.getByRole('button', { name: 'Keine monatliche Information mehr erhalten' }));
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));

    expect(widersprechen['mutate']).not.toHaveBeenCalled();
  });

  it('zeigt bei bestehendem Widerspruch den Zeitpunkt und den Weg zurueck', () => {
    rendere(MIT_WIDERSPRUCH);

    expect(screen.getByText(/haben der monatlichen Information widersprochen/)).toBeInTheDocument();
    expect(screen.getByText(/14\.08\.2026/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Monatliche Information wieder erhalten' })).toBeInTheDocument();
  });

  it('nimmt den Widerspruch OHNE Rueckfrage zurueck', () => {
    // Nur die eine Richtung kostet etwas, wenn sie versehentlich geschieht.
    const ruecknahme = mutation();
    rendere(MIT_WIDERSPRUCH, mutation(), ruecknahme);

    fireEvent.click(screen.getByRole('button', { name: 'Monatliche Information wieder erhalten' }));

    expect(ruecknahme['mutate']).toHaveBeenCalledTimes(1);
  });

  it('sagt, dass die Entscheidung jederzeit aenderbar ist und belegt wird', () => {
    rendere(OHNE_WIDERSPRUCH);

    expect(screen.getByText(/jederzeit ändern/)).toBeInTheDocument();
    expect(screen.getByText(/Zeitpunkt und Herkunft/)).toBeInTheDocument();
  });

  it('meldet einen fehlgeschlagenen Widerspruch, statt ihn als erledigt darzustellen', () => {
    rendere(OHNE_WIDERSPRUCH, mutation({ isError: true }));

    expect(screen.getByRole('alert')).toHaveTextContent('konnte nicht gespeichert werden');
  });

  it('meldet einen Ladefehler des Stands', () => {
    standMock.mockReturnValue({ isPending: false, isError: true, data: undefined });
    widersprechenMock.mockReturnValue(mutation());
    ruecknahmeMock.mockReturnValue(mutation());

    render(<PortalWiderspruchPanel />);

    expect(screen.getByRole('alert')).toHaveTextContent('Der Stand konnte nicht geladen werden.');
  });

  it('ist barrierefrei', async () => {
    expect(await runAxe(rendere(MIT_WIDERSPRUCH))).toEqual([]);
  });
});
