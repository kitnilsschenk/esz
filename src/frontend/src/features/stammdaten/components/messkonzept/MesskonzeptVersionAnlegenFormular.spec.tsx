import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { MesskonzeptVersionAnlegenFormular } from './MesskonzeptVersionAnlegenFormular';

const { useMesskonzeptVersionAnlegenViewMock } = vi.hoisted(() => ({
  useMesskonzeptVersionAnlegenViewMock: vi.fn(),
}));

vi.mock('../../hooks/messkonzept', () => ({
  useMesskonzeptVersionAnlegenView: useMesskonzeptVersionAnlegenViewMock,
}));

const ENDKUNDE_ID = '0198c3aa-aaaa-7000-8000-000000000001';

const BASE_VIEW = {
  isSubmitting: false,
  submitErrorMessage: undefined,
  typOptionen: [{ value: 'standard', label: 'Standard' }],
  energietraegerOptionen: [
    { value: 'strom', label: 'Strom' },
    { value: 'waerme', label: 'Wärme' },
  ],
};

function fuelleTb01Pflichtfelder(): void {
  fireEvent.change(screen.getByLabelText('Typ'), { target: { value: 'standard' } });
  fireEvent.change(screen.getByLabelText('Systemgrenze'), { target: { value: 'Gebäude Hauptstraße 1' } });
  fireEvent.change(screen.getByLabelText('Systembeschreibung'), { target: { value: 'Bürogebäude, 3 Etagen' } });
  fireEvent.change(screen.getByLabelText('Bereinigungsverfahren'), { target: { value: 'Gradtagzahl-Verfahren' } });
  fireEvent.change(screen.getByLabelText('Messgerätewahl'), { target: { value: 'Funk-Wärmezähler' } });
  fireEvent.change(screen.getByLabelText('Geräteerkennungsverfahren'), { target: { value: 'NILM' } });
}

describe('MesskonzeptVersionAnlegenFormular', () => {
  afterEach(() => {
    useMesskonzeptVersionAnlegenViewMock.mockReset();
  });

  it('zeigt Feldfehler (inkl. Energieträger-Zeile) und ruft submit NICHT auf, wenn Pflichtfelder fehlen', () => {
    const submit = vi.fn();
    useMesskonzeptVersionAnlegenViewMock.mockReturnValue({ ...BASE_VIEW, submit });

    render(
      <MemoryRouter>
        <MesskonzeptVersionAnlegenFormular endkundeId={ENDKUNDE_ID} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Version anlegen' }));

    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByText('Typ ist erforderlich.')).toBeInTheDocument();
    expect(screen.getByText('Systemgrenze ist erforderlich.')).toBeInTheDocument();
    expect(screen.getByText('Energieträger ist erforderlich.')).toBeInTheDocument();
  });

  it('ruft submit mit den validierten Werten auf, wenn alle Pflichtfelder (inkl. mindestens ein Energieträger) ausgefüllt sind', () => {
    const submit = vi.fn();
    useMesskonzeptVersionAnlegenViewMock.mockReturnValue({ ...BASE_VIEW, submit });

    render(
      <MemoryRouter>
        <MesskonzeptVersionAnlegenFormular endkundeId={ENDKUNDE_ID} />
      </MemoryRouter>,
    );

    fuelleTb01Pflichtfelder();
    fireEvent.change(screen.getByLabelText('Energieträger'), { target: { value: 'strom' } });
    fireEvent.change(screen.getByLabelText('Baseline-Wert'), { target: { value: '1200' } });

    fireEvent.click(screen.getByRole('button', { name: 'Version anlegen' }));

    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        typ: 'standard',
        energietraeger: [expect.objectContaining({ energietraeger: 'strom', baselineWert: '1200' })],
      }),
    );
  });

  // ADR-0007 O-B3b — das Merkmal MUSS in jedem Payload stehen, auch wenn es
  // nicht gesetzt ist: `EnergietraegerBaseline` fuehrt es als Pflichtangabe,
  // und die Auslassung waere fachlich etwas anderes als ein ausdrueckliches
  // "kein Substitutionsfall".
  it('überträgt die Energieträger-Substitution als ausdrückliches false, wenn die Checkbox nicht gesetzt ist', () => {
    const submit = vi.fn();
    useMesskonzeptVersionAnlegenViewMock.mockReturnValue({ ...BASE_VIEW, submit });

    render(
      <MemoryRouter>
        <MesskonzeptVersionAnlegenFormular endkundeId={ENDKUNDE_ID} />
      </MemoryRouter>,
    );

    fuelleTb01Pflichtfelder();
    fireEvent.change(screen.getByLabelText('Energieträger'), { target: { value: 'strom' } });

    expect(screen.getByLabelText('Energieträger-Substitution liegt vor')).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Version anlegen' }));

    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        energietraeger: [expect.objectContaining({ energietraegerSubstitution: false })],
      }),
    );
  });

  it('überträgt die Energieträger-Substitution als true, wenn die Checkbox gesetzt ist', () => {
    const submit = vi.fn();
    useMesskonzeptVersionAnlegenViewMock.mockReturnValue({ ...BASE_VIEW, submit });

    render(
      <MemoryRouter>
        <MesskonzeptVersionAnlegenFormular endkundeId={ENDKUNDE_ID} />
      </MemoryRouter>,
    );

    fuelleTb01Pflichtfelder();
    fireEvent.change(screen.getByLabelText('Energieträger'), { target: { value: 'strom' } });
    fireEvent.click(screen.getByLabelText('Energieträger-Substitution liegt vor'));

    expect(screen.getByLabelText('Energieträger-Substitution liegt vor')).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Version anlegen' }));

    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        energietraeger: [expect.objectContaining({ energietraegerSubstitution: true })],
      }),
    );
  });

  // Das Merkmal wird PRO ZEILE gefuehrt (ein Endkunde kann Strom substituieren
  // und Waerme nicht) — ein zeilenuebergreifender State waere der naheliegende
  // Fehler, deshalb explizit abgesichert.
  it('führt die Energieträger-Substitution je Zeile getrennt', () => {
    const submit = vi.fn();
    useMesskonzeptVersionAnlegenViewMock.mockReturnValue({ ...BASE_VIEW, submit });

    render(
      <MemoryRouter>
        <MesskonzeptVersionAnlegenFormular endkundeId={ENDKUNDE_ID} />
      </MemoryRouter>,
    );

    fuelleTb01Pflichtfelder();
    fireEvent.click(screen.getByRole('button', { name: 'Energieträger hinzufügen' }));

    const traegerFelder = screen.getAllByLabelText('Energieträger');
    fireEvent.change(traegerFelder[0]!, { target: { value: 'strom' } });
    fireEvent.change(traegerFelder[1]!, { target: { value: 'waerme' } });

    const checkboxen = screen.getAllByLabelText('Energieträger-Substitution liegt vor');
    expect(checkboxen).toHaveLength(2);
    fireEvent.click(checkboxen[1]!);

    fireEvent.click(screen.getByRole('button', { name: 'Version anlegen' }));

    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        energietraeger: [
          expect.objectContaining({ energietraeger: 'strom', energietraegerSubstitution: false }),
          expect.objectContaining({ energietraeger: 'waerme', energietraegerSubstitution: true }),
        ],
      }),
    );
  });

  it('erlaubt das Hinzufügen und Entfernen weiterer Energieträger-Zeilen', () => {
    const submit = vi.fn();
    useMesskonzeptVersionAnlegenViewMock.mockReturnValue({ ...BASE_VIEW, submit });

    render(
      <MemoryRouter>
        <MesskonzeptVersionAnlegenFormular endkundeId={ENDKUNDE_ID} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Energieträger hinzufügen' }));
    expect(screen.getAllByLabelText('Energieträger')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Entfernen (2)' }));
    expect(screen.getAllByLabelText('Energieträger')).toHaveLength(1);

    // Die letzte verbleibende Zeile kann nicht entfernt werden (ArrayMinSize(1)).
    expect(screen.getByRole('button', { name: 'Entfernen (1)' })).toBeDisabled();
  });

  it('setzt beim Entfernen einer mittleren Zeile den Fokus auf den „Entfernen"-Button der vorherigen Zeile', () => {
    useMesskonzeptVersionAnlegenViewMock.mockReturnValue({ ...BASE_VIEW, submit: vi.fn() });

    render(
      <MemoryRouter>
        <MesskonzeptVersionAnlegenFormular endkundeId={ENDKUNDE_ID} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Energieträger hinzufügen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Energieträger hinzufügen' }));
    expect(screen.getAllByLabelText('Energieträger')).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Entfernen (2)' }));

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Entfernen (1)' }));
  });

  it('setzt beim Entfernen der vorletzten Zeile den Fokus auf den „Hinzufügen"-Button (die letzte Zeile hat einen deaktivierten Button)', () => {
    useMesskonzeptVersionAnlegenViewMock.mockReturnValue({ ...BASE_VIEW, submit: vi.fn() });

    render(
      <MemoryRouter>
        <MesskonzeptVersionAnlegenFormular endkundeId={ENDKUNDE_ID} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Energieträger hinzufügen' }));
    expect(screen.getAllByLabelText('Energieträger')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Entfernen (2)' }));

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Energieträger hinzufügen' }));
  });

  it('setzt den Fokus auf das erste fehlerhafte Feld (Typ) nach einem fehlgeschlagenen Submit', () => {
    useMesskonzeptVersionAnlegenViewMock.mockReturnValue({ ...BASE_VIEW, submit: vi.fn() });

    render(
      <MemoryRouter>
        <MesskonzeptVersionAnlegenFormular endkundeId={ENDKUNDE_ID} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Version anlegen' }));

    expect(document.activeElement).toBe(screen.getByLabelText('Typ'));
  });

  it('setzt den Fokus auf das erste fehlerhafte Energieträger-Zeilenfeld, wenn alle Skalarfelder gültig sind', () => {
    useMesskonzeptVersionAnlegenViewMock.mockReturnValue({ ...BASE_VIEW, submit: vi.fn() });

    render(
      <MemoryRouter>
        <MesskonzeptVersionAnlegenFormular endkundeId={ENDKUNDE_ID} />
      </MemoryRouter>,
    );

    fuelleTb01Pflichtfelder();
    fireEvent.click(screen.getByRole('button', { name: 'Version anlegen' }));

    expect(document.activeElement).toBe(screen.getByLabelText('Energieträger'));
  });

  it('zeigt eine Server-Fehlermeldung, wenn die Mutation fehlschlägt', () => {
    useMesskonzeptVersionAnlegenViewMock.mockReturnValue({
      ...BASE_VIEW,
      submitErrorMessage: 'Messkonzept-Version konnte nicht angelegt werden.',
      submit: vi.fn(),
    });

    render(
      <MemoryRouter>
        <MesskonzeptVersionAnlegenFormular endkundeId={ENDKUNDE_ID} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Messkonzept-Version konnte nicht angelegt werden.');
  });

  it('überträgt den externen Belegverweis (TB-02, V0065)', () => {
    // Die Abrechnungen bleiben ausserhalb des Systems; was hier erfasst wird,
    // ist der Verweis darauf — und die Anzahl, an der die Begruendungspflicht
    // haengt.
    const submit = vi.fn();
    useMesskonzeptVersionAnlegenViewMock.mockReturnValue({ ...BASE_VIEW, submit });

    render(
      <MemoryRouter>
        <MesskonzeptVersionAnlegenFormular endkundeId={ENDKUNDE_ID} />
      </MemoryRouter>,
    );

    fuelleTb01Pflichtfelder();
    fireEvent.change(screen.getByLabelText('Energieträger'), { target: { value: 'strom' } });
    fireEvent.change(screen.getByLabelText('Anzahl Jahresabrechnungen'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Aktenzeichen des Belegs'), { target: { value: 'AZ-2024-0815' } });
    fireEvent.change(screen.getByLabelText('Ablageort'), { target: { value: 'Ordner 3, Register 7' } });

    fireEvent.click(screen.getByRole('button', { name: 'Version anlegen' }));

    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        energietraeger: [
          expect.objectContaining({
            baselineAbrechnungenAnzahl: '3',
            baselineBelegAktenzeichen: 'AZ-2024-0815',
            baselineBelegAblageort: 'Ordner 3, Register 7',
          }),
        ],
      }),
    );
  });

  it('bietet KEIN UUID-Feld mehr an — es verwies auf eine Ablage, die es nicht gibt', () => {
    useMesskonzeptVersionAnlegenViewMock.mockReturnValue({ ...BASE_VIEW, submit: vi.fn() });

    render(
      <MemoryRouter>
        <MesskonzeptVersionAnlegenFormular endkundeId={ENDKUNDE_ID} />
      </MemoryRouter>,
    );

    expect(screen.queryByLabelText('Beleg-Referenz')).not.toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useMesskonzeptVersionAnlegenViewMock.mockReturnValue({ ...BASE_VIEW, submit: vi.fn() });

    const { container } = render(
      <MemoryRouter>
        <MesskonzeptVersionAnlegenFormular endkundeId={ENDKUNDE_ID} />
      </MemoryRouter>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
