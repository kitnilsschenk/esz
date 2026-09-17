import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { runAxe } from '../testing/axe';
import { Select } from './select';
import { Label } from './label';

describe('Select', () => {
  it('rendert ein natives <select> mit Optionen und übernimmt die Auswahl', () => {
    render(
      <Select aria-label="System" defaultValue="">
        <option value="">Bitte wählen</option>
        <option value="sys-1">System 1</option>
      </Select>,
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'System' }), { target: { value: 'sys-1' } });

    expect(screen.getByRole('combobox', { name: 'System' })).toHaveValue('sys-1');
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    const { container } = render(
      <>
        <Label htmlFor="system">System</Label>
        <Select id="system" defaultValue="">
          <option value="">Bitte wählen</option>
          <option value="sys-1">System 1</option>
        </Select>
      </>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
