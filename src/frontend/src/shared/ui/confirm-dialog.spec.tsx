import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { runAxe } from '../testing/axe';
import { ConfirmDialog } from './confirm-dialog';

describe('ConfirmDialog', () => {
  it('rendert den Dialog NICHT sichtbar, solange `offen=false` ist', () => {
    render(
      <ConfirmDialog
        titel="Aktion bestätigen"
        beschreibung="Wirklich fortfahren?"
        bestaetigenLabel="Bestätigen"
        abbrechenLabel="Abbrechen"
        offen={false}
        onSchliessen={vi.fn()}
        onBestaetigen={vi.fn()}
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('zeigt Titel und Beschreibung, sobald `offen=true` ist, und setzt den Fokus initial auf Abbrechen', async () => {
    render(
      <ConfirmDialog
        titel="System stilllegen"
        beschreibung="Das System wird stillgelegt."
        bestaetigenLabel="Stilllegen"
        abbrechenLabel="Abbrechen"
        variant="destructive"
        offen={true}
        onSchliessen={vi.fn()}
        onBestaetigen={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'System stilllegen' })).toBeInTheDocument();
    expect(screen.getByText('Das System wird stillgelegt.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Abbrechen' })).toHaveFocus());
  });

  it('ruft onBestaetigen auf, wenn kein `bestaetigungstext` gefordert ist', () => {
    const onBestaetigen = vi.fn();
    render(
      <ConfirmDialog
        titel="Endkunde sperren"
        beschreibung="Die Verarbeitung wird eingeschränkt (Art. 18)."
        bestaetigenLabel="Sperren"
        abbrechenLabel="Abbrechen"
        variant="destructive"
        offen={true}
        onSchliessen={vi.fn()}
        onBestaetigen={onBestaetigen}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sperren' }));
    expect(onBestaetigen).toHaveBeenCalledTimes(1);
  });

  it('ruft onSchliessen auf, wenn auf Abbrechen geklickt wird', () => {
    const onSchliessen = vi.fn();
    render(
      <ConfirmDialog
        titel="Endkunde sperren"
        beschreibung="Die Verarbeitung wird eingeschränkt (Art. 18)."
        bestaetigenLabel="Sperren"
        abbrechenLabel="Abbrechen"
        offen={true}
        onSchliessen={onSchliessen}
        onBestaetigen={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(onSchliessen).toHaveBeenCalledTimes(1);
  });

  it('ruft onSchliessen auf, wenn Escape gedrückt wird', () => {
    const onSchliessen = vi.fn();
    render(
      <ConfirmDialog
        titel="Endkunde sperren"
        beschreibung="Die Verarbeitung wird eingeschränkt (Art. 18)."
        bestaetigenLabel="Sperren"
        abbrechenLabel="Abbrechen"
        offen={true}
        onSchliessen={onSchliessen}
        onBestaetigen={vi.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onSchliessen).toHaveBeenCalledTimes(1);
  });

  it('ruft onSchliessen auf, wenn auf den Backdrop (das <dialog>-Element selbst) geklickt wird', () => {
    const onSchliessen = vi.fn();
    render(
      <ConfirmDialog
        titel="Endkunde sperren"
        beschreibung="Die Verarbeitung wird eingeschränkt (Art. 18)."
        bestaetigenLabel="Sperren"
        abbrechenLabel="Abbrechen"
        offen={true}
        onSchliessen={onSchliessen}
        onBestaetigen={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('dialog'));
    expect(onSchliessen).toHaveBeenCalledTimes(1);
  });

  it('klickt man NICHT auf den Backdrop, wenn der Klick auf den Inhalt (z. B. den Titel) trifft', () => {
    const onSchliessen = vi.fn();
    render(
      <ConfirmDialog
        titel="Endkunde sperren"
        beschreibung="Die Verarbeitung wird eingeschränkt (Art. 18)."
        bestaetigenLabel="Sperren"
        abbrechenLabel="Abbrechen"
        offen={true}
        onSchliessen={onSchliessen}
        onBestaetigen={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Endkunde sperren'));
    expect(onSchliessen).not.toHaveBeenCalled();
  });

  it('Type-to-confirm: Bestätigen-Button bleibt disabled, bis der geforderte Text exakt eingetippt wurde', () => {
    const onBestaetigen = vi.fn();
    render(
      <ConfirmDialog
        titel="Endkunde krypto-schreddern"
        beschreibung="Diese Aktion ist unwiderruflich."
        bestaetigenLabel="Endgültig schreddern"
        abbrechenLabel="Abbrechen"
        variant="destructive"
        offen={true}
        onSchliessen={vi.fn()}
        onBestaetigen={onBestaetigen}
        bestaetigungstext="SCHREDDERN"
        bestaetigungstextLabel='Zur Bestätigung "SCHREDDERN" eingeben'
      />,
    );

    const bestaetigenButton = screen.getByRole('button', { name: 'Endgültig schreddern' });
    const eingabeFeld = screen.getByLabelText('Zur Bestätigung "SCHREDDERN" eingeben');

    expect(bestaetigenButton).toBeDisabled();

    fireEvent.change(eingabeFeld, { target: { value: 'schreddern' } });
    expect(bestaetigenButton).toBeDisabled();
    expect(onBestaetigen).not.toHaveBeenCalled();

    fireEvent.change(eingabeFeld, { target: { value: 'SCHREDDERN' } });
    expect(bestaetigenButton).not.toBeDisabled();

    fireEvent.click(bestaetigenButton);
    expect(onBestaetigen).toHaveBeenCalledTimes(1);
  });

  it('setzt die Type-to-confirm-Eingabe bei jedem erneuten Öffnen zurück', () => {
    const { rerender } = render(
      <ConfirmDialog
        titel="Endkunde krypto-schreddern"
        beschreibung="Diese Aktion ist unwiderruflich."
        bestaetigenLabel="Endgültig schreddern"
        abbrechenLabel="Abbrechen"
        variant="destructive"
        offen={true}
        onSchliessen={vi.fn()}
        onBestaetigen={vi.fn()}
        bestaetigungstext="SCHREDDERN"
        bestaetigungstextLabel='Zur Bestätigung "SCHREDDERN" eingeben'
      />,
    );

    fireEvent.change(screen.getByLabelText('Zur Bestätigung "SCHREDDERN" eingeben'), { target: { value: 'SCHREDDERN' } });
    expect(screen.getByRole('button', { name: 'Endgültig schreddern' })).not.toBeDisabled();

    rerender(
      <ConfirmDialog
        titel="Endkunde krypto-schreddern"
        beschreibung="Diese Aktion ist unwiderruflich."
        bestaetigenLabel="Endgültig schreddern"
        abbrechenLabel="Abbrechen"
        variant="destructive"
        offen={false}
        onSchliessen={vi.fn()}
        onBestaetigen={vi.fn()}
        bestaetigungstext="SCHREDDERN"
        bestaetigungstextLabel='Zur Bestätigung "SCHREDDERN" eingeben'
      />,
    );

    rerender(
      <ConfirmDialog
        titel="Endkunde krypto-schreddern"
        beschreibung="Diese Aktion ist unwiderruflich."
        bestaetigenLabel="Endgültig schreddern"
        abbrechenLabel="Abbrechen"
        variant="destructive"
        offen={true}
        onSchliessen={vi.fn()}
        onBestaetigen={vi.fn()}
        bestaetigungstext="SCHREDDERN"
        bestaetigungstextLabel='Zur Bestätigung "SCHREDDERN" eingeben'
      />,
    );

    expect(screen.getByRole('button', { name: 'Endgültig schreddern' })).toBeDisabled();
    expect(screen.getByLabelText('Zur Bestätigung "SCHREDDERN" eingeben')).toHaveValue('');
  });

  it('hat keine erkennbaren axe-Verstöße (offen, mit Type-to-confirm)', async () => {
    const { container } = render(
      <ConfirmDialog
        titel="Endkunde krypto-schreddern"
        beschreibung="Diese Aktion ist unwiderruflich."
        bestaetigenLabel="Endgültig schreddern"
        abbrechenLabel="Abbrechen"
        variant="destructive"
        offen={true}
        onSchliessen={vi.fn()}
        onBestaetigen={vi.fn()}
        bestaetigungstext="SCHREDDERN"
        bestaetigungstextLabel='Zur Bestätigung "SCHREDDERN" eingeben'
      />,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
