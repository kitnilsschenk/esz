import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { EndkundeDetailAnsicht } from './EndkundeDetailAnsicht';

const { useEndkundeDetailViewMock, useEndkundeShredAntragOffenViewMock, useKannStammdatenAnlegenMock, useEndkundeEntsperrenViewMock} = vi.hoisted(() => ({
  useEndkundeEntsperrenViewMock: vi.fn(() => ({
    unterrichtung: { isSubmitting: false, submitErrorMessage: undefined, erfolgsMeldung: undefined, unterrichten: vi.fn() },
    aufhebung: { isSubmitting: false, submitErrorMessage: undefined, erfolgsMeldung: undefined, entsperren: vi.fn() },
  })),
  useEndkundeDetailViewMock: vi.fn(),
  useEndkundeShredAntragOffenViewMock: vi.fn(),
  useKannStammdatenAnlegenMock: vi.fn(),
}));

// Der Entsperr-Vorgang bringt eigene Live-Regionen mit und hat einen
// eigenen Spec — hier als Ganzes gestubbt, wie die uebrigen Aktions-
// Komponenten (sonst kollidieren mehrere `role="status"` mit der
// Ansage-Region dieser Ansicht).
vi.mock('../shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shared')>()),
  EinschraenkungAufhebenAktion: () => null,
}));
vi.mock('../../hooks/endkunde', () => ({
  useEndkundeDetailView: useEndkundeDetailViewMock,
  useEndkundeShredAntragOffenView: useEndkundeShredAntragOffenViewMock,
  useEndkundeEntsperrenView: useEndkundeEntsperrenViewMock,
}));
vi.mock('../../hooks/shared/useKannStammdatenAnlegen', () => ({ useKannStammdatenAnlegen: useKannStammdatenAnlegenMock }));
// Eigene Testdatei: `MesskonzeptVersionenTabelle.spec.tsx` (Messkonzept-Slice)
// — hier bewusst als No-Op gemockt (analog `ZaehlerDetailAnsicht.spec.tsx` /
// `MesskanaeleTabelle`), damit dieser Test ausschließlich das
// Endkunde-Detail-Rendering prüft (kein `QueryClientProvider` nötig).
vi.mock('../messkonzept', () => ({ MesskonzeptVersionenTabelle: () => null }));
// Eingebettete Kind-Listen (Systeme/Anschlussnutzer des Endkunden) — gestubbt
// wie die Messkonzept-Tabelle darüber: Dieser Test prüft die Detail-Ansicht,
// nicht die Listen; ungestubbt bräuchten sie einen QueryClientProvider.
vi.mock('../system', () => ({ SystemeTabelle: () => null }));
vi.mock('../anschlussnutzer', () => ({ AnschlussnutzerTabelle: () => null }));
// Eigene Testdateien: `EndkundeSperrenAktion.spec.tsx`,
// `EndkundeShreddenAktion.spec.tsx`, `EndkundeShredAntragOffen.spec.tsx` —
// hier bewusst als No-Op gemockt (analog `SystemDetailAnsicht.spec.tsx`s
// Mocks für `SystemAendernFormular`/`SystemStilllegenAktion`); alle drei
// riefen sonst intern TanStack-Mutation-Hooks auf, die einen
// `QueryClientProvider` bräuchten.
// Holt eigene Daten (TanStack Query) -- wie die uebrigen Kind-Komponenten
// gestubbt; der eigene Verhaltenstest liegt in `features/consent/`.
vi.mock('../../../consent', () => ({ ConsentStandAbschnitt: () => <p>Einwilligungen (Stub)</p> }));
vi.mock('../../../nutzerinfo', () => ({
  NutzerinfoVerlaufAbschnitt: () => <p>Monatliche Information (Stub)</p>,
}));
// Holt ebenfalls eigene Daten; eigener Verhaltenstest in `features/portal/`.
vi.mock('../../../portal', () => ({ PortalZugangAbschnitt: () => <p>Portal-Zugang (Stub)</p> }));
vi.mock('../../../geraeteerkennung', () => ({ GeraeteerkennungAbschnitt: () => null }));
vi.mock('./EndkundeSperrenAktion', () => ({ EndkundeSperrenAktion: () => null }));
vi.mock('./EndkundeShreddenAktion', () => ({ EndkundeShreddenAktion: () => <p>Beantragen-Aktion (Stub)</p> }));
vi.mock('./EndkundeShredAntragOffen', () => ({ EndkundeShredAntragOffen: () => <p>Offener-Antrag-Sektion (Stub)</p> }));

const ENDKUNDE_ID = '0198c3aa-aaaa-7000-8000-000000000001';

const BASE_DETAIL_VIEW = {
  isPending: false,
  isError: false,
  fields: [{ key: 'id', label: 'ID', value: '0198c3aa' }],
  pii: { name: 'Max Mustermann', anschrift: 'Musterstraße 1', kontakt: 'keine Angabe' },
  istGesperrt: false,
  istGeschreddert: false,
};

const BASE_SHRED_ANTRAG_VIEW = {
  isPending: false,
  antrag: undefined,
};

/**
 * Waehlt einen Reiter der Detailseite.
 *
 * Die Seite stapelte ihre dreizehn Abschnitte frueher untereinander; seit
 * dem Umbau liegen sie in fuenf Reitern. Die Tests folgen dem Bediener:
 * erst den Reiter waehlen, dann pruefen.
 */
function oeffneReiter(name: string): void {
  fireEvent.click(screen.getByRole('tab', { name }));
}

describe('EndkundeDetailAnsicht', () => {
  // Default für den NEUEN Shred-Antrag-Hook (kein offener Antrag, nicht
  // pendent) — die bestehenden Tests unten prüfen andere Aspekte und setzen
  // diesen Mock deshalb NICHT jedes Mal selbst; einzelne neue Tests
  // überschreiben ihn gezielt.
  beforeEach(() => {
    useEndkundeShredAntragOffenViewMock.mockReturnValue(BASE_SHRED_ANTRAG_VIEW);
  });

  afterEach(() => {
    useEndkundeDetailViewMock.mockReset();
    useEndkundeShredAntragOffenViewMock.mockReset();
    useKannStammdatenAnlegenMock.mockReset();
  });

  it('zeigt PII-Klartext für eine berechtigte Rolle (z. B. betrieb bei aktivem Subjekt)', () => {
    useEndkundeDetailViewMock.mockReturnValue(BASE_DETAIL_VIEW);
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    render(
      <MemoryRouter>
        <EndkundeDetailAnsicht endkundeId={ENDKUNDE_ID} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Max Mustermann')).toBeInTheDocument();
    expect(screen.getByText('Musterstraße 1')).toBeInTheDocument();
  });

  it('zeigt einen Maskierungs-Hinweis statt PII-Klartext, wenn der Server stammdatenPii maskiert hat (D6)', () => {
    useEndkundeDetailViewMock.mockReturnValue({
      ...BASE_DETAIL_VIEW,
      pii: { name: null, anschrift: null, kontakt: null },
    });
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    render(
      <MemoryRouter>
        <EndkundeDetailAnsicht endkundeId={ENDKUNDE_ID} />
      </MemoryRouter>,
    );

    expect(screen.queryByText('Max Mustermann')).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('Für diese Rolle bzw. diesen Status maskiert')).toHaveLength(3);
  });

  it('zeigt den „Neue Version anlegen"-Link nur für Rollen mit Anlegen-Berechtigung', () => {
    useEndkundeDetailViewMock.mockReturnValue(BASE_DETAIL_VIEW);
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    render(
      <MemoryRouter>
        <EndkundeDetailAnsicht endkundeId={ENDKUNDE_ID} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Neue Version anlegen' })).toHaveAttribute(
      'href',
      `/stammdaten/endkunden/${ENDKUNDE_ID}/messkonzept/versionen/neu`,
    );
  });

  it('blendet den „Neue Version anlegen"-Link für rein lesende Rollen aus', () => {
    useEndkundeDetailViewMock.mockReturnValue(BASE_DETAIL_VIEW);
    useKannStammdatenAnlegenMock.mockReturnValue(false);

    render(
      <MemoryRouter>
        <EndkundeDetailAnsicht endkundeId={ENDKUNDE_ID} />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('link', { name: 'Neue Version anlegen' })).not.toBeInTheDocument();
  });

  it('zeigt den „Bearbeiten"-Link zur Ändern-Route nur für Rollen mit Anlegen-/Änderungs-Berechtigung', () => {
    useEndkundeDetailViewMock.mockReturnValue(BASE_DETAIL_VIEW);
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    render(
      <MemoryRouter>
        <EndkundeDetailAnsicht endkundeId={ENDKUNDE_ID} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Bearbeiten' })).toHaveAttribute(
      'href',
      `/stammdaten/endkunden/${ENDKUNDE_ID}/aendern`,
    );
  });

  it('blendet den „Bearbeiten"-Link für rein lesende Rollen aus', () => {
    useEndkundeDetailViewMock.mockReturnValue(BASE_DETAIL_VIEW);
    useKannStammdatenAnlegenMock.mockReturnValue(false);

    render(
      <MemoryRouter>
        <EndkundeDetailAnsicht endkundeId={ENDKUNDE_ID} />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('link', { name: 'Bearbeiten' })).not.toBeInTheDocument();
  });

  it('gibt dem PII-`<dl>` die restylte Grid-Klasse (statt der globalen 2-Spalten-Fallback-Regel)', () => {
    useEndkundeDetailViewMock.mockReturnValue(BASE_DETAIL_VIEW);
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    const { container } = render(
      <MemoryRouter>
        <EndkundeDetailAnsicht endkundeId={ENDKUNDE_ID} />
      </MemoryRouter>,
    );

    // Das ERSTE `<dl>` ist `DetailView`s eigenes Kernfelder-`<dl>` — das PII-`<dl>`
    // (`PiiMaskedField`-Sektion) ist das LETZTE `<dl>` im Baum.
    const piiDl = container.querySelectorAll('dl')[container.querySelectorAll('dl').length - 1];
    expect(piiDl).toHaveClass('grid', 'grid-cols-1', 'gap-y-4');
  });

  it('sagt erfolgreiches Sperren über eine aria-live-Region an, sobald `istGesperrt` von false auf true wechselt', () => {
    useEndkundeDetailViewMock.mockReturnValue(BASE_DETAIL_VIEW);
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    const { rerender } = render(
      <MemoryRouter>
        <EndkundeDetailAnsicht endkundeId={ENDKUNDE_ID} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('');

    useEndkundeDetailViewMock.mockReturnValue({ ...BASE_DETAIL_VIEW, istGesperrt: true });
    rerender(
      <MemoryRouter>
        <EndkundeDetailAnsicht endkundeId={ENDKUNDE_ID} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Endkunde wurde erfolgreich gesperrt (Art. 18).');
  });

  it('sagt erfolgreiches Kryptoshredding über dieselbe aria-live-Region an, sobald `istGeschreddert` von false auf true wechselt', () => {
    useEndkundeDetailViewMock.mockReturnValue(BASE_DETAIL_VIEW);
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    const { rerender } = render(
      <MemoryRouter>
        <EndkundeDetailAnsicht endkundeId={ENDKUNDE_ID} />
      </MemoryRouter>,
    );

    useEndkundeDetailViewMock.mockReturnValue({ ...BASE_DETAIL_VIEW, istGeschreddert: true });
    rerender(
      <MemoryRouter>
        <EndkundeDetailAnsicht endkundeId={ENDKUNDE_ID} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Endkunde wurde krypto-geschreddert (Art. 17) — die personenbezogenen Daten sind unwiderruflich unlesbar.',
    );
  });

  it('sagt NICHT an, wenn ein bereits gesperrter Endkunde direkt geladen wird (keine false→true-Flanke)', () => {
    useEndkundeDetailViewMock.mockReturnValue({ ...BASE_DETAIL_VIEW, istGesperrt: true });
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    render(
      <MemoryRouter>
        <EndkundeDetailAnsicht endkundeId={ENDKUNDE_ID} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useEndkundeDetailViewMock.mockReturnValue(BASE_DETAIL_VIEW);
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    const { container } = render(
      <MemoryRouter>
        <EndkundeDetailAnsicht endkundeId={ENDKUNDE_ID} />
      </MemoryRouter>,
    );

    expect(await runAxe(container)).toEqual([]);
  });

  it('zeigt die „beantragen"-Aktion, solange KEIN offener Shred-Antrag existiert', () => {
    useEndkundeDetailViewMock.mockReturnValue(BASE_DETAIL_VIEW);
    useEndkundeShredAntragOffenViewMock.mockReturnValue(BASE_SHRED_ANTRAG_VIEW);
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    render(
      <MemoryRouter>
        <EndkundeDetailAnsicht endkundeId={ENDKUNDE_ID} />
      </MemoryRouter>,
    );

    oeffneReiter('Datenschutz');

    expect(screen.getByText('Beantragen-Aktion (Stub)')).toBeInTheDocument();
    expect(screen.queryByText('Offener-Antrag-Sektion (Stub)')).not.toBeInTheDocument();
  });

  it('zeigt STATT der „beantragen"-Aktion die „Offener Shred-Antrag"-Sektion, sobald ein Antrag existiert (mutually exclusive)', () => {
    useEndkundeDetailViewMock.mockReturnValue(BASE_DETAIL_VIEW);
    useEndkundeShredAntragOffenViewMock.mockReturnValue({
      isPending: false,
      antrag: { id: '0198c3aa-bbbb-7000-8000-000000000002', status: 'beantragt' },
    });
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    render(
      <MemoryRouter>
        <EndkundeDetailAnsicht endkundeId={ENDKUNDE_ID} />
      </MemoryRouter>,
    );

    oeffneReiter('Datenschutz');

    expect(screen.getByText('Offener-Antrag-Sektion (Stub)')).toBeInTheDocument();
    expect(screen.queryByText('Beantragen-Aktion (Stub)')).not.toBeInTheDocument();
  });

  it('zeigt WEDER die „beantragen"-Aktion NOCH die „Offener Antrag"-Sektion, solange die Antrags-Abfrage noch lädt (kein Flackern)', () => {
    useEndkundeDetailViewMock.mockReturnValue(BASE_DETAIL_VIEW);
    useEndkundeShredAntragOffenViewMock.mockReturnValue({ isPending: true, antrag: undefined });
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    render(
      <MemoryRouter>
        <EndkundeDetailAnsicht endkundeId={ENDKUNDE_ID} />
      </MemoryRouter>,
    );

    expect(screen.queryByText('Beantragen-Aktion (Stub)')).not.toBeInTheDocument();
    expect(screen.queryByText('Offener-Antrag-Sektion (Stub)')).not.toBeInTheDocument();
  });

  it('blendet BEIDE Shred-Sektionen aus, sobald der Endkunde bereits geschreddert ist', () => {
    useEndkundeDetailViewMock.mockReturnValue({ ...BASE_DETAIL_VIEW, istGeschreddert: true });
    useEndkundeShredAntragOffenViewMock.mockReturnValue(BASE_SHRED_ANTRAG_VIEW);
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    render(
      <MemoryRouter>
        <EndkundeDetailAnsicht endkundeId={ENDKUNDE_ID} />
      </MemoryRouter>,
    );

    expect(screen.queryByText('Beantragen-Aktion (Stub)')).not.toBeInTheDocument();
    expect(screen.queryByText('Offener-Antrag-Sektion (Stub)')).not.toBeInTheDocument();
  });

  it('zeigt den Consent-Stand der Person', () => {
    // Ohne diese Zusicherung wuerde der Stub oben nur verdecken, dass der
    // Abschnitt gar nicht eingehaengt ist.
    useEndkundeDetailViewMock.mockReturnValue(BASE_DETAIL_VIEW);

    render(
      <MemoryRouter>
        <EndkundeDetailAnsicht endkundeId={ENDKUNDE_ID} />
      </MemoryRouter>,
    );

    oeffneReiter('Einwilligungen');

    expect(screen.getByText('Einwilligungen (Stub)')).toBeInTheDocument();
  });
});
