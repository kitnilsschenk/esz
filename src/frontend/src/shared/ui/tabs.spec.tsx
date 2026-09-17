import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { runAxe } from '../testing/axe';
import { Tabs } from './tabs';

const ITEMS = [
  { id: 'uebersicht', label: 'Übersicht', content: <p>Übersichts-Inhalt</p> },
  { id: 'verbrauch', label: 'Verbrauch', content: <p>Verbrauchs-Inhalt</p> },
];

describe('Tabs', () => {
  it('zeigt initial den ERSTEN Tab aktiv und dessen Inhalt', () => {
    render(<Tabs items={ITEMS} ariaLabel="Endkunde-Bereiche" />);

    expect(screen.getByRole('tab', { name: 'Übersicht' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Übersichts-Inhalt')).toBeInTheDocument();
    expect(screen.queryByText('Verbrauchs-Inhalt')).not.toBeInTheDocument();
  });

  it('wechselt per Klick auf einen Tab-Button den aktiven Tab UND rendert dessen Inhalt', () => {
    render(<Tabs items={ITEMS} ariaLabel="Endkunde-Bereiche" />);

    fireEvent.click(screen.getByRole('tab', { name: 'Verbrauch' }));

    expect(screen.getByRole('tab', { name: 'Verbrauch' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Verbrauchs-Inhalt')).toBeInTheDocument();
    expect(screen.queryByText('Übersichts-Inhalt')).not.toBeInTheDocument();
  });

  it('rendert NUR das aktive Panel, kein zweites (verstecktes) Panel im DOM', () => {
    render(<Tabs items={ITEMS} ariaLabel="Endkunde-Bereiche" />);

    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  });

  it('bewegt Fokus UND Auswahl per Pfeiltaste (→) zum nächsten Tab', () => {
    render(<Tabs items={ITEMS} ariaLabel="Endkunde-Bereiche" />);

    const ersterTab = screen.getByRole('tab', { name: 'Übersicht' });
    ersterTab.focus();
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });

    const zweiterTab = screen.getByRole('tab', { name: 'Verbrauch' });
    expect(zweiterTab).toHaveAttribute('aria-selected', 'true');
    expect(zweiterTab).toHaveFocus();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    const { container } = render(<Tabs items={ITEMS} ariaLabel="Endkunde-Bereiche" />);

    expect(await runAxe(container)).toEqual([]);
  });
});
