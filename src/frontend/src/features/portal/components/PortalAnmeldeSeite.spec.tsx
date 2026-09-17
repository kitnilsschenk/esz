import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProblemError } from '@edms/shared';
import { runAxe } from '../../../shared/testing/axe';
import { PortalAnmeldeSeite } from './PortalAnmeldeSeite';

const { anmeldungMock, einloesenMock } = vi.hoisted(() => ({
  anmeldungMock: vi.fn(),
  einloesenMock: vi.fn(),
}));

vi.mock('../api', () => ({
  usePortalAnmeldung: anmeldungMock,
  usePortalEinloesen: einloesenMock,
}));

function mutation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { mutate: vi.fn(), isPending: false, error: null, ...overrides };
}

afterEach(() => {
  vi.clearAllMocks();
});

function rendere(anmeldung = mutation(), einloesen = mutation()): HTMLElement {
  anmeldungMock.mockReturnValue(anmeldung);
  einloesenMock.mockReturnValue(einloesen);
  const { container } = render(<PortalAnmeldeSeite />);
  return container;
}

/** `fireEvent` statt `user-event` — letzteres ist keine Abhaengigkeit dieses Repos. */
function tippe(label: string, wert: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value: wert } });
}

describe('PortalAnmeldeSeite', () => {
  it('zeigt beide Wege sichtbar nebeneinander', () => {
    // Die Verwechslung von Zugangscode und Passwort ist der haeufigste Grund,
    // aus dem eine Erstanmeldung scheitert.
    rendere();

    expect(screen.getByRole('tab', { name: 'Ich habe schon ein Passwort' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Ich habe einen Zugangsbrief' })).toBeInTheDocument();
  });

  it('meldet mit Kennung und Passwort an', () => {
    const anmeldung = mutation();
    rendere(anmeldung);

    tippe('Kennung', 'EK-A3K7QP');
    tippe('Passwort', 'geheimespasswort');
    fireEvent.click(screen.getByRole('button', { name: 'Anmelden' }));

    expect(anmeldung['mutate']).toHaveBeenCalledWith({ kennung: 'EK-A3K7QP', passwort: 'geheimespasswort' });
  });

  it('verlangt eine Kennung, bevor es den Server fragt', () => {
    const anmeldung = mutation();
    rendere(anmeldung);

    tippe('Passwort', 'geheimespasswort');
    fireEvent.click(screen.getByRole('button', { name: 'Anmelden' }));

    expect(anmeldung['mutate']).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Bitte geben Sie Ihre Kennung ein.');
  });

  it('erfindet beim Anmelden nichts zur Fehlermeldung des Servers hinzu', () => {
    // Der Server antwortet bewusst einheitlich; jede Auskunft waere eine
    // Auskunft ueber fremde Kennungen.
    rendere(mutation({ error: new ApiProblemError({ type: 'about:blank', title: 'Unauthorized', status: 401 }) }));

    expect(screen.getByRole('alert')).toHaveTextContent('Die Anmeldung war nicht erfolgreich.');
  });

  it('loest einen Zugangscode ein und setzt dabei das Passwort', () => {
    const einloesen = mutation();
    rendere(mutation(), einloesen);

    fireEvent.click(screen.getByRole('tab', { name: 'Ich habe einen Zugangsbrief' }));
    tippe('Zugangscode', 'abcd-efgh-jkmn');
    tippe('Neues Passwort', 'meinlangespasswort');
    tippe('Passwort wiederholen', 'meinlangespasswort');
    fireEvent.click(screen.getByRole('button', { name: 'Zugang einrichten' }));

    expect(einloesen['mutate']).toHaveBeenCalledWith({ code: 'abcd-efgh-jkmn', passwort: 'meinlangespasswort' });
  });

  it('weist zwei verschiedene Passwoerter ab, bevor der Code verbraucht ist', () => {
    // Wer sich beim Setzen vertippt, sperrt sich aus einem Zugang aus, den er
    // nur einmal bekommt.
    const einloesen = mutation();
    rendere(mutation(), einloesen);

    fireEvent.click(screen.getByRole('tab', { name: 'Ich habe einen Zugangsbrief' }));
    tippe('Zugangscode', 'ABCD-EFGH-JKMN');
    tippe('Neues Passwort', 'meinlangespasswort');
    tippe('Passwort wiederholen', 'meinlangespasswortX');
    fireEvent.click(screen.getByRole('button', { name: 'Zugang einrichten' }));

    expect(einloesen['mutate']).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('stimmen nicht überein');
  });

  it('nennt die Mindestlaenge, statt sie den Server melden zu lassen', () => {
    const einloesen = mutation();
    rendere(mutation(), einloesen);

    fireEvent.click(screen.getByRole('tab', { name: 'Ich habe einen Zugangsbrief' }));
    tippe('Zugangscode', 'ABCD-EFGH-JKMN');
    tippe('Neues Passwort', 'kurz');
    tippe('Passwort wiederholen', 'kurz');
    fireEvent.click(screen.getByRole('button', { name: 'Zugang einrichten' }));

    expect(einloesen['mutate']).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('mindestens zwölf Zeichen');
  });

  it('reicht die konkrete Meldung des Servers beim Einloesen durch', () => {
    // Hier IST `detail` eine echte Auskunft — sie gehoert dem Kunden.
    rendere(
      mutation(),
      mutation({
        error: new ApiProblemError({
          type: 'about:blank',
          title: 'Bad Request',
          status: 400,
          detail: 'Das Passwort muss zwischen 12 und 200 Zeichen lang sein.',
        }),
      }),
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Ich habe einen Zugangsbrief' }));

    expect(screen.getByRole('alert')).toHaveTextContent('zwischen 12 und 200 Zeichen');
  });

  it('sagt, dass ein Zugangscode nicht erneut mitgeteilt werden kann', () => {
    rendere();

    expect(screen.getByText(/nur neu ausgestellt werden/)).toBeInTheDocument();
  });

  it('ist barrierefrei', async () => {
    expect(await runAxe(rendere())).toEqual([]);
  });
});
