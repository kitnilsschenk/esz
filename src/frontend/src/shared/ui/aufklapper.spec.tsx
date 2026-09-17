import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { runAxe } from '../testing/axe';
import { Aufklapper } from './aufklapper';

describe('Aufklapper', () => {
  it('beginnt zugeklappt und rendert seinen Inhalt erst beim Öffnen', () => {
    // Nicht nur ausgeblendet, sondern gar nicht gerendert: Ein zugeklapptes
    // Formular soll weder Fokus noch Zustand festhalten.
    render(
      <Aufklapper titel="Datenquelle anlegen">
        <input aria-label="Broker-Adresse" />
      </Aufklapper>,
    );

    expect(screen.queryByLabelText('Broker-Adresse')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Datenquelle anlegen' }));

    expect(screen.getByLabelText('Broker-Adresse')).toBeInTheDocument();
  });

  it('meldet den Zustand über `aria-expanded`', () => {
    render(
      <Aufklapper titel="Zuordnung anlegen">
        <p>Inhalt</p>
      </Aufklapper>,
    );

    const schalter = screen.getByRole('button', { name: 'Zuordnung anlegen' });
    expect(schalter).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(schalter);
    expect(schalter).toHaveAttribute('aria-expanded', 'true');
  });

  it('zeigt den Hinweis im zugeklappten Zustand — zugeklappt ist nicht versteckt', () => {
    render(
      <Aufklapper titel="Datenquelle anlegen" hinweis="Ein MQTT-Broker, von dem Messwerte entgegengenommen werden.">
        <p>Formular</p>
      </Aufklapper>,
    );

    expect(screen.getByText(/Ein MQTT-Broker/)).toBeInTheDocument();
  });

  it('kann von vornherein offen sein', () => {
    render(
      <Aufklapper titel="Offen" initialOffen>
        <p>Sichtbar</p>
      </Aufklapper>,
    );

    expect(screen.getByText('Sichtbar')).toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    const { container } = render(
      <Aufklapper titel="Datenquelle anlegen" hinweis="Hinweis">
        <p>Inhalt</p>
      </Aufklapper>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
