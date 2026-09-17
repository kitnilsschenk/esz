import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { runAxe } from '../shared/testing/axe';
import { Brotkrumen } from './Brotkrumen';
import { loescheBrotkrumen, setzeBrotkrumen } from '../shared/routing/brotkrumenStore';

const PFAD = '/stammdaten/endkunden/0198c3aa-aaaa-7000-8000-000000000001';

const KRUMEN = [
  { label: 'Endkunden', to: '/stammdaten/endkunden' },
  { label: '0198c3aa', to: PFAD },
  { label: 'Bearbeiten' },
];

function rendere(aktuellerPfad: string) {
  return render(
    <MemoryRouter initialEntries={[aktuellerPfad]}>
      <Brotkrumen />
    </MemoryRouter>,
  );
}

describe('Brotkrumen', () => {
  afterEach(() => {
    loescheBrotkrumen(PFAD);
  });

  it('rendert nichts, solange keine Seite einen Pfad gemeldet hat', () => {
    const { container } = rendere('/stammdaten/endkunden');

    expect(container).toBeEmptyDOMElement();
  });

  it('zeigt den gemeldeten Pfad als benannte Navigation mit geordneter Liste', () => {
    setzeBrotkrumen(PFAD, KRUMEN);
    rendere(PFAD);

    const nav = screen.getByRole('navigation', { name: 'Brotkrumenpfad' });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('verlinkt die Vorfahren und markiert das letzte Glied als aktuelle Seite', () => {
    setzeBrotkrumen(PFAD, KRUMEN);
    rendere(PFAD);

    expect(screen.getByRole('link', { name: 'Endkunden' })).toHaveAttribute('href', '/stammdaten/endkunden');
    expect(screen.getByRole('link', { name: '0198c3aa' })).toHaveAttribute('href', PFAD);
    // Letztes Glied ist KEIN Link — ein Verweis auf die Seite, auf der man
    // bereits steht, ist ein Klick ins Leere (ARIA-APG „Breadcrumb").
    expect(screen.queryByRole('link', { name: 'Bearbeiten' })).not.toBeInTheDocument();
    expect(screen.getByText('Bearbeiten')).toHaveAttribute('aria-current', 'page');
  });

  it('zeigt einen Eintrag NICHT an, der zu einer anderen Route gehört', () => {
    // Der Kern des Entwurfs: Beim Routenwechsel gibt es ein Zeitfenster, in
    // dem der Store noch den Eintrag der Vorgängerseite hält. Ein solcher
    // Eintrag wird verworfen, statt auf der neuen Seite aufzublitzen.
    setzeBrotkrumen(PFAD, KRUMEN);
    const { container } = rendere('/stammdaten/zaehler');

    expect(container).toBeEmptyDOMElement();
  });

  it('rendert nichts bei einem leeren Pfad (Listen-Seiten melden bewusst keinen)', () => {
    setzeBrotkrumen('/stammdaten/endkunden', []);
    const { container } = rendere('/stammdaten/endkunden');

    expect(container).toBeEmptyDOMElement();
    loescheBrotkrumen('/stammdaten/endkunden');
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    setzeBrotkrumen(PFAD, KRUMEN);
    const { container } = rendere(PFAD);

    expect(await runAxe(container)).toEqual([]);
  });
});
