import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { runAxe } from '../shared/testing/axe';
import { AppShell } from './AppShell';

// Feature-Slices sind eigenständig getestet (`AppNav.spec.tsx`,
// `HealthStatusPanel.spec.tsx`, `DashboardPage`-Bausteine, Stammdaten-Seiten-
// Tests) — hier bewusst als No-Op gemockt, damit dieser Test ausschließlich
// das App-Shell-Gerüst (Skip-Link, Landmarks, Hauptinhalts-Fokus-Ziel,
// Routing `/` → Dashboard / `/verwaltung/systemstatus` → Health) prüft.
// `useIstAdmin` mockt AppNav's admin-Gate (rendert sonst eine echte
// TanStack-Query-Session-Abfrage ohne `QueryClientProvider`).
vi.mock('../features/auth/components/AuthStatusHeader', () => ({ AuthStatusHeader: () => null }));
vi.mock('../features/health/components/HealthStatusPanel', () => ({ HealthStatusPanel: () => <p>Systemstatus (Stub)</p> }));
vi.mock('../features/dashboard', () => ({ DashboardPage: () => <p>Arbeitsplatz (Stub)</p> }));
vi.mock('../features/auth/hooks/useIstAdmin', () => ({ useIstAdmin: () => true }));

describe('AppShell', () => {
  it('rendert einen Skip-Link als erstes fokussierbares Element, der zum Hauptinhalt springt', () => {
    render(
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>,
    );

    const skipLink = screen.getByRole('link', { name: 'Zum Hauptinhalt springen' });
    expect(skipLink).toHaveAttribute('href', '#hauptinhalt');
    expect(skipLink.className).toContain('sr-only');
  });

  it('macht den Hauptinhalt zum Sprung-/Fokus-Ziel des Skip-Links (`id="hauptinhalt"`, fokussierbar)', () => {
    render(
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>,
    );

    const hauptinhalt = document.getElementById('hauptinhalt');
    expect(hauptinhalt).not.toBeNull();
    expect(hauptinhalt?.tagName).toBe('MAIN');
    expect(hauptinhalt).toHaveAttribute('tabIndex', '-1');
  });

  it('rendert die Haupt-Navigation NICHT als `<aside>` (complementary-Landmark) — nur das `<nav aria-label>` bleibt Landmark', () => {
    render(
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Hauptnavigation' })).toBeInTheDocument();
  });

  it('zeigt die neue Startseite (Dashboard) unter `/` — Health ist NICHT mehr die erste Zeile der App', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppShell />
      </MemoryRouter>,
    );

    expect(screen.getByText('Arbeitsplatz (Stub)')).toBeInTheDocument();
    expect(screen.queryByText('Systemstatus (Stub)')).not.toBeInTheDocument();
  });

  it('Health ist unter der neuen Route `/verwaltung/systemstatus` erreichbar', () => {
    render(
      <MemoryRouter initialEntries={['/verwaltung/systemstatus']}>
        <AppShell />
      </MemoryRouter>,
    );

    expect(screen.getByText('Systemstatus (Stub)')).toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    const { container } = render(
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>,
    );

    expect(await runAxe(container)).toEqual([]);
  });

  it('verlinkt den App-Titel auf die Startseite', () => {
    // Zuvor war der Titel ein `<span>`, und es gab in der gesamten Anwendung
    // KEINEN Verweis auf `/` — das Arbeitsplatz-Dashboard war aus der
    // laufenden App nur über den Zurück-Button oder die URL erreichbar.
    render(
      <MemoryRouter initialEntries={['/stammdaten/endkunden']}>
        <AppShell />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'EDMS' })).toHaveAttribute('href', '/');
  });

  describe('Marke der KIT Consulting GmbH', () => {
    function rendere(): void {
      render(
        <MemoryRouter initialEntries={['/']}>
          <AppShell />
        </MemoryRouter>,
      );
    }

    it('nennt den Urheber ausgeschrieben, nicht als Kürzel', () => {
      // „KIT" allein ist vom Karlsruher Institut für Technologie nicht zu
      // unterscheiden — und diese Software wird öffentlich sichtbar sein.
      rendere();

      expect(screen.getByText('KIT Consulting GmbH')).toBeInTheDocument();
      expect(screen.getByText('Kompetenzzentrum für Energie- und Gebäudeeffizienz')).toBeInTheDocument();
    });

    it('lässt den Accessible Name des Startseiten-Links unverändert „EDMS"', () => {
      // Das Signet steht NEBEN dem Produktnamen. Träge es einen eigenen
      // Alternativtext, hiesse der Link „KIT Consulting EDMS" — und der
      // sichtbare Text wäre nicht mehr der Accessible Name (WCAG 2.5.3).
      rendere();

      expect(screen.getByRole('link', { name: 'EDMS' })).toBeInTheDocument();
    });

    it('meldet das Signet NICHT als eigenes Bild an den Screenreader', () => {
      // Dekoratives Beiwerk: Der Firmenname steht als Text daneben. Zwei
      // Ansagen für eine Aussage sind eine Ansage zu viel.
      rendere();

      expect(screen.queryAllByRole('img')).toHaveLength(0);
    });
  });
});
