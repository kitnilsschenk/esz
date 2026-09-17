import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { runAxe } from '../testing/axe';
import { Badge } from './badge';

describe('Badge', () => {
  it('rendert den übergebenen Inhalt in einem <span>', () => {
    render(<Badge>aktiv</Badge>);

    const badge = screen.getByText('aktiv');
    expect(badge.tagName).toBe('SPAN');
  });

  it('hat im Regelfall (alle Varianten) keine erkennbaren axe-Verstöße', async () => {
    const { container } = render(
      <>
        <Badge variant="default">Standard</Badge>
        <Badge variant="secondary">Sekundär</Badge>
        <Badge variant="destructive">Fehler</Badge>
        <Badge variant="outline">Outline</Badge>
        <Badge variant="success">Erfolg</Badge>
        <Badge variant="warning">Warnung</Badge>
      </>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
