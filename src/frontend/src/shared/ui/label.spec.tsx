import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { runAxe } from '../testing/axe';
import { Label } from './label';
import { Input } from './input';

describe('Label', () => {
  it('verknüpft sich über htmlFor mit einem Eingabefeld (Klick fokussiert das Feld)', () => {
    render(
      <>
        <Label htmlFor="name-feld">Name</Label>
        <Input id="name-feld" />
      </>,
    );

    expect(screen.getByLabelText('Name')).toBe(screen.getByRole('textbox'));
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    const { container } = render(
      <>
        <Label htmlFor="a">Name</Label>
        <Input id="a" />
      </>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
