import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { runAxe } from '../testing/axe';
import { Button } from './button';

describe('Button', () => {
  it('rendert ein natives <button> mit type="button" als Default (kein versehentliches Form-Submit)', () => {
    render(<Button>Aktion</Button>);

    const button = screen.getByRole('button', { name: 'Aktion' });
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
  });

  it('respektiert einen explizit übergebenen type="submit"', () => {
    render(<Button type="submit">Absenden</Button>);

    expect(screen.getByRole('button', { name: 'Absenden' })).toHaveAttribute('type', 'submit');
  });

  it('ruft onClick auf, wenn nicht disabled', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Klick</Button>);

    fireEvent.click(screen.getByRole('button', { name: 'Klick' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('ist deaktiviert, wenn disabled gesetzt ist', () => {
    render(<Button disabled>Gesperrt</Button>);

    expect(screen.getByRole('button', { name: 'Gesperrt' })).toBeDisabled();
  });

  it('reicht eine ref an das zugrunde liegende <button>-Element durch', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Ref-Test</Button>);

    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('hat keine erkennbaren axe-Verstöße (alle Varianten)', async () => {
    const { container } = render(
      <>
        <Button variant="default">Primär</Button>
        <Button variant="secondary">Sekundär</Button>
        <Button variant="destructive">Löschen</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="link">Link</Button>
      </>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
