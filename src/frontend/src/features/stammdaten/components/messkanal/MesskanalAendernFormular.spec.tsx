import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { MesskanalAendernFormular } from './MesskanalAendernFormular';

const { useMesskanalAendernViewMock } = vi.hoisted(() => ({
  useMesskanalAendernViewMock: vi.fn(),
}));

vi.mock('../../hooks/messkanal', () => ({ useMesskanalAendernView: useMesskanalAendernViewMock }));

const MESSKANAL_ID = '0198c3aa-aaaa-7000-8000-000000000001';

describe('MesskanalAendernFormular', () => {
  afterEach(() => {
    useMesskanalAendernViewMock.mockReset();
  });

  it('rendert nichts, solange die Vorbefüllwerte noch nicht geladen sind', () => {
    useMesskanalAendernViewMock.mockReturnValue({
      isReady: false,
      defaultValues: { einheit: '', obisKennzahl: '', istUntermessung: false, richtung: 'bezug' },
      richtungOptionen: [{ value: 'bezug', label: 'Bezug (Verbrauch)' }],
      isSubmitting: false,
      submitErrorMessage: undefined,
      submit: vi.fn(),
    });

    const { container } = render(<MesskanalAendernFormular messkanalId={MESSKANAL_ID} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('ruft submit mit der bearbeiteten Einheit auf', () => {
    const submit = vi.fn();
    useMesskanalAendernViewMock.mockReturnValue({
      isReady: true,
      defaultValues: { einheit: 'kWh', obisKennzahl: '1-0:1.8.0', istUntermessung: false, richtung: 'bezug' },
      richtungOptionen: [{ value: 'bezug', label: 'Bezug (Verbrauch)' }],
      isSubmitting: false,
      submitErrorMessage: undefined,
      submit,
    });

    render(<MesskanalAendernFormular messkanalId={MESSKANAL_ID} />);

    fireEvent.change(screen.getByLabelText('Einheit'), { target: { value: 'MWh' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(submit).toHaveBeenCalledWith({ einheit: 'MWh', obisKennzahl: '1-0:1.8.0', istUntermessung: false, richtung: 'bezug' });
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useMesskanalAendernViewMock.mockReturnValue({
      isReady: true,
      defaultValues: { einheit: 'kWh', obisKennzahl: '1-0:1.8.0', istUntermessung: false, richtung: 'bezug' },
      richtungOptionen: [{ value: 'bezug', label: 'Bezug (Verbrauch)' }],
      isSubmitting: false,
      submitErrorMessage: undefined,
      submit: vi.fn(),
    });

    const { container } = render(<MesskanalAendernFormular messkanalId={MESSKANAL_ID} />);

    expect(await runAxe(container)).toEqual([]);
  });
});
