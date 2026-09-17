import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { runAxe } from '../testing/axe';
import { Input } from './input';
import { Label } from './label';

describe('Input', () => {
  it('rendert ein natives <input type="text"> als Default', () => {
    render(<Input aria-label="Suche" />);

    const input = screen.getByRole('textbox', { name: 'Suche' });
    expect(input.tagName).toBe('INPUT');
    expect(input).toHaveAttribute('type', 'text');
  });

  it('übernimmt Eingaben und ruft onChange auf', () => {
    render(<Input aria-label="Name" />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Test GmbH' } });

    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Test GmbH');
  });

  it('reicht eine ref an das zugrunde liegende <input>-Element durch', () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input ref={ref} aria-label="Ref-Test" />);

    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it('hat auch mit aria-invalid keine erkennbaren axe-Verstöße', async () => {
    const { container } = render(
      <>
        <Label htmlFor="feld">Name</Label>
        <Input id="feld" aria-invalid="true" aria-describedby="feld-fehler" />
        <p id="feld-fehler" role="alert">
          Name ist erforderlich.
        </p>
      </>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
