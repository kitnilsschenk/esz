import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { runAxe } from '../../../shared/testing/axe';
import { EinstiegKachel } from './EinstiegKachel';

function rendere(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <EinstiegKachel
        titel="BAFA-Export"
        beschreibung="Förderjahr prüfen, Einsparung zusammenfassen, Nachweis-Dateien erzeugen."
        ctaLabel="Zu den Förderjahren"
        ctaTo="/nachweis/foerderjahre"
      />
    </MemoryRouter>,
  );
}

describe('EinstiegKachel', () => {
  it('führt in den Bereich, statt ihn nur anzukündigen', () => {
    // Sie löst die grauen „bald"-Platzhalter ab: Der Bereich existiert jetzt.
    rendere();

    expect(screen.queryByText('bald')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zu den Förderjahren' })).toHaveAttribute('href', '/nachweis/foerderjahre');
  });

  it('trägt den Titel als Überschrift zweiter Ebene unter dem Seiten-Titel', () => {
    rendere();

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('BAFA-Export');
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    const { container } = rendere();

    expect(await runAxe(container)).toEqual([]);
  });
});
