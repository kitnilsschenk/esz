import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { einflussgroesseErfassenFormDefaultValues, einflussgroesseErfassenFormSchema } from '../../api/einflussgroesse';
import { EinflussgroesseErfassenFormular } from './EinflussgroesseErfassenFormular';

const { useEinflussgroesseErfassenViewMock } = vi.hoisted(() => ({ useEinflussgroesseErfassenViewMock: vi.fn() }));

vi.mock('../../hooks/einflussgroesse', () => ({ useEinflussgroesseErfassenView: useEinflussgroesseErfassenViewMock }));

const SYSTEM_ID = '0198c3aa-aaaa-7000-8000-000000000001';

const GROESSE_CODE_OPTIONEN = [
  { value: 'personenanzahl', label: 'Personenanzahl' },
  { value: 'nutzungszweck', label: 'Nutzungszweck' },
];
const BETROFFENER_TYP_OPTIONEN = [
  { value: 'endkunde', label: 'Endkunde' },
  { value: 'anschlussnutzer', label: 'Anschlussnutzer' },
];
const QUELLE_TYP_OPTIONEN = [{ value: 'betriebsteam', label: 'Betriebs-Team' }];
const RECHTSGRUNDLAGE_OPTIONEN = [
  { value: 'art6_1b', label: 'Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung)' },
  { value: 'art6_1f', label: 'Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse)' },
];
const ANLASS_CODE_OPTIONEN = [{ value: 'ersterfassung', label: 'Ersterfassung' }];

function baseView(overrides: Record<string, unknown> = {}) {
  return {
    schema: einflussgroesseErfassenFormSchema,
    defaultValues: einflussgroesseErfassenFormDefaultValues,
    isSubmitting: false,
    submitErrorMessage: undefined,
    submit: vi.fn(),
    groesseCodeOptionen: GROESSE_CODE_OPTIONEN,
    betroffenerTypOptionen: BETROFFENER_TYP_OPTIONEN,
    quelleTypOptionen: QUELLE_TYP_OPTIONEN,
    rechtsgrundlageOptionen: RECHTSGRUNDLAGE_OPTIONEN,
    anlassCodeOptionen: ANLASS_CODE_OPTIONEN,
    ...overrides,
  };
}

describe('EinflussgroesseErfassenFormular', () => {
  afterEach(() => {
    useEinflussgroesseErfassenViewMock.mockReset();
  });

  it('zeigt Feldfehler bei leerem Formular und ruft submit NICHT auf', () => {
    const submit = vi.fn();
    useEinflussgroesseErfassenViewMock.mockReturnValue(baseView({ submit }));

    render(<EinflussgroesseErfassenFormular systemId={SYSTEM_ID} />);

    fireEvent.click(screen.getByRole('button', { name: 'Erfassen' }));

    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByText('Größe ist erforderlich.')).toBeInTheDocument();
    expect(screen.getByText('Gültig ab ist erforderlich.')).toBeInTheDocument();
    expect(screen.getByText('Betroffene Person ist erforderlich.')).toBeInTheDocument();
  });

  it('lehnt eine numerische Größe ohne wertNum ab (wert_art-XOR)', () => {
    const submit = vi.fn();
    useEinflussgroesseErfassenViewMock.mockReturnValue(baseView({ submit }));

    render(<EinflussgroesseErfassenFormular systemId={SYSTEM_ID} />);

    fireEvent.change(screen.getByLabelText('Größe'), { target: { value: 'personenanzahl' } });
    fireEvent.change(screen.getByLabelText('Gültig ab'), { target: { value: '2026-01-15' } });
    fireEvent.change(screen.getByLabelText('Betroffene Person'), { target: { value: 'endkunde' } });
    fireEvent.change(screen.getByLabelText('Quelle'), { target: { value: 'betriebsteam' } });
    fireEvent.change(screen.getByLabelText('Rechtsgrundlage'), { target: { value: 'art6_1b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Erfassen' }));

    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByText('Wert (numerisch) ist bei dieser Größe erforderlich.')).toBeInTheDocument();
  });

  it('erfordert bei Anschlussnutzer als betroffener Person Art.-14-Angaben (Art. 14 DSGVO)', () => {
    const submit = vi.fn();
    useEinflussgroesseErfassenViewMock.mockReturnValue(baseView({ submit }));

    render(<EinflussgroesseErfassenFormular systemId={SYSTEM_ID} />);

    fireEvent.change(screen.getByLabelText('Größe'), { target: { value: 'personenanzahl' } });
    fireEvent.change(screen.getByLabelText('Wert (numerisch)'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Gültig ab'), { target: { value: '2026-01-15' } });
    fireEvent.change(screen.getByLabelText('Betroffene Person'), { target: { value: 'anschlussnutzer' } });
    fireEvent.change(screen.getByLabelText('Quelle'), { target: { value: 'betriebsteam' } });
    fireEvent.change(screen.getByLabelText('Rechtsgrundlage'), { target: { value: 'art6_1b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Erfassen' }));

    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByText('Bei Anschlussnutzer als betroffener Person muss die Rechtsgrundlage Art. 6 Abs. 1 lit. f sein.')).toBeInTheDocument();
    expect(screen.getByText('Interessenabwägung (Referenz) ist bei Anschlussnutzer als betroffener Person erforderlich.')).toBeInTheDocument();
    expect(screen.getByText('Art.-14-Information ist bei Anschlussnutzer als betroffener Person erforderlich.')).toBeInTheDocument();
  });

  it('ruft submit mit den validierten Werten auf, sobald Pflichtfelder korrekt ausgefüllt sind', () => {
    const submit = vi.fn();
    useEinflussgroesseErfassenViewMock.mockReturnValue(baseView({ submit }));

    render(<EinflussgroesseErfassenFormular systemId={SYSTEM_ID} />);

    fireEvent.change(screen.getByLabelText('Größe'), { target: { value: 'personenanzahl' } });
    fireEvent.change(screen.getByLabelText('Wert (numerisch)'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Gültig ab'), { target: { value: '2026-01-15' } });
    fireEvent.change(screen.getByLabelText('Betroffene Person'), { target: { value: 'endkunde' } });
    fireEvent.change(screen.getByLabelText('Quelle'), { target: { value: 'betriebsteam' } });
    fireEvent.change(screen.getByLabelText('Rechtsgrundlage'), { target: { value: 'art6_1b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Erfassen' }));

    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ groesseCode: 'personenanzahl', wertNum: '3', gueltigAbMonat: '2026-01-15', betroffenerTyp: 'endkunde' }),
    );
  });

  it('zeigt eine Server-Fehlermeldung, wenn die Mutation fehlschlägt', () => {
    useEinflussgroesseErfassenViewMock.mockReturnValue(
      baseView({ submitErrorMessage: 'Einflussgröße konnte nicht erfasst werden.', submit: vi.fn() }),
    );

    render(<EinflussgroesseErfassenFormular systemId={SYSTEM_ID} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Einflussgröße konnte nicht erfasst werden.');
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useEinflussgroesseErfassenViewMock.mockReturnValue(baseView());

    const { container } = render(<EinflussgroesseErfassenFormular systemId={SYSTEM_ID} />);

    expect(await runAxe(container)).toEqual([]);
  });
});
