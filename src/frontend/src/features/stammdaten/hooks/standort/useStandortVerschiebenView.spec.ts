import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StandortStruktur } from '@edms/shared';
import { useStandortVerschiebenView } from './useStandortVerschiebenView';

const { useStandortVerschiebenMock } = vi.hoisted(() => ({ useStandortVerschiebenMock: vi.fn() }));

// Nur `useStandortVerschieben` (die TanStack-Mutation) wird gemockt — die
// übrigen Exporte sind reine, seiteneffektfreie Funktionen und werden hier
// 1:1 nachgebildet (kein `vi.importActual`, konsistent mit dem übrigen
// Test-Stil dieses Repos, der Modul-Mocks immer vollständig selbst angibt).
vi.mock('../../api/standort', () => ({
  WURZEL_SENTINEL: '__wurzel__',
  istWurzelTyp: (typ: string) => typ === 'liegenschaft' || typ === 'gebaeude',
  standortBaumKey: (endkundeId: string) => ['standort', 'baum', endkundeId],
  toStandortVerschiebenPayload: (values: { neuerParentId: string }) => ({
    neuerParentId: values.neuerParentId === '__wurzel__' ? null : values.neuerParentId,
  }),
  useStandortVerschieben: useStandortVerschiebenMock,
}));

const ENDKUNDE_ID = '0198c3aa-aaaa-7000-8000-000000000001';

function knoten(overrides: Partial<StandortStruktur>): StandortStruktur {
  return {
    id: 'std-1',
    endkundeId: ENDKUNDE_ID,
    parentId: null,
    typ: 'liegenschaft',
    pfad: ['std-1'],
    ebene: 0,
    sortierung: 0,
    status: 'aktiv',
    klimareferenz: null,
    hatAdresse: true,
    zaehlerAnzahl: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderWithQueryClient<T>(callback: () => T) {
  const queryClient = new QueryClient();
  return renderHook(callback, {
    wrapper: ({ children }) => createElement(QueryClientProvider, { client: queryClient }, children),
  });
}

describe('useStandortVerschiebenView (ADR-0010 D6 — Reparent-Fehlerpfade)', () => {
  afterEach(() => {
    useStandortVerschiebenMock.mockReset();
  });

  it('übersetzt einen 409-Konflikt (Zyklus/Tiefenlimit/Fremdmandant) in eine verständliche deutsche Meldung — NICHT den rohen Server-Text', () => {
    useStandortVerschiebenMock.mockReturnValue({
      isPending: false,
      error: { status: 409, detail: 'Ziel-Parent ist Nachfahre (oder der Knoten selbst) — Verschieben wuerde einen Zyklus erzeugen (D2.2/D6).' },
      mutate: vi.fn(),
    });
    const wurzel = knoten({});

    const { result } = renderWithQueryClient(() => useStandortVerschiebenView(ENDKUNDE_ID, wurzel, [wurzel], () => wurzel.id, vi.fn()));

    expect(result.current.submitErrorMessage).toBe(
      'Verschieben nicht möglich: Der Ziel-Knoten liegt im eigenen Teilbaum, überschreitet die maximale Tiefe oder gehört zu einem anderen Endkunden.',
    );
    expect(result.current.submitErrorMessage).not.toMatch(/D2\.2|D6/);
  });

  it('übersetzt einen 400 (ungültige Wurzel-Verschiebung) in eine verständliche deutsche Meldung', () => {
    useStandortVerschiebenMock.mockReturnValue({
      isPending: false,
      error: { status: 400, detail: 'Nur liegenschaft/gebaeude duerfen an die Wurzel verschoben werden (D2.4).' },
      mutate: vi.fn(),
    });
    const wurzel = knoten({});

    const { result } = renderWithQueryClient(() => useStandortVerschiebenView(ENDKUNDE_ID, wurzel, [wurzel], () => wurzel.id, vi.fn()));

    expect(result.current.submitErrorMessage).toBe(
      'Verschieben nicht möglich: Nur Liegenschaften/Gebäude dürfen an die Wurzel verschoben werden.',
    );
  });

  it('übersetzt einen 404 (Ziel-Knoten nicht gefunden) in eine verständliche deutsche Meldung', () => {
    useStandortVerschiebenMock.mockReturnValue({ isPending: false, error: { status: 404, detail: 'Ziel-Parent' }, mutate: vi.fn() });
    const wurzel = knoten({});

    const { result } = renderWithQueryClient(() => useStandortVerschiebenView(ENDKUNDE_ID, wurzel, [wurzel], () => wurzel.id, vi.fn()));

    expect(result.current.submitErrorMessage).toBe('Der gewählte Ziel-Knoten wurde nicht gefunden.');
  });

  it('zeigt KEINE Fehlermeldung, solange keine Mutation fehlgeschlagen ist', () => {
    useStandortVerschiebenMock.mockReturnValue({ isPending: false, error: null, mutate: vi.fn() });
    const wurzel = knoten({});

    const { result } = renderWithQueryClient(() => useStandortVerschiebenView(ENDKUNDE_ID, wurzel, [wurzel], () => wurzel.id, vi.fn()));

    expect(result.current.submitErrorMessage).toBeUndefined();
  });

  it('schließt den Knoten selbst UND seine Nachfahren aus der Ziel-Optionsliste aus (Client-seitige Zyklus-Vorfilterung)', () => {
    useStandortVerschiebenMock.mockReturnValue({ isPending: false, error: null, mutate: vi.fn() });
    const wurzel = knoten({ id: 'std-wurzel', typ: 'liegenschaft', pfad: ['std-wurzel'] });
    const kind = knoten({ id: 'std-kind', parentId: 'std-wurzel', typ: 'raum', pfad: ['std-wurzel', 'std-kind'], ebene: 1 });
    const andereWurzel = knoten({ id: 'std-andere', typ: 'gebaeude', pfad: ['std-andere'] });

    const { result } = renderWithQueryClient(() =>
      useStandortVerschiebenView(ENDKUNDE_ID, wurzel, [wurzel, kind, andereWurzel], (id) => id, vi.fn()),
    );

    const werte = result.current.zielOptionen.map((option) => option.value);
    expect(werte).not.toContain('std-wurzel');
    expect(werte).not.toContain('std-kind');
    expect(werte).toContain('std-andere');
  });

  it('bietet „An die Wurzel" NUR an, wenn der Knoten bereits liegenschaft/gebaeude ist (D2.4)', () => {
    useStandortVerschiebenMock.mockReturnValue({ isPending: false, error: null, mutate: vi.fn() });
    const raum = knoten({ id: 'std-raum', typ: 'raum', parentId: 'std-wurzel', pfad: ['std-wurzel', 'std-raum'], ebene: 1 });

    const { result } = renderWithQueryClient(() => useStandortVerschiebenView(ENDKUNDE_ID, raum, [raum], (id) => id, vi.fn()));

    expect(result.current.zielOptionen.some((option) => option.value === '__wurzel__')).toBe(false);
  });
});
