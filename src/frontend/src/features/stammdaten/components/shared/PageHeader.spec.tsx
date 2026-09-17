import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('zeigt den Titel als <h1> mit der übergebenen `headingId`', () => {
    render(
      <MemoryRouter>
        <PageHeader headingId="endkunden-liste-heading" title="Endkunden" />
      </MemoryRouter>,
    );

    const heading = screen.getByRole('heading', { name: 'Endkunden', level: 1 });
    expect(heading).toHaveAttribute('id', 'endkunden-liste-heading');
  });

  it('rendert KEINEN Anlegen-Link, wenn `createAction` weggelassen wird', () => {
    render(
      <MemoryRouter>
        <PageHeader headingId="endkunden-liste-heading" title="Endkunden" />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('rendert den Anlegen-Link als Link-Button, wenn `createAction` übergeben wird', () => {
    render(
      <MemoryRouter>
        <PageHeader
          headingId="endkunden-liste-heading"
          title="Endkunden"
          createAction={{ to: '/stammdaten/endkunden/neu', label: 'Endkunde anlegen' }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Endkunde anlegen' })).toHaveAttribute(
      'href',
      '/stammdaten/endkunden/neu',
    );
  });

  it('hat keine erkennbaren axe-Verstöße (mit und ohne Anlegen-Link)', async () => {
    const { container, rerender } = render(
      <MemoryRouter>
        <PageHeader headingId="endkunden-liste-heading" title="Endkunden" />
      </MemoryRouter>,
    );
    expect(await runAxe(container)).toEqual([]);

    rerender(
      <MemoryRouter>
        <PageHeader
          headingId="endkunden-liste-heading"
          title="Endkunden"
          createAction={{ to: '/stammdaten/endkunden/neu', label: 'Endkunde anlegen' }}
        />
      </MemoryRouter>,
    );
    expect(await runAxe(container)).toEqual([]);
  });
});
