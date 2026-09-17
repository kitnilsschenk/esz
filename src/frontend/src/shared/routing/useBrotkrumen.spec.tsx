import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { useBrotkrumen } from './useBrotkrumen';
import { leseBrotkrumen, loescheBrotkrumen, setzeBrotkrumen, type Brotkrume } from './brotkrumenStore';

function Seite({ krumen }: { readonly krumen: readonly Brotkrume[] }) {
  useBrotkrumen(krumen);
  return null;
}

function rendere(pfad: string, krumen: readonly Brotkrume[]) {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <Seite krumen={krumen} />
    </MemoryRouter>,
  );
}

describe('useBrotkrumen', () => {
  afterEach(() => {
    loescheBrotkrumen(leseBrotkrumen().pfad);
  });

  it('meldet den Pfad der Seite zusammen mit ihrer Route an', () => {
    rendere('/stammdaten/systeme/abc', [{ label: 'Systemgrenzen', to: '/stammdaten/systeme' }, { label: 'abc' }]);

    const zustand = leseBrotkrumen();
    expect(zustand.pfad).toBe('/stammdaten/systeme/abc');
    expect(zustand.krumen.map((k) => k.label)).toEqual(['Systemgrenzen', 'abc']);
  });

  it('räumt den Eintrag beim Verlassen der Seite ab', () => {
    const { unmount } = rendere('/stammdaten/systeme/abc', [{ label: 'abc' }]);
    unmount();

    expect(leseBrotkrumen().krumen).toEqual([]);
  });

  it('löscht NICHT den Eintrag, den inzwischen eine andere Seite geschrieben hat', () => {
    // Beim Routenwechsel kann die Nachfolgerin ihren Pfad melden, BEVOR die
    // Vorgängerin abgeräumt wird. Ein blindes Aufräumen im Cleanup würde den
    // frisch gesetzten Eintrag wieder wegnehmen.
    const { unmount } = rendere('/alt', [{ label: 'Alt' }]);
    setzeBrotkrumen('/neu', [{ label: 'Neu' }]);

    unmount();

    expect(leseBrotkrumen().pfad).toBe('/neu');
    expect(leseBrotkrumen().krumen.map((k) => k.label)).toEqual(['Neu']);
  });

  it('läuft nicht in eine Endlosschleife, wenn der Aufrufer das Array inline neu erzeugt', () => {
    // Der Regelfall in den Seiten: `useBrotkrumen([brotkrume.x(), …])` — bei
    // jedem Render eine neue Array-Referenz. Der Effekt vergleicht deshalb
    // serialisiert, nicht per Referenz.
    let renderZaehler = 0;
    function InlineSeite() {
      renderZaehler += 1;
      useBrotkrumen([{ label: 'Stabil', to: '/x' }]);
      return null;
    }

    const { rerender } = render(
      <MemoryRouter initialEntries={['/x/1']}>
        <InlineSeite />
      </MemoryRouter>,
    );
    const nachErstemRender = renderZaehler;
    rerender(
      <MemoryRouter initialEntries={['/x/1']}>
        <InlineSeite />
      </MemoryRouter>,
    );

    expect(renderZaehler).toBe(nachErstemRender + 1);
    expect(leseBrotkrumen().krumen.map((k) => k.label)).toEqual(['Stabil']);
  });
});
