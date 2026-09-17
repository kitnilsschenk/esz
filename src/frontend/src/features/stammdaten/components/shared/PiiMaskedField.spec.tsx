import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { PiiMaskedField } from './PiiMaskedField';

describe('PiiMaskedField', () => {
  it('zeigt den Klartext-Wert an, wenn er gesetzt ist', () => {
    render(
      <dl>
        <PiiMaskedField label="Name" value="Max Mustermann" />
      </dl>,
    );

    expect(screen.getByText('Max Mustermann')).toBeInTheDocument();
  });

  it('zeigt einen erkennbar maskierten Platzhalter, wenn der Wert null ist (D6)', () => {
    render(
      <dl>
        <PiiMaskedField label="Name" value={null} />
      </dl>,
    );

    expect(screen.getByLabelText('Für diese Rolle bzw. diesen Status maskiert')).toBeInTheDocument();
    expect(screen.queryByText('Max Mustermann')).not.toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    const { container } = render(
      <dl>
        <PiiMaskedField label="Name" value="Max Mustermann" />
        <PiiMaskedField label="Kontakt" value={null} />
      </dl>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
