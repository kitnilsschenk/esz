import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { ZaehlerAendernFormular } from './ZaehlerAendernFormular';

const { useZaehlerAendernViewMock } = vi.hoisted(() => ({
  useZaehlerAendernViewMock: vi.fn(),
}));

vi.mock('../../hooks/zaehler', () => ({ useZaehlerAendernView: useZaehlerAendernViewMock }));

const ZAEHLER_ID = '0198c3aa-aaaa-7000-8000-000000000001';

describe('ZaehlerAendernFormular', () => {
  afterEach(() => {
    useZaehlerAendernViewMock.mockReset();
  });

  it('rendert nichts, solange die Vorbefüllwerte noch nicht geladen sind', () => {
    useZaehlerAendernViewMock.mockReturnValue({
      isReady: false,
      defaultValues: { geraetetyp: '' },
      isSubmitting: false,
      submitErrorMessage: undefined,
      submit: vi.fn(),
    });

    const { container } = render(<ZaehlerAendernFormular zaehlerId={ZAEHLER_ID} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('ruft submit mit dem bearbeiteten Gerätetyp auf', () => {
    const submit = vi.fn();
    useZaehlerAendernViewMock.mockReturnValue({
      isReady: true,
      defaultValues: { geraetetyp: 'Wärmemengenzähler' },
      isSubmitting: false,
      submitErrorMessage: undefined,
      submit,
    });

    render(<ZaehlerAendernFormular zaehlerId={ZAEHLER_ID} />);

    fireEvent.change(screen.getByLabelText('Gerätetyp'), { target: { value: 'Ultraschall-Wärmemengenzähler' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(submit).toHaveBeenCalledWith({ geraetetyp: 'Ultraschall-Wärmemengenzähler' });
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useZaehlerAendernViewMock.mockReturnValue({
      isReady: true,
      defaultValues: { geraetetyp: 'Wärmemengenzähler' },
      isSubmitting: false,
      submitErrorMessage: undefined,
      submit: vi.fn(),
    });

    const { container } = render(<ZaehlerAendernFormular zaehlerId={ZAEHLER_ID} />);

    expect(await runAxe(container)).toEqual([]);
  });
});
