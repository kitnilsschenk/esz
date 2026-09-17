import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { runAxe } from '../testing/axe';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card';

describe('Card', () => {
  it('rendert Titel, Beschreibung, Inhalt und Footer in der erwarteten Struktur', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Titel</CardTitle>
          <CardDescription>Beschreibung</CardDescription>
        </CardHeader>
        <CardContent>Inhalt</CardContent>
        <CardFooter>Aktionen</CardFooter>
      </Card>,
    );

    expect(screen.getByRole('heading', { name: 'Titel' })).toBeInTheDocument();
    expect(screen.getByText('Beschreibung')).toBeInTheDocument();
    expect(screen.getByText('Inhalt')).toBeInTheDocument();
    expect(screen.getByText('Aktionen')).toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    const { container } = render(
      <Card>
        <CardHeader>
          <CardTitle>Titel</CardTitle>
          <CardDescription>Beschreibung</CardDescription>
        </CardHeader>
        <CardContent>Inhalt</CardContent>
      </Card>,
    );

    expect(await runAxe(container)).toEqual([]);
  });

  it('rendert `CardTitle` mit der über `as` übergebenen Überschriften-Ebene (Default bleibt `h3`)', () => {
    render(
      <div>
        <CardTitle>Standard</CardTitle>
        <CardTitle as="h1">Seiten-Titel</CardTitle>
        <CardTitle as="h2">Sektions-Titel</CardTitle>
      </div>,
    );

    expect(screen.getByRole('heading', { name: 'Standard', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Seiten-Titel', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sektions-Titel', level: 2 })).toBeInTheDocument();
  });

  it('staffelt die Schriftgröße nach Überschriften-Ebene', () => {
    // Zuvor rendered CardTitle unabhängig von `as` immer `text-base` — Seiten-,
    // Abschnitts- und Kartenüberschrift waren optisch identisch, die einzige
    // Gliederung war der Kartenrahmen.
    const { unmount } = render(<CardTitle as="h1">Titel</CardTitle>);
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('text-xl');
    unmount();

    const zweite = render(<CardTitle as="h2">Abschnitt</CardTitle>);
    expect(screen.getByRole('heading', { level: 2 })).toHaveClass('text-base');
    zweite.unmount();

    render(<CardTitle>Unterabschnitt</CardTitle>);
    expect(screen.getByRole('heading', { level: 3 })).toHaveClass('text-sm');
  });

  it('lässt die Größe weiterhin per className übersteuern', () => {
    render(
      <CardTitle as="h2" className="text-xl">
        Sonderfall
      </CardTitle>,
    );

    const ueberschrift = screen.getByRole('heading', { level: 2 });
    expect(ueberschrift).toHaveClass('text-xl');
    expect(ueberschrift).not.toHaveClass('text-base');
  });
});
