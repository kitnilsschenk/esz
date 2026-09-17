import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { messkanalLastgangFormDefaultValues, messkanalLastgangFormSchema } from '../../api/verbrauch';
import { MesskanalLastgangPanel } from './MesskanalLastgangPanel';

const { useMesskanalLastgangViewMock } = vi.hoisted(() => ({ useMesskanalLastgangViewMock: vi.fn() }));

vi.mock('../../hooks/verbrauch', () => ({ useMesskanalLastgangView: useMesskanalLastgangViewMock }));

const MESSKANAL_ID = '0198c3aa-aaaa-7000-8000-000000000001';
const ZAEHLER_ID = '0198c3aa-bbbb-7000-8000-000000000002';

const BASIS_VIEW = {
  schema: messkanalLastgangFormSchema,
  defaultValues: messkanalLastgangFormDefaultValues,
  isSubmitting: false,
  submitErrorMessage: undefined,
  submit: vi.fn(),
  hatErgebnis: false,
  zeilen: [],
  istLeer: false,
};

describe('MesskanalLastgangPanel', () => {
  afterEach(() => {
    useMesskanalLastgangViewMock.mockReset();
  });

  it('zeigt VOR dem ersten Submit das Zeitraum-Formular + Zweck-Hinweis, aber KEINE Werte-Tabelle', () => {
    useMesskanalLastgangViewMock.mockReturnValue(BASIS_VIEW);

    render(<MesskanalLastgangPanel messkanalId={MESSKANAL_ID} zaehlerId={ZAEHLER_ID} onSchliessen={vi.fn()} />);

    expect(screen.getByText(/zweckgebunden geschützt/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lastgang anzeigen' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('zeigt die Rohwerte-Tabelle nach erfolgreichem Ergebnis', () => {
    useMesskanalLastgangViewMock.mockReturnValue({
      ...BASIS_VIEW,
      hatErgebnis: true,
      zeilen: [{ ts: '2026-07-20T00:00:00.000Z', wert: 12, qualitaet: 'gemessen', herkunft: 'ingest_live' }],
    });

    render(<MesskanalLastgangPanel messkanalId={MESSKANAL_ID} zaehlerId={ZAEHLER_ID} onSchliessen={vi.fn()} />);

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('2026-07-20T00:00:00.000Z')).toBeInTheDocument();
  });

  it('zeigt die Leer-Meldung, wenn die Abfrage erfolgreich war, aber keine Werte im Zeitraum existieren', () => {
    useMesskanalLastgangViewMock.mockReturnValue({ ...BASIS_VIEW, hatErgebnis: true, istLeer: true });

    render(<MesskanalLastgangPanel messkanalId={MESSKANAL_ID} zaehlerId={ZAEHLER_ID} onSchliessen={vi.fn()} />);

    expect(screen.getByText('Im gewählten Zeitraum liegen keine Messwerte vor. Prüfen Sie den Zeitraum oder unter „Datenqualität & Störungen", ob Daten ausbleiben.')).toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useMesskanalLastgangViewMock.mockReturnValue(BASIS_VIEW);

    const { container } = render(<MesskanalLastgangPanel messkanalId={MESSKANAL_ID} zaehlerId={ZAEHLER_ID} onSchliessen={vi.fn()} />);

    expect(await runAxe(container)).toEqual([]);
  });
});
