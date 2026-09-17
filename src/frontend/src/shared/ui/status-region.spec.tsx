import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { runAxe } from '../testing/axe';
import { StatusRegion } from './status-region';

describe('StatusRegion', () => {
  it('zeigt eine Fehlermeldung als assertive `alert`-Region', () => {
    render(<StatusRegion ton="fehler" nachricht="Speichern fehlgeschlagen." />);

    expect(screen.getByRole('alert')).toHaveTextContent('Speichern fehlgeschlagen.');
  });

  it('rendert OHNE Fehlermeldung gar keine `alert`-Region', () => {
    // Eine dauerhaft leere `role="alert"`-Region würde neben den
    // Feld-Fehlermeldungen (ebenfalls `role="alert"`) einen zweiten,
    // inhaltsleeren Alert-Knoten erzeugen und „die" Fehlermeldung der Seite
    // mehrdeutig machen.
    render(<StatusRegion ton="fehler" nachricht={undefined} />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('hält die Erfolgs-Region auch ohne Nachricht im DOM', () => {
    // Eine polite Live-Region muss beim Textwechsel bereits beobachtet werden
    // — wird sie erst zusammen mit ihrem Text eingefügt, verschlucken mehrere
    // Screenreader die Ansage.
    const { rerender } = render(<StatusRegion ton="erfolg" nachricht={undefined} />);

    const region = screen.getByRole('status');
    expect(region).toBeEmptyDOMElement();
    expect(region).toHaveAttribute('aria-live', 'polite');

    rerender(<StatusRegion ton="erfolg" nachricht="Änderungen wurden gespeichert." />);

    // DERSELBE Knoten trägt jetzt den Text — kein Neu-Einfügen.
    expect(screen.getByRole('status')).toBe(region);
    expect(region).toHaveTextContent('Änderungen wurden gespeichert.');
  });

  it('nimmt ohne Nachricht keinen Platz im Layout ein (`sr-only`, position: absolute)', () => {
    render(<StatusRegion ton="erfolg" nachricht={undefined} className="w-full" />);

    // `sr-only` statt der sichtbaren Klassen — sonst entstünde in den
    // `flex … gap-4`-Containern der Aktions-Karten eine leere Lücke.
    expect(screen.getByRole('status')).toHaveClass('sr-only');
  });

  it('hat in allen Tönen keine erkennbaren axe-Verstöße', async () => {
    const { container } = render(
      <>
        <StatusRegion ton="erfolg" nachricht="Gespeichert." />
        <StatusRegion ton="fehler" nachricht="Fehlgeschlagen." />
        <StatusRegion ton="hinweis" nachricht="Bitte beachten." />
      </>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
