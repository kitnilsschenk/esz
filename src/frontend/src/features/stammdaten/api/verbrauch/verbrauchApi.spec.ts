import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchVerbrauch } from './verbrauchApi';

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock('@edms/shared', () => ({
  apiClient: { GET: getMock },
  toApiProblemError: (error: unknown) => new Error(JSON.stringify(error)),
}));

const STANDORT_ID = '0198c3aa-aaaa-7000-8000-000000000001';

describe('fetchVerbrauch (read:verbrauch_aggregat)', () => {
  afterEach(() => {
    getMock.mockReset();
  });

  it('ruft die Verbrauchs-Route mit Pfad- und Query-Parametern auf', async () => {
    const antwort = { zeitreihe: [], metadaten: { einbezogeneZaehler: 0, einbezogeneKanaele: 0, ausgelasseneUntermessungen: 0, erkannteLuecken: 0 } };
    getMock.mockResolvedValue({ data: antwort, error: undefined });

    const ergebnis = await fetchVerbrauch(STANDORT_ID, {
      von: '2026-07-01T00:00:00.000Z',
      bis: '2026-07-02T00:00:00.000Z',
      aufloesung: 'tag',
      inklusiveUnterknoten: true,
    });

    expect(getMock).toHaveBeenCalledWith('/messwerte/standorte/{standortId}/verbrauch', {
      params: {
        path: { standortId: STANDORT_ID },
        query: { von: '2026-07-01T00:00:00.000Z', bis: '2026-07-02T00:00:00.000Z', aufloesung: 'tag', inklusiveUnterknoten: true },
      },
    });
    expect(ergebnis).toBe(antwort);
  });

  it('wirft `ApiProblemError` und bricht ab, wenn der Server einen Fehler liefert (z. B. 403 ohne `read:verbrauch_aggregat`)', async () => {
    getMock.mockResolvedValue({ data: undefined, error: { type: 'about:blank', title: 'Forbidden', status: 403 } });

    await expect(
      fetchVerbrauch(STANDORT_ID, { von: '2026-07-01T00:00:00.000Z', bis: '2026-07-02T00:00:00.000Z', aufloesung: 'tag', inklusiveUnterknoten: true }),
    ).rejects.toThrow();
  });
});
