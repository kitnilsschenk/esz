import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runAxe } from '../testing/axe';
import { THEME_STORAGE_KEY } from './useTheme';
import { ThemeToggle } from './ThemeToggle';

describe('ThemeToggle', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('zeigt initial das Sonne-Icon (heller Modus) mit Label „Zu dunklem Farbschema wechseln"', () => {
    render(<ThemeToggle />);

    expect(screen.getByRole('button', { name: 'Zu dunklem Farbschema wechseln' })).toBeInTheDocument();
  });

  it('wechselt beim Klick in den dunklen Modus, setzt `.dark` auf `<html>` und persistiert die Wahl', () => {
    render(<ThemeToggle />);

    fireEvent.click(screen.getByRole('button', { name: 'Zu dunklem Farbschema wechseln' }));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(screen.getByRole('button', { name: 'Zu hellem Farbschema wechseln' })).toBeInTheDocument();
  });

  it('wechselt bei erneutem Klick zurück in den hellen Modus', () => {
    render(<ThemeToggle />);

    fireEvent.click(screen.getByRole('button', { name: 'Zu dunklem Farbschema wechseln' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zu hellem Farbschema wechseln' }));

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    const { container } = render(<ThemeToggle />);

    expect(await runAxe(container)).toEqual([]);
  });
});
