import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { EndkundeShredAntragOffen } from './EndkundeShredAntragOffen';

const { useEndkundeShredAntragOffenViewMock, useKannStammdatenAnlegenMock } = vi.hoisted(() => ({
  useEndkundeShredAntragOffenViewMock: vi.fn(),
  useKannStammdatenAnlegenMock: vi.fn(),
}));

vi.mock('../../hooks/endkunde', () => ({ useEndkundeShredAntragOffenView: useEndkundeShredAntragOffenViewMock }));
vi.mock('../../hooks/shared/useKannStammdatenAnlegen', () => ({ useKannStammdatenAnlegen: useKannStammdatenAnlegenMock }));

const ENDKUNDE_ID = '0198c3aa-aaaa-7000-8000-000000000001';

const BASE_ANTRAG = {
  id: '0198c3aa-bbbb-7000-8000-000000000002',
  endkundeId: ENDKUNDE_ID,
  status: 'beantragt' as const,
  grund: 'betroffenenantrag_art17' as const,
  beantragtVonSub: 'kc-sub-antragsteller-0001',
  beantragtAm: '2026-07-01T10:00:00.000Z',
  gueltigBis: '2026-07-08T10:00:00.000Z',
  createdAt: '2026-07-01T10:00:00.000Z',
  updatedAt: '2026-07-01T10:00:00.000Z',
};

const BASE_VIEW = {
  isPending: false,
  isError: false,
  antrag: BASE_ANTRAG,
  antragstellerKurz: 'kc-sub-a',
  grundLabel: 'Antrag der betroffenen Person (Art. 17)',
  beantragtAm: BASE_ANTRAG.beantragtAm,
  gueltigBis: BASE_ANTRAG.gueltigBis,
  istEigenerAntrag: false,
  selbstFreigabeHinweis: undefined,
  isFreigebenSubmitting: false,
  freigebenErrorMessage: undefined,
  freigeben: vi.fn(),
  isAblehnenSubmitting: false,
  ablehnenErrorMessage: undefined,
  ablehnen: vi.fn(),
};

describe('EndkundeShredAntragOffen', () => {
  afterEach(() => {
    useEndkundeShredAntragOffenViewMock.mockReset();
    useKannStammdatenAnlegenMock.mockReset();
  });

  it('rendert nichts, solange kein offener Antrag existiert', () => {
    useEndkundeShredAntragOffenViewMock.mockReturnValue({ ...BASE_VIEW, antrag: undefined });
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    const { container } = render(<EndkundeShredAntragOffen endkundeId={ENDKUNDE_ID} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('zeigt Antragsteller, Löschgrund, Beantragt-am und Gültig-bis des offenen Antrags', () => {
    useEndkundeShredAntragOffenViewMock.mockReturnValue(BASE_VIEW);
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    render(<EndkundeShredAntragOffen endkundeId={ENDKUNDE_ID} />);

    expect(screen.getByText('Offener Shred-Antrag')).toBeInTheDocument();
    expect(screen.getByText('kc-sub-a')).toBeInTheDocument();
    expect(screen.getByText('Antrag der betroffenen Person (Art. 17)')).toBeInTheDocument();
    // Erwartet die DEUTSCHE Darstellung (`shared/format/datum.ts`,
    // Europe/Berlin), nicht den UTC-ISO-Rohwert: 10:00 UTC am 01.07. ist in
    // Berliner Sommerzeit 12:00. Vorher prüfte dieser Test genau den Defekt —
    // dass der rohe `2026-07-01T10:00:00.000Z` in der Oberfläche steht.
    expect(screen.getByText('01.07.2026, 12:00')).toBeInTheDocument();
    expect(screen.getByText('08.07.2026, 12:00')).toBeInTheDocument();
  });

  it('öffnet den Freigeben-Dialog mit Type-to-confirm „SCHREDDERN" und ruft `freigeben` erst nach exakter Eingabe auf', () => {
    const freigeben = vi.fn();
    useEndkundeShredAntragOffenViewMock.mockReturnValue({ ...BASE_VIEW, freigeben });
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    render(<EndkundeShredAntragOffen endkundeId={ENDKUNDE_ID} />);

    fireEvent.click(screen.getByRole('button', { name: 'Freigeben' }));
    const dialog = screen.getByRole('dialog', { name: 'Shred-Antrag freigeben — Endkunde endgültig krypto-schreddern' });
    const bestaetigenButton = within(dialog).getByRole('button', { name: 'Endgültig schreddern' });

    expect(bestaetigenButton).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText('Zur Bestätigung „SCHREDDERN" eingeben'), {
      target: { value: 'SCHREDDERN' },
    });
    expect(bestaetigenButton).not.toBeDisabled();

    fireEvent.click(bestaetigenButton);
    expect(freigeben).toHaveBeenCalledTimes(1);
  });

  it('öffnet den Ablehnen-Dialog, übergibt den gewählten Ablehnungsgrund an `ablehnen`', () => {
    const ablehnen = vi.fn();
    useEndkundeShredAntragOffenViewMock.mockReturnValue({ ...BASE_VIEW, ablehnen });
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    render(<EndkundeShredAntragOffen endkundeId={ENDKUNDE_ID} />);

    fireEvent.click(screen.getByRole('button', { name: 'Ablehnen' }));
    const dialog = screen.getByRole('dialog', { name: 'Shred-Antrag ablehnen' });

    fireEvent.change(within(dialog).getByLabelText('Ablehnungsgrund'), { target: { value: 'endkunde_widerspruch' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ablehnen' }));

    expect(ablehnen).toHaveBeenCalledWith('endkunde_widerspruch');
  });

  it('blendet Freigeben/Ablehnen aus und zeigt stattdessen den Selbst-Freigabe-Hinweis, wenn der eigene Antrag betroffen ist', () => {
    useEndkundeShredAntragOffenViewMock.mockReturnValue({
      ...BASE_VIEW,
      istEigenerAntrag: true,
      selbstFreigabeHinweis: 'Sie haben diesen Antrag gestellt; die Freigabe muss durch eine zweite Person erfolgen.',
    });
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    render(<EndkundeShredAntragOffen endkundeId={ENDKUNDE_ID} />);

    expect(screen.queryByRole('button', { name: 'Freigeben' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ablehnen' })).not.toBeInTheDocument();
    expect(
      screen.getByText('Sie haben diesen Antrag gestellt; die Freigabe muss durch eine zweite Person erfolgen.'),
    ).toBeInTheDocument();
  });

  it('zeigt die Informationen, aber KEINE Aktionen für rein lesende Rollen (kein `betrieb`)', () => {
    useEndkundeShredAntragOffenViewMock.mockReturnValue(BASE_VIEW);
    useKannStammdatenAnlegenMock.mockReturnValue(false);

    render(<EndkundeShredAntragOffen endkundeId={ENDKUNDE_ID} />);

    expect(screen.getByText('Offener Shred-Antrag')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Freigeben' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ablehnen' })).not.toBeInTheDocument();
  });

  it('zeigt eine übersetzte Selbst-Freigabe-Fehlermeldung, wenn die Freigeben-Mutation mit 403 fehlschlägt', () => {
    useEndkundeShredAntragOffenViewMock.mockReturnValue({
      ...BASE_VIEW,
      freigebenErrorMessage: 'Sie können Ihren eigenen Antrag nicht freigeben — die Freigabe muss durch eine zweite Person erfolgen.',
    });
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    render(<EndkundeShredAntragOffen endkundeId={ENDKUNDE_ID} />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Sie können Ihren eigenen Antrag nicht freigeben — die Freigabe muss durch eine zweite Person erfolgen.',
    );
  });

  it('hat keine erkennbaren axe-Verstöße (Freigeben-Dialog offen)', async () => {
    useEndkundeShredAntragOffenViewMock.mockReturnValue(BASE_VIEW);
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    const { container } = render(<EndkundeShredAntragOffen endkundeId={ENDKUNDE_ID} />);
    fireEvent.click(screen.getByRole('button', { name: 'Freigeben' }));

    expect(await runAxe(container)).toEqual([]);
  });

  it('hat keine erkennbaren axe-Verstöße (Ablehnen-Dialog offen)', async () => {
    useEndkundeShredAntragOffenViewMock.mockReturnValue(BASE_VIEW);
    useKannStammdatenAnlegenMock.mockReturnValue(true);

    const { container } = render(<EndkundeShredAntragOffen endkundeId={ENDKUNDE_ID} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ablehnen' }));

    expect(await runAxe(container)).toEqual([]);
  });
});
