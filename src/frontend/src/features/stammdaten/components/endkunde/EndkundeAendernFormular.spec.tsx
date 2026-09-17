import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { EndkundeAendernFormular } from './EndkundeAendernFormular';

const { useEndkundeAendernViewMock } = vi.hoisted(() => ({
  useEndkundeAendernViewMock: vi.fn(),
}));

vi.mock('../../hooks/endkunde', () => ({ useEndkundeAendernView: useEndkundeAendernViewMock }));

const ENDKUNDE_ID = '0198c3aa-aaaa-7000-8000-000000000001';

describe('EndkundeAendernFormular', () => {
  afterEach(() => {
    useEndkundeAendernViewMock.mockReset();
  });

  it('rendert nichts außer einem Lade-Hinweis, solange die Vorbefüllwerte noch nicht geladen sind', () => {
    useEndkundeAendernViewMock.mockReturnValue({
      isReady: false,
      piiMaskiert: false,
      defaultValues: { name: '', anschrift: '', kontakt: '', endkundengruppe: '' },
      isSubmitting: false,
      submitErrorMessage: undefined,
      submit: vi.fn(),
    });

    render(<EndkundeAendernFormular endkundeId={ENDKUNDE_ID} />);

    expect(screen.getByRole('status')).toHaveTextContent('Daten werden geladen …');
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('befüllt die Felder mit den Klartext-PII-Werten, wenn diese nicht maskiert sind, und ruft submit mit den bearbeiteten Werten auf', () => {
    const submit = vi.fn();
    useEndkundeAendernViewMock.mockReturnValue({
      isReady: true,
      piiMaskiert: false,
      defaultValues: { name: 'Max Mustermann', anschrift: 'Musterstraße 1', kontakt: '', endkundengruppe: '' },
      isSubmitting: false,
      submitErrorMessage: undefined,
      submit,
    });

    render(<EndkundeAendernFormular endkundeId={ENDKUNDE_ID} />);

    expect(screen.queryByText('Die personenbezogenen Daten sind für diesen Datensatz aktuell maskiert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Max Mustermann');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Erika Musterfrau' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(submit).toHaveBeenCalledWith({
      name: 'Erika Musterfrau',
      anschrift: 'Musterstraße 1',
      kontakt: '',
      endkundengruppe: '',
    });
  });

  it('lässt die PII-Felder LEER und zeigt einen Hinweis, wenn `stammdatenPii` serverseitig maskiert war (kein stilles Überschreiben)', () => {
    useEndkundeAendernViewMock.mockReturnValue({
      isReady: true,
      piiMaskiert: true,
      defaultValues: { name: '', anschrift: '', kontakt: '', endkundengruppe: '' },
      isSubmitting: false,
      submitErrorMessage: undefined,
      submit: vi.fn(),
    });

    render(<EndkundeAendernFormular endkundeId={ENDKUNDE_ID} />);

    expect(screen.getByLabelText('Name')).toHaveValue('');
    expect(
      screen.getByText(
        'Die personenbezogenen Daten sind für diesen Datensatz aktuell maskiert (z. B. gesperrt oder bereits gelöscht). Bitte Name, Anschrift und ggf. Kontakt bei Bedarf vollständig neu eingeben — leer gelassene Felder werden beim Speichern übernommen (Kontakt gilt dann als „keine Angabe").',
      ),
    ).toBeInTheDocument();
  });

  it('erzwingt weiterhin Pflichtfelder (Name/Anschrift) über die Zod-Validierung, auch im maskierten Zustand', () => {
    const submit = vi.fn();
    useEndkundeAendernViewMock.mockReturnValue({
      isReady: true,
      piiMaskiert: true,
      defaultValues: { name: '', anschrift: '', kontakt: '', endkundengruppe: '' },
      isSubmitting: false,
      submitErrorMessage: undefined,
      submit,
    });

    render(<EndkundeAendernFormular endkundeId={ENDKUNDE_ID} />);

    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByText('Name ist erforderlich.')).toBeInTheDocument();
  });

  it('zeigt eine Server-Fehlermeldung, wenn die Mutation fehlschlägt', () => {
    useEndkundeAendernViewMock.mockReturnValue({
      isReady: true,
      piiMaskiert: false,
      defaultValues: { name: 'Max Mustermann', anschrift: 'Musterstraße 1', kontakt: '', endkundengruppe: '' },
      isSubmitting: false,
      submitErrorMessage: 'Endkunde konnte nicht geändert werden.',
      submit: vi.fn(),
    });

    render(<EndkundeAendernFormular endkundeId={ENDKUNDE_ID} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Endkunde konnte nicht geändert werden.');
  });

  it('hat keine erkennbaren axe-Verstöße (inkl. Maskierungs-Hinweis)', async () => {
    useEndkundeAendernViewMock.mockReturnValue({
      isReady: true,
      piiMaskiert: true,
      defaultValues: { name: '', anschrift: '', kontakt: '', endkundengruppe: '' },
      isSubmitting: false,
      submitErrorMessage: undefined,
      submit: vi.fn(),
    });

    const { container } = render(<EndkundeAendernFormular endkundeId={ENDKUNDE_ID} />);

    expect(await runAxe(container)).toEqual([]);
  });
});
