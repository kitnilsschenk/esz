import { describe, expect, it, vi } from 'vitest';
import { useNutzerinfoKachelView } from './useNutzerinfoKachelView';

const { statusMock } = vi.hoisted(() => ({ statusMock: vi.fn() }));

vi.mock('../../nutzerinfo/api', () => ({ useNutzerinfoStatus: statusMock }));

function mockStatus(daten: Record<string, unknown> | undefined, zustand: Record<string, unknown> = {}): void {
  statusMock.mockReturnValue({ data: daten, isPending: false, isError: false, ...zustand });
}

describe('useNutzerinfoKachelView (TB-06)', () => {
  it('meldet einen Monat, für den nichts erzeugt wurde — der stille Fehler dieser Auflage', () => {
    mockStatus({ monat: '2026-08-01', anzahlErzeugt: 0, anzahlZugestellt: 0, anzahlOffen: 0 });

    const view = useNutzerinfoKachelView();

    // Null erzeugte Informationen heisst NICHT „nichts zu tun" — es heisst,
    // der Monat ist noch gar nicht gelaufen.
    expect(view.nichtsErzeugt).toBe(true);
    expect(view.beschreibung).toContain('noch keine Information erzeugt');
  });

  it('meldet offene Zustellungen — erzeugen ist nicht informieren', () => {
    mockStatus({ monat: '2026-08-01', anzahlErzeugt: 12, anzahlZugestellt: 7, anzahlOffen: 5 });

    const view = useNutzerinfoKachelView();

    expect(view.nichtsErzeugt).toBe(false);
    expect(view.anzahlOffen).toBe(5);
    expect(view.beschreibung).toContain('noch nicht zugestellt');
  });

  it('meldet einen abgeschlossenen Monat', () => {
    mockStatus({ monat: '2026-08-01', anzahlErzeugt: 12, anzahlZugestellt: 12, anzahlOffen: 0 });

    const view = useNutzerinfoKachelView();

    expect(view.nichtsErzeugt).toBe(false);
    expect(view.anzahlOffen).toBe(0);
    expect(view.beschreibung).toContain('zugestellt');
  });

  it('übernimmt den Monat vom Server statt ihn selbst zu rechnen', () => {
    mockStatus({ monat: '2026-08-01', anzahlErzeugt: 1, anzahlZugestellt: 1, anzahlOffen: 0 });

    expect(useNutzerinfoKachelView().monatLabel).toBe('01.08.2026');
  });

  it('behauptet während des Ladens keinen Zustand', () => {
    mockStatus(undefined, { isPending: true });

    const view = useNutzerinfoKachelView();

    // Weder „nichts erzeugt" noch „alles gut" — beides waere eine Aussage
    // ueber Daten, die noch nicht da sind.
    expect(view.isPending).toBe(true);
    expect(view.nichtsErzeugt).toBe(false);
    expect(view.monatLabel).toBe('');
  });
});
