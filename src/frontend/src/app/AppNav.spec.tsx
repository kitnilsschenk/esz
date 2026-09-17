import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../shared/testing/axe';
import { AppNav } from './AppNav';

const { useIstAdminMock } = vi.hoisted(() => ({ useIstAdminMock: vi.fn() }));

vi.mock('../features/auth/hooks/useIstAdmin', () => ({ useIstAdmin: useIstAdminMock }));

describe('AppNav', () => {
  afterEach(() => {
    useIstAdminMock.mockReset();
  });

  it('zeigt die aufgabenorientierten Einträge — Endkunden statt Datenmodell-Namen', () => {
    useIstAdminMock.mockReturnValue(false);

    render(
      <MemoryRouter>
        <AppNav />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /Arbeitsplatz/ })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Endkunden' })).toHaveAttribute('href', '/stammdaten/endkunden');
    expect(screen.getByRole('link', { name: /Zähler & Messkanäle/ })).toHaveAttribute('href', '/stammdaten/zaehler');
    expect(screen.getByRole('link', { name: /Gebäude & Räume/ })).toHaveAttribute('href', '/stammdaten/standorte');
    expect(screen.getByRole('link', { name: /Vollständigkeit & Störungen/ })).toHaveAttribute(
      'href',
      '/monitoring/vollstaendigkeit',
    );
  });

  it('gibt jedem Teil-Label ein eigenes, zutreffendes Ziel', () => {
    // Vorher: EIN Eintrag „Anschlussnutzer & Verträge" zeigte nur auf die
    // Verträge — die Anschlussnutzer-Liste war über die Navigation gar nicht
    // erreichbar. Und „Systemgrenzen (Messkonzept)" versprach ein
    // Messkonzept, das unter dem ENDKUNDEN liegt, nicht unter den Systemen.
    useIstAdminMock.mockReturnValue(false);

    render(
      <MemoryRouter>
        <AppNav />
      </MemoryRouter>,
    );

    // Die Unterpunkte stehen im aktiven Zweig — hier also unter Endkunden.
    render(
      <MemoryRouter initialEntries={['/stammdaten/endkunden']}>
        <AppNav />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Verträge & Nutzung' })).toHaveAttribute(
      'href',
      '/stammdaten/nutzungsverhaeltnisse',
    );
    expect(screen.getByRole('link', { name: 'Anschlussnutzer' })).toHaveAttribute('href', '/stammdaten/anschlussnutzer');
    expect(screen.getAllByRole('link', { name: /Systemgrenzen/ })[0]).toHaveAttribute('href', '/stammdaten/systeme');
    expect(screen.queryByRole('link', { name: /Messkonzept/ })).not.toBeInTheDocument();
  });

  it('hält die Unterpunkte eingeklappt, solange man nicht in ihrem Zweig steht', () => {
    // Der Grund für den Umbau: Zuvor stand JEDER Unterpunkt jeder Gruppe
    // immer da. Wer etwas sucht, überfliegt eine Navigation — je mehr Zeilen
    // dauerhaft stehen, desto weniger trägt die Gruppierung.
    useIstAdminMock.mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={['/']}>
        <AppNav />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Endkunden' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Verträge & Nutzung' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Anschlussnutzer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Messdaten-Aufnahme' })).not.toBeInTheDocument();
  });

  it('klappt den Zweig auf, in dem man steht — auch wenn nur ein KIND aktiv ist', () => {
    useIstAdminMock.mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={['/stammdaten/anschlussnutzer']}>
        <AppNav />
      </MemoryRouter>,
    );

    // Das Elternteil „Endkunden" ist NICHT aktiv, das Kind schon — der Zweig
    // steht trotzdem offen.
    expect(screen.getByRole('link', { name: 'Anschlussnutzer' })).toHaveAttribute(
      'href',
      '/stammdaten/anschlussnutzer',
    );
    expect(screen.getByRole('link', { name: 'Verträge & Nutzung' })).toBeInTheDocument();
  });

  it('lässt einen fremden Zweig über den Pfeil aufklappen — die Handentscheidung hat Vorrang', () => {
    useIstAdminMock.mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={['/']}>
        <AppNav />
      </MemoryRouter>,
    );

    const aufklapper = screen.getByRole('button', { name: 'Unterpunkte von Endkunden' });
    expect(aufklapper).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(aufklapper);

    expect(aufklapper).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Verträge & Nutzung' })).toBeInTheDocument();
  });

  it('ordnet Verträge und Anschlussnutzer STRUKTURELL unter die Endkunden, nicht nur optisch', () => {
    // Zuvor war die Unterordnung eine reine `ml-3`-Einrückung auf einem
    // Geschwister-Element — für Screenreader existierte die Hierarchie nicht.
    useIstAdminMock.mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={['/stammdaten/endkunden']}>
        <AppNav />
      </MemoryRouter>,
    );

    const endkundenEintrag = screen.getByRole('link', { name: 'Endkunden' }).closest('li');
    expect(endkundenEintrag).not.toBeNull();
    expect(endkundenEintrag?.querySelector('ul')).not.toBeNull();
    expect(endkundenEintrag).toContainElement(screen.getByRole('link', { name: 'Verträge & Nutzung' }));
    expect(endkundenEintrag).toContainElement(screen.getByRole('link', { name: 'Anschlussnutzer' }));
  });

  it('benennt jede Gruppen-Liste über ihre sichtbare Beschriftung', () => {
    // Zuvor standen `<p>Kunden</p>` und `<ul>` unverbunden nebeneinander —
    // ein Screenreader kündigte mehrere NAMENLOSE Listen an.
    useIstAdminMock.mockReturnValue(false);

    render(
      <MemoryRouter>
        <AppNav />
      </MemoryRouter>,
    );

    // Die Gruppen folgen dem Weg der Daten durch das Haus — in genau der
    // Reihenfolge, in der die Plattform arbeitet.
    expect(screen.getByRole('list', { name: 'Stammdaten' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Messdaten' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Auswertung' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Nachweis' })).toBeInTheDocument();
  });

  it('führt die Gruppen in der Reihenfolge des Datenflusses', () => {
    useIstAdminMock.mockReturnValue(false);

    render(
      <MemoryRouter>
        <AppNav />
      </MemoryRouter>,
    );

    const beschriftungen = screen
      .getAllByRole('list')
      .map((liste) => liste.getAttribute('aria-labelledby'))
      .filter((id): id is string => id !== null)
      .map((id) => document.getElementById(id)?.textContent);

    expect(beschriftungen).toEqual(['Stammdaten', 'Messdaten', 'Auswertung', 'Nachweis']);
  });

  it('stellt den Arbeitsplatz ohne Gruppenüberschrift an die Spitze', () => {
    // Eine Überschrift über einem einzigen Eintrag ordnet nichts — sie kostet
    // nur eine Zeile.
    useIstAdminMock.mockReturnValue(false);

    render(
      <MemoryRouter>
        <AppNav />
      </MemoryRouter>,
    );

    expect(screen.queryByText('Arbeit')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Arbeitsplatz/ })).toHaveAttribute('href', '/');
  });

  it('markiert den Eintrag der aktuellen Route als `aria-current="page"`', () => {
    useIstAdminMock.mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={['/stammdaten/zaehler/0198c3aa-aaaa-7000-8000-000000000001']}>
        <AppNav />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /Zähler & Messkanäle/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Endkunden' })).not.toHaveAttribute('aria-current');
  });

  it('markiert „Zähler & Messkanäle" auch auf einer Messkanal-Detailroute', () => {
    // `/stammdaten/messkanaele/:id` liegt unter einem EIGENEN Top-Level-
    // Präfix — mit reiner `NavLink`-Präfixprüfung erlosch die Markierung
    // ausgerechnet bei der Route, die der Eintrag im Namen führt.
    useIstAdminMock.mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={['/stammdaten/messkanaele/0198c3aa-aaaa-7000-8000-000000000002']}>
        <AppNav />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /Zähler & Messkanäle/ })).toHaveAttribute('aria-current', 'page');
  });

  it('markiert den Arbeitsplatz NUR auf der Startseite, nicht auf jeder Unterroute', () => {
    useIstAdminMock.mockReturnValue(false);

    const { unmount } = render(
      <MemoryRouter initialEntries={['/']}>
        <AppNav />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /Arbeitsplatz/ })).toHaveAttribute('aria-current', 'page');
    unmount();

    render(
      <MemoryRouter initialEntries={['/stammdaten/endkunden']}>
        <AppNav />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /Arbeitsplatz/ })).not.toHaveAttribute('aria-current');
  });

  it('erklärt Systemgrenze vs. Gebäude an BEIDEN Einträgen — statt mit einem Absatz mitten in der Navigation', () => {
    // Zuvor stand zwischen den beiden Einträgen ein Erklär-Absatz. Eine
    // Navigation ist eine Liste von Zielen; Fließtext dazwischen unterbricht
    // das Überfliegen genau dort, wo man nach einem Ziel sucht. Die
    // Abgrenzung steht jetzt in den Tooltips beider Einträge — dort, wo man
    // sie sucht, wenn man sie braucht.
    useIstAdminMock.mockReturnValue(false);

    render(
      <MemoryRouter>
        <AppNav />
      </MemoryRouter>,
    );

    expect(screen.queryByText(/Systemgrenzen = wofür/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erklärung zu Systemgrenzen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erklärung zu Gebäude & Räume' })).toBeInTheDocument();
  });

  it('führt KEINE nicht-navigierbaren Platzhalter mehr in der Navigation', () => {
    // „Baseline & Einsparung" und „BAFA-Export" standen einmal als nicht
    // klickbare `bald`-Zeilen hier UND als Kacheln auf dem Dashboard —
    // zweimal dieselbe Nicht-Funktion. Ein Nav-Eintrag ist ein
    // Navigationsversprechen. Inzwischen gibt es beide Bereiche wirklich; die
    // Zusage dieses Tests ist deshalb NICHT „diese Wörter kommen hier nicht
    // vor", sondern „was hier steht, führt auch irgendwohin".
    useIstAdminMock.mockReturnValue(false);

    render(
      <MemoryRouter>
        <AppNav />
      </MemoryRouter>,
    );

    expect(screen.queryByText('bald')).not.toBeInTheDocument();
    // Jede Zeile der Navigation ist jetzt ein Ziel — keine einzige
    // nicht-navigierbare Textzeile mehr.
    expect(screen.getByRole('navigation').querySelectorAll('li > p')).toHaveLength(0);
  });

  it('stellt Datenaufnahme und Vollständigkeit GLEICHRANGIG unter „Messdaten"', () => {
    // Die Aufnahme war ein Unterpunkt der Vollständigkeit. Sie ist aber keine
    // Teilmenge davon, sondern der Schritt DAVOR: erst kommt etwas an, dann
    // fällt auf, was fehlt.
    useIstAdminMock.mockReturnValue(false);

    render(
      <MemoryRouter>
        <AppNav />
      </MemoryRouter>,
    );

    const messdaten = screen.getByRole('list', { name: 'Messdaten' });
    const eintraege = within(messdaten).getAllByRole('link');
    expect(eintraege.map((eintrag) => eintrag.getAttribute('href'))).toEqual([
      '/monitoring/ingest',
      '/monitoring/vollstaendigkeit',
    ]);
    expect(screen.getByRole('link', { name: 'Datenaufnahme' })).toBeInTheDocument();
  });

  it('verlinkt „Baseline & Einsparung" und „Förderjahre" auf ihre echten Ziele', () => {
    useIstAdminMock.mockReturnValue(false);

    // Im Nachweis-Zweig, damit auch der Unterpunkt „Einspar-Läufe" sichtbar ist.
    render(
      <MemoryRouter initialEntries={['/nachweis/foerderjahre']}>
        <AppNav />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Verbrauch & Einsparung' })).toHaveAttribute('href', '/berechnung/laeufe');
    expect(screen.getByRole('link', { name: 'Förderjahre' })).toHaveAttribute('href', '/nachweis/foerderjahre');
    expect(screen.getByRole('link', { name: 'Einspar-Läufe' })).toHaveAttribute('href', '/nachweis/einsparlaeufe');
  });

  it('markiert „Förderjahre" auch auf den Folgeschritten der Nachweis-Kette', () => {
    // Preflight, Export und Einreichung liegen unter eigenen Top-Level-
    // Präfixen. Ohne `weiterePfade` erlösche die Markierung mitten in der
    // Kette — ausgerechnet dort, wo die Orientierung am meisten zählt.
    useIstAdminMock.mockReturnValue(false);

    for (const pfad of ['/nachweis/preflights/abc', '/nachweis/exporte/abc', '/nachweis/einreichungen/abc']) {
      const { unmount } = render(
        <MemoryRouter initialEntries={[pfad]}>
          <AppNav />
        </MemoryRouter>,
      );
      expect(screen.getByRole('link', { name: 'Förderjahre' })).toHaveAttribute('aria-current', 'page');
      unmount();
    }
  });

  it('blendet den admin-only Nav-Eintrag „Systemstatus" für Nicht-Admins aus', () => {
    useIstAdminMock.mockReturnValue(false);

    render(
      <MemoryRouter>
        <AppNav />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('link', { name: 'Systemstatus' })).not.toBeInTheDocument();
  });

  it('zeigt „Systemstatus" (`/verwaltung/systemstatus`) NUR für die Rolle `admin`', () => {
    useIstAdminMock.mockReturnValue(true);

    render(
      <MemoryRouter>
        <AppNav />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Systemstatus' })).toHaveAttribute('href', '/verwaltung/systemstatus');
  });

  it('hat keine erkennbaren axe-Verstöße (weder für admin noch für Nicht-admin)', async () => {
    useIstAdminMock.mockReturnValue(false);
    const { container: containerOhneAdmin } = render(
      <MemoryRouter>
        <AppNav />
      </MemoryRouter>,
    );
    expect(await runAxe(containerOhneAdmin)).toEqual([]);

    useIstAdminMock.mockReturnValue(true);
    const { container: containerMitAdmin } = render(
      <MemoryRouter>
        <AppNav />
      </MemoryRouter>,
    );
    expect(await runAxe(containerMitAdmin)).toEqual([]);
  });
});
