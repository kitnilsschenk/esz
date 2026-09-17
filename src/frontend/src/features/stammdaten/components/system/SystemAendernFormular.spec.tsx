import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { SystemAendernFormular } from './SystemAendernFormular';

const { useSystemAendernViewMock } = vi.hoisted(() => ({
  useSystemAendernViewMock: vi.fn(),
}));

vi.mock('../../hooks/system', () => ({ useSystemAendernView: useSystemAendernViewMock }));

const SYSTEM_ID = '0198c3aa-aaaa-7000-8000-000000000001';

describe('SystemAendernFormular', () => {
  afterEach(() => {
    useSystemAendernViewMock.mockReset();
  });

  it('rendert nichts, solange die Vorbefüllwerte noch nicht geladen sind', () => {
    useSystemAendernViewMock.mockReturnValue({
      isReady: false,
      defaultValues: { bezeichnung: '', systemgrenze: '', systembeschreibung: '', standortId: '' },
      isSubmitting: false,
      submitErrorMessage: undefined,
      submit: vi.fn(),
    });

    const { container } = render(<SystemAendernFormular systemId={SYSTEM_ID} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('ruft submit mit den vorbefüllten und bearbeiteten Werten auf', () => {
    const submit = vi.fn();
    useSystemAendernViewMock.mockReturnValue({
      isReady: true,
      standortOptionen: [],
      defaultValues: {
        bezeichnung: 'Bürogebäude Hauptstraße',
        systemgrenze: 'Gesamtes Gebäude',
        systembeschreibung: '',
        standortId: '',
      },
      isSubmitting: false,
      submitErrorMessage: undefined,
      submit,
    });

    render(<SystemAendernFormular systemId={SYSTEM_ID} />);

    fireEvent.change(screen.getByLabelText('Bezeichnung'), { target: { value: 'Bürogebäude Nebenstraße' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(submit).toHaveBeenCalledWith({
      bezeichnung: 'Bürogebäude Nebenstraße',
      systemgrenze: 'Gesamtes Gebäude',
      systembeschreibung: '',
      standortId: '',
    });
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useSystemAendernViewMock.mockReturnValue({
      isReady: true,
      standortOptionen: [],
      defaultValues: { bezeichnung: 'Bürogebäude Hauptstraße', systemgrenze: 'Gesamtes Gebäude', systembeschreibung: '', standortId: '' },
      isSubmitting: false,
      submitErrorMessage: undefined,
      submit: vi.fn(),
    });

    const { container } = render(<SystemAendernFormular systemId={SYSTEM_ID} />);

    expect(await runAxe(container)).toEqual([]);
  });
});
