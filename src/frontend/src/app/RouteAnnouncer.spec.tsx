import { useRef, type ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { runAxe } from '../shared/testing/axe';
import { setzeSeitentitel } from '../shared/routing/seitentitelStore';
import { RouteAnnouncer } from './RouteAnnouncer';

interface NavigiereButtonProps {
  readonly zu: string;
}

function NavigiereButton({ zu }: NavigiereButtonProps): ReactNode {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => {
        void navigate(zu);
      }}
    >
      navigiere
    </button>
  );
}

/** Simuliert `AppShell.tsx`s `<main ref tabIndex={-1}>` + `RouteAnnouncer`. */
function Testlayout(): ReactNode {
  const hauptinhaltRef = useRef<HTMLElement>(null);
  return (
    <div>
      <main ref={hauptinhaltRef} tabIndex={-1}>
        Hauptinhalt
      </main>
      <RouteAnnouncer hauptinhaltRef={hauptinhaltRef} />
      <NavigiereButton zu="/ziel" />
    </div>
  );
}

describe('RouteAnnouncer', () => {
  it('fokussiert den Hauptinhalt NICHT beim allerersten Mount', () => {
    render(
      <MemoryRouter initialEntries={['/start']}>
        <Testlayout />
      </MemoryRouter>,
    );

    expect(document.activeElement).not.toBe(screen.getByText('Hauptinhalt'));
  });

  it('fokussiert den Hauptinhalt bei einem Routenwechsel (auch bei reinem Parameterwechsel)', () => {
    render(
      <MemoryRouter initialEntries={['/start']}>
        <Testlayout />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'navigiere' }));

    expect(document.activeElement).toBe(screen.getByText('Hauptinhalt'));
  });

  it('zeigt den aktuellen Seitentitel in einer versteckten aria-live-Region an', () => {
    setzeSeitentitel('EDMS — Testseite');

    render(
      <MemoryRouter initialEntries={['/start']}>
        <Testlayout />
      </MemoryRouter>,
    );

    expect(screen.getByText('EDMS — Testseite')).toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/start']}>
        <Testlayout />
      </MemoryRouter>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
