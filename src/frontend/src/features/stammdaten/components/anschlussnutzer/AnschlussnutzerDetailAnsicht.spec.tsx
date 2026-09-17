import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { AnschlussnutzerDetailAnsicht } from './AnschlussnutzerDetailAnsicht';

const { useAnschlussnutzerDetailViewMock, useAnschlussnutzerEntsperrenViewMock} = vi.hoisted(() => ({
  useAnschlussnutzerEntsperrenViewMock: vi.fn(() => ({
    unterrichtung: { isSubmitting: false, submitErrorMessage: undefined, erfolgsMeldung: undefined, unterrichten: vi.fn() },
    aufhebung: { isSubmitting: false, submitErrorMessage: undefined, erfolgsMeldung: undefined, entsperren: vi.fn() },
  })),
  useAnschlussnutzerDetailViewMock: vi.fn(),
}));

// Der Entsperr-Vorgang bringt eigene Live-Regionen mit und hat einen
// eigenen Spec — hier als Ganzes gestubbt, wie die uebrigen Aktions-
// Komponenten (sonst kollidieren mehrere `role="status"` mit der
// Ansage-Region dieser Ansicht).
vi.mock('../shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shared')>()),
  EinschraenkungAufhebenAktion: () => null,
}));
vi.mock('../../hooks/anschlussnutzer', () => ({ useAnschlussnutzerDetailView: useAnschlussnutzerDetailViewMock,
  useAnschlussnutzerEntsperrenView: useAnschlussnutzerEntsperrenViewMock,
}));
// Die Detailansicht rendert seit ADR-0007 A11.6 zusaetzlich die Sperr-Aktion.
// Sie wird hier als Ganzes gestubbt (Muster `EndkundeDetailAnsicht.spec`) —
// ihr eigener Spec prueft sie vollstaendig; hier wuerde sie nur einen
// QueryClient erzwingen, den diese Ansicht selbst nicht braucht.
vi.mock('../../../consent', () => ({ ConsentStandAbschnitt: () => <p>Einwilligungen (Stub)</p> }));
vi.mock('./AnschlussnutzerSperrenAktion', () => ({ AnschlussnutzerSperrenAktion: () => null }));

describe('AnschlussnutzerDetailAnsicht', () => {
  afterEach(() => {
    useAnschlussnutzerDetailViewMock.mockReset();
  });

  it('zeigt PII-Klartext für eine berechtigte Rolle (z. B. betrieb bei aktivem Subjekt)', () => {
    useAnschlussnutzerDetailViewMock.mockReturnValue({
      istGesperrt: false,
      istGeloescht: false,
      isPending: false,
      isError: false,
      fields: [{ key: 'id', label: 'ID', value: '0198c3aa' }],
      pii: { name: 'Erika Musterfrau', kontakt: 'keine Angabe' },
    });

    render(
      <MemoryRouter>
        <AnschlussnutzerDetailAnsicht anschlussnutzerId="0198c3aa-aaaa-7000-8000-000000000001" />
      </MemoryRouter>,
    );

    expect(screen.getByText('Erika Musterfrau')).toBeInTheDocument();
  });

  it('zeigt einen Maskierungs-Hinweis statt PII-Klartext, wenn der Server stammdatenPii maskiert hat (D6)', () => {
    useAnschlussnutzerDetailViewMock.mockReturnValue({
      istGesperrt: false,
      istGeloescht: false,
      isPending: false,
      isError: false,
      fields: [{ key: 'id', label: 'ID', value: '0198c3aa' }],
      pii: { name: null, kontakt: null },
    });

    render(
      <MemoryRouter>
        <AnschlussnutzerDetailAnsicht anschlussnutzerId="0198c3aa-aaaa-7000-8000-000000000001" />
      </MemoryRouter>,
    );

    expect(screen.queryByText('Erika Musterfrau')).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('Für diese Rolle bzw. diesen Status maskiert')).toHaveLength(2);
  });

  it('gibt dem PII-`<dl>` die restylte Grid-Klasse (statt der globalen 2-Spalten-Fallback-Regel)', () => {
    useAnschlussnutzerDetailViewMock.mockReturnValue({
      istGesperrt: false,
      istGeloescht: false,
      isPending: false,
      isError: false,
      fields: [{ key: 'id', label: 'ID', value: '0198c3aa' }],
      pii: { name: 'Erika Musterfrau', kontakt: 'keine Angabe' },
    });

    const { container } = render(
      <MemoryRouter>
        <AnschlussnutzerDetailAnsicht anschlussnutzerId="0198c3aa-aaaa-7000-8000-000000000001" />
      </MemoryRouter>,
    );

    // Das ERSTE `<dl>` ist `DetailView`s eigenes Kernfelder-`<dl>` — das PII-`<dl>`
    // (`PiiMaskedField`-Sektion) ist das LETZTE `<dl>` im Baum.
    const alleDl = container.querySelectorAll('dl');
    expect(alleDl[alleDl.length - 1]).toHaveClass('grid', 'grid-cols-1', 'gap-y-4');
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useAnschlussnutzerDetailViewMock.mockReturnValue({
      istGesperrt: false,
      istGeloescht: false,
      isPending: false,
      isError: false,
      fields: [{ key: 'id', label: 'ID', value: '0198c3aa' }],
      pii: { name: 'Erika Musterfrau', kontakt: 'keine Angabe' },
    });

    const { container } = render(
      <MemoryRouter>
        <AnschlussnutzerDetailAnsicht anschlussnutzerId="0198c3aa-aaaa-7000-8000-000000000001" />
      </MemoryRouter>,
    );

    expect(await runAxe(container)).toEqual([]);
  });

  it('zeigt den Consent-Stand — im Mietfall ist der Anschlussnutzer die betroffene Person (DS-07)', () => {
    useAnschlussnutzerDetailViewMock.mockReturnValue({
      istGesperrt: false,
      istGeloescht: false,
      isPending: false,
      isError: false,
      fields: [{ key: 'id', label: 'ID', value: '0198c3aa' }],
      pii: { name: 'Erika Musterfrau', kontakt: 'keine Angabe' },
    });

    render(
      <MemoryRouter>
        <AnschlussnutzerDetailAnsicht anschlussnutzerId="0198c3aa-aaaa-7000-8000-000000000001" />
      </MemoryRouter>,
    );

    expect(screen.getByText('Einwilligungen (Stub)')).toBeInTheDocument();
  });
});
