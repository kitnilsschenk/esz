import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { DetailView } from './DetailView';

describe('DetailView', () => {
  it('zeigt die Ladeanzeige, wenn isPending true ist', () => {
    render(
      <DetailView headingId="h" title="Titel" isPending isError={false} loadingMessage="Lädt …" errorMessage="Fehler" />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Lädt …');
  });

  it('zeigt die Fehlermeldung, wenn isError true ist', () => {
    render(
      <DetailView headingId="h" title="Titel" isPending={false} isError loadingMessage="Lädt …" errorMessage="Fehler" />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Fehler');
  });

  it('rendert Felder und children, wenn geladen und fehlerfrei', () => {
    render(
      <DetailView
        headingId="h"
        title="Titel"
        isPending={false}
        isError={false}
        loadingMessage="Lädt …"
        errorMessage="Fehler"
        fields={[{ key: 'a', label: 'Status', value: 'aktiv' }]}
      >
        <p>Zusatzinhalt</p>
      </DetailView>,
    );

    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('aktiv')).toBeInTheDocument();
    expect(screen.getByText('Zusatzinhalt')).toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    const { container } = render(
      <DetailView
        headingId="h"
        title="Titel"
        isPending={false}
        isError={false}
        loadingMessage="Lädt …"
        errorMessage="Fehler"
        fields={[{ key: 'a', label: 'Status', value: 'aktiv' }]}
      />,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
