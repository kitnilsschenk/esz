import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { HerkunftMappingAbschnitt } from './HerkunftMappingAbschnitt';

const { listeViewMock, anlegenViewMock, entfernenViewMock } = vi.hoisted(() => ({
  listeViewMock: vi.fn(),
  anlegenViewMock: vi.fn(),
  entfernenViewMock: vi.fn(),
}));

vi.mock('../../hooks/herkunftMapping', () => ({
  useHerkunftMappingListeView: listeViewMock,
  useHerkunftMappingAnlegenView: anlegenViewMock,
  useHerkunftMappingEntfernenView: entfernenViewMock,
}));

const ZEILE = {
  id: '018f1e2d-0000-7000-8000-0000000000aa',
  quelleLabel: 'netz-lahnstein',
  tenantId: '7a000000-0000-4000-8000-00000000000a',
  tenantIdKurz: '7a000000',
  applicationId: 'a9000000-0000-4000-8000-000000000001',
  applicationIdKurz: 'a9000000',
  endkundeId: '018f1e2d-0000-7000-8000-00000000000e',
  endkundeIdKurz: '018f1e2d',
  standortId: '018f1e2d-0000-7000-8000-000000000051',
  standortIdKurz: '018f1e2d',
  standortTypLabel: 'Gebäude',
  angelegtLabel: '05.09.2026, 14:00',
};

function mockListe(items: readonly unknown[], overrides: Record<string, unknown> = {}): void {
  listeViewMock.mockReturnValue({ items, isPending: false, isError: false, ...overrides });
}

function renderAbschnitt(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <HerkunftMappingAbschnitt />
    </MemoryRouter>,
  );
}

/** Wie `renderAbschnitt`, oeffnet aber zusaetzlich das zugeklappte Formular. */
function renderMitOffenemFormular(): ReturnType<typeof render> {
  const ergebnis = renderAbschnitt();
  fireEvent.click(screen.getByRole('button', { name: 'Application zuordnen' }));
  return ergebnis;
}

describe('HerkunftMappingAbschnitt (ADR-0011 B2/D3)', () => {
  const anlegen = vi.fn();
  const entfernen = vi.fn();

  beforeEach(() => {
    mockListe([ZEILE]);
    anlegenViewMock.mockReturnValue({
      anlegen,
      isSubmitting: false,
      submitErrorMessage: undefined,
      erfolgsMeldung: undefined,
    });
    entfernenViewMock.mockReturnValue({
      entfernen,
      laufendeId: undefined,
      isSubmitting: false,
      submitErrorMessage: undefined,
      erfolgsMeldung: undefined,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('zeigt eine Zuordnung mit gekürzten Kennungen und dem Standort-Typ', () => {
    renderAbschnitt();

    expect(screen.getByText('7a000000')).toBeInTheDocument();
    expect(screen.getByText('a9000000')).toBeInTheDocument();
    expect(screen.getByText('Gebäude')).toBeInTheDocument();
    expect(screen.getByText('netz-lahnstein')).toBeInTheDocument();
  });

  it('hält die vollständige Kennung im title bereit — zum Abgleich mit dem Netzserver', () => {
    renderAbschnitt();

    expect(screen.getByTitle(ZEILE.tenantId)).toBeInTheDocument();
    expect(screen.getByTitle(ZEILE.applicationId)).toBeInTheDocument();
  });

  it('zeigt KEINEN Standort- oder Endkundennamen — die Fläche ist PII-frei', () => {
    // Regressionstest zur Absicht: Der Standortname liegt feldverschlüsselt
    // in `identity.standort_pii`. Träte er hier je auf, wäre das ein
    // PII-Austritt in eine Betriebssicht, die auch `compliance-auditor` sieht.
    renderAbschnitt();

    const tabelle = screen.getByRole('table');
    expect(tabelle.textContent).not.toMatch(/Lahnstein\s+\d/);
    expect(screen.queryByText(/Musterstraße|Musterstrasse/)).not.toBeInTheDocument();
  });

  it('sagt im Leerzustand, was als Nächstes zu tun ist', () => {
    mockListe([]);
    renderAbschnitt();

    expect(screen.getByText(/Legen Sie unten die erste Zuordnung an/)).toBeInTheDocument();
  });

  it('entfernt eine Zuordnung über den Knopf der jeweiligen Zeile', () => {
    renderAbschnitt();

    fireEvent.click(screen.getByRole('button', { name: /Zuordnung entfernen a9000000/ }));

    expect(entfernen).toHaveBeenCalledWith(ZEILE.id);
  });

  it('sperrt nur, solange ein Entfernen läuft', () => {
    entfernenViewMock.mockReturnValue({
      entfernen,
      laufendeId: ZEILE.id,
      isSubmitting: true,
      submitErrorMessage: undefined,
      erfolgsMeldung: undefined,
    });
    renderAbschnitt();

    expect(screen.getByRole('button', { name: /Zuordnung entfernen a9000000/ })).toBeDisabled();
  });

  it('benennt nach dem Entfernen die FOLGE, nicht nur den Vollzug', () => {
    // „Entfernt" allein verschweigt das Wesentliche: Für diesen Mandanten
    // wird ab sofort nicht mehr geprüft.
    entfernenViewMock.mockReturnValue({
      entfernen,
      laufendeId: undefined,
      isSubmitting: false,
      submitErrorMessage: undefined,
      erfolgsMeldung: 'Zuordnung entfernt. Für diesen Mandanten wird die Herkunft ab sofort nicht mehr geprüft.',
    });
    renderAbschnitt();

    expect(screen.getByText(/nicht mehr geprüft/)).toBeInTheDocument();
  });

  it('weist eine unvollständige Kennung ab, bevor sie den Server erreicht', () => {
    renderMitOffenemFormular();

    fireEvent.change(screen.getByLabelText(/Mandanten-Kennung/), { target: { value: 'keine-uuid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Zuordnung anlegen' }));

    expect(anlegen).not.toHaveBeenCalled();
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  });

  it('reicht eine vollständige Eingabe an die Mutation weiter', () => {
    renderMitOffenemFormular();

    fireEvent.change(screen.getByLabelText(/Mandanten-Kennung/), { target: { value: ZEILE.tenantId } });
    fireEvent.change(screen.getByLabelText(/Application-Kennung/), { target: { value: ZEILE.applicationId } });
    fireEvent.change(screen.getByLabelText(/^Endkunde/), { target: { value: ZEILE.endkundeId } });
    fireEvent.change(screen.getByLabelText(/^Standort/), { target: { value: ZEILE.standortId } });
    fireEvent.click(screen.getByRole('button', { name: 'Zuordnung anlegen' }));

    expect(anlegen).toHaveBeenCalledWith(
      expect.objectContaining({
        chirpstackTenantId: ZEILE.tenantId,
        chirpstackApplicationId: ZEILE.applicationId,
        endkundeId: ZEILE.endkundeId,
        standortId: ZEILE.standortId,
      }),
    );
  });

  it('ist barrierefrei (axe)', async () => {
    const { container } = renderAbschnitt();

    expect(await runAxe(container)).toEqual([]);
  });
});
