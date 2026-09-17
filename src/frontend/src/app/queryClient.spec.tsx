import type { ReactNode } from 'react';
import { QueryClientProvider, useMutation } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { ApiProblemError } from '@edms/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));

vi.mock('../features/auth/api/refreshAccessToken', () => ({
  refreshAccessTokenSingleFlight: refreshMock,
}));

// NACH dem `vi.mock` importieren — `queryClient.ts` zieht den Refresh beim
// Modulladen herein.
const { queryClient } = await import('./queryClient');

function huelle({ children }: { children: ReactNode }): ReactNode {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function problem(status: number, detail: string): ApiProblemError {
  return new ApiProblemError({ type: 'about:blank', title: 'Fehler', status, detail });
}

afterEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
});

/**
 * Die 401-Behandlung SCHREIBENDER Zugriffe (ADR-0002 Teil B §16).
 *
 * **Warum dieser Test nachgereicht wird.** Der Access-Token lebt 300 Sekunden.
 * Läuft er ab, während jemand ein Formular ausfüllt, soll ein stiller
 * `/auth/refresh` die Sitzung retten und die Mutation genau einmal wiederholen
 * — sonst wären die Eingaben verloren. Gebaut war das; geprüft war es nie.
 *
 * Anlass war ein Betriebsbefund, den diese Tests WIDERLEGT haben: Nach einem
 * „Export erzeugen" mit abgelaufenem Token stand die Oberfläche auf „Ein
 * unerwarteter Fehler ist aufgetreten", obwohl der Export serverseitig angelegt
 * war (HTTP 201, Audit `ok`). Die naheliegende Erklärung — die pro
 * `mutate()`-Aufruf übergebenen Rückrufe (dort hängt die Navigation) würden
 * beim Wiederholen übersprungen — trifft NICHT zu: Sie feuern. Der Weg ist
 * damit als Fehlerursache ausgeschlossen, und diese Datei hält das fest,
 * damit ihn niemand ein zweites Mal verdächtigt.
 */
describe('queryClient — 401-Wiederholung schreibender Zugriffe', () => {
  interface Lauf {
    readonly aufrufe: number;
    readonly onSuccessAufrufe: number;
    readonly istFehler: boolean;
    readonly istErfolg: boolean;
  }

  /** Mutation, die beim ERSTEN Aufruf 401 wirft und danach gelingt. */
  async function laufMitAblaufBeimErstenVersuch(refreshGelingt: boolean): Promise<Lauf> {
    refreshMock.mockResolvedValue(refreshGelingt);
    let aufrufe = 0;
    let onSuccessAufrufe = 0;

    const { result } = renderHook(
      () =>
        useMutation<string, ApiProblemError, string>({
          mutationFn: (wert) => {
            aufrufe += 1;
            if (aufrufe === 1) {
              return Promise.reject(problem(401, 'token_abgelaufen'));
            }
            return Promise.resolve(`ok:${wert}`);
          },
        }),
      { wrapper: huelle },
    );

    result.current.mutate('a', {
      onSuccess: () => {
        onSuccessAufrufe += 1;
      },
    });

    await waitFor(() => {
      expect(aufrufe).toBeGreaterThanOrEqual(refreshGelingt ? 2 : 1);
    });
    // Der Wiederholungslauf ist asynchron; kurz nachlaufen lassen.
    await waitFor(() => {
      expect(refreshMock).toHaveBeenCalled();
    });

    return {
      aufrufe,
      onSuccessAufrufe,
      istFehler: result.current.isError,
      istErfolg: result.current.isSuccess,
    };
  }

  it('wiederholt die Mutation nach gegluecktem Refresh genau einmal', async () => {
    const lauf = await laufMitAblaufBeimErstenVersuch(true);

    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(lauf.aufrufe).toBe(2);
  });

  it('fuehrt den `onSuccess`-Rueckruf des urspruenglichen mutate() aus', async () => {
    // Das ist die Zusage, an der die ganze Konstruktion haengt: An diesen
    // Rueckrufen haengen die Navigationen nach dem Anlegen („Export
    // erzeugen" -> Detailseite). Wuerden sie beim Wiederholen uebersprungen,
    // entstuende der Datensatz, ohne dass die Oberflaeche es zeigt — der
    // Nutzer legte ihn ein zweites Mal an.
    //
    // `mutationCache.onError` ruft `mutation.execute(variables)` auf der
    // KERN-Mutation auf; TanStack benachrichtigt dabei die Observer, und die
    // fuehren ihre pro-Aufruf-Rueckrufe aus. Empirisch geprueft, nicht
    // angenommen.
    const lauf = await laufMitAblaufBeimErstenVersuch(true);

    expect(lauf.aufrufe).toBe(2);
    expect(lauf.onSuccessAufrufe).toBe(1);
  });

  it('wiederholt NICHT, wenn der Refresh scheitert', async () => {
    // Dann ist die Sitzung wirklich zu Ende; `AuthGate` zeigt den Login.
    const lauf = await laufMitAblaufBeimErstenVersuch(false);

    expect(lauf.aufrufe).toBe(1);
    expect(lauf.istFehler).toBe(true);
  });

  it('wiederholt einen NICHT-401-Fehler nicht', async () => {
    refreshMock.mockResolvedValue(true);
    let aufrufe = 0;

    const { result } = renderHook(
      () =>
        useMutation<string, ApiProblemError, string>({
          mutationFn: () => {
            aufrufe += 1;
            return Promise.reject(problem(409, 'konflikt'));
          },
        }),
      { wrapper: huelle },
    );

    result.current.mutate('a');

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(aufrufe).toBe(1);
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
