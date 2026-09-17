import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../shared/testing/axe';
import { PortalZugangAbschnitt } from './PortalZugangAbschnitt';

const { standMock, ausgabeMock, sperreMock } = vi.hoisted(() => ({
  standMock: vi.fn(),
  ausgabeMock: vi.fn(),
  sperreMock: vi.fn(),
}));

vi.mock('../api', () => ({
  usePortalZugangStand: standMock,
  usePortalZugangAusgabe: ausgabeMock,
  usePortalZugangSperre: sperreMock,
}));

const ENDKUNDE_ID = '018f1e2d-0000-7000-8000-0000000000a1';

const AUSGABE = {
  kennung: 'EK-A3K7QP',
  code: 'ABCD-EFGH-JKMN',
  gueltigBis: '2026-10-09T12:00:00.000Z',
  erneut: false,
  brief: '<!DOCTYPE html><html lang="de"><body>Ihr Zugang</body></html>',
  portalUrl: 'https://portal.example.org',
  portalUrlIstStandard: false,
};

function mutation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { mutate: vi.fn(), isPending: false, isError: false, ...overrides };
}

afterEach(() => {
  vi.clearAllMocks();
});

function rendere(
  stand: Record<string, unknown>,
  ausgabe = mutation(),
  sperre = mutation(),
): HTMLElement {
  standMock.mockReturnValue({ isPending: false, isError: false, ...stand });
  ausgabeMock.mockReturnValue(ausgabe);
  sperreMock.mockReturnValue(sperre);
  const { container } = render(
    <>
      <h1>Endkunde</h1>
      <PortalZugangAbschnitt endkundeId={ENDKUNDE_ID} headingId="portal-zugang-heading" />
    </>,
  );
  return container;
}

const OHNE_ZUGANG = {
  data: {
    endkundeId: ENDKUNDE_ID,
    vorhanden: false,
    kennung: null,
    status: null,
    codeOffenBis: null,
    passwortGesetzt: false,
    gesperrtBis: null,
  },
};

const MIT_ZUGANG = {
  data: {
    endkundeId: ENDKUNDE_ID,
    vorhanden: true,
    kennung: 'EK-A3K7QP',
    status: 'aktiv',
    codeOffenBis: null,
    passwortGesetzt: true,
    gesperrtBis: null,
  },
};

describe('PortalZugangAbschnitt (Betriebssicht)', () => {
  it('sagt, wenn noch kein Zugang besteht — und bietet den ersten Code an', () => {
    rendere(OHNE_ZUGANG);

    expect(screen.getByText('Für diesen Endkunden besteht noch kein Portal-Zugang.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zugangscode ausgeben' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zugang sperren' })).not.toBeInTheDocument();
  });

  it('gibt den ERSTEN Code ohne Rueckfrage aus — es geht nichts verloren', () => {
    const ausgabe = mutation();
    rendere(OHNE_ZUGANG, ausgabe);

    fireEvent.click(screen.getByRole('button', { name: 'Zugangscode ausgeben' }));

    expect(ausgabe['mutate']).toHaveBeenCalledTimes(1);
  });

  it('fragt vor einem ERSATZ-Code nach — er macht einen verschickten Brief ungueltig', () => {
    const ausgabe = mutation();
    rendere(MIT_ZUGANG, ausgabe);

    fireEvent.click(screen.getByRole('button', { name: 'Neuen Zugangscode ausgeben' }));
    expect(ausgabe['mutate']).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Neuen Code ausgeben' }));
    expect(ausgabe['mutate']).toHaveBeenCalledTimes(1);
  });

  it('zeigt Kennung und Status eines bestehenden Zugangs', () => {
    rendere(MIT_ZUGANG);

    expect(screen.getByText('EK-A3K7QP')).toBeInTheDocument();
    expect(screen.getByText('Aktiv')).toBeInTheDocument();
  });

  it('zeigt den Code erst NACH der Ausgabe — vorher steht er nirgends', () => {
    rendere(MIT_ZUGANG);

    expect(screen.queryByText('ABCD-EFGH-JKMN')).not.toBeInTheDocument();
  });

  it('zeigt Code und Brief, sobald ausgegeben wurde', () => {
    const ausgabe = mutation({
      mutate: vi.fn((_leer: unknown, optionen: { onSuccess: (a: typeof AUSGABE) => void }) => {
        optionen.onSuccess(AUSGABE);
      }),
    });
    rendere(OHNE_ZUGANG, ausgabe);

    fireEvent.click(screen.getByRole('button', { name: 'Zugangscode ausgeben' }));

    expect(screen.getByText('ABCD-EFGH-JKMN')).toBeInTheDocument();
    expect(screen.getByText(/kann nicht erneut angezeigt werden/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zugangsbrief drucken' })).toBeInTheDocument();
  });

  it('warnt, wenn im Brief die Entwicklungsadresse steht', () => {
    // So gedruckt findet der Kunde das Portal nicht — und der Brief ist weg.
    const ausgabe = mutation({
      mutate: vi.fn((_leer: unknown, optionen: { onSuccess: (a: typeof AUSGABE) => void }) => {
        optionen.onSuccess({ ...AUSGABE, portalUrlIstStandard: true });
      }),
    });
    rendere(OHNE_ZUGANG, ausgabe);

    fireEvent.click(screen.getByRole('button', { name: 'Zugangscode ausgeben' }));

    expect(screen.getByRole('alert')).toHaveTextContent('EDMS_PORTAL_URL ist nicht gesetzt');
  });

  it('fragt vor dem Sperren nach und beendet dabei alle Sitzungen', () => {
    const sperre = mutation();
    rendere(MIT_ZUGANG, mutation(), sperre);

    fireEvent.click(screen.getByRole('button', { name: 'Zugang sperren' }));
    expect(screen.getByText(/alle offenen Sitzungen werden beendet/)).toBeInTheDocument();
    expect(sperre['mutate']).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Ja, sperren' }));
    expect(sperre['mutate']).toHaveBeenCalledTimes(1);
  });

  it('bietet aus einer Sperre KEINEN neuen Code an', () => {
    // Sie ist bewusst kein Zustand, der sich von selbst aufloest.
    rendere({ data: { ...MIT_ZUGANG.data, status: 'gesperrt' } });

    expect(screen.queryByRole('button', { name: /Zugangscode ausgeben/ })).not.toBeInTheDocument();
    expect(screen.getByText('Gesperrt')).toBeInTheDocument();
  });

  it('zeigt den Zustand unmittelbar nach der Ausgabe an, statt die Seite abstuerzen zu lassen', () => {
    // REGRESSION (2026-09-16). Dieser Zustand -- Code ausgegeben, noch nicht
    // eingeloest -- war der EINZIGE, den diese Spezifikation nie geprueft hat:
    // Sie kannte `null`, `aktiv` und `gesperrt`. Ausgerechnet der Zustand, der
    // unmittelbar nach der Hauptaktion dieses Abschnitts eintritt, fehlte.
    //
    // Und genau dort lag der Fehler. Der OpenAPI-Vertrag fuehrte `offen`,
    // geliefert hat das Backend immer `ausgegeben` (CHECK
    // `ck_portal_zugang_status`, V0066). Der Nachschlag in
    // STATUS_SCHLUESSEL ergab `undefined`, `t(undefined)` warf, und die
    // RouteErrorBoundary ersetzte die GESAMTE Endkunden-Detailseite durch
    // „Ein unerwarteter Fehler ist aufgetreten." -- sobald ein Zugangscode
    // ausgegeben war. Damit war der Weg zum digitalen Opt-out ueber die
    // Oberflaeche unbenutzbar.
    //
    // Gefunden hat es erst ein Browser-Test, der den Zugang wirklich ausgab.
    // Ein Mock, der nur die bequemen Zustaende kennt, bestaetigt die Annahme,
    // die er pruefen soll.
    rendere({ data: { ...MIT_ZUGANG.data, status: 'ausgegeben', passwortGesetzt: false } });

    expect(screen.getByText('Code ausgegeben, noch nicht eingelöst')).toBeInTheDocument();
    expect(screen.getByText('EK-A3K7QP')).toBeInTheDocument();
  });

  it('meldet einen Ladefehler', () => {
    rendere({ isError: true, data: undefined });

    expect(screen.getByRole('alert')).toHaveTextContent('Der Stand des Portal-Zugangs konnte nicht geladen werden.');
  });

  it('ist barrierefrei', async () => {
    expect(await runAxe(rendere(MIT_ZUGANG))).toEqual([]);
  });
});
