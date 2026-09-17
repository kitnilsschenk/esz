import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { runAxe } from '../testing/axe';
import { Textarea } from './textarea';
import { Label } from './label';

describe('Textarea', () => {
  it('rendert ein natives <textarea> und übernimmt Eingaben', () => {
    render(<Textarea aria-label="Beschreibung" />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Beschreibung' }), { target: { value: 'Freitext' } });

    expect(screen.getByRole('textbox', { name: 'Beschreibung' })).toHaveValue('Freitext');
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    const { container } = render(
      <>
        <Label htmlFor="beschreibung">Beschreibung</Label>
        <Textarea id="beschreibung" />
      </>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
