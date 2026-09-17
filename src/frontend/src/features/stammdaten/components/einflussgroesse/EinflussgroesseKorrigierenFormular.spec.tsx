import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { einflussgroesseKorrigierenFormDefaultValues, einflussgroesseKorrigierenFormSchema } from '../../api/einflussgroesse';
import { EinflussgroesseKorrigierenFormular } from './EinflussgroesseKorrigierenFormular';

const { useEinflussgroesseKorrigierenViewMock } = vi.hoisted(() => ({ useEinflussgroesseKorrigierenViewMock: vi.fn() }));

vi.mock('../../hooks/einflussgroesse', () => ({ useEinflussgroesseKorrigierenView: useEinflussgroesseKorrigierenViewMock }));

const EINFLUSSGROESSE_ID = '0198c3aa-aaaa-7000-8000-000000000001';
const SYSTEM_ID = '0198c3aa-bbbb-7000-8000-000000000002';

const BETROFFENER_TYP_OPTIONEN = [
  { value: 'endkunde', label: 'Endkunde' },
  { value: 'anschlussnutzer', label: 'Anschlussnutzer' },
];
const QUELLE_TYP_OPTIONEN = [{ value: 'betriebsteam', label: 'Betriebs-Team' }];
const RECHTSGRUNDLAGE_OPTIONEN = [
  { value: 'art6_1b', label: 'Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung)' },
  { value: 'art6_1f', label: 'Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse)' },
];

function baseView(wertArt: 'numerisch' | 'codiert' | undefined, overrides: Record<string, unknown> = {}) {
  return {
    schema: einflussgroesseKorrigierenFormSchema(wertArt),
    defaultValues: einflussgroesseKorrigierenFormDefaultValues,
    isSubmitting: false,
    submitErrorMessage: undefined,
    submit: vi.fn(),
    betroffenerTypOptionen: BETROFFENER_TYP_OPTIONEN,
    quelleTypOptionen: QUELLE_TYP_OPTIONEN,
    rechtsgrundlageOptionen: RECHTSGRUNDLAGE_OPTIONEN,
    ...overrides,
  };
}

describe('EinflussgroesseKorrigierenFormular', () => {
  afterEach(() => {
    useEinflussgroesseKorrigierenViewMock.mockReset();
  });

  it('zeigt einen Feldfehler bei fehlendem Schließ-Datum und ruft submit NICHT auf', () => {
    const submit = vi.fn();
    useEinflussgroesseKorrigierenViewMock.mockReturnValue(baseView(undefined, { submit }));

    render(<EinflussgroesseKorrigierenFormular einflussgroesseId={EINFLUSSGROESSE_ID} systemId={SYSTEM_ID} wertArt={undefined} />);

    fireEvent.click(screen.getByRole('button', { name: 'Korrigieren' }));

    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByText('Gültig bis ist erforderlich.')).toBeInTheDocument();
  });

  it('schließt NUR das Intervall, wenn keine Korrektur-Zeile angefordert wird', () => {
    const submit = vi.fn();
    useEinflussgroesseKorrigierenViewMock.mockReturnValue(baseView(undefined, { submit }));

    render(<EinflussgroesseKorrigierenFormular einflussgroesseId={EINFLUSSGROESSE_ID} systemId={SYSTEM_ID} wertArt={undefined} />);

    fireEvent.change(screen.getByLabelText('Gültig bis (schließt dieses Intervall)'), { target: { value: '2026-06-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Korrigieren' }));

    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ gueltigBisMonat: '2026-06-01', korrekturGueltigAbMonat: '' }));
  });

  it('erfordert bei angeforderter Korrektur-Zeile die Pflichtfelder Betroffene Person/Quelle/Rechtsgrundlage', () => {
    const submit = vi.fn();
    useEinflussgroesseKorrigierenViewMock.mockReturnValue(baseView(undefined, { submit }));

    render(<EinflussgroesseKorrigierenFormular einflussgroesseId={EINFLUSSGROESSE_ID} systemId={SYSTEM_ID} wertArt={undefined} />);

    fireEvent.change(screen.getByLabelText('Gültig bis (schließt dieses Intervall)'), { target: { value: '2026-06-01' } });
    fireEvent.change(screen.getByLabelText('Korrektur: Gültig ab (nur bei neuer Korrektur-Zeile)'), { target: { value: '2026-06-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Korrigieren' }));

    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByText('Korrektur: Betroffene Person ist erforderlich.')).toBeInTheDocument();
    expect(screen.getByText('Korrektur: Quelle ist erforderlich.')).toBeInTheDocument();
    expect(screen.getByText('Korrektur: Rechtsgrundlage ist erforderlich.')).toBeInTheDocument();
  });

  it('erfordert bei bekannter numerischer wert_art einen Korrektur-Wert (numerisch)', () => {
    const submit = vi.fn();
    useEinflussgroesseKorrigierenViewMock.mockReturnValue(baseView('numerisch', { submit }));

    render(<EinflussgroesseKorrigierenFormular einflussgroesseId={EINFLUSSGROESSE_ID} systemId={SYSTEM_ID} wertArt="numerisch" />);

    fireEvent.change(screen.getByLabelText('Gültig bis (schließt dieses Intervall)'), { target: { value: '2026-06-01' } });
    fireEvent.change(screen.getByLabelText('Korrektur: Gültig ab (nur bei neuer Korrektur-Zeile)'), { target: { value: '2026-06-01' } });
    fireEvent.change(screen.getByLabelText('Korrektur: Betroffene Person'), { target: { value: 'endkunde' } });
    fireEvent.change(screen.getByLabelText('Korrektur: Quelle'), { target: { value: 'betriebsteam' } });
    fireEvent.change(screen.getByLabelText('Korrektur: Rechtsgrundlage'), { target: { value: 'art6_1b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Korrigieren' }));

    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByText('Korrektur: Wert (numerisch) ist bei dieser Größe erforderlich.')).toBeInTheDocument();
  });

  it('ruft submit mit vollständiger Korrektur-Zeile auf', () => {
    const submit = vi.fn();
    useEinflussgroesseKorrigierenViewMock.mockReturnValue(baseView('numerisch', { submit }));

    render(<EinflussgroesseKorrigierenFormular einflussgroesseId={EINFLUSSGROESSE_ID} systemId={SYSTEM_ID} wertArt="numerisch" />);

    fireEvent.change(screen.getByLabelText('Gültig bis (schließt dieses Intervall)'), { target: { value: '2026-06-01' } });
    fireEvent.change(screen.getByLabelText('Korrektur: Gültig ab (nur bei neuer Korrektur-Zeile)'), { target: { value: '2026-06-01' } });
    fireEvent.change(screen.getByLabelText('Korrektur: Wert (numerisch)'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Korrektur: Betroffene Person'), { target: { value: 'endkunde' } });
    fireEvent.change(screen.getByLabelText('Korrektur: Quelle'), { target: { value: 'betriebsteam' } });
    fireEvent.change(screen.getByLabelText('Korrektur: Rechtsgrundlage'), { target: { value: 'art6_1b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Korrigieren' }));

    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ gueltigBisMonat: '2026-06-01', korrekturGueltigAbMonat: '2026-06-01', korrekturWertNum: '5' }),
    );
  });

  it('zeigt eine Server-Fehlermeldung, wenn die Mutation fehlschlägt', () => {
    useEinflussgroesseKorrigierenViewMock.mockReturnValue(
      baseView(undefined, { submitErrorMessage: 'Intervall ist bereits geschlossen.', submit: vi.fn() }),
    );

    render(<EinflussgroesseKorrigierenFormular einflussgroesseId={EINFLUSSGROESSE_ID} systemId={SYSTEM_ID} wertArt={undefined} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Intervall ist bereits geschlossen.');
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useEinflussgroesseKorrigierenViewMock.mockReturnValue(baseView(undefined));

    const { container } = render(
      <EinflussgroesseKorrigierenFormular einflussgroesseId={EINFLUSSGROESSE_ID} systemId={SYSTEM_ID} wertArt={undefined} />,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
