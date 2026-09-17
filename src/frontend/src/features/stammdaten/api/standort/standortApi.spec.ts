import { afterEach, describe, expect, it, vi } from 'vitest';
import { postStandortLabelsBatch } from './standortApi';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));

vi.mock('@edms/shared', () => ({
  apiClient: { POST: postMock },
  toApiProblemError: (error: unknown) => new Error(JSON.stringify(error)),
}));
// Deterministischer Idempotenz-Schlüssel — vermeidet verschachtelte
// `expect.any(...)`-Matcher innerhalb eines Objekt-Literals weiter unten
// (triggert sonst `@typescript-eslint/no-unsafe-assignment`, da `expect.any`
// lose typisiert ist).
vi.mock('../shared', () => ({ createIdempotencyKey: () => 'idem-fix-0001' }));

const ENDKUNDE_ID = '0198c3aa-aaaa-7000-8000-000000000001';

describe('postStandortLabelsBatch (ADR-0010 D5 — Batch-Entschlüsselung)', () => {
  afterEach(() => {
    postMock.mockReset();
  });

  it('setzt GENAU EINEN Aufruf für die gesamte Knotenmenge ab — nicht einen je Knoten', async () => {
    postMock.mockResolvedValue({
      data: [
        { id: 'std-a', bezeichnung: 'Gebäude A', anschrift: null },
        { id: 'std-b', bezeichnung: 'Gebäude B', anschrift: null },
        { id: 'std-c', bezeichnung: 'Gebäude C', anschrift: null },
      ],
      error: undefined,
    });

    const ergebnis = await postStandortLabelsBatch(ENDKUNDE_ID, ['std-a', 'std-b', 'std-c']);

    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock).toHaveBeenCalledWith('/stammdaten/endkunden/{endkundeId}/standorte/labels', {
      params: { path: { endkundeId: ENDKUNDE_ID }, header: { 'Idempotency-Key': 'idem-fix-0001' } },
      body: { standortIds: ['std-a', 'std-b', 'std-c'] },
    });
    expect(ergebnis).toHaveLength(3);
  });

  it('setzt KEINEN Netzwerkaufruf ab, wenn keine Ids übergeben werden', async () => {
    const ergebnis = await postStandortLabelsBatch(ENDKUNDE_ID, []);

    expect(ergebnis).toEqual([]);
    expect(postMock).not.toHaveBeenCalled();
  });

  it('chunkt NUR bei Überschreiten der serverseitigen Obergrenze (500) — jeder Chunk bleibt EIN Batch-Aufruf, kein Aufruf je Knoten', async () => {
    const vieleIds = Array.from({ length: 501 }, (_, index) => `std-${String(index)}`);
    postMock.mockImplementation((_path: string, options: { body: { standortIds: string[] } }) =>
      Promise.resolve({
        data: options.body.standortIds.map((id) => ({ id, bezeichnung: `Label ${id}`, anschrift: null })),
        error: undefined,
      }),
    );

    const ergebnis = await postStandortLabelsBatch(ENDKUNDE_ID, vieleIds);

    // 501 Ids bei Obergrenze 500 => zwei Chunks (500 + 1), NICHT 501 Aufrufe.
    expect(postMock).toHaveBeenCalledTimes(2);
    expect(ergebnis).toHaveLength(501);
  });

  it('wirft `ApiProblemError` und bricht ab, wenn der Server einen Fehler liefert', async () => {
    postMock.mockResolvedValue({ data: undefined, error: { type: 'about:blank', title: 'Forbidden', status: 403 } });

    await expect(postStandortLabelsBatch(ENDKUNDE_ID, ['std-a'])).rejects.toThrow();
  });
});
