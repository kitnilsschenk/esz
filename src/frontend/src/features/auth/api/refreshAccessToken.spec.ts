import { afterEach, describe, expect, it, vi } from 'vitest';
import { refreshAccessTokenSingleFlight } from './refreshAccessToken';

// jsdom (Testumgebung, vitest.config.ts) implementiert die Web Locks API
// NICHT (`navigator.locks` ist `undefined`) — die Tests laufen daher über
// den dokumentierten Fallback-Pfad (In-Memory-Promise-Dedupe ohne
// Web-Locks-Cross-Tab-Serialisierung), was für die hier geprüfte
// Same-Tab-Dedupe-Semantik ausreicht.
const { postMock, setAccessTokenMock, clearAccessTokenMock } = vi.hoisted(() => ({
  postMock: vi.fn(),
  setAccessTokenMock: vi.fn(),
  clearAccessTokenMock: vi.fn(),
}));

vi.mock('@edms/shared', () => ({
  apiClient: { POST: postMock },
  setAccessToken: setAccessTokenMock,
  clearAccessToken: clearAccessTokenMock,
}));

describe('refreshAccessTokenSingleFlight (ADR-0002 Teil B §12, STRIDE-1)', () => {
  afterEach(() => {
    postMock.mockReset();
    setAccessTokenMock.mockReset();
    clearAccessTokenMock.mockReset();
  });

  it('setzt bei Erfolg den Access-Token im Memory-Store und liefert true', async () => {
    postMock.mockResolvedValue({
      data: { accessToken: 'jwt', tokenType: 'Bearer', expiresIn: 300 },
      error: undefined,
    });

    const result = await refreshAccessTokenSingleFlight();

    expect(result).toBe(true);
    expect(setAccessTokenMock).toHaveBeenCalledWith('jwt', 300);
    expect(postMock).toHaveBeenCalledWith('/auth/refresh', { credentials: 'include' });
  });

  it('verwirft den Access-Token bei einem Fehler (401/403) und liefert false', async () => {
    postMock.mockResolvedValue({
      data: undefined,
      error: { type: 'about:blank', title: 'Unauthorized', status: 401 },
    });

    const result = await refreshAccessTokenSingleFlight();

    expect(result).toBe(false);
    expect(clearAccessTokenMock).toHaveBeenCalledTimes(1);
    expect(setAccessTokenMock).not.toHaveBeenCalled();
  });

  it('dedupliziert gleichzeitige Aufrufe im selben Tab auf EINEN Netzwerkaufruf', async () => {
    let resolvePost: (value: unknown) => void = () => {
      throw new Error('resolvePost wurde nicht rechtzeitig zugewiesen');
    };
    postMock.mockReturnValue(
      new Promise((resolve) => {
        resolvePost = resolve;
      }),
    );

    const first = refreshAccessTokenSingleFlight();
    const second = refreshAccessTokenSingleFlight();

    resolvePost({ data: { accessToken: 'jwt', tokenType: 'Bearer', expiresIn: 300 }, error: undefined });

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toBe(true);
    expect(secondResult).toBe(true);
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it('erlaubt nach Abschluss eines Refreshs einen neuen, unabhängigen Folgeaufruf', async () => {
    postMock.mockResolvedValueOnce({
      data: { accessToken: 'jwt-1', tokenType: 'Bearer', expiresIn: 300 },
      error: undefined,
    });
    await refreshAccessTokenSingleFlight();

    postMock.mockResolvedValueOnce({
      data: { accessToken: 'jwt-2', tokenType: 'Bearer', expiresIn: 300 },
      error: undefined,
    });
    await refreshAccessTokenSingleFlight();

    expect(postMock).toHaveBeenCalledTimes(2);
    expect(setAccessTokenMock).toHaveBeenNthCalledWith(2, 'jwt-2', 300);
  });
});
