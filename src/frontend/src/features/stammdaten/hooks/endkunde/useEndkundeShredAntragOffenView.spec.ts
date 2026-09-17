import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEndkundeShredAntragOffenView } from './useEndkundeShredAntragOffenView';

const {
  useEndkundeShredAntragOffenMock,
  useEndkundeShredFreigebenMock,
  useEndkundeShredAblehnenMock,
  useAktuellerSubMock,
} = vi.hoisted(() => ({
  useEndkundeShredAntragOffenMock: vi.fn(),
  useEndkundeShredFreigebenMock: vi.fn(),
  useEndkundeShredAblehnenMock: vi.fn(),
  useAktuellerSubMock: vi.fn(),
}));

vi.mock('../../api/endkunde', () => ({
  useEndkundeShredAntragOffen: useEndkundeShredAntragOffenMock,
  useEndkundeShredFreigeben: useEndkundeShredFreigebenMock,
  useEndkundeShredAblehnen: useEndkundeShredAblehnenMock,
}));
vi.mock('../shared/useAktuellerSub', () => ({ useAktuellerSub: useAktuellerSubMock }));

const ENDKUNDE_ID = '0198c3aa-aaaa-7000-8000-000000000001';
const ANTRAG_ID = '0198c3aa-bbbb-7000-8000-000000000002';

const BASE_ANTRAG = {
  id: ANTRAG_ID,
  endkundeId: ENDKUNDE_ID,
  status: 'beantragt' as const,
  grund: 'aufbewahrung_abgelaufen' as const,
  beantragtVonSub: 'kc-sub-antragsteller',
  beantragtAm: '2026-07-01T10:00:00.000Z',
  gueltigBis: '2026-07-08T10:00:00.000Z',
  createdAt: '2026-07-01T10:00:00.000Z',
  updatedAt: '2026-07-01T10:00:00.000Z',
};

function mockDefaults(overrides: { antrag?: unknown; aktuellerSub?: string | undefined } = {}): void {
  // `'antrag' in overrides` unterscheidet EXPLIZIT übergebenes `null` (kein
  // offener Antrag) von „gar nicht übergeben" (Standard-`BASE_ANTRAG"`) — ein
  // bloßes `overrides.antrag ?? BASE_ANTRAG` würde `null` fälschlich auf den
  // Default zurückfallen lassen (`??` behandelt `null` als nullish).
  const antrag = 'antrag' in overrides ? overrides.antrag : BASE_ANTRAG;
  useEndkundeShredAntragOffenMock.mockReturnValue({ data: antrag, isPending: false, isError: false });
  useAktuellerSubMock.mockReturnValue(overrides.aktuellerSub);
  useEndkundeShredFreigebenMock.mockReturnValue({ isPending: false, error: null, mutate: vi.fn() });
  useEndkundeShredAblehnenMock.mockReturnValue({ isPending: false, error: null, mutate: vi.fn() });
}

describe('useEndkundeShredAntragOffenView', () => {
  afterEach(() => {
    useEndkundeShredAntragOffenMock.mockReset();
    useEndkundeShredFreigebenMock.mockReset();
    useEndkundeShredAblehnenMock.mockReset();
    useAktuellerSubMock.mockReset();
  });

  it('übersetzt den Löschgrund des Antrags in das deutsche Label', () => {
    mockDefaults({ aktuellerSub: 'kc-sub-zweite-person' });

    const { result } = renderHook(() => useEndkundeShredAntragOffenView(ENDKUNDE_ID));

    expect(result.current.grundLabel).toBe('Aufbewahrungsfrist abgelaufen');
    expect(result.current.antragstellerKurz).toBe('kc-sub-a');
  });

  it('erkennt den eigenen Antrag (istEigenerAntrag), wenn der aktuelle sub dem Antragsteller entspricht', () => {
    mockDefaults({ aktuellerSub: BASE_ANTRAG.beantragtVonSub });

    const { result } = renderHook(() => useEndkundeShredAntragOffenView(ENDKUNDE_ID));

    expect(result.current.istEigenerAntrag).toBe(true);
    expect(result.current.selbstFreigabeHinweis).toBe(
      'Sie haben diesen Antrag gestellt; die Freigabe muss durch eine zweite Person erfolgen.',
    );
  });

  it('erkennt KEINEN eigenen Antrag, solange der aktuelle sub noch nicht geladen ist (Fallback: Aktionen bleiben sichtbar)', () => {
    mockDefaults({ aktuellerSub: undefined });

    const { result } = renderHook(() => useEndkundeShredAntragOffenView(ENDKUNDE_ID));

    expect(result.current.istEigenerAntrag).toBe(false);
    expect(result.current.selbstFreigabeHinweis).toBeUndefined();
  });

  it('ruft `freigeben` mit endkundeId/antragId und dem festen Bestätigungswert auf', () => {
    mockDefaults({ aktuellerSub: 'kc-sub-zweite-person' });
    const mutate = vi.fn();
    useEndkundeShredFreigebenMock.mockReturnValue({ isPending: false, error: null, mutate });

    const { result } = renderHook(() => useEndkundeShredAntragOffenView(ENDKUNDE_ID));
    result.current.freigeben();

    expect(mutate).toHaveBeenCalledWith({
      endkundeId: ENDKUNDE_ID,
      antragId: ANTRAG_ID,
      input: { bestaetigung: 'ENDGUELTIG_LOESCHEN' },
    });
  });

  it('ruft `ablehnen` mit endkundeId/antragId und dem gewählten Ablehnungsgrund auf', () => {
    mockDefaults({ aktuellerSub: 'kc-sub-zweite-person' });
    const mutate = vi.fn();
    useEndkundeShredAblehnenMock.mockReturnValue({ isPending: false, error: null, mutate });

    const { result } = renderHook(() => useEndkundeShredAntragOffenView(ENDKUNDE_ID));
    result.current.ablehnen('fehlbedienung');

    expect(mutate).toHaveBeenCalledWith({
      endkundeId: ENDKUNDE_ID,
      antragId: ANTRAG_ID,
      input: { ablehnungsgrund: 'fehlbedienung' },
    });
  });

  it('übersetzt einen 403 `vier_augen_selbstfreigabe_verboten` der Freigeben-Mutation in eine verständliche Meldung', () => {
    mockDefaults({ aktuellerSub: 'kc-sub-zweite-person' });
    useEndkundeShredFreigebenMock.mockReturnValue({
      isPending: false,
      error: { status: 403, detail: 'vier_augen_selbstfreigabe_verboten' },
      mutate: vi.fn(),
    });

    const { result } = renderHook(() => useEndkundeShredAntragOffenView(ENDKUNDE_ID));

    expect(result.current.freigebenErrorMessage).toBe(
      'Sie können Ihren eigenen Antrag nicht freigeben — die Freigabe muss durch eine zweite Person erfolgen.',
    );
  });

  it('übersetzt einen 403 `vier_augen_selbstfreigabe_verboten` der Ablehnen-Mutation in eine verständliche Meldung', () => {
    mockDefaults({ aktuellerSub: 'kc-sub-zweite-person' });
    useEndkundeShredAblehnenMock.mockReturnValue({
      isPending: false,
      error: { status: 403, detail: 'vier_augen_selbstfreigabe_verboten' },
      mutate: vi.fn(),
    });

    const { result } = renderHook(() => useEndkundeShredAntragOffenView(ENDKUNDE_ID));

    expect(result.current.ablehnenErrorMessage).toBe(
      'Sie können Ihren eigenen Antrag nicht ablehnen — die Entscheidung muss durch eine zweite Person erfolgen.',
    );
  });

  it('zeigt einen generischen Fehlertext für andere Fehler (kein Selbst-Freigabe-Verbot)', () => {
    mockDefaults({ aktuellerSub: 'kc-sub-zweite-person' });
    useEndkundeShredFreigebenMock.mockReturnValue({
      isPending: false,
      error: { status: 409, detail: 'shred_antrag_ungueltig' },
      mutate: vi.fn(),
    });

    const { result } = renderHook(() => useEndkundeShredAntragOffenView(ENDKUNDE_ID));

    expect(result.current.freigebenErrorMessage).toBe('shred_antrag_ungueltig');
  });

  it('liefert `antrag === undefined`, wenn kein offener Antrag existiert', () => {
    mockDefaults({ antrag: null, aktuellerSub: 'kc-sub-zweite-person' });

    const { result } = renderHook(() => useEndkundeShredAntragOffenView(ENDKUNDE_ID));

    expect(result.current.antrag).toBeUndefined();
    expect(result.current.grundLabel).toBe('');
  });
});
